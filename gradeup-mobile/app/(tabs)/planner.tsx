import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Modal, TextInput, ScrollView, Alert, Dimensions, LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent, ActivityIndicator, Switch } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { COLORS, Icons } from '@/src/constants';
import { TaskType } from '@/src/types';
import Feather from '@expo/vector-icons/Feather';
import {
  formatDisplayDate,
  getTodayISO,
  getWeekDatesFor,
  getMonthYearLabel,
  getWeekNumber,
  getMonthGrid,
  toISO,
  getWeekDatesSundayFirst,
  isTaskPastDueNow,
} from '@/src/utils/date';
import { useTranslations } from '@/src/i18n';
import { extractTasksFromMessage as extractTasksFromMessageAI } from '@/src/lib/taskExtraction';
import { buildTaskFromExtraction } from '@/src/lib/taskUtils';
import { resolveDisplayTeachingWeeks, teachingWeekNumberForDate } from '@/src/lib/academicWeek';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/Avatar'; // Trigger reload
import { themePrefersLightOutline, type ThemePalette } from '@/constants/Themes';
import { useTabBarAddMenu } from '@/contexts/TabBarContext';

const WEEKDAY_TO_NUM: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

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

/** Normalize profile names (e.g. ALL CAPS) for readable list labels. */
function formatPersonDisplayName(raw: string): string {
  const t = raw.trim();
  if (!t) return raw;
  return t
    .split(/\s+/)
    .map((w) => (w.length <= 1 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

type PlannerTaskItem = {
  itemType: 'task';
  id: string;
  sharedBy?: string;
  isSharedTask?: boolean;
  /** Row id in shared_tasks — remove link for current user only, not the underlying task */
  sharedTaskId?: string;
  needsDate?: boolean;
} & import('@/src/types').Task;
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

type ViewMode = 'day' | 'week' | 'month' | 'all';
type FilterType = 'all' | 'assignment' | 'quiz' | 'project' | 'lab' | 'test';
const CALENDAR_STRIP_SLOT = 64;

export default function Planner() {
  const scrollRef = useRef<ScrollView>(null);
  const weekGridScrollRef = useRef<ScrollView>(null);
  const theme = useTheme();
  const s = useMemo(() => createPlannerStyles(theme), [theme]);
  const headerOutline = useMemo(
    () => (themePrefersLightOutline(theme) ? 'rgba(255,255,255,0.58)' : '#d7dee8'),
    [theme],
  );

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
    lastPlannerView,
    setLastPlannerView,
    user,
    language,
    academicCalendar,
  } = useApp();
  const {
    acceptedSharedTasks, toggleSharedCompletion, removeSharedTaskLink, userId: communityUserId,
    friendsWithStatus: communityFriends, circles: communityCircles,
    shareAllTasksWithFriend, shareAllTasksWithCircle,
    shareStreams, toggleShareStream, toggleCircleShareStream,
  } = useCommunity();
  const T = useTranslations(language);
  const openAddMenu = useTabBarAddMenu();
  const [view, setView] = useState<ViewMode>(lastPlannerView);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [monthExpanded, setMonthExpanded] = useState(false);
  const [monthCollapsed, setMonthCollapsed] = useState(false);
  const [activeDate, setActiveDate] = useState<string>(() => getTodayISO());
  const [calendarPreviewDate, setCalendarPreviewDate] = useState<string>(() => getTodayISO());
  const [isCalendarDragging, setIsCalendarDragging] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [sortMode, setSortMode] = useState<'nearest' | 'subject'>('nearest');
  const [messages, setMessages] = useState<{ role: 'ai' | 'user'; text: string }[]>([
    { role: 'ai', text: '' },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAiCard, setShowAiCard] = useState(false);
  const [calendarStripWidth, setCalendarStripWidth] = useState(0);
  const [showShareAllModal, setShowShareAllModal] = useState(false);
  const [shareAllTab, setShareAllTab] = useState<'friend' | 'circle'>('friend');
  const [shareAllFriendId, setShareAllFriendId] = useState<string | null>(null);
  const [shareAllCircleId, setShareAllCircleId] = useState<string | null>(null);
  const [isShareAllSending, setIsShareAllSending] = useState(false);
  const activeDateRef = useRef(activeDate);
  const calendarPreviewDateRef = useRef(calendarPreviewDate);
  const skipCalendarRecenteringRef = useRef(false);

  const todayISO = getTodayISO();
  const activeYear = useMemo(() => new Date(activeDate + 'T12:00:00').getFullYear(), [activeDate]);
  const activeMonth = useMemo(() => new Date(activeDate + 'T12:00:00').getMonth(), [activeDate]);
  const totalWeeks = useMemo(
    () => resolveDisplayTeachingWeeks(academicCalendar, user.startDate, tasks),
    [academicCalendar, user.startDate, tasks],
  );
  const stripCalendar = useMemo(
    () => (academicCalendar ? { ...academicCalendar, totalWeeks } : null),
    [academicCalendar, totalWeeks],
  );
  const getWeekNumberForDate = useCallback(
    (dateISO: string): number =>
      teachingWeekNumberForDate(dateISO, stripCalendar, user.startDate, totalWeeks, user.currentWeek ?? 1),
    [stripCalendar, user.startDate, user.currentWeek, totalWeeks],
  );
  const activeWeekNumber = useMemo(() => getWeekNumberForDate(activeDate), [activeDate, getWeekNumberForDate]);
  const activeDateIsBreak = useMemo(() => {
    const iso = (activeDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const periods = academicCalendar?.periods;
    if (!periods || !Array.isArray(periods) || periods.length === 0) return Boolean(user.isBreak);
    for (const p of periods) {
      const type = String((p as any)?.type ?? '');
      if (type !== 'break' && type !== 'special_break') continue;
      const start = String((p as any)?.startDate ?? '').slice(0, 10);
      const end = String((p as any)?.endDate ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
      if (iso >= start && iso <= end) return true;
    }
    return Boolean(user.isBreak);
  }, [activeDate, academicCalendar?.periods, user.isBreak]);
  const activeDateIsInAcademicCalendar = useMemo(() => {
    const iso = (activeDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const periods = academicCalendar?.periods;
    if (!periods || !Array.isArray(periods) || periods.length === 0) {
      // Fallback: if we don't have periods, assume we're "in calendar" during teaching/break screens.
      return user.semesterPhase !== 'no_calendar';
    }
    // Consider a date "in calendar" if it's covered by any known period (including break).
    for (const p of periods) {
      const start = String((p as any)?.startDate ?? '').slice(0, 10);
      const end = String((p as any)?.endDate ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
      if (iso >= start && iso <= end) return true;
    }
    return false;
  }, [activeDate, academicCalendar?.periods, user.semesterPhase]);
  const activeWeekLabel = useMemo(() => {
    if (!activeDateIsInAcademicCalendar) return '-';
    if (activeDateIsBreak) return '-';
    if (user.semesterPhase === 'break_after') return '-';
    return String(activeWeekNumber);
  }, [activeDateIsInAcademicCalendar, activeDateIsBreak, user.semesterPhase, activeWeekNumber]);
  const totalWeeksLabel = useMemo(() => (activeDateIsInAcademicCalendar ? String(totalWeeks) : '-'), [activeDateIsInAcademicCalendar, totalWeeks]);

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

  const weekDays = useMemo(() => getWeekDatesSundayFirst(activeDate), [activeDate]);

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

  // Count total items (tasks + study sessions) on a given date
  const getItemCountOnDay = (dateISO: string) => {
    const taskCount = tasks.filter((t) => t.dueDate === dateISO).length;
    const studyCount = studyItemsForPlanner.filter((s) => s.date === dateISO).length;
    return taskCount + studyCount;
  };

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
    if (view === 'all' || view === 'month' || view === 'week') {
      list = [...tasks];
    } else {
      // Day view: show tasks for the selected date only
      list = tasks.filter((t) => t.dueDate === activeDate);
    }
    if (activeFilter !== 'all') {
      const typeMap: Record<string, string> = {
        assignment: TaskType.Assignment,
        quiz: TaskType.Quiz,
        project: TaskType.Project,
        lab: TaskType.Lab,
        test: TaskType.Test,
      };
      const targetType = typeMap[activeFilter];
      if (targetType) {
        list = list.filter((t) => t.type === targetType);
      }
    }
    return list;
  }, [tasks, activeDate, view, activeYear, activeMonth, activeFilter]);

  const filteredStudyItems = useMemo((): PlannerStudyItem[] => {
    if (view === 'all' || view === 'month' || view === 'week') {
      return studyItemsForPlanner;
    }
    // Day view: show study sessions for the selected date only
    return studyItemsForPlanner.filter((item) => item.date === activeDate);
  }, [studyItemsForPlanner, activeDate, view]);

  const sharedTaskItems = useMemo((): PlannerTaskItem[] => {
    const ownTaskIds = new Set(tasks.map(t => t.id));
    let items = acceptedSharedTasks
      .filter(st => st.recipient_id === communityUserId && st.task && !ownTaskIds.has(st.task_id))
      .map(st => ({
        ...st.task!,
        itemType: 'task' as const,
        id: st.task_id,
        isDone: st.recipient_completed,
        isSharedTask: true,
        sharedTaskId: st.id,
        sharedBy: st.owner_profile?.name || 'Friend',
        sharedByAvatar: st.owner_profile?.avatar_url,
      }));
    // In day view, apply the same date restriction as own tasks:
    // show shared task only if its dueDate matches the selected date.
    // Tasks with no dueDate (empty string) are treated as today.
    if (view === 'day') {
      items = items.filter(item => {
        const eff = item.dueDate || getTodayISO();
        return eff === activeDate;
      });
    }
    return items;
  }, [acceptedSharedTasks, communityUserId, tasks, view, activeDate]);

  const combinedList = useMemo((): PlannerItem[] => {
    const taskItems: PlannerItem[] = filteredTasks.map((t) => ({ ...t, itemType: 'task' as const }));
    const studyItems: PlannerItem[] = filteredStudyItems;
    const all: PlannerItem[] = [...taskItems, ...studyItems, ...sharedTaskItems];
    all.sort((a, b) => {
      const dateA = (a.itemType === 'task' ? a.dueDate : a.date) ?? '';
      const dateB = (b.itemType === 'task' ? b.dueDate : b.date) ?? '';
      const timeA = (a.itemType === 'task' ? a.dueTime : a.time) ?? '';
      const timeB = (b.itemType === 'task' ? b.dueTime : b.time) ?? '';
      const d = dateA.localeCompare(dateB);
      return d !== 0 ? d : timeA.localeCompare(timeB);
    });
    return all;
  }, [filteredTasks, filteredStudyItems, sharedTaskItems]);

  const pinnedSet = useMemo(() => new Set(pinnedTaskIds), [pinnedTaskIds]);
  const displayList = useMemo((): PlannerItem[] => {
    // In "all" view, keep strict date grouping: no pinning, just combined sorted list.
    if (view === 'all') {
      return combinedList;
    }
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

  /** Week grid: scroll to first hour that has items (tasks default to 23:59 and sit at the bottom). */
  useEffect(() => {
    if (view !== 'week') return;
    const weekISOs = new Set(weekDays.map((d) => d.dateISO));
    let minHour = 24;
    for (const item of displayList) {
      const dateStr = item.itemType === 'task' ? item.dueDate : item.date;
      if (!weekISOs.has(dateStr)) continue;
      const timeStr = item.itemType === 'task' ? item.dueTime : item.time;
      const raw = ((timeStr ?? '') as string).trim() || '12:00';
      const h = parseInt(raw.split(':')[0], 10);
      if (!Number.isFinite(h)) continue;
      if (h < minHour) minHour = h;
    }
    if (minHour >= 24) return;
    const hourHeight = 100;
    const y = Math.max(0, minHour * hourHeight - 48);
    const id = setTimeout(() => {
      weekGridScrollRef.current?.scrollTo({ y, animated: true });
    }, 150);
    return () => clearTimeout(id);
  }, [view, activeDate, displayList, weekDays]);

  const listCount = displayList.length;
  const pendingShareCount = useMemo(() => tasks.filter((t) => !t.isDone).length, [tasks]);
  const shareAllRecipientId = shareAllTab === 'friend' ? shareAllFriendId : shareAllCircleId;
  const shareAllAutoOn = useMemo(() => {
    if (shareAllTab === 'friend' && shareAllFriendId) {
      return shareStreams.find((st) => st.recipient_id === shareAllFriendId)?.enabled ?? false;
    }
    if (shareAllTab === 'circle' && shareAllCircleId) {
      return shareStreams.find((st) => st.circle_id === shareAllCircleId)?.enabled ?? false;
    }
    return false;
  }, [shareStreams, shareAllFriendId, shareAllCircleId, shareAllTab]);

  const handleShareAll = async () => {
    if (!communityUserId) {
      Alert.alert('', T('shareFailedNotSignedIn'));
      return;
    }
    const undoneTasks = tasks.filter(t => !t.isDone);
    if (undoneTasks.length === 0) {
      Alert.alert('', T('shareNoTasksToShare'));
      return;
    }
    const taskIds = undoneTasks.map(t => t.id);
    setIsShareAllSending(true);
    try {
      if (shareAllTab === 'friend' && shareAllFriendId) {
        const results = await shareAllTasksWithFriend(taskIds, shareAllFriendId, undefined);
        if (results.length > 0) {
          setShowShareAllModal(false);
          setShareAllFriendId(null);
          Alert.alert('', T('shareSuccessFriend'));
        } else {
          Alert.alert('', T('shareAlreadyShared'));
        }
      } else if (shareAllTab === 'circle' && shareAllCircleId) {
        const results = await shareAllTasksWithCircle(taskIds, shareAllCircleId, undefined);
        if (results.length > 0) {
          setShowShareAllModal(false);
          setShareAllCircleId(null);
          Alert.alert('', T('shareSuccessCircle'));
        } else {
          Alert.alert('', T('shareAlreadyShared'));
        }
      }
    } finally {
      setIsShareAllSending(false);
    }
  };

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
              userId: user.id,
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
                  calendarStart: academicCalendar?.startDate,
                  sourceMessage: originalMsg,
                })
              );
            }

            const missingDate = extractedTasks.filter((t) => t.needs_date);

            const summary = extractedTasks
              .map((task) => {
                const dateLabel = task.needs_date ? 'Date TBA — set manually' : `${task.due_date} ${task.due_time}`;
                return `${task.title}\nDue: ${dateLabel}\nCourse: ${task.course_id}`;
              })
              .join('\n\n');

            const warningNote = missingDate.length > 0
              ? `\n\n⚠️ ${missingDate.length === 1 ? '1 task has' : `${missingDate.length} tasks have`} no specific date in the message. Please open the task and set the due date manually.`
              : '';

            setMessages((prev) => [
              ...prev,
              { role: 'ai', text: `${T('taskExtracted')}\n\n${summary}${warningNote}\n\n${T('addedToPlanner')}` },
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
          <Feather name="zap" size={16} color={theme.text} />
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
              { key: 'test' as FilterType, label: T('test') },
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
    // Only auto-scroll in week/month timeline views, not in "all" view
    if (view === 'all') return;
    const HOUR_ROW_HEIGHT = 40; // conservative value to avoid overscrolling past first item
    if (earliestHourWithItems >= 0 && scrollRef.current) {
      // Scroll near (but not past) the earliest hour that has any items.
      const offset = Math.max(0, earliestHourWithItems * HOUR_ROW_HEIGHT);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: offset, animated: true });
      }, 100);
    } else if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 100);
    }
  }, [activeDate, earliestHourWithItems, view]);

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
    if (item.itemType !== 'task') return item.subjectId;
    if (item.courseId?.startsWith('gc-course-')) {
      const found = courses.find(c => c.id === item.courseId);
      return found ? `gc-${found.name}` : item.courseId;
    }
    return item.courseId;
  };

  const handleItemPress = (item: PlannerItem) => {
    if (item.itemType === 'task') {
      router.push({ pathname: '/task-details' as any, params: { id: item.id } });
    } else if (item.itemType === 'study') {
      router.push({ pathname: '/study-details' as any, params: { studyKey: item.studyKey } });
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
      const pt = item as PlannerTaskItem;
      if (pt.isSharedTask && pt.sharedTaskId) {
        if (item.isDone) {
          Alert.alert(T('markAsNotDone'), `"${item.title}" ${T('markAsIncomplete')}`, [
            { text: T('cancel'), style: 'cancel' },
            { text: T('undo'), onPress: () => toggleSharedCompletion(pt.sharedTaskId!, false) },
          ]);
        } else {
          Alert.alert(T('markAsDoneQuestion'), `"${item.title}" ${T('markAsCompleted')}`, [
            { text: T('cancel'), style: 'cancel' },
            { text: T('markDone'), onPress: () => toggleSharedCompletion(pt.sharedTaskId!, true) },
          ]);
        }
        return;
      }
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

  const handleItemMenu = (item: PlannerItem) => {
    if (item.itemType === 'task') {
      const pt = item as PlannerTaskItem;
      if (pt.isSharedTask && pt.sharedTaskId) {
        Alert.alert(
          'Remove shared task',
          `Remove "${item.title}" from your planner only?\n\nThis does not delete the task for the person who shared it.`,
          [
            { text: T('cancel'), style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: () => {
                Alert.alert(
                  'Confirm',
                  'Remove this shared task from your account? You can ask your friend to share it again if needed.',
                  [
                    { text: T('cancel'), style: 'cancel' },
                    {
                      text: 'Yes, remove',
                      style: 'destructive',
                      onPress: () => removeSharedTaskLink(pt.sharedTaskId!),
                    },
                  ]
                );
              },
            },
          ]
        );
        return;
      }
      Alert.alert(
        T('deleteTask'),
        `"${item.title}" ${T('deleteTaskDesc')}`,
        [
          { text: T('cancel'), style: 'cancel' },
          {
            text: T('delete'),
            style: 'destructive',
            onPress: () => deleteTask(item.id),
          },
        ]
      );
    } else if (item.revisionId) {
      Alert.alert(
        T('deleteTask'),
        `"${item.topic || T('timeToStudy')}" ${T('deleteTaskDesc')}`,
        [
          { text: T('cancel'), style: 'cancel' },
          {
            text: T('delete'),
            style: 'destructive',
            onPress: () => deleteStudySetting(item.revisionId!),
          },
        ]
      );
    }
  };

  // Render a single event card
  const renderEventCard = (item: PlannerItem, idx: number) => {
    const title = getCardTitle(item);
    const timeRange = getCardTimeRange(item);
    const subject = getCardSubject(item);
    const subjectColor = getSubjectColor(subject);
    const daysUntil = item.itemType === 'task' ? getDaysUntilDue(item.dueDate) : 99;
    const taskRow = item.itemType === 'task' ? (item as PlannerTaskItem) : null;
    const isOverdue =
      item.itemType === 'task' &&
      !item.isDone &&
      !!taskRow &&
      !taskRow.needsDate &&
      isTaskPastDueNow({ dueDate: taskRow.dueDate, dueTime: taskRow.dueTime ?? '23:59' });
    const isDueSoon = item.itemType === 'task' && !isOverdue && daysUntil <= 3;
    const isPinnedTask = item.itemType === 'task' && pinnedSet.has(item.id);
    // Only show the full date inline for the \"All\" view.
    // In Week/Month timeline views, keep this compact like the original design
    // (time + days-left + type) so text stays neat inside the card.
    const showDateInline = view === 'all';
    const isUndated = item.itemType === 'task' && (item as PlannerTaskItem).needsDate;
    const timeText = item.itemType === 'study'
      ? `${showDateInline ? `${formatDisplayDate(item.date)} • ` : ''}${timeRange}`
      : isUndated
        ? 'No due date'
        : `${showDateInline ? `${formatDisplayDate(item.dueDate)} • ` : ''}${timeRange}`;
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
      : `${item.type} • ${item.courseId}`;
    const statusTextStyle = item.isDone
      ? s.taskInlineStatusDone
      : item.itemType === 'study'
        ? s.taskInlineStatusStudy
        : // Countdown colour for tasks (today/overdue red, near yellow, far black)
          isOverdue || daysUntil < 0
          ? s.taskInlineStatusOverdue
          : daysUntil <= 3
            ? s.taskInlineStatusSoon
            : s.taskInlineStatusFar;
    const darkSurface = themePrefersLightOutline(theme);
    const borderColor = darkSurface
      ? item.isDone
        ? 'rgba(255,255,255,0.22)'
        : 'rgba(255,255,255,0.38)'
      : item.isDone
        ? '#dbe4ef'
        : isOverdue
          ? 'rgba(220,38,38,0.22)'
          : isDueSoon
            ? 'rgba(245,158,11,0.22)'
            : theme.border;
    return (
      <View key={`card-${idx}`} style={s.taskCardShell}>
        <Pressable
          onPress={(e) => { e.stopPropagation(); handleItemAction(item); }}
          style={[s.taskActionOutside, item.isDone && s.taskActionOutsideDone]}
        >
          <Feather name={item.isDone ? 'check' : 'circle'} size={16} color={item.isDone ? '#15803d' : theme.primary} />
        </Pressable>
        <Pressable
          style={[
            s.taskCard,
            { borderColor },
            item.itemType === 'study' && s.taskCardStudy,
            item.isDone && s.taskCardDone,
            item.itemType === 'task' && (item as PlannerTaskItem).isSharedTask && s.taskCardShared,
          ]}
          onPress={() => handleItemPress(item)}
        >
          <View style={s.taskContent}>
            <View style={s.taskCardHeader}>
              <View style={s.taskChipGroup}>
                <View
                  style={[
                    s.taskSubjectPill,
                    {
                      backgroundColor: theme.card,
                      borderColor: hexToRgba(subjectColor, 0.3),
                    },
                  ]}
                >
                  <View style={[s.taskSubjectDot, { backgroundColor: subjectColor }]} />
                  <Text
                    style={[
                      s.taskSubjectText,
                      {
                        color:
                          theme.id === 'dark' || theme.id === 'midnight' ? theme.text : subjectColor,
                      },
                    ]}
                  >
                    {subject}
                  </Text>
                </View>
                {isPinnedTask ? (
                  <View style={s.taskPinBadge}>
                    <Feather name="bookmark" size={11} color={theme.primary} />
                  </View>
                ) : null}
                {/* Shared-by strip is below; wide card uses horizontal space for the name */}
                {item.itemType === 'task' && !(item as PlannerTaskItem).isSharedTask && item.id.startsWith('gc-') ? (
                  <View style={s.classroomBadge}>
                    <Feather name="book-open" size={10} color="#0f9d58" />
                    <Text style={s.classroomBadgeText}>Classroom</Text>
                  </View>
                ) : null}
                {item.itemType === 'task' && (item as PlannerTaskItem).needsDate ? (
                  <View style={s.needsDateBadge}>
                    <Feather name="alert-circle" size={10} color="#d97706" />
                    <Text style={s.needsDateText}>Needs date</Text>
                  </View>
                ) : null}
              </View>
              <Pressable
                style={s.taskMenuBtn}
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation();
                  handleItemMenu(item);
                }}
              >
                <Feather name="more-vertical" size={16} color={theme.textSecondary} />
              </Pressable>
            </View>

            {item.itemType === 'study' ? (
              <>
                <View style={s.taskMainRow}>
                  <Text style={[s.taskTitle, item.isDone && s.taskTitleDone]} numberOfLines={2}>
                    {title}
                  </Text>
                </View>
                <View style={s.studyFooter}>
                  <View style={s.studyTimeRow}>
                    <Feather name="clock" size={12} color={theme.textSecondary} />
                    <Text style={s.studyTimeText} numberOfLines={1}>
                      {timeRange}
                    </Text>
                  </View>
                  <View style={s.studyDetailRow}>
                    <Text style={s.studyDurationText} numberOfLines={1}>
                      {item.durationMinutes} min
                    </Text>
                    <View style={s.taskDetailChip}>
                      <Text style={s.taskDetailChipText} numberOfLines={1}>
                        {T('study')}
                      </Text>
                    </View>
                  </View>
                </View>
              </>
            ) : (
              <>
                <View style={s.taskTitleRow}>
                  <Text style={[s.taskTitle, item.isDone && s.taskTitleDone]} numberOfLines={2}>
                    {title}
                  </Text>
                  <View style={s.taskTitleTime}>
                    <Feather name="clock" size={12} color={theme.textSecondary} />
                    <Text style={s.taskTitleTimeText} numberOfLines={1}>
                      {timeText}
                    </Text>
                  </View>
                </View>
                <View style={s.taskMetaFooterRow}>
                  <Text
                    style={[s.taskMetaPrimary, statusTextStyle]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {statusLabel}
                  </Text>
                  <View style={s.taskMetaFooterRight}>
                    <Text
                      style={s.taskMetaSecondaryLine}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {secondaryLabel}
                    </Text>
                    {(item as PlannerTaskItem).isSharedTask ? (
                      <Avatar
                        name={(item as PlannerTaskItem).sharedBy}
                        avatarUrl={(item as any).sharedByAvatar}
                        size={22}
                      />
                    ) : null}
                  </View>
                </View>
              </>
            )}
          </View>
        </Pressable>
      </View>
    );
  };

  // Render month grid — compact (default) or expanded (zoomed in)
  const renderMonthGrid = () => {
    const days = monthGridCells;
    const screenWidth = Dimensions.get('window').width;

    // Shared navigation header (expand/collapse lives here — avoids overlap with tab bar)
    const monthNav = (
      <View style={s.gridNavHeader}>
        <Pressable style={s.gridNavBtn} onPress={goToPrevMonth}>
          <Feather name="chevron-left" size={20} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', minWidth: 0, paddingHorizontal: 6 }}>
          <Text style={s.gridNavTitle} numberOfLines={1}>
            {getMonthYearLabel(activeDate)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable
            style={[s.gridNavBtn, monthExpanded && s.gridNavToggleActive]}
            onPress={() => setMonthExpanded((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={monthExpanded ? 'Compact month view' : 'Expanded month view with task text'}
            hitSlop={6}
          >
            <Feather name={monthExpanded ? 'minimize-2' : 'maximize-2'} size={18} color={theme.primary} />
          </Pressable>
          {activeDate !== todayISO && (
            <Pressable style={s.monthTodayBtn} onPress={goToToday} hitSlop={10}>
              <Feather name="calendar" size={13} color={theme.primary} />
              <Text style={s.monthTodayText}>{T('today')}</Text>
            </Pressable>
          )}
          <Pressable style={s.gridNavBtn} onPress={goToNextMonth}>
            <Feather name="chevron-right" size={20} color={theme.text} />
          </Pressable>
        </View>
      </View>
    );

    // ── EXPANDED MODE (zoomed in): task text visible inside cells ──
    if (monthExpanded) {
      const colWidth = 100;
      const cellHeight = 125;

      return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          {monthNav}

          <ScrollView showsVerticalScrollIndicator={false} style={{ backgroundColor: theme.background }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={{ width: colWidth * 7 }}>
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: theme.border }}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <View key={`day-${i}`} style={{ width: colWidth, alignItems: 'center', paddingVertical: 12 }}>
                      <Text style={s.monthGridHeaderText}>{d}</Text>
                    </View>
                  ))}
                </View>

                <View style={{ width: colWidth * 7 }}>
                  {(() => {
                    const weeks: (number | null)[][] = [];
                    for (let i = 0; i < days.length; i += 7) {
                      weeks.push(days.slice(i, i + 7));
                    }

                    return weeks.map((week, weekIdx) => (
                      <View key={`week-${weekIdx}`} style={{ flexDirection: 'row' }}>
                        {week.map((day, i) => {
                          if (day === null) {
                            return (
                              <View
                                key={`empty-${weekIdx}-${i}`}
                                style={[s.monthGridCellEmpty, { width: colWidth, minHeight: cellHeight }]}
                              />
                            );
                          }

                          const dateISO = toISO(activeYear, activeMonth, day);
                          const isActive = dateISO === activeDate;
                          const isToday = dateISO === todayISO;
                          const dayItems = displayList.filter(item => (item.itemType === 'task' ? item.dueDate : item.date) === dateISO);
                          const showItems = dayItems.slice(0, 6);

                          return (
                            <View
                              key={dateISO}
                              style={[
                                s.monthGridCell,
                                { width: colWidth, minHeight: cellHeight },
                                isActive && s.monthGridCellActive,
                              ]}
                            >
                              <Pressable
                                style={StyleSheet.absoluteFill}
                                onPress={() => setActiveDate(dateISO)}
                              />

                              <View style={s.monthGridCellHeader} pointerEvents="none">
                                <Text style={[
                                  s.monthGridCellText,
                                  isActive && s.monthGridCellTextActive,
                                  isToday && !isActive && { color: '#ffffff', backgroundColor: '#dc2626', width: 20, height: 20, borderRadius: 10, textAlign: 'center', lineHeight: 20, overflow: 'hidden' },
                                ]}>
                                  {day}
                                </Text>
                              </View>
                              <View style={[s.monthGridTagList, { zIndex: 10 }]} pointerEvents="box-none">
                                {(() => {
                                  const itemCount = dayItems.length;
                                  const hiddenCount = itemCount - 6;
                                  const dynamicFontSize = itemCount <= 2 ? 10 : itemCount <= 4 ? 9 : 8;
                                  const dynamicLines = itemCount <= 2 ? 3 : itemCount <= 4 ? 2 : 1;

                                  return (
                                    <>
                                      {showItems.map((item, idx) => {
                                        const subject = item.itemType === 'task' ? item.courseId : (item.subjectId || 'Study');
                                        const color = getSubjectColor(subject);
                                        const title = item.itemType === 'task' ? item.title : (item.topic || T('study'));
                                        const isDone = item.isDone;

                                        return (
                                          <Pressable
                                            key={`${dateISO}-${idx}`}
                                            onPress={(e) => {
                                              e.stopPropagation();
                                              handleItemPress(item);
                                            }}
                                            style={[
                                              s.monthGridItemBlock,
                                              {
                                                borderLeftColor: color,
                                                backgroundColor: hexToRgba(color, 0.08),
                                                zIndex: 20,
                                              },
                                            ]}
                                          >
                                            <View style={{ flex: 1 }}>
                                              <Text
                                                style={[
                                                  s.monthGridTagText,
                                                  { color: theme.text, fontSize: dynamicFontSize },
                                                ]}
                                                numberOfLines={dynamicLines}
                                              >
                                                {subject}: {title}
                                              </Text>
                                            </View>
                                            <View style={{
                                              width: 6,
                                              height: 6,
                                              borderRadius: 3,
                                              borderWidth: 0.5,
                                              borderColor: isActive ? '#ffffff' : color,
                                              backgroundColor: isDone ? (isActive ? '#ffffff' : color) : 'transparent',
                                            }} />
                                          </Pressable>
                                        );
                                      })}
                                      {hiddenCount > 0 && (
                                        <Text style={[s.monthGridMoreText, isActive && { color: 'rgba(255,255,255,0.7)' }]}>
                                          +{hiddenCount}
                                        </Text>
                                      )}
                                    </>
                                  );
                                })()}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ));
                  })()}
                </View>
              </View>
            </ScrollView>
          </ScrollView>
        </View>
      );
    }

    // ── COMPACT MODE (default): dots + detail panel below ──
    const cellWidth = Math.floor(screenWidth / 7);
    const cellHeight = 54;

    const selectedDayItems = displayList.filter(item =>
      (item.itemType === 'task' ? item.dueDate : item.date) === activeDate
    );
    const selectedDate = new Date(activeDate + 'T12:00:00');
    const dayName = selectedDate.toLocaleDateString('en', { weekday: 'long' });
    const monthNameStr = selectedDate.toLocaleDateString('en', { month: 'short' });
    const dayNumSelected = selectedDate.getDate();

    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {monthNav}

        {/* Weekday Headers */}
        <View style={{ flexDirection: 'row', paddingVertical: 10 }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
            <View key={`hdr-${i}`} style={{ width: cellWidth, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: i === 0 || i === 6 ? '#cbd5e1' : theme.textSecondary, letterSpacing: 0.2 }}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Compact Calendar Grid */}
        <View style={{ backgroundColor: theme.card }}>
          {(() => {
            const weeks: (number | null)[][] = [];
            for (let i = 0; i < days.length; i += 7) {
              weeks.push(days.slice(i, i + 7));
            }
            while (weeks.length < 6) {
              weeks.push([null, null, null, null, null, null, null]);
            }

            let visibleWeeks = weeks;
            if (monthCollapsed) {
              const targetWeek = weeks.find(w => w.some(d => d !== null && toISO(activeYear, activeMonth, d) === activeDate));
              if (targetWeek) visibleWeeks = [targetWeek];
            }

            return visibleWeeks.map((week, weekIdx) => (
              <View key={`wk-${weekIdx}`} style={{ flexDirection: 'row' }}>
                {week.map((day, colIdx) => {
                  if (day === null) {
                    return (
                      <View
                        key={`e-${weekIdx}-${colIdx}`}
                        style={{ width: cellWidth, height: cellHeight }}
                      />
                    );
                  }

                  const dateISO = toISO(activeYear, activeMonth, day);
                  const isSelected = dateISO === activeDate;
                  const isToday = dateISO === todayISO;
                  const dayItems = displayList.filter(item =>
                    (item.itemType === 'task' ? item.dueDate : item.date) === dateISO
                  );
                  const itemCount = dayItems.length;

                  const dotInfos: { color: string; isShared: boolean }[] = [];
                  const seenColors = new Set<string>();
                  for (const item of dayItems) {
                    const subject = item.itemType === 'task' ? item.courseId : item.subjectId;
                    const color = getSubjectColor(subject);
                    const isShared = item.itemType === 'task' && !!(item as PlannerTaskItem).isSharedTask;
                    const key = `${color}-${isShared}`;
                    if (!seenColors.has(key) && dotInfos.length < 3) {
                      seenColors.add(key);
                      dotInfos.push({ color, isShared });
                    }
                    if (dotInfos.length >= 3) break;
                  }
                  const dotColors = dotInfos.map(d => d.color);

                  return (
                    <Pressable
                      key={dateISO}
                      onPress={() => setActiveDate(dateISO)}
                      style={[
                        s.mCompactCell,
                        { width: cellWidth, height: cellHeight },
                      ]}
                    >
                      <View style={[
                        s.mCompactDateCircle,
                        isToday && !isSelected && s.mCompactDateToday,
                        isSelected && s.mCompactDateSelected,
                        isSelected && isToday && s.mCompactDateSelectedToday,
                      ]}>
                        <Text style={[
                          s.mCompactDateText,
                          isToday && !isSelected && s.mCompactDateTextToday,
                          isSelected && !isToday && s.mCompactDateTextSelected,
                          isSelected && isToday && s.mCompactDateTextToday,
                        ]}>
                          {day}
                        </Text>
                      </View>

                      {itemCount > 0 && (
                        <View style={s.mCompactDotRow}>
                          {itemCount <= 3 ? (
                            dotInfos.map((dot, idx) => (
                              <View
                                key={idx}
                                style={[
                                  s.mCompactDot,
                                  dot.isShared
                                    ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: dot.color }
                                    : { backgroundColor: dot.color },
                                ]}
                              />
                            ))
                          ) : (
                            <>
                              {dotInfos.slice(0, 2).map((dot, idx) => (
                                <View
                                  key={idx}
                                  style={[
                                    s.mCompactDot,
                                    dot.isShared
                                      ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: dot.color }
                                      : { backgroundColor: dot.color },
                                  ]}
                                />
                              ))}
                              <Text style={s.mCompactOverflow}>
                                +{itemCount - 2}
                              </Text>
                            </>
                          )}
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ));
          })()}
        </View>

        {/* Collapsible toggle chevron */}
        <Pressable 
          style={({ pressed }) => [{ 
            alignItems: 'center', 
            justifyContent: 'center',
            paddingVertical: 10, 
            backgroundColor: theme.card,
          }, pressed && { backgroundColor: theme.backgroundSecondary }]} 
          onPress={() => setMonthCollapsed(p => !p)}
        >
          <Feather name={monthCollapsed ? 'chevron-down' : 'chevron-up'} size={24} color={theme.textSecondary} />
        </Pressable>

        {/* Selected Day Detail Panel */}
        <View style={s.mDetailHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.mDetailTitle}>{dayName}, {monthNameStr} {dayNumSelected}</Text>
            <Text style={s.mDetailCount}>
              {selectedDayItems.length === 0
                ? T('noTasksForDay')
                : `${selectedDayItems.length} ${selectedDayItems.length === 1 ? 'item' : 'items'}`}
            </Text>
          </View>
          <Pressable
            style={s.mDetailAddBtn}
            onPress={() => router.push('/add-task' as any)}
          >
            <Feather name="plus" size={16} color={theme.primary} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingLeft: 26, paddingRight: 12, paddingTop: 16, paddingBottom: 120, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {selectedDayItems.length === 0 ? (
            <View style={s.mDetailEmpty}>
              <Feather name="calendar" size={28} color="#cbd5e1" />
              <Text style={s.mDetailEmptyText}>{T('noTasksForDay')}</Text>
            </View>
          ) : (
            selectedDayItems.map((item, idx) => renderEventCard(item, idx))
          )}
        </ScrollView>
      </View>
    );
  };

  // Render vertical week grid (7 columns)
  const renderWeekGrid = () => {
    const hourHeight = 100; // Slightly taller for better readability
    const colWidth = 110;  // Slightly wider columns
    const timeColWidth = 65;
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={s.gridNavHeader}>
          <Pressable style={s.gridNavBtn} onPress={goToPrevWeek}>
            <Feather name="chevron-left" size={20} color={theme.text} />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={s.gridNavTitle}>{getMonthYearLabel(activeDate)}</Text>
            {activeWeekNumber > 0 && (
              <Text style={s.gridNavSub}>
                Week {activeWeekLabel} of {totalWeeksLabel}
              </Text>
            )}
          </View>
          <Pressable style={s.gridNavBtn} onPress={goToNextWeek}>
            <Feather name="chevron-right" size={20} color={theme.text} />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ width: timeColWidth + colWidth * 7 }}>
            {/* Sticky Day Header */}
            <View style={{ flexDirection: 'row', backgroundColor: theme.card, borderBottomWidth: 1, borderColor: theme.border, zIndex: 30 }}>
              <View style={{ width: timeColWidth }} />
              {weekDays.map((day) => {
                const isToday = day.dateISO === todayISO;
                const isWeekend = day.label === 'Sun' || day.label === 'Sat';
                return (
                  <Pressable 
                    key={day.dateISO}
                    onPress={() => setActiveDate(day.dateISO)}
                    style={[
                      { width: colWidth, height: 50, alignItems: 'center', justifyContent: 'center' },
                      isToday && { backgroundColor: `${theme.primary}14` },
                    ]}
                  >
                    <Text style={{ fontSize: 9, fontWeight: '700', color: isToday ? theme.primary : theme.textSecondary, textTransform: 'uppercase' }}>{day.label}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: isToday ? theme.primary : theme.text }}>{day.dayNum}</Text>
                    {isToday && <View style={{ position: 'absolute', bottom: 0, width: 24, height: 3, backgroundColor: theme.primary, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />}
                  </Pressable>
                );
              })}
            </View>

            <ScrollView
              ref={weekGridScrollRef}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 100 }}
            >
              <View style={{ flexDirection: 'row' }}>
                {/* Time Column (Sticky horizontal sync inside horizontal ScrollView) */}
                <View style={{ width: timeColWidth, borderRightWidth: 1, borderColor: theme.border, backgroundColor: theme.card }}>
                  {HOUR_SLOTS.map(slot => {
                    const isPast = slot.hour < currentHour;
                    return (
                      <View key={slot.hour} style={{ height: hourHeight, justifyContent: 'flex-start', paddingTop: 6, paddingLeft: 10 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: isPast ? theme.textSecondary : theme.text }}>{slot.label.split(' ')[0]}</Text>
                        <Text style={{ fontSize: 8, fontWeight: '600', color: theme.textSecondary }}>{slot.label.split(' ')[1]}</Text>
                      </View>
                    );
                  })}
                </View>

                {/* Day Columns */}
                {weekDays.map((day) => {
                  const isActive = day.dateISO === activeDate;
                  const isToday = day.dateISO === todayISO;
                  const isWeekend = day.label === 'Sun' || day.label === 'Sat';
                  const dayItems = displayList.filter(item => (item.itemType === 'task' ? item.dueDate : item.date) === day.dateISO);
                  
                  return (
                    <View 
                      key={day.dateISO} 
                      style={[
                        { width: colWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
                        isToday && { backgroundColor: `${theme.primary}0D` }
                      ]}
                    >
                      <View style={{ height: 24 * hourHeight, position: 'relative', overflow: 'hidden' }}>
                        {/* Hour grid lines */}
                        {HOUR_SLOTS.map(slot => {
                          const isPast = slot.hour < currentHour;
                          return (
                            <View 
                              key={slot.hour} 
                              style={{ 
                                position: 'absolute', 
                                top: slot.hour * hourHeight, 
                                left: 0, 
                                right: 0, 
                                height: 1, 
                                backgroundColor: isPast ? theme.backgroundSecondary : theme.border 
                              }} 
                            />
                          );
                        })}

                        {/* Past Time Dimming Overlay for today */}
                        {isToday && (
                          <View 
                            style={{ 
                              position: 'absolute', 
                              top: 0, 
                              left: 0, 
                              right: 0, 
                              height: currentHour * hourHeight, 
                              backgroundColor: `${theme.background}99`,
                              zIndex: 1
                            }} 
                          />
                        )}

                        {/* Current time indicator line on the today column */}
                        {isToday && (
                          <View 
                            style={{ 
                              position: 'absolute', 
                              top: (currentHour + currentMin/60) * hourHeight - 1, 
                              left: 0, 
                              right: 0, 
                              height: 2, 
                              backgroundColor: theme.primary,
                              zIndex: 40,
                            }} 
                          >
                            <View style={{ 
                              position: 'absolute', 
                              left: -35, 
                              top: -8, 
                              backgroundColor: theme.primary, 
                              paddingHorizontal: 4, 
                              paddingVertical: 2, 
                              borderRadius: 4,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 2
                            }}>
                              <Text style={{ fontSize: 8, color: theme.textInverse, fontWeight: '900' }}>NOW</Text>
                            </View>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary, position: 'absolute', left: -4, top: -3 }} />
                          </View>
                        )}

                        {/* Event cards */}
                        {dayItems.map((item, idx) => {
                          const timeStr = item.itemType === 'task' ? item.dueTime : item.time;
                          const rawT = ((timeStr ?? '') as string).trim() || '12:00';
                          let h = Number.parseInt(rawT.split(':')[0], 10);
                          let m = Number.parseInt(rawT.split(':')[1] || '0', 10);
                          if (!Number.isFinite(h)) h = 12;
                          if (!Number.isFinite(m)) m = 0;
                          h = Math.min(23, Math.max(0, h));
                          m = Math.min(59, Math.max(0, m));
                          const gridHeight = 24 * hourHeight;
                          const rawTop = (h + m / 60) * hourHeight;
                          const duration = item.itemType === 'study' ? item.durationMinutes : 45;
                          const rawBlockHeight = Math.max((duration / 60) * hourHeight, 28);
                          const minChip = 28;
                          let boundedTop = Math.max(0, rawTop);
                          let boundedHeight = Math.max(minChip, rawBlockHeight);
                          if (boundedTop + boundedHeight > gridHeight) {
                            boundedTop = Math.max(0, gridHeight - boundedHeight);
                          }
                          if (boundedTop + boundedHeight > gridHeight) {
                            boundedHeight = Math.max(minChip, gridHeight - boundedTop);
                          }
                          const subject = item.itemType === 'task' ? item.courseId : item.subjectId;
                          const color = getSubjectColor(subject);
                          const isPast = isToday && h < currentHour;

                          if (boundedHeight < minChip || boundedTop >= gridHeight) return null;

                          return (
                            <Pressable
                              key={`${item.itemType}-${idx}`}
                              onPress={() => handleItemPress(item)}
                              style={{
                                position: 'absolute',
                                top: boundedTop,
                                left: 4,
                                right: 4,
                                height: boundedHeight,
                                backgroundColor: hexToRgba(color, isPast ? 0.08 : 0.15),
                                borderRadius: 8,
                                borderLeftWidth: 4,
                                borderLeftColor: isPast ? hexToRgba(color, 0.5) : color,
                                borderBottomWidth: 1,
                                borderBottomColor: theme.border,
                                paddingHorizontal: 6,
                                paddingVertical: 4,
                                zIndex: 10,
                                opacity: isPast ? 0.7 : 1,
                                shadowColor: color,
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: isPast ? 0 : 0.1,
                                shadowRadius: 4,
                                elevation: isPast ? 0 : 2
                              }}
                            >
                              {(() => {
                                const isDone = item.isDone;
                                const title = item.itemType === 'task' ? item.title : (item.topic || T('study'));
                                const subjectDisplay = subject ? (subject.length > 8 ? subject.substring(0, 6) + '..' : subject) : '';
                                
                                return (
                                  <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                                      <Text style={{ fontSize: 8, fontWeight: '800', color: color }}>{subjectDisplay}</Text>
                                      <View style={{ 
                                        width: 7, 
                                        height: 7, 
                                        borderRadius: 3.5, 
                                        borderWidth: 1, 
                                        borderColor: color, 
                                        backgroundColor: isDone ? color : 'transparent' 
                                      }} />
                                    </View>
                                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.text, lineHeight: 11 }} numberOfLines={2}>
                                      {title}
                                    </Text>
                                    {boundedHeight > 40 && (
                                      <Text style={{ fontSize: 8, color: theme.textSecondary, marginTop: 2, fontWeight: '600' }}>{timeStr}</Text>
                                    )}
                                  </View>
                                );
                              })()}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTopRow}>
          <View style={[s.headerSideBase, s.headerSideLeft, s.headerSideLayer]}>
            <Pressable
              style={({ pressed }) => [
                s.headerAddPill,
                {
                  borderColor: headerOutline,
                  backgroundColor: theme.card,
                  shadowColor: theme.text,
                },
                pressed && { opacity: 0.88 },
              ]}
              onPress={openAddMenu ?? (() => router.push('/add-task' as any))}
              hitSlop={4}
              accessibilityLabel={T('addTask')}
              accessibilityRole="button"
            >
              <Feather name="plus" size={20} color={theme.primary} />
              <Text style={[s.headerAddPillText, { color: theme.primary }]} numberOfLines={1}>
                {T('addTask')}
              </Text>
            </Pressable>
          </View>
          <View style={[s.headerSideBase, s.headerSideRight, s.headerSideLayer]}>
            <Pressable
              style={({ pressed }) => [
                s.headerBtn,
                {
                  borderColor: headerOutline,
                  backgroundColor: theme.card,
                  shadowColor: theme.text,
                },
                pressed && { opacity: 0.88 },
              ]}
              onPress={() => setShowShareAllModal(true)}
              hitSlop={6}
            >
              <Feather name="user-plus" size={20} color={theme.primary} />
            </Pressable>
          </View>
          <View style={s.headerCenter} pointerEvents="box-none">
            <Pressable style={s.headerViewBtn} onPress={() => setViewMenuOpen((v) => !v)}>
              <Feather
                name={
                  view === 'day'
                    ? 'clock'
                    : view === 'week'
                    ? 'columns'
                    : view === 'month'
                    ? 'grid'
                    : 'list'
                }
                size={16}
                color={theme.primary}
              />
              <Text style={s.headerViewBtnText}>
                {view.charAt(0).toUpperCase() + view.slice(1)}
              </Text>
              <Feather name={viewMenuOpen ? "chevron-up" : "chevron-down"} size={14} color={theme.textSecondary} />
            </Pressable>

            {viewMenuOpen && (
              <View style={s.viewDropdown}>
                {(['day', 'week', 'month', 'all'] as ViewMode[]).map((mode) => (
                  <Pressable
                    key={mode}
                    style={[s.viewDropdownItem, view === mode && s.viewDropdownItemActive]}
                    onPress={() => {
                      setView(mode);
                      setLastPlannerView(mode);
                      setViewMenuOpen(false);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
                      <Feather
                        name={
                          mode === 'day'
                            ? 'clock'
                            : mode === 'week'
                            ? 'columns'
                            : mode === 'month'
                            ? 'grid'
                            : 'list'
                        }
                        size={14}
                        color={view === mode ? '#ffffff' : theme.text}
                      />
                      <Text style={[s.viewDropdownText, view === mode && s.viewDropdownTextActive]}>
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </Text>
                    </View>
                    {view === mode && (
                      <Feather name="check" size={12} color="#ffffff" />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Calendar panel — only shown in "day" view, since grids have their own nav */}
        {view === 'day' && (
        <View style={s.calendarPanel}>
          <View style={s.monthNavRow}>
            <Pressable style={s.monthNavBtn} onPress={goToPrevWeek} hitSlop={12}>
              <Feather name="chevron-left" size={18} color={theme.text} />
            </Pressable>
            <View pointerEvents="none" style={s.monthNavTitleWrap}>
              <View style={[s.monthNavTitleCol, { alignItems: 'center' }]}>
                <Text style={s.monthNavTitle}>{getMonthYearLabel(activeDate)}</Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary, fontWeight: '600', marginTop: 2 }}>
                  Week {activeWeekLabel} of {totalWeeksLabel}
                </Text>
              </View>
            </View>
            <View style={s.monthNavActions}>
              {activeDate !== todayISO ? (
                <Pressable style={s.monthTodayBtn} onPress={goToToday} hitSlop={10}>
                  <Feather name="calendar" size={13} color={theme.primary} />
                  <Text style={s.monthTodayText}>{T('today')}</Text>
                </Pressable>
              ) : null}
              <Pressable style={s.monthNavBtn} onPress={goToNextWeek} hitSlop={12}>
                <Feather name="chevron-right" size={18} color={theme.text} />
              </Pressable>
            </View>
          </View>

          {/* Day view: static 7-day calendar strip */}
          <View style={s.dayStripContainer}>
            <View style={[s.dayStrip, { justifyContent: 'space-between', paddingHorizontal: 16 }]}>
              {weekDays.map((day) => {
                const isActive = day.dateISO === activeDate;
                const isToday = day.dateISO === todayISO;
                const count = getItemCountOnDay(day.dateISO);
                let dotColor: string | null = null;
                if (count === 1) dotColor = '#10b981';
                else if (count >= 2 && count <= 3) dotColor = '#f59e0b';
                else if (count >= 4) dotColor = '#ef4444';

                return (
                  <Pressable
                    key={day.dateISO}
                    style={[
                      s.dayCell, 
                      { width: 44, height: 60, borderRadius: 12 }, 
                      isActive && { backgroundColor: theme.card, borderColor: theme.primary, borderWidth: 1, shadowColor: '#003366', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 }
                    ]}
                    onPress={() => setActiveDate(day.dateISO)}
                  >
                    <Text style={[s.dayLabel, isActive && s.dayLabelActive]}>{day.label.toUpperCase()}</Text>
                    <Text style={[s.dayDate, isActive && s.dayDateActive]}>{day.dayNum}</Text>
                    <View style={s.dayDotRow}>
                      {isToday && !isActive && <View style={[s.dayDot, { backgroundColor: '#ef4444' }]} />}
                      {dotColor && <View style={[s.dayDot, { backgroundColor: dotColor }]} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
        )}
      </View>


      {/* Content */}

      {view === 'all' ? (
        <ScrollView
          ref={scrollRef}
          style={s.timelineListWrap}
          contentContainerStyle={s.listContentAll}
          showsVerticalScrollIndicator={false}
        >
          {renderListHeader()}
          {displayList.length === 0 ? (
            <View style={s.emptyState}>
              <Feather name="inbox" size={32} color={theme.textSecondary} />
              <Text style={s.emptyText}>{T('noTasksForDay')}</Text>
            </View>
          ) : (
            (() => {
              let lastDate = '';
              return displayList.map((item, idx) => {
                const itemDate = item.itemType === 'task' ? item.dueDate : item.date;
                const showHeader = itemDate !== lastDate;
                lastDate = itemDate;
                return (
                  <View key={`all-${idx}`} style={s.allRowOffset}>
                    {showHeader && (
                      <View style={s.allDateRow}>
                        <Text style={s.allDateHeader}>
                          {formatDisplayDate(itemDate)}  •  Week {getWeekNumberForDate(itemDate)} of {totalWeeks}
                        </Text>
                        <View style={s.allDateLine} />
                      </View>
                    )}
                    {renderEventCard(item, idx)}
                  </View>
                );
              });
            })()
          )}
        </ScrollView>
      ) : view === 'week' ? (
        renderWeekGrid()
      ) : view === 'month' ? (
        renderMonthGrid()
      ) : (
      /* Timeline for Day View */
      <ScrollView 
        ref={scrollRef}
        style={s.timelineListWrap} 
        contentContainerStyle={s.listContentTimeline}
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
      )}

      {/* Share All Tasks Modal */}
      <Modal visible={showShareAllModal} transparent animationType="slide">
        <View style={s.shareAllOverlay}>
          <View style={[s.shareAllContent, { backgroundColor: theme.card }]}>
            <View style={s.shareAllHeader}>
              <Text style={[s.shareAllTitle, { color: theme.text }]}>{T('shareAllModalTitle')}</Text>
              <Pressable onPress={() => setShowShareAllModal(false)} hitSlop={10}>
                <Feather name="x" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            <Text style={[s.shareAllSubtitle, { color: theme.textSecondary }]}>
              {pendingShareCount}{' '}
              {pendingShareCount === 1 ? T('shareAllTaskPendingOne') : T('shareAllTaskPendingMany')}
              {' · '}
              {T('shareAllPickRecipient')}
            </Text>

            <View style={s.shareAllTabs}>
              <Pressable
                style={[
                  s.shareAllTab,
                  { borderColor: theme.border, backgroundColor: theme.backgroundSecondary },
                  shareAllTab === 'friend' && { borderColor: theme.primary, backgroundColor: hexToRgba(theme.primary, 0.06) },
                ]}
                onPress={() => setShareAllTab('friend')}
              >
                <Feather name="user" size={15} color={shareAllTab === 'friend' ? theme.primary : theme.textSecondary} />
                <Text style={[s.shareAllTabText, { color: theme.textSecondary }, shareAllTab === 'friend' && { color: theme.primary }]}>
                  {T('shareAllFriendTab')}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  s.shareAllTab,
                  { borderColor: theme.border, backgroundColor: theme.backgroundSecondary },
                  shareAllTab === 'circle' && { borderColor: theme.primary, backgroundColor: hexToRgba(theme.primary, 0.06) },
                ]}
                onPress={() => setShareAllTab('circle')}
              >
                <Feather name="users" size={15} color={shareAllTab === 'circle' ? theme.primary : theme.textSecondary} />
                <Text style={[s.shareAllTabText, { color: theme.textSecondary }, shareAllTab === 'circle' && { color: theme.primary }]}>
                  {T('shareAllCircleTab')}
                </Text>
              </Pressable>
            </View>

            <ScrollView style={s.shareAllList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {shareAllTab === 'friend' ? (
                communityFriends.length === 0 ? (
                  <Text style={[s.shareAllEmpty, { color: theme.textSecondary }]}>{T('shareAllNoFriends')}</Text>
                ) : (
                  communityFriends.map((f) => (
                    <Pressable
                      key={f.id}
                      style={({ pressed }) => [
                        s.shareAllRow,
                        { borderColor: theme.border, backgroundColor: theme.backgroundSecondary },
                        shareAllFriendId === f.id && { borderColor: theme.primary, backgroundColor: hexToRgba(theme.primary, 0.06) },
                        pressed && { opacity: 0.88 },
                      ]}
                      onPress={() => {
                        setShareAllFriendId(f.id);
                        setShareAllCircleId(null);
                      }}
                    >
                      <View style={[s.shareAllAvatar, { backgroundColor: hexToRgba(theme.primary, 0.12) }]}>
                        <Text style={[s.shareAllAvatarText, { color: theme.primary }]}>
                          {formatPersonDisplayName(f.name).charAt(0)}
                        </Text>
                      </View>
                      <Text
                        style={[
                          s.shareAllRowName,
                          { color: theme.text, flex: 1, minWidth: 0 },
                          shareAllFriendId === f.id && { color: theme.primary },
                        ]}
                        numberOfLines={1}
                      >
                        {formatPersonDisplayName(f.name)}
                      </Text>
                      <View style={s.shareAllRowTrail}>
                        <Feather
                          name={shareAllFriendId === f.id ? 'check-circle' : 'circle'}
                          size={20}
                          color={shareAllFriendId === f.id ? theme.primary : theme.textSecondary}
                        />
                      </View>
                    </Pressable>
                  ))
                )
              ) : communityCircles.length === 0 ? (
                <Text style={[s.shareAllEmpty, { color: theme.textSecondary }]}>{T('shareAllNoCircles')}</Text>
              ) : (
                communityCircles.map((c) => (
                  <Pressable
                    key={c.id}
                    style={({ pressed }) => [
                      s.shareAllRow,
                      { borderColor: theme.border, backgroundColor: theme.backgroundSecondary },
                      shareAllCircleId === c.id && { borderColor: theme.primary, backgroundColor: hexToRgba(theme.primary, 0.06) },
                      pressed && { opacity: 0.88 },
                    ]}
                    onPress={() => {
                      setShareAllCircleId(c.id);
                      setShareAllFriendId(null);
                    }}
                  >
                    <View style={[s.shareAllAvatar, { backgroundColor: hexToRgba(theme.primary, 0.12) }]}>
                      <Text style={[s.shareAllAvatarText, { color: theme.primary }]}>{c.emoji || '●'}</Text>
                    </View>
                    <View style={s.shareAllRowNameCol}>
                      <Text
                        style={[s.shareAllRowName, { color: theme.text }, shareAllCircleId === c.id && { color: theme.primary }]}
                        numberOfLines={1}
                      >
                        {c.name}
                      </Text>
                      <Text style={[s.shareAllRowMeta, { color: theme.textSecondary }]}>
                        {c.member_count || 0} {T('shareMembersSuffix')}
                      </Text>
                    </View>
                    <View style={s.shareAllRowTrail}>
                      <Feather
                        name={shareAllCircleId === c.id ? 'check-circle' : 'circle'}
                        size={20}
                        color={shareAllCircleId === c.id ? theme.primary : theme.textSecondary}
                      />
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>

            {shareAllRecipientId ? (
              <View style={[s.shareAllFooterStrip, { borderTopColor: theme.border, backgroundColor: theme.backgroundSecondary }]}>
                <Text style={[s.shareAllFooterLabel, { color: theme.text }]}>{T('shareAllAutoLabel')}</Text>
                <Switch
                  value={shareAllAutoOn}
                  onValueChange={(val) => {
                    if (shareAllTab === 'friend' && shareAllFriendId) void toggleShareStream(shareAllFriendId, val);
                    else if (shareAllTab === 'circle' && shareAllCircleId) void toggleCircleShareStream(shareAllCircleId, val);
                  }}
                  trackColor={{ false: theme.border, true: '#10b981' }}
                  style={{ transform: [{ scaleX: 0.88 }, { scaleY: 0.88 }] }}
                />
              </View>
            ) : null}

            <Pressable
              style={[
                s.shareAllSendBtn,
                { backgroundColor: theme.primary },
                (isShareAllSending ||
                  (shareAllTab === 'friend' ? !shareAllFriendId : !shareAllCircleId) ||
                  pendingShareCount === 0) && { opacity: 0.5 },
              ]}
              disabled={
                isShareAllSending ||
                (shareAllTab === 'friend' ? !shareAllFriendId : !shareAllCircleId) ||
                pendingShareCount === 0
              }
              onPress={handleShareAll}
            >
              {isShareAllSending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.shareAllSendText}>{T('shareAllSendCta')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const GOLD = '#f59e0b';

function createPlannerStyles(theme: ThemePalette) {
  const lightOutline = themePrefersLightOutline(theme);
  const detailChipOutline = lightOutline ? 'rgba(255,255,255,0.82)' : theme.border;
  const actionRingOutline = lightOutline ? 'rgba(255,255,255,0.58)' : '#d7dee8';
  const actionRingOutlineDone = lightOutline ? 'rgba(74,222,128,0.75)' : '#bbf7d0';
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.background, paddingTop: 56 },
  pressed: { opacity: 0.7 },

  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    zIndex: 10,
  },
  headerTopRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    minHeight: 44,
    marginBottom: 12,
    zIndex: 20,
  },
  headerSideBase: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  headerSideLeft: {
    flexShrink: 1,
    maxWidth: '46%',
    justifyContent: 'flex-start',
    paddingRight: 4,
  },
  headerSideLayer: {
    zIndex: 2,
  },
  headerSideRight: {
    flexShrink: 0,
    justifyContent: 'flex-end',
    paddingLeft: 4,
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  headerAddPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    maxWidth: '100%',
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  headerAddPillText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  headerViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: theme.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,51,102,0.08)',
    shadowColor: '#003366',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  headerViewBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.primary,
  },
  headerTitle: { fontSize: 19, fontWeight: '800', color: theme.text, letterSpacing: -0.4 },


  viewDropdown: {
    position: 'absolute',
    top: 48,
    left: 0,
    minWidth: '100%',
    backgroundColor: theme.card,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 8,
    width: 168,
    shadowColor: theme.text,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    zIndex: 1000,
  },
  viewDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 2,
  },
  viewDropdownItemActive: {
    backgroundColor: theme.primary,
  },
  viewDropdownText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
  },
  viewDropdownTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },

  calendarPanel: {
    backgroundColor: theme.card,
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
  dayStripContainer: {
    height: 64,
  },
  dayStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  dayCell: {
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  dayLabelActive: {
    color: theme.primary,
  },
  dayDate: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.text,
  },
  dayDateActive: {
    color: theme.primary,
  },
  dayDotRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 4,
    height: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  weekCenterHighlight: {
    position: 'absolute',
    left: '50%',
    marginLeft: -32,
    width: 64,
    height: 64,
    backgroundColor: 'rgba(0,51,102,0.06)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: theme.primary,
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
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.border,
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
  monthNavTitleCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavTitle: { fontSize: 17, fontWeight: '800', color: theme.text, textAlign: 'center', letterSpacing: -0.35 },
  weekInfoText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: theme.textSecondary,
  },
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
    color: theme.primary,
    letterSpacing: 0.2,
  },
  viewBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10 },
  viewBtnActive: { backgroundColor: theme.primary },
  viewBtnText: { fontSize: 10, fontWeight: '900', color: theme.textSecondary, letterSpacing: 1.5 },
  viewBtnTextActive: { color: '#ffffff' },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStudyBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /** “All” list — comfortable page margins */
  listContentAll: { paddingHorizontal: 20, paddingBottom: 120 },
  /** Day timeline — tighter horizontal padding so event cards use more screen width */
  listContentTimeline: { paddingHorizontal: 8, paddingBottom: 120 },

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
    width: 68,
    alignItems: 'flex-start',
    paddingLeft: 10,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b', // Slate 500
  },
  timelineContent: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
    paddingLeft: 4,
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
    backgroundColor: theme.primary,
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
    backgroundColor: theme.primary,
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
    color: theme.primary,
  },
  aiCard: {
    backgroundColor: theme.primary,
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
    overflow: 'hidden',
  },
  weekDayActive: {
    transform: [{ scale: 1.02 }],
  },
  weekDayInactive: {
    transform: [{ scale: 0.9 }],
    opacity: 0.92,
  },
  weekDayToday: { borderWidth: 1.5, borderColor: '#d6e3f3', backgroundColor: 'rgba(248, 251, 255, 0.75)' },
  weekDate: { fontSize: 16, fontWeight: '800', color: theme.text, marginBottom: 3, letterSpacing: -0.2 },
  weekDateActive: { color: '#ffffff', fontSize: 18 },
  weekDateInactive: { color: '#526277', opacity: 0.62 },
  weekLabel: { fontSize: 10, fontWeight: '700', color: theme.textSecondary },
  weekLabelActive: { color: '#ffffff', opacity: 0.9 },
  weekLabelInactive: { color: '#b6c0cf', opacity: 0.74 },
  weekDayDot: {
    marginTop: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  // Month Grid
  monthCard: {
    backgroundColor: theme.card,
    borderRadius: 28,
    padding: 20,
  },
  // Week Day Strip (Sun–Sat)


  // Task list header + filter
  taskListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  taskListLabel: { fontSize: 10, fontWeight: '900', color: theme.textSecondary, letterSpacing: 1.5 },
  filterLabel: { fontSize: 10, fontWeight: '700', color: theme.primary, letterSpacing: 1 },
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
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  filterChipText: { fontSize: 9, fontWeight: '900', color: theme.textSecondary, letterSpacing: 1 },
  filterChipTextActive: { color: '#ffffff' },

  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sortLabel: { fontSize: 10, fontWeight: '800', color: theme.textSecondary },
  sortChips: { flexDirection: 'row', gap: 8 },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sortChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  sortChipText: { fontSize: 9, fontWeight: '800', color: theme.textSecondary },
  sortChipTextActive: { color: '#ffffff' },

  // Task Card
  cardRow: { marginBottom: 12, borderRadius: 28, overflow: 'hidden' },
  taskCardShell: {
    position: 'relative',
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  taskCard: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    position: 'relative',
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: lightOutline ? 'rgba(255,255,255,0.38)' : '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  taskCardStudy: { backgroundColor: `${theme.primary}12` },
  taskCardDone: { backgroundColor: theme.backgroundSecondary },
  taskCardShared: { borderLeftWidth: 3, borderLeftColor: '#6366f1' },
  taskContent: { width: '100%', minWidth: 0 },
  /** Top row: subject / badges + overflow menu */
  taskCardHeader: {
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minWidth: 0,
  },
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
  /** Shared-by strip — compact height; name uses full row width */
  sharedFromRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(99,102,241,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(99,102,241,0.2)',
  },
  sharedFromText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: '600',
    color: '#4f46e5',
    lineHeight: 15,
  },
  classroomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15,157,88,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  classroomBadgeText: { fontSize: 10, fontWeight: '700', color: '#0f9d58' },
  needsDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  needsDateText: { fontSize: 10, fontWeight: '700', color: '#d97706' },
  taskMenuBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  taskActionOutside: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: actionRingOutline,
    backgroundColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    // Center the circle slightly more to the left of the card edge
    left: -20,
    top: '50%',
    transform: [{ translateY: -17 }],
    zIndex: 2,
  },
  taskActionOutsideDone: {
    backgroundColor: lightOutline ? 'rgba(34,197,94,0.12)' : '#ecfdf5',
    borderColor: actionRingOutlineDone,
  },
  taskMainRow: { marginBottom: 6 },
  /** Task: title + due time on one row (saves vertical space vs stacked title + clock row) */
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    minWidth: 0,
    marginBottom: 4,
  },
  taskTitleTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
    paddingTop: 1,
  },
  taskTitleTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.text,
  },
  taskTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
    lineHeight: 24,
    flex: 1,
    minWidth: 0,
  },
  taskTitleDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, flexGrow: 1 },
  taskMetaText: { fontSize: 12, fontWeight: '500', color: theme.text, flexShrink: 1, flexGrow: 1 },
  taskMetaUrgent: { fontWeight: '700', color: '#dc2626' },
  taskFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' },
  taskMetaDivider: { fontSize: 12, fontWeight: '700', color: theme.textSecondary },
  taskInlineStatusText: { fontSize: 11, fontWeight: '700' },
  taskInlineStatusNeutral: { color: theme.primary },
  taskInlineStatusSoon: { color: '#c2410c' },
  taskInlineStatusOverdue: { color: '#b91c1c' },
  taskInlineStatusStudy: { color: '#0f766e' },
  taskInlineStatusDone: { color: '#15803d' },
  taskInlineStatusFar: { color: theme.text },
  taskSecondaryMeta: { flexShrink: 1, fontSize: 11, fontWeight: '600', color: theme.textSecondary },

  // Study card specific layout
  studyFooter: {
    marginTop: 2,
    flexDirection: 'column',
    gap: 6,
  },
  studyTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  studyTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.text,
    flexShrink: 1,
  },
  studySubjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  studySubjectLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  studySubjectText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.text,
  },
  studyRevisionText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
  },

  /** Task-only: due status (left) + type • course (right); no chip chrome — more room for text */
  taskMetaFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minWidth: 0,
    marginTop: 2,
  },
  taskMetaFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  taskMetaPrimary: {
    fontSize: 11,
    fontWeight: '700',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    textAlign: 'left',
  },
  taskMetaSecondaryLine: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textSecondary,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    textAlign: 'right',
  },
  taskDetailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: detailChipOutline,
    backgroundColor: theme.backgroundSecondary,
    flexShrink: 1,
  },
  taskDetailChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    flexShrink: 1,
    minWidth: 0,
  },
  studyDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 10,
  },
  studyDurationText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.text,
  },

  // "All" view date group header
  allDateHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.text,
    letterSpacing: -0.2,
  },

  allRowOffset: {
    paddingLeft: 12,
    marginTop: 18,
    marginBottom: 10,
  },
  allDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  allDateLine: {
    flex: 1,
    height: 1,
    borderRadius: 999,
    backgroundColor: '#cbd5e1',
  },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 12, fontWeight: '700', color: theme.textSecondary },

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
  chatSheet: { backgroundColor: theme.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '80%' },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.primary,
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
  chatMessages: { maxHeight: 300, backgroundColor: theme.background },
  chatMessagesContent: { padding: 16, gap: 10 },
  chatBubbleWrap: { alignItems: 'flex-start' },
  chatBubbleRight: { alignItems: 'flex-end' },
  chatBubble: { maxWidth: '85%', padding: 14, borderRadius: 18 },
  chatBubbleAi: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  chatBubbleUser: { backgroundColor: theme.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  chatBubbleText: { fontSize: 13, lineHeight: 19, color: theme.text, fontWeight: '500' },
  chatInputRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.card,
  },
  chatInput: {
    flex: 1,
    backgroundColor: theme.background,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '500',
    color: theme.text,
  },
  chatSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Grid Styles
  monthGridHeader: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  monthGridHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
  },
  monthGridCell: {
    padding: 2,
    borderWidth: 0.5,
    borderColor: '#f1f5f9',
    position: 'relative',
    backgroundColor: theme.card,
  },
  monthGridCellActive: {
    backgroundColor: theme.card,
    borderColor: theme.primary,
    borderWidth: 2,
    zIndex: 10,
  },
  monthGridCellEmpty: {
    backgroundColor: theme.background,
    borderWidth: 0.5,
    borderColor: theme.border,
  },
  monthGridCellHeader: {
    alignItems: 'center',
    marginBottom: 4,
  },
  monthGridCellText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.text,
  },
  monthGridCellTextActive: {
    color: theme.primary,
  },
  monthGridTagList: {
    gap: 1,
  },
  monthGridItemBlock: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    marginBottom: 1,
    borderRadius: 2,
  },
  monthGridTagText: {
    fontSize: 8,
    fontWeight: '700',
    maxWidth: '100%',
    lineHeight: 10,
  },
  monthGridMoreText: {
    fontSize: 8,
    fontWeight: '800',
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 1,
  },

  // Compact month grid cells
  mCompactCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  mCompactDateCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  mCompactDateToday: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  mCompactDateSelected: {
    borderColor: theme.primary,
    backgroundColor: 'transparent',
  },
  mCompactDateSelectedToday: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  mCompactDateText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.text,
  },
  mCompactDateTextToday: {
    color: '#ffffff',
    fontWeight: '700',
  },
  mCompactDateTextSelected: {
    color: theme.primary,
    fontWeight: '800',
  },
  mCompactDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
    height: 6,
  },
  mCompactDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  mCompactOverflow: {
    fontSize: 8,
    fontWeight: '800',
    color: theme.textSecondary,
  },

  // Month detail panel
  mDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: theme.card,
  },
  mDetailTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.text,
    letterSpacing: -0.3,
  },
  mDetailCount: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    marginTop: 2,
  },
  mDetailAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.backgroundSecondary,
  },
  mDetailEmpty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  mDetailEmptyText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
  },

  // Expand/collapse toggle for month view
  mToggleWrap: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    zIndex: 50,
  },
  mToggleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#003366',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,51,102,0.08)',
  },

  gridNavHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: theme.card,
    borderBottomWidth: 1,
    borderColor: theme.border,
  },
  gridNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  gridNavToggleActive: {
    backgroundColor: 'rgba(0,51,102,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,51,102,0.25)',
  },
  gridNavTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.text,
  },
  gridNavSub: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.textSecondary,
    marginTop: 2,
  },

  // Share All Modal
  shareAllOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  shareAllContent: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
    maxHeight: '84%',
  },
  shareAllHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  shareAllTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.35, flex: 1, paddingRight: 10 },
  shareAllSubtitle: { fontSize: 13, fontWeight: '500', marginBottom: 12, lineHeight: 18 },
  shareAllTabs: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  shareAllTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  shareAllTabText: { fontSize: 14, fontWeight: '700' },
  shareAllList: { maxHeight: 300, marginBottom: 2 },
  shareAllEmpty: { fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 18 },
  shareAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  shareAllRowTrail: { width: 26, alignItems: 'flex-end', justifyContent: 'center' },
  shareAllRowNameCol: { flex: 1, minWidth: 0 },
  shareAllRowMeta: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  shareAllAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareAllAvatarText: { fontSize: 15, fontWeight: '700' },
  shareAllRowName: { fontSize: 15, fontWeight: '600' },
  shareAllFooterStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginTop: 2,
    marginBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
  shareAllFooterLabel: { fontSize: 14, fontWeight: '600', flex: 1, paddingRight: 10 },
  shareAllSendBtn: {
    marginTop: 0,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  shareAllSendText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
});
}
