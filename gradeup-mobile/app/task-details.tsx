import { View, Text, Pressable, ScrollView, StyleSheet, Share, Alert, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { formatDisplayDate } from '@/src/utils/date';
import { Priority } from '@/src/types';
import { useTranslations } from '@/src/i18n';

// Consistent navy/gold theme
const NAVY = '#003366';
const GOLD = '#f59e0b';
const BG = '#f8fafc';
const CARD = '#ffffff';
const BORDER = '#e2e8f0';
const TEXT_PRIMARY = '#0f172a';
const TEXT_SECONDARY = '#64748b';
const RED = '#ef4444';

const PRIORITY_CONFIG = {
  [Priority.High]: { bg: 'rgba(239,68,68,0.08)', color: '#dc2626', label: 'High' },
  [Priority.Medium]: { bg: 'rgba(245,158,11,0.08)', color: '#d97706', label: 'Medium' },
  [Priority.Low]: { bg: 'rgba(34,197,94,0.08)', color: '#16a34a', label: 'Low' },
} as const;

function getDaysUntilDue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T23:59:59');
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 864e5);
}

export default function TaskDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tasks, toggleTaskDone, deleteTask, language } = useApp();
  const T = useTranslations(language);
  const task = tasks.find((t) => t.id === id);

  if (!task) {
    return (
      <View style={s.emptyContainer}>
        <View style={s.emptyIcon}>
          <Feather name="alert-circle" size={32} color={TEXT_SECONDARY} />
        </View>
        <Text style={s.emptyTitle}>{T('taskNotFound')}</Text>
        <Pressable onPress={() => router.back()} style={s.emptyBackBtn}>
          <Text style={s.emptyBackText}>{T('back')}</Text>
        </Pressable>
      </View>
    );
  }

  const daysLeft = getDaysUntilDue(task.dueDate);
  const isOverdue = daysLeft < 0;
  const isDueSoon = !isOverdue && daysLeft <= 3;
  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG[Priority.Low];

  const handleDelete = () => {
    Alert.alert(
      T('deleteTask'),
      `"${task.title}" ${T('deleteTaskDesc')}`,
      [
        { text: T('cancel'), style: 'cancel' },
        { text: T('delete'), style: 'destructive', onPress: () => { deleteTask(task.id); router.back(); } },
      ]
    );
  };

  const handleToggle = () => {
    if (task.isDone) {
      Alert.alert(T('markAsNotDone'), `"${task.title}" ${T('markAsIncomplete')}`, [
        { text: T('cancel'), style: 'cancel' },
        { text: T('undo'), onPress: () => toggleTaskDone(task.id) },
      ]);
    } else {
      Alert.alert(T('markAsDoneQuestion'), `"${task.title}" ${T('markAsCompleted')}`, [
        { text: T('cancel'), style: 'cancel' },
        { text: T('markDone'), onPress: () => toggleTaskDone(task.id) },
      ]);
    }
  };

  const handleShare = () => {
    Share.share({
      message: `${task.title} (${task.courseId}) – Due ${formatDisplayDate(task.dueDate)} ${task.dueTime}`,
      title: 'Task',
    });
  };

  const sourceMessage = task.sourceMessage || 'Assalammualaikum students. Sila hantar Lab 4 sebelum Jumaat ni jam 11:59PM. Make sure follow format normalization yang saya ajar tadi. TQ.';

  const urgencyLabel = isOverdue
    ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} overdue`
    : daysLeft === 0 ? 'Due today'
    : daysLeft === 1 ? 'Due tomorrow'
    : `${daysLeft} days left`;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.headerBtn}>
          <Feather name="chevron-left" size={24} color={TEXT_PRIMARY} />
        </Pressable>
        <Text style={s.headerTitle}>Task Details</Text>
        <Pressable onPress={handleShare} style={s.headerBtn}>
          <Feather name="share" size={20} color={TEXT_PRIMARY} />
        </Pressable>
      </View>

      <ScrollView 
        style={s.scroll} 
        contentContainerStyle={s.scrollContent} 
        showsVerticalScrollIndicator={false}
      >
        {/* Status Badge Row */}
        <View style={s.badgeRow}>
          <View style={s.badgeCourse}>
            <Text style={s.badgeCourseText}>{task.courseId}</Text>
          </View>
          <View style={s.badgeType}>
            <Text style={s.badgeTypeText}>{task.type}</Text>
          </View>
          {task.isDone && (
            <View style={s.badgeDone}>
              <Feather name="check" size={12} color="#16a34a" />
              <Text style={s.badgeDoneText}>{T('completed')}</Text>
            </View>
          )}
        </View>

        {/* Title */}
        <Text style={s.title}>{task.title}</Text>

        {/* Urgency Pill */}
        <View style={[s.urgencyPill, isOverdue && s.urgencyOverdue, isDueSoon && s.urgencySoon]}>
          <Feather 
            name={isOverdue ? 'alert-triangle' : 'clock'} 
            size={14} 
            color={isOverdue ? RED : isDueSoon ? '#d97706' : NAVY} 
          />
          <Text style={[s.urgencyText, isOverdue && { color: RED }, isDueSoon && { color: '#d97706' }]}>
            {urgencyLabel}
          </Text>
        </View>

        {/* Info Cards */}
        <View style={s.infoGrid}>
          <View style={s.infoCard}>
            <View style={[s.infoIconWrap, { backgroundColor: 'rgba(0,51,102,0.06)' }]}>
              <Feather name="calendar" size={18} color={NAVY} />
            </View>
            <View>
              <Text style={s.infoLabel}>{T('dueDate')}</Text>
              <Text style={s.infoValue}>{formatDisplayDate(task.dueDate)}</Text>
            </View>
          </View>

          <View style={s.infoCard}>
            <View style={[s.infoIconWrap, { backgroundColor: 'rgba(0,51,102,0.06)' }]}>
              <Feather name="clock" size={18} color={NAVY} />
            </View>
            <View>
              <Text style={s.infoLabel}>{T('deadline')}</Text>
              <Text style={s.infoValue}>{(task.dueTime || '').slice(0, 5)}</Text>
            </View>
          </View>

          <View style={s.infoCard}>
            <View style={[s.infoIconWrap, { backgroundColor: priorityConfig.bg }]}>
              <Feather name="flag" size={18} color={priorityConfig.color} />
            </View>
            <View>
              <Text style={s.infoLabel}>{T('priority')}</Text>
              <Text style={[s.infoValue, { color: priorityConfig.color }]}>{priorityConfig.label}</Text>
            </View>
          </View>

          <View style={s.infoCard}>
            <View style={[s.infoIconWrap, { backgroundColor: 'rgba(245,158,11,0.06)' }]}>
              <Feather name="zap" size={18} color={GOLD} />
            </View>
            <View>
              <Text style={s.infoLabel}>{T('estEffort')}</Text>
              <Text style={s.infoValue}>{task.effort} {T('hours')}</Text>
            </View>
          </View>
        </View>


        {/* Notes — only shown if notes exist */}
        {task.notes ? (
        <View style={s.notesSection}>
          <View style={s.notesSectionHeader}>
            <Feather name="file-text" size={14} color={TEXT_SECONDARY} />
            <Text style={s.notesSectionTitle}>{T('notesLabel')}</Text>
          </View>
          <View style={s.notesCard}>
            <Text style={s.notesBody}>{task.notes}</Text>
          </View>
        </View>
        ) : null}

        {/* Source Section — only shown for AI-extracted tasks */}
        {task.sourceMessage ? (
        <View style={s.sourceSection}>
          <View style={s.sourceHeaderRow}>
            <Text style={s.sourceSectionTitle}>{T('whatsappSource')}</Text>
            <View style={s.verifiedPill}>
              <View style={s.verifiedDot} />
              <Text style={s.verifiedLabel}>{T('verifiedByAi')}</Text>
            </View>
          </View>
          <View style={s.sourceCard}>
            <View style={s.sourceTagWrap}>
              <Feather name="message-circle" size={12} color={TEXT_SECONDARY} />
              <Text style={s.sourceTagText}>{T('messageLog')}</Text>
            </View>
            <Text style={s.sourceBody}>"{task.sourceMessage}"</Text>
            <Text style={s.sourceTimestamp}>
              {`${T('extractedOn')} ${formatDisplayDate(task.dueDate)} • ${(task.dueTime || '').slice(0, 5)}`}
            </Text>
          </View>
        </View>
        ) : null}
      </ScrollView>

      {/* Sticky Bottom Actions */}
      <View style={s.bottomBar}>
        <Pressable onPress={handleDelete} style={({ pressed }) => [s.actionBtn, s.deleteBtn, pressed && { opacity: 0.7 }]}>
          <Feather name="trash-2" size={20} color={RED} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.mainActionBtn, task.isDone && s.mainActionBtnDone, pressed && { opacity: 0.85 }]}
          onPress={handleToggle}
        >
          <Feather name={task.isDone ? 'rotate-ccw' : 'check'} size={20} color="#ffffff" />
          <Text style={s.mainActionText}>
            {task.isDone ? T('completed') : T('markAsDone')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Empty state
  emptyContainer: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: TEXT_SECONDARY, marginBottom: 24 },
  emptyBackBtn: { paddingVertical: 14, paddingHorizontal: 32, backgroundColor: NAVY, borderRadius: 16 },
  emptyBackText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 16,
    backgroundColor: BG,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: TEXT_PRIMARY, letterSpacing: -0.3 },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },

  // Badges
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  badgeCourse: { backgroundColor: NAVY, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12 },
  badgeCourseText: { color: '#ffffff', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  badgeType: { backgroundColor: '#f1f5f9', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12 },
  badgeTypeText: { color: TEXT_SECONDARY, fontSize: 12, fontWeight: '700' },
  badgeDone: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(34,197,94,0.08)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  badgeDoneText: { color: '#16a34a', fontSize: 12, fontWeight: '700' },

  // Title
  title: { fontSize: 26, fontWeight: '800', color: TEXT_PRIMARY, lineHeight: 32, letterSpacing: -0.5, marginBottom: 14 },

  // Urgency
  urgencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(0,51,102,0.05)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 28,
  },
  urgencyOverdue: { backgroundColor: 'rgba(239,68,68,0.06)' },
  urgencySoon: { backgroundColor: 'rgba(245,158,11,0.06)' },
  urgencyText: { fontSize: 13, fontWeight: '700', color: NAVY },

  // Info Grid
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '47%',
    backgroundColor: CARD,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  infoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: { fontSize: 10, fontWeight: '700', color: TEXT_SECONDARY, letterSpacing: 0.8, marginBottom: 2 },
  infoValue: { fontSize: 15, fontWeight: '800', color: TEXT_PRIMARY },

  // Risk Card
  riskCard: {
    backgroundColor: NAVY,
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
  },
  riskCardHigh: { backgroundColor: '#dc2626' },
  riskHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  riskIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskTitle: { fontSize: 12, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  riskBody: { fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 21, fontWeight: '500' },

  // Source
  sourceSection: { marginBottom: 24 },
  sourceHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sourceSectionTitle: { fontSize: 12, fontWeight: '800', color: TEXT_SECONDARY, letterSpacing: 0.5 },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  verifiedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#059669' },
  verifiedLabel: { fontSize: 11, fontWeight: '700', color: '#059669' },
  sourceCard: {
    backgroundColor: CARD,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  sourceTagWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sourceTagText: { fontSize: 11, fontWeight: '700', color: TEXT_SECONDARY },
  sourceBody: { fontSize: 14, color: TEXT_PRIMARY, fontStyle: 'italic', lineHeight: 22, fontWeight: '500' },
  sourceTimestamp: { fontSize: 12, fontWeight: '600', color: TEXT_SECONDARY, marginTop: 14 },

  // Notes
  notesSection: { marginBottom: 24 },
  notesSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  notesSectionTitle: { fontSize: 12, fontWeight: '800', color: TEXT_SECONDARY, letterSpacing: 0.5 },
  notesCard: {
    backgroundColor: CARD,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  notesBody: { fontSize: 14, color: TEXT_PRIMARY, lineHeight: 22, fontWeight: '500' },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    gap: 12,
    backgroundColor: CARD,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  actionBtn: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.12)',
  },
  mainActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    backgroundColor: NAVY,
    borderRadius: 20,
  },
  mainActionBtnDone: { backgroundColor: TEXT_SECONDARY },
  mainActionText: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
});
