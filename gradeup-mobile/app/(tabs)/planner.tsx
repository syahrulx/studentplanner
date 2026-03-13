import { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Modal, TextInput, ScrollView, Alert } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';
import { Priority, TaskType } from '@/src/types';
import Feather from '@expo/vector-icons/Feather';
import { formatDisplayDate, getTodayISO, getWeekDatesFor, getMonthYearLabel, getWeekNumber, getMonthGrid, toISO } from '@/src/utils/date';
import { useTranslations } from '@/src/i18n';

const WEEKDAY_TO_NUM: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

const PRIORITY_COLORS = {
  [Priority.Low]: { bg: 'rgba(34,197,94,0.12)', text: '#16a34a' },
  [Priority.Medium]: { bg: 'rgba(234,179,8,0.15)', text: '#ca8a04' },
  [Priority.High]: { bg: 'rgba(239,68,68,0.15)', text: '#b91c1c' },
} as const;

function getDaysUntilDue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T23:59:59');
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 864e5);
}

function getUrgencyLabelRaw(dueDate: string): { key: string; days: number } {
  const days = getDaysUntilDue(dueDate);
  if (days < 0) return { key: 'overdue', days };
  if (days === 0) return { key: 'today', days };
  if (days === 1) return { key: 'tomorrow', days };
  if (days <= 3) return { key: 'soon', days };
  return { key: 'later', days };
}

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
  revisionId?: string;
};
type PlannerItem = PlannerTaskItem | PlannerStudyItem;

function isStudyItem(item: PlannerItem): item is PlannerStudyItem {
  return item.type === 'study';
}

type ViewMode = 'week' | 'month' | 'all';
type FilterType = 'all' | 'assignment' | 'quiz' | 'project' | 'lab';

