import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, Alert, ActivityIndicator, Dimensions, TextInput } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import { getAcademicProgressFromCalendar, getAcademicProgress } from '@/src/lib/academicUtils';
import { fetchUitmAcademicCalendar } from '@/src/lib/uitmAcademicCalendar';
import type { AcademicLevel } from '@/src/types';

export default function AcademicCalendarScreen() {
  const theme = useTheme();
  const s = useMemo(() => styles(theme), [theme]);
  const { academicCalendar, user, language, updateAcademicCalendar, updateProfile } = useApp();
  const T = useTranslations(language);
  const insets = useSafeAreaInsets();
  const modalMaxH = useMemo(() => {
    const h = Dimensions.get('window').height;
    // leave room for notch + a small bottom gap
    return Math.max(420, h - (insets.top + 120));
  }, [insets.top]);
  const [configOpen, setConfigOpen] = useState(false);
  const [cfgBusy, setCfgBusy] = useState(false);

  const [cfgLevel, setCfgLevel] = useState<AcademicLevel>(() => user.academicLevel ?? 'Bachelor');
  const [cfgMode, setCfgMode] = useState<'Full-time' | 'Part-time' | 'Unknown'>(() => {
    const v = (user.studyMode ?? '').toLowerCase();
    if (v.includes('part') || v.includes('separuh')) return 'Part-time';
    if (v.includes('full') || v.includes('sepenuh')) return 'Full-time';
    return 'Unknown';
  });
  const [cfgSemester, setCfgSemester] = useState<number>(() => user.currentSemester ?? 1);
  const [cfgTermCode, setCfgTermCode] = useState<string>(() => user.heaTermCode ?? '');
  const [lastAppliedTerm, setLastAppliedTerm] = useState<string>('');
  const [manualStartISO, setManualStartISO] = useState<string>(() => (academicCalendar?.startDate ?? '').slice(0, 10));
  const [manualWeeks, setManualWeeks] = useState<string>(() => String(academicCalendar?.totalWeeks ?? 14));

  const progress = useMemo(() => {
    if (academicCalendar?.periods && academicCalendar.periods.length > 0) {
      return getAcademicProgressFromCalendar(academicCalendar, user.startDate);
    }
    return getAcademicProgress(academicCalendar?.startDate ?? user.startDate ?? '', academicCalendar?.totalWeeks ?? 14);
  }, [academicCalendar, user.startDate]);

  const group = useMemo<'A' | 'B' | null>(() => {
    const label = String(academicCalendar?.semesterLabel ?? '');
    if (/group\s*a/i.test(label)) return 'A';
    if (/group\s*b/i.test(label)) return 'B';
    return null;
  }, [academicCalendar?.semesterLabel]);

  const periods = academicCalendar?.periods ?? [];

  const recommendedGroup = useMemo<'A' | 'B'>(() => (cfgLevel === 'Foundation' ? 'A' : 'B'), [cfgLevel]);

  const derivedTerm = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth(); // 0=Jan
    if (m <= 1) return `${y - 1}4`;
    if (m >= 2 && m <= 7) return `${y}2`;
    if (m === 8) return `${y}3`;
    if (m >= 9) return `${y}4`;
    return '';
  }, []);

  const saveConfiguration = useCallback(async () => {
    if (cfgBusy) return;
    try {
      setCfgBusy(true);
      const studyMode =
        cfgMode === 'Unknown' ? '' : cfgMode === 'Full-time' ? 'Full-time' : 'Part-time';

      const today = new Date().toISOString().slice(0, 10);
      // Optional override (must be 5 digits like 20262). Otherwise we rely on auto.
      const rawOverride = cfgTermCode?.trim() ? cfgTermCode.trim() : '';
      const overrideOk = /^\d{5}$/.test(rawOverride);
      const termToSave = overrideOk ? rawOverride : null;
      await updateProfile({
        academicLevel: cfgLevel,
        studyMode,
        currentSemester: cfgSemester,
        heaTermCode: termToSave,
      });

      // Manual override: if user entered a valid YYYY-MM-DD, use it as teaching Week 1 (Sunday).
      const manualISO = (manualStartISO || '').trim().slice(0, 10);
      const manualOk = /^\d{4}-\d{2}-\d{2}$/.test(manualISO);
      const tw = Math.max(1, Math.min(30, Number.parseInt(String(manualWeeks || '').trim(), 10) || 14));
      if (manualOk) {
        const start = new Date(`${manualISO}T00:00:00`);
        if (Number.isNaN(start.getTime())) throw new Error('Invalid manual start date.');
        const end = new Date(start);
        end.setDate(end.getDate() + tw * 7 - 1);
        const endISO = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
        setLastAppliedTerm('manual');
        await updateAcademicCalendar({
          semesterLabel: `Manual calendar (${manualISO})`,
          startDate: manualISO,
          endDate: endISO,
          totalWeeks: tw,
          periods: undefined,
          isActive: true,
        });
      } else {
        const official = await fetchUitmAcademicCalendar(recommendedGroup, {
          targetDateISO: today,
          preferredTermCode: termToSave ?? undefined,
        });
        if (official?.startDate && official?.endDate) {
          setLastAppliedTerm(termToSave ?? derivedTerm);
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
      setConfigOpen(false);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save configuration');
    } finally {
      setCfgBusy(false);
    }
  }, [academicCalendar?.totalWeeks, cfgBusy, cfgLevel, cfgMode, cfgSemester, cfgTermCode, derivedTerm, recommendedGroup, updateAcademicCalendar, updateProfile, manualStartISO, manualWeeks]);

  const openConfig = useCallback(() => {
    setConfigOpen(true);
  }, []);

  return (
    <View style={s.safe}>
      <View style={[s.header, { paddingTop: Math.max(10, insets.top) }]}>
        <Pressable style={s.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <Feather name="chevron-left" size={22} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={1}>
            Academic calendar
          </Text>
          <Text style={s.sub} numberOfLines={1}>
            {group ? `UiTM Group ${group}` : (academicCalendar?.semesterLabel ?? 'Set academic calendar')}
            {`  •  Week ${progress.week} of ${academicCalendar?.totalWeeks ?? 14}`}
          </Text>
        </View>
        <View style={{ width: 40, height: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.cardTitle}>Semester configuration</Text>
              <Text style={s.meta}>
                Level: {user.academicLevel ?? '-'}{'\n'}
                Study mode: {user.studyMode?.trim() ? user.studyMode : '-'}{'\n'}
                Semester: {user.currentSemester ?? '-'}{'\n'}
                Recommended calendar group: {user.academicLevel === 'Foundation' ? 'A' : 'B'}
              </Text>
              <Text style={s.meta}>
                Auto term today: {derivedTerm || '-'}{'\n'}
                Override term: {user.heaTermCode ?? '-'}{'\n'}
                Last applied: {lastAppliedTerm || '-'}
              </Text>
            </View>
            <Pressable style={s.editBtn} onPress={openConfig}>
              <Feather name="sliders" size={16} color={theme.primary} />
              <Text style={s.editBtnText}>Edit</Text>
            </Pressable>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Active calendar</Text>
          <Text style={s.meta}>
            Start: {String(academicCalendar?.startDate ?? '').slice(0, 10) || '-'}{'\n'}
            End: {String(academicCalendar?.endDate ?? '').slice(0, 10) || '-'}{'\n'}
            Total teaching weeks: {academicCalendar?.totalWeeks ?? 14}
          </Text>
        </View>

        <View style={[s.card, { marginTop: 12 }]}>
          <Text style={s.cardTitle}>Periods</Text>
          {periods.length === 0 ? (
            <Text style={s.empty}>
              No detailed periods saved yet. Generate timetable to auto-sync the official HEA calendar.
            </Text>
          ) : (
            periods.map((p, idx) => (
              <View key={`${p.type}-${p.startDate}-${idx}`} style={s.periodRow}>
                <View style={s.periodLeft}>
                  <Text style={s.periodType}>{String(p.type).toUpperCase()}</Text>
                  <Text style={s.periodLabel} numberOfLines={2}>{p.label || '-'}</Text>
                </View>
                <View style={s.periodRight}>
                  <Text style={s.periodDate}>{String(p.startDate).slice(0, 10)}</Text>
                  <Text style={s.periodDate}>{String(p.endDate).slice(0, 10)}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <Pressable style={s.primaryBtn} onPress={() => router.push('/planner')}>
          <Text style={s.primaryText}>Back to planner</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={configOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setConfigOpen(false)}
      >
        <View style={s.menuBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfigOpen(false)} />
          <View style={{ width: '100%', maxWidth: 360, marginTop: insets.top + 10 }}>
            <ScrollView
              style={[s.menuCard, { backgroundColor: theme.card, maxHeight: modalMaxH }]}
              contentContainerStyle={{ paddingBottom: 14 }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <Text style={[s.menuTitle, { color: theme.text }]}>Semester configuration</Text>
              <Text style={[s.menuSub, { color: theme.textSecondary }]}>
                Choose your level/mode/semester so we select the correct HEA calendar segment.
              </Text>

              <View style={s.menuDivider} />

              <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Academic term (auto)</Text>
              <Text style={[s.menuSub, { color: theme.textSecondary }]}>
                We auto-pick the correct HEA term for today. (Optional override: set a code like 20262.)
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8 }}>
                <TextInput
                  value={cfgTermCode}
                  onChangeText={setCfgTermCode}
                  placeholder="Override (e.g. 20262)"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="number-pad"
                  maxLength={5}
                  style={[
                    s.termInput,
                    { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundSecondary },
                  ]}
                />
                <Pressable
                  style={[s.termAutoBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                  onPress={() => setCfgTermCode('')}
                >
                  <Text style={[s.termAutoText, { color: theme.primary }]}>Use auto</Text>
                </Pressable>
              </View>

              <View style={s.menuDivider} />
              <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Manual calendar (fallback)</Text>
              <Text style={[s.menuSub, { color: theme.textSecondary }]}>
                If HEA sync is wrong, set the Sunday that starts Week 1 (e.g. 2026-03-29). Leave blank to use HEA.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8 }}>
                <TextInput
                  value={manualStartISO}
                  onChangeText={setManualStartISO}
                  placeholder="Week 1 start (YYYY-MM-DD)"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                  maxLength={10}
                  style={[
                    s.termInput,
                    { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundSecondary },
                  ]}
                />
                <TextInput
                  value={manualWeeks}
                  onChangeText={setManualWeeks}
                  placeholder="Weeks"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={[
                    s.weeksInput,
                    { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundSecondary },
                  ]}
                />
              </View>

              <View style={s.menuDivider} />
              <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Program level</Text>
              {(['Foundation', 'Diploma', 'Bachelor', 'Master', 'PhD', 'Other'] as AcademicLevel[]).map((lvl) => (
                <Pressable key={lvl} style={s.menuItem} onPress={() => setCfgLevel(lvl)}>
                  <Feather name="check-circle" size={18} color={cfgLevel === lvl ? theme.primary : theme.textSecondary} />
                  <Text style={[s.menuItemText, { color: theme.text }]}>{lvl}</Text>
                  <Text style={[s.badge, { color: theme.textSecondary }]}>
                    {lvl === 'Foundation' ? 'Group A' : 'Group B'}
                  </Text>
                </Pressable>
              ))}

              <View style={s.menuDivider} />
              <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Study mode</Text>
              {(['Full-time', 'Part-time', 'Unknown'] as const).map((m) => (
                <Pressable key={m} style={s.menuItem} onPress={() => setCfgMode(m)}>
                  <Feather name="check-circle" size={18} color={cfgMode === m ? theme.primary : theme.textSecondary} />
                  <Text style={[s.menuItemText, { color: theme.text }]}>{m}</Text>
                </Pressable>
              ))}

              <View style={s.menuDivider} />
              <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Current semester</Text>
              <View style={s.semesterGrid}>
                {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
                  <Pressable
                    key={n}
                    style={[
                      s.semBtn,
                      { borderColor: theme.border, backgroundColor: cfgSemester === n ? theme.primary : theme.card },
                    ]}
                    onPress={() => setCfgSemester(n)}
                  >
                    <Text style={[s.semText, { color: cfgSemester === n ? theme.textInverse : theme.text }]}>{n}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable style={[s.primaryBtn, { marginTop: 10 }, cfgBusy && { opacity: 0.85 }]} onPress={saveConfiguration} disabled={cfgBusy}>
                {cfgBusy ? <ActivityIndicator color={theme.textInverse} /> : <Text style={s.primaryText}>Save</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function styles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 18, fontWeight: '900', color: theme.text, letterSpacing: -0.3, lineHeight: 22 },
    sub: { marginTop: 4, fontSize: 12, fontWeight: '700', color: theme.textSecondary, lineHeight: 16 },
    card: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 14,
    },
    cardTitle: { fontSize: 13, fontWeight: '900', color: theme.text, marginBottom: 8 },
    meta: { fontSize: 13, lineHeight: 18, color: theme.textSecondary, fontWeight: '600' },
    empty: { fontSize: 13, lineHeight: 18, color: theme.textSecondary, fontWeight: '600' },
    periodRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 10,
      borderTopWidth: 1,
      borderColor: theme.border,
      gap: 12,
    },
    periodLeft: { flex: 1, minWidth: 0 },
    periodRight: { width: 112, alignItems: 'flex-end' },
    periodType: { fontSize: 11, fontWeight: '900', color: theme.primary, letterSpacing: 0.6 },
    periodLabel: { marginTop: 2, fontSize: 13, fontWeight: '700', color: theme.text },
    periodDate: { fontSize: 12, fontWeight: '700', color: theme.textSecondary },
    primaryBtn: {
      marginTop: 14,
      backgroundColor: theme.primary,
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: 'center',
    },
    primaryText: { color: theme.textInverse, fontSize: 14, fontWeight: '900' },
    editBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.backgroundSecondary,
    },
    editBtnText: { fontSize: 13, fontWeight: '900', color: theme.primary },

    menuBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      padding: 20,
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
    },
    menuCard: {
      width: '100%',
      maxWidth: 360,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    menuTitle: { fontSize: 15, fontWeight: '900' },
    menuSub: { fontSize: 12, marginTop: 6, fontWeight: '600', lineHeight: 16 },
    menuDivider: { height: 1, backgroundColor: theme.border, marginVertical: 12, opacity: 0.8 },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 12,
    },
    menuItemText: { flex: 1, fontSize: 14, fontWeight: '800' },
    fieldLabel: { fontSize: 12, fontWeight: '900', marginBottom: 6, letterSpacing: 0.4 },
    badge: { fontSize: 12, fontWeight: '800' },
    termChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
    termChipText: { fontSize: 12, fontWeight: '900' },
    termInput: {
      flex: 1,
      height: 42,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      fontSize: 14,
      fontWeight: '800',
    },
    termAutoBtn: {
      height: 42,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    termAutoText: { fontSize: 12, fontWeight: '900' },
    weeksInput: {
      width: 88,
      height: 42,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      fontSize: 14,
      fontWeight: '800',
      textAlign: 'center',
    },
    semesterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 6 },
    semBtn: { width: 42, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    semText: { fontSize: 13, fontWeight: '900' },
  });
}

