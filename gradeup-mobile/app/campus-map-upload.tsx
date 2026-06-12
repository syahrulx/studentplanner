import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import { supabase } from '@/src/lib/supabase';
import { ensureImageLibraryAccessForPicker } from '@/src/lib/imageLibraryPickerGate';
import * as roomsApi from '@/src/lib/campusRoomsApi';
import type { ExtractedRoom } from '@/src/lib/campusRoomsApi';

const MAX_BASE64_CHARS = Math.ceil((8 * 1024 * 1024 * 4) / 3) + 1000;

type PickedFile = { uri: string; name: string; mimeType: string };
type EditableRoom = ExtractedRoom & { _key: string };

let keyCounter = 0;
const nextKey = () => `r${keyCounter++}`;

export default function CampusMapUploadScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, language } = useApp();
  const T = useTranslations(language);
  const params = useLocalSearchParams<{ prefillCode?: string }>();

  const userCampus: string | null = ((user as any)?.campus ?? '').trim() || null;

  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<EditableRoom[] | null>(
    typeof params.prefillCode === 'string' && params.prefillCode.trim()
      ? [{ _key: nextKey(), room_code: params.prefillCode.trim(), room_label: '', building: '', level: '', description: '' }]
      : null,
  );

  const pickPdf = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      setPicked({ uri: file.uri, name: file.name ?? 'directory.pdf', mimeType: file.mimeType ?? 'application/pdf' });
    } catch (e) {
      Alert.alert(T('error'), e instanceof Error ? e.message : 'Could not pick PDF.');
    }
  }, [T]);

  const pickImage = useCallback(async () => {
    try {
      const ok = await ensureImageLibraryAccessForPicker();
      if (!ok) {
        Alert.alert(T('error'), T('campusMapPhotoAccess'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (result.canceled) return;
      const asset = result.assets[0];
      setPicked({ uri: asset.uri, name: asset.fileName ?? 'directory.jpg', mimeType: asset.mimeType ?? 'image/jpeg' });
    } catch (e) {
      Alert.alert(T('error'), e instanceof Error ? e.message : 'Could not pick image.');
    }
  }, [T]);

  const runExtract = useCallback(async () => {
    if (!picked || busy) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      Alert.alert(T('signInRequired'), T('campusMapAuthRequired'));
      return;
    }
    await supabase.auth.refreshSession();
    setBusy(true);
    try {
      const b64 = await FileSystem.readAsStringAsync(picked.uri, { encoding: 'base64' });
      if (!b64 || b64.length > MAX_BASE64_CHARS) {
        Alert.alert(T('error'), T('campusMapFileTooLarge'));
        return;
      }
      const { rooms, error } = await roomsApi.extractRoomsFromFile({
        file_base64: b64,
        mime_type: picked.mimeType,
      });
      if (error) {
        // Monthly-limit alert is surfaced inside the API helper.
        if (error.code !== 'MONTHLY_TOKEN_LIMIT') {
          Alert.alert(T('error'), `${error.message}${error.code ? ` (${error.code})` : ''}`);
        }
        return;
      }
      if (rooms.length === 0) {
        Alert.alert(T('error'), T('campusMapZeroRooms'));
        return;
      }
      setRows(rooms.map((r) => ({ ...r, _key: nextKey() })));
    } catch (e) {
      Alert.alert(T('error'), e instanceof Error ? e.message : 'Extraction failed.');
    } finally {
      setBusy(false);
    }
  }, [picked, busy, T]);

  const updateRow = (key: string, field: keyof ExtractedRoom, value: string) => {
    setRows((prev) => prev?.map((r) => (r._key === key ? { ...r, [field]: value } : r)) ?? null);
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev?.filter((r) => r._key !== key) ?? null);
  };

  const addBlankRow = () => {
    setRows((prev) => [...(prev ?? []), { _key: nextKey(), room_code: '', room_label: '', building: '', level: '', description: '' }]);
  };

  const saveRooms = useCallback(async () => {
    if (!rows || busy) return;
    const valid = rows.filter((r) => r.room_code.trim().length > 0);
    if (valid.length === 0) {
      Alert.alert(T('error'), T('campusMapNeedCode'));
      return;
    }
    setBusy(true);
    try {
      let sourceUrl: string | null = null;
      const isPdf = picked?.mimeType === 'application/pdf';
      if (picked) {
        sourceUrl = await roomsApi.uploadDirectoryFile(picked.uri, isPdf);
      }
      const source = picked ? (isPdf ? 'pdf' : 'photo') : 'photo';
      const saved = await roomsApi.saveExtractedRooms(
        valid.map(({ _key, ...r }) => r),
        source,
        sourceUrl,
      );
      Alert.alert(T('campusMapSavedTitle'), T('campusMapSavedBody').replace('{n}', String(saved)), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert(T('error'), e?.message || T('campusMapSaveFailed'));
    } finally {
      setBusy(false);
    }
  }, [rows, busy, picked, T]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { borderColor: theme.border }]}>
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{T('campusMapUploadTitle')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sub, { color: theme.textSecondary }]}>{T('campusMapUploadSubtitle')}</Text>

        {userCampus ? (
          <View style={[styles.campusRow, { backgroundColor: theme.primary + '12' }]}>
            <Feather name="map-pin" size={13} color={theme.primary} />
            <Text style={[styles.campusText, { color: theme.primary }]}>
              {T('confessionPostingAs')} <Text style={{ fontWeight: '800' }}>{userCampus}</Text>
            </Text>
          </View>
        ) : null}

        <View style={styles.pickRow}>
          <Pressable
            style={[styles.pickBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={pickImage}
            disabled={busy}
          >
            <Feather name="image" size={20} color={theme.primary} />
            <Text style={[styles.pickBtnText, { color: theme.text }]}>{T('campusMapPickPhoto')}</Text>
          </Pressable>
          <Pressable
            style={[styles.pickBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={pickPdf}
            disabled={busy}
          >
            <Feather name="file-text" size={20} color={theme.primary} />
            <Text style={[styles.pickBtnText, { color: theme.text }]}>{T('campusMapPickPdf')}</Text>
          </Pressable>
        </View>

        {picked ? (
          <Text style={[styles.fileName, { color: theme.textSecondary }]} numberOfLines={2}>{picked.name}</Text>
        ) : null}

        <Pressable
          style={[styles.extractBtn, { backgroundColor: theme.primary }, (!picked || busy) && { opacity: 0.5 }]}
          onPress={() => {
            if (!picked) {
              Alert.alert(T('error'), T('campusMapNoFile'));
              return;
            }
            void runExtract();
          }}
          disabled={busy}
        >
          {busy && picked ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="zap" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.extractBtnText}>{T('campusMapExtract')}</Text>
            </>
          )}
        </Pressable>

        {busy && picked ? (
          <Text style={[styles.hint, { color: theme.textSecondary }]}>{T('campusMapExtracting')}</Text>
        ) : null}

        {/* Manual-add shortcut when no file picked */}
        {!rows && !picked ? (
          <Pressable style={styles.manualLink} onPress={addBlankRow}>
            <Feather name="plus-circle" size={16} color={theme.primary} />
            <Text style={[styles.manualLinkText, { color: theme.primary }]}>{T('campusMapAddManual')}</Text>
          </Pressable>
        ) : null}

        {/* Editable review list */}
        {rows ? (
          <View style={{ marginTop: 20 }}>
            <Text style={[styles.reviewTitle, { color: theme.text }]}>
              {T('campusMapReviewTitle')} ({rows.length})
            </Text>
            <Text style={[styles.reviewHint, { color: theme.textSecondary }]}>{T('campusMapReviewHint')}</Text>

            {rows.map((r) => (
              <View key={r._key} style={[styles.roomCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.roomCardTop}>
                  <TextInput
                    style={[styles.codeInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                    placeholder={T('campusMapFieldCode')}
                    placeholderTextColor={theme.textSecondary}
                    value={r.room_code}
                    onChangeText={(v) => updateRow(r._key, 'room_code', v)}
                    autoCapitalize="characters"
                  />
                  <Pressable onPress={() => removeRow(r._key)} hitSlop={10} style={styles.removeBtn}>
                    <Feather name="trash-2" size={18} color="#ef4444" />
                  </Pressable>
                </View>
                <TextInput
                  style={[styles.fieldInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                  placeholder={T('campusMapFieldLabel')}
                  placeholderTextColor={theme.textSecondary}
                  value={r.room_label}
                  onChangeText={(v) => updateRow(r._key, 'room_label', v)}
                />
                <View style={styles.fieldRow}>
                  <TextInput
                    style={[styles.fieldInput, styles.fieldHalf, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                    placeholder={T('campusMapFieldBuilding')}
                    placeholderTextColor={theme.textSecondary}
                    value={r.building}
                    onChangeText={(v) => updateRow(r._key, 'building', v)}
                  />
                  <TextInput
                    style={[styles.fieldInput, styles.fieldHalf, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                    placeholder={T('campusMapFieldLevel')}
                    placeholderTextColor={theme.textSecondary}
                    value={r.level}
                    onChangeText={(v) => updateRow(r._key, 'level', v)}
                  />
                </View>
                <TextInput
                  style={[styles.fieldInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background, minHeight: 44 }]}
                  placeholder={T('campusMapFieldDescription')}
                  placeholderTextColor={theme.textSecondary}
                  value={r.description}
                  onChangeText={(v) => updateRow(r._key, 'description', v)}
                  multiline
                />
              </View>
            ))}

            <Pressable style={styles.manualLink} onPress={addBlankRow}>
              <Feather name="plus-circle" size={16} color={theme.primary} />
              <Text style={[styles.manualLinkText, { color: theme.primary }]}>{T('campusMapAddRow')}</Text>
            </Pressable>

            <Pressable
              style={[styles.saveBtn, { backgroundColor: theme.primary }, busy && { opacity: 0.5 }]}
              onPress={() => void saveRooms()}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{T('campusMapSave')}</Text>}
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', flex: 1, textAlign: 'center' },
  sub: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
  campusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, marginBottom: 16 },
  campusText: { fontSize: 12, flex: 1 },
  pickRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  pickBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  pickBtnText: { fontSize: 14, fontWeight: '700' },
  fileName: { fontSize: 13, marginBottom: 16 },
  extractBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 14, marginBottom: 8 },
  extractBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  hint: { fontSize: 13, textAlign: 'center', marginBottom: 16 },
  manualLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  manualLinkText: { fontSize: 15, fontWeight: '700' },
  reviewTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  reviewHint: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  roomCard: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 12, gap: 8 },
  roomCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontWeight: '700' },
  removeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  fieldRow: { flexDirection: 'row', gap: 8 },
  fieldInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  fieldHalf: { flex: 1 },
  saveBtn: { marginTop: 8, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
