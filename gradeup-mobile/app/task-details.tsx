import { View, Text, Pressable, ScrollView, StyleSheet, Share, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';
import { formatDisplayDate } from '@/src/utils/date';
import { Priority } from '@/src/types';
import { useTranslations } from '@/src/i18n';

export default function TaskDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tasks, toggleTaskDone, deleteTask, language } = useApp();
  const T = useTranslations(language);
  const task = tasks.find((t) => t.id === id);

  if (!task) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{T('taskNotFound')}</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{T('back')}</Text>
        </Pressable>
      </View>
    );
  }

  const handleDelete = () => {
    Alert.alert(
      T('deleteTask'),
      `"${task.title}" ${T('deleteTaskDesc')}`,
      [
        { text: T('cancel'), style: 'cancel' },
        { text: T('delete'), style: 'destructive', onPress: () => {
          deleteTask(task.id);
          router.back();
        } },
      ]
    );
  };

  const handleToggle = () => {
    if (task.isDone) {
      Alert.alert(
        T('markAsNotDone'),
        `"${task.title}" ${T('markAsIncomplete')}`,
        [
          { text: T('cancel'), style: 'cancel' },
          { text: T('undo'), onPress: () => toggleTaskDone(task.id) },
        ]
      );
    } else {
      Alert.alert(
        T('markAsDoneQuestion'),
        `"${task.title}" ${T('markAsCompleted')}`,
        [
          { text: T('cancel'), style: 'cancel' },
          { text: T('markDone'), onPress: () => toggleTaskDone(task.id) },
        ]
      );
    }
  };

  const handleShare = () => {
    Share.share({
      message: `${task.title} (${task.courseId}) – Due ${formatDisplayDate(task.dueDate)} ${task.dueTime}`,
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
      <Text style={styles.title}>{task.courseId}: {task.title}</Text>

      <View style={styles.grid}>
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>{T('dueDate')}</Text>
          <View style={styles.infoRow}>
            <Feather name="calendar" size={18} color="#9ca3af" />
            <Text style={styles.infoValue}>{task.dueDate}</Text>
          </View>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>{T('priority')}</Text>
          <Text style={[styles.infoValueLarge, task.priority === Priority.High && { color: '#ef4444' }]}>{task.priority}</Text>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>{T('deadline')}</Text>
          <View style={styles.infoRow}>
            <Feather name="bell" size={18} color="#9ca3af" />
            <Text style={styles.infoValue}>{task.dueTime}</Text>
          </View>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>{T('estEffort')}</Text>
          <Text style={styles.infoValueLarge}>{task.effort} {T('hours')}</Text>
        </View>
      </View>

      <View style={[styles.riskCard, task.deadlineRisk === 'High' && styles.riskHigh]}>
        <View style={styles.riskRow}>
          <Icons.Sparkles size={16} color={COLORS.white} />
          <Text style={styles.riskTitle}>{T('aiRisk')} {task.deadlineRisk} {T('risk')}</Text>
        </View>
        <Text style={styles.riskText}>
          {task.deadlineRisk === 'High'
            ? T('highRiskDesc')
            : T('lowRiskDesc')}
        </Text>
      </View>

      <View style={styles.sourceSection}>
        <View style={styles.sourceHeader}>
          <Text style={styles.sourceLabel}>{T('whatsappSource')}</Text>
          <View style={styles.verifiedBadge}>
            <View style={styles.verifiedDot} />
            <Text style={styles.verifiedText}>{T('verifiedByAi')}</Text>
          </View>
        </View>
        <View style={styles.sourceCard}>
          <Text style={styles.sourceTag}>{T('messageLog')}</Text>
          <Text style={styles.sourceMessage}>"{sourceMessage}"</Text>
          <Text style={styles.sourceTimestamp}>
            {task.sourceMessage
              ? `${T('extractedOn')} ${task.dueDate} • ${task.dueTime}`
              : `${T('received')} ${formatDisplayDate(task.dueDate)} • ${task.dueTime}`}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={handleShare} style={styles.shareBtn}>
          <Icons.Share size={20} color={COLORS.gray} />
        </Pressable>
        <Pressable onPress={handleDelete} style={styles.deleteBtn}>
          <Feather name="trash-2" size={20} color="#ef4444" />
        </Pressable>
        <Pressable
          style={[styles.doneBtn, task.isDone && styles.doneBtnOff]}
          onPress={handleToggle}
        >
          <Text style={styles.doneBtnText}>{task.isDone ? T('completed') : T('markAsDone')}</Text>
        </Pressable>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// Layout: same as Planner – pad 20, section 24, card 20, radius 20/12
const L = { pad: 20, section: 24, cardPad: 20, radius: 20, radiusSm: 12 };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.card },
  content: { paddingHorizontal: L.pad, paddingTop: 56, paddingBottom: 100 },
  error: { fontSize: 16, color: COLORS.gray, textAlign: 'center', marginTop: 48 },
  backBtn: { marginTop: L.section, alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 24, backgroundColor: COLORS.navy, borderRadius: L.radiusSm },
  backBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: L.section },
  iconBtn: { width: 44, height: 44, borderRadius: L.radiusSm, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  headerId: { fontSize: 11, fontWeight: '700', color: COLORS.gold },
  badges: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  badgeNavy: { backgroundColor: COLORS.navy, color: COLORS.white, fontSize: 11, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  badgeGray: { backgroundColor: COLORS.bg, color: COLORS.gray, fontSize: 11, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  title: { fontSize: 22, fontWeight: '900', color: '#1a1c1e', marginBottom: L.section, lineHeight: 28, letterSpacing: -0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: L.section },
  infoBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f5f5f5',
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  infoLabel: { fontSize: 9, color: '#9ca3af', fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoValue: { fontSize: 15, fontWeight: '900', color: '#1a1c1e' },
  infoValueLarge: { fontSize: 16, fontWeight: '900', color: '#1a1c1e' },
  riskCard: { backgroundColor: COLORS.navy, borderRadius: L.radius, padding: L.cardPad, marginBottom: L.section },
  riskHigh: { backgroundColor: '#ef4444' },
  riskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  riskTitle: { fontSize: 11, fontWeight: '700', color: COLORS.white },
  riskText: { fontSize: 13, color: 'rgba(255,255,255,0.95)', lineHeight: 20 },
  sourceSection: { marginBottom: L.section },
  sourceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sourceLabel: { fontSize: 11, fontWeight: '700', color: COLORS.gray },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verifiedDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#059669' },
  verifiedText: { fontSize: 10, fontWeight: '700', color: '#059669' },
  sourceCard: { backgroundColor: COLORS.bg, padding: L.cardPad, borderRadius: L.radius, borderWidth: 1, borderColor: COLORS.border, position: 'relative' },
  sourceTag: { position: 'absolute', top: -10, left: L.pad, backgroundColor: COLORS.card, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, fontSize: 10, fontWeight: '700', color: COLORS.gray },
  sourceMessage: { fontSize: 14, color: COLORS.gray, fontStyle: 'italic', marginTop: 8, lineHeight: 20 },
  sourceTimestamp: { fontSize: 11, fontWeight: '600', color: '#9ca3af', marginTop: 10 },
  actions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  shareBtn: { width: 48, height: 48, borderRadius: 16, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(239,68,68,0.15)', alignItems: 'center', justifyContent: 'center' },
  doneBtn: { flex: 1, backgroundColor: COLORS.navy, paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  doneBtnOff: { backgroundColor: COLORS.gray },
  doneBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '800' },
});
