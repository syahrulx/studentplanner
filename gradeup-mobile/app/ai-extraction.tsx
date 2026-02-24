import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';
import { TaskType, Priority } from '@/src/types';
import type { Task } from '@/src/types';
import { formatDisplayDate, parseDisplayDate } from '@/src/utils/date';

const ANALYSIS_STEPS = [
  'Identifying keywords...',
  'Detecting course code (FSKM/ISE)...',
  'Mapping deadline to Semester Week...',
  'Analyzing SOW risk factors...',
];

export default function AIExtraction() {
  const { pendingExtraction, addTask, courses } = useApp();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<Partial<Task>>({
    title: 'Lab 4 - Normalization Study',
    courseId: courses[0]?.id ?? 'IPS551',
    type: TaskType.Lab,
    dueDate: '2024-12-27',
    dueTime: '23:59',
    priority: Priority.High,
    effort: 4,
    notes: 'Follow the specific ERD to Normalization mapping taught in Week 11.',
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
    const task: Task = {
      id: `t${Date.now()}`,
      title: (formData.title ?? 'Task').trim(),
      courseId: formData.courseId ?? courses[0]?.id ?? 'IPS551',
      type: formData.type ?? TaskType.Lab,
      dueDate: formData.dueDate ?? '2024-12-27',
      dueTime: formData.dueTime ?? '23:59',
      priority: formData.priority ?? Priority.High,
      effort: formData.effort ?? 4,
      notes: formData.notes ?? '',
      isDone: false,
      deadlineRisk: 'High',
      suggestedWeek: 11,
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
  loadingTitle: { fontSize: 22, fontWeight: '800', color: COLORS.navy, marginBottom: 12, letterSpacing: -0.5 },
  loadingStep: { fontSize: 13, fontWeight: '800', color: COLORS.gold, letterSpacing: 0.5 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.navy, letterSpacing: -0.5 },
  accuracyBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#dcfce7', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 22, borderWidth: 1, borderColor: '#bbf7d0' },
  accuracyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  accuracyText: { fontSize: 10, fontWeight: '800', color: '#166534' },
  sourceCard: { backgroundColor: COLORS.bg, padding: 24, borderRadius: 28, borderWidth: 1, borderColor: COLORS.border, marginBottom: 28, position: 'relative' },
  sourceTag: { position: 'absolute', top: -12, left: 24, backgroundColor: COLORS.white, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, fontSize: 8, fontWeight: '800', color: COLORS.gray },
  sourceMessage: { fontSize: 13, color: COLORS.gray, fontStyle: 'italic', marginTop: 10, lineHeight: 20 },
  label: { fontSize: 10, fontWeight: '800', color: COLORS.gray, marginBottom: 10, letterSpacing: 1 },
  input: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, padding: 18, fontSize: 14, marginBottom: 20 },
  row: { flexDirection: 'row', gap: 16 },
  half: { flex: 1 },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  chip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  chipText: { fontSize: 12, fontWeight: '700', color: COLORS.navy },
  chipTextActive: { color: COLORS.white },
  insightCard: { backgroundColor: COLORS.navy, borderRadius: 32, padding: 26, marginBottom: 28 },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 18 },
  insightIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  insightTitle: { fontSize: 15, fontWeight: '800', color: COLORS.white },
  insightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  insightLabel: { fontSize: 10, fontWeight: '700', color: '#93c5fd' },
  insightRisk: { fontSize: 13, fontWeight: '800', color: '#fca5a5' },
  insightText: { fontSize: 13, color: 'rgba(255,255,255,0.95)', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 16 },
  discardBtn: { flex: 1, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 20, borderRadius: 24, alignItems: 'center' },
  discardBtnText: { fontSize: 11, fontWeight: '800', color: COLORS.gray },
  confirmBtn: { flex: 2, backgroundColor: COLORS.navy, paddingVertical: 20, borderRadius: 24, alignItems: 'center' },
  confirmBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.white },
});
