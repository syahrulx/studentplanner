import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import { supabase } from '@/src/lib/supabase';
import { invokeExtractTimetable } from '@/src/lib/invokeExtractTimetable';
import { isMonthlyLimitError } from '@/src/lib/aiLimitError';
import { apiSlotsToTimetableEntries, parseExtractTimetableResponse } from '@/src/lib/timetableExtraction';
import type { TimetableEntry } from '@/src/types';
import { setHasSeenNonUitmTimetableIntro } from '@/src/storage';
import { ensureImageLibraryAccessForPicker } from '@/src/lib/imageLibraryPickerGate';

const MAX_BASE64_CHARS = Math.ceil((8 * 1024 * 1024 * 4) / 3) + 1000;

type PickedFile = { uri: string; name: string; mimeType: string };

export default function TimetableImportScreen() {
  const theme = useTheme();
  const { language, saveTimetableOnly } = useApp();
  const T = useTranslations(language);
  const insets = useSafeAreaInsets();

  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [entriesPreview, setEntriesPreview] = useState<TimetableEntry[] | null>(null);

  const pickPdf = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      setPicked({
        uri: file.uri,
        name: file.name ?? 'timetable.pdf',
        mimeType: file.mimeType ?? 'application/pdf',
      });
      setEntriesPreview(null);
    } catch (e) {
      Alert.alert(T('error'), e instanceof Error ? e.message : 'Could not pick PDF.');
    }
  }, [T]);

  const pickImage = useCallback(async () => {
    try {
      const ok = await ensureImageLibraryAccessForPicker();
      if (!ok) {
        Alert.alert(T('error'), 'Photo access is needed to import a screenshot.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const mime = asset.mimeType ?? 'image/jpeg';
      setPicked({
        uri: asset.uri,
        name: asset.fileName ?? 'timetable.jpg',
        mimeType: mime,
      });
      setEntriesPreview(null);
    } catch (e) {
      Alert.alert(T('error'), e instanceof Error ? e.message : 'Could not pick image.');
    }
  }, [T]);

  const runExtract = useCallback(async () => {
    if (!picked || busy) return;
    const { data: { session: initialSession } } = await supabase.auth.getSession();
    if (!initialSession?.user?.id) {
      Alert.alert(T('signInRequired'), T('timetableImportAuthRequired'));
      return;
    }
    await supabase.auth.refreshSession();
    setBusy(true);
    setEntriesPreview(null);
    try {
      const b64 = await FileSystem.readAsStringAsync(picked.uri, { encoding: 'base64' });
      if (!b64 || b64.length > MAX_BASE64_CHARS) {
        Alert.alert(T('error'), T('timetableImportFileTooLarge'));
        return;
      }
      const { httpStatus, data } = await invokeExtractTimetable({
        file_base64: b64,
        mime_type: picked.mimeType,
      });
      const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      const fnErr = body?.error as { message?: string; code?: string } | undefined;
      if (fnErr?.message) {
        // Monthly token limit alert is already shown by invokeExtractTimetable;
        // skip the generic error alert to avoid stacking dialogs.
        if (isMonthlyLimitError(fnErr)) {
          return;
        }
        Alert.alert(T('error'), `${fnErr.message}${fnErr.code ? ` (${fnErr.code})` : ''}`);
        return;
      }
      if (httpStatus >= 400) {
        Alert.alert(T('error'), `HTTP ${httpStatus}`);
        return;
      }
      const parsed = parseExtractTimetableResponse(data);
      if (parsed.length === 0) {
        Alert.alert(T('error'), T('timetableImportZeroSlots'));
        return;
      }
      setEntriesPreview(apiSlotsToTimetableEntries(parsed));
    } catch (e) {
      Alert.alert(T('error'), e instanceof Error ? e.message : 'Extraction failed.');
    } finally {
      setBusy(false);
    }
  }, [picked, busy, T]);

  const saveTimetable = useCallback(async () => {
    if (!entriesPreview?.length) return;
    setBusy(true);
    try {
      await saveTimetableOnly(entriesPreview);
      await setHasSeenNonUitmTimetableIntro(true);
      router.replace('/(tabs)/timetable' as any);
    } catch {
      Alert.alert(T('error'), T('timetableImportSaveFailed'));
    } finally {
      setBusy(false);
    }
  }, [entriesPreview, saveTimetableOnly, T]);

  const openFullEditor = useCallback(async () => {
    if (!entriesPreview?.length) return;
    setBusy(true);
    try {
      await saveTimetableOnly(entriesPreview);
      await setHasSeenNonUitmTimetableIntro(true);
      router.replace('/timetable-edit' as any);
    } catch {
      Alert.alert(T('error'), T('timetableImportSaveFailed'));
    } finally {
      setBusy(false);
    }
  }, [entriesPreview, saveTimetableOnly, T]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.topRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
        >
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{T('timetableImportTitle')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sub, { color: theme.textSecondary }]}>{T('timetableImportSubtitle')}</Text>

        <View style={styles.pickRow}>
          <Pressable
            style={({ pressed }) => [
              styles.pickBtn,
              { backgroundColor: theme.card, borderColor: theme.border },
              pressed && { opacity: 0.85 },
            ]}
            onPress={pickImage}
            disabled={busy}
          >
            <Feather name="image" size={20} color={theme.primary} />
            <Text style={[styles.pickBtnText, { color: theme.text }]}>{T('timetableImportPickImage')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.pickBtn,
              { backgroundColor: theme.card, borderColor: theme.border },
              pressed && { opacity: 0.85 },
            ]}
            onPress={pickPdf}
            disabled={busy}
          >
            <Feather name="file-text" size={20} color={theme.primary} />
            <Text style={[styles.pickBtnText, { color: theme.text }]}>{T('timetableImportPickPdf')}</Text>
          </Pressable>
        </View>

        {picked ? (
          <Text style={[styles.fileName, { color: theme.textSecondary }]} numberOfLines={2}>
            {picked.name}
          </Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.extractBtn,
            { backgroundColor: theme.primary },
            (!picked || busy) && { opacity: 0.5 },
            pressed && picked && !busy && { opacity: 0.88 },
          ]}
          onPress={() => {
            if (!picked) {
              Alert.alert(T('error'), T('timetableImportNoFile'));
              return;
            }
            void runExtract();
          }}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={theme.textInverse} />
          ) : (
            <>
              <Feather name="zap" size={18} color={theme.textInverse} style={{ marginRight: 8 }} />
              <Text style={[styles.extractBtnText, { color: theme.textInverse }]}>
                {T('timetableImportExtract')}
              </Text>
            </>
          )}
        </Pressable>

        {busy && picked ? (
          <Text style={[styles.hint, { color: theme.textSecondary }]}>{T('timetableImportExtracting')}</Text>
        ) : null}

        {entriesPreview && entriesPreview.length > 0 ? (
          <View style={[styles.previewCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.previewTitle, { color: theme.text }]}>
              {T('timetableImportPreviewTitle')} ({entriesPreview.length})
            </Text>
            {entriesPreview.slice(0, 40).map((e) => (
              <View key={e.id} style={[styles.previewRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.previewDay, { color: theme.primary }]}>{e.day.slice(0, 3)}</Text>
                <View style={styles.previewMid}>
                  <Text style={[styles.previewCode, { color: theme.text }]} numberOfLines={1}>
                    {e.subjectCode}
                  </Text>
                  <Text style={[styles.previewMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                    {e.startTime}–{e.endTime}
                    {e.location && e.location !== '-' ? ` · ${e.location}` : ''}
                  </Text>
                </View>
              </View>
            ))}
            {entriesPreview.length > 40 ? (
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 8 }}>
                +{entriesPreview.length - 40} more
              </Text>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: theme.primary },
                busy && { opacity: 0.5 },
                pressed && !busy && { opacity: 0.88 },
              ]}
              onPress={() => void saveTimetable()}
              disabled={busy}
            >
              <Text style={[styles.saveBtnText, { color: theme.textInverse }]}>{T('timetableImportSave')}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.7 }]}
              onPress={() => void openFullEditor()}
            >
              <Text style={[styles.linkBtnText, { color: theme.primary }]}>{T('timetableImportEditFull')}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', flex: 1, textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  sub: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  pickRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  pickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  pickBtnText: { fontSize: 14, fontWeight: '700' },
  fileName: { fontSize: 13, marginBottom: 16 },
  extractBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 8,
  },
  extractBtnText: { fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 13, textAlign: 'center', marginBottom: 16 },
  previewCard: {
    marginTop: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  previewTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  previewDay: { fontSize: 12, fontWeight: '800', width: 36 },
  previewMid: { flex: 1, minWidth: 0 },
  previewCode: { fontSize: 14, fontWeight: '700' },
  previewMeta: { fontSize: 12, marginTop: 2 },
  saveBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '700' },
  linkBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  linkBtnText: { fontSize: 15, fontWeight: '600' },
});
