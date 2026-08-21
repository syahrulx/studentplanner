import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { estimateTaskMinutes, recordStudyRecommendationFeedback } from '@/src/lib/studyRecommendations';

type DraftStep = { id: string; title: string; existing: boolean };

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
  const [steps, setSteps] = useState<DraftStep[]>(() => (
    existingSteps.length > 0
      ? existingSteps.map((step) => ({ id: step.id, title: step.title, existing: true }))
      : Array.from({ length: suggestedCount }, (_, index) => ({ id: draftId(index), title: '', existing: false }))
  ));
  const [saving, setSaving] = useState(false);

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

  const removeStep = (id: string) => setSteps((current) => current.filter((step) => step.id !== id));

  const addStep = () => {
    if (steps.length >= 8) {
      Alert.alert('Maximum reached', 'Keep the breakdown focused with up to eight steps.');
      return;
    }
    setSteps((current) => [...current, { id: draftId(current.length), title: '', existing: false }]);
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
        if (step.existing) {
          updateTask(step.id, { title: step.title, stepOrder: index, estimatedMinutes: perStepEstimate });
          return;
        }
        addTask({
          id: `step_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
          title: step.title,
          courseId: parent.courseId,
          type: 'Step',
          dueDate: parent.dueDate,
          dueTime: parent.dueTime,
          notes: '',
          isDone: false,
          deadlineRisk: parent.deadlineRisk,
          suggestedWeek: parent.suggestedWeek,
          parentTaskId: parent.id,
          stepOrder: index,
          estimatedMinutes: perStepEstimate,
          excludeFromFocus: true,
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

        <Text style={[styles.label, { color: theme.textSecondary }]}>YOUR STEPS</Text>
        <View style={styles.rows}>
          {steps.map((step, index) => (
            <View key={step.id} style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
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
          ))}
        </View>

        <Pressable onPress={addStep} style={[styles.addButton, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Feather name="plus" size={19} color={theme.primary} />
          <Text style={[styles.addButtonText, { color: theme.primary }]}>Add another step</Text>
        </Pressable>

        <Text style={[styles.footnote, { color: theme.textSecondary }]}>Steps use the original task deadline and appear underneath it in your planner. Completing their normal checkboxes updates progress automatically.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
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
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginBottom: 10 },
  rows: { gap: 10 },
  row: { minHeight: 62, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  number: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 13, fontWeight: '800' },
  input: { flex: 1, fontSize: 15, fontWeight: '600', paddingVertical: 16 },
  deleteButton: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  addButton: { marginTop: 12, borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addButtonText: { fontSize: 14, fontWeight: '800' },
  footnote: { fontSize: 12, lineHeight: 18, marginTop: 18 },
  primaryButton: { paddingHorizontal: 20, paddingVertical: 13, borderRadius: 14 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
