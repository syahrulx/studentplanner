import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';
import { TaskType, Priority } from '@/src/types';
import type { Task } from '@/src/types';
import type { TaskExtractionDTO } from '@/src/lib/taskExtraction';
import { formatDisplayDate, getTodayISO, parseDisplayDate } from '@/src/utils/date';
import { SUBJECT_COLOR_OPTIONS } from '@/src/constants/subjectColors';
import { createTaskId, getDeadlineRiskFromDueDate, getSuggestedWeekForDueDate } from '@/src/lib/taskUtils';

const ANALYSIS_STEPS = [
  'Identifying keywords...',
  'Detecting course code (FSKM/ISE)...',
  'Mapping deadline to Semester Week...',
  'Analyzing SOW risk factors...',
];

export default function AIExtraction() {
  const { pendingExtraction, addTask, courses, getSubjectColor, setSubjectColor, user, academicCalendar } = useApp();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<Partial<Task>>({
    title: '',
    courseId: courses[0]?.id ?? '',
    type: TaskType.Assignment,
    dueDate: getTodayISO(),
    dueTime: '23:59',
    priority: Priority.Medium,
    effort: 2,
    notes: '',
  });

  useEffect(() => {
    const t = setInterval(() => {
      setStep((s) => {
        if (s >= ANALYSIS_STEPS.length - 1) {
          clearInterval(t);
          setLoading(false);
          return s;
        }
        return s + 1;
      });
    }, 600);
    return () => clearInterval(t);
  }, []);

  const sourceMessage = pendingExtraction || 'Assalammualaikum students. Sila hantar Lab 4 sebelum Jumaat ni jam 11:59PM. TQ.';

  // If this screen was opened from an AI extraction flow, we might have structured metadata
  // about deadline risk and suggested week attached to the pending task.
  const aiMeta: Pick<TaskExtractionDTO, 'deadline_risk' | 'suggested_week'> | null =
    (pendingExtraction as any)?.aiMeta ?? null;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.navy} style={{ marginBottom: 16 }} />
        <View style={styles.spinnerIcon}><Icons.Sparkles size={32} color={COLORS.navy} /></View>
        <Text style={styles.loadingTitle}>Brain Processing</Text>
        <Text style={styles.loadingStep}>{ANALYSIS_STEPS[step]}</Text>
      </View>
    );
  }

  const handleConfirm = () => {
    const dueDate = formData.dueDate ?? getTodayISO();
    const deadlineRisk =
      (aiMeta?.deadline_risk as 'High' | 'Medium' | 'Low' | undefined) ?? getDeadlineRiskFromDueDate(dueDate);
    const suggestedWeek =
      typeof aiMeta?.suggested_week === 'number' && aiMeta.suggested_week > 0
        ? aiMeta.suggested_week
        : getSuggestedWeekForDueDate(dueDate, user, academicCalendar?.startDate);

    const task: Task = {
      id: createTaskId(),
      title: (formData.title ?? 'Task').trim(),
      courseId: formData.courseId ?? courses[0]?.id ?? 'General',
      type: formData.type ?? TaskType.Assignment,
      dueDate,
      dueTime: formData.dueTime ?? '23:59',
      priority: formData.priority ?? Priority.High,
      effort: formData.effort ?? 4,
      notes: formData.notes ?? '',
      isDone: false,
      deadlineRisk,
      suggestedWeek,
      sourceMessage,
    };
    addTask(task);
    router.replace('/(tabs)/planner' as any);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>AI Audit</Text>
        <View style={styles.accuracyBadge}>
          <View style={styles.accuracyDot} />
          <Text style={styles.accuracyText}>98% Accuracy</Text>
        </View>
      </View>

      <View style={styles.sourceCard}>
        <Text style={styles.sourceTag}>WhatsApp Raw Input</Text>
        <Text style={styles.sourceMessage}>"{sourceMessage.substring(0, 200)}{sourceMessage.length > 200 ? '...' : ''}"</Text>
      </View>

      <Text style={styles.label}>Task Title</Text>
      <TextInput
        style={styles.input}
        value={formData.title}
        onChangeText={(t) => setFormData({ ...formData, title: t })}
      />

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Course ID</Text>
          <View style={styles.pickerRow}>
            {courses.map((c) => (
              <Pressable
                key={c.id}
                style={[styles.chip, formData.courseId === c.id && styles.chipActive]}
                onPress={() => setFormData({ ...formData, courseId: c.id })}
              >
                <Text style={[styles.chipText, formData.courseId === c.id && styles.chipTextActive]}>{c.id}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Category</Text>
          <View style={styles.pickerRow}>
            {(Object.values(TaskType) as TaskType[]).slice(0, 4).map((t) => (
              <Pressable key={t} style={[styles.chip, formData.type === t && styles.chipActive]} onPress={() => setFormData({ ...formData, type: t })}>
                <Text style={[styles.chipText, formData.type === t && styles.chipTextActive]}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <Text style={styles.label}>Subject colour</Text>
      <Pressable style={styles.colorRow} onPress={() => setShowColorPicker(true)}>
        <View style={[styles.colorSwatch, { backgroundColor: getSubjectColor(formData.courseId ?? courses[0]?.id ?? '') }]} />
        <Text style={styles.colorRowText}>Tap to set colour for {formData.courseId ?? courses[0]?.id ?? '—'}</Text>
        <Icons.ArrowRight size={18} color={COLORS.gray} />
      </Pressable>

      <Modal visible={showColorPicker} transparent animationType="fade">
        <Pressable style={styles.colorModalBackdrop} onPress={() => setShowColorPicker(false)}>
          <View style={styles.colorModalPanel} onStartShouldSetResponder={() => true}>
            <Text style={styles.colorModalTitle}>Colour for {formData.courseId ?? courses[0]?.id ?? '—'}</Text>
            <View style={styles.colorGrid}>
              {SUBJECT_COLOR_OPTIONS.map((color) => {
                const cid = formData.courseId ?? courses[0]?.id ?? '';
                return (
                  <Pressable
                    key={color}
                    style={[styles.colorOption, { backgroundColor: color }, cid && getSubjectColor(cid) === color && styles.colorOptionSelected]}
                    onPress={() => {
                      if (cid) setSubjectColor(cid, color);
                      setShowColorPicker(false);
                    }}
                  />
                );
              })}
            </View>
            <Pressable style={styles.colorCancelBtn} onPress={() => setShowColorPicker(false)}>
              <Text style={styles.colorCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Due Date</Text>
          <TextInput style={styles.input} value={formData.dueDate ? formatDisplayDate(formData.dueDate) : ''} onChangeText={(d) => { const p = parseDisplayDate(d); if (p) setFormData({ ...formData, dueDate: p }); }} placeholder="DD-MM-YYYY" placeholderTextColor={COLORS.gray} />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Target Time</Text>
          <TextInput style={styles.input} value={formData.dueTime} onChangeText={(t) => setFormData({ ...formData, dueTime: t })} />
        </View>
      </View>

      <View style={styles.insightCard}>
        <View style={styles.insightHeader}>
          <View style={styles.insightIcon}><Icons.Sparkles size={20} color={COLORS.gold} /></View>
          <Text style={styles.insightTitle}>SOW Workload Match</Text>
        </View>
        <View style={styles.insightRow}>
          <Text style={styles.insightLabel}>Collision Risk</Text>
          <Text style={styles.insightRisk}>HIGH (Week 13 Proximity)</Text>
        </View>
        <Text style={styles.insightText}>
          Completing this Normalization Study in Week 11 is vital. If delayed to Week 12, it will overlap with your Enterprise Programming finale.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.discardBtn} onPress={() => router.back()}>
          <Text style={styles.discardBtnText}>Discard</Text>
        </Pressable>
        <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
          <Text style={styles.confirmBtnText}>Confirm & Schedule</Text>
        </Pressable>
      </View>
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 100 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 },
  spinnerIcon: { alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  loadingTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 12, letterSpacing: -0.5 },
  loadingStep: { fontSize: 13, fontWeight: '800', color: COLORS.gold, letterSpacing: 0.5 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  accuracyBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(34,197,94,0.15)', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  accuracyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#06b6d4' },
  accuracyText: { fontSize: 10, fontWeight: '800', color: '#0891b2' },
  sourceCard: { backgroundColor: COLORS.bg, padding: 24, borderRadius: 28, borderWidth: 1, borderColor: COLORS.border, marginBottom: 28, position: 'relative' },
  sourceTag: { position: 'absolute', top: -12, left: 24, backgroundColor: COLORS.card, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, fontSize: 8, fontWeight: '800', color: COLORS.gray },
  sourceMessage: { fontSize: 13, color: COLORS.gray, fontStyle: 'italic', marginTop: 10, lineHeight: 20 },
  label: { fontSize: 10, fontWeight: '800', color: COLORS.gray, marginBottom: 10, letterSpacing: 1 },
  input: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, padding: 18, fontSize: 14, marginBottom: 20 },
  row: { flexDirection: 'row', gap: 16 },
  half: { flex: 1 },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  chip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  chipText: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  chipTextActive: { color: COLORS.white },
  insightCard: { backgroundColor: COLORS.navy, borderRadius: 32, padding: 26, marginBottom: 28 },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 18 },
  insightIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  insightTitle: { fontSize: 15, fontWeight: '800', color: COLORS.white },
  insightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  insightLabel: { fontSize: 10, fontWeight: '700', color: '#d4a843' },
  insightRisk: { fontSize: 13, fontWeight: '800', color: '#fca5a5' },
  insightText: { fontSize: 13, color: 'rgba(255,255,255,0.95)', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 16 },
  discardBtn: { flex: 1, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 20, borderRadius: 24, alignItems: 'center' },
  discardBtnText: { fontSize: 11, fontWeight: '800', color: COLORS.gray },
  confirmBtn: { flex: 2, backgroundColor: COLORS.navy, paddingVertical: 20, borderRadius: 24, alignItems: 'center' },
  confirmBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.white },
  colorRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, padding: 18, marginBottom: 20 },
  colorSwatch: { width: 28, height: 28, borderRadius: 14, marginRight: 12 },
  colorRowText: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text },
  colorModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  colorModalPanel: { backgroundColor: COLORS.card, borderRadius: 20, padding: 24 },
  colorModalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 20 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  colorOption: { width: 44, height: 44, borderRadius: 22 },
  colorOptionSelected: { borderWidth: 3, borderColor: COLORS.navy },
  colorCancelBtn: { paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  colorCancelText: { fontSize: 15, fontWeight: '700', color: COLORS.gray },
});
