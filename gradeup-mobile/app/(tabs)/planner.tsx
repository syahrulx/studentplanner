import { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Modal, TextInput, ScrollView, Alert, Dimensions, LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';
import { Priority, TaskType } from '@/src/types';
import Feather from '@expo/vector-icons/Feather';
import { formatDisplayDate, getTodayISO, getWeekDatesFor, getMonthYearLabel, getWeekNumber, getMonthGrid, toISO } from '@/src/utils/date';
import { useTranslations } from '@/src/i18n';
import { extractTasksFromMessage as extractTasksFromMessageAI } from '@/src/lib/taskExtraction';
import { buildTaskFromExtraction } from '@/src/lib/taskUtils';

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

// Format a Date to YYYY-MM-DD using local timezone (avoids UTC shift for GMT+8)
function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getUrgencyLabelRaw(dueDate: string): { key: string; days: number } {
  const days = getDaysUntilDue(dueDate);
  if (days < 0) return { key: 'overdue', days };
  if (days === 0) return { key: 'today', days };
  if (days === 1) return { key: 'tomorrow', days };
  if (days <= 3) return { key: 'soon', days };
  return { key: 'later', days };
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;
  const value = Number.parseInt(expanded, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type PlannerTaskItem = { itemType: 'task'; id: string } & import('@/src/types').Task;
type PlannerStudyItem = {
  itemType: 'study';
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
  return item.itemType === 'study';
}

type ViewMode = 'week' | 'month' | 'all';
type FilterType = 'all' | 'assignment' | 'quiz' | 'project' | 'lab';
const CALENDAR_STRIP_SLOT = 64;

export default function Planner() {
  const scrollRef = useRef<ScrollView>(null);
  
  const {
    tasks,
    toggleTaskDone,
    addTask,
    courses,
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
  const [calendarPreviewDate, setCalendarPreviewDate] = useState<string>(() => getTodayISO());
  const [isCalendarDragging, setIsCalendarDragging] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [sortMode, setSortMode] = useState<'nearest' | 'priority-desc' | 'subject'>('nearest');
  const [messages, setMessages] = useState<{ role: 'ai' | 'user'; text: string }[]>([
    { role: 'ai', text: '' },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAiCard, setShowAiCard] = useState(false);
  const [calendarStripWidth, setCalendarStripWidth] = useState(0);
  const activeDateRef = useRef(activeDate);
  const calendarPreviewDateRef = useRef(calendarPreviewDate);
  const skipCalendarRecenteringRef = useRef(false);

  const todayISO = getTodayISO();
  const activeYear = useMemo(() => new Date(activeDate + 'T12:00:00').getFullYear(), [activeDate]);
  const activeMonth = useMemo(() => new Date(activeDate + 'T12:00:00').getMonth(), [activeDate]);

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const calendarStripSideInset = useMemo(() => {
    const fallbackWidth = Dimensions.get('window').width - 72;
    const stripWidth = calendarStripWidth || fallbackWidth;
    return Math.max(16, stripWidth / 2 - CALENDAR_STRIP_SLOT / 2);
  }, [calendarStripWidth]);
  const monthDays = useMemo(() => {
    const daysInMonth = new Date(activeYear, activeMonth + 1, 0).getDate();
    const result: { dateISO: string; dayNum: string; label: string }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(activeYear, activeMonth, d);
      const iso = `${activeYear}-${String(activeMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      result.push({
        dateISO: iso,
        dayNum: String(d),
        label: DAY_LABELS[dt.getDay()],
      });
    }
    return result;
  }, [activeYear, activeMonth]);
  const calendarSnapOffsets = useMemo(
    () => monthDays.map((_, index) => index * CALENDAR_STRIP_SLOT),
    [monthDays]
  );

  const calendarStripRef = useRef<ScrollView>(null);

  useEffect(() => {
    activeDateRef.current = activeDate;
  }, [activeDate]);

  useEffect(() => {
    calendarPreviewDateRef.current = calendarPreviewDate;
  }, [calendarPreviewDate]);

  const centerCalendarDate = (dateISO: string, animated: boolean) => {
    const dayIndex = monthDays.findIndex((day) => day.dateISO === dateISO);
    if (dayIndex < 0) return;
    calendarStripRef.current?.scrollTo({ x: dayIndex * CALENDAR_STRIP_SLOT, animated });
  };

  // Keep the chosen date centered unless the user just got there by scrolling.
  useEffect(() => {
    if (skipCalendarRecenteringRef.current) {
      skipCalendarRecenteringRef.current = false;
      return;
    }
    setCalendarPreviewDate(activeDate);
    requestAnimationFrame(() => {
      centerCalendarDate(activeDate, true);
    });
  }, [activeDate, monthDays, calendarStripSideInset]);

  const handleCalendarStripLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const nextWidth = Math.round(nativeEvent.layout.width);
    setCalendarStripWidth((prev) => (prev === nextWidth ? prev : nextWidth));
  };

  const getCenteredDateFromOffset = (offsetX: number): string | null => {
    if (monthDays.length === 0) return null;
    const centeredIndex = Math.max(0, Math.min(monthDays.length - 1, Math.round(offsetX / CALENDAR_STRIP_SLOT)));
    return monthDays[centeredIndex]?.dateISO ?? null;
  };

  const commitCenteredDate = (offsetX: number, animated: boolean) => {
    const centeredDate = getCenteredDateFromOffset(offsetX);
    setIsCalendarDragging(false);
    if (!centeredDate) return;
    if (centeredDate !== calendarPreviewDateRef.current) {
      setCalendarPreviewDate(centeredDate);
    }
    if (centeredDate !== activeDateRef.current) {
      skipCalendarRecenteringRef.current = true;
      setActiveDate(centeredDate);
    }
    requestAnimationFrame(() => {
      centerCalendarDate(centeredDate, animated);
    });
  };

  const handleCalendarMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    commitCenteredDate(event.nativeEvent.contentOffset.x, false);
  };

  const handleCalendarDragEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Math.abs(event.nativeEvent.velocity?.x ?? 0) > 0.02) return;
    commitCenteredDate(event.nativeEvent.contentOffset.x, true);
  };

  const goToPrevWeek = () => {
    const d = new Date(activeDate + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    setActiveDate(toLocalISO(d));
  };
  const goToNextWeek = () => {
    const d = new Date(activeDate + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    setActiveDate(toLocalISO(d));
  };
  const hasTaskOnDay = (dateISO: string) => tasks.some((t) => t.dueDate === dateISO);
  const getTaskCountOnDay = (dateISO: string) => tasks.filter((t) => t.dueDate === dateISO).length;
  const monthGridCells = useMemo(() => getMonthGrid(activeYear, activeMonth), [activeYear, activeMonth]);

  const goToPrevMonth = () => {
    let y = activeYear;
    let m = activeMonth - 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    setActiveDate(`${y}-${String(m + 1).padStart(2, '0')}-01`);
  };
  
  const goToNextMonth = () => {
    let y = activeYear;
    let m = activeMonth + 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setActiveDate(`${y}-${String(m + 1).padStart(2, '0')}-01`);
  };
  
  const goToToday = () => setActiveDate(todayISO);

  const studyItemsForPlanner = useMemo((): PlannerStudyItem[] => {
    const now = new Date();
    const todayStr = toLocalISO(now);
    const in30 = new Date(now);
    in30.setDate(in30.getDate() + 30);
    const in30Str = toLocalISO(in30);
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
            itemType: 'study',
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
          const dateStr = toLocalISO(dte);
          if (dateStr < todayStr) continue;
          if (dateStr > in30Str) break;
          const dayNum = dte.getDay();
          if (targetWeekday === null || dayNum === targetWeekday) {
            const key = `${dateStr}T${timeStr}`;
            out.push({
              itemType: 'study',
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

  const filteredStudyItems = useMemo((): PlannerStudyItem[] => {
    if (view === 'all') {
      return studyItemsForPlanner;
    }
    if (view === 'week') {
      return studyItemsForPlanner.filter((item) => item.date === activeDate);
    }
    return studyItemsForPlanner.filter((item) => {
      const [y, m] = item.date.split('-').map(Number);
      return y === activeYear && m === activeMonth + 1;
    });
  }, [studyItemsForPlanner, activeDate, view, activeYear, activeMonth]);

  const combinedList = useMemo((): PlannerItem[] => {
    const taskItems: PlannerItem[] = filteredTasks.map((t) => ({ ...t, itemType: 'task' as const }));
    const studyItems: PlannerItem[] = filteredStudyItems;
    const all: PlannerItem[] = [...taskItems, ...studyItems];
    all.sort((a, b) => {
      const dateA = (a.itemType === 'task' ? a.dueDate : a.date) ?? '';
      const dateB = (b.itemType === 'task' ? b.dueDate : b.date) ?? '';
      const timeA = (a.itemType === 'task' ? a.dueTime : a.time) ?? '';
      const timeB = (b.itemType === 'task' ? b.dueTime : b.time) ?? '';
      const d = dateA.localeCompare(dateB);
      return d !== 0 ? d : timeA.localeCompare(timeB);
    });
    return all;
  }, [filteredTasks, filteredStudyItems]);

  const pinnedSet = useMemo(() => new Set(pinnedTaskIds), [pinnedTaskIds]);
  const displayList = useMemo((): PlannerItem[] => {
    const raw = combinedList;
    const isPinned = (item: PlannerItem): item is PlannerTaskItem =>
      item.itemType === 'task' && typeof (item as PlannerTaskItem).id === 'string' && pinnedSet.has((item as PlannerTaskItem).id);

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
      const aIsTask = a.itemType === 'task';
      const bIsTask = b.itemType === 'task';

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
  }, [combinedList, pinnedSet, pinnedTaskIds, sortMode]);

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
      void (async () => {
        try {
          if (isAddTask || isWhatsAppMessage) {
            const { tasks: extractedTasks, error } = await extractTasksFromMessageAI({
              message: originalMsg,
              courses,
              todayISO,
              currentWeek: user.currentWeek,
            });

            if (extractedTasks.length === 0) {
              setMessages((prev) => [
                ...prev,
                { role: 'ai', text: error ? error.message : T('reOptimizedMsg') },
              ]);
              return;
            }

            for (const task of extractedTasks) {
              addTask(
                buildTaskFromExtraction(task, {
                  fallbackCourseId: courses[0]?.id || 'General',
                  user,
                  sourceMessage: originalMsg,
                })
              );
            }

            const summary = extractedTasks
              .map((task) => `${task.title}\nDue: ${task.due_date} ${task.due_time}\nCourse: ${task.course_id}`)
              .join('\n\n');

            setMessages((prev) => [
              ...prev,
              { role: 'ai', text: `${T('taskExtracted')}\n\n${summary}\n\n${T('addedToPlanner')}` },
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              { role: 'ai', text: T('reOptimizedMsg') },
            ]);
          }
        } catch {
          setMessages((prev) => [
            ...prev,
            { role: 'ai', text: T('reOptimizedMsg') },
          ]);
        } finally {
          setIsProcessing(false);
        }
      })();
    }, 1500);
  };

  const activeDateDay = new Date(activeDate + 'T12:00:00').getDate();
  const activeMonthName = new Date(activeDate + 'T12:00:00').toLocaleString('en', { month: 'short' }).toUpperCase();

  const renderListHeader = () => (
    <>
      {/* AI Strategist trigger */}
      <View style={s.aiTriggerRow}>
        <Pressable
          style={({ pressed }) => [s.aiTriggerBtn, pressed && s.pressed]}
          onPress={() => setShowAiCard((prev) => !prev)}
        >
          <Feather name="zap" size={16} color={COLORS.navy} />
          <Text style={s.aiTriggerText}>{T('aiAcademicStrategist')}</Text>
        </Pressable>
      </View>

      {/* AI Strategist Card */}
      {showAiCard && (
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

  // Generate hourly time slots from 8 AM to 11 PM
  const HOUR_SLOTS = useMemo(() => {
    const slots: { hour: number; label: string }[] = [];
    for (let h = 0; h <= 23; h++) {
      const ampm = h < 12 ? 'AM' : 'PM';
      const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
      slots.push({ hour: h, label: `${String(display).padStart(2, '0')}:00 ${ampm}` });
    }
    return slots;
  }, []);

  // Get current time for indicator
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentAmPm = currentHour < 12 ? 'AM' : 'PM';
  const currentDisplay = currentHour === 0 ? 12 : currentHour > 12 ? currentHour - 12 : currentHour;
  const currentTimeLabel = `${String(currentDisplay).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')} ${currentAmPm}`;

  // Group items by hour
  const itemsByHour = useMemo(() => {
    const map: Record<number, PlannerItem[]> = {};
    for (const item of displayList) {
      const timeStr = item.itemType === 'task' ? item.dueTime : item.time;
      const hour = parseInt((timeStr || '00').split(':')[0], 10);
      if (!map[hour]) map[hour] = [];
      map[hour].push(item);
    }
    return map;
  }, [displayList]);

  // Find the earliest hour that has items for the current day
  const earliestHourWithItems = useMemo(() => {
    for (let slotIdx = 0; slotIdx < HOUR_SLOTS.length; slotIdx++) {
      const slot = HOUR_SLOTS[slotIdx];
      if (itemsByHour[slot.hour] && itemsByHour[slot.hour].length > 0) {
        return slotIdx;
      }
    }
    return -1; // No items
  }, [itemsByHour]);

  // Auto-scroll to the earliest active hour when the active date changes
  useEffect(() => {
    if (earliestHourWithItems >= 0 && scrollRef.current) {
      // 85px is the approximate height of an empty hour block
      const offset = earliestHourWithItems * 85; 
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, offset - 20), animated: true });
      }, 50);
    } else if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 50);
    }
  }, [activeDate, earliestHourWithItems]);

  const getCardTitle = (item: PlannerItem) => {
    if (item.itemType === 'study') {
      return `${item.subjectId || T('study')}: ${T('timeToStudy')}${item.topic ? ` - ${item.topic}` : ''}`;
    }
    return item.title;
  };

  const getCardTimeRange = (item: PlannerItem) => {
    if (item.itemType === 'study') {
      const start = (item.time || '').slice(0, 5);
      const [hh, mm] = (item.time || '00:00').split(':').map(Number);
      const endMin = (hh * 60 + mm + item.durationMinutes);
      const endH = Math.floor(endMin / 60) % 24;
      const endM = endMin % 60;
      return `${start}–${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    }
    return (item.dueTime || '').slice(0, 5);
  };

  const getCardSubject = (item: PlannerItem) => {
    return item.itemType === 'task' ? item.courseId : item.subjectId;
  };

  const handleItemPress = (item: PlannerItem) => {
    if (item.itemType === 'task') {
      router.push({ pathname: '/task-details' as any, params: { id: item.id } });
    }
  };

  const handleItemAction = (item: PlannerItem) => {
    if (item.itemType === 'study') {
      if (item.isDone) {
        Alert.alert(T('markAsNotDone'), T('markStudyNotDone'), [
          { text: T('cancel'), style: 'cancel' },
          { text: T('undo'), onPress: () => unmarkStudyDone(item.studyKey) },
        ]);
      } else {
        Alert.alert(T('markAsDoneQuestion'), T('markStudyDone'), [
          { text: T('cancel'), style: 'cancel' },
          { text: T('markDone'), onPress: () => markStudyDone(item.studyKey) },
        ]);
      }
    } else {
      if (item.isDone) {
        Alert.alert(T('markAsNotDone'), `"${item.title}" ${T('markAsIncomplete')}`, [
          { text: T('cancel'), style: 'cancel' },
          { text: T('undo'), onPress: () => toggleTaskDone(item.id) },
        ]);
      } else {
        Alert.alert(T('markAsDoneQuestion'), `"${item.title}" ${T('markAsCompleted')}`, [
          { text: T('cancel'), style: 'cancel' },
          { text: T('markDone'), onPress: () => toggleTaskDone(item.id) },
        ]);
      }
    }
  };

  // Render a single event card
  const renderEventCard = (item: PlannerItem, idx: number) => {
    const title = getCardTitle(item);
    const timeRange = getCardTimeRange(item);
    const subject = getCardSubject(item);
    const subjectColor = getSubjectColor(subject);
    const daysUntil = item.itemType === 'task' ? getDaysUntilDue(item.dueDate) : 99;
    const isOverdue = item.itemType === 'task' && daysUntil < 0;
    const isDueSoon = item.itemType === 'task' && !isOverdue && daysUntil <= 3;
    const isPinnedTask = item.itemType === 'task' && pinnedSet.has(item.id);
    const isAllDayTimeline = view === 'all' || view === 'month';
    const timeText = item.itemType === 'study'
      ? `${isAllDayTimeline ? `${formatDisplayDate(item.date)} • ` : ''}${timeRange}`
      : `${isAllDayTimeline ? `${formatDisplayDate(item.dueDate)} • ` : ''}${timeRange}`;
    const statusLabel = item.isDone
      ? T('completed')
      : item.itemType === 'study'
        ? T('study')
        : isOverdue
          ? T('overdue')
          : daysUntil === 0
            ? T('dueToday')
            : daysUntil === 1
              ? T('tomorrow')
              : `${daysUntil} ${T('daysLeft')}`;
    const secondaryLabel = item.itemType === 'study'
      ? (item.topic ? `${item.durationMinutes} min • ${item.topic}` : `${item.durationMinutes} min`)
      : `${item.type} • ${item.priority}`;
    const statusTextStyle = item.isDone
      ? s.taskInlineStatusDone
      : item.itemType === 'study'
        ? s.taskInlineStatusStudy
        : isOverdue
          ? s.taskInlineStatusOverdue
          : isDueSoon
            ? s.taskInlineStatusSoon
            : s.taskInlineStatusNeutral;
    const showInlineStatus = !(item.itemType === 'task' && daysUntil === 0 && !item.isDone);
    const borderColor = item.isDone
      ? '#dbe4ef'
      : isOverdue
        ? 'rgba(220,38,38,0.22)'
      : isDueSoon
        ? 'rgba(245,158,11,0.22)'
        : BORDER;
    return (
      <View key={`card-${idx}`} style={s.taskCardShell}>
        <Pressable
          onPress={(e) => { e.stopPropagation(); handleItemAction(item); }}
          style={[s.taskActionOutside, item.isDone && s.taskActionOutsideDone]}
        >
          <Feather name={item.isDone ? 'check' : 'circle'} size={16} color={item.isDone ? '#15803d' : NAVY} />
        </Pressable>
        <Pressable
          style={[
            s.taskCard,
            { borderColor },
            item.itemType === 'study' && s.taskCardStudy,
            item.isDone && s.taskCardDone,
          ]}
          onPress={() => handleItemPress(item)}
        >
          <View style={s.taskContent}>
            <View style={s.taskChipRow}>
              <View style={s.taskChipGroup}>
                <View
                  style={[
                    s.taskSubjectPill,
                    {
                      backgroundColor: hexToRgba(subjectColor, 0.12),
                      borderColor: hexToRgba(subjectColor, 0.2),
                    },
                  ]}
                >
                  <View style={[s.taskSubjectDot, { backgroundColor: subjectColor }]} />
                  <Text style={[s.taskSubjectText, { color: subjectColor }]}>{subject}</Text>
                </View>
                {isPinnedTask ? (
                  <View style={s.taskPinBadge}>
                    <Feather name="bookmark" size={11} color={NAVY} />
                  </View>
                ) : null}
              </View>
            </View>

            <View style={s.taskMainRow}>
              <Text style={[s.taskTitle, item.isDone && s.taskTitleDone]} numberOfLines={2}>
                {title}
              </Text>
            </View>

            <View style={s.taskFooterRow}>
              <View style={s.taskMetaRow}>
                <Feather name="clock" size={12} color={isOverdue ? '#dc2626' : '#475569'} />
                <Text style={[s.taskMetaText, (isOverdue || isDueSoon) && s.taskMetaUrgent]}>
                  {timeText}
                </Text>
              </View>
              {showInlineStatus ? (
                <>
                  <Text style={s.taskMetaDivider}>•</Text>
                  <Text style={[s.taskInlineStatusText, statusTextStyle]} numberOfLines={1}>
                    {statusLabel}
                  </Text>
                </>
              ) : null}
              <Text style={s.taskMetaDivider}>•</Text>
              <Text style={s.taskSecondaryMeta} numberOfLines={1}>
                {secondaryLabel}
              </Text>
            </View>
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTopRow}>
          <Pressable style={s.headerBtn} onPress={() => router.back()}>
            <Feather name="chevron-left" size={24} color={TEXT_PRIMARY} />
          </Pressable>
          <Text style={s.headerTitle}>{T('academicPlanner')}</Text>
          <Pressable style={s.headerBtn}>
            <Feather name="more-horizontal" size={24} color={TEXT_PRIMARY} />
          </Pressable>
        </View>

        <View style={s.calendarPanel}>
          <View style={s.monthNavRow}>
            <Pressable style={s.monthNavBtn} onPress={goToPrevMonth} hitSlop={12}>
              <Feather name="chevron-left" size={18} color={TEXT_SECONDARY} />
            </Pressable>
            <View pointerEvents="none" style={s.monthNavTitleWrap}>
              <Text style={s.monthNavTitle}>{getMonthYearLabel(activeDate)}</Text>
            </View>
            <View style={s.monthNavActions}>
              {activeDate !== todayISO ? (
                <Pressable style={s.monthTodayBtn} onPress={goToToday} hitSlop={10}>
                  <Feather name="calendar" size={13} color={NAVY} />
                  <Text style={s.monthTodayText}>{T('today')}</Text>
                </Pressable>
              ) : null}
              <Pressable style={s.monthNavBtn} onPress={goToNextMonth} hitSlop={12}>
                <Feather name="chevron-right" size={18} color={TEXT_SECONDARY} />
              </Pressable>
            </View>
          </View>

          {/* Horizontal Calendar Strip — all days in month */}
          <View style={s.weekStrip} onLayout={handleCalendarStripLayout}>
            <View pointerEvents="none" style={s.weekCenterHighlight} />
            <ScrollView 
              ref={calendarStripRef}
              horizontal 
              decelerationRate={0.985}
              snapToOffsets={calendarSnapOffsets}
              snapToAlignment="center"
              disableIntervalMomentum
              onScrollBeginDrag={() => setIsCalendarDragging(true)}
              onMomentumScrollEnd={handleCalendarMomentumEnd}
              onScrollEndDrag={handleCalendarDragEnd}
              showsHorizontalScrollIndicator={false} 
              contentContainerStyle={[s.weekStripContent, { paddingHorizontal: calendarStripSideInset }]}
            >
              {monthDays.map((day) => {
                const isPreviewActive = !isCalendarDragging && calendarPreviewDate === day.dateISO;

                return (
                  <Pressable 
                    key={day.dateISO} 
                    style={s.weekDaySlot}
                    onPress={() => {
                      setIsCalendarDragging(false);
                      setCalendarPreviewDate(day.dateISO);
                      setActiveDate(day.dateISO);
                    }}
                  >
                    <View style={[s.weekDay, isPreviewActive ? s.weekDayActive : s.weekDayInactive]}>
                      <Text style={[s.weekDate, isPreviewActive ? s.weekDateActive : s.weekDateInactive]}>
                        {day.dayNum}
                      </Text>
                      <Text style={[s.weekLabel, isPreviewActive ? s.weekLabelActive : s.weekLabelInactive]}>
                        {day.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </View>

      {/* Timeline with hourly slots */}
      <ScrollView 
        ref={scrollRef}
        style={s.timelineListWrap} 
        contentContainerStyle={s.listContent} 
        showsVerticalScrollIndicator={false}
      >
        {HOUR_SLOTS.map((slot, slotIdx) => {
          const items = itemsByHour[slot.hour] || [];
          const isCurrentHour = activeDate === todayISO && slot.hour === currentHour;
          const isNextHour = activeDate === todayISO && slot.hour === currentHour + 1;

          return (
            <View key={slot.hour}>
              {/* Hour row */}
              <View style={s.hourRow}>
                <View style={s.timeColumn}>
                  <Text style={s.timeLabel}>{slot.label}</Text>
                </View>
                <View style={s.hourDivider} />
              </View>

              {/* Current-time indicator (positioned between the previous hour label and before events) */}
              {isCurrentHour && (
                <View style={s.currentTimeRow}>
                  <View style={s.currentTimePill}>
                    <Text style={s.currentTimePillText}>{currentTimeLabel}</Text>
                  </View>
                  <View style={s.currentTimeLine} />
                </View>
              )}

              {/* Event cards for this hour */}
              {items.length > 0 && (
                <View style={s.hourCardsWrap}>
                  <View style={s.timeColumn} />
                  <View style={s.timelineContent}>
                    {items.map((item, idx) => renderEventCard(item, slotIdx * 100 + idx))}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const NAVY = '#003366';
const GOLD = '#f59e0b';
const BG = '#f8fafc';
const BORDER = '#e2e8f0';
const TEXT_PRIMARY = '#1A1C1E';
const TEXT_SECONDARY = '#8E9AAF';

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG, paddingTop: 56 },
  pressed: { opacity: 0.7 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  headerTitle: { fontSize: 19, fontWeight: '800', color: TEXT_PRIMARY, letterSpacing: -0.4 },

  calendarPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingTop: 6,
    paddingBottom: 6,
    borderWidth: 1,
    borderColor: '#eef2f7',
    shadowColor: '#0f172a',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },

  // Month Navigator
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 6,
    minHeight: 32,
    position: 'relative',
  },
  monthNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  monthNavTitleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavTitle: { fontSize: 17, fontWeight: '800', color: TEXT_PRIMARY, textAlign: 'center', letterSpacing: -0.35 },
  monthNavActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  monthTodayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(12,74,110,0.08)',
  },
  monthTodayText: {
    fontSize: 11,
    fontWeight: '800',
    color: NAVY,
    letterSpacing: 0.2,
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

  // Timeline (day view)
  timelineListWrap: {
    flex: 1,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    left: 78,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#e2e8f0',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center', // Changed to center vertically with time
    marginBottom: 16,
  },
  timeColumn: {
    width: 80,
    alignItems: 'flex-start',
    paddingLeft: 20,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b', // Slate 500
  },
  timelineContent: {
    flex: 1,
    paddingRight: 20,
    paddingLeft: 12,
  },

  // Hourly timeline slots
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
  },
  hourDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  hourCardsWrap: {
    flexDirection: 'row',
    paddingBottom: 8,
  },

  // Current time indicator
  currentTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    paddingLeft: 4,
  },
  currentTimePill: {
    backgroundColor: NAVY,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 8,
  },
  currentTimePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },
  currentTimeLine: {
    flex: 1,
    height: 2,
    backgroundColor: NAVY,
    borderRadius: 1,
  },

  // AI Card
  aiTriggerRow: {
    marginBottom: 8,
    alignItems: 'flex-end',
  },
  aiTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(12,74,110,0.06)',
  },
  aiTriggerText: {
    fontSize: 11,
    fontWeight: '700',
    color: NAVY,
  },
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

  // Horizontal Calendar Strip
  weekStrip: {
    flexDirection: 'row',
    position: 'relative',
    minHeight: 86,
    justifyContent: 'center',
  },
  weekStripContent: {
    paddingBottom: 2,
  },
  weekCenterHighlight: {
    position: 'absolute',
    left: '50%',
    top: 2,
    width: 56,
    height: 74,
    marginLeft: -28,
    borderRadius: 22,
    backgroundColor: NAVY,
    shadowColor: NAVY,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDaySlot: {
    width: CALENDAR_STRIP_SLOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDay: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 74,
    borderRadius: 22,
    backgroundColor: 'transparent',
  },
  weekDayActive: {
    transform: [{ scale: 1.02 }],
  },
  weekDayInactive: {
    transform: [{ scale: 0.9 }],
    opacity: 0.92,
  },
  weekDayToday: { borderWidth: 1.5, borderColor: '#d6e3f3', backgroundColor: 'rgba(248, 251, 255, 0.75)' },
  weekDate: { fontSize: 16, fontWeight: '800', color: TEXT_PRIMARY, marginBottom: 3, letterSpacing: -0.2 },
  weekDateActive: { color: '#ffffff', fontSize: 18 },
  weekDateInactive: { color: '#526277', opacity: 0.62 },
  weekLabel: { fontSize: 10, fontWeight: '700', color: TEXT_SECONDARY },
  weekLabelActive: { color: '#ffffff', opacity: 0.9 },
  weekLabelInactive: { color: '#b6c0cf', opacity: 0.74 },

  // Month Grid
  monthCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 20,
  },
  // Universal Day Strip
  dayStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  dayCell: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 60,
    borderRadius: 16,
  },
  dayCellActive: { backgroundColor: NAVY },
  dayLabel: { fontSize: 11, fontWeight: '600', color: TEXT_SECONDARY, marginBottom: 2 },
  dayLabelActive: { color: '#ffffff' },
  dayDate: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  dayDateActive: { color: '#ffffff' },
  dayDot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
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
  taskCardShell: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '86%',
    maxWidth: 380,
    alignSelf: 'center',
    position: 'relative',
    backgroundColor: '#ffffff',
    borderWidth: 1,
  },
  taskCardStudy: { backgroundColor: '#f8fbff' },
  taskCardDone: { backgroundColor: '#f8fafc' },
  taskContent: { flex: 1 },
  taskChipRow: { marginBottom: 8 },
  taskChipGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
  taskSubjectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  taskSubjectDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  taskSubjectText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  taskPinBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,51,102,0.06)',
  },
  taskActionOutside: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#d7dee8',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    left: -6,
    top: '50%',
    transform: [{ translateY: -17 }],
    zIndex: 2,
  },
  taskActionOutsideDone: {
    backgroundColor: '#ecfdf5',
    borderColor: '#bbf7d0',
  },
  taskMainRow: { marginBottom: 6 },
  taskTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', lineHeight: 20, flex: 1 },
  taskTitleDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taskMetaText: { fontSize: 12, fontWeight: '500', color: '#475569' },
  taskMetaUrgent: { fontWeight: '700', color: '#dc2626' },
  taskFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'nowrap' },
  taskMetaDivider: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },
  taskInlineStatusText: { fontSize: 11, fontWeight: '700' },
  taskInlineStatusNeutral: { color: NAVY },
  taskInlineStatusSoon: { color: '#c2410c' },
  taskInlineStatusOverdue: { color: '#b91c1c' },
  taskInlineStatusStudy: { color: '#0f766e' },
  taskInlineStatusDone: { color: '#15803d' },
  taskSecondaryMeta: { flex: 1, fontSize: 11, fontWeight: '600', color: '#64748b' },

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
