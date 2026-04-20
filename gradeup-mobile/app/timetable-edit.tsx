import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations, TranslationKey } from '@/src/i18n';
import { TIMETABLE_SLOT_COLOR_OPTIONS, getSlotColorForSubjectCode } from '@/src/lib/timetableSlotColors';
import {
  findOverlappingTimetableEntry,
  normalizeTimeDisplay,
  parseTimeToMinutes,
  TIMETABLE_DAY_ORDER,
} from '@/src/lib/timetableValidation';

function oneParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function isDayOfWeek(d: string): d is DayOfWeek {
  return (TIMETABLE_DAY_ORDER as readonly string[]).includes(d);
}
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

/** Candidate id that cannot match a real row — overlap check for new slots. */
const NEW_SLOT_OVERLAP_ID = '__new__';

const QUICK_TIMES = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
  '19:00', '20:00', '21:00', '22:00',
];

function dayOrder(weekStartsOn: WeekStartsOn): DayOfWeek[] {
  return weekStartsOn === 'sunday' ? DAYS_SUN_FIRST : DAYS_MON_FIRST;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToHHmm(total: number): string {
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function newLocalTimetableId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function conflictMessage(
  T: (key: TranslationKey) => string,
  other: TimetableEntry,
): string {
  return T('timetableScheduleConflictDetail')
    .replace('{code}', other.subjectCode)
    .replace('{start}', other.startTime)
    .replace('{end}', other.endTime);
}

export default function TimetableEditScreen() {
  const {
    language,
    timetable,
    weekStartsOn,
    updateTimetableEntry,
    addTimetableEntry,
    removeTimetableEntry,
  } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const params = useLocalSearchParams<{ entryId?: string | string[]; addDay?: string | string[]; addStart?: string | string[] }>();
  const entryIdParam = (oneParam(params.entryId) || '').trim() || undefined;
  const addDayParam = (oneParam(params.addDay) || '').trim() || undefined;
  const addStartParam = (oneParam(params.addStart) || '').trim() || undefined;
  const routePrefillKey = useMemo(() => {
    if (entryIdParam) return `e:${entryIdParam}`;
    if (addDayParam && addStartParam) return `a:${addDayParam}:${addStartParam}`;
    return '';
  }, [entryIdParam, addDayParam, addStartParam]);

  const appliedRouteKeyRef = useRef('');

  const [editing, setEditing] = useState<TimetableEntry | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);

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
  // Remembers the user's last picked length-from-start chip so the chip stays highlighted
  // even when we can't derive it from the current start/end (e.g. empty start time).
  const [pickedDurationHours, setPickedDurationHours] = useState<number | null>(null);

  const modalOpen = editing != null || isCreating;

  const sorted = useMemo(() => {
    const order = dayOrder(weekStartsOn);
    const rank = (d: DayOfWeek) => order.indexOf(d);
    return [...timetable].sort((a, b) => {
      const dr = rank(a.day) - rank(b.day);
      if (dr !== 0) return dr;
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });
  }, [timetable, weekStartsOn]);

  const resetForm = useCallback(() => {
    const first = dayOrder(weekStartsOn)[0];
    setDay(first);
    setStartTime('08:00');
    setEndTime('10:00');
    setSubjectCode('');
    setSubjectName('');
    setGroup('');
    setDisplayName('');
    setLecturer('');
    setLocation('');
    setSlotColor(undefined);
    setPickedDurationHours(null);
  }, [weekStartsOn]);

  const closeModal = useCallback(() => {
    appliedRouteKeyRef.current = '';
    setEditing(null);
    setIsCreating(false);
    router.setParams({ entryId: '', addDay: '', addStart: '' });
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setEditing(null);
    setIsCreating(true);
  }, [resetForm]);

  const openDuplicateFrom = useCallback(
    (e: TimetableEntry) => {
      setEditing(null);
      setIsCreating(true);
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
      setPickedDurationHours(null);
    },
    [],
  );

  const openEdit = useCallback((e: TimetableEntry) => {
    setIsCreating(false);
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
    setPickedDurationHours(null);
  }, []);

  /** Open edit sheet from timetable grid/list (deep link). */
  useEffect(() => {
    if (!routePrefillKey) {
      appliedRouteKeyRef.current = '';
      return;
    }
    if (appliedRouteKeyRef.current === routePrefillKey) return;

    if (entryIdParam) {
      const found = timetable.find((x) => x.id === entryIdParam);
      if (!found) return;
      appliedRouteKeyRef.current = routePrefillKey;
      openEdit(found);
      return;
    }

    if (addDayParam && addStartParam && isDayOfWeek(addDayParam)) {
      const ns = normalizeTimeDisplay(addStartParam);
      if (ns === null) return;
      const sm = parseTimeToMinutes(ns);
      if (sm === null) return;
      appliedRouteKeyRef.current = routePrefillKey;
      setEditing(null);
      setIsCreating(true);
      setDay(addDayParam);
      setStartTime(ns);
      setEndTime(minutesToHHmm(sm + 60));
      setSubjectCode('');
      setSubjectName('');
      setGroup('');
      setDisplayName('');
      setLecturer('');
      setLocation('');
      setSlotColor(undefined);
      setPickedDurationHours(null);
    }
  }, [routePrefillKey, timetable, entryIdParam, addDayParam, addStartParam, openEdit]);

  const applyDurationFromStart = useCallback((hours: number) => {
    // Always record the user's intent so the chip highlights immediately, even if the
    // start time isn't valid yet (end time will update as soon as a valid start is entered).
    setPickedDurationHours(hours);
    const ns = normalizeTimeDisplay(startTime);
    if (ns === null) return;
    const sm = parseTimeToMinutes(ns);
    if (sm === null) return;
    setEndTime(minutesToHHmm(sm + Math.round(hours * 60)));
  }, [startTime]);

  // When the user has picked a length and later enters/changes the start time, update end time.
  useEffect(() => {
    if (pickedDurationHours == null) return;
    const ns = normalizeTimeDisplay(startTime);
    if (ns === null) return;
    const sm = parseTimeToMinutes(ns);
    if (sm === null) return;
    const next = minutesToHHmm(sm + Math.round(pickedDurationHours * 60));
    setEndTime((prev) => (prev === next ? prev : next));
  }, [startTime, pickedDurationHours]);

  const activeStartQuick = useMemo(() => {
    const ns = normalizeTimeDisplay(startTime);
    return ns ?? startTime.trim();
  }, [startTime]);

  const activeEndQuick = useMemo(() => {
    const ne = normalizeTimeDisplay(endTime);
    return ne ?? endTime.trim();
  }, [endTime]);

  const activeDurationHours = useMemo(() => {
    const ns = normalizeTimeDisplay(startTime);
    const ne = normalizeTimeDisplay(endTime);
    if (ns == null || ne == null) return null;
    const sm = parseTimeToMinutes(ns);
    const em = parseTimeToMinutes(ne);
    if (sm == null || em == null) return null;
    const diffMin = em - sm;
    if (diffMin <= 0) return null;
    const hours = diffMin / 60;
    // Snap to half-hour so 1.5h highlights correctly.
    return Math.round(hours * 2) / 2;
  }, [startTime, endTime]);

  const setStartQuick = useCallback((t: string) => {
    setStartTime(t);
  }, []);

  const setEndQuick = useCallback((t: string) => {
    setEndTime(t);
  }, []);

  const saveEntry = useCallback(async () => {
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
    const overlapId = isCreating ? NEW_SLOT_OVERLAP_ID : editing!.id;
    const overlap = findOverlappingTimetableEntry(timetable, {
      id: overlapId,
      day,
      startTime: ns,
      endTime: ne,
    });
    if (overlap) {
      Alert.alert(T('timetableScheduleConflict'), conflictMessage(T, overlap));
      return;
    }

    const name = subjectName.trim();
    const g = group.trim();
    const disp = displayName.trim();
    const lec = lecturer.trim() || '-';
    const loc = location.trim() || '-';
    const colorTrim = slotColor?.trim() || '';

    setSaving(true);
    try {
      if (isCreating) {
        await addTimetableEntry({
          id: newLocalTimetableId(),
          day,
          startTime: ns,
          endTime: ne,
          subjectCode: code,
          subjectName: name || code,
          ...(g ? { group: g } : {}),
          ...(disp ? { displayName: disp } : {}),
          lecturer: lec,
          location: loc,
          ...(colorTrim ? { slotColor: colorTrim } : {}),
        });
      } else if (editing) {
        await updateTimetableEntry(editing.id, {
          day,
          startTime: ns,
          endTime: ne,
          subjectCode: code,
          subjectName: name || code,
          group: g,
          displayName: disp,
          lecturer: lec,
          location: loc,
          slotColor: colorTrim,
        });
      }
      closeModal();
    } catch (e) {
      Alert.alert(T('error'), e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [
    isCreating,
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
    addTimetableEntry,
    closeModal,
  ]);

  const confirmDelete = useCallback(() => {
    if (!editing) return;
    Alert.alert(T('timetableDeleteClass'), T('timetableDeleteClassConfirm'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('timetableDeleteClass'),
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await removeTimetableEntry(editing.id);
            closeModal();
          } catch (e) {
            Alert.alert(T('error'), e instanceof Error ? e.message : String(e));
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }, [editing, T, removeTimetableEntry, closeModal]);

  const sheetTitle = isCreating ? T('timetableAddClassTitle') : T('timetableEditTitle');

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
        <Pressable
          onPress={openCreate}
          style={({ pressed }) => [styles.headerAddBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.9 }]}
          accessibilityLabel={T('timetableAddClass')}
        >
          <Feather name="plus" size={22} color="#fff" />
        </Pressable>
      </View>

      {timetable.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{T('timetableEmptyManualHint')}</Text>
          <Pressable
            onPress={openCreate}
            style={({ pressed }) => [styles.emptyAddBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.9 }]}
          >
            <Feather name="plus-circle" size={20} color="#fff" />
            <Text style={styles.emptyAddBtnText}>{T('timetableAddClass')}</Text>
          </Pressable>
        </View>
      ) : (
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
      )}

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={closeModal}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKb}
          >
            <View style={[styles.sheet, { backgroundColor: theme.card }]}>
              <View style={styles.sheetHandle} />
              <Text style={[styles.sheetTitle, { color: theme.text }]}>{sheetTitle}</Text>
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
                          {T(DAY_PICKER_KEYS[d] as TranslationKey)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={[styles.label, { color: theme.textSecondary, marginTop: 12 }]}>{T('timetableQuickTimes')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
                  {QUICK_TIMES.map((t) => {
                    const active = activeStartQuick === t;
                    return (
                      <Pressable
                        key={`s-${t}`}
                        onPress={() => setStartQuick(t)}
                        style={[
                          styles.quickChip,
                          {
                            borderColor: active ? theme.primary : theme.border,
                            backgroundColor: active ? theme.primary : theme.background,
                          },
                        ]}
                      >
                        <Text style={[styles.quickChipText, { color: active ? '#fff' : theme.text }]}>{t}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={[styles.label, { color: theme.textSecondary, marginTop: 10 }]}>{T('timetableStartTime')}</Text>
                <Text style={[styles.hint, { color: theme.textSecondary }]}>{T('timetableTimeHint')}</Text>
                <TextInput
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="08:00"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                />

                <Text style={[styles.label, { color: theme.textSecondary, marginTop: 8 }]}>{T('timetableSetDuration')}</Text>
                <View style={styles.durationRow}>
                  {([1, 1.5, 2, 3] as const).map((h) => {
                    // Highlight when the derived start→end duration matches, or when the user
                    // just tapped this chip and we couldn't derive yet (empty/invalid times).
                    const active =
                      activeDurationHours === h ||
                      (activeDurationHours == null && pickedDurationHours === h);
                    return (
                      <Pressable
                        key={h}
                        onPress={() => applyDurationFromStart(h)}
                        style={[
                          styles.durationChip,
                          {
                            borderColor: active ? theme.primary : theme.border,
                            backgroundColor: active ? theme.primary : theme.backgroundSecondary,
                          },
                        ]}
                      >
                        <Text style={[styles.durationChipText, { color: active ? '#fff' : theme.text }]}>{h}h</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.label, { color: theme.textSecondary, marginTop: 10 }]}>{T('timetableEndTime')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
                  {QUICK_TIMES.map((t) => {
                    const active = activeEndQuick === t;
                    return (
                      <Pressable
                        key={`e-${t}`}
                        onPress={() => setEndQuick(t)}
                        style={[
                          styles.quickChip,
                          {
                            borderColor: active ? theme.primary : theme.border,
                            backgroundColor: active ? theme.primary : theme.background,
                          },
                        ]}
                      >
                        <Text style={[styles.quickChipText, { color: active ? '#fff' : theme.text }]}>{t}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
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

                {editing && !isCreating ? (
                  <View style={styles.secondaryActions}>
                    <Pressable
                      onPress={() => openDuplicateFrom(editing)}
                      style={[styles.btnGhost, { borderColor: theme.border }]}
                    >
                      <Feather name="copy" size={18} color={theme.primary} />
                      <Text style={[styles.btnGhostText, { color: theme.primary }]}>{T('timetableDuplicateSlot')}</Text>
                    </Pressable>
                    <Pressable onPress={confirmDelete} style={[styles.btnGhost, { borderColor: theme.border }]}>
                      <Feather name="trash-2" size={18} color="#dc2626" />
                      <Text style={[styles.btnGhostText, { color: '#dc2626' }]}>{T('timetableDeleteClass')}</Text>
                    </Pressable>
                  </View>
                ) : null}

                <View style={styles.sheetActions}>
                  <Pressable
                    onPress={closeModal}
                    disabled={saving}
                    style={[styles.btnSecondary, { borderColor: theme.border }, saving && { opacity: 0.5 }]}
                  >
                    <Text style={{ color: theme.text, fontWeight: '700' }}>{T('cancel')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void saveEntry()}
                    disabled={saving}
                    style={[styles.btnPrimary, { backgroundColor: theme.primary }, saving && { opacity: 0.7 }]}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={{ color: '#fff', fontWeight: '700' }}>{T('save')}</Text>
                    )}
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
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16, gap: 10 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', flex: 1 },
  headerAddBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: { flex: 1, paddingHorizontal: 24, paddingTop: 24, gap: 20 },
  emptyText: { fontSize: 15, lineHeight: 22 },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  emptyAddBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
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
  quickRow: { flexDirection: 'row', gap: 8, paddingVertical: 6 },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  quickChipText: { fontSize: 12, fontWeight: '700' },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  durationChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  durationChipText: { fontSize: 13, fontWeight: '800' },
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
  secondaryActions: { marginTop: 18, gap: 10 },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  btnGhostText: { fontSize: 15, fontWeight: '700' },
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
    justifyContent: 'center',
    minHeight: 50,
  },
});
