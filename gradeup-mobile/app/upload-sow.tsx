import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import * as DocumentPicker from 'expo-document-picker';
import { uploadSowFile, SOW_FILES_BUCKET } from '@/src/lib/sowStorage';
import { supabase } from '@/src/lib/supabase';
import { getTodayISO } from '@/src/utils/date';
import { setPendingSowExtraction } from '@/src/lib/sowExtractionStore';

const PAD = 20;
const SECTION = 24;
const RADIUS = 16;
const RADIUS_SM = 12;

export default function UploadSOW() {
  const { courses, user } = useApp();
  const theme = useTheme();
  const [selected, setSelected] = useState<{ name: string; uri: string; mimeType?: string | null } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);

  const knownCourses = useMemo(() => courses.map((c) => ({ id: c.id, name: c.name })), [courses]);

  const pickPdf = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: false,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      setSelected({ name: file.name ?? 'document.pdf', uri: file.uri, mimeType: file.mimeType });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not pick PDF.');
    } finally {
      busyRef.current = false;
    }
  };

  const startImport = async () => {
    if (isBusy || !selected) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      Alert.alert('Sign in required', 'Sign in to import SOW files.');
      return;
    }
    setIsBusy(true);
    try {
      const importId = `sow-${Date.now()}`;
      const { path, error: uploadError } = await uploadSowFile(
        session.user.id,
        importId,
        selected.uri,
        selected.name,
        selected.mimeType ?? undefined
      );
      if (uploadError) {
        Alert.alert('Upload failed', uploadError.message);
        return;
      }

      const payload = {
        import_id: importId,
        storage_path: path,
        bucket: SOW_FILES_BUCKET,
        current_week: user.currentWeek ?? 1,
        today_iso: getTodayISO(),
        known_courses: knownCourses,
      };

      const { data, error } = await supabase.functions.invoke('extract_sow', { body: payload });
      if (error) {
        Alert.alert('AI extraction failed', error.message || 'Could not extract SOW details.');
        return;
      }
      if (data?.error?.message) {
        Alert.alert('AI extraction failed', data.error.message);
        return;
      }

      setPendingSowExtraction({
        importId,
        storagePath: path,
        fileName: selected.name,
        extracted: data,
      });
      router.push('/sow-review' as any);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: '#ffffff' }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]}
        >
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.title, { color: theme.text }]}>Upload SOW Documents</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>AI WILL AUTO-GENERATE WORKLOAD.</Text>
        </View>
      </View>

      {/* How it works */}
      <View style={[styles.howItWorks, { backgroundColor: '#e0f2fe', borderColor: theme.border }]}>
        <View style={[styles.howIconWrap, { backgroundColor: theme.primary + '20' }]}>
          <Feather name="moon" size={22} color={theme.primary} />
        </View>
        <View style={styles.howBody}>
          <Text style={[styles.howTitle, { color: theme.primary }]}>How it works</Text>
          <Text style={[styles.howDesc, { color: theme.text }]}>
            Upload your Scheme of Work (SOW) PDF or image for each subject. Our AI will analyze it and automatically generate your weekly workload map.
          </Text>
        </View>
      </View>

      {/* YOUR SUBJECTS */}
      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>YOUR SUBJECTS</Text>
      <View style={styles.subjectList}>
        {courses.map((course) => (
          <View key={course.id} style={[styles.subjectCard, { borderColor: '#86efac', backgroundColor: '#ffffff' }]}>
            <View style={styles.subjectCardTop}>
              <View style={[styles.codePill, { backgroundColor: theme.primary }]}>
                <Text style={styles.codePillText}>{course.id}</Text>
              </View>
              <View style={styles.subjectCardBody}>
                <Text style={[styles.subjectName, { color: theme.text }]} numberOfLines={2}>{course.name}</Text>
                <Text style={[styles.statusText, { color: theme.textSecondary }]}>Workload data generated successfully</Text>
              </View>
              <View style={styles.doneWrap}>
                <Feather name="check-circle" size={18} color="#22c55e" />
                <Text style={styles.doneText}>DONE</Text>
              </View>
            </View>
            <Pressable style={({ pressed }) => [styles.reuploadLink, pressed && styles.pressed]}>
              <Text style={[styles.reuploadText, { color: theme.primary }]}>Re-upload</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.pickBtn,
          { backgroundColor: theme.card, borderColor: theme.border },
          pressed && styles.pressed,
        ]}
        onPress={pickPdf}
        disabled={isBusy}
      >
        <Feather name="file" size={18} color={theme.primary} />
        <Text style={[styles.pickBtnText, { color: theme.text }]}>
          {selected ? `Selected: ${selected.name}` : 'Choose SOW PDF'}
        </Text>
        <Feather name="chevron-right" size={18} color={theme.textSecondary} style={{ marginLeft: 'auto' }} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.saveBtn,
          { backgroundColor: theme.primary },
          (isBusy || !selected) && { opacity: 0.55 },
          pressed && styles.pressed,
        ]}
        onPress={startImport}
        disabled={isBusy || !selected}
      >
        {isBusy ? (
          <>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.saveBtnText}>Analyzing...</Text>
          </>
        ) : (
          <>
            <Text style={styles.saveBtnText}>Analyze & Review</Text>
            <Feather name="cpu" size={20} color="#fff" />
          </>
        )}
      </Pressable>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: PAD, paddingTop: 56, paddingBottom: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SECTION,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS_SM,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  headerTitleWrap: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, fontWeight: '600', marginTop: 4, letterSpacing: 0.5 },
  howItWorks: {
    flexDirection: 'row',
    borderRadius: RADIUS,
    padding: 18,
    marginBottom: SECTION,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  howIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  howBody: { flex: 1, minWidth: 0 },
  howTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  howDesc: { fontSize: 14, lineHeight: 21 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 14 },
  subjectList: { gap: 12 },
  subjectCard: {
    borderRadius: RADIUS_SM,
    padding: 16,
    borderWidth: 1,
  },
  subjectCardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  codePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 12,
  },
  codePillText: { fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  subjectCardBody: { flex: 1, minWidth: 0 },
  subjectName: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  statusText: { fontSize: 12, fontWeight: '500' },
  doneWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  doneText: { fontSize: 12, fontWeight: '800', color: '#22c55e' },
  reuploadLink: { marginTop: 12, alignSelf: 'flex-start' },
  reuploadText: { fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: RADIUS,
    borderWidth: 1,
    marginTop: SECTION,
  },
  pickBtnText: { fontSize: 14, fontWeight: '700', flex: 1 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: RADIUS,
    marginTop: SECTION,
  },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  pressed: { opacity: 0.96 },
});
