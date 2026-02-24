import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';
import { Priority } from '@/src/types';

export default function Dashboard() {
  const { user, tasks } = useApp();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const pending = tasks.filter((t) => !t.isDone);
  const high = pending.filter((t) => t.priority === Priority.High).sort(
    (a, b) => new Date(a.dueDate + 'T' + a.dueTime).getTime() - new Date(b.dueDate + 'T' + b.dueTime).getTime()
  );
  const nextTask = high[0] || pending[0];

  const getUrgency = (dueDate: string) => {
    if (dueDate === '2024-12-26') return 'DUE TODAY';
    if (dueDate === '2024-12-27') return 'DUE TOMORROW';
    const [, m, d] = dueDate.split('-');
    return `DUE ${m}/${d}`;
  };

  const schedule = tasks
    .filter((t) => !t.isDone && t.dueDate === '2024-12-26')
    .sort((a, b) => a.dueTime.localeCompare(b.dueTime))
    .slice(0, 5)
    .map((t) => ({ time: t.dueTime, code: t.courseId, room: 'Online Submission', type: 'DEADLINE' as const, name: t.title }));

  if (schedule.length === 0) {
    schedule.push(
      { time: '12:00', code: 'ISP573', room: 'Online Submission', type: 'DEADLINE', name: 'Case Study Analysis' },
      { time: '17:00', code: 'LCC401', room: 'Online Submission', type: 'DEADLINE', name: 'Critical Reading Exercise' }
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Hi, {user.name.split(' ')[0]}</Text>
          <View style={styles.row}>
            <View style={styles.dot} />
            <Text style={styles.subtitle}>Part {user.part} • Active Session</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={styles.weekBtn} onPress={() => router.push('/stress-map' as any)}>
            <Text style={styles.weekBtnText}>Week {user.currentWeek}</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable onPress={() => router.push('/(tabs)/profile' as any)}>
            <Icons.User size={20} color={COLORS.white} />
          </Pressable>
        </View>
      </View>

      <Pressable style={({ pressed }) => [styles.focusCard, pressed && styles.pressed]} onPress={() => router.push('/(tabs)/planner' as any)}>
        <View style={styles.focusTop}>
          <Text style={styles.focusLabel}>Today's Focus</Text>
          <View style={styles.urgencyPill}>
            <Text style={styles.urgencyPillText}>{nextTask ? getUrgency(nextTask.dueDate) : 'No Tasks'}</Text>
          </View>
        </View>
        {nextTask ? (
          <>
            <Text style={styles.focusTitle} numberOfLines={2}>{nextTask.title}</Text>
            <View style={styles.focusMetaRow}>
              <View style={styles.focusMetaItem}>
                <Icons.CheckCircle size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.focusMetaText}>{nextTask.courseId}</Text>
              </View>
              <View style={styles.focusMetaDot} />
              <View style={styles.focusMetaItem}>
                <Icons.Calendar size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.focusMetaText}>{nextTask.dueTime}</Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={styles.focusEmpty}>Ready for a fresh start!</Text>
        )}
      </Pressable>

      <View style={styles.shortcuts}>
        <Pressable style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]} onPress={() => router.push('/flashcard-review' as any)}>
          <View style={styles.shortcutIcon}><Icons.Layers size={24} color={COLORS.navy} /></View>
          <Text style={styles.shortcutLabel}>Flashcard</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]} onPress={() => router.push('/quiz-config' as any)}>
          <View style={styles.shortcutIcon}><Icons.CheckCircle size={24} color={COLORS.navy} /></View>
          <Text style={styles.shortcutLabel}>Quiz</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]} onPress={() => router.push('/leaderboard' as any)}>
          <View style={styles.shortcutIcon}><Icons.TrendingUp size={24} color={COLORS.navy} /></View>
          <Text style={styles.shortcutLabel}>Ranking</Text>
        </Pressable>
      </View>

      <View style={styles.timelineSection}>
        <View style={styles.timelineHeader}>
          <Text style={styles.timelineTitle}>Live Timeline</Text>
          <Text style={styles.timelineDate}>DEC 26</Text>
        </View>
        <View style={styles.timelineList}>
          {schedule.map((item, idx) => (
            <View key={idx} style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineCard}>
                <View style={styles.timelineCardTop}>
                  <Text style={styles.timelineTime}>{item.time}</Text>
                  <View style={[styles.typeBadge, item.type === 'DEADLINE' && styles.typeDeadline]}>
                    <Text style={[styles.typeBadgeText, item.type === 'DEADLINE' && styles.typeDeadlineText]}>{item.type}</Text>
                  </View>
                </View>
                <Text style={styles.timelineName}>{item.name}</Text>
                <Text style={styles.timelineMeta}>{item.code} • {item.room}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <Pressable style={styles.fab} onPress={() => setAddMenuOpen(true)}>
        <Icons.Plus size={28} color={COLORS.white} />
      </Pressable>

      <Modal visible={addMenuOpen} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setAddMenuOpen(false)}>
          <View style={styles.addMenuCard} onStartShouldSetResponder={() => true}>
            <Pressable style={styles.addMenuItem} onPress={() => { setAddMenuOpen(false); router.push('/add-task' as any); }}>
              <View style={styles.addMenuIcon}><Icons.Plus size={20} color={COLORS.white} /></View>
              <View>
                <Text style={styles.addMenuTitle}>Add Manually</Text>
                <Text style={styles.addMenuSub}>Create a new task yourself</Text>
              </View>
            </Pressable>
            <View style={styles.addMenuDivider} />
            <Pressable style={styles.addMenuItem} onPress={() => { setAddMenuOpen(false); router.push('/import' as any); }}>
              <View style={[styles.addMenuIcon, styles.addMenuIconGold]}><Icons.Sparkles size={20} color={COLORS.white} /></View>
              <View>
                <Text style={styles.addMenuTitle}>AI Planner</Text>
                <Text style={styles.addMenuSub}>Paste message to extract tasks</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.navy, letterSpacing: -0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  subtitle: { fontSize: 9, fontWeight: '800', color: '#8E9AAF', letterSpacing: 1.2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.navy, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  weekBtn: {},
  weekBtnText: { color: COLORS.white, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  divider: { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.25)' },
  focusCard: {
    backgroundColor: COLORS.navy,
    borderRadius: 32,
    padding: 24,
    marginBottom: 28,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.96 },
  focusTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  focusLabel: { fontSize: 9, fontWeight: '800', color: COLORS.gold, letterSpacing: 2.5 },
  urgencyPill: { backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  urgencyPillText: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.9)', letterSpacing: 1 },
  focusTitle: { fontSize: 22, fontWeight: '800', color: COLORS.white, marginBottom: 14, lineHeight: 28 },
  focusMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  focusMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  focusMetaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  focusMetaText: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.75)' },
  focusEmpty: { fontSize: 15, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', marginTop: 8 },
  shortcuts: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  shortcut: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  shortcutIcon: { marginBottom: 10 },
  shortcutLabel: { fontSize: 10, fontWeight: '800', color: '#8E9AAF', letterSpacing: 0.5 },
  timelineSection: { marginBottom: 28 },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginLeft: 10, marginBottom: 18 },
  timelineTitle: { fontSize: 10, fontWeight: '800', color: '#8E9AAF', letterSpacing: 2.5 },
  timelineDate: { fontSize: 8, fontWeight: '800', color: COLORS.gold, letterSpacing: 1 },
  timelineList: { marginLeft: 14, gap: 18 },
  timelineItem: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  timelineDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.white, borderWidth: 2.5, borderColor: COLORS.navy, marginTop: 5 },
  timelineCard: { flex: 1, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, padding: 18, borderRadius: 24 },
  timelineCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  timelineTime: { fontSize: 9, fontWeight: '800', color: COLORS.navy, letterSpacing: 0.5 },
  typeBadge: { backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  typeDeadline: { backgroundColor: '#fef2f2' },
  typeBadgeText: { fontSize: 8, fontWeight: '800', color: '#3b82f6' },
  typeDeadlineText: { color: '#ef4444' },
  timelineName: { fontSize: 13, fontWeight: '800', color: '#1A1C1E', lineHeight: 18 },
  timelineMeta: { fontSize: 9, fontWeight: '800', color: '#8E9AAF', marginTop: 6, letterSpacing: 0.5 },
  fab: { position: 'absolute', bottom: 100, right: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.navy, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.navy, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', paddingBottom: 100 },
  addMenuCard: { backgroundColor: COLORS.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 12, marginHorizontal: 20 },
  addMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18 },
  addMenuIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.navy, alignItems: 'center', justifyContent: 'center' },
  addMenuIconGold: { backgroundColor: COLORS.gold },
  addMenuTitle: { fontSize: 15, fontWeight: '800', color: '#1a1c1e' },
  addMenuSub: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  addMenuDivider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 18 },
});
