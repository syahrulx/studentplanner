import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  Modal,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  FlatList,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useMemo, useRef } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useTheme, useThemeId } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';
import { useCommunity } from '@/src/context/CommunityContext';
import {
  formatDisplayDate,
  getTodayISO,
  getMonthYearLabel,
  getMonthGrid,
  toISO,
} from '@/src/utils/date';
import type { SharedTask, Course } from '@/src/types';
import { TaskType } from '@/src/types';
import { useTranslations } from '@/src/i18n';
import { getSharedTaskParticipants } from '@/src/lib/communityApi';

const NAVY = '#003366';
const BG = '#f8fafc';
const CARD = '#ffffff';
const BORDER = '#e2e8f0';
const TEXT_PRIMARY = '#0f172a';
const TEXT_SECONDARY = '#64748b';

const TASK_TYPES = Object.values(TaskType) as TaskType[];

function getDaysUntilDue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T23:59:59');
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 864e5);
}

function dueDateTimeToDate(iso: string, time: string): Date {
  const [y, mo, d] = iso.slice(0, 10).split('-').map((x) => parseInt(x, 10));
  const [hStr, mStr] = (time || '00:00').split(':');
  return new Date(y, mo - 1, d, Number(hStr) || 0, Number(mStr) || 0, 0, 0);
}

function formatTimeHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function addCalendarMonth(year: number, month: number, delta: number) {
  const x = new Date(year, month + delta, 1);
  return { year: x.getFullYear(), month: x.getMonth() };
}

function syntheticCourse(id: string): Course {
  return { id, name: id, creditHours: 0, workload: [] };
}

