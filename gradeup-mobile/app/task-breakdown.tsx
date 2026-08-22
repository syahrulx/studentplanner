import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { estimateTaskMinutes, recordStudyRecommendationFeedback } from '@/src/lib/studyRecommendations';
import { clampStepDate, daysBetweenISO, maxStepDate, stepsNeedSpreading, suggestStepDates } from '@/src/lib/breakdownSchedule';
import { getTodayISO } from '@/src/utils/date';

type DraftStep = { id: string; title: string; existing: boolean; dueDate: string };

/** "Sat 22 Aug" — short enough for the inline chip on a step row. */
function shortDateLabel(iso: string, todayISO: string): string {
  const clean = (iso ?? '').slice(0, 10);
  if (clean === todayISO) return 'Today';
  const date = new Date(`${clean}T12:00:00`);
  if (Number.isNaN(date.getTime())) return clean;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

function draftId(index: number): string {
  return `draft_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function TaskBreakdownScreen() {
  const theme = useTheme();
  const { tasks, user, addTask, updateTask, deleteTask } = useApp();
  const params = useLocalSearchParams<{
    taskId?: string;
    suggestedCount?: string;
    recommendationKey?: string;
    ruleId?: string;
    shownForDate?: string;
  }>();
  const parent = tasks.find((task) => task.id === params.taskId && !task.parentTaskId);
  const existingSteps = useMemo(
    () => tasks
      .filter((task) => task.parentTaskId === params.taskId)
      .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0)),
    [tasks, params.taskId],
  );
  const suggestedCount = Math.max(2, Math.min(5, Number(params.suggestedCount) || 3));
  const todayISO = getTodayISO();
  // `parent` may be undefined here; the not-found guard runs below, after all
  // hooks, so this initialiser has to tolerate it.
  const parentDue = (parent?.dueDate ?? todayISO).slice(0, 10);
  const [steps, setSteps] = useState<DraftStep[]>(() => {
    if (existingSteps.length > 0) {
      return existingSteps.map((step) => ({
        id: step.id,
        title: step.title,
        existing: true,
        dueDate: clampStepDate((step.dueDate || parentDue).slice(0, 10), parentDue, todayISO),
      }));
    }
    const dates = suggestStepDates(suggestedCount, parentDue, todayISO);
    return Array.from({ length: suggestedCount }, (_, index) => ({
      id: draftId(index),
      title: '',
      existing: false,
      dueDate: dates[index] ?? parentDue,
    }));
  });
  const [saving, setSaving] = useState(false);
  // Once the user picks a date by hand, stop re-spreading behind their back
  // when steps are added or removed.
  const [datesTouched, setDatesTouched] = useState(false);
  const [pickerStepId, setPickerStepId] = useState<string | null>(null);

  /**
   * Old breakdowns (made before step scheduling) have every step on the
   * parent's date. Only offer the fix when it would actually change something
   * — an overdue task has no runway to spread across, so every step legally
   * clamps to the due date and the button would be a no-op.
   */
  const canOfferSpread = useMemo(() => {
    if (!stepsNeedSpreading(steps, parentDue)) return false;
    const suggested = suggestStepDates(steps.length, parentDue, todayISO);
    return suggested.some((date, index) => date !== steps[index]?.dueDate);
  }, [steps, parentDue, todayISO]);

  /**
   * Whether any days exist between today and the deadline to spread across.
   * Due today or tomorrow leaves nothing to spread, and the footnote must not
   * claim otherwise when every chip visibly shows the deadline itself.
   */
  const hasRunway = daysBetweenISO(todayISO, parentDue) >= 2;

  if (!parent) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>Task not found</Text>
        <Pressable onPress={() => router.back()} style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
          <Text style={styles.primaryButtonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const updateTitle = (id: string, title: string) => {
    setSteps((current) => current.map((step) => step.id === id ? { ...step, title } : step));
  };

  /** Re-spread dates across the current step count, unless the user set them by hand. */
  const respread = (list: DraftStep[]): DraftStep[] => {
    if (datesTouched) return list;
    const dates = suggestStepDates(list.length, parentDue, todayISO);
    return list.map((step, index) => ({ ...step, dueDate: dates[index] ?? parentDue }));
  };

  const removeStep = (id: string) => {
    setSteps((current) => respread(current.filter((step) => step.id !== id)));
  };

  const addStep = () => {
    if (steps.length >= 8) {
      Alert.alert('Maximum reached', 'Keep the breakdown focused with up to eight steps.');
      return;
    }
    setSteps((current) => respread([
      ...current,
      {
        id: draftId(current.length),
        title: '',
        existing: false,
        // Fallback only matters when dates were hand-set, so respread is a no-op.
        dueDate: current[current.length - 1]?.dueDate ?? parentDue,
      },
    ]));
  };

  const setStepDate = (id: string, dateISO: string) => {
    setDatesTouched(true);
    setSteps((current) => current.map((step) => (
      step.id === id ? { ...step, dueDate: clampStepDate(dateISO, parentDue, todayISO) } : step
    )));
  };

  /** Opt-in for old breakdowns — never rewrites dates without the user asking. */
  const spreadDates = () => {
    const dates = suggestStepDates(steps.length, parentDue, todayISO);
    setDatesTouched(false);
    setSteps((current) => current.map((step, index) => ({ ...step, dueDate: dates[index] ?? parentDue })));
  };

  const save = async () => {
    const cleaned = steps.map((step) => ({ ...step, title: step.title.trim() })).filter((step) => step.title);
    if (cleaned.length === 0) {
      Alert.alert('Add a step', 'Write at least one step title before saving.');
      return;
    }
    setSaving(true);
    try {
      const keptIds = new Set(cleaned.filter((step) => step.existing).map((step) => step.id));
      existingSteps.filter((step) => !keptIds.has(step.id)).forEach((step) => deleteTask(step.id));
      const totalEstimate = estimateTaskMinutes(parent);
      const perStepEstimate = Math.max(15, Math.round((totalEstimate / cleaned.length) / 5) * 5);

      cleaned.forEach((step, index) => {
        const stepDue = clampStepDate(step.dueDate, parent.dueDate.slice(0, 10), todayISO);
        if (step.existing) {
          updateTask(step.id, {
            title: step.title,
            stepOrder: index,
            estimatedMinutes: perStepEstimate,
            dueDate: stepDue,
            // Older steps were created hidden from focus; now that a step has
            // its own date it should be able to surface as the next action.
            excludeFromFocus: false,
          });
          return;
        }
        addTask({
          id: `step_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
          title: step.title,
          courseId: parent.courseId,
          type: 'Step',
          dueDate: stepDue,
          dueTime: parent.dueTime,
          notes: '',
          isDone: false,
          deadlineRisk: parent.deadlineRisk,
          suggestedWeek: parent.suggestedWeek,
          parentTaskId: parent.id,
          stepOrder: index,
          estimatedMinutes: perStepEstimate,
          // Steps are the actionable unit, so they belong in Today's focus —
          // the parent is hidden instead (see selectTodaysFocusTask).
          excludeFromFocus: false,
          // Still excluded from Semester Pulse: the parent already carries the
          // workload, counting steps too would double it.
          excludeFromPulse: true,
        });
      });

      if (user.id && params.recommendationKey && params.ruleId && params.shownForDate) {
        await recordStudyRecommendationFeedback({
          userId: user.id,
          recommendationKey: params.recommendationKey,
          ruleId: params.ruleId,
          relatedTaskId: parent.id,
          status: 'accepted',
          shownForDate: params.shownForDate,
        });
      }
      router.back();
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.iconButton}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Break into steps</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>{parent.title}</Text>
        </View>
        <Pressable disabled={saving} onPress={() => { void save(); }} style={[styles.saveTop, { opacity: saving ? 0.5 : 1 }]}>
          <Text style={[styles.saveTopText, { color: theme.primary }]}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.infoCard, { backgroundColor: `${theme.primary}10`, borderColor: `${theme.primary}28` }]}>
          <Feather name="edit-3" size={19} color={theme.primary} />
          <Text style={[styles.infoText, { color: theme.text }]}>We suggested {suggestedCount} steps. You choose the titles and can add or remove any step.</Text>
        </View>

        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>YOUR STEPS</Text>
          {canOfferSpread && (
            <Pressable onPress={spreadDates} hitSlop={8} style={styles.spreadButton}>
              <Feather name="calendar" size={14} color={theme.primary} />
              <Text style={[styles.spreadButtonText, { color: theme.primary }]}>Spread dates</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.rows}>
          {steps.map((step, index) => (
            <View key={step.id} style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.rowTop}>
                <View style={[styles.number, { backgroundColor: `${theme.primary}14` }]}>
                  <Text style={[styles.numberText, { color: theme.primary }]}>{index + 1}</Text>
                </View>
                <TextInput
                  value={step.title}
                  onChangeText={(value) => updateTitle(step.id, value)}
                  placeholder={index === 0 ? 'e.g. Find references' : index === 1 ? 'e.g. Prepare the outline' : 'Enter step title'}
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text }]}
                  returnKeyType="next"
                  maxLength={120}
                />
                <Pressable accessibilityLabel={`Delete step ${index + 1}`} onPress={() => removeStep(step.id)} hitSlop={8} style={styles.deleteButton}>
                  <Feather name="trash-2" size={18} color={theme.textSecondary} />
                </Pressable>
              </View>
              <Pressable
                accessibilityLabel={`Change date for step ${index + 1}`}
                onPress={() => setPickerStepId(step.id)}
                style={[styles.dateChip, { borderColor: theme.border }]}
              >
                <Feather name="calendar" size={13} color={theme.textSecondary} />
                <Text style={[styles.dateChipText, { color: theme.text }]}>
                  {shortDateLabel(step.dueDate, todayISO)}
                </Text>
                <Feather name="chevron-down" size={13} color={theme.textSecondary} />
              </Pressable>
            </View>
          ))}
        </View>

        <Pressable onPress={addStep} style={[styles.addButton, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Feather name="plus" size={19} color={theme.primary} />
          <Text style={[styles.addButtonText, { color: theme.primary }]}>Add another step</Text>
        </Pressable>

        <Text style={[styles.footnote, { color: theme.textSecondary }]}>
          {hasRunway
            ? `Steps are spread across the days before ${shortDateLabel(parentDue, todayISO)}, finishing early so you keep a buffer. Tap any date to change it — a step can never fall after the task deadline.`
            : `This task is due ${shortDateLabel(parentDue, todayISO)}, so there are no earlier days to spread the steps across — they all sit on the deadline. Tap any date to change it.`}
        </Text>
      </ScrollView>

      {pickerStepId !== null && (
        <StepDatePicker
          value={steps.find((step) => step.id === pickerStepId)?.dueDate ?? parentDue}
          minDate={todayISO}
          maxDate={maxStepDate(parentDue, todayISO)}
          onChange={(dateISO) => setStepDate(pickerStepId, dateISO)}
          onClose={() => setPickerStepId(null)}
          theme={theme}
        />
      )}
    </KeyboardAvoidingView>
  );
}

