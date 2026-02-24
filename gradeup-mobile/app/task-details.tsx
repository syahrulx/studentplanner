import { View, Text, Pressable, ScrollView, StyleSheet, Share } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';
import { Priority } from '@/src/types';

export default function TaskDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tasks, toggleTaskDone, deleteTask } = useApp();
  const task = tasks.find((t) => t.id === id);

  if (!task) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Task not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const handleDelete = () => {
    deleteTask(task.id);
    router.back();
  };

  const handleToggle = () => {
    toggleTaskDone(task.id);
  };

  const handleShare = () => {
    Share.share({
      message: `${task.title} (${task.courseId}) – Due ${task.dueDate} ${task.dueTime}`,
      title: 'Task',
    });
  };

  const sourceMessage = task.sourceMessage || 'Assalammualaikum students. Sila hantar Lab 4 sebelum Jumaat ni jam 11:59PM. Make sure follow format normalization yang saya ajar tadi. TQ.';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Icons.ArrowRight size={20} color={COLORS.gray} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <Text style={styles.headerId}>{task.id.slice(0, 6)}</Text>
        <Pressable style={styles.iconBtn}><Icons.Settings size={20} color={COLORS.gray} /></Pressable>
      </View>

      <View style={styles.badges}>
        <Text style={styles.badgeNavy}>{task.courseId}</Text>
        <Text style={styles.badgeGray}>{task.type}</Text>
      </View>
      <Text style={styles.title}>{task.title}</Text>

      <View style={styles.grid}>
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>DUE DATE</Text>
          <Text style={styles.infoValue}>{task.dueDate}</Text>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>PRIORITY</Text>
          <Text style={[styles.infoValue, task.priority === Priority.High && { color: '#ef4444' }]}>{task.priority}</Text>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>DEADLINE</Text>
          <Text style={styles.infoValue}>{task.dueTime}</Text>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>EFFORT</Text>
          <Text style={styles.infoValue}>{task.effort} hrs</Text>
        </View>
      </View>

      <View style={[styles.riskCard, task.deadlineRisk === 'High' && styles.riskHigh]}>
        <View style={styles.riskRow}>
          <Icons.Sparkles size={16} color={COLORS.white} />
          <Text style={styles.riskTitle}>AI: {task.deadlineRisk} RISK</Text>
        </View>
        <Text style={styles.riskText}>
          {task.deadlineRisk === 'High'
            ? 'Critical collision detected. This deadline falls within the Week 11-13 SOW workload surge. Week 13 shows peak stress for CSC584 and IPS551. Start now to avoid burnout.'
            : 'Safe window confirmed. Current Week 11 workload is manageable. Completing this early gives you buffer before the Week 13 critical peak.'}
        </Text>
      </View>

      <View style={styles.sourceSection}>
        <View style={styles.sourceHeader}>
          <Text style={styles.sourceLabel}>WhatsApp Extraction Source</Text>
          <View style={styles.verifiedBadge}>
            <View style={styles.verifiedDot} />
            <Text style={styles.verifiedText}>Verified by AI</Text>
          </View>
        </View>
        <View style={styles.sourceCard}>
          <Text style={styles.sourceTag}>Message Log</Text>
          <Text style={styles.sourceMessage}>"{sourceMessage}"</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={handleShare} style={styles.shareBtn}>
          <Icons.Share size={20} color={COLORS.gray} />
        </Pressable>
        <Pressable onPress={handleDelete} style={styles.deleteBtn}>
          <Icons.Plus size={20} color="#ef4444" style={{ transform: [{ rotate: '45deg' }] }} />
        </Pressable>
        <Pressable
          style={[styles.doneBtn, task.isDone && styles.doneBtnOff]}
          onPress={handleToggle}
        >
          <Text style={styles.doneBtnText}>{task.isDone ? 'Completed' : 'Mark as Done'}</Text>
        </Pressable>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  content: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 100 },
  error: { fontSize: 16, color: COLORS.gray, textAlign: 'center', marginTop: 48 },
  backBtn: { marginTop: 20, alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 28, backgroundColor: COLORS.navy, borderRadius: 16 },
  backBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  headerId: { fontSize: 10, fontWeight: '800', color: COLORS.gold, letterSpacing: 1 },
  badges: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  badgeNavy: { backgroundColor: COLORS.navy, color: COLORS.white, fontSize: 10, fontWeight: '800', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  badgeGray: { backgroundColor: COLORS.bg, color: COLORS.gray, fontSize: 10, fontWeight: '800', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.navy, marginBottom: 28, lineHeight: 32, letterSpacing: -0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 28 },
  infoBox: { flex: 1, minWidth: '45%', backgroundColor: COLORS.bg, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  infoLabel: { fontSize: 10, color: COLORS.gray, fontWeight: '800', marginBottom: 6, letterSpacing: 1 },
  infoValue: { fontSize: 15, fontWeight: '800', color: COLORS.navy },
  riskCard: { backgroundColor: COLORS.navy, borderRadius: 24, padding: 24, marginBottom: 28 },
  riskHigh: { backgroundColor: '#ef4444' },
  riskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  riskTitle: { fontSize: 10, fontWeight: '800', color: COLORS.white, letterSpacing: 1.5 },
  riskText: { fontSize: 13, color: 'rgba(255,255,255,0.95)', lineHeight: 20 },
  sourceSection: { marginBottom: 28 },
  sourceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sourceLabel: { fontSize: 10, fontWeight: '800', color: COLORS.gray, letterSpacing: 1 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verifiedDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22c55e' },
  verifiedText: { fontSize: 9, fontWeight: '700', color: '#22c55e' },
  sourceCard: { backgroundColor: COLORS.bg, padding: 24, borderRadius: 28, borderWidth: 1, borderColor: COLORS.border, position: 'relative' },
  sourceTag: { position: 'absolute', top: -12, left: 24, backgroundColor: COLORS.white, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, fontSize: 8, fontWeight: '800', color: COLORS.gray },
  sourceMessage: { fontSize: 14, color: COLORS.gray, fontStyle: 'italic', marginTop: 10, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  shareBtn: { width: 52, height: 52, borderRadius: 18, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { width: 52, height: 52, borderRadius: 18, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },
  doneBtn: { flex: 1, backgroundColor: COLORS.navy, paddingVertical: 18, borderRadius: 20, alignItems: 'center' },
  doneBtnOff: { backgroundColor: COLORS.gray },
  doneBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '800' },
});
