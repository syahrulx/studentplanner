import { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Share, Alert, Platform, Modal } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { formatDisplayDate, getTodayISO, getMonthYearLabel, getMonthGrid, toISO } from '@/src/utils/date';
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

const EFFORT_OPTIONS = [1, 2, 4, 6, 8, 12, 20];
const TIME_OPTIONS = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    out.push(`${String(h).padStart(2, '0')}:30`);
  }
  return out;
})();

export default function TaskDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tasks, toggleTaskDone, deleteTask, updateTask, language } = useApp();
  const T = useTranslations(language);
  const task = tasks.find((t) => t.id === id);

  const [isEditing, setIsEditing] = useState(false);
  const [editDueDate, setEditDueDate] = useState('');
  const [editDueTime, setEditDueTime] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>(Priority.Medium);
  const [editEffort, setEditEffort] = useState(4);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [showEffortModal, setShowEffortModal] = useState(false);
  const [pickerViewDate, setPickerViewDate] = useState(getTodayISO);

  useEffect(() => {
    if (task) {
      setEditDueDate(task.dueDate);
      setEditDueTime((task.dueTime || '23:59').slice(0, 5));
      setEditPriority(task.priority);
      setEditEffort(task.effort);
    }
  }, [task?.id]);

  const handleDoneEditing = () => {
    if (!task) return;
    updateTask(String(task.id), {
      dueDate: editDueDate,
      dueTime: editDueTime.length === 5 ? editDueTime : editDueTime + ':00',
      priority: editPriority,
      effort: editEffort,
    });
    setIsEditing(false);
  };

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

        {/* Info Cards — when isEditing, tap to open picker */}
        {(() => {
          const displayDate = isEditing ? editDueDate : task.dueDate;
          const displayTime = isEditing ? editDueTime : (task.dueTime || '').slice(0, 5);
          const displayPriority = isEditing ? editPriority : task.priority;
          const displayEffort = isEditing ? editEffort : task.effort;
          const displayPriorityConfig = PRIORITY_CONFIG[displayPriority] || PRIORITY_CONFIG[Priority.Low];
          return (
            <View style={s.infoGrid}>
              <Pressable
                style={s.infoCard}
                onPress={isEditing ? () => { setPickerViewDate(displayDate); setShowDateModal(true); } : undefined}
                disabled={!isEditing}
              >
                <View style={[s.infoIconWrap, { backgroundColor: 'rgba(0,51,102,0.06)' }]}>
                  <Feather name="calendar" size={18} color={NAVY} />
                </View>
                <View>
                  <Text style={s.infoLabel}>{T('dueDate')}</Text>
                  <Text style={s.infoValue}>{formatDisplayDate(displayDate)}</Text>
                </View>
              </Pressable>

              <Pressable
                style={s.infoCard}
                onPress={isEditing ? () => setShowTimeModal(true) : undefined}
                disabled={!isEditing}
              >
                <View style={[s.infoIconWrap, { backgroundColor: 'rgba(0,51,102,0.06)' }]}>
                  <Feather name="clock" size={18} color={NAVY} />
                </View>
                <View>
                  <Text style={s.infoLabel}>{T('deadline')}</Text>
                  <Text style={s.infoValue}>{displayTime || '—'}</Text>
                </View>
              </Pressable>

              <Pressable
                style={s.infoCard}
                onPress={isEditing ? () => setShowPriorityModal(true) : undefined}
                disabled={!isEditing}
              >
                <View style={[s.infoIconWrap, { backgroundColor: displayPriorityConfig.bg }]}>
                  <Feather name="flag" size={18} color={displayPriorityConfig.color} />
                </View>
                <View>
                  <Text style={s.infoLabel}>{T('priority')}</Text>
                  <Text style={[s.infoValue, { color: displayPriorityConfig.color }]}>{displayPriorityConfig.label}</Text>
                </View>
              </Pressable>

              <Pressable
                style={s.infoCard}
                onPress={isEditing ? () => setShowEffortModal(true) : undefined}
                disabled={!isEditing}
              >
                <View style={[s.infoIconWrap, { backgroundColor: 'rgba(245,158,11,0.06)' }]}>
                  <Feather name="zap" size={18} color={GOLD} />
                </View>
                <View>
                  <Text style={s.infoLabel}>{T('estEffort')}</Text>
                  <Text style={s.infoValue}>{displayEffort} {T('hours')}</Text>
                </View>
              </Pressable>
            </View>
          );
        })()}


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

      {/* Edit modals */}
      <Modal visible={showDateModal} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={() => setShowDateModal(false)}>
          <View style={s.pickerCard} onStartShouldSetResponder={() => true}>
            <Text style={s.pickerTitle}>{T('dueDate')}</Text>
            {(() => {
              const y = new Date(pickerViewDate + 'T12:00:00').getFullYear();
              const m = new Date(pickerViewDate + 'T12:00:00').getMonth();
              const grid = getMonthGrid(y, m);
              return (
                <>
                  <View style={s.calendarNav}>
                    <Pressable onPress={() => { const d = new Date(y, m - 1, 1); setPickerViewDate(toISO(d.getFullYear(), d.getMonth(), 1)); }} hitSlop={8}>
                      <Feather name="chevron-left" size={24} color={TEXT_PRIMARY} />
                    </Pressable>
                    <Text style={s.calendarNavTitle}>{getMonthYearLabel(pickerViewDate)}</Text>
                    <Pressable onPress={() => { const d = new Date(y, m + 1, 1); setPickerViewDate(toISO(d.getFullYear(), d.getMonth(), 1)); }} hitSlop={8}>
                      <Feather name="chevron-right" size={24} color={TEXT_PRIMARY} />
                    </Pressable>
                  </View>
                  <View style={s.calendarWeekRow}>
                    {['S','M','T','W','T','F','S'].map((day, i) => <Text key={i} style={s.calendarWeekText}>{day}</Text>)}
                  </View>
                  <View style={s.calendarGrid}>
                    {grid.map((day, i) => {
                      if (day == null) return <View key={i} style={s.calendarCellEmpty} />;
                      const iso = toISO(y, m, day);
                      const isSelected = iso === editDueDate;
                      return (
                        <Pressable
                          key={i}
                          style={s.calendarCell}
                          onPress={() => { setEditDueDate(iso); setShowDateModal(false); }}
                        >
                          <View style={[s.calendarDayBubble, isSelected && s.calendarDayBubbleSelected]}>
                            <Text style={[s.calendarCellText, isSelected && s.calendarCellSelected]}>{day}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              );
            })()}
            <Pressable style={s.pickerClose} onPress={() => setShowDateModal(false)}>
              <Text style={s.pickerCloseText}>{T('cancel')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showTimeModal} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={() => setShowTimeModal(false)}>
          <View style={s.pickerCard} onStartShouldSetResponder={() => true}>
            <Text style={s.pickerTitle}>{T('deadline')}</Text>
            <ScrollView style={s.timeList} contentContainerStyle={s.timeListContent}>
              {TIME_OPTIONS.map((t) => (
                <Pressable
                  key={t}
                  style={[s.timeOption, editDueTime === t && s.timeOptionActive]}
                  onPress={() => { setEditDueTime(t); setShowTimeModal(false); }}
                >
                  <Text style={[s.timeOptionText, editDueTime === t && s.timeOptionTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={s.pickerClose} onPress={() => setShowTimeModal(false)}>
              <Text style={s.pickerCloseText}>{T('cancel')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showPriorityModal} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={() => setShowPriorityModal(false)}>
          <View style={s.pickerCard} onStartShouldSetResponder={() => true}>
            <Text style={s.pickerTitle}>{T('priority')}</Text>
            {(Object.values(Priority) as Priority[]).map((p) => {
              const cfg = PRIORITY_CONFIG[p];
              return (
                <Pressable
                  key={p}
                  style={[s.priorityOption, editPriority === p && s.priorityOptionActive]}
                  onPress={() => { setEditPriority(p); setShowPriorityModal(false); }}
                >
                  <Text style={[s.priorityOptionText, editPriority === p && { color: cfg.color }]}>{cfg.label}</Text>
                </Pressable>
              );
            })}
            <Pressable style={s.pickerClose} onPress={() => setShowPriorityModal(false)}>
              <Text style={s.pickerCloseText}>{T('cancel')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showEffortModal} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={() => setShowEffortModal(false)}>
          <View style={s.pickerCard} onStartShouldSetResponder={() => true}>
            <Text style={s.pickerTitle}>{T('estEffort')} ({T('hours')})</Text>
            <View style={s.effortRow}>
              {EFFORT_OPTIONS.map((n) => (
                <Pressable
                  key={n}
                  style={[s.effortChip, editEffort === n && s.effortChipActive]}
                  onPress={() => { setEditEffort(n); setShowEffortModal(false); }}
                >
                  <Text style={[s.effortChipText, editEffort === n && s.effortChipTextActive]}>{n}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={s.pickerClose} onPress={() => setShowEffortModal(false)}>
              <Text style={s.pickerCloseText}>{T('cancel')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Sticky Bottom Actions: Delete, Edit/Done, Mark as done */}
      <View style={s.bottomBar}>
        <Pressable onPress={handleDelete} style={({ pressed }) => [s.actionBtn, s.deleteBtn, pressed && { opacity: 0.7 }]}>
          <Feather name="trash-2" size={20} color={RED} />
        </Pressable>
        {isEditing ? (
          <Pressable onPress={handleDoneEditing} style={({ pressed }) => [s.actionBtn, s.editBtn, pressed && { opacity: 0.7 }]}>
            <Text style={s.editBtnText}>{T('done')}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setIsEditing(true)} style={({ pressed }) => [s.actionBtn, s.editBtn, pressed && { opacity: 0.7 }]}>
            <Feather name="edit-2" size={20} color={NAVY} />
          </Pressable>
        )}
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

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  pickerCard: { backgroundColor: CARD, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: BORDER },
  pickerTitle: { fontSize: 16, fontWeight: '800', color: TEXT_PRIMARY, marginBottom: 16 },
  pickerClose: { marginTop: 16, paddingVertical: 12, alignItems: 'center' },
  pickerCloseText: { fontSize: 15, fontWeight: '700', color: TEXT_SECONDARY },
  calendarNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calendarNavTitle: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  calendarWeekRow: { flexDirection: 'row', marginBottom: 8 },
  calendarWeekText: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: TEXT_SECONDARY },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: { width: '14.28%', paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  calendarCellEmpty: { width: '14.28%', paddingVertical: 8 },
  calendarDayBubble: { minWidth: 36, paddingVertical: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  calendarDayBubbleSelected: { backgroundColor: NAVY },
  calendarCellText: { fontSize: 15, fontWeight: '600', color: TEXT_PRIMARY },
  calendarCellSelected: { color: '#ffffff', fontWeight: '800' },
  timeList: { maxHeight: 240 },
  timeListContent: { paddingVertical: 8 },
  timeOption: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginBottom: 4 },
  timeOptionActive: { backgroundColor: 'rgba(0,51,102,0.1)' },
  timeOptionText: { fontSize: 15, fontWeight: '600', color: TEXT_PRIMARY },
  timeOptionTextActive: { color: NAVY, fontWeight: '700' },
  priorityOption: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginBottom: 8 },
  priorityOptionActive: { backgroundColor: '#f1f5f9' },
  priorityOptionText: { fontSize: 15, fontWeight: '600', color: TEXT_PRIMARY },
  effortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  effortChip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: BORDER },
  effortChipActive: { backgroundColor: 'rgba(0,51,102,0.1)', borderColor: NAVY },
  effortChipText: { fontSize: 15, fontWeight: '600', color: TEXT_PRIMARY },
  effortChipTextActive: { color: NAVY, fontWeight: '700' },

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
  editBtn: {
    backgroundColor: 'rgba(0,51,102,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,51,102,0.2)',
  },
  editBtnText: { fontSize: 14, fontWeight: '700', color: NAVY },
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
