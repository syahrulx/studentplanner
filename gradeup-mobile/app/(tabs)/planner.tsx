import { useState, useMemo } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Modal, TextInput, ScrollView, Alert } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';
import { Priority, TaskType } from '@/src/types';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { formatDisplayDate } from '@/src/utils/date';

const WEEKDAY_TO_NUM: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

// Priority display colors: Low = green, Medium = yellow, High = red
const PRIORITY_COLORS = {
  [Priority.Low]: { bg: '#dcfce7', text: '#166534' },
  [Priority.Medium]: { bg: '#fef9c3', text: '#854d0e' },
  [Priority.High]: { bg: '#fee2e2', text: '#b91c1c' },
};

function getDaysUntilDue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T23:59:59');
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 864e5);
}

// Outline: red = urgent, yellow = medium, green = plenty. Thresholds depend on priority.
function getOutlineLevel(priority: Priority, daysUntil: number): 'red' | 'yellow' | 'green' {
  if (daysUntil < 0) return 'red';
  if (priority === Priority.High) {
    if (daysUntil < 7) return 'red';
    if (daysUntil < 14) return 'yellow';
    return 'green';
  }
  if (priority === Priority.Medium) {
    if (daysUntil < 5) return 'red';
    if (daysUntil < 10) return 'yellow';
    return 'green';
  }
  // Low
  if (daysUntil < 3) return 'red';
  if (daysUntil < 7) return 'yellow';
  return 'green';
}

const OUTLINE_COLORS = { red: '#dc2626', yellow: '#ca8a04', green: '#16a34a' };

const WEEK_DAYS = [
  { label: 'M', date: 23 }, { label: 'T', date: 24 }, { label: 'W', date: 25 },
  { label: 'T', date: 26 }, { label: 'F', date: 27 }, { label: 'S', date: 28 }, { label: 'S', date: 29 },
];

type PlannerTaskItem = { type: 'task'; id: string } & import('@/src/types').Task;
type PlannerStudyItem = {
  type: 'study';
  studyKey: string;
  date: string;
  time: string;
  subjectId: string;
  durationMinutes: number;
  topic: string;
  isDone: boolean;
};
type PlannerItem = PlannerTaskItem | PlannerStudyItem;

function isStudyItem(item: PlannerItem): item is PlannerStudyItem {
  return item.type === 'study';
}

