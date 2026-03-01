import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';

const PAD = 20;
const SECTION = 24;
const RADIUS = 16;
const RADIUS_SM = 12;

export default function UploadSOW() {
  const { courses } = useApp();
  const theme = useTheme();

  const handleSave = () => {
    router.push('/stress-map' as any);
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
        style={({ pressed }) => [styles.saveBtn, { backgroundColor: theme.primary }, pressed && styles.pressed]}
        onPress={handleSave}
      >
        <Text style={styles.saveBtnText}>Save & Generate Stress Map</Text>
        <Feather name="moon" size={20} color="#fff" />
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
