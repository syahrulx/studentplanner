import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { clearPendingSowExtraction, getPendingSowExtraction } from '@/src/lib/sowExtractionStore';
import { Priority, TaskType, type Course } from '@/src/types';
import { buildTaskFromExtraction, getSuggestedWeekForDueDate } from '@/src/lib/taskUtils';
import { getTodayISO } from '@/src/utils/date';
import { supabase } from '@/src/lib/supabase';

const DEFAULT_WORKLOAD = [2, 3, 4, 6, 5, 7, 8, 4, 6, 8, 10, 9, 10, 4];

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
  const { courses, addCourse, addTask, user } = useApp();
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

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const subjectMap = new Set(courses.map((c) => c.id.toUpperCase()));
      subjects.forEach((s) => {
        const id = s.subject_id.trim().toUpperCase();
        const name = s.name.trim();
        if (!id || !name || subjectMap.has(id)) return;
        const course: Course = {
          id,
          name,
          creditHours: Math.max(1, Number(s.credit_hours) || 3),
          workload: DEFAULT_WORKLOAD,
        };
        addCourse(course);
        subjectMap.add(id);
      });

      tasks.forEach((t) => {
        const courseId = t.course_id.trim().toUpperCase() || courses[0]?.id || 'GENERAL';
        const dueDate = normalizeDate(t.due_date);
        const extracted = {
          title: t.title.trim() || 'Task',
          course_id: courseId,
          type: t.type || 'Assignment',
          due_date: dueDate,
          due_time: (t.due_time || '23:59').slice(0, 5),
          priority: t.priority || 'Medium',
          effort_hours: Math.max(1, Math.min(20, Number(t.effort_hours) || 2)),
          notes: t.notes ?? '',
          deadline_risk: t.deadline_risk,
          suggested_week: t.suggested_week || getSuggestedWeekForDueDate(dueDate, user),
        };
        const task = buildTaskFromExtraction(extracted as any, {
          fallbackCourseId: courseId,
          user,
          sourceMessage: `Imported from SOW: ${pending.fileName}`,
        });
        task.type = Object.values(TaskType).includes(task.type) ? task.type : TaskType.Assignment;
        task.priority = Object.values(Priority).includes(task.priority) ? task.priority : Priority.Medium;
        addTask(task);
      });

      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;
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

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
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

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Subjects</Text>
      {subjects.map((s, idx) => (
        <View key={`subject-${idx}`} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
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
        </View>
      ))}

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Assignments / Tasks</Text>
      {tasks.map((t, idx) => (
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
          {!knownCourseIds.has(t.course_id.toUpperCase()) && (
            <Text style={[styles.warn, { color: '#b45309' }]}>Unknown course code: will still be saved as-is.</Text>
          )}
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
        </View>
      ))}

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
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
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
});