export default function TaskDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tasks, courses, toggleTaskDone, deleteTask, updateTask, language } = useApp();
  const theme = useTheme();
  const themeId = useThemeId();
  const insets = useSafeAreaInsets();
  const { filteredFriends, circles, shareTaskWithFriend, shareTaskWithCircle } = useCommunity();
  const T = useTranslations(language);

  const task = tasks.find((t) => t.id === id);

  // ── Local edit state ────────────────────────────────────────────────────────
  const [localTitle, setLocalTitle] = useState('');
  const [localNotes, setLocalNotes] = useState('');
  const [localCourseId, setLocalCourseId] = useState('');
  const [localType, setLocalType] = useState<TaskType>(TaskType.Assignment);
  const [localDueDate, setLocalDueDate] = useState(getTodayISO());
  const [localDueTime, setLocalDueTime] = useState('23:59');

  const [editingTitle, setEditingTitle] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);

  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [pickerYear, setPickerYear] = useState(() => new Date(getTodayISO() + 'T12:00:00').getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date(getTodayISO() + 'T12:00:00').getMonth());

  // Share state
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [participants, setParticipants] = useState<SharedTask[]>([]);

  const titleRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);

  // Sync local state when task loads or changes
  useEffect(() => {
    if (!task) return;
    setLocalTitle(task.title);
    setLocalNotes(task.notes || '');
    setLocalCourseId(task.courseId);
    setLocalType(task.type);
    setLocalDueDate(task.dueDate);
    setLocalDueTime(task.dueTime || '23:59');
  }, [task?.id]);

  useEffect(() => {
    if (showDateModal) {
      const d = new Date(localDueDate + 'T12:00:00');
      setPickerYear(d.getFullYear());
      setPickerMonth(d.getMonth());
    }
  }, [showDateModal]);

  useEffect(() => {
    if (task?.id) {
      getSharedTaskParticipants(task.id).then(setParticipants).catch(() => {});
    }
  }, [task?.id]);

  const isAlreadyShared = participants.length > 0;

  const subjectPickerCourses = useMemo(() => {
    const list: Course[] = courses.map((c) => ({ ...c }));
    if (localCourseId && !list.some((c) => c.id === localCourseId)) {
      list.unshift(syntheticCourse(localCourseId));
    }
    if (list.length === 0) list.push(syntheticCourse('General'));
    return list;
  }, [courses, localCourseId]);

  const monthGridCells = getMonthGrid(pickerYear, pickerMonth);
  const pickerHeaderISO = toISO(pickerYear, pickerMonth, 1);

  if (!task) {
    return (
      <View style={[s.emptyContainer, { backgroundColor: theme.background }]}>
        <View style={[s.emptyIcon, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="alert-circle" size={32} color={theme.textSecondary} />
        </View>
        <Text style={[s.emptyTitle, { color: theme.textSecondary }]}>{T('taskNotFound')}</Text>
        <Pressable onPress={() => router.back()} style={[s.emptyBackBtn, { backgroundColor: theme.primary }]}>
          <Text style={[s.emptyBackText, { color: theme.textInverse }]}>{T('back')}</Text>
        </Pressable>
      </View>
    );
  }

  // ── Derived display values ──────────────────────────────────────────────────
  const effectiveDueDate = task.needsDate ? getTodayISO() : task.dueDate;
  const daysLeft = getDaysUntilDue(effectiveDueDate);
  const isOverdue = daysLeft < 0;
  const isDueSoon = !isOverdue && daysLeft <= 3;
  const urgencyLabel = isOverdue
    ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} overdue`
    : daysLeft === 0 ? 'Due today'
    : daysLeft === 1 ? 'Due tomorrow'
    : `${daysLeft} days left`;

  // ── Save helpers ────────────────────────────────────────────────────────────
  const saveField = (field: Parameters<typeof updateTask>[1]) => {
    updateTask(task.id, field);
  };

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = localTitle.trim();
    if (trimmed && trimmed !== task.title) saveField({ title: trimmed });
    else setLocalTitle(task.title);
  };

  const commitNotes = () => {
    setEditingNotes(false);
    if (localNotes !== task.notes) saveField({ notes: localNotes });
  };

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleDelete = () => {
    Alert.alert(T('deleteTask'), `"${task.title}" ${T('deleteTaskDesc')}`, [
      { text: T('cancel'), style: 'cancel' },
      { text: T('delete'), style: 'destructive', onPress: () => { deleteTask(task.id); router.back(); } },
    ]);
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


  // ── Calendar modal (reused from add-task pattern) ───────────────────────────
  const calendarModal = (
    <Modal visible={showDateModal} transparent animationType="fade" onRequestClose={() => setShowDateModal(false)}>
      <Pressable style={s.modalBg} onPress={() => setShowDateModal(false)}>
        <Pressable style={[s.dateModalCard, { backgroundColor: theme.card }]} onPress={(e) => e.stopPropagation()}>
          <View style={s.calHeader}>
            <Pressable hitSlop={12} style={s.calNav} onPress={() => {
              const { year, month } = addCalendarMonth(pickerYear, pickerMonth, -1);
              setPickerYear(year); setPickerMonth(month);
            }}>
              <Feather name="chevron-left" size={22} color={theme.primary} />
            </Pressable>
            <Text style={[s.calMonth, { color: theme.text }]}>{getMonthYearLabel(pickerHeaderISO)}</Text>
            <Pressable hitSlop={12} style={s.calNav} onPress={() => {
              const { year, month } = addCalendarMonth(pickerYear, pickerMonth, 1);
              setPickerYear(year); setPickerMonth(month);
            }}>
              <Feather name="chevron-right" size={22} color={theme.primary} />
            </Pressable>
          </View>
          <View style={s.calWeeks}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, idx) => (
              <Text key={`${d}-${idx}`} style={[s.calWk, { color: theme.textSecondary }]}>{d}</Text>
            ))}
          </View>
          <View style={s.calGrid}>
            {monthGridCells.map((d, idx) => {
              if (d == null) return <View key={idx} style={s.calEmpty} />;
              const iso = toISO(pickerYear, pickerMonth, d);
              const isSelected = iso === localDueDate;
              return (
                <Pressable key={idx} style={s.calCell} onPress={() => {
                  setLocalDueDate(iso);
                  saveField({ dueDate: iso, dueTime: localDueTime, needsDate: false });
                  setShowDateModal(false);
                }}>
                  <View style={[s.calDot, isSelected && { backgroundColor: theme.primary }]}>
                    <Text style={[s.calNum, { color: theme.text }, isSelected && { color: theme.textInverse }]}>{d}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={[s.dateDone, { backgroundColor: theme.primary }]} onPress={() => setShowDateModal(false)}>
            <Text style={{ color: theme.textInverse, fontWeight: '600', fontSize: 17 }}>{T('done')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: insets.top + 12, backgroundColor: theme.background }]}>
        <Pressable
          onPress={() => router.back()}
          style={[s.headerBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
        >
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[s.headerTitle, { color: theme.text }]}>{T('taskDetails')}</Text>
        {/* Share-to-friend button — badge shows shared count */}
        <Pressable
          onPress={() => setShowShareModal(true)}
          style={[s.headerBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
        >
          <Feather name="user-plus" size={20} color={isAlreadyShared ? theme.primary : theme.text} />
          {isAlreadyShared ? (
            <View style={[s.headerShareBadge, { backgroundColor: theme.primary }]}>
              <Text style={s.headerShareBadgeText}>{participants.length}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Badges ────────────────────────────────────────────────────────── */}
        <View style={s.badgeRow}>
          <View style={[s.badgeCourse, { backgroundColor: theme.primary }]}>
            <Text style={s.badgeCourseText}>{localCourseId}</Text>
          </View>
          <View style={[s.badgeType, { backgroundColor: theme.backgroundSecondary }]}>
            <Text style={[s.badgeTypeText, { color: theme.textSecondary }]}>{localType}</Text>
          </View>
          {task.id.startsWith('gc-') ? (
            <View style={s.badgeClassroom}>
              <Feather name="book-open" size={12} color="#0f9d58" />
              <Text style={s.badgeClassroomText}>Classroom</Text>
            </View>
          ) : isAlreadyShared ? (
            <View style={s.badgeShared}>
              <Feather name="users" size={12} color="#6366f1" />
              <Text style={s.badgeSharedText}>Shared</Text>
            </View>
          ) : (
            <View style={s.badgePersonal}>
              <Feather name="user" size={12} color="#64748b" />
              <Text style={s.badgePersonalText}>Personal</Text>
            </View>
          )}
          {task.isDone && (
            <View style={s.badgeDone}>
              <Feather name="check" size={12} color="#16a34a" />
              <Text style={[s.badgeDoneText, { color: theme.success }]}>{T('completed')}</Text>
            </View>
          )}
        </View>

        {/* ── Title (inline edit) ────────────────────────────────────────────── */}
        <View style={[s.titleRow]}>
          {editingTitle ? (
            <TextInput
              ref={titleRef}
              style={[s.titleInput, { color: theme.text, borderColor: theme.primary + '66', backgroundColor: theme.card }]}
              value={localTitle}
              onChangeText={setLocalTitle}
              onBlur={commitTitle}
              onSubmitEditing={commitTitle}
              autoFocus
              returnKeyType="done"
              multiline={false}
              maxLength={120}
            />
          ) : (
            <Text style={[s.title, { color: theme.text }]}>{localTitle}</Text>
          )}
          <Pressable
            hitSlop={12}
            style={[s.fieldEditBtn, { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => {
              if (editingTitle) {
                commitTitle();
              } else {
                setEditingTitle(true);
                setTimeout(() => titleRef.current?.focus(), 50);
              }
            }}
          >
            <Feather name={editingTitle ? 'check' : 'edit-2'} size={14} color={theme.primary} />
          </Pressable>
        </View>

        {/* ── Urgency pill ──────────────────────────────────────────────────── */}
        <View style={[s.urgencyPill, isOverdue && s.urgencyOverdue, isDueSoon && s.urgencySoon]}>
          <Feather
            name={isOverdue ? 'alert-triangle' : 'clock'}
            size={14}
            color={isOverdue ? theme.danger : isDueSoon ? theme.warning : theme.primary}
          />
          <Text
            style={[s.urgencyText, { color: theme.text }, isOverdue && { color: theme.danger }, isDueSoon && { color: theme.warning }]}
          >
            {urgencyLabel}
          </Text>
        </View>

        {/* ── Needs-date banner ─────────────────────────────────────────────── */}
        {task.needsDate ? (
          <View style={s.needsDateBanner}>
            <Feather name="alert-circle" size={14} color="#d97706" />
            <Text style={s.needsDateBannerText}>
              {task.id.startsWith('gc-')
                ? T('needsDateBannerGc')
                : task.sourceMessage
                  ? T('needsDateBannerAi')
                  : T('needsDateBannerGeneric')}
            </Text>
          </View>
        ) : null}

        {/* ── Details group (Apple-style grouped list) ───────────────────────── */}
        <Text style={[s.sectionLabel, { color: theme.textSecondary }]}>DETAILS</Text>
        <View style={[s.group, { backgroundColor: theme.card, borderColor: theme.border }]}>

          {/* Subject */}
          <Pressable
            style={({ pressed }) => [s.groupRow, { borderBottomColor: theme.border }, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => setSubjectModalOpen(true)}
          >
            <View style={[s.groupRowIcon, { backgroundColor: 'rgba(0,51,102,0.07)' }]}>
              <Feather name="book" size={16} color={theme.primary} />
            </View>
            <Text style={[s.groupRowLabel, { color: theme.textSecondary }]}>Subject</Text>
            <Text style={[s.groupRowValue, { color: theme.text }]}>{localCourseId}</Text>
            <View style={[s.fieldEditBtn, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="edit-2" size={14} color={theme.primary} />
            </View>
          </Pressable>

          {/* Type */}
          <Pressable
            style={({ pressed }) => [s.groupRow, { borderBottomColor: theme.border }, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => setTypeModalOpen(true)}
          >
            <View style={[s.groupRowIcon, { backgroundColor: 'rgba(99,102,241,0.07)' }]}>
              <Feather name="tag" size={16} color="#6366f1" />
            </View>
            <Text style={[s.groupRowLabel, { color: theme.textSecondary }]}>Type</Text>
            <Text style={[s.groupRowValue, { color: theme.text }]}>{localType}</Text>
            <View style={[s.fieldEditBtn, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="edit-2" size={14} color={theme.primary} />
            </View>
          </Pressable>

          {/* Due Date */}
          <Pressable
            style={({ pressed }) => [s.groupRow, { borderBottomColor: theme.border }, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => setShowDateModal(true)}
          >
            <View style={[s.groupRowIcon, { backgroundColor: 'rgba(0,51,102,0.07)' }]}>
              <Feather name="calendar" size={16} color={theme.primary} />
            </View>
            <Text style={[s.groupRowLabel, { color: theme.textSecondary }]}>Due Date</Text>
            <Text style={[s.groupRowValue, { color: task.needsDate ? theme.warning : theme.text }]}>
              {task.needsDate ? 'Not set' : formatDisplayDate(localDueDate)}
            </Text>
            <View style={[s.fieldEditBtn, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="edit-2" size={14} color={theme.primary} />
            </View>
          </Pressable>

          {/* Time */}
          <Pressable
            style={({ pressed }) => [s.groupRow, s.groupRowLast, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => setShowTimePicker(true)}
          >
            <View style={[s.groupRowIcon, { backgroundColor: 'rgba(245,158,11,0.08)' }]}>
              <Feather name="clock" size={16} color="#d97706" />
            </View>
            <Text style={[s.groupRowLabel, { color: theme.textSecondary }]}>Time</Text>
            <Text style={[s.groupRowValue, { color: theme.text }]}>{localDueTime.slice(0, 5)}</Text>
            <View style={[s.fieldEditBtn, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="edit-2" size={14} color={theme.primary} />
            </View>
          </Pressable>
        </View>

        {/* ── Notes (inline edit) ────────────────────────────────────────────── */}
        <View style={s.notesSectionHeaderRow}>
          <Text style={[s.sectionLabel, { color: theme.textSecondary, marginBottom: 0 }]}>NOTES</Text>
          <Pressable
            hitSlop={12}
            style={[s.fieldEditBtn, { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => {
              if (editingNotes) {
                commitNotes();
              } else {
                setEditingNotes(true);
                setTimeout(() => notesRef.current?.focus(), 50);
              }
            }}
          >
            <Feather name={editingNotes ? 'check' : 'edit-2'} size={14} color={theme.primary} />
          </Pressable>
        </View>
        <View style={[s.notesCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {editingNotes ? (
            <TextInput
              ref={notesRef}
              style={[s.notesInput, { color: theme.text }]}
              value={localNotes}
              onChangeText={setLocalNotes}
              onBlur={commitNotes}
              multiline
              textAlignVertical="top"
              placeholder="Add notes…"
              placeholderTextColor={theme.textSecondary}
              maxLength={500}
              autoFocus
            />
          ) : (
            <Text style={[s.notesBody, { color: localNotes ? theme.text : theme.textSecondary }]}>
              {localNotes || 'Tap ✏ to add notes…'}
            </Text>
          )}
        </View>

        {/* ── Source Section ────────────────────────────────────────────────── */}
        {task.id.startsWith('gc-') ? (
          <View style={s.sourceSection}>
            <View style={s.sourceHeaderRow}>
              <Text style={[s.sourceSectionTitle, { color: theme.textSecondary }]}>Google Classroom</Text>
              <View style={[s.verifiedPill, { backgroundColor: 'rgba(15,157,88,0.08)' }]}>
                <View style={[s.verifiedDot, { backgroundColor: '#0f9d58' }]} />
                <Text style={[s.verifiedLabel, { color: '#0f9d58' }]}>Auto-synced</Text>
              </View>
            </View>
            <View style={[s.sourceCard, { backgroundColor: theme.card, borderColor: theme.cardBorder, borderLeftWidth: 3, borderLeftColor: '#0f9d58' }]}>
              <View style={s.sourceTagWrap}>
                <Feather name="book-open" size={12} color="#0f9d58" />
                <Text style={[s.sourceTagText, { color: '#0f9d58' }]}>Google Classroom</Text>
              </View>
              {task.sourceMessage ? (
                <Text style={[s.sourceBody, { color: theme.text }]} numberOfLines={1}>{task.sourceMessage}</Text>
              ) : null}
            </View>
          </View>
        ) : task.sourceMessage ? (
          <View style={s.sourceSection}>
            <View style={s.sourceHeaderRow}>
              <Text style={[s.sourceSectionTitle, { color: theme.textSecondary }]}>{T('whatsappSource')}</Text>
              <View style={s.verifiedPill}>
                <View style={s.verifiedDot} />
                <Text style={[s.verifiedLabel, { color: theme.success }]}>{T('verifiedByAi')}</Text>
              </View>
            </View>
            <View style={[s.sourceCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={s.sourceTagWrap}>
                <Feather name="message-circle" size={12} color={theme.textSecondary} />
                <Text style={[s.sourceTagText, { color: theme.textSecondary }]}>{T('messageLog')}</Text>
              </View>
              <Text style={[s.sourceBody, { color: theme.text }]}>"{task.sourceMessage}"</Text>
              <Text style={[s.sourceTimestamp, { color: theme.textSecondary }]}>
                {`${T('extractedOn')} ${formatDisplayDate(task.dueDate)} • ${(task.dueTime || '').slice(0, 5)}`}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* ── Sticky Bottom Bar ─────────────────────────────────────────────────── */}
      <View style={[s.bottomBar, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: insets.bottom + 8 }]}>
        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.7 }, { backgroundColor: theme.danger + '22', borderColor: theme.danger + '33' }]}
        >
          <Feather name="trash-2" size={20} color={theme.danger} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            s.mainActionBtn,
            task.isDone && s.mainActionBtnDone,
            pressed && { opacity: 0.85 },
            { backgroundColor: task.isDone ? theme.textSecondary : theme.primary },
          ]}
          onPress={handleToggle}
        >
          <Feather name={task.isDone ? 'rotate-ccw' : 'check'} size={20} color={theme.textInverse} />
          <Text style={[s.mainActionText, { color: theme.textInverse }]}>
            {task.isDone ? T('completed') : T('markAsDone')}
          </Text>
        </Pressable>
      </View>

      {/* ── Calendar Modal ───────────────────────────────────────────────────── */}
      {calendarModal}

      {/* ── Subject Picker Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={subjectModalOpen}
        animationType="slide"
        {...(Platform.OS === 'ios' ? { presentationStyle: 'pageSheet' as const } : { transparent: true })}
        onRequestClose={() => setSubjectModalOpen(false)}
      >
        {Platform.OS === 'ios' ? (
          <View style={[s.sheetContainer, { paddingTop: insets.top, backgroundColor: theme.backgroundSecondary }]}>
            <View style={[s.sheetGrab, { backgroundColor: theme.border }]} />
            <View style={s.sheetHeader}>
              <Text style={[s.sheetTitle, { color: theme.textSecondary }]}>Subject</Text>
              <Pressable onPress={() => setSubjectModalOpen(false)} hitSlop={12}>
                <Text style={[s.sheetDone, { color: theme.primary }]}>{T('done')}</Text>
              </Pressable>
            </View>
            <View style={[s.sheetListCard, { backgroundColor: theme.card }]}>
              <FlatList
                data={subjectPickerCourses}
                keyExtractor={(c, i) => `${c.id}__${i}`}
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item, index }) => (
                  <Pressable
                    style={({ pressed }) => [
                      s.sheetRow,
                      index < subjectPickerCourses.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
                      pressed && { backgroundColor: theme.backgroundSecondary },
                    ]}
                    onPress={() => {
                      setLocalCourseId(item.id);
                      saveField({ courseId: item.id });
                      setSubjectModalOpen(false);
                    }}
                  >
                    <Text style={[s.sheetRowText, { color: theme.text }]}>{item.id}</Text>
                    {localCourseId === item.id ? <Feather name="check" size={20} color={theme.primary} /> : null}
                  </Pressable>
                )}
              />
            </View>
          </View>
        ) : (
          <Pressable style={s.modalBg} onPress={() => setSubjectModalOpen(false)}>
            <Pressable style={[s.androidSheet, { backgroundColor: theme.card }]} onPress={(e) => e.stopPropagation()}>
              <Text style={[s.sheetTitle, { color: theme.text, marginBottom: 12 }]}>Subject</Text>
              <FlatList
                data={subjectPickerCourses}
                keyExtractor={(c, i) => `${c.id}__${i}`}
                style={{ maxHeight: 320 }}
                renderItem={({ item }) => (
                  <Pressable
                    style={s.sheetRow}
                    onPress={() => {
                      setLocalCourseId(item.id);
                      saveField({ courseId: item.id });
                      setSubjectModalOpen(false);
                    }}
                  >
                    <Text style={{ color: theme.text, fontSize: 17 }}>{item.id}</Text>
                    {localCourseId === item.id ? <Feather name="check" size={20} color={theme.primary} /> : null}
                  </Pressable>
                )}
              />
            </Pressable>
          </Pressable>
        )}
      </Modal>

      {/* ── Type Picker Modal ─────────────────────────────────────────────────── */}
      <Modal visible={typeModalOpen} transparent animationType="slide" onRequestClose={() => setTypeModalOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setTypeModalOpen(false)}>
          <View style={[s.typeSheet, { backgroundColor: theme.card, paddingBottom: insets.bottom + 16 }]} onStartShouldSetResponder={() => true}>
            <View style={[s.sheetGrab, { backgroundColor: theme.border, alignSelf: 'center' }]} />
            <Text style={[s.sheetTitle, { color: theme.text, textAlign: 'center', marginBottom: 20 }]}>Task Type</Text>
            <View style={s.typeGrid}>
              {TASK_TYPES.map((t) => (
                <Pressable
                  key={t}
                  style={[
                    s.typeBtn,
                    { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                    localType === t && { backgroundColor: theme.primary + '15', borderColor: theme.primary },
                  ]}
                  onPress={() => {
                    setLocalType(t);
                    saveField({ type: t });
                    setTypeModalOpen(false);
                  }}
                >
                  <Text style={[s.typeBtnText, { color: theme.textSecondary }, localType === t && { color: theme.primary, fontWeight: '700' }]}>{t}</Text>
                  {localType === t && <Feather name="check" size={16} color={theme.primary} />}
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ── Time Picker (iOS) ──────────────────────────────────────────────────── */}
      {Platform.OS === 'ios' && showTimePicker && (
        <Modal visible={showTimePicker} transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
          <Pressable style={s.modalBg} onPress={() => setShowTimePicker(false)}>
            <View style={[s.timeSheet, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
              <View style={s.iosTimePickerWrap}>
                <DateTimePicker
                  value={dueDateTimeToDate(localDueDate, localDueTime)}
                  mode="time"
                  display="spinner"
                  is24Hour
                  themeVariant={isDarkTheme(themeId) ? 'dark' : 'light'}
                  textColor={theme.text}
                  style={s.iosTimePicker}
                  onChange={(_, date) => {
                    if (date) {
                      const t = formatTimeHM(date);
                      setLocalDueTime(t);
                      saveField({ dueTime: t });
                    }
                  }}
                />
              </View>
              <Pressable
                style={[s.timeDoneBtn, { backgroundColor: theme.primary }]}
                onPress={() => setShowTimePicker(false)}
              >
                <Text style={{ color: theme.textInverse, fontWeight: '600', fontSize: 17 }}>{T('done')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}

      {Platform.OS === 'android' && showTimePicker && (
        <DateTimePicker
          value={dueDateTimeToDate(localDueDate, localDueTime)}
          mode="time"
          display="default"
          is24Hour
          onChange={(event, date) => {
            setShowTimePicker(false);
            if (event.type === 'set' && date) {
              const t = formatTimeHM(date);
              setLocalDueTime(t);
              saveField({ dueTime: t });
            }
          }}
        />
      )}

      {/* ── Share Modal (simple compact sheet) ───────────────────────────────── */}
      <Modal visible={showShareModal} transparent animationType="slide" onRequestClose={() => setShowShareModal(false)}>
        <Pressable style={s.shareOverlay} onPress={() => setShowShareModal(false)}>
          <Pressable
            style={[s.shareContent, { backgroundColor: theme.card, paddingBottom: insets.bottom + 16 }]}
            onStartShouldSetResponder={() => true}
          >
            {/* drag handle + header */}
            <View style={[s.sheetGrab, { backgroundColor: theme.border, alignSelf: 'center' }]} />
            <View style={s.shareModalHeader}>
              <View>
                <Text style={[s.shareModalTitle, { color: theme.text }]}>Share with…</Text>
                <Text style={[s.shareModalSub, { color: theme.textSecondary }]} numberOfLines={1}>
                  {task.title}
                </Text>
              </View>
              <Pressable onPress={() => setShowShareModal(false)} hitSlop={12}
                style={[s.headerBtn, { borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}>
                <Feather name="x" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {/* Friends */}
              {filteredFriends.length > 0 && (
                <>
                  <Text style={[s.shareGroupLabel, { color: theme.textSecondary }]}>FRIENDS</Text>
                  {filteredFriends.map((friend) => {
                    const alreadySharedWith = participants.some(
                      (p) => p.recipient_id === friend.id || p.owner_id === friend.id,
                    );
                    return (
                      <Pressable
                        key={friend.id}
                        style={({ pressed }) => [
                          s.sharePersonRow,
                          { backgroundColor: theme.card, borderColor: theme.border },
                          pressed && { opacity: 0.7 },
                          alreadySharedWith && { opacity: 0.5 },
                        ]}
                        disabled={alreadySharedWith || isSharing}
                        onPress={async () => {
                          setIsSharing(true);
                          try {
                            const ok = await shareTaskWithFriend(task.id, friend.id, undefined);
                            if (ok) {
                              getSharedTaskParticipants(task.id).then(setParticipants).catch(() => {});
                            }
                          } finally {
                            setIsSharing(false);
                          }
                        }}
                      >
                        <View style={s.shareAvatar}>
                          <Text style={s.shareAvatarText}>{friend.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <Text style={[s.sharePersonName, { color: theme.text }]}>{friend.name}</Text>
                        {alreadySharedWith ? (
                          <View style={s.sharedBadge}>
                            <Feather name="check" size={12} color="#059669" />
                            <Text style={s.sharedBadgeText}>Shared</Text>
                          </View>
                        ) : isSharing ? (
                          <ActivityIndicator size="small" color={theme.primary} />
                        ) : (
                          <Feather name="send" size={16} color={theme.primary} />
                        )}
                      </Pressable>
                    );
                  })}
                </>
              )}

              {/* Circles */}
              {circles.length > 0 && (
                <>
                  <Text style={[s.shareGroupLabel, { color: theme.textSecondary, marginTop: 12 }]}>CIRCLES</Text>
                  {circles.map((circle) => (
                    <Pressable
                      key={circle.id}
                      style={({ pressed }) => [
                        s.sharePersonRow,
                        { backgroundColor: theme.card, borderColor: theme.border },
                        pressed && { opacity: 0.7 },
                      ]}
                      disabled={isSharing}
                      onPress={async () => {
                        setIsSharing(true);
                        try {
                          await shareTaskWithCircle(task.id, circle.id, undefined);
                          getSharedTaskParticipants(task.id).then(setParticipants).catch(() => {});
                        } finally {
                          setIsSharing(false);
                        }
                      }}
                    >
                      <View style={s.shareAvatar}>
                        <Text style={s.shareAvatarText}>{circle.emoji || '●'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.sharePersonName, { color: theme.text }]}>{circle.name}</Text>
                        <Text style={{ fontSize: 12, color: theme.textSecondary }}>{circle.member_count || 0} members</Text>
                      </View>
                      {isSharing ? (
                        <ActivityIndicator size="small" color={theme.primary} />
                      ) : (
                        <Feather name="send" size={16} color={theme.primary} />
                      )}
                    </Pressable>
                  ))}
                </>
              )}

              {filteredFriends.length === 0 && circles.length === 0 && (
                <Text style={[s.emptyShareText, { color: theme.textSecondary }]}>
                  Add friends or join a circle in the Community tab first.
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 17, fontWeight: '600', marginBottom: 24 },
  emptyBackBtn: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 16 },
  emptyBackText: { fontWeight: '700', fontSize: 15 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerBtn: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  headerShareBadge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#ffffff',
  },
  headerShareBadgeText: { fontSize: 9, fontWeight: '800', color: '#ffffff' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },

  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 18, flexWrap: 'wrap' },
  badgeCourse: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12 },
  badgeCourseText: { color: '#ffffff', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  badgeType: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12 },
  badgeTypeText: { fontSize: 12, fontWeight: '700' },
  badgeDone: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(34,197,94,0.08)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  badgeDoneText: { fontSize: 12, fontWeight: '700' },
  badgeClassroom: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(15,157,88,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  badgeClassroomText: { color: '#0f9d58', fontSize: 12, fontWeight: '700' },
  badgeShared: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(99,102,241,0.08)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  badgeSharedText: { color: '#6366f1', fontSize: 12, fontWeight: '700' },
  badgePersonal: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(100,116,139,0.08)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  badgePersonalText: { color: '#64748b', fontSize: 12, fontWeight: '700' },

  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  title: { flex: 1, fontSize: 26, fontWeight: '800', lineHeight: 32, letterSpacing: -0.5 },
  titleInput: {
    flex: 1, fontSize: 22, fontWeight: '700', lineHeight: 28,
    borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8,
  },
  fieldEditBtn: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },

  urgencyPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
    backgroundColor: 'rgba(0,51,102,0.05)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, marginBottom: 20,
  },
  urgencyOverdue: { backgroundColor: 'rgba(239,68,68,0.06)' },
  urgencySoon: { backgroundColor: 'rgba(245,158,11,0.06)' },
  urgencyText: { fontSize: 13, fontWeight: '700' },

  needsDateBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 20,
  },
  needsDateBannerText: { flex: 1, fontSize: 13, color: '#92400e', fontWeight: '500', lineHeight: 18 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 8, marginLeft: 4,
  },
  group: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden', marginBottom: 20,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 }, default: { elevation: 1 } }),
  },
  groupRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupRowLast: { borderBottomWidth: 0 },
  groupRowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  groupRowLabel: { fontSize: 15, fontWeight: '400', width: 80 },
  groupRowValue: { flex: 1, fontSize: 15, fontWeight: '600', textAlign: 'right', marginRight: 8 },

  notesSectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8, marginLeft: 4, paddingRight: 4,
  },
  notesCard: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    padding: 16, marginBottom: 20, minHeight: 80,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 }, default: { elevation: 1 } }),
  },
  notesInput: { fontSize: 15, lineHeight: 22, minHeight: 80 },
  notesBody: { fontSize: 15, lineHeight: 22, fontWeight: '400' },

  // Share sheet
  shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  shareContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  shareModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, marginTop: 4 },
  shareModalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  shareModalSub: { fontSize: 13, fontWeight: '500', maxWidth: 240 },
  shareGroupLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  sharePersonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, marginBottom: 8,
  },
  shareAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,51,102,0.1)', alignItems: 'center', justifyContent: 'center' },
  shareAvatarText: { fontSize: 17, fontWeight: '700', color: NAVY },
  sharePersonName: { flex: 1, fontSize: 15, fontWeight: '600' },
  sharedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(5,150,105,0.08)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  sharedBadgeText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  emptyShareText: { fontSize: 14, fontStyle: 'italic', textAlign: 'center', padding: 24 },

  sourceSection: { marginBottom: 24 },
  sourceHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sourceSectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  verifiedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#059669' },
  verifiedLabel: { fontSize: 11, fontWeight: '700' },
  sourceCard: { padding: 20, borderRadius: 20, borderWidth: 1 },
  sourceTagWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sourceTagText: { fontSize: 11, fontWeight: '700' },
  sourceBody: { fontSize: 14, fontStyle: 'italic', lineHeight: 22, fontWeight: '500' },
  sourceTimestamp: { fontSize: 12, fontWeight: '600', marginTop: 14 },

  bottomBar: {
    flexDirection: 'row', paddingHorizontal: 20, paddingTop: 16, gap: 12,
    borderTopWidth: 1,
  },
  actionBtn: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  mainActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 56, borderRadius: 20 },
  mainActionBtnDone: {},
  mainActionText: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },

  // Calendar modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  dateModalCard: { marginHorizontal: 16, marginBottom: 32, borderRadius: 14, padding: 14, maxWidth: 400, width: '100%', alignSelf: 'center' },
  dateDone: { marginTop: 12, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  calNav: { padding: 6 },
  calMonth: { fontSize: 16, fontWeight: '600' },
  calWeeks: { flexDirection: 'row', marginBottom: 6 },
  calWk: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calEmpty: { width: '14.28%', aspectRatio: 1 },
  calDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  calNum: { fontSize: 15, fontWeight: '400' },

  // Subject sheet
  sheetContainer: { flex: 1 },
  sheetGrab: { width: 36, height: 5, borderRadius: 3, marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  sheetTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  sheetDone: { fontSize: 17, fontWeight: '600' },
  sheetListCard: { marginHorizontal: 16, borderRadius: 10, overflow: 'hidden', flex: 1, maxHeight: 420, minHeight: 200 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, minHeight: 44 },
  sheetRowText: { fontSize: 17, fontWeight: '400' },
  androidSheet: { marginHorizontal: 16, marginBottom: 40, borderRadius: 14, padding: 16, maxHeight: '70%' },

  // Type picker sheet
  typeSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10 },
  typeGrid: { gap: 10 },
  typeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  typeBtnText: { fontSize: 16, fontWeight: '500' },

  // Time picker
  timeSheet: { marginHorizontal: 16, borderRadius: 14, padding: 16, alignSelf: 'center', width: '100%', maxWidth: 400 },
  iosTimePickerWrap: { height: 216, width: '100%', overflow: 'hidden' },
  iosTimePicker: { height: 216, width: '100%' },
  timeDoneBtn: { marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },

});
