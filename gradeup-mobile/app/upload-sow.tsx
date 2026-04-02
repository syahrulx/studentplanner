import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import * as DocumentPicker from 'expo-document-picker';
import { uploadSowFile, SOW_FILES_BUCKET } from '@/src/lib/sowStorage';
import { invokeExtractSow } from '@/src/lib/invokeExtractSow';
import { supabase } from '@/src/lib/supabase';
import * as coursesDb from '@/src/lib/coursesDb';
import * as taskDb from '@/src/lib/taskDb';
import { getTodayISO } from '@/src/utils/date';
import { buildTaskFromExtraction, getSuggestedWeekForDueDate } from '@/src/lib/taskUtils';
import { analyzeSowWeekAlignment } from '@/src/lib/sowCalendarAlignment';
import { Priority, TaskType, type Course } from '@/src/types';

const PAD = 20;
const SECTION = 24;
const RADIUS = 16;
const RADIUS_SM = 12;

type ExtractedSubject = {
  subject_id: string;
  name: string;
  credit_hours: number;
};

type ExtractedTask = {
  title: string;
  course_id: string;
  type: string;
  due_date: string;
  due_time: string;
  priority: string;
  effort_hours: number;
  notes: string;
  deadline_risk?: string;
  suggested_week?: number;
};

type ExtractionResult = {
  subjects: ExtractedSubject[];
  tasks: ExtractedTask[];
  importId: string;
  storagePath: string;
  fileName: string;
  rawTextPreview: string;
};

const TASK_TYPE_OPTIONS = Object.values(TaskType);
const PRIORITY_OPTIONS = Object.values(Priority);

