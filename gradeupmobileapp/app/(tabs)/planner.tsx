import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../../src/constants';
import { useAppContext } from '../../src/context/AppContext';
import { Priority, Task } from '../../src/types';

type ViewMode = 'week' | 'month' | 'all';

const WEEK_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEK_DATES = [23, 24, 25, 26, 27, 28, 29];
const MONTH_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function PlannerScreen() {
  const router = useRouter();
  const { tasks, setSelectedTask, toggleTaskDone } = useAppContext();
  const [view, setView] = useState<ViewMode>('week');
  const [activeDate, setActiveDate] = useState(26);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'ai' as const, text: "Focus on completing the CSC584 Backend API project by Dec 27. This clears your schedule before the Week 13 critical window when CSC584 and IPS551 assignments overlap." },
  ]);

  const hasTaskOnDay = (day: number) =>
    tasks.some((t) => {
      const d = parseInt(t.dueDate.split('-')[2]);
      const m = parseInt(t.dueDate.split('-')[1]);
      return d === day && (m === 12 || m === 1);
    });

  const monthDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < 6; i++) days.push(null); // Dec 1 is Sunday
    for (let i = 1; i <= 31; i++) days.push(i);
    return days;
  }, []);

  const filteredTasks = useMemo(() => {
    if (view === 'all') return [...tasks].sort((a, b) => (a.isDone === b.isDone ? 0 : a.isDone ? 1 : -1));
    return tasks
      .filter((t) => {
        const day = parseInt(t.dueDate.split('-')[2]);
        const month = parseInt(t.dueDate.split('-')[1]);
        return day === activeDate && (month === 12 || month === 1);
      })
      .sort((a, b) => (a.isDone === b.isDone ? 0 : a.isDone ? 1 : -1));
  }, [tasks, activeDate, view]);

  const handleSend = () => {
    if (!chatInput.trim()) return;
    setMessages((p) => [...p, { role: 'user', text: chatInput }]);
    setChatInput('');
    setTimeout(() => {
      setMessages((p) => [...p, { role: 'ai', text: "Understood. I've re-optimized your planner. CSC584 preparation time has been allocated for Friday morning." }]);
    }, 1200);
  };

  const renderTask = ({ item }: { item: Task }) => (
    <Pressable
      style={styles.taskCard}
      onPress={() => { setSelectedTask(item); router.push('/task-details' as any); }}
    >
      <Pressable
        style={[styles.checkbox, item.isDone && styles.checkboxDone]}
        onPress={() => toggleTaskDone(item.id)}
      >
        {item.isDone && <Feather name="check" size={12} color={COLORS.white} />}
      </Pressable>
      <View style={styles.taskContent}>
        <View style={styles.taskTopRow}>
          <Text style={styles.taskCourse}>{item.courseId}</Text>
          <Text style={styles.taskType}>{item.type}</Text>
        </View>
        <Text style={[styles.taskTitle, item.isDone && styles.taskTitleDone]} numberOfLines={2}>
          {item.courseId}: {item.title}
        </Text>
        <View style={styles.taskMetaRow}>
          <Feather name="calendar" size={11} color={COLORS.textSecondary} />
          <Text style={styles.taskMetaText}>{item.dueTime}</Text>
          <Feather name="trending-up" size={11} color={COLORS.textSecondary} />
          <Text style={styles.taskMetaText}>{item.effort}h Effort</Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Academic Planner</Text>
          <Text style={styles.subtitle}>DECEMBER 2024 {'\u2022'} W11</Text>
        </View>
        <View style={styles.viewToggle}>
          {(['week', 'month', 'all'] as ViewMode[]).map((v) => (
            <Pressable
              key={v}
              style={[styles.viewBtn, view === v && styles.viewBtnActive]}
              onPress={() => setView(v)}
            >
              <Text style={[styles.viewBtnText, view === v && styles.viewBtnTextActive]}>
                {v.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        renderItem={renderTask}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* AI Strategist Card */}
            <View style={styles.aiCard}>
              <View style={styles.aiCardHeader}>
                <View style={styles.aiIconWrap}>
                  <Feather name="clock" size={16} color={COLORS.white} />
                </View>
                <Text style={styles.aiCardTitle}>AI ACADEMIC STRATEGIST</Text>
              </View>
              <Text style={styles.aiCardText}>{messages[messages.length - 1]?.text}</Text>
              <View style={styles.aiCardFooter}>
                <View style={styles.aiDot} />
                <Text style={styles.aiFooterText}>SOW ALIGNMENT: 94%</Text>
              </View>
            </View>

            {/* Week Strip */}
            {view === 'week' && (
              <View style={styles.weekStrip}>
                {WEEK_LABELS.map((label, i) => {
                  const date = WEEK_DATES[i];
                  const isActive = date === activeDate;
                  return (
                    <Pressable key={i} style={styles.weekDay} onPress={() => setActiveDate(date)}>
                      <Text style={[styles.weekLabel, isActive && styles.weekLabelActive]}>{label}</Text>
                      <Text style={[styles.weekDate, isActive && styles.weekDateActive]}>{date}</Text>
                      {isActive && <View style={styles.weekIndicator} />}
                      {!isActive && hasTaskOnDay(date) && <View style={styles.weekTaskDot} />}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Month Grid */}
            {view === 'month' && (
              <View style={styles.monthCard}>
                <View style={styles.monthHeaders}>
                  {MONTH_HEADERS.map((h, i) => (
                    <Text key={i} style={styles.monthHeaderText}>{h}</Text>
                  ))}
                </View>
                <View style={styles.monthGrid}>
                  {monthDays.map((d, i) => (
                    <Pressable
                      key={i}
                      style={[styles.monthCell, d === activeDate && styles.monthCellActive]}
                      onPress={() => d && setActiveDate(d)}
                      disabled={!d}
                    >
                      {d && <Text style={[styles.monthCellText, d === activeDate && styles.monthCellTextActive]}>{d}</Text>}
                      {d && hasTaskOnDay(d) && d !== activeDate && <View style={styles.monthDot} />}
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Task list header */}
            <View style={styles.taskListHeader}>
              <Text style={styles.taskListLabel}>
                {view === 'all' ? 'ALL TASKS' : `${filteredTasks.length} DEADLINES ${'\u2022'} DEC ${activeDate}`}
              </Text>
              <Text style={styles.filterLabel}>FILTER</Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="check-circle" size={40} color={COLORS.border} />
            <Text style={styles.emptyText}>No tasks for this day</Text>
          </View>
        }
      />

      {/* AI FAB */}
      <Pressable style={styles.aiFab} onPress={() => setChatOpen(true)}>
        <Feather name="zap" size={22} color={COLORS.white} />
      </Pressable>

      {/* AI Chat Modal */}
      <Modal visible={chatOpen} animationType="slide" transparent>
        <Pressable style={styles.chatOverlay} onPress={() => setChatOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.chatSheet}>
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.chatSheetInner}>
              <View style={styles.chatHeader}>
                <View style={styles.chatHeaderLeft}>
                  <View style={styles.chatIcon}><Feather name="zap" size={16} color={COLORS.gold} /></View>
                  <View>
                    <Text style={styles.chatTitle}>AI Strategist</Text>
                    <Text style={styles.chatSub}>Academic Co-Pilot</Text>
                  </View>
                </View>
                <Pressable onPress={() => setChatOpen(false)}>
                  <Feather name="x" size={22} color="rgba(255,255,255,0.6)" />
                </Pressable>
              </View>
              <ScrollView style={styles.chatMessages} contentContainerStyle={{ padding: 16, gap: 10 }}>
                {messages.map((m, i) => (
                  <View key={i} style={[styles.chatBubble, m.role === 'user' ? styles.chatUser : styles.chatAi]}>
                    <Text style={[styles.chatBubbleText, m.role === 'user' && { color: COLORS.white }]}>{m.text}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.chatInputRow}>
                <TextInput
                  style={styles.chatInput}
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder="Type your plan or request..."
                  placeholderTextColor={COLORS.textSecondary}
                />
                <Pressable style={styles.chatSendBtn} onPress={handleSend}>
                  <Feather name="arrow-right" size={18} color={COLORS.white} />
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '900', color: COLORS.navy, letterSpacing: -0.5 },
  subtitle: { fontSize: 10, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 1.5, marginTop: 2 },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 3,
  },
  viewBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 11 },
  viewBtnActive: { backgroundColor: COLORS.navy },
  viewBtnText: { fontSize: 9, fontWeight: '900', color: COLORS.textSecondary, letterSpacing: 1.5 },
  viewBtnTextActive: { color: COLORS.white },

  listContent: { paddingHorizontal: 20, paddingBottom: 120 },

  // AI Card
  aiCard: {
    backgroundColor: COLORS.navy,
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
  },
  aiCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  aiIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiCardTitle: { fontSize: 10, fontWeight: '900', color: COLORS.white, letterSpacing: 2 },
  aiCardText: { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 20, fontWeight: '500', marginBottom: 14 },
  aiCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ade80' },
  aiFooterText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },

  // Week Strip
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  weekDay: { alignItems: 'center', flex: 1, paddingVertical: 8 },
  weekLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 10 },
  weekLabelActive: { color: COLORS.navy, fontWeight: '900' },
  weekDate: { fontSize: 22, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 },
  weekDateActive: { fontSize: 30, fontWeight: '900', color: COLORS.textPrimary },
  weekIndicator: { width: 24, height: 3, borderRadius: 2, backgroundColor: COLORS.navy },
  weekTaskDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.gold },

  // Month Grid
  monthCard: {
    backgroundColor: COLORS.white,
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
  },
  monthHeaders: { flexDirection: 'row', marginBottom: 8 },
  monthHeaderText: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '900', color: COLORS.textSecondary },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  monthCellActive: { backgroundColor: COLORS.navy },
  monthCellText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  monthCellTextActive: { color: COLORS.white, fontWeight: '900' },
  monthDot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.gold,
  },

  // Task list header
  taskListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  taskListLabel: { fontSize: 10, fontWeight: '900', color: COLORS.textSecondary, letterSpacing: 1.5 },
  filterLabel: { fontSize: 10, fontWeight: '700', color: COLORS.navy, letterSpacing: 1 },

  // Task Card
  taskCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    marginBottom: 12,
    alignItems: 'flex-start',
    gap: 14,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  checkboxDone: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  taskContent: { flex: 1 },
  taskTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  taskCourse: { fontSize: 10, fontWeight: '900', color: COLORS.textSecondary, letterSpacing: 1.5 },
  taskType: { fontSize: 9, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1, textTransform: 'uppercase' },
  taskTitle: { fontSize: 15, fontWeight: '900', color: COLORS.navy, lineHeight: 20, marginBottom: 8 },
  taskTitleDone: { textDecorationLine: 'line-through', opacity: 0.4 },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.6 },
  taskMetaText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },

  // FAB
  aiFab: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },

  // Chat Modal
  chatOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  chatSheet: { maxHeight: '80%' },
  chatSheetInner: { backgroundColor: COLORS.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.navy,
    padding: 20,
  },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chatIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatTitle: { fontSize: 14, fontWeight: '900', color: COLORS.white },
  chatSub: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5 },
  chatMessages: { maxHeight: 300, backgroundColor: '#f8fafc' },
  chatBubble: { maxWidth: '85%', padding: 14, borderRadius: 18 },
  chatAi: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  chatUser: { backgroundColor: COLORS.navy, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  chatBubbleText: { fontSize: 13, lineHeight: 19, color: COLORS.textPrimary, fontWeight: '500' },
  chatInputRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chatInput: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  chatSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