export default function Planner() {
  const {
    tasks,
    toggleTaskDone,
    addTask,
    deleteTask,
    revisionSettingsList,
    deleteStudySetting,
    completedStudyKeys,
    markStudyDone,
    unmarkStudyDone,
    pinnedTaskIds,
    pinTask,
    unpinTask,
    getSubjectColor,
    user,
    language,
  } = useApp();
  const T = useTranslations(language);
  const [view, setView] = useState<ViewMode>('week');
  const [activeDate, setActiveDate] = useState<string>(() => getTodayISO());
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [sortMode, setSortMode] = useState<'nearest' | 'priority-desc' | 'subject'>('nearest');
  const [messages, setMessages] = useState<{ role: 'ai' | 'user'; text: string }[]>([
    { role: 'ai', text: '' },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  const todayISO = getTodayISO();
  const weekDays = useMemo(() => getWeekDatesFor(activeDate), [activeDate]);

  const goToPrevWeek = () => {
    const d = new Date(activeDate + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    setActiveDate(d.toISOString().slice(0, 10));
  };
  const goToNextWeek = () => {
    const d = new Date(activeDate + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    setActiveDate(d.toISOString().slice(0, 10));
  };
  const hasTaskOnDay = (dateISO: string) => tasks.some((t) => t.dueDate === dateISO);
  const getTaskCountOnDay = (dateISO: string) => tasks.filter((t) => t.dueDate === dateISO).length;
  const activeYear = useMemo(() => new Date(activeDate + 'T12:00:00').getFullYear(), [activeDate]);
  const activeMonth = useMemo(() => new Date(activeDate + 'T12:00:00').getMonth(), [activeDate]);
  const monthGridCells = useMemo(() => getMonthGrid(activeYear, activeMonth), [activeYear, activeMonth]);

  const goToPrevMonth = () => {
    const d = new Date(activeYear, activeMonth, 1);
    d.setMonth(d.getMonth() - 1);
    setActiveDate(d.toISOString().slice(0, 10));
  };
  const goToNextMonth = () => {
    const d = new Date(activeYear, activeMonth, 1);
    d.setMonth(d.getMonth() + 1);
    setActiveDate(d.toISOString().slice(0, 10));
  };
  const goToToday = () => setActiveDate(todayISO);

  const studyItemsForPlanner = useMemo((): PlannerStudyItem[] => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const in30 = new Date(now);
    in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().slice(0, 10);
    const out: PlannerStudyItem[] = [];
    for (const revisionSettings of revisionSettingsList) {
      if (!revisionSettings.time) continue;
      const [h, m] = revisionSettings.time.split(':').map((x) => parseInt(x, 10) || 0);
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const subject = revisionSettings.subjectId || 'Study';
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
            revisionId: revisionSettings.id,
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
              revisionId: revisionSettings.id,
            });
          }
        }
      }
    }
    return out;
  }, [revisionSettingsList, completedStudyKeys]);

  const filteredTasks = useMemo(() => {
    let list: import('@/src/types').Task[];
    if (view === 'all') {
      list = [...tasks];
    } else if (view === 'week') {
      list = tasks.filter((t) => t.dueDate === activeDate);
    } else {
      list = tasks.filter((t) => {
        const [y, m] = t.dueDate.split('-').map(Number);
        return y === activeYear && m === activeMonth + 1;
      });
    }
    if (activeFilter !== 'all') {
      const typeMap: Record<string, string> = {
        assignment: TaskType.Assignment,
        quiz: TaskType.Quiz,
        project: TaskType.Project,
        lab: TaskType.Lab,
      };
      const targetType = typeMap[activeFilter];
      if (targetType) {
        list = list.filter((t) => t.type === targetType);
      }
    }
    return list;
  }, [tasks, activeDate, view, activeYear, activeMonth, activeFilter]);

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

    const compareTasks = (a: PlannerTaskItem, b: PlannerTaskItem): number => {
      // Incomplete above completed
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;

      if (sortMode === 'priority-desc') {
        const rank: Record<Priority, number> = {
          [Priority.High]: 3,
          [Priority.Medium]: 2,
          [Priority.Low]: 1,
        };
        if (rank[a.priority] !== rank[b.priority]) {
          return rank[b.priority] - rank[a.priority];
        }
      }

      if (sortMode === 'subject') {
        const c = a.courseId.localeCompare(b.courseId);
        if (c !== 0) return c;
      }

      const d = a.dueDate.localeCompare(b.dueDate);
      if (d !== 0) return d;
      return a.dueTime.localeCompare(b.dueTime);
    };

    pinned.sort(compareTasks);

    unpinned.sort((a, b) => {
      const aIsTask = a.type === 'task';
      const bIsTask = b.type === 'task';

      if (aIsTask && bIsTask) {
        return compareTasks(a as PlannerTaskItem, b as PlannerTaskItem);
      }

      // Tasks always before study items in mixed views
      if (aIsTask && !bIsTask) return -1;
      if (!aIsTask && bIsTask) return 1;

      // Both study items: sort by date then time (defensive for missing fields)
      const sa = a as PlannerStudyItem;
      const sb = b as PlannerStudyItem;
      const dateA = sa.date ?? '';
      const dateB = sb.date ?? '';
      const d = dateA.localeCompare(dateB);
      if (d !== 0) return d;
      const timeA = sa.time ?? '';
      const timeB = sb.time ?? '';
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
          { role: 'ai', text: `${T('taskExtracted')}\n\n${title}\nDue: ${extractedDate}\nPriority: High\n\n${T('addedToPlanner')}` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'ai', text: T('reOptimizedMsg') },
        ]);
      }
      setIsProcessing(false);
    }, 1500);
  };

  const activeDateDay = new Date(activeDate + 'T12:00:00').getDate();
  const activeMonthName = new Date(activeDate + 'T12:00:00').toLocaleString('en', { month: 'short' }).toUpperCase();

  const renderListHeader = () => (
    <>
      {/* AI Strategist Card */}
      <View style={s.aiCard}>
        <View style={s.aiCardHeader}>
          <View style={s.aiIconWrap}>
            <Feather name="clock" size={16} color={COLORS.white} />
          </View>
          <Text style={s.aiCardTitle}>{T('aiAcademicStrategist')}</Text>
        </View>
        <Text style={s.aiCardText}>{messages[messages.length - 1]?.text || T('analysisMsg')}</Text>
        <View style={s.aiCardFooter}>
          <View style={s.aiDot} />
          <Text style={s.aiFooterText}>{T('sowAlignment')}: 94%</Text>
        </View>
      </View>

      {/* Week Strip */}
      {view === 'week' && (
        <View style={s.weekStrip}>
          {weekDays.map((day) => {
            const isActive = activeDate === day.dateISO;
            const hasTask = hasTaskOnDay(day.dateISO);
            return (
              <Pressable key={day.dateISO} style={s.weekDay} onPress={() => setActiveDate(day.dateISO)}>
                <Text style={[s.weekLabel, isActive && s.weekLabelActive]}>{day.label}</Text>
                <Text style={[s.weekDate, isActive && s.weekDateActive]}>{day.dayNum}</Text>
                {isActive && <View style={s.weekIndicator} />}
                {!isActive && hasTask && <View style={s.weekTaskDot} />}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Month Grid */}
      {view === 'month' && (
        <View style={s.monthCard}>
          <View style={s.monthNavRow}>
            <Pressable style={s.monthNavBtn} onPress={goToPrevMonth} hitSlop={12}>
              <Feather name="chevron-left" size={20} color="#1A1C1E" />
            </Pressable>
            <Text style={s.monthNavTitle}>{getMonthYearLabel(activeDate)}</Text>
            <Pressable style={s.monthNavBtn} onPress={goToNextMonth} hitSlop={12}>
              <Feather name="chevron-right" size={20} color="#1A1C1E" />
            </Pressable>
          </View>
          <View style={s.monthHeaders}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((h, i) => (
              <Text key={i} style={s.monthHeaderText}>{h}</Text>
            ))}
          </View>
          <View style={s.monthGrid}>
            {monthGridCells.map((d, i) => {
              const dateISO = d != null ? toISO(activeYear, activeMonth, d) : null;
              const isSelected = dateISO != null && activeDate === dateISO;
              const isToday = dateISO === todayISO;
              const hasTask = dateISO != null && hasTaskOnDay(dateISO);
              return d != null ? (
                <Pressable
                  key={i}
                  style={s.monthCell}
                  onPress={() => setActiveDate(dateISO!)}
                >
                  <View
                    style={[
                      s.monthDayBubble,
                      isSelected && s.monthDayBubbleActive,
                      isToday && !isSelected && s.monthDayBubbleToday,
                    ]}
                  >
                    <Text
                      style={[
                        s.monthCellText,
                        isSelected && s.monthCellTextActive,
                        isToday && !isSelected && { color: NAVY, fontWeight: '900' as const },
                      ]}
                    >
                      {d}
                    </Text>
                  </View>
                  {hasTask && <View style={s.monthDot} />}
                </Pressable>
              ) : (
                <View key={i} style={s.monthCellEmpty} />
              );
            })}
          </View>
        </View>
      )}

      {/* Task list header + filter */}
      <View style={s.taskListHeader}>
        <Text style={s.taskListLabel}>
          {view === 'all' ? T('allTasks') : `${listCount} ${T('deadlines')} \u2022 ${activeMonthName} ${activeDateDay}`}
        </Text>
        <Pressable onPress={() => setFilterMenuOpen((o) => !o)}>
          <Text style={s.filterLabel}>{T('filterSort')}</Text>
        </Pressable>
      </View>

      {filterMenuOpen && (
        <>
          <View style={s.filterRow}>
            {[
              { key: 'all' as FilterType, label: T('all') },
              { key: 'assignment' as FilterType, label: T('assign') },
              { key: 'quiz' as FilterType, label: T('quiz') },
              { key: 'project' as FilterType, label: T('project') },
              { key: 'lab' as FilterType, label: T('lab') },
            ].map((f) => (
              <Pressable
                key={f.key}
                style={[s.filterChip, activeFilter === f.key && s.filterChipActive]}
                onPress={() => { setActiveFilter(f.key); }}
              >
                <Text style={[s.filterChipText, activeFilter === f.key && s.filterChipTextActive]}>{f.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={s.sortRow}>
            <Text style={s.sortLabel}>{T('sort')}</Text>
            <View style={s.sortChips}>
              <Pressable
                style={[s.sortChip, sortMode === 'nearest' && s.sortChipActive]}
                onPress={() => setSortMode('nearest')}
              >
                <Text style={[s.sortChipText, sortMode === 'nearest' && s.sortChipTextActive]}>{T('nearestDue')}</Text>
              </Pressable>
              <Pressable
                style={[s.sortChip, sortMode === 'priority-desc' && s.sortChipActive]}
                onPress={() => setSortMode('priority-desc')}
              >
                <Text style={[s.sortChipText, sortMode === 'priority-desc' && s.sortChipTextActive]}>{T('priorityHighLow')}</Text>
              </Pressable>
              <Pressable
                style={[s.sortChip, sortMode === 'subject' && s.sortChipActive]}
                onPress={() => setSortMode('subject')}
              >
                <Text style={[s.sortChipText, sortMode === 'subject' && s.sortChipTextActive]}>{T('subject')}</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
    </>
  );

  const renderItem = ({ item }: { item: PlannerItem }) => {
    if (isStudyItem(item)) {
      let swipeRef: Swipeable | null = null;
      const closeSwipe = () => swipeRef?.close();
      const handleStudyToggle = () => {
        if (item.isDone) {
          Alert.alert(T('markAsNotDone'), T('markStudyNotDone'), [
            { text: T('cancel'), style: 'cancel', onPress: closeSwipe },
            { text: T('undo'), onPress: () => { unmarkStudyDone(item.studyKey); closeSwipe(); } },
          ]);
        } else {
          Alert.alert(T('markAsDoneQuestion'), T('markStudyDone'), [
            { text: T('cancel'), style: 'cancel', onPress: closeSwipe },
            { text: T('markDone'), onPress: () => { markStudyDone(item.studyKey); closeSwipe(); } },
          ]);
        }
      };
      const handleStudyDelete = () => {
        if (!item.revisionId) {
          closeSwipe();
          return;
        }
        Alert.alert(T('deleteRevision'), T('turnOffReminder'), [
          { text: T('cancel'), style: 'cancel', onPress: closeSwipe },
          {
            text: T('delete'),
            style: 'destructive',
            onPress: async () => {
              await deleteStudySetting(item.revisionId!);
              closeSwipe();
            },
          },
        ]);
      };
      const renderRightActions = () => (
        <View style={s.swipeActions}>
          <Pressable
            style={[s.swipeActionBtn, { backgroundColor: item.isDone ? '#ef4444' : '#22c55e' }]}
            onPress={item.isDone ? handleStudyDelete : handleStudyToggle}
          >
            <Text style={s.swipeActionText}>{item.isDone ? T('delete') : T('done')}</Text>
          </Pressable>
        </View>
      );
      return (
        <View style={s.cardRow}>
          <Swipeable
            renderRightActions={renderRightActions}
            overshootRight={false}
            rightThreshold={72}
            ref={(ref) => { swipeRef = ref; }}
            onSwipeableOpen={() => { (item.isDone ? handleStudyDelete : handleStudyToggle)(); }}
          >
            <View style={s.taskCard}>
              <Pressable
                style={[s.checkbox, item.isDone && s.checkboxDone]}
                onPress={handleStudyToggle}
              >
                {item.isDone && <Feather name="check" size={12} color={COLORS.white} />}
              </Pressable>
              <View style={s.taskContent}>
                <View style={s.taskTopRow}>
                  <Text style={s.taskCourse}>{item.subjectId}</Text>
                  <Text style={s.taskType}>{T('study')}</Text>
                </View>
                <Text style={[s.taskTitle, item.isDone && s.taskTitleDone]} numberOfLines={2}>
                  {T('timeToStudy')}{item.topic ? `: ${item.topic}` : ''}
                </Text>
                <View style={s.taskMetaRow}>
                  <Feather name="calendar" size={11} color="#8E9AAF" />
                  <Text style={s.taskMetaText}>{formatDisplayDate(item.date)} {'\u2022'} {item.time}</Text>
                  <Feather name="clock" size={11} color="#8E9AAF" />
                  <Text style={s.taskMetaText}>{item.durationMinutes}min</Text>
                </View>
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
        Alert.alert(T('markAsNotDone'), `"${item.title}" ${T('markAsIncomplete')}`, [
          { text: T('cancel'), style: 'cancel', onPress: closeSwipe },
          { text: T('undo'), onPress: () => { toggleTaskDone(item.id); closeSwipe(); } },
        ]);
      } else {
        Alert.alert(T('markAsDoneQuestion'), `"${item.title}" ${T('markAsCompleted')}`, [
          { text: T('cancel'), style: 'cancel', onPress: closeSwipe },
          { text: T('markDone'), onPress: () => { toggleTaskDone(item.id); closeSwipe(); } },
        ]);
      }
    };
    const handleTaskDelete = () => {
      Alert.alert(T('deleteTask'), `"${item.title}" ${T('deleteTaskDesc')}`, [
        { text: T('cancel'), style: 'cancel', onPress: closeSwipe },
        { text: T('delete'), style: 'destructive', onPress: () => { deleteTask(item.id); closeSwipe(); } },
      ]);
    };
    const isPinned = pinnedTaskIds.includes(item.id);
    const handlePinPress = () => {
      if (isPinned) { unpinTask(item.id); }
      else {
        const added = pinTask(item.id);
        if (!added) Alert.alert(T('limitReached'), T('pinLimit'));
      }
      closeSwipe();
    };
    const renderLeftActions = () => (
      <View style={s.swipeActionsLeft}>
        <Pressable style={[s.swipeActionBtnLeft, { backgroundColor: '#0e7490' }]} onPress={handlePinPress}>
          <Text style={s.swipeActionText}>{isPinned ? T('unpin') : T('pin')}</Text>
        </Pressable>
      </View>
    );
    const renderRightActions = () => (
      <View style={s.swipeActions}>
        <Pressable
          style={[s.swipeActionBtn, { backgroundColor: item.isDone ? '#ef4444' : '#22c55e' }]}
          onPress={item.isDone ? handleTaskDelete : handleTaskToggle}
        >
          <Text style={s.swipeActionText}>{item.isDone ? T('delete') : T('done')}</Text>
        </Pressable>
      </View>
    );

    const daysUntil = getDaysUntilDue(item.dueDate);
    const urgencyRaw = getUrgencyLabelRaw(item.dueDate);
    const urgencyLabel = urgencyRaw.key === 'overdue' ? T('dueOverdue')
      : urgencyRaw.key === 'today' ? T('dueTodayLabel')
      : urgencyRaw.key === 'tomorrow' ? T('dueTomorrow')
      : urgencyRaw.key === 'soon' ? `${T('dueInDays')} ${urgencyRaw.days} ${T('daysWord')}`
      : `${T('due')} ${formatDisplayDate(item.dueDate)}`;
    const isOverdue = daysUntil < 0;
    const isDueSoon = !isOverdue && daysUntil <= 3;
    const priorityColors = PRIORITY_COLORS[item.priority];

    return (
      <View style={s.cardRow}>
        <Swipeable
          renderLeftActions={renderLeftActions}
          renderRightActions={renderRightActions}
          overshootRight={false}
          overshootLeft={false}
          rightThreshold={72}
          leftThreshold={72}
          ref={(ref) => { swipeRef = ref; }}
          onSwipeableRightOpen={() => { (item.isDone ? handleTaskDelete : handleTaskToggle)(); }}
        >
          <Pressable
            style={[
              s.taskCard,
              {
                borderColor: isOverdue ? '#dc2626' : isDueSoon ? '#d97706' : BORDER,
              },
            ]}
            onPress={() => router.push({ pathname: '/task-details' as any, params: { id: item.id } })}
          >
            <View style={[s.subjectBookmark, { backgroundColor: getSubjectColor(item.courseId) }]} />
            <Pressable
              style={[s.checkbox, item.isDone && s.checkboxDone]}
              onPress={(e) => { e.stopPropagation(); handleTaskToggle(); }}
            >
              {item.isDone && <Feather name="check" size={12} color={COLORS.white} />}
            </Pressable>
            <View style={s.taskContent}>
              <View style={s.taskTopRow}>
                <Text style={s.taskCourse}>{item.courseId}</Text>
                <View style={s.priorityPill}>
                  <View style={[s.priorityBadge, { backgroundColor: priorityColors.bg }]}>
                    <Text style={[s.priorityText, { color: priorityColors.text }]}>{item.priority}</Text>
                  </View>
                </View>
              </View>
              <Text style={[s.taskTitle, item.isDone && s.taskTitleDone]} numberOfLines={2}>
                {item.courseId}: {item.title}
              </Text>
              <View style={s.taskMetaRow}>
                <Feather name="calendar" size={11} color="#8E9AAF" />
                <Text
                  style={[
                    s.taskMetaText,
                    (isOverdue || isDueSoon) && s.taskMetaUrgent,
                  ]}
                >
                  {urgencyLabel}
                </Text>
              </View>
              <View style={s.taskMetaRow}>
                <Feather name="clock" size={11} color="#8E9AAF" />
                <Text style={s.taskMetaText}>{item.dueTime}</Text>
                <Feather name="trending-up" size={11} color="#8E9AAF" />
                <Text style={s.taskMetaText}>{item.effort}h {T('effort')}</Text>
              </View>
            </View>
          </Pressable>
        </Swipeable>
      </View>
    );
  };

  return (
    <View style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTopRow}>
          <View>
            <Text style={s.headerTitle}>{T('academicPlanner')}</Text>
            <Text style={s.headerSub}>{getMonthYearLabel(activeDate).toUpperCase()} {'\u2022'} W{getWeekNumber(activeDate)}</Text>
          </View>
          <View style={s.headerBtns}>
            <Pressable style={s.addBtn} onPress={() => router.push('/add-task' as any)}>
              <Feather name="plus" size={18} color={COLORS.white} />
            </Pressable>
            <Pressable style={s.addStudyBtn} onPress={() => router.push('/revision' as any)}>
              <Feather name="book-open" size={16} color={NAVY} />
            </Pressable>
          </View>
        </View>
        <View style={s.viewToggleWrap}>
          <View style={s.viewToggle}>
            {(['week', 'month', 'all'] as ViewMode[]).map((v) => {
              const vLabel = v === 'week' ? T('week') : v === 'month' ? T('month') : T('all');
              return (
                <Pressable
                  key={v}
                  style={[s.viewBtn, view === v && s.viewBtnActive]}
                  onPress={() => setView(v)}
                >
                  <Text style={[s.viewBtnText, view === v && s.viewBtnTextActive]}>{vLabel}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <FlatList
        data={displayList}
        extraData={pinnedTaskIds}
        keyExtractor={(item, index) => {
          const id = item.type === 'task' ? item.id : item.studyKey;
          return `${index}-${id ?? `item-${index}`}`;
        }}
        renderItem={renderItem}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Feather name="check-circle" size={40} color="#e2e8f0" />
            <Text style={s.emptyText}>{T('noTasksForDay')}</Text>
          </View>
        }
      />

      {/* AI FAB */}
      <Pressable style={s.aiFab} onPress={() => setIsChatOpen(true)}>
        <Feather name="zap" size={22} color={COLORS.white} />
      </Pressable>

      {/* AI Chat Modal */}
      <Modal visible={isChatOpen} animationType="slide" transparent>
        <Pressable style={s.chatOverlay} onPress={() => setIsChatOpen(false)}>
          <View style={s.chatSheet} onStartShouldSetResponder={() => true}>
            <View style={s.chatHeader}>
              <View style={s.chatHeaderLeft}>
                <View style={s.chatIcon}>
                  <Feather name="zap" size={16} color={GOLD} />
                </View>
                <View>
                  <Text style={s.chatTitle}>{T('aiStrategist')}</Text>
                  <Text style={s.chatSub}>{T('academicCoPilot')}</Text>
                </View>
              </View>
              <Pressable onPress={() => setIsChatOpen(false)}>
                <Feather name="x" size={22} color="rgba(255,255,255,0.6)" />
              </Pressable>
            </View>
            <ScrollView style={s.chatMessages} contentContainerStyle={s.chatMessagesContent}>
              {messages.map((m, i) => (
                <View key={i} style={[s.chatBubbleWrap, m.role === 'user' && s.chatBubbleRight]}>
                  <View style={[s.chatBubble, m.role === 'user' ? s.chatBubbleUser : s.chatBubbleAi]}>
                    <Text style={[s.chatBubbleText, m.role === 'user' && { color: COLORS.white }]}>{m.text}</Text>
                  </View>
                </View>
              ))}
              {isProcessing && (
                <View style={s.chatBubbleWrap}>
                  <View style={[s.chatBubble, s.chatBubbleAi]}>
                    <Text style={s.chatBubbleText}>{T('analyzing')}</Text>
                  </View>
                </View>
              )}
            </ScrollView>
            <View style={s.chatInputRow}>
              <TextInput
                style={s.chatInput}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder={T('typeYourPlan')}
                placeholderTextColor="#8E9AAF"
                onSubmitEditing={handleAiSend}
              />
              <Pressable
                style={[s.chatSendBtn, (!chatInput.trim() || isProcessing) && { opacity: 0.5 }]}
                onPress={handleAiSend}
                disabled={!chatInput.trim() || isProcessing}
              >
                <Feather name="arrow-right" size={18} color={COLORS.white} />
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const NAVY = '#003366';
const GOLD = '#D4AF37';
const BG = '#f8fafc';
const BORDER = '#e2e8f0';
const TEXT_PRIMARY = '#1A1C1E';
const TEXT_SECONDARY = '#8E9AAF';

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG, paddingTop: 56 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: NAVY, letterSpacing: -0.3 },
  headerSub: { fontSize: 10, fontWeight: '800', color: TEXT_SECONDARY, letterSpacing: 1.2, marginTop: 2 },
  viewToggleWrap: { alignItems: 'center' },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 2,
  },
  viewBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10 },
  viewBtnActive: { backgroundColor: NAVY },
  viewBtnText: { fontSize: 10, fontWeight: '900', color: TEXT_SECONDARY, letterSpacing: 1.5 },
  viewBtnTextActive: { color: '#ffffff' },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStudyBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },

  listContent: { paddingHorizontal: 20, paddingBottom: 120 },

  // AI Card
  aiCard: {
    backgroundColor: NAVY,
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
  },
  aiCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  aiIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiCardTitle: { fontSize: 10, fontWeight: '900', color: '#ffffff', letterSpacing: 2 },
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
  weekLabel: { fontSize: 11, fontWeight: '600', color: TEXT_SECONDARY, marginBottom: 10 },
  weekLabelActive: { color: NAVY, fontWeight: '900' },
  weekDate: { fontSize: 22, fontWeight: '700', color: TEXT_SECONDARY, marginBottom: 8 },
  weekDateActive: { fontSize: 30, fontWeight: '900', color: TEXT_PRIMARY },
  weekIndicator: { width: 24, height: 3, borderRadius: 2, backgroundColor: NAVY },
  weekTaskDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: GOLD },

  // Month Grid
  monthCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 20,
  },
  monthNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthNavBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  monthNavTitle: { fontSize: 17, fontWeight: '900', color: TEXT_PRIMARY, letterSpacing: -0.3 },
  monthHeaders: { flexDirection: 'row', marginBottom: 8 },
  monthHeaderText: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '900', color: TEXT_SECONDARY },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthDayBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthDayBubbleActive: { backgroundColor: NAVY },
  monthDayBubbleToday: { borderWidth: 2, borderColor: NAVY },
  monthCellEmpty: { width: '14.28%', aspectRatio: 1 },
  monthCellText: { fontSize: 13, fontWeight: '600', color: TEXT_SECONDARY },
  monthCellTextActive: { color: '#ffffff', fontWeight: '900' },
  monthDot: {
    position: 'absolute',
    bottom: 4,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: GOLD,
  },

  // Task list header + filter
  taskListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  taskListLabel: { fontSize: 10, fontWeight: '900', color: TEXT_SECONDARY, letterSpacing: 1.5 },
  filterLabel: { fontSize: 10, fontWeight: '700', color: NAVY, letterSpacing: 1 },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: BORDER,
  },
  filterChipActive: { backgroundColor: NAVY, borderColor: NAVY },
  filterChipText: { fontSize: 9, fontWeight: '900', color: TEXT_SECONDARY, letterSpacing: 1 },
  filterChipTextActive: { color: '#ffffff' },

  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sortLabel: { fontSize: 10, fontWeight: '800', color: TEXT_SECONDARY },
  sortChips: { flexDirection: 'row', gap: 8 },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: BORDER,
  },
  sortChipActive: { backgroundColor: NAVY, borderColor: NAVY },
  sortChipText: { fontSize: 9, fontWeight: '800', color: TEXT_SECONDARY },
  sortChipTextActive: { color: '#ffffff' },

  // Task Card
  cardRow: { marginBottom: 12, borderRadius: 28, overflow: 'hidden' },
  taskCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    alignItems: 'flex-start',
    gap: 14,
    position: 'relative',
  },
  subjectBookmark: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  checkboxDone: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  taskContent: { flex: 1 },
  taskTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  taskCourse: { fontSize: 10, fontWeight: '900', color: TEXT_SECONDARY, letterSpacing: 1.5 },
  priorityPill: { flexDirection: 'row', alignItems: 'center' },
  priorityBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  priorityText: { fontSize: 10, fontWeight: '800' },
  taskTitle: { fontSize: 15, fontWeight: '900', color: NAVY, lineHeight: 20, marginBottom: 8 },
  taskTitleDone: { textDecorationLine: 'line-through', opacity: 0.4 },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.6 },
  taskMetaText: { fontSize: 11, fontWeight: '600', color: TEXT_SECONDARY },
  taskMetaUrgent: { fontWeight: '800', color: '#b91c1c' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 12, fontWeight: '700', color: TEXT_SECONDARY },

  // Swipe actions
  swipeActions: { width: 100, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'stretch' },
  swipeActionBtn: { width: 100, justifyContent: 'center', alignItems: 'center', borderRadius: 28 },
  swipeActionsLeft: { width: 100, flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'stretch' },
  swipeActionBtnLeft: { width: 100, justifyContent: 'center', alignItems: 'center', borderRadius: 28 },
  swipeActionText: { fontSize: 12, fontWeight: '800', color: '#ffffff' },

  // FAB
  aiFab: {
    position: 'absolute',
    right: 20,
    bottom: 120,
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },

  // Chat Modal
  chatOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  chatSheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '80%' },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: NAVY,
    padding: 20,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
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
  chatTitle: { fontSize: 14, fontWeight: '900', color: '#ffffff' },
  chatSub: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5 },
  chatMessages: { maxHeight: 300, backgroundColor: BG },
  chatMessagesContent: { padding: 16, gap: 10 },
  chatBubbleWrap: { alignItems: 'flex-start' },
  chatBubbleRight: { alignItems: 'flex-end' },
  chatBubble: { maxWidth: '85%', padding: 14, borderRadius: 18 },
  chatBubbleAi: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: BORDER, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  chatBubbleUser: { backgroundColor: NAVY, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  chatBubbleText: { fontSize: 13, lineHeight: 19, color: TEXT_PRIMARY, fontWeight: '500' },
  chatInputRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: '#ffffff',
  },
  chatInput: {
    flex: 1,
    backgroundColor: BG,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_PRIMARY,
  },
  chatSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
