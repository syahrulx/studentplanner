import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { fetchUitmAcademicCalendar } from '@/src/lib/uitmAcademicCalendar';
import { isAcademicCalendarRangeComplete } from '@/src/lib/calendarProviders/uitm';
import type { AcademicLevel } from '@/src/types';

type StudyModeChoice = 'Full-time' | 'Part-time' | 'Unknown';

const LEVELS: { key: AcademicLevel; label: string; group: 'A' | 'B' }[] = [
  { key: 'Foundation', label: 'Foundation', group: 'A' },
  { key: 'Diploma', label: 'Diploma', group: 'B' },
  { key: 'Bachelor', label: 'Bachelor', group: 'B' },
  { key: 'Master', label: 'Master', group: 'B' },
  { key: 'PhD', label: 'PhD', group: 'B' },
  { key: 'Other', label: 'Other', group: 'B' },
];

export default function SemesterConfigurationScreen() {
  const theme = useTheme();
  const s = useMemo(() => styles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { user, academicCalendar, updateProfile, updateAcademicCalendar } = useApp();

  const [level, setLevel] = useState<AcademicLevel>(() => user.academicLevel ?? 'Bachelor');
  const [mode, setMode] = useState<StudyModeChoice>(() => {
    const v = (user.studyMode ?? '').toLowerCase();
    if (v.includes('part')) return 'Part-time';
    if (v.includes('separuh')) return 'Part-time';
    if (v.includes('full')) return 'Full-time';
    if (v.includes('sepenuh')) return 'Full-time';
    return 'Unknown';
  });
  const [semester, setSemester] = useState<number>(() => user.currentSemester ?? 1);
  const [busy, setBusy] = useState(false);

  const recommendedGroup = useMemo<'A' | 'B'>(() => {
    const found = LEVELS.find((l) => l.key === level);
    return found?.group ?? 'B';
  }, [level]);

  const save = useCallback(async () => {
    if (busy) return;
    try {
      setBusy(true);

      const studyMode =
        mode === 'Unknown'
          ? ''
          : mode === 'Full-time'
          ? 'Full-time'
          : 'Part-time';

      await updateProfile({
        academicLevel: level,
        studyMode,
        currentSemester: semester,
      });

      // Auto-sync official UiTM calendar only when needed — not on every save if nothing relevant changed.
      const shouldSync =
        user.universityId === 'uitm' ||
        String(academicCalendar?.semesterLabel ?? '').toLowerCase().includes('uitm');

      const oldGroup = user.academicLevel === 'Foundation' ? 'A' : 'B';
      const groupChanged = oldGroup !== recommendedGroup;
      const calComplete = isAcademicCalendarRangeComplete(academicCalendar);
      const hasPeriods = (academicCalendar?.periods?.length ?? 0) > 0;
      const needsHea = !calComplete || !hasPeriods || groupChanged;

      if (shouldSync && needsHea) {
        const today = new Date().toISOString().slice(0, 10);
        const official = await fetchUitmAcademicCalendar(recommendedGroup, { targetDateISO: today });
        if (official?.startDate && official?.endDate) {
          await updateAcademicCalendar({
            semesterLabel: official.semesterLabel,
            startDate: official.startDate,
            endDate: official.endDate,
            totalWeeks: official.totalWeeks ?? (academicCalendar?.totalWeeks ?? 14),
            periods: official.periods,
            isActive: true,
          });
        }
      }

      router.back();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }, [
    academicCalendar,
    busy,
    level,
    mode,
    recommendedGroup,
    semester,
    updateAcademicCalendar,
    updateProfile,
    user.academicLevel,
    user.universityId,
  ]);

  return (
    <ScrollView
      style={[s.container, { paddingTop: Math.max(10, insets.top) }]}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.headerRow}>
        <Pressable style={s.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <Feather name="chevron-left" size={22} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.headerTitle} numberOfLines={1}>Semester configuration</Text>
          <Text style={s.headerSub} numberOfLines={2}>
            Used to auto-select the correct UiTM academic calendar (Group A/B) and show the right teaching weeks.
          </Text>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Program level</Text>
        {LEVELS.map((opt) => (
          <Pressable
            key={opt.key}
            style={[s.row, level === opt.key && { backgroundColor: `${theme.primary}12` }]}
            onPress={() => setLevel(opt.key)}
          >
            <View style={[s.radioOuter, { borderColor: theme.border }]}>
              {level === opt.key && <View style={[s.radioInner, { backgroundColor: theme.primary }]} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{opt.label}</Text>
              <Text style={s.rowSub}>Calendar group: {opt.group === 'A' ? 'A (Foundation/Professional)' : 'B (Diploma/Bachelor/Master/PhD)'}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Study mode</Text>
        {(['Full-time', 'Part-time', 'Unknown'] as StudyModeChoice[]).map((opt) => (
          <Pressable
            key={opt}
            style={[s.row, mode === opt && { backgroundColor: `${theme.primary}12` }]}
            onPress={() => setMode(opt)}
          >
            <View style={[s.radioOuter, { borderColor: theme.border }]}>
              {mode === opt && <View style={[s.radioInner, { backgroundColor: theme.primary }]} />}
            </View>
            <Text style={s.rowTitle}>{opt}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Current semester</Text>
        <View style={s.semesterGrid}>
          {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
            <Pressable
              key={n}
              style={[
                s.semBtn,
                { borderColor: theme.border, backgroundColor: semester === n ? theme.primary : theme.card },
              ]}
              onPress={() => setSemester(n)}
            >
              <Text style={[s.semText, { color: semester === n ? theme.textInverse : theme.text }]}>{n}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable style={[s.saveBtn, busy && { opacity: 0.8 }]} onPress={save} disabled={busy}>
        {busy ? <ActivityIndicator color={theme.textInverse} /> : <Text style={s.saveText}>Save</Text>}
      </Pressable>
    </ScrollView>
  );
}

function styles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    content: { paddingHorizontal: 20, paddingBottom: 32 },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 14 },
    headerBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    headerTitle: { fontSize: 18, fontWeight: '900', color: theme.text, letterSpacing: -0.3, lineHeight: 22 },
    headerSub: { marginTop: 4, fontSize: 12, fontWeight: '700', color: theme.textSecondary, lineHeight: 16 },
    card: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 18,
      paddingVertical: 6,
      marginTop: 14,
      overflow: 'hidden',
    },
    cardTitle: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, fontSize: 13, fontWeight: '900', color: theme.text },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
    rowTitle: { fontSize: 14, fontWeight: '800', color: theme.text },
    rowSub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: theme.textSecondary, lineHeight: 16 },
    radioOuter: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioInner: { width: 12, height: 12, borderRadius: 6 },
    semesterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
    semBtn: { width: 44, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    semText: { fontSize: 14, fontWeight: '900' },
    saveBtn: { marginTop: 16, backgroundColor: theme.primary, paddingVertical: 12, borderRadius: 16, alignItems: 'center' },
    saveText: { color: theme.textInverse, fontSize: 15, fontWeight: '900' },
  });
}

