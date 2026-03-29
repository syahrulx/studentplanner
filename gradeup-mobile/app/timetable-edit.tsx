import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import { TIMETABLE_SLOT_COLOR_OPTIONS, getSlotColorForSubjectCode } from '@/src/lib/timetableSlotColors';
import {
  findOverlappingTimetableEntry,
  normalizeTimeDisplay,
  parseTimeToMinutes,
  TIMETABLE_DAY_ORDER,
} from '@/src/lib/timetableValidation';
import type { TimetableEntry, DayOfWeek } from '@/src/types';
import type { WeekStartsOn } from '@/src/storage';

const DAY_PICKER_KEYS: Record<DayOfWeek, string> = {
  Monday: 'monday',
  Tuesday: 'tuesday',
  Wednesday: 'wednesday',
  Thursday: 'thursday',
  Friday: 'friday',
  Saturday: 'saturday',
  Sunday: 'sunday',
};

const DAYS_MON_FIRST: DayOfWeek[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];
const DAYS_SUN_FIRST: DayOfWeek[] = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

function dayOrder(weekStartsOn: WeekStartsOn): DayOfWeek[] {
  return weekStartsOn === 'sunday' ? DAYS_SUN_FIRST : DAYS_MON_FIRST;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function conflictMessage(
  T: (key: string) => string,
  other: TimetableEntry,
): string {
  return T('timetableScheduleConflictDetail')
    .replace('{code}', other.subjectCode)
    .replace('{start}', other.startTime)
    .replace('{end}', other.endTime);
}

export default function TimetableEditScreen() {
  const { language, timetable, weekStartsOn, updateTimetableEntry } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const [editing, setEditing] = useState<TimetableEntry | null>(null);
  const [day, setDay] = useState<DayOfWeek>('Monday');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [group, setGroup] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [lecturer, setLecturer] = useState('');
  const [location, setLocation] = useState('');
  const [slotColor, setSlotColor] = useState<string | undefined>(undefined);

  const sorted = useMemo(() => {
    const order = dayOrder(weekStartsOn);
    const rank = (d: DayOfWeek) => order.indexOf(d);
    return [...timetable].sort((a, b) => {
      const dr = rank(a.day) - rank(b.day);
      if (dr !== 0) return dr;
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });
  }, [timetable, weekStartsOn]);

  const openEdit = useCallback((e: TimetableEntry) => {
    setEditing(e);
    setDay(e.day);
    setStartTime(e.startTime);
    setEndTime(e.endTime);
    setSubjectCode(e.subjectCode);
    setSubjectName(e.subjectName);
    setGroup(e.group ?? '');
    setDisplayName(e.displayName ?? '');
    setLecturer(e.lecturer === '-' ? '' : e.lecturer);
    setLocation(e.location === '-' ? '' : e.location);
    setSlotColor(e.slotColor);
  }, []);

  const closeEdit = useCallback(() => setEditing(null), []);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const code = subjectCode.trim();
    if (!code) {
      Alert.alert(T('error'), T('timetableCodeRequired'));
      return;
    }
    const ns = normalizeTimeDisplay(startTime);
    const ne = normalizeTimeDisplay(endTime);
    if (ns === null || ne === null) {
      Alert.alert(T('error'), T('timetableInvalidTime'));
      return;
    }
    const sm = parseTimeToMinutes(ns);
    const em = parseTimeToMinutes(ne);
    if (sm !== null && em !== null && em <= sm) {
      Alert.alert(T('error'), T('timetableEndBeforeStart'));
      return;
    }
    const overlap = findOverlappingTimetableEntry(timetable, {
      id: editing.id,
      day,
      startTime: ns,
      endTime: ne,
    });
    if (overlap) {
      Alert.alert(T('timetableScheduleConflict'), conflictMessage(T, overlap));
      return;
    }
    const name = subjectName.trim();
    await updateTimetableEntry(editing.id, {
      day,
      startTime: ns,
      endTime: ne,
      subjectCode: code,
      subjectName: name || code,
      group: group.trim(),
      displayName: displayName.trim(),
      lecturer: lecturer.trim() || '-',
      location: location.trim() || '-',
      slotColor: slotColor?.trim() || '',
    });
    closeEdit();
  }, [
    editing,
    day,
    startTime,
    endTime,
    subjectCode,
    subjectName,
    group,
    displayName,
    lecturer,
    location,
    slotColor,
    timetable,
    T,
    updateTimetableEntry,
    closeEdit,
  ]);

  if (timetable.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.background }]}>
        <Pressable style={styles.backRow} onPress={() => router.back()}>
          <Feather name="chevron-left" size={22} color={theme.primary} />
          <Text style={{ color: theme.primary, fontWeight: '600' }}>Back</Text>
        </Pressable>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{T('connectUniversityPrompt')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { borderColor: theme.border, backgroundColor: theme.card }, pressed && { opacity: 0.9 }]}
        >
          <Feather name="chevron-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{T('timetableEditClasses')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {sorted.map((e) => {
          const color = e.slotColor?.trim() || getSlotColorForSubjectCode(e.subjectCode);
          const title = (e.displayName && e.displayName.trim()) || e.subjectName;
          return (
            <Pressable
              key={e.id}
              onPress={() => openEdit(e)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: theme.card, borderColor: theme.border },
                pressed && { opacity: 0.92 },
              ]}
            >
              <View style={[styles.colorBar, { backgroundColor: color }]} />
              <View style={styles.rowBody}>
                <Text style={[styles.rowCode, { color }]} numberOfLines={1}>{e.subjectCode}</Text>
                <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={2}>{title}</Text>
                <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
                  {e.day} · {e.startTime}–{e.endTime}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={theme.textSecondary} />
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal visible={editing != null} animationType="slide" transparent onRequestClose={closeEdit}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeEdit} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKb}
          >
            <View style={[styles.sheet, { backgroundColor: theme.card }]}>
              <View style={styles.sheetHandle} />
              <Text style={[styles.sheetTitle, { color: theme.text }]}>{T('timetableEditTitle')}</Text>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.sheetScroll}
              >
                <Text style={[styles.label, { color: theme.textSecondary }]}>{T('timetableDay')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
                  {TIMETABLE_DAY_ORDER.map((d) => {
                    const active = day === d;
                    return (
                      <Pressable
                        key={d}
                        onPress={() => setDay(d)}
                        style={[
                          styles.dayChip,
                          { borderColor: theme.border, backgroundColor: active ? theme.primary : theme.background },
                        ]}
                      >
                        <Text style={[styles.dayChipText, { color: active ? '#fff' : theme.text }]}>
                          {(T as (k: string) => string)(DAY_PICKER_KEYS[d])}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={[styles.label, { color: theme.textSecondary, marginTop: 12 }]}>{T('timetableStartTime')}</Text>
                <Text style={[styles.hint, { color: theme.textSecondary }]}>{T('timetableTimeHint')}</Text>
                <TextInput
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="08:00"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />

                <Text style={[styles.label, { color: theme.textSecondary, marginTop: 10 }]}>{T('timetableEndTime')}</Text>
                <TextInput
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="10:00"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />

                <Text style={[styles.label, { color: theme.textSecondary, marginTop: 12 }]}>{T('timetableSubjectCode')}</Text>
                <TextInput
                  value={subjectCode}
                  onChangeText={setSubjectCode}
                  placeholder="CSC123"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="characters"
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />

                <Text style={[styles.label, { color: theme.textSecondary, marginTop: 10 }]}>{T('timetableOfficialTitle')}</Text>
                <TextInput
                  value={subjectName}
                  onChangeText={setSubjectName}
                  placeholder=""
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />

                <Text style={[styles.label, { color: theme.textSecondary, marginTop: 10 }]}>{T('timetableGroup')}</Text>
                <TextInput
                  value={group}
                  onChangeText={setGroup}
                  placeholder="—"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />

                <Text style={[styles.label, { color: theme.textSecondary, marginTop: 12 }]}>{T('timetableDisplayName')}</Text>
                <Text style={[styles.hint, { color: theme.textSecondary }]}>{T('timetableDisplayNameHint')}</Text>
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder={subjectName || subjectCode}
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />

                <Text style={[styles.label, { color: theme.textSecondary, marginTop: 14 }]}>{T('timetableSlotColour')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
                  <Pressable
                    onPress={() => setSlotColor(undefined)}
                    style={[
                      styles.colorChip,
                      { borderColor: theme.border },
                      slotColor == null || slotColor === '' ? [styles.colorChipOn, { borderColor: theme.primary }] : null,
                    ]}
                  >
                    <Text style={{ fontSize: 11, color: theme.textSecondary }}>Auto</Text>
                  </Pressable>
                  {TIMETABLE_SLOT_COLOR_OPTIONS.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setSlotColor(c)}
                      style={[
                        styles.colorDot,
                        { backgroundColor: c },
                        slotColor === c ? styles.colorDotOn : null,
                      ]}
                    />
                  ))}
                </ScrollView>

                <Text style={[styles.label, { color: theme.textSecondary, marginTop: 14 }]}>{T('timetableLecturer')}</Text>
                <TextInput
                  value={lecturer}
                  onChangeText={setLecturer}
                  placeholder="—"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />

                <Text style={[styles.label, { color: theme.textSecondary, marginTop: 10 }]}>{T('timetableRoom')}</Text>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="—"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />

                <View style={styles.sheetActions}>
                  <Pressable
                    onPress={closeEdit}
                    style={[styles.btnSecondary, { borderColor: theme.border }]}
                  >
                    <Text style={{ color: theme.text, fontWeight: '700' }}>{T('cancel')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={saveEdit}
                    style={[styles.btnPrimary, { backgroundColor: theme.primary }]}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{T('save')}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 56 },
  empty: { flex: 1, paddingTop: 56, paddingHorizontal: 20 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 24 },
  emptyText: { fontSize: 15, lineHeight: 22 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16, gap: 12 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    paddingRight: 12,
  },
  colorBar: { width: 4, alignSelf: 'stretch', minHeight: 72 },
  rowBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 12 },
  rowCode: { fontSize: 13, fontWeight: '800' },
  rowTitle: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  rowMeta: { fontSize: 12, marginTop: 4 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalKb: { justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  sheetScroll: { paddingHorizontal: 20, paddingBottom: 8 },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', paddingHorizontal: 20, marginBottom: 4 },
  dayRow: { flexDirection: 'row', gap: 8, paddingVertical: 6, flexWrap: 'nowrap' },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  dayChipText: { fontSize: 12, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  hint: { fontSize: 11, marginBottom: 6, lineHeight: 15 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  colorChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
  },
  colorChipOn: { borderWidth: 2 },
  colorDot: { width: 36, height: 36, borderRadius: 18 },
  colorDotOn: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4 },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 22, marginBottom: 8 },
  btnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
});
