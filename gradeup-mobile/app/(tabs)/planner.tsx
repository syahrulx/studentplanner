import { useState, useMemo } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Modal, TextInput, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';
import { Priority, TaskType } from '@/src/types';

const WEEK_DAYS = [
  { label: 'M', date: 23 }, { label: 'T', date: 24 }, { label: 'W', date: 25 },
  { label: 'T', date: 26 }, { label: 'F', date: 27 }, { label: 'S', date: 28 }, { label: 'S', date: 29 },
];

export default function Planner() {
  const { tasks, toggleTaskDone, addTask } = useApp();
  const [view, setView] = useState<'week' | 'month' | 'all'>('week');
  const [activeDate, setActiveDate] = useState(26);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'ai' | 'user'; text: string }[]>([
    { role: 'ai', text: "Hello! I've analyzed your schedule. Week 13 is critical for CSC584 & IPS551. Need help rescheduling any deadlines?" },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  const hasTaskOnDay = (day: number) =>
    tasks.some((t) => {
      const d = parseInt(t.dueDate.split('-')[2], 10);
      const m = parseInt(t.dueDate.split('-')[1], 10);
      return d === day && (m === 12 || m === 1);
    });

  const filteredTasks = useMemo(() => {
    if (view === 'all') {
      return [...tasks].sort((a, b) => (a.isDone === b.isDone ? 0 : a.isDone ? 1 : -1));
    }
    return tasks
      .filter((t) => {
        const day = parseInt(t.dueDate.split('-')[2], 10);
        const m = parseInt(t.dueDate.split('-')[1], 10);
        return day === activeDate && (m === 12 || m === 1);
      })
      .sort((a, b) => (a.isDone === b.isDone ? 0 : a.isDone ? 1 : -1));
  }, [tasks, activeDate, view]);

  const handleAiSend = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.toLowerCase();
    const originalMsg = chatInput;
    setMessages((prev) => [...prev, { role: 'user', text: chatInput }]);
    setChatInput('');
    setIsProcessing(true);

    const isAddTask =
      (userMsg.includes('add') && userMsg.includes('task')) ||
      (userMsg.includes('create') && userMsg.includes('task')) ||
      userMsg.includes('new task');
    const isWhatsAppMessage =
      userMsg.includes('submission') || userMsg.includes('assignment') || userMsg.includes('lab') || userMsg.includes('deadline') || userMsg.includes('hantar');

    setTimeout(() => {
      if (isAddTask || isWhatsAppMessage) {
        let title = 'Lab Assignment';
        if (userMsg.includes('lab')) title = 'Lab Assignment cum Practice';
        if (userMsg.includes('quiz')) title = 'Quiz';
        if (userMsg.includes('project')) title = 'Project Submission';
        let extractedDate = '2026-01-29';
        const dateMatch = originalMsg.match(/(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})/i);
        if (dateMatch) {
          const day = dateMatch[1].padStart(2, '0');
          const months: Record<string, string> = {
            january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
            july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
          };
          extractedDate = `${dateMatch[3]}-${months[dateMatch[2].toLowerCase()]}-${day}`;
        }
        const newTask = {
          id: `t${Date.now()}`,
          title,
          courseId: 'CSC584',
          type: TaskType.Lab,
          dueDate: extractedDate,
          dueTime: '23:59',
          priority: Priority.High,
          effort: 6,
          notes: originalMsg.substring(0, 200),
          isDone: false,
          deadlineRisk: 'High' as const,
          suggestedWeek: 13,
          sourceMessage: originalMsg,
        };
        addTask(newTask);
        setMessages((prev) => [
          ...prev,
          { role: 'ai', text: `✅ Task extracted!\n\n📝 ${title}\n📅 Due: ${extractedDate}\n⚡ Priority: High\n\nI've added this to your planner.` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'ai', text: "Understood. I've re-optimized your planner. CSC584 preparation time has been allocated for Friday morning." },
        ]);
      }
      setIsProcessing(false);
    }, 1500);
  };

  const getUrgency = (dueDate: string) => {
    if (dueDate === '2024-12-26') return 'DUE TODAY';
    if (dueDate === '2024-12-27') return 'DUE TOMORROW';
    const [, m, d] = dueDate.split('-');
    return `DUE ${m}/${d}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Task Planner</Text>
          <Text style={styles.subtitle}>DECEMBER • WEEK 11</Text>
        </View>
        <View style={styles.viewToggle}>
          <Pressable style={[styles.viewBtn, view === 'week' && styles.viewBtnActive]} onPress={() => setView('week')}>
            <Text style={[styles.viewBtnText, view === 'week' && styles.viewBtnTextActive]}>Week</Text>
          </Pressable>
          <Pressable style={[styles.viewBtn, view === 'month' && styles.viewBtnActive]} onPress={() => setView('month')}>
            <Text style={[styles.viewBtnText, view === 'month' && styles.viewBtnTextActive]}>Month</Text>
          </Pressable>
          <Pressable style={[styles.viewBtn, view === 'all' && styles.viewBtnActive]} onPress={() => setView('all')}>
            <Text style={[styles.viewBtnText, view === 'all' && styles.viewBtnTextActive]}>All</Text>
          </Pressable>
        </View>
      </View>

      {view === 'week' && (
        <View style={styles.weekStrip}>
          {WEEK_DAYS.map((day) => {
            const isSelected = activeDate === day.date;
            const hasTask = hasTaskOnDay(day.date);
            return (
              <Pressable key={day.date} style={[styles.weekDay, isSelected && styles.weekDaySelected]} onPress={() => setActiveDate(day.date)}>
                <Text style={styles.weekDayLabel}>{day.label}</Text>
                <Text style={[styles.weekDayNum, isSelected && styles.weekDayNumSelected]}>{day.date}</Text>
                <View style={[styles.weekDayDot, hasTask && styles.weekDayDotActive]} />
              </Pressable>
            );
          })}
        </View>
      )}

      {view === 'month' && (
        <View style={styles.monthGrid}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
            <Text key={d} style={styles.monthHead}>{d}</Text>
          ))}
          {[null, null, null, null, null, null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31].map((d, i) =>
            d ? (
              <Pressable
                key={i}
                style={[styles.monthCell, d === activeDate && styles.monthCellSelected]}
                onPress={() => setActiveDate(d)}
              >
                <Text style={[styles.monthCellText, d === activeDate && styles.monthCellTextSelected]}>{d}</Text>
                {hasTaskOnDay(d) && d !== activeDate && <View style={styles.monthCellDot} />}
              </Pressable>
            ) : (
              <View key={i} style={styles.monthCell} />
            )
          )}
        </View>
      )}

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{view === 'all' ? 'All Assignments' : `Deadlines • Dec ${activeDate}`}</Text>
        <Text style={styles.listCount}>{filteredTasks.length} Tasks</Text>
      </View>

      {filteredTasks.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}><Icons.CheckCircle size={32} color={COLORS.border} /></View>
          <Text style={styles.emptyTitle}>No tasks for today</Text>
          <Text style={styles.emptySub}>Enjoy your free time!</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.taskCard, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/task-details' as any, params: { id: item.id } })}
            >
              <Pressable onPress={(e) => { e.stopPropagation(); toggleTaskDone(item.id); }} style={[styles.checkbox, item.isDone && styles.checkboxDone]}>
                <Icons.CheckCircle size={14} color={item.isDone ? COLORS.white : 'transparent'} />
              </Pressable>
              <View style={styles.taskBody}>
                <View style={styles.taskRow}>
                  <Text style={styles.taskCourse}>{item.courseId}</Text>
                  <View style={[styles.priorityBadge, item.priority === Priority.High && styles.priorityHigh]}>
                    <Text style={[styles.priorityText, item.priority === Priority.High && styles.priorityHighText]}>{item.priority}</Text>
                  </View>
                </View>
                <Text style={[styles.taskTitle, item.isDone && styles.taskDone]} numberOfLines={2}>{item.title}</Text>
                <View style={styles.taskMeta}>
                  <Icons.Calendar size={14} color={COLORS.gray} />
                  <Text style={styles.taskMetaText}>{item.dueTime}</Text>
                  <View style={styles.taskMetaDot} />
                  <Icons.TrendingUp size={14} color={COLORS.gray} />
                  <Text style={styles.taskMetaText}>{item.effort}h Effort</Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}

      <View style={styles.fabRow}>
        <Pressable style={({ pressed }) => [styles.fab, pressed && styles.pressed]} onPress={() => setIsChatOpen(true)}>
          <Icons.Sparkles size={22} color={COLORS.white} />
        </Pressable>
        <Pressable style={({ pressed }) => [styles.fab, pressed && styles.pressed]} onPress={() => router.push('/add-task' as any)}>
          <Icons.Plus size={24} color={COLORS.white} />
        </Pressable>
      </View>

      <Modal visible={isChatOpen} animationType="slide" transparent>
        <Pressable style={styles.chatOverlay} onPress={() => setIsChatOpen(false)}>
          <View style={styles.chatSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.chatHeader}>
              <View style={styles.chatHeaderLeft}>
                <View style={styles.chatHeaderIcon}><Icons.Sparkles size={20} color={COLORS.gold} /></View>
                <View>
                  <Text style={styles.chatHeaderTitle}>AI Strategist</Text>
                  <Text style={styles.chatHeaderSub}>Academic Co-Pilot</Text>
                </View>
              </View>
              <Pressable onPress={() => setIsChatOpen(false)}><Icons.Plus size={24} color={COLORS.white} style={{ transform: [{ rotate: '45deg' }] }} /></Pressable>
            </View>
            <ScrollView style={styles.chatMessages} contentContainerStyle={styles.chatMessagesContent}>
              {messages.map((m, i) => (
                <View key={i} style={[styles.chatBubbleWrap, m.role === 'user' && styles.chatBubbleRight]}>
                  <View style={[styles.chatBubble, m.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAi]}>
                    <Text style={[styles.chatBubbleText, m.role === 'user' && styles.chatBubbleTextUser]}>{m.text}</Text>
                  </View>
                </View>
              ))}
              {isProcessing && (
                <View style={styles.chatBubbleWrap}>
                  <View style={[styles.chatBubble, styles.chatBubbleAi]}><Text style={styles.chatBubbleText}>Analyzing...</Text></View>
                </View>
              )}
            </ScrollView>
            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Type your plan or request..."
                placeholderTextColor={COLORS.gray}
                onSubmitEditing={handleAiSend}
              />
              <Pressable style={[styles.chatSend, (!chatInput.trim() || isProcessing) && styles.chatSendDisabled]} onPress={handleAiSend} disabled={!chatInput.trim() || isProcessing}>
                <Icons.ArrowRight size={20} color={COLORS.white} />
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 20 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.navy, letterSpacing: -0.5 },
  subtitle: { fontSize: 9, fontWeight: '800', color: '#8E9AAF', marginTop: 4, letterSpacing: 1 },
  viewToggle: { flexDirection: 'row', backgroundColor: COLORS.white, padding: 5, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, marginTop: 16 },
  viewBtn: { flex: 1, paddingVertical: 9, borderRadius: 14, alignItems: 'center' },
  viewBtnActive: { backgroundColor: COLORS.navy },
  viewBtnText: { fontSize: 9, fontWeight: '800', color: COLORS.gray, letterSpacing: 1 },
  viewBtnTextActive: { color: COLORS.white },
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: 28 },
  weekDay: { alignItems: 'center', gap: 10 },
  weekDaySelected: { transform: [{ scale: 1.08 }] },
  weekDayLabel: { fontSize: 9, fontWeight: '800', color: COLORS.gray, letterSpacing: 0.5 },
  weekDayNum: { fontSize: 20, fontWeight: '800', color: COLORS.gray },
  weekDayNumSelected: { color: COLORS.navy },
  weekDayDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'transparent' },
  weekDayDotActive: { backgroundColor: COLORS.gold },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: COLORS.white, borderRadius: 28, padding: 20, marginHorizontal: 24, marginBottom: 28, borderWidth: 1, borderColor: COLORS.border },
  monthHead: { width: '14.28%', textAlign: 'center', fontSize: 10, fontWeight: '800', color: COLORS.gray, marginBottom: 12 },
  monthCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 14 },
  monthCellSelected: { backgroundColor: COLORS.navy },
  monthCellText: { fontSize: 13, fontWeight: '700', color: COLORS.gray },
  monthCellTextSelected: { color: COLORS.white },
  monthCellDot: { position: 'absolute', bottom: 5, width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.gold },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 28, marginBottom: 16 },
  listTitle: { fontSize: 13, fontWeight: '800', color: COLORS.navy, letterSpacing: 0.5 },
  listCount: { fontSize: 10, fontWeight: '800', color: COLORS.gray },
  list: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 120 },
  taskCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.white, padding: 20, borderRadius: 24, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border },
  pressed: { opacity: 0.96 },
  checkbox: { width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginRight: 16, marginTop: 1 },
  checkboxDone: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  taskBody: { flex: 1 },
  taskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  taskCourse: { fontSize: 9, fontWeight: '800', color: '#8E9AAF', letterSpacing: 0.5 },
  priorityBadge: { backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  priorityHigh: { backgroundColor: '#fef2f2' },
  priorityText: { fontSize: 8, fontWeight: '800', color: '#3b82f6' },
  priorityHighText: { color: '#ef4444' },
  taskTitle: { fontSize: 15, fontWeight: '800', color: COLORS.navy, lineHeight: 20 },
  taskDone: { textDecorationLine: 'line-through', opacity: 0.4 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  taskMetaText: { fontSize: 10, fontWeight: '700', color: COLORS.gray },
  taskMetaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.gray },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyIcon: { width: 72, height: 72, backgroundColor: COLORS.bg, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: COLORS.gray },
  emptySub: { fontSize: 11, color: COLORS.gray, marginTop: 6 },
  fabRow: { position: 'absolute', bottom: 28, right: 24, flexDirection: 'row', gap: 14 },
  fab: { width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.navy, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.navy, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6 },
  chatOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  chatSheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '88%' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24, backgroundColor: COLORS.navy },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  chatHeaderIcon: { width: 44, height: 44, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  chatHeaderTitle: { fontSize: 15, fontWeight: '800', color: COLORS.white },
  chatHeaderSub: { fontSize: 9, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  chatMessages: { maxHeight: 360, backgroundColor: COLORS.bg },
  chatMessagesContent: { padding: 24, gap: 18 },
  chatBubbleWrap: { alignItems: 'flex-start' },
  chatBubbleRight: { alignItems: 'flex-end' },
  chatBubble: { maxWidth: '82%', padding: 16, borderRadius: 22, borderTopLeftRadius: 6 },
  chatBubbleAi: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  chatBubbleUser: { backgroundColor: COLORS.navy },
  chatBubbleText: { fontSize: 13, color: COLORS.navy, lineHeight: 18 },
  chatBubbleTextUser: { color: COLORS.white },
  chatInputRow: { flexDirection: 'row', gap: 12, padding: 18, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.border },
  chatInput: { flex: 1, backgroundColor: COLORS.bg, borderRadius: 22, paddingHorizontal: 20, paddingVertical: 14, fontSize: 14 },
  chatSend: { width: 50, height: 50, borderRadius: 22, backgroundColor: COLORS.navy, alignItems: 'center', justifyContent: 'center' },
  chatSendDisabled: { opacity: 0.5 },
});
