import { useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { clearPendingSowExtraction, getPendingSowExtraction } from '@/src/lib/sowExtractionStore';
import { TaskType, type Course } from '@/src/types';
import { buildTaskFromExtraction, getSuggestedWeekForDueDate } from '@/src/lib/taskUtils';
import { analyzeSowWeekAlignment } from '@/src/lib/sowCalendarAlignment';
import { teachingWeekNumberForDate } from '@/src/lib/academicWeek';
import { getTodayISO } from '@/src/utils/date';
import { supabase } from '@/src/lib/supabase';
import * as coursesDb from '@/src/lib/coursesDb';
import * as taskDb from '@/src/lib/taskDb';

const DEFAULT_WORKLOAD = [2, 3, 4, 6, 5, 7, 8, 4, 6, 8, 10, 9, 10, 4];
const TASK_TYPE_OPTIONS = Object.values(TaskType);
/** Matches upload-sow default when user has not set end-of-week in extract modal. */
const SOW_END_OF_WEEK: 'FRI' | 'SAT' | 'SUN' = 'SUN';

type EditableSubject = { subject_id: string; name: string; credit_hours: number };
type EditableTask = {
  title: string;
  course_id: string;
  type: string;
  due_date: string;
  due_time: string;
  notes: string;
  suggested_week?: number;
  deadline_risk?: string;
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function resolveCourseDisplayCode(course: Course): string {
  if (!course.id?.startsWith('gc-course-')) return course.id;
  const firstWord = (course.name || '').trim().split(/\s+/)[0];
  return firstWord || course.id.replace('gc-course-', '');
}

function normalizeDate(value: string): string {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return getTodayISO();
}

function isoToDate(iso: string): Date {
  return new Date(`${normalizeDate(iso).slice(0, 10)}T12:00:00`);
}

function dueDateTimeToDate(iso: string, time: string): Date {
  const date = isoToDate(iso);
  const [hStr, mStr] = (time || '00:00').split(':');
  const h = Number.isFinite(Number(hStr)) ? Number(hStr) : 0;
  const m = Number.isFinite(Number(mStr)) ? Number(mStr) : 0;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0, 0);
}

function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildInstructionalWeekStarts(
  periods: Array<{ type?: string; startDate?: string; endDate?: string }> | undefined,
  totalSemesterWeeks: number,
): string[] {
  if (!Array.isArray(periods) || periods.length === 0) return [];
  const countedTypes = new Set(['lecture', 'exam', 'test', 'revision']);
  const counted = periods.filter((p) => countedTypes.has(String(p?.type ?? '')));
  if (counted.length === 0) return [];

  const countedDays = new Set<string>();
  for (const p of counted) {
    const start = String(p?.startDate ?? '').slice(0, 10);
    const end = String(p?.endDate ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
    const cur = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    if (Number.isNaN(cur.getTime()) || Number.isNaN(endDate.getTime())) continue;
    while (cur.getTime() <= endDate.getTime()) {
      countedDays.add(formatISODate(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }
  if (countedDays.size === 0) return [];

  const sortedDays = [...countedDays].sort();
  const firstCounted = sortedDays[0];
  const first = new Date(`${firstCounted}T00:00:00`);
  const firstDow = first.getDay();
  if (firstDow !== 0) first.setDate(first.getDate() - firstDow);

  const weekStarts: string[] = [];
  const cursor = new Date(first);
  const capWeeks = Math.max(totalSemesterWeeks, 20);
  for (let guard = 0; guard < 120 && weekStarts.length < capWeeks; guard++) {
    const weekStart = formatISODate(cursor);
    let hasCountedDay = false;
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      d.setDate(d.getDate() + i);
      if (countedDays.has(formatISODate(d))) {
        hasCountedDay = true;
        break;
      }
    }
    if (hasCountedDay) weekStarts.push(weekStart);
    cursor.setDate(cursor.getDate() + 7);
  }
  return weekStarts;
}

function formatTimeHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function SowReview() {
  const theme = useTheme();
  const { courses, addCourse, addTask, user, academicCalendar } = useApp();
  const pending = getPendingSowExtraction();
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<null | { taskIndex: number; mode: 'date' | 'time'; value: Date }>(null);

  const [subjects, setSubjects] = useState<EditableSubject[]>(
    (pending?.extracted?.subjects ?? []).map((s) => ({
      subject_id: (s.subject_id || '').toUpperCase(),
      name: s.name || '',
      credit_hours: Number(s.credit_hours ?? 3) || 3,
    }))
  );
  const [tasks, setTasks] = useState<EditableTask[]>(
    (pending?.extracted?.tasks ?? []).map((t) => ({
      title: t.title || '',
      course_id: (t.course_id || '').toUpperCase(),
      type: t.type || 'Assignment',
      due_date: normalizeDate(t.due_date || ''),
      due_time: (t.due_time || '23:59').slice(0, 5),
      notes: t.notes || '',
      suggested_week: t.suggested_week,
      deadline_risk: t.deadline_risk,
    }))
  );

  const defaultSemesterStart = (academicCalendar?.startDate || user.startDate || '').slice(0, 10);

  const knownCourseIds = useMemo(() => new Set(courses.map((c) => c.id.toUpperCase())), [courses]);
  const editedSubjectIdSet = useMemo(
    () => new Set(subjects.map((s) => s.subject_id.trim().toUpperCase()).filter(Boolean)),
    [subjects]
  );

  const totalSemesterWeeks = academicCalendar?.totalWeeks ?? 14;

  const dueDateFromSuggestedWeek = (weekNum: number): string => {
    const week = clampInt(weekNum, 1, Math.max(totalSemesterWeeks, 20));
    const weekStarts = buildInstructionalWeekStarts(academicCalendar?.periods, totalSemesterWeeks);
    const start = weekStarts[week - 1] || defaultSemesterStart;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return '';
    const offset = SOW_END_OF_WEEK === 'FRI' ? 4 : SOW_END_OF_WEEK === 'SAT' ? 5 : 6;
    const d = new Date(`${start}T00:00:00`);
    d.setDate(d.getDate() + offset);
    return formatISODate(d);
  };

  const onSuggestedWeekChange = (taskIndex: number, text: string) => {
    const digits = text.replace(/\D/g, '');
    if (!digits) {
      setTasks((prev) =>
        prev.map((row, j) => (j === taskIndex ? { ...row, suggested_week: undefined } : row))
      );
      return;
    }
    const week = clampInt(parseInt(digits, 10) || 1, 1, Math.max(totalSemesterWeeks, 20));
    const dueFromWeek = dueDateFromSuggestedWeek(week);
    setTasks((prev) =>
      prev.map((row, j) =>
        j === taskIndex
          ? {
              ...row,
              suggested_week: week,
              due_date: dueFromWeek || row.due_date,
            }
          : row
      )
    );
  };

  const sowWeekAlignment = useMemo(
    () =>
      analyzeSowWeekAlignment(tasks, {
        semesterStart: user.startDate,
        totalWeeks: totalSemesterWeeks,
        currentWeek: Math.max(
          1,
          teachingWeekNumberForDate(
            getTodayISO(),
            academicCalendar,
            user.startDate,
            totalSemesterWeeks,
            user.currentWeek ?? 1,
          ),
        ),
        periods: academicCalendar?.periods,
        isBreak: user.isBreak,
        todayISO: getTodayISO(),
        semesterPhase: user.semesterPhase,
      }),
    [
      tasks,
      user.startDate,
      user.currentWeek,
      user.isBreak,
      user.semesterPhase,
      totalSemesterWeeks,
      academicCalendar?.periods,
      academicCalendar?.startDate,
    ]
  );

  const confirmRemoveSubjectFromImport = (index: number, row: EditableSubject) => {
    const code = row.subject_id.trim().toUpperCase();
    const label = code ? `${code} – ${row.name.trim() || 'Unnamed'}` : row.name.trim() || 'This subject';
    const linked = code ? tasks.filter((t) => t.course_id.trim().toUpperCase() === code).length : 0;
    const message =
      linked > 0
        ? `Remove "${label}" and ${linked} task(s) that use course code ${code} from this import?`
        : `Remove "${label}" from this import?`;

    Alert.alert('Remove subject', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setSubjects((prev) => prev.filter((_, j) => j !== index));
          if (code) {
            setTasks((prev) => prev.filter((t) => t.course_id.trim().toUpperCase() !== code));
          }
        },
      },
    ]);
  };

  const performSowReviewSave = async () => {
    if (saving || !pending) return;
    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;
      if (!uid) {
        Alert.alert('Sign in required', 'Sign in to save SOW data.');
        return;
      }

      const dbHint = '';

      const subjectMap = new Set(courses.map((c) => c.id.toUpperCase()));
      for (const s of subjects) {
        const id = s.subject_id.trim().toUpperCase();
        const name = s.name.trim();
        if (!id || !name || subjectMap.has(id)) continue;
        const course: Course = {
          id,
          name,
          creditHours: Math.max(1, Math.min(30, Number(s.credit_hours) || 3)),
          workload: DEFAULT_WORKLOAD,
        };
        const { error: courseErr } = await coursesDb.addCourse(uid, course);
        if (courseErr) {
          Alert.alert('Could not save subjects', 'Something went wrong. Please try again.');
          return;
        }
        addCourse(course, { skipRemote: true });
        subjectMap.add(id);
      }

      for (const t of tasks) {
        if (!t.title.trim()) continue;
        const courseId = t.course_id.trim().toUpperCase() || courses[0]?.id || 'GENERAL';
        const dueDate = normalizeDate(t.due_date);
        const extracted = {
          title: t.title.trim(),
          course_id: courseId,
          type: t.type || 'Assignment',
          due_date: dueDate,
          due_time: (t.due_time || '23:59').slice(0, 5),
          priority: 'Medium',
          effort_hours: 2,
          notes: t.notes ?? '',
          deadline_risk: t.deadline_risk,
          suggested_week: t.suggested_week || getSuggestedWeekForDueDate(dueDate, user, academicCalendar?.startDate),
        };
        const task = buildTaskFromExtraction(extracted as any, {
          fallbackCourseId: courseId,
          user,
          calendarStart: academicCalendar?.startDate,
          sourceMessage: `Imported from SOW: ${pending.fileName}`,
        });
        task.type = Object.values(TaskType).includes(task.type) ? task.type : TaskType.Assignment;
        const { error: taskErr } = await taskDb.upsertTask(uid, task);
        if (taskErr) {
          Alert.alert('Could not save tasks', 'Something went wrong. Please try again.');
          return;
        }
        addTask(task, { skipRemote: true });
      }

      if (uid) {
        await supabase.from('sow_imports').upsert({
          id: pending.importId,
          user_id: uid,
          file_name: pending.fileName,
          storage_path: pending.storagePath,
          status: 'saved',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id,user_id' });
      }

      clearPendingSowExtraction();
      router.replace('/(tabs)/planner' as any);
    } catch (e) {
      Alert.alert('Save failed', 'Could not save your subjects and tasks. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const onSave = () => {
    if (saving || !pending) return;
    if (sowWeekAlignment.hasIssues) {
      Alert.alert(
        'Semester weeks out of sync',
        `${sowWeekAlignment.message}\n\nYou can edit due dates below, update Academic Calendar, or still save — Semester Pulse follows your calendar.`,
        [
          { text: 'Review', style: 'cancel' },
          { text: 'Save anyway', onPress: () => void performSowReviewSave() },
        ]
      );
      return;
    }
    void performSowReviewSave();
  };

  const openTaskPicker = (taskIndex: number, mode: 'date' | 'time') => {
    const t = tasks[taskIndex];
    if (!t) return;
    setPicker({ taskIndex, mode, value: dueDateTimeToDate(t.due_date, t.due_time) });
  };

  const onPickerChange = (_event: unknown, selected?: Date) => {
    if (!picker) return;
    const event = _event as { type?: string };
    const dismissed = event?.type === 'dismissed';
    if (dismissed) {
      setPicker(null);
      return;
    }
    if (!selected) {
      if (Platform.OS !== 'ios') setPicker(null);
      return;
    }
    const idx = picker.taskIndex;
    if (picker.mode === 'date') {
      const iso = formatISODate(selected);
      const nextWeek = getSuggestedWeekForDueDate(iso, user, academicCalendar?.startDate);
      setTasks((prev) =>
        prev.map((row, j) =>
          j === idx ? { ...row, due_date: iso, suggested_week: Math.max(1, nextWeek) } : row
        )
      );
    } else {
      const tm = formatTimeHM(selected);
      setTasks((prev) => prev.map((row, j) => (j === idx ? { ...row, due_time: tm } : row)));
    }
    if (Platform.OS === 'ios') {
      setPicker((prev) => (prev ? { ...prev, value: selected } : prev));
      return;
    }
    setPicker(null);
  };

  if (!pending) {
    return (
      <View style={[styles.emptyWrap, { backgroundColor: theme.background }]}>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>No extracted SOW data</Text>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.headerBack}>
          <Feather name="chevron-left" size={22} color={theme.primary} />
          <Text style={[styles.headerBackText, { color: theme.primary }]}>Back</Text>
        </Pressable>
      </View>

      <Text style={[styles.title, { color: theme.text }]}>Review SOW Extraction</Text>
      <Text style={[styles.sub, { color: theme.textSecondary }]}>
        Edit subjects and assignments before saving to your account.
      </Text>

      {sowWeekAlignment.hasIssues ? (
        <View
          style={[
            styles.weekSyncBanner,
            { backgroundColor: '#fef3c7', borderColor: '#f59e0b' },
          ]}
        >
          <Feather name="alert-triangle" size={18} color="#b45309" style={{ marginRight: 10, marginTop: 2 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.weekSyncBannerTitle, { color: '#92400e' }]}>Calendar / SOW mismatch</Text>
            <Text style={[styles.weekSyncBannerBody, { color: '#78350f' }]}>
              Semester Pulse: week {user.isBreak ? 'break' : user.currentWeek} of {totalSemesterWeeks}. Some dates may
              not match — save will show affected weeks.
            </Text>
          </View>
        </View>
      ) : null}

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Subjects</Text>
      {subjects.map((s, idx) => (
        <View key={`subject-${idx}`} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.subjectCardHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.subjectCardHeaderLabel, { color: theme.textSecondary }]}>Subject {idx + 1}</Text>
            <Pressable
              accessibilityLabel="Remove subject"
              onPress={() => confirmRemoveSubjectFromImport(idx, s)}
              style={({ pressed }) => [styles.subjectDeleteBtn, pressed && { opacity: 0.7 }]}
            >
              <Feather name="trash-2" size={18} color="#ef4444" />
            </Pressable>
          </View>
          {s.subject_id.trim().toLowerCase().startsWith('gc-course-') ? (
            <Text style={[styles.gcHint, { color: theme.textSecondary }]}>
              Short label:{' '}
              {resolveCourseDisplayCode({
                id: s.subject_id,
                name: s.name,
                creditHours: Math.max(1, Math.min(30, Number(s.credit_hours) || 3)),
                workload: DEFAULT_WORKLOAD,
              })}
            </Text>
          ) : null}
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={s.subject_id}
            onChangeText={(v) => setSubjects((prev) => prev.map((it, i) => (i === idx ? { ...it, subject_id: v.toUpperCase() } : it)))}
            placeholder="Subject code"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="characters"
          />
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={s.name}
            onChangeText={(v) => setSubjects((prev) => prev.map((it, i) => (i === idx ? { ...it, name: v } : it)))}
            placeholder="Subject name"
            placeholderTextColor={theme.textSecondary}
          />
          <View style={styles.row}>
            <Text style={[styles.inlineLabel, { color: theme.textSecondary }]}>Credit hours</Text>
            <TextInput
              style={[styles.input, styles.creditInput, { color: theme.text, borderColor: theme.border }]}
              value={String(s.credit_hours)}
              onChangeText={(v) => {
                const n = parseInt(v.replace(/\D/g, ''), 10);
                setSubjects((prev) =>
                  prev.map((it, i) =>
                    i === idx
                      ? {
                          ...it,
                          credit_hours: Number.isFinite(n) && n > 0 ? Math.min(30, n) : it.credit_hours,
                        }
                      : it
                  )
                );
              }}
              keyboardType="number-pad"
              placeholder="3"
              placeholderTextColor={theme.textSecondary}
            />
          </View>
        </View>
      ))}

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Assignments / Tasks</Text>
      {tasks.map((t, idx) => {
        const cid = t.course_id.trim().toUpperCase();
        const unknownCourse =
          cid.length > 0 && !knownCourseIds.has(cid) && !editedSubjectIdSet.has(cid);
        const plannerGcCourse = courses.find(
          (c) => c.id.toUpperCase() === cid && c.id.startsWith('gc-course-')
        );
        return (
        <View key={`task-${idx}`} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={t.title}
            onChangeText={(v) => setTasks((prev) => prev.map((it, i) => (i === idx ? { ...it, title: v } : it)))}
            placeholder="Task title"
            placeholderTextColor={theme.textSecondary}
          />
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={t.course_id}
            onChangeText={(v) => setTasks((prev) => prev.map((it, i) => (i === idx ? { ...it, course_id: v.toUpperCase() } : it)))}
            placeholder="Course code"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="characters"
          />
          {unknownCourse ? (
              <Text style={[styles.warn, { color: '#b45309' }]}>
                Code not in subjects above or your planner — task still saves with this code.
              </Text>
          ) : null}
          {plannerGcCourse ? (
            <Text style={[styles.gcHint, { color: theme.textSecondary }]} numberOfLines={1}>
              Shown as: {resolveCourseDisplayCode(plannerGcCourse)}
            </Text>
          ) : null}
          <Text style={[styles.chipLabel, { color: theme.textSecondary }]}>Type</Text>
          <View style={styles.chipRow}>
            {TASK_TYPE_OPTIONS.map((opt) => {
              const active = t.type === opt;
              return (
                <Pressable
                  key={opt}
                  onPress={() => setTasks((prev) => prev.map((it, i) => (i === idx ? { ...it, type: opt } : it)))}
                  style={[
                    styles.chip,
                    { borderColor: theme.border },
                    active && { backgroundColor: theme.primary, borderColor: theme.primary },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? '#fff' : theme.text }]}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.row}>
            <Pressable
              onPress={() => openTaskPicker(idx, 'date')}
              style={({ pressed }) => [
                styles.pickerField,
                styles.half,
                { borderColor: theme.border, backgroundColor: theme.background },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Feather name="calendar" size={14} color={theme.textSecondary} />
              <Text style={[styles.pickerFieldText, { color: theme.text }]}>{t.due_date}</Text>
            </Pressable>
            <Pressable
              onPress={() => openTaskPicker(idx, 'time')}
              style={({ pressed }) => [
                styles.pickerField,
                styles.half,
                { borderColor: theme.border, backgroundColor: theme.background },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Feather name="clock" size={14} color={theme.textSecondary} />
              <Text style={[styles.pickerFieldText, { color: theme.text }]}>{t.due_time}</Text>
            </Pressable>
          </View>
          {t.suggested_week ? (
            <Text style={[styles.weekLine, { color: theme.textSecondary }]}>Week {t.suggested_week}</Text>
          ) : null}
          <View style={styles.row}>
            <Text style={[styles.inlineLabel, { color: theme.textSecondary }]}>Week</Text>
            <TextInput
              style={[styles.input, styles.creditInput, { color: theme.text, borderColor: theme.border }]}
              value={t.suggested_week ? String(t.suggested_week) : ''}
              onChangeText={(v) => onSuggestedWeekChange(idx, v)}
              keyboardType="number-pad"
              placeholder="8"
              placeholderTextColor={theme.textSecondary}
            />
            <Text style={[styles.weekEditHint, { color: theme.textSecondary }]}>Week updates due date</Text>
          </View>
          <TextInput
            style={[styles.input, styles.notes, { color: theme.text, borderColor: theme.border }]}
            value={t.notes}
            onChangeText={(v) => setTasks((prev) => prev.map((it, i) => (i === idx ? { ...it, notes: v } : it)))}
            placeholder="Notes (optional)"
            placeholderTextColor={theme.textSecondary}
            multiline
          />
        </View>
        );
      })}

      <Pressable
        style={({ pressed }) => [
          styles.saveBtn,
          { backgroundColor: theme.primary },
          saving && { opacity: 0.6 },
          pressed && { opacity: 0.9 },
        ]}
        onPress={onSave}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save to Supabase'}</Text>
      </Pressable>

      {picker ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setPicker(null)}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setPicker(null)}>
            <View
              style={[styles.pickerPanel, { backgroundColor: theme.card, borderColor: theme.border }]}
              onStartShouldSetResponder={() => true}
            >
              <Text style={[styles.pickerTitle, { color: theme.text }]}>
                {picker.mode === 'date' ? 'Pick due date' : 'Pick due time'}
              </Text>
              <DateTimePicker
                value={picker.value}
                mode={picker.mode}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_e, d) => onPickerChange(_e, d ?? undefined)}
                is24Hour
              />
              <Pressable
                style={({ pressed }) => [
                  styles.pickerDone,
                  { backgroundColor: theme.primary },
                  pressed && { opacity: 0.9 },
                ]}
                onPress={() => setPicker(null)}
              >
                <Text style={[styles.pickerDoneText, { color: theme.textInverse }]}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      ) : null}
      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 },
  headerRow: { marginBottom: 10 },
  headerBack: { flexDirection: 'row', alignItems: 'center' },
  headerBackText: { fontSize: 17, marginLeft: 2, fontWeight: '500' },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  sub: { marginTop: 8, fontSize: 14, lineHeight: 20, marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: 6, marginBottom: 10 },
  subjectCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subjectCardHeaderLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  subjectDeleteBtn: { padding: 6, marginRight: -4 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  half: { flex: 1 },
  inlineLabel: { fontSize: 12, fontWeight: '700', minWidth: 88 },
  creditInput: { flex: 1, maxWidth: 88, marginBottom: 8 },
  chipLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 4, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  chipText: { fontSize: 11, fontWeight: '800' },
  notes: { minHeight: 56, textAlignVertical: 'top' },
  warn: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  gcHint: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  weekLine: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  weekEditHint: { fontSize: 11, fontWeight: '600', flex: 1, minWidth: 120 },
  pickerField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 11,
    marginBottom: 8,
  },
  pickerFieldText: { fontSize: 14, fontWeight: '700' },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 20,
    justifyContent: 'center',
  },
  pickerPanel: { borderRadius: 16, borderWidth: 1, padding: 14 },
  pickerTitle: { fontSize: 14, fontWeight: '900', marginBottom: 8, letterSpacing: -0.2 },
  pickerDone: { marginTop: 10, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  pickerDoneText: { fontSize: 13, fontWeight: '900' },
  saveBtn: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  backBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  backBtnText: { color: '#fff', fontWeight: '700' },
  weekSyncBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  weekSyncBannerTitle: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  weekSyncBannerBody: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
});