export default function Planner() {
  const {
    tasks,
    toggleTaskDone,
    addTask,
    deleteTask,
    revisionSettings,
    setRevisionSettings,
    completedStudyKeys,
    markStudyDone,
    unmarkStudyDone,
    pinnedTaskIds,
    pinTask,
    unpinTask,
  } = useApp();
  const theme = useTheme();
  const [view, setView] = useState<'week' | 'month' | 'all'>('week');
  const [activeDate, setActiveDate] = useState(26);
  const [sortMode, setSortMode] = useState<'date' | 'priority-asc' | 'priority-desc'>('date');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
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

  const studyItemsForPlanner = useMemo((): PlannerStudyItem[] => {
    if (!revisionSettings.enabled || !revisionSettings.time) return [];
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const in30 = new Date(now);
    in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().slice(0, 10);
    const [h, m] = revisionSettings.time.split(':').map((x) => parseInt(x, 10) || 0);
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const subject = revisionSettings.subjectId || 'Study';
    const out: PlannerStudyItem[] = [];
    if (revisionSettings.repeat === 'once' && revisionSettings.singleDate) {
      const dateStr = revisionSettings.singleDate;
      if (dateStr >= todayStr && dateStr <= in30Str) {
        out.push({
          type: 'study',
          studyKey: `${dateStr}T${timeStr}`,
          date: dateStr,
          time: timeStr,
          subjectId: subject,
          durationMinutes: revisionSettings.durationMinutes,
          topic: revisionSettings.topic,
          isDone: completedStudyKeys.includes(`${dateStr}T${timeStr}`),
        });
      }
    } else {
      const targetWeekday = revisionSettings.day === 'Every day' ? null : WEEKDAY_TO_NUM[revisionSettings.day];
      for (let d = 0; d <= 30; d++) {
        const dte = new Date(now);
        dte.setDate(dte.getDate() + d);
        const dateStr = dte.toISOString().slice(0, 10);
        if (dateStr < todayStr) continue;
        if (dateStr > in30Str) break;
        const dayNum = dte.getDay();
        if (targetWeekday === null || dayNum === targetWeekday) {
          const key = `${dateStr}T${timeStr}`;
          out.push({
            type: 'study',
            studyKey: key,
            date: dateStr,
            time: timeStr,
            subjectId: subject,
            durationMinutes: revisionSettings.durationMinutes,
            topic: revisionSettings.topic,
            isDone: completedStudyKeys.includes(key),
          });
        }
      }
    }
    return out;
  }, [revisionSettings, completedStudyKeys]);

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

  const combinedList = useMemo((): PlannerItem[] => {
    if (view !== 'all') {
      return filteredTasks.map((t) => ({ type: 'task' as const, ...t }));
    }
    const taskItems: PlannerItem[] = filteredTasks.map((t) => ({ type: 'task' as const, ...t }));
    const studyItems: PlannerItem[] = studyItemsForPlanner;
    const all: PlannerItem[] = [...taskItems, ...studyItems];
    all.sort((a, b) => {
      const dateA = (a.type === 'task' ? a.dueDate : a.date) ?? '';
      const dateB = (b.type === 'task' ? b.dueDate : b.date) ?? '';
      const timeA = (a.type === 'task' ? a.dueTime : a.time) ?? '';
      const timeB = (b.type === 'task' ? b.dueTime : b.time) ?? '';
      const d = dateA.localeCompare(dateB);
      return d !== 0 ? d : timeA.localeCompare(timeB);
    });
    return all;
  }, [view, filteredTasks, studyItemsForPlanner]);

  const pinnedSet = useMemo(() => new Set(pinnedTaskIds), [pinnedTaskIds]);
  const displayList = useMemo((): PlannerItem[] => {
    const raw = view === 'all' ? combinedList : filteredTasks.map((t) => ({ type: 'task' as const, ...t }));
    const isPinned = (item: PlannerItem): item is PlannerTaskItem =>
      item.type === 'task' && typeof (item as PlannerTaskItem).id === 'string' && pinnedSet.has((item as PlannerTaskItem).id);
    const pinned: PlannerTaskItem[] = [];
    const unpinned: PlannerItem[] = [];
    for (const item of raw) {
      if (isPinned(item)) pinned.push(item as PlannerTaskItem);
      else unpinned.push(item);
    }

    const priorityRank: Record<Priority, number> = {
      [Priority.Low]: 1,
      [Priority.Medium]: 2,
      [Priority.High]: 3,
    };

    const compareTasksBySortMode = (a: PlannerTaskItem, b: PlannerTaskItem): number => {
      // Keep incomplete tasks above completed ones
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;

      if (sortMode === 'priority-asc' || sortMode === 'priority-desc') {
        const pa = priorityRank[a.priority];
        const pb = priorityRank[b.priority];
        if (pa !== pb) {
          return sortMode === 'priority-asc' ? pa - pb : pb - pa;
        }
      }

      const dateA = a.dueDate ?? '';
      const dateB = b.dueDate ?? '';
      const timeA = a.dueTime ?? '';
      const timeB = b.dueTime ?? '';
      const d = dateA.localeCompare(dateB);
      if (d !== 0) return d;
      return timeA.localeCompare(timeB);
    };

    pinned.sort(compareTasksBySortMode);

    unpinned.sort((a, b) => {
      const aIsTask = a.type === 'task';
      const bIsTask = b.type === 'task';

      if (sortMode === 'priority-asc' || sortMode === 'priority-desc') {
        // In priority mode, sort tasks by priority; keep study items after tasks,
        // and sort study items by date/time.
        if (aIsTask && bIsTask) {
          return compareTasksBySortMode(a as PlannerTaskItem, b as PlannerTaskItem);
        }
        if (aIsTask && !bIsTask) return -1;
        if (!aIsTask && bIsTask) return 1;

        // both study items
        const dateA = (a as PlannerStudyItem).date ?? '';
        const dateB = (b as PlannerStudyItem).date ?? '';
        const timeA = (a as PlannerStudyItem).time ?? '';
        const timeB = (b as PlannerStudyItem).time ?? '';
        const d = dateA.localeCompare(dateB);
        return d !== 0 ? d : timeA.localeCompare(timeB);
      }

      // Default: sort everything by date then time (tasks & study together)
      const dateA = (aIsTask ? (a as PlannerTaskItem).dueDate : (a as PlannerStudyItem).date) ?? '';
      const dateB = (bIsTask ? (b as PlannerTaskItem).dueDate : (b as PlannerStudyItem).date) ?? '';
      const timeA = (aIsTask ? (a as PlannerTaskItem).dueTime : (a as PlannerStudyItem).time) ?? '';
      const timeB = (bIsTask ? (b as PlannerTaskItem).dueTime : (b as PlannerStudyItem).time) ?? '';
      const d = dateA.localeCompare(dateB);
      if (d !== 0) return d;

      // When same slot, keep incomplete tasks above completed ones
      if (aIsTask && bIsTask && (a as PlannerTaskItem).isDone !== (b as PlannerTaskItem).isDone) {
        return (a as PlannerTaskItem).isDone ? 1 : -1;
      }
      return timeA.localeCompare(timeB);
    });
    return [...pinned, ...unpinned];
  }, [view, combinedList, filteredTasks, pinnedSet, pinnedTaskIds, sortMode]);
  const listCount = displayList.length;

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
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    if (dueDate === today) return 'DUE TODAY';
    if (dueDate === tomorrow) return 'DUE TOMORROW';
    return `DUE ${formatDisplayDate(dueDate)}`;
  };

  const sortLabel =
    sortMode === 'date'
      ? 'Nearest date'
      : sortMode === 'priority-asc'
      ? 'Priority low→high'
      : 'Priority high→low';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Task Planner</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>DECEMBER • WEEK 11</Text>
        </View>
        <View style={[styles.viewToggle, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Pressable style={[styles.viewBtn, view === 'week' && { backgroundColor: theme.primary }]} onPress={() => setView('week')}>
            <Text style={[styles.viewBtnText, { color: theme.textSecondary }, view === 'week' && { color: theme.textInverse }]}>Week</Text>
          </Pressable>
          <Pressable style={[styles.viewBtn, view === 'month' && { backgroundColor: theme.primary }]} onPress={() => setView('month')}>
            <Text style={[styles.viewBtnText, { color: theme.textSecondary }, view === 'month' && { color: theme.textInverse }]}>Month</Text>
          </Pressable>
          <Pressable style={[styles.viewBtn, view === 'all' && { backgroundColor: theme.primary }]} onPress={() => setView('all')}>
            <Text style={[styles.viewBtnText, { color: theme.textSecondary }, view === 'all' && { color: theme.textInverse }]}>All</Text>
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
        <Text style={[styles.listTitle, { color: theme.text }]}>{view === 'all' ? 'Tasks & study' : `Deadlines • Dec ${activeDate}`}</Text>
        <Text style={[styles.listCount, { color: theme.textSecondary }]}>{listCount} {listCount === 1 ? 'item' : 'items'}</Text>
      </View>

      <View style={styles.sortRow}>
        <Text style={[styles.sortLabel, { color: theme.textSecondary }]}>Sort</Text>
        <View style={styles.sortDropdownContainer}>
          <Pressable
            style={[styles.sortDropdownToggle, { borderColor: theme.border, backgroundColor: theme.card }]}
            onPress={() => setIsSortMenuOpen((open) => !open)}
          >
            <Text style={[styles.sortDropdownText, { color: theme.text }]} numberOfLines={1}>
              {sortLabel} ▾
            </Text>
          </Pressable>
          {isSortMenuOpen && (
            <View style={[styles.sortDropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Pressable
                style={[styles.sortDropdownItem, sortMode === 'date' && styles.sortDropdownItemActive]}
                onPress={() => {
                  setSortMode('date');
                  setIsSortMenuOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.sortDropdownItemText,
                    { color: sortMode === 'date' ? '#ffffff' : theme.text },
                  ]}
                >
                  Nearest date
                </Text>
              </Pressable>
              <Pressable
                style={[styles.sortDropdownItem, sortMode === 'priority-asc' && styles.sortDropdownItemActive]}
                onPress={() => {
                  setSortMode('priority-asc');
                  setIsSortMenuOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.sortDropdownItemText,
                    { color: sortMode === 'priority-asc' ? '#ffffff' : theme.text },
                  ]}
                >
                  Priority low→high
                </Text>
              </Pressable>
              <Pressable
                style={[styles.sortDropdownItem, sortMode === 'priority-desc' && styles.sortDropdownItemActive]}
                onPress={() => {
                  setSortMode('priority-desc');
                  setIsSortMenuOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.sortDropdownItemText,
                    { color: sortMode === 'priority-desc' ? '#ffffff' : theme.text },
                  ]}
                >
                  Priority high→low
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {displayList.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundSecondary }]}><ThemeIcon name="checkCircle" size={32} color={theme.textSecondary} /></View>
          <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>No tasks for today</Text>
          <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Enjoy your free time!</Text>
        </View>
      ) : (
        <FlatList
          data={displayList}
          extraData={pinnedTaskIds}
          keyExtractor={(item, index) => {
            const id = item.type === 'task' ? item.id : item.studyKey;
            return `${index}-${id ?? `item-${index}`}`;
          }}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            if (isStudyItem(item)) {
              let swipeRef: Swipeable | null = null;
              const closeSwipe = () => swipeRef?.close();

              const handleStudyToggle = () => {
                if (item.isDone) {
                  Alert.alert('Mark as not done?', 'Mark this study as incomplete?', [
                    { text: 'Cancel', style: 'cancel', onPress: closeSwipe },
                    {
                      text: 'Undo',
                      onPress: () => {
                        unmarkStudyDone(item.studyKey);
                        closeSwipe();
                      },
                    },
                  ]);
                } else {
                  Alert.alert('Mark as done?', 'Mark this revision as completed?', [
                    { text: 'Cancel', style: 'cancel', onPress: closeSwipe },
                    {
                      text: 'Mark done',
                      onPress: () => {
                        markStudyDone(item.studyKey);
                        closeSwipe();
                      },
                    },
                  ]);
                }
              };

              const handleStudyDelete = () => {
                Alert.alert(
                  'Delete revision?',
                  'Turn off this study reminder?',
                  [
                    { text: 'Cancel', style: 'cancel', onPress: closeSwipe },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        setRevisionSettings({ ...revisionSettings, enabled: false });
                        closeSwipe();
                      },
                    },
                  ]
                );
              };

              const renderRightActions = () => (
                <View style={styles.swipeActions}>
                  <Pressable
                    style={[
                      styles.swipeActionBtn,
                      { backgroundColor: item.isDone ? '#ef4444' : '#22c55e' },
                    ]}
                    onPress={item.isDone ? handleStudyDelete : handleStudyToggle}
                  >
                    <View style={styles.swipeActionContent}>
                      <Text style={styles.swipeActionText} numberOfLines={1}>{item.isDone ? 'Delete' : 'Mark done'}</Text>
                    </View>
                  </Pressable>
                </View>
              );

              return (
                <View style={styles.cardRow}>
                  <Swipeable
                    renderRightActions={renderRightActions}
                    overshootRight={false}
                    rightThreshold={72}
                    ref={(ref) => {
                      swipeRef = ref;
                    }}
                    onSwipeableOpen={() => {
                      // Full second swipe -> confirm mark done / delete
                      (item.isDone ? handleStudyDelete : handleStudyToggle)();
                    }}
                  >
                    <View style={[styles.taskCard, styles.studyCard, { backgroundColor: theme.card, borderColor: theme.accent2 + '99', borderLeftWidth: 3, borderLeftColor: theme.accent2 }]}>
                      <Pressable
                        onPress={handleStudyToggle}
                        style={[styles.checkbox, item.isDone && styles.checkboxDone, { backgroundColor: item.isDone ? theme.accent2 : 'transparent' }]}
                      >
                        <ThemeIcon name="checkCircle" size={14} color={item.isDone ? COLORS.white : 'transparent'} />
                      </Pressable>
                      <View style={styles.taskBody}>
                        <View style={styles.taskRow}>
                          <Text style={[styles.taskCourse, { color: theme.textSecondary }]}>{item.subjectId}</Text>
                          <View style={[styles.priorityBadge, { backgroundColor: theme.accent2 + '22' }]}>
                            <Text style={[styles.priorityText, { color: theme.accent2 }]}>STUDY</Text>
                          </View>
                        </View>
                        <Text style={[styles.taskTitle, { color: theme.text }, item.isDone && styles.taskDone]} numberOfLines={2}>Time to study{item.topic ? `: ${item.topic}` : ''}</Text>
                        <View style={styles.taskMeta}>
                          <ThemeIcon name="calendar" size={14} color={theme.textSecondary} />
                          <Text style={[styles.taskMetaText, { color: theme.textSecondary }]}>{formatDisplayDate(item.date)} • {item.time}</Text>
                          <View style={[styles.taskMetaDot, { backgroundColor: theme.textSecondary }]} />
                          <ThemeIcon name="clock" size={14} color={theme.textSecondary} />
                          <Text style={[styles.taskMetaText, { color: theme.textSecondary }]}>{item.durationMinutes} min</Text>
                        </View>
                        <Pressable
                          style={[styles.postponeBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                          onPress={() => router.push('/revision-postpone' as any)}
                        >
                          <ThemeIcon name="clock" size={14} color={theme.primary} />
                          <Text style={[styles.postponeBtnText, { color: theme.primary }]}>Postpone</Text>
                        </Pressable>
                      </View>
                    </View>
                  </Swipeable>
                </View>
              );
            }

            let swipeRef: Swipeable | null = null;
            const closeSwipe = () => swipeRef?.close();

            const handleTaskToggle = () => {
              if (item.isDone) {
                Alert.alert(
                  'Mark as not done?',
                  `Mark "${item.title}" as incomplete?`,
                  [
                    { text: 'Cancel', style: 'cancel', onPress: closeSwipe },
                    {
                      text: 'Undo',
                      onPress: () => {
                        toggleTaskDone(item.id);
                        closeSwipe();
                      },
                    },
                  ]
                );
              } else {
                Alert.alert(
                  'Mark as done?',
                  `Mark "${item.title}" as completed?`,
                  [
                    { text: 'Cancel', style: 'cancel', onPress: closeSwipe },
                    {
                      text: 'Mark done',
                      onPress: () => {
                        toggleTaskDone(item.id);
                        closeSwipe();
                      },
                    },
                  ]
                );
              }
            };

            const handleTaskDelete = () => {
              Alert.alert(
                'Delete task?',
                `Delete "${item.title}" from your planner?`,
                [
                  { text: 'Cancel', style: 'cancel', onPress: closeSwipe },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      deleteTask(item.id);
                      closeSwipe();
                    },
                  },
                ]
              );
            };

            const isPinned = pinnedTaskIds.includes(item.id);
            const handlePinPress = () => {
              if (isPinned) {
                unpinTask(item.id);
              } else {
                const added = pinTask(item.id);
                if (!added) {
                  Alert.alert('Limit reached', 'You can only pin 2 tasks. Unpin one first.');
                }
              }
              closeSwipe();
            };

            const renderLeftActions = () => (
              <View style={styles.swipeActionsLeft}>
                <Pressable
                  style={[styles.swipeActionBtnLeft, { backgroundColor: '#d97706' }]}
                  onPress={handlePinPress}
                >
                  <View style={styles.swipeActionContentLeft}>
                    <Text style={styles.swipeActionText} numberOfLines={1}>{isPinned ? 'Unpin' : 'Pin'}</Text>
                  </View>
                </Pressable>
              </View>
            );

            const renderRightActions = () => (
              <View style={styles.swipeActions}>
                <Pressable
                  style={[
                    styles.swipeActionBtn,
                    { backgroundColor: item.isDone ? '#ef4444' : '#22c55e' },
                  ]}
                  onPress={item.isDone ? handleTaskDelete : handleTaskToggle}
                >
                  <View style={styles.swipeActionContent}>
                    <Text style={styles.swipeActionText} numberOfLines={1}>{item.isDone ? 'Delete' : 'Mark done'}</Text>
                  </View>
                </Pressable>
              </View>
            );

            const daysUntil = getDaysUntilDue(item.dueDate);
            const outlineLevel = item.isDone ? 'green' : getOutlineLevel(item.priority, daysUntil);
            const outlineColor = OUTLINE_COLORS[outlineLevel];
            const priorityStyle = PRIORITY_COLORS[item.priority];

            return (
              <View style={styles.cardRow}>
                <Swipeable
                  renderLeftActions={renderLeftActions}
                  renderRightActions={renderRightActions}
                  overshootRight={false}
                  overshootLeft={false}
                  rightThreshold={72}
                  leftThreshold={72}
                  ref={(ref) => {
                    swipeRef = ref;
                  }}
                  onSwipeableRightOpen={() => {
                    (item.isDone ? handleTaskDelete : handleTaskToggle)();
                  }}
                >
                  <Pressable
                    style={({ pressed }) => [
                      styles.taskCard,
                      { backgroundColor: theme.card, borderColor: outlineColor, borderWidth: 2 },
                      pressed && styles.pressed,
                    ]}
                    onPress={() => router.push({ pathname: '/task-details' as any, params: { id: item.id } })}
                  >
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        handleTaskToggle();
                      }}
                      style={[styles.checkbox, item.isDone && styles.checkboxDone]}
                    >
                      <ThemeIcon name="checkCircle" size={14} color={item.isDone ? COLORS.white : 'transparent'} />
                    </Pressable>
                    <View style={styles.taskBody}>
                      <View style={styles.taskRow}>
                        <Text style={[styles.taskCourse, { color: theme.textSecondary }]}>{item.courseId}</Text>
                        <View style={[styles.priorityBadge, { backgroundColor: priorityStyle.bg }]}>
                          <Text style={[styles.priorityText, { color: priorityStyle.text }]}>{item.priority}</Text>
                        </View>
                      </View>
                      <Text style={[styles.taskTitle, { color: theme.text }, item.isDone && styles.taskDone]} numberOfLines={2}>{item.title}</Text>
                      <View style={styles.taskMeta}>
                        <ThemeIcon name="calendar" size={14} color={theme.textSecondary} />
                        <Text style={[styles.taskMetaText, { color: theme.textSecondary }]}>{formatDisplayDate(item.dueDate)} • {item.dueTime}</Text>
                        <View style={[styles.taskMetaDot, { backgroundColor: theme.textSecondary }]} />
                        <ThemeIcon name="clock" size={14} color={theme.textSecondary} />
                        <Text style={[styles.taskMetaText, { color: theme.textSecondary }]}>{item.effort}h Effort</Text>
                      </View>
                    </View>
                  </Pressable>
                </Swipeable>
              </View>
            );
          }}
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
  list: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 120, zIndex: 0 },
  cardRow: { marginBottom: 14, borderRadius: 24, overflow: 'hidden' },
  taskCard: { flexDirection: 'row', alignItems: 'flex-start', padding: 20, borderRadius: 24 },
  pressed: { opacity: 0.96 },
  checkbox: { width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginRight: 16, marginTop: 1 },
  checkboxDone: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  taskBody: { flex: 1 },
  taskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  taskCourse: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  priorityBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  priorityText: { fontSize: 8, fontWeight: '800' },
  taskTitle: { fontSize: 15, fontWeight: '800', lineHeight: 20 },
  taskDone: { textDecorationLine: 'line-through', opacity: 0.4 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  taskMetaText: { fontSize: 10, fontWeight: '700' },
  taskMetaDot: { width: 4, height: 4, borderRadius: 2 },
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 28, zIndex: 10 },
  sortLabel: { fontSize: 11, fontWeight: '700' },
  sortDropdownContainer: {
    position: 'relative',
    alignItems: 'flex-end',
    zIndex: 11,
  },
  sortDropdownToggle: {
    minWidth: 120,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  sortDropdownText: { fontSize: 11, fontWeight: '700' },
  sortDropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 12,
  },
  sortDropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sortDropdownItemActive: {
    backgroundColor: COLORS.navy,
  },
  sortDropdownItemText: {
    fontSize: 11,
    fontWeight: '600',
  },
  studyCard: { borderWidth: 1 },
  postponeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, alignSelf: 'flex-start' },
  postponeBtnText: { fontSize: 12, fontWeight: '700' },
  swipeActions: {
    width: 100,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  swipeActionBtn: {
    width: 200,
    marginLeft: -100,
    justifyContent: 'center',
    borderRadius: 24,
  },
  swipeActionContent: {
    width: 100,
    marginLeft: 100,
    alignItems: 'center',
  },
  swipeActionsLeft: {
    width: 100,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  swipeActionBtnLeft: {
    width: 200,
    marginRight: -100,
    justifyContent: 'center',
    borderRadius: 24,
  },
  swipeActionContentLeft: {
    width: 100,
    alignItems: 'center',
  },
  swipeActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.white,
  },
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