function normalizeDateInput(value: string): string {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return getTodayISO();
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function isoToDate(iso: string): Date {
  // Use noon to avoid timezone shifting at midnight.
  return new Date(`${(iso || getTodayISO()).slice(0, 10)}T12:00:00`);
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

function formatTimeHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function UploadSOW() {
  const { courses, user, academicCalendar, addCourse, addTask, deleteCourse, tasks: existingTasks } = useApp();
  const theme = useTheme();
  const [selected, setSelected] = useState<{ name: string; uri: string; mimeType?: string | null } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const busyRef = useRef(false);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [editedSubjects, setEditedSubjects] = useState<ExtractedSubject[]>([]);
  const [editedTasks, setEditedTasks] = useState<ExtractedTask[]>([]);
  const [editingSubjectIndex, setEditingSubjectIndex] = useState<number | null>(null);
  const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null);

  // Confirm week/date before running extract_sow so dates map correctly.
  const totalSemesterWeeks = academicCalendar?.totalWeeks ?? 14;
  const defaultWeek = clampInt(Number(user.currentWeek ?? 1) || 1, 1, totalSemesterWeeks);
  const defaultToday = getTodayISO();
  const defaultSemesterStart = (academicCalendar?.startDate || user.startDate || '').slice(0, 10);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmWeekText, setConfirmWeekText] = useState(String(defaultWeek));
  const [confirmTodayText, setConfirmTodayText] = useState(defaultToday);
  const [confirmEndOfWeek, setConfirmEndOfWeek] = useState<'FRI' | 'SAT' | 'SUN'>('SUN');
  const [extractContext, setExtractContext] = useState<{ currentWeek: number; todayISO: string }>(() => ({
    currentWeek: defaultWeek,
    todayISO: defaultToday,
  }));

  const [picker, setPicker] = useState<null | { taskIndex: number; mode: 'date' | 'time'; value: Date }>(null);

  useEffect(() => {
    if (!extraction) {
      setEditedSubjects([]);
      setEditedTasks([]);
      setEditingSubjectIndex(null);
      setEditingTaskIndex(null);
      return;
    }
    setEditedSubjects(extraction.subjects.map((s) => ({ ...s })));
    setEditedTasks(extraction.tasks.map((t) => ({ ...t })));
    setEditingSubjectIndex(null);
    setEditingTaskIndex(null);
  }, [extraction]);

  const sowWeekAlignment = useMemo(
    () =>
      analyzeSowWeekAlignment(editedTasks, {
        semesterStart: user.startDate,
        totalWeeks: totalSemesterWeeks,
        currentWeek: Math.max(1, user.currentWeek ?? 1),
        periods: academicCalendar?.periods,
        isBreak: user.isBreak,
        todayISO: extractContext.todayISO,
        semesterPhase: user.semesterPhase,
      }),
    [
      editedTasks,
      user.startDate,
      user.currentWeek,
      user.isBreak,
      user.semesterPhase,
      totalSemesterWeeks,
      extractContext.todayISO,
      academicCalendar?.periods,
    ]
  );

  // known_courses is no longer sent to the AI — extraction is purely from the file

  const pickPdf = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      setSelected({ name: file.name ?? 'document.pdf', uri: file.uri, mimeType: file.mimeType });
      setExtraction(null);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not pick PDF.');
    } finally {
      busyRef.current = false;
    }
  };

  const runExtract = async (ctx: { currentWeek: number; todayISO: string }) => {
    if (isBusy || !selected) return;
    const { data: { session: initialSession } } = await supabase.auth.getSession();
    if (!initialSession?.user?.id) {
      Alert.alert('Sign in required', 'Sign in to import SOW files.');
      return;
    }
    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
    const session = !refreshErr && refreshData.session ? refreshData.session : initialSession;
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
        const supabaseUrl = (Constants.expoConfig?.extra?.supabaseUrl as string) || '';
        const msg = uploadError.message || '';
        const bucketHint =
          /bucket|not found/i.test(msg)
            ? `\n\nBucket name: "${SOW_FILES_BUCKET}"\nApp URL: ${supabaseUrl || '(not set)'}\n\nCreate the bucket in Dashboard → Storage, or set EXPO_PUBLIC_SOW_BUCKET. Restart Expo after changing .env.`
            : '';
        Alert.alert('Upload failed', msg + bucketHint);
        return;
      }

      const payload = {
        import_id: importId,
        storage_path: path,
        bucket: SOW_FILES_BUCKET,
        current_week: ctx.currentWeek,
        today_iso: ctx.todayISO,
        // Used by Edge Function to map "Week N" items and fill missing due dates.
        semester_start_iso: defaultSemesterStart,
        total_weeks: totalSemesterWeeks,
        end_of_week_day: confirmEndOfWeek,
        // Optional detailed calendar schedule (used to skip break weeks for UiTM HEA).
        periods: academicCalendar?.periods ?? null,
      };

      const { httpStatus, data } = await invokeExtractSow(payload);

      const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      const fnErr = body?.error as { message?: string; code?: string } | undefined;
      const gatewayMsg = typeof body?.message === 'string' ? body.message : '';
      const errMessage = fnErr?.message || gatewayMsg;
      const errCode =
        fnErr?.code != null ? String(fnErr.code) : body?.code != null ? String(body.code) : '';

      if (errMessage) {
        const codeSuffix = errCode ? ` (${errCode})` : '';
        const isOpenAi =
          errCode === 'OPENAI' ||
          (errCode === 'CONFIG' && /openai/i.test(errMessage)) ||
          /openai.*api key|invalid_api_key/i.test(errMessage);
        const showSupabaseJwtTip =
          !isOpenAi && (httpStatus === 401 || /Invalid JWT|jwt.*invalid|unauthoriz/i.test(errMessage));
        const supabaseTip = showSupabaseJwtTip
          ? '\n\nTip: Use the anon public JWT from Supabase → Settings → API. Set EXPO_PUBLIC_SUPABASE_KEY, then npx expo start -c.'
          : '';
        const openAiTip = isOpenAi
          ? '\n\nSet the secret on the server:\nnpx supabase secrets set OPENAI_API_KEY=sk-...'
          : '';
        Alert.alert('AI extraction failed', `${errMessage}${codeSuffix}\nHTTP ${httpStatus}${supabaseTip}${openAiTip}`);
        return;
      }

      if (httpStatus >= 400) {
        Alert.alert('AI extraction failed', `HTTP ${httpStatus}\n${JSON.stringify(data).slice(0, 600)}`);
        return;
      }

      const subjects: ExtractedSubject[] = (Array.isArray(body?.subjects) ? body.subjects : []).map((s: any) => ({
        subject_id: String(s?.subject_id ?? '').trim().toUpperCase(),
        name: String(s?.name ?? '').trim(),
        credit_hours: Number(s?.credit_hours ?? 3) || 3,
      })).filter((s: ExtractedSubject) => s.subject_id && s.name);

      const tasks: ExtractedTask[] = (Array.isArray(body?.tasks) ? body.tasks : []).map((t: any) => ({
        title: String(t?.title ?? '').trim(),
        course_id: String(t?.course_id ?? '').trim().toUpperCase(),
        type: String(t?.type ?? 'Assignment'),
        due_date: String(t?.due_date ?? '').slice(0, 10) || getTodayISO(),
        due_time: String(t?.due_time ?? '23:59').slice(0, 5) || '23:59',
        priority: String(t?.priority ?? 'Medium'),
        effort_hours: Math.max(1, Math.min(20, Number(t?.effort_hours ?? 2) || 2)),
        notes: String(t?.notes ?? ''),
        deadline_risk: t?.deadline_risk,
        suggested_week: Number(t?.suggested_week ?? 0) || getSuggestedWeekForDueDate(
          String(t?.due_date ?? '').slice(0, 10) || getTodayISO(),
          user,
          academicCalendar?.startDate,
        ),
      })).filter((t: ExtractedTask) => t.title);

      if (subjects.length === 0 && tasks.length === 0) {
        Alert.alert(
          'Nothing extracted',
          'The AI could not find any subjects or tasks in this PDF. The file might be scanned (image-only) or heavily compressed. Try exporting it from Word or Google Docs as text-based PDF.'
        );
        return;
      }

      setExtraction({
        subjects,
        tasks,
        importId,
        storagePath: path,
        fileName: selected.name,
        rawTextPreview: typeof body?.raw_text_preview === 'string' ? body.raw_text_preview : '',
      });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Extraction failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const openTaskPicker = (taskIndex: number, mode: 'date' | 'time') => {
    const t = editedTasks[taskIndex];
    if (!t) return;
    setPicker({ taskIndex, mode, value: dueDateTimeToDate(t.due_date, t.due_time) });
  };

  const onPickerChange = (_event: unknown, selected?: Date) => {
    if (!picker) return;
    // On Android, dismiss fires with undefined selected.
    if (!selected) {
      setPicker(null);
      return;
    }
    const idx = picker.taskIndex;
    if (picker.mode === 'date') {
      const nextISO = formatISODate(selected);
      setEditedTasks((prev) => prev.map((row, j) => (j === idx ? { ...row, due_date: nextISO } : row)));
    } else {
      const nextTime = formatTimeHM(selected);
      setEditedTasks((prev) => prev.map((row, j) => (j === idx ? { ...row, due_time: nextTime } : row)));
    }
    // Keep it simple: close after selection on all platforms.
    setPicker(null);
  };

  const startExtract = () => {
    if (isBusy || !selected) return;
    // Reset defaults each time the user extracts.
    const nextDefaultWeek = clampInt(Number(user.currentWeek ?? 1) || 1, 1, totalSemesterWeeks);
    const nextDefaultToday = getTodayISO();
    setConfirmWeekText(String(nextDefaultWeek));
    setConfirmTodayText(nextDefaultToday);
    setConfirmEndOfWeek('SUN');
    setConfirmOpen(true);
  };

  const confirmAndExtract = async () => {
    const weekNum = clampInt(parseInt(confirmWeekText, 10) || 1, 1, totalSemesterWeeks);
    const todayISO = normalizeDateInput(confirmTodayText);
    setConfirmOpen(false);
    const ctx = { currentWeek: weekNum, todayISO };
    setExtractContext(ctx);
    await runExtract(ctx);
  };

  const performSowSave = async () => {
    if (isSaving || !extraction) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      Alert.alert('Sign in required', 'Sign in to save.');
      return;
    }
    setIsSaving(true);
    const uid = session.user.id;
    const dbHint =
      '\n\nIf this mentions a missing table or RLS, run supabase/migrations/006_user_courses_and_tasks.sql in the Supabase SQL Editor.';

    try {
      const subjectMap = new Set(courses.map((c) => c.id.toUpperCase()));
      const defaultWorkload = [2, 3, 4, 6, 5, 7, 8, 4, 6, 8, 10, 9, 10, 4];
      let createdSubjectCount = 0;

      for (const s of editedSubjects) {
        const id = s.subject_id.trim().toUpperCase();
        const name = s.name.trim();
        if (!id || !name || subjectMap.has(id)) continue;
        const course: Course = {
          id,
          name,
          creditHours: Math.max(1, Math.min(30, Number(s.credit_hours) || 3)),
          workload: defaultWorkload,
        };
        const { error: courseErr } = await coursesDb.addCourse(uid, course);
        if (courseErr) {
          Alert.alert('Could not save subjects', `${courseErr.message}${dbHint}`);
          return;
        }
        addCourse(course, { skipRemote: true });
        subjectMap.add(id);
        createdSubjectCount++;
      }

      let createdTaskCount = 0;
      for (const t of editedTasks) {
        const title = t.title.trim();
        if (!title) continue;
        const courseId = t.course_id.trim().toUpperCase() || courses[0]?.id || 'GENERAL';
        const dueDate = normalizeDateInput(t.due_date);
        const task = buildTaskFromExtraction(
          {
            title,
            course_id: courseId,
            type: t.type,
            due_date: dueDate,
            due_time: (t.due_time || '23:59').slice(0, 5),
            priority: t.priority,
            effort_hours: Math.max(1, Math.min(20, Number(t.effort_hours) || 2)),
            notes: t.notes ?? '',
            deadline_risk: t.deadline_risk,
            suggested_week: getSuggestedWeekForDueDate(dueDate, user, academicCalendar?.startDate),
          } as any,
          {
            fallbackCourseId: courseId,
            user,
            calendarStart: academicCalendar?.startDate,
            sourceMessage: `Imported from SOW: ${extraction.fileName}`,
          }
        );
        task.type = Object.values(TaskType).includes(task.type) ? task.type : TaskType.Assignment;
        task.priority = Object.values(Priority).includes(task.priority) ? task.priority : Priority.Medium;
        const { error: taskErr } = await taskDb.upsertTask(uid, task);
        if (taskErr) {
          Alert.alert('Could not save tasks', `${taskErr.message}${dbHint}`);
          return;
        }
        addTask(task, { skipRemote: true });
        createdTaskCount++;
      }

      await supabase.from('sow_imports').upsert(
        {
          id: extraction.importId,
          user_id: uid,
          file_name: extraction.fileName,
          storage_path: extraction.storagePath,
          status: 'saved',
          extracted_summary: {
            subject_count: createdSubjectCount,
            task_count: createdTaskCount,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id,user_id' }
      );

      const duplicateSubjectsSkipped = editedSubjects.filter((s) => {
        const id = s.subject_id.trim().toUpperCase();
        const name = s.name.trim();
        return id && name && courses.some((c) => c.id.toUpperCase() === id);
      }).length;
      const dupNote =
        duplicateSubjectsSkipped > 0 ? ` (${duplicateSubjectsSkipped} subject(s) already in planner, skipped)` : '';
      Alert.alert(
        'Import complete',
        `Saved ${createdSubjectCount} subject(s) and ${createdTaskCount} task(s) to your account.${dupNote}`,
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/planner' as any) }]
      );
      setExtraction(null);
      setSelected(null);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmSave = () => {
    if (isSaving || !extraction) return;
    if (sowWeekAlignment.hasIssues) {
      Alert.alert(
        'Semester weeks out of sync',
        `${sowWeekAlignment.message}\n\nYou can edit due dates above, update Academic Calendar / Stress Map, or still save — Semester Pulse uses your calendar week, not the PDF.`,
        [
          { text: 'Review', style: 'cancel' },
          { text: 'Save anyway', onPress: () => void performSowSave() },
        ]
      );
      return;
    }
    void performSowSave();
  };

  const handleDeleteCourse = (courseId: string, courseName: string) => {
    Alert.alert(
      'Delete Subject',
      `Are you sure you want to delete "${courseId} – ${courseName}"?\n\nThis will also remove all tasks linked to this subject.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirm Delete',
              `This action cannot be undone. Permanently delete "${courseId}" and all its tasks?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete',
                  style: 'destructive',
                  onPress: () => deleteCourse(courseId),
                },
              ]
            );
          },
        },
      ]
    );
  };

  const priorityColor = (p: string) => {
    if (p === 'High') return '#ef4444';
    if (p === 'Medium') return '#f59e0b';
    return '#22c55e';
  };

  const typeIcon = (t: string): React.ComponentProps<typeof Feather>['name'] => {
    switch (t) {
      case 'Quiz': return 'help-circle';
      case 'Project': return 'layers';
      case 'Lab': return 'cpu';
      case 'Test': return 'edit-3';
      default: return 'file-text';
    }
  };

  const plannerCourseIds = useMemo(() => new Set(courses.map((c) => c.id.toUpperCase())), [courses]);
  const editedSubjectIdSet = useMemo(
    () => new Set(editedSubjects.map((s) => s.subject_id.trim().toUpperCase()).filter(Boolean)),
    [editedSubjects]
  );

  const confirmRemoveSubjectFromImport = (index: number, row: ExtractedSubject) => {
    const code = row.subject_id.trim().toUpperCase();
    const label = code ? `${code} – ${row.name.trim() || 'Unnamed'}` : row.name.trim() || 'This subject';
    const linked = code
      ? editedTasks.filter((t) => t.course_id.trim().toUpperCase() === code).length
      : 0;
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
          setEditedSubjects((prev) => prev.filter((_, j) => j !== index));
          setEditingSubjectIndex((cur) =>
            cur === index ? null : cur !== null && cur > index ? cur - 1 : cur
          );
          if (code) {
            setEditedTasks((prev) => prev.filter((t) => t.course_id.trim().toUpperCase() !== code));
          }
          setEditingTaskIndex(null);
        },
      },
    ]);
  };

  const confirmRemoveTaskFromImport = (index: number, title: string) => {
    const trimmed = title.trim() || 'This task';
    Alert.alert('Remove task', `Remove "${trimmed}" from this import?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setEditedTasks((prev) => prev.filter((_, j) => j !== index));
          setEditingTaskIndex((cur) =>
            cur === index ? null : cur !== null && cur > index ? cur - 1 : cur
          );
        },
      },
    ]);
  };

  const toggleSubjectEdit = (i: number) => {
    setEditingTaskIndex(null);
    setEditingSubjectIndex((x) => (x === i ? null : i));
  };

  const toggleTaskEdit = (i: number) => {
    setEditingSubjectIndex(null);
    setEditingTaskIndex((x) => (x === i ? null : i));
  };

  // ---------- EXTRACTION REVIEW VIEW ----------
  if (extraction) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => setExtraction(null)}
            style={({ pressed }) => [styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]}
          >
            <Feather name="arrow-left" size={22} color={theme.text} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.title, { color: theme.text }]}>Scheme Of Work</Text>
          </View>
        </View>

        {sowWeekAlignment.hasIssues ? (
          <View
            style={[
              styles.weekSyncBanner,
              { backgroundColor: theme.warning + '22', borderColor: theme.warning },
            ]}
          >
            <Feather
              name="alert-triangle"
              size={18}
              color={theme.warning}
              style={{ marginRight: 10, marginTop: 2 }}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.weekSyncBannerTitle, { color: theme.warning }]}>Calendar / SOW mismatch</Text>
              <Text style={[styles.weekSyncBannerBody, { color: theme.textSecondary }]}>
                Semester Pulse shows week {user.isBreak ? 'break' : user.currentWeek} of {totalSemesterWeeks}. Some
                imported dates or week hints don’t line up — saving will show which weeks are affected.
              </Text>
            </View>
          </View>
        ) : null}

        {/* SUBJECTS */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
          EXTRACTED SUBJECTS ({editedSubjects.length})
        </Text>
        {editedSubjects.length === 0 ? (
          <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>No subjects found in this file.</Text>
        ) : (
          editedSubjects.map((s, i) => {
            const idUp = s.subject_id.trim().toUpperCase();
            const isDuplicate = idUp.length > 0 && plannerCourseIds.has(idUp);
            const subjectExpanded = editingSubjectIndex === i;
            return (
              <View
                key={`subject-edit-${i}`}
                style={[
                  styles.extractCard,
                  {
                    borderColor: isDuplicate ? '#fbbf24' : '#86efac',
                    backgroundColor: theme.card,
                  },
                ]}
              >
                <View style={styles.reviewCardTopRow}>
                  <View style={[styles.codePill, { backgroundColor: theme.primary }]}>
                    <Text style={styles.codePillText}>{idUp || '—'}</Text>
                  </View>
                  <View style={styles.subjectCardBody}>
                    {subjectExpanded ? (
                      <Text style={[styles.reviewCollapsedHint, { color: theme.textSecondary }]}>Editing…</Text>
                    ) : (
                      <>
                        <Text style={[styles.subjectName, { color: theme.text }]} numberOfLines={2}>
                          {s.name.trim() || 'Unnamed subject'}
                        </Text>
                        <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                          {s.credit_hours} credit hours
                        </Text>
                      </>
                    )}
                    {isDuplicate && !subjectExpanded ? (
                      <Text style={[styles.warnLine, { color: '#b45309', marginTop: 4 }]}>
                        Already in planner — skipped on save
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.cardActions}>
                    <Pressable
                      accessibilityLabel={subjectExpanded ? 'Close subject editor' : 'Edit subject'}
                      onPress={() => toggleSubjectEdit(i)}
                      style={({ pressed }) => [styles.cardActionBtn, pressed && { opacity: 0.65 }]}
                    >
                      <Feather
                        name="edit-2"
                        size={18}
                        color={subjectExpanded ? theme.primary : theme.textSecondary}
                      />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Remove subject"
                      onPress={() => confirmRemoveSubjectFromImport(i, s)}
                      style={({ pressed }) => [styles.cardActionBtn, pressed && { opacity: 0.65 }]}
                    >
                      <Feather name="trash-2" size={18} color={theme.danger} />
                    </Pressable>
                  </View>
                </View>
                {subjectExpanded ? (
                  <View style={[styles.reviewEditorBlock, { borderTopColor: theme.border }]}>
                    <View style={styles.editRow}>
                      <TextInput
                        style={[
                          styles.editInput,
                          styles.editInputCode,
                          { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                        ]}
                        value={s.subject_id}
                        onChangeText={(v) =>
                          setEditedSubjects((prev) =>
                            prev.map((row, j) => (j === i ? { ...row, subject_id: v.toUpperCase() } : row))
                          )
                        }
                        placeholder="Code"
                        placeholderTextColor={theme.textSecondary}
                        autoCapitalize="characters"
                      />
                      <TextInput
                        style={[
                          styles.editInput,
                          { flex: 1, color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                        ]}
                        value={s.name}
                        onChangeText={(v) =>
                          setEditedSubjects((prev) => prev.map((row, j) => (j === i ? { ...row, name: v } : row)))
                        }
                        placeholder="Subject name"
                        placeholderTextColor={theme.textSecondary}
                      />
                    </View>
                    <View style={styles.editRow}>
                      <Text style={[styles.editLabel, { color: theme.textSecondary }]}>Credits</Text>
                      <TextInput
                        style={[
                          styles.editInput,
                          styles.editInputNarrow,
                          { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                        ]}
                        value={String(s.credit_hours)}
                        onChangeText={(v) => {
                          const n = parseInt(v.replace(/\D/g, ''), 10);
                          setEditedSubjects((prev) =>
                            prev.map((row, j) =>
                              j === i
                                ? {
                                    ...row,
                                    credit_hours: Number.isFinite(n) && n > 0 ? Math.min(30, n) : row.credit_hours,
                                  }
                                : row
                            )
                          );
                        }}
                        keyboardType="number-pad"
                        placeholder="3"
                        placeholderTextColor={theme.textSecondary}
                      />
                    </View>
                    {isDuplicate ? (
                      <Text style={[styles.warnLine, { color: '#b45309' }]}>
                        Already in your planner — this row will be skipped on save.
                      </Text>
                    ) : null}
                    <Pressable
                      onPress={() => setEditingSubjectIndex(null)}
                      style={({ pressed }) => [styles.reviewDoneBtn, pressed && { opacity: 0.75 }]}
                    >
                      <Text style={[styles.reviewDoneBtnText, { color: theme.primary }]}>Done</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        )}

        {/* TASKS */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: SECTION }]}>
          EXTRACTED TASKS ({editedTasks.length})
        </Text>
        {editedTasks.length === 0 ? (
          <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>
            No tasks found in this file. The AI may not have detected due dates.
          </Text>
        ) : (
          editedTasks.map((t, i) => {
            const cid = t.course_id.trim().toUpperCase();
            const unknownCourse =
              cid.length > 0 && !plannerCourseIds.has(cid) && !editedSubjectIdSet.has(cid);
            const taskExpanded = editingTaskIndex === i;
            const priColor = priorityColor(t.priority);
            return (
              <View
                key={`task-edit-${i}`}
                style={[styles.extractCard, { borderColor: theme.border, backgroundColor: theme.card }]}
              >
                <View style={styles.reviewCardTopRow}>
                  <View style={[styles.typeIconWrap, { backgroundColor: theme.primary + '18' }]}>
                    <Feather name={typeIcon(t.type)} size={16} color={theme.primary} />
                  </View>
                  <View style={styles.reviewTaskBody}>
                    {!taskExpanded ? (
                      <>
                        <Text style={[styles.taskTitle, { color: theme.text }]} numberOfLines={3}>
                          {t.title.trim() || 'Untitled task'}
                        </Text>
                        <View style={styles.taskMeta}>
                          <View style={[styles.taskMetaPill, { backgroundColor: '#f1f5f9' }]}>
                            <Feather name="book-open" size={11} color={theme.textSecondary} />
                            <Text style={[styles.taskMetaText, { color: theme.textSecondary }]}>{cid || '—'}</Text>
                          </View>
                          <View style={[styles.taskMetaPill, { backgroundColor: '#f1f5f9' }]}>
                            <Feather name="tag" size={11} color={theme.textSecondary} />
                            <Text style={[styles.taskMetaText, { color: theme.textSecondary }]}>{t.type}</Text>
                          </View>
                          <View style={[styles.taskMetaPill, { backgroundColor: priColor + '22' }]}>
                            <Feather name="alert-circle" size={11} color={priColor} />
                            <Text style={[styles.taskMetaText, { color: priColor }]}>{t.priority}</Text>
                          </View>
                        </View>
                        <View style={styles.taskDateRow}>
                          <Feather name="calendar" size={12} color={theme.textSecondary} />
                          <Text style={[styles.taskDateText, { color: theme.text }]}>{t.due_date}</Text>
                          <Feather name="clock" size={12} color={theme.textSecondary} style={{ marginLeft: 10 }} />
                          <Text style={[styles.taskDateText, { color: theme.text }]}>{t.due_time}</Text>
                          <Text style={[styles.taskDateText, { color: theme.textSecondary, marginLeft: 10 }]}>
                            ~{t.effort_hours}h effort
                          </Text>
                        </View>
                        {t.notes?.trim() ? (
                          <Text style={[styles.taskNotes, { color: theme.textSecondary }]} numberOfLines={4}>
                            {t.notes}
                          </Text>
                        ) : null}
                        {unknownCourse ? (
                          <Text style={[styles.warnLine, { color: '#b45309', marginTop: 6 }]}>
                            Code not in subjects or planner — still saves with this code.
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <Text style={[styles.reviewCollapsedHint, { color: theme.textSecondary }]}>Editing…</Text>
                    )}
                  </View>
                  <View style={styles.cardActions}>
                    <Pressable
                      accessibilityLabel={taskExpanded ? 'Close task editor' : 'Edit task'}
                      onPress={() => toggleTaskEdit(i)}
                      style={({ pressed }) => [styles.cardActionBtn, pressed && { opacity: 0.65 }]}
                    >
                      <Feather
                        name="edit-2"
                        size={18}
                        color={taskExpanded ? theme.primary : theme.textSecondary}
                      />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Remove task"
                      onPress={() => confirmRemoveTaskFromImport(i, t.title)}
                      style={({ pressed }) => [styles.cardActionBtn, pressed && { opacity: 0.65 }]}
                    >
                      <Feather name="trash-2" size={18} color={theme.danger} />
                    </Pressable>
                  </View>
                </View>
                {taskExpanded ? (
                  <View style={[styles.reviewEditorBlock, { borderTopColor: theme.border }]}>
                    <TextInput
                      style={[
                        styles.editInput,
                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      value={t.title}
                      onChangeText={(v) =>
                        setEditedTasks((prev) => prev.map((row, j) => (j === i ? { ...row, title: v } : row)))
                      }
                      placeholder="Task title"
                      placeholderTextColor={theme.textSecondary}
                    />
                    <TextInput
                      style={[
                        styles.editInput,
                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      value={t.course_id}
                      onChangeText={(v) =>
                        setEditedTasks((prev) => prev.map((row, j) => (j === i ? { ...row, course_id: v.toUpperCase() } : row)))
                      }
                      placeholder="Course code"
                      placeholderTextColor={theme.textSecondary}
                      autoCapitalize="characters"
                    />
                    {unknownCourse ? (
                      <Text style={[styles.warnLine, { color: '#b45309' }]}>
                        Code not in subjects above or your planner — task still saves with this code.
                      </Text>
                    ) : null}
                    <Text style={[styles.chipGroupLabel, { color: theme.textSecondary }]}>Type</Text>
                    <View style={styles.chipWrap}>
                      {TASK_TYPE_OPTIONS.map((opt) => {
                        const active = t.type === opt;
                        return (
                          <Pressable
                            key={opt}
                            onPress={() =>
                              setEditedTasks((prev) => prev.map((row, j) => (j === i ? { ...row, type: opt } : row)))
                            }
                            style={[
                              styles.typeChip,
                              { borderColor: theme.border },
                              active && { backgroundColor: theme.primary, borderColor: theme.primary },
                            ]}
                          >
                            <Text style={[styles.typeChipText, { color: active ? '#fff' : theme.text }]}>{opt}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={[styles.chipGroupLabel, { color: theme.textSecondary }]}>Priority</Text>
                    <View style={styles.chipWrap}>
                      {PRIORITY_OPTIONS.map((opt) => {
                        const active = t.priority === opt;
                        return (
                          <Pressable
                            key={opt}
                            onPress={() =>
                              setEditedTasks((prev) => prev.map((row, j) => (j === i ? { ...row, priority: opt } : row)))
                            }
                            style={[
                              styles.typeChip,
                              { borderColor: theme.border },
                              active && {
                                backgroundColor: priorityColor(opt) + 'cc',
                                borderColor: priorityColor(opt),
                              },
                            ]}
                          >
                            <Text style={[styles.typeChipText, { color: active ? '#fff' : theme.text }]}>{opt}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={styles.editRow}>
                      <Pressable
                        onPress={() => openTaskPicker(i, 'date')}
                        style={({ pressed }) => [
                          styles.pickerField,
                          styles.halfGrow,
                          { borderColor: theme.border, backgroundColor: theme.background },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Feather name="calendar" size={14} color={theme.textSecondary} />
                        <Text style={[styles.pickerFieldText, { color: theme.text }]}>{t.due_date}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => openTaskPicker(i, 'time')}
                        style={({ pressed }) => [
                          styles.pickerField,
                          styles.halfGrow,
                          { borderColor: theme.border, backgroundColor: theme.background },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Feather name="clock" size={14} color={theme.textSecondary} />
                        <Text style={[styles.pickerFieldText, { color: theme.text }]}>{t.due_time}</Text>
                      </Pressable>
                    </View>
                    <View style={styles.editRow}>
                      <Text style={[styles.editLabel, { color: theme.textSecondary }]}>Effort (h)</Text>
                      <TextInput
                        style={[
                          styles.editInput,
                          styles.editInputNarrow,
                          { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                        ]}
                        value={String(t.effort_hours)}
                        onChangeText={(v) => {
                          const n = parseInt(v.replace(/\D/g, ''), 10);
                          setEditedTasks((prev) =>
                            prev.map((row, j) =>
                              j === i
                                ? {
                                    ...row,
                                    effort_hours: Number.isFinite(n) && n > 0 ? Math.min(20, n) : row.effort_hours,
                                  }
                                : row
                            )
                          );
                        }}
                        keyboardType="number-pad"
                        placeholder="2"
                        placeholderTextColor={theme.textSecondary}
                      />
                    </View>
                    <TextInput
                      style={[
                        styles.editInput,
                        styles.notesInput,
                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      value={t.notes}
                      onChangeText={(v) =>
                        setEditedTasks((prev) => prev.map((row, j) => (j === i ? { ...row, notes: v } : row)))
                      }
                      placeholder="Notes (optional)"
                      placeholderTextColor={theme.textSecondary}
                      multiline
                    />
                    <Pressable
                      onPress={() => setEditingTaskIndex(null)}
                      style={({ pressed }) => [styles.reviewDoneBtn, pressed && { opacity: 0.75 }]}
                    >
                      <Text style={[styles.reviewDoneBtnText, { color: theme.primary }]}>Done</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        )}

        {/* SAVE BUTTON */}
        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: theme.primary },
            isSaving && { opacity: 0.55 },
            pressed && styles.pressed,
          ]}
          onPress={confirmSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <ActivityIndicator size="small" color={theme.textInverse} />
              <Text style={[styles.saveBtnText, { color: theme.textInverse }]}>Saving...</Text>
            </>
          ) : (
            <>
              <Feather name="check" size={20} color={theme.textInverse} />
              <Text style={[styles.saveBtnText, { color: theme.textInverse }]}>
                Confirm & Save to My Account
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
          onPress={() => setExtraction(null)}
        >
          <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Discard & Pick Another File</Text>
        </Pressable>

      {picker ? (
        Platform.OS === 'ios' ? (
          <Modal transparent animationType="fade" visible onRequestClose={() => setPicker(null)}>
            <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)}>
              <View
                style={[styles.datePickerPanel, { backgroundColor: theme.card, borderColor: theme.border }]}
                onStartShouldSetResponder={() => true}
              >
                <Text style={[styles.datePickerTitle, { color: theme.text }]}>
                  {picker.mode === 'date' ? 'Pick due date' : 'Pick due time'}
                </Text>
                <DateTimePicker
                  value={picker.value}
                  mode={picker.mode}
                  display="spinner"
                  onChange={(_e, d) => onPickerChange(_e, d ?? undefined)}
                  is24Hour
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.datePickerDone,
                    { backgroundColor: theme.primary },
                    pressed && { opacity: 0.9 },
                  ]}
                  onPress={() => setPicker(null)}
                >
                  <Text style={[styles.datePickerDoneText, { color: theme.textInverse }]}>Done</Text>
                </Pressable>
              </View>
            </Pressable>
          </Modal>
        ) : (
          <DateTimePicker value={picker.value} mode={picker.mode} onChange={onPickerChange as any} is24Hour />
        )
      ) : null}

        <View style={{ height: 48 }} />
      </ScrollView>
    );
  }

  // ---------- DEFAULT / PICK FILE VIEW ----------
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
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
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>AI WILL AUTO-GENERATE WORKLOAD</Text>
        </View>
      </View>

      {/* How it works */}
      <View style={[styles.howItWorks, { backgroundColor: theme.focusCard, borderColor: theme.border }]}>
        <View style={[styles.howIconWrap, { backgroundColor: theme.primary + '20' }]}>
          <Feather name="upload" size={22} color={theme.primary} />
        </View>
        <View style={styles.howBody}>
          <Text style={[styles.howTitle, { color: theme.primary }]}>How it works</Text>
          <Text style={[styles.howDesc, { color: theme.text }]}>
            1. Choose a SOW PDF file{'\n'}
            2. AI extracts subjects and tasks with due dates{'\n'}
            3. Review and edit any details{'\n'}
            4. Confirm to save to your planner
          </Text>
        </View>
      </View>

      {/* YOUR SUBJECTS */}
      {courses.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            YOUR SUBJECTS ({courses.length})
          </Text>
      <View style={styles.subjectList}>
            {courses.map((course) => {
              const taskCount = existingTasks.filter(
                (t) => t.courseId.toUpperCase() === course.id.toUpperCase()
              ).length;
              return (
          <View key={course.id} style={[styles.subjectCard, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
            <View style={styles.subjectCardTop}>
              <View style={[styles.codePill, { backgroundColor: theme.primary }]}>
                <Text style={styles.codePillText}>{course.id}</Text>
              </View>
              <View style={styles.subjectCardBody}>
                      <Text style={[styles.subjectName, { color: theme.text }]} numberOfLines={2}>
                        {course.name}
                      </Text>
                      <Text style={[styles.statusText, { color: theme.textSecondary }]}>
                        {taskCount} task{taskCount !== 1 ? 's' : ''} • {course.creditHours} credits
                      </Text>
              </View>
                    <Pressable
                      style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
                      onPress={() => handleDeleteCourse(course.id, course.name)}
                    >
                      <Feather name="trash-2" size={18} color={theme.danger} />
                    </Pressable>
              </View>
            </View>
              );
            })}
          </View>
        </>
      )}

      {/* PICK FILE */}
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

      {/* ANALYZE */}
      <Pressable
        style={({ pressed }) => [
          styles.saveBtn,
          { backgroundColor: theme.primary },
          (isBusy || !selected) && { opacity: 0.55 },
          pressed && styles.pressed,
        ]}
        onPress={startExtract}
        disabled={isBusy || !selected}
      >
        {isBusy ? (
          <>
            <ActivityIndicator size="small" color={theme.textInverse} />
            <Text style={[styles.saveBtnText, { color: theme.textInverse }]}>Analyzing PDF...</Text>
          </>
        ) : (
          <>
            <Feather name="cpu" size={20} color={theme.textInverse} />
            <Text style={[styles.saveBtnText, { color: theme.textInverse }]}>Extract Subjects & Tasks</Text>
          </>
        )}
      </Pressable>

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setConfirmOpen(false)}
        >
          <View
            style={[styles.modalPanel, { backgroundColor: theme.card, borderColor: theme.border }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Confirm week & date</Text>
              <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
                This helps the AI map SOW dates into the correct semester week and prevents wrong task deadlines.
              </Text>
            </View>

            <View style={styles.modalRow}>
              <View style={styles.modalField}>
                <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>Current week</Text>
                <TextInput
                  value={confirmWeekText}
                  onChangeText={setConfirmWeekText}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.modalInput,
                    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                />
                <Text style={[styles.modalHint, { color: theme.textSecondary }]}>
                  App: week {user.isBreak ? 'break' : user.currentWeek} / {totalSemesterWeeks}
                </Text>
              </View>

              <View style={styles.modalField}>
                <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>Today (YYYY-MM-DD)</Text>
                <TextInput
                  value={confirmTodayText}
                  onChangeText={setConfirmTodayText}
                  autoCapitalize="none"
                  placeholder="2026-04-02"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.modalInput,
                    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                />
                <Text style={[styles.modalHint, { color: theme.textSecondary }]}>Default: {defaultToday}</Text>
              </View>
            </View>

            <View style={{ marginTop: 6 }}>
              <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                If PDF has no date, set due date to end of week
              </Text>
              <View style={styles.eowRow}>
                {(['FRI', 'SAT', 'SUN'] as const).map((d) => {
                  const active = confirmEndOfWeek === d;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setConfirmEndOfWeek(d)}
                      style={({ pressed }) => [
                        styles.eowChip,
                        { borderColor: theme.border, backgroundColor: theme.background },
                        active && { backgroundColor: theme.primary, borderColor: theme.primary },
                        pressed && { opacity: 0.9 },
                      ]}
                    >
                      <Text style={[styles.eowChipText, { color: active ? theme.textInverse : theme.text }]}>
                        {d}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.modalHint, { color: theme.textSecondary }]}>
                Applies only when the PDF doesn’t state a date.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  { backgroundColor: theme.background, borderColor: theme.border },
                  pressed && { opacity: 0.9 },
                ]}
                onPress={() => setConfirmOpen(false)}
              >
                <Text style={[styles.modalBtnText, { color: theme.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalPrimaryBtn,
                  { backgroundColor: theme.primary, borderColor: theme.primary },
                  pressed && { opacity: 0.9 },
                ]}
                onPress={() => void confirmAndExtract()}
              >
                <Text style={[styles.modalBtnText, { color: theme.textInverse }]}>Confirm & Extract</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

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
  howDesc: { fontSize: 14, lineHeight: 22 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 14 },
  subjectList: { gap: 12, marginBottom: 8 },
  subjectCard: {
    borderRadius: RADIUS_SM,
    padding: 16,
    borderWidth: 1,
  },
  subjectCardTop: { flexDirection: 'row', alignItems: 'center' },
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
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 12,
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.96 },
  extractCard: {
    borderRadius: RADIUS_SM,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  extractCardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  metaText: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  emptyHint: { fontSize: 13, fontWeight: '500', fontStyle: 'italic', marginBottom: 12 },
  typeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskTitle: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  taskMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  taskMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  taskMetaText: { fontSize: 11, fontWeight: '700' },
  taskDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  taskDateText: { fontSize: 12, fontWeight: '600' },
  taskNotes: { fontSize: 12, marginTop: 6, lineHeight: 18 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' },
  editInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    marginBottom: 0,
  },
  editInputCode: { width: 100, minWidth: 88 },
  editInputNarrow: { width: 72, minWidth: 64 },
  halfGrow: { flex: 1, minWidth: 120 },
  editLabel: { fontSize: 12, fontWeight: '700', width: 72 },
  warnLine: { fontSize: 12, fontWeight: '600', marginTop: 4, marginBottom: 4 },
  chipGroupLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 6, marginBottom: 6 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 11, fontWeight: '800' },
  notesInput: { minHeight: 56, textAlignVertical: 'top', marginTop: 6 },
  reviewCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reviewTaskBody: { flex: 1, minWidth: 0 },
  cardActions: { flexDirection: 'row', alignItems: 'flex-start', gap: 2, paddingTop: 2 },
  cardActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewEditorBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reviewCollapsedHint: { fontSize: 12, fontWeight: '600', fontStyle: 'italic' },
  reviewDoneBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  reviewDoneBtnText: { fontSize: 15, fontWeight: '800' },
  weekSyncBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: RADIUS_SM,
    borderWidth: 1,
    marginBottom: SECTION - 4,
  },
  weekSyncBannerTitle: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  weekSyncBannerBody: { fontSize: 12, lineHeight: 17, fontWeight: '600' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 20,
    justifyContent: 'center',
  },
  modalPanel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  modalHeader: { marginBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.2 },
  modalSub: { fontSize: 13, fontWeight: '600', marginTop: 6, lineHeight: 18 },
  modalRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  modalField: { flex: 1, minWidth: 160 },
  modalLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8, marginTop: 8 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '700',
  },
  modalHint: { fontSize: 11, fontWeight: '600', marginTop: 6 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryBtn: { flex: 1.4 },
  modalBtnText: { fontSize: 13, fontWeight: '900' },
  eowRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  eowChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eowChipText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.2 },

  pickerField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  pickerFieldText: { fontSize: 14, fontWeight: '700' },
  datePickerPanel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  datePickerTitle: { fontSize: 14, fontWeight: '900', marginBottom: 8, letterSpacing: -0.2 },
  datePickerDone: { marginTop: 10, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  datePickerDoneText: { fontSize: 13, fontWeight: '900' },
});
