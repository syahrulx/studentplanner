import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { clearPendingSowExtraction, getPendingSowExtraction } from '@/src/lib/sowExtractionStore';
import { Priority, TaskType, type Course } from '@/src/types';
import { buildTaskFromExtraction, getSuggestedWeekForDueDate } from '@/src/lib/taskUtils';
import { analyzeSowWeekAlignment } from '@/src/lib/sowCalendarAlignment';
import { getTodayISO } from '@/src/utils/date';
import { supabase } from '@/src/lib/supabase';
import * as coursesDb from '@/src/lib/coursesDb';
import * as taskDb from '@/src/lib/taskDb';

const DEFAULT_WORKLOAD = [2, 3, 4, 6, 5, 7, 8, 4, 6, 8, 10, 9, 10, 4];
const TASK_TYPE_OPTIONS = Object.values(TaskType);
const PRIORITY_OPTIONS = Object.values(Priority);

function priorityChipColor(p: string): string {
  if (p === 'High') return '#ef4444';
  if (p === 'Medium') return '#f59e0b';
  return '#22c55e';
}

type EditableSubject = { subject_id: string; name: string; credit_hours: number };
type EditableTask = {
  title: string;
  course_id: string;
  type: string;
  due_date: string;
  due_time: string;
  priority: string;
  effort_hours: number;
  notes: string;
  suggested_week?: number;
  deadline_risk?: string;
};

function normalizeDate(value: string): string {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return getTodayISO();
}

export default function SowReview() {
  const theme = useTheme();
  const { courses, addCourse, addTask, user, academicCalendar } = useApp();
  const pending = getPendingSowExtraction();
  const [saving, setSaving] = useState(false);

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
      priority: t.priority || 'Medium',
      effort_hours: Number(t.effort_hours ?? 2) || 2,
      notes: t.notes || '',
      suggested_week: t.suggested_week,
      deadline_risk: t.deadline_risk,
    }))
  );

  const knownCourseIds = useMemo(() => new Set(courses.map((c) => c.id.toUpperCase())), [courses]);
  const editedSubjectIdSet = useMemo(
    () => new Set(subjects.map((s) => s.subject_id.trim().toUpperCase()).filter(Boolean)),
    [subjects]
  );

  const totalSemesterWeeks = academicCalendar?.totalWeeks ?? 14;
  const sowWeekAlignment = useMemo(
    () =>
      analyzeSowWeekAlignment(tasks, {
        semesterStart: user.startDate,
        totalWeeks: totalSemesterWeeks,
        currentWeek: Math.max(1, user.currentWeek ?? 1),
        isBreak: user.isBreak,
        todayISO: getTodayISO(),
        semesterPhase: user.semesterPhase,
      }),
    [tasks, user.startDate, user.currentWeek, user.isBreak, user.semesterPhase, totalSemesterWeeks]
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

      const dbHint =
        '\n\nIf this mentions a missing table or RLS, run `supabase/migrations/006_user_courses_and_tasks.sql` in the Supabase SQL Editor.';

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
          Alert.alert('Could not save subjects', `${courseErr.message}${dbHint}`);
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
          priority: t.priority || 'Medium',
          effort_hours: Math.max(1, Math.min(20, Number(t.effort_hours) || 2)),
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
        task.priority = Object.values(Priority).includes(task.priority) ? task.priority : Priority.Medium;
        const { error: taskErr } = await taskDb.upsertTask(uid, task);
        if (taskErr) {
          Alert.alert('Could not save tasks', `${taskErr.message}${dbHint}`);
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
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Could not save extracted items.');
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
          <Text style={[styles.chipLabel, { color: theme.textSecondary }]}>Priority</Text>
          <View style={styles.chipRow}>
            {PRIORITY_OPTIONS.map((opt) => {
              const active = t.priority === opt;
              return (
                <Pressable
                  key={opt}
                  onPress={() => setTasks((prev) => prev.map((it, i) => (i === idx ? { ...it, priority: opt } : it)))}
                  style={[
                    styles.chip,
                    { borderColor: theme.border },
                    active && {
                      backgroundColor: priorityChipColor(opt) + 'cc',
                      borderColor: priorityChipColor(opt),
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? '#fff' : theme.text }]}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.half, { color: theme.text, borderColor: theme.border }]}
              value={t.due_date}
              onChangeText={(v) => setTasks((prev) => prev.map((it, i) => (i === idx ? { ...it, due_date: v } : it)))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textSecondary}
            />
            <TextInput
              style={[styles.input, styles.half, { color: theme.text, borderColor: theme.border }]}
              value={t.due_time}
              onChangeText={(v) => setTasks((prev) => prev.map((it, i) => (i === idx ? { ...it, due_time: v } : it)))}
              placeholder="HH:mm"
              placeholderTextColor={theme.textSecondary}
            />
          </View>
          <View style={styles.row}>
            <Text style={[styles.inlineLabel, { color: theme.textSecondary }]}>Effort (h)</Text>
            <TextInput
              style={[styles.input, styles.creditInput, { color: theme.text, borderColor: theme.border }]}
              value={String(t.effort_hours)}
              onChangeText={(v) => {
                const n = parseInt(v.replace(/\D/g, ''), 10);
                setTasks((prev) =>
                  prev.map((it, i) =>
                    i === idx
                      ? {
                          ...it,
                          effort_hours: Number.isFinite(n) && n > 0 ? Math.min(20, n) : it.effort_hours,
                        }
                      : it
                  )
                );
              }}
              keyboardType="number-pad"
              placeholder="2"
              placeholderTextColor={theme.textSecondary}
            />
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