/**
 * Date picker for one step. Both bounds are enforced by the picker itself
 * rather than by rejecting the user afterwards: `maximumDate` keeps a step on
 * or before the deadline, and `minimumDate` keeps it from being scheduled in
 * the past, which would create a step that is overdue the moment it is saved.
 */
function StepDatePicker({
  value,
  minDate,
  maxDate,
  onChange,
  onClose,
  theme,
}: {
  value: string;
  minDate: string;
  maxDate: string;
  onChange: (dateISO: string) => void;
  onClose: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const toDate = (iso: string) => {
    const parsed = new Date(`${(iso ?? '').slice(0, 10)}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  };
  const toISO = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  if (Platform.OS === 'android') {
    return (
      <DateTimePicker
        value={toDate(value)}
        mode="date"
        display="default"
        minimumDate={toDate(minDate)}
        maximumDate={toDate(maxDate)}
        onChange={(event, date) => {
          onClose();
          if (event.type === 'set' && date) onChange(toISO(date));
        }}
      />
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View
          style={[styles.pickerSheet, { backgroundColor: theme.card }]}
          onStartShouldSetResponder={() => true}
        >
          <Text style={[styles.pickerTitle, { color: theme.text }]}>When will you do this step?</Text>
          <DateTimePicker
            value={toDate(value)}
            mode="date"
            display="spinner"
            minimumDate={toDate(minDate)}
            maximumDate={toDate(maxDate)}
            themeVariant={theme.background === '#FFFFFF' ? 'light' : 'dark'}
            textColor={theme.text}
            style={styles.picker}
            onChange={(_, date) => {
              if (date) onChange(toISO(date));
            }}
          />
          <Pressable style={[styles.pickerDone, { backgroundColor: theme.primary }]} onPress={onClose}>
            <Text style={styles.pickerDoneText}>Done</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  header: { paddingTop: 54, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  headerTitle: { fontSize: 19, fontWeight: '800' },
  headerSubtitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  saveTop: { paddingHorizontal: 8, paddingVertical: 10 },
  saveTopText: { fontSize: 15, fontWeight: '800' },
  content: { padding: 20, paddingBottom: 48 },
  infoCard: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 24 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  spreadButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  spreadButtonText: { fontSize: 12, fontWeight: '800' },
  rows: { gap: 10 },
  row: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingBottom: 10 },
  rowTop: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 },
  number: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 13, fontWeight: '800' },
  input: { flex: 1, fontSize: 15, fontWeight: '600', paddingVertical: 14 },
  deleteButton: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  dateChip: { alignSelf: 'flex-start', marginLeft: 40, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  dateChipText: { fontSize: 12.5, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 32, gap: 10 },
  pickerTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  picker: { height: 200 },
  pickerDone: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  pickerDoneText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  addButton: { marginTop: 12, borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addButtonText: { fontSize: 14, fontWeight: '800' },
  footnote: { fontSize: 12, lineHeight: 18, marginTop: 18 },
  primaryButton: { paddingHorizontal: 20, paddingVertical: 13, borderRadius: 14 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
