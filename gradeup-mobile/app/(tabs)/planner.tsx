import { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Modal, TextInput, ScrollView, Alert, Dimensions } from 'react-native';
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

export default function Planner() {
  const scrollRef = useRef<ScrollView>(null);
  
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
  const [showAiCard, setShowAiCard] = useState(false);

  const todayISO = getTodayISO();
  const activeYear = useMemo(() => new Date(activeDate + 'T12:00:00').getFullYear(), [activeDate]);
  const activeMonth = useMemo(() => new Date(activeDate + 'T12:00:00').getMonth(), [activeDate]);

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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

  const calendarStripRef = useRef<ScrollView>(null);

  // Auto-scroll the calendar strip to center the active date
  useEffect(() => {
    const dayIndex = monthDays.findIndex(d => d.dateISO === activeDate);
    if (dayIndex >= 0 && calendarStripRef.current) {
      const PILL_WIDTH = 56; // 44px pill + 12px gap
      const screenWidth = Dimensions.get('window').width;
      const offset = Math.max(0, dayIndex * PILL_WIDTH - screenWidth / 2 + PILL_WIDTH / 2);
      setTimeout(() => {
        calendarStripRef.current?.scrollTo({ x: offset, animated: true });
      }, 50);
    }
  }, [activeDate, monthDays]);

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

  const combinedList = useMemo((): PlannerItem[] => {
    if (view !== 'all') {
      return filteredTasks.map((t) => ({ ...t, itemType: 'task' as const }));
    }
    const taskItems: PlannerItem[] = filteredTasks.map((t) => ({ ...t, itemType: 'task' as const }));
    const studyItems: PlannerItem[] = studyItemsForPlanner;
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
  }, [view, filteredTasks, studyItemsForPlanner]);

  const pinnedSet = useMemo(() => new Set(pinnedTaskIds), [pinnedTaskIds]);
  const displayList = useMemo((): PlannerItem[] => {
    const raw = view === 'all' ? combinedList : filteredTasks.map((t) => ({ ...t, itemType: 'task' as const }));
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

  // Generate hourly time slots from 8 AM to 11 PM
  const HOUR_SLOTS = useMemo(() => {
    const slots: { hour: number; label: string }[] = [];
    for (let h = 8; h <= 23; h++) {
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

  // Card colors by priority/type — harmonised with navy/gold theme
  const getCardBg = (item: PlannerItem) => {
    if (item.itemType === 'study') return '#e0f2fe'; // light-blue (matches COLORS.border)
    if (item.priority === Priority.High) return 'rgba(0,51,102,0.08)'; // soft navy tint
    if (item.priority === Priority.Medium) return 'rgba(245,158,11,0.10)'; // soft gold tint
    return '#ffffff'; // clean white card
  };

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
    const cardBg = getCardBg(item);
    const title = getCardTitle(item);
    const timeRange = getCardTimeRange(item);
    const subject = getCardSubject(item);
    const daysUntil = item.itemType === 'task' ? getDaysUntilDue(item.dueDate) : 99;
    const isOverdue = item.itemType === 'task' && daysUntil < 0;
    const isDueSoon = item.itemType === 'task' && !isOverdue && daysUntil <= 3;

    return (
      <Pressable
        key={`card-${idx}`}
        style={[
          s.taskCard,
          { backgroundColor: cardBg },
          (isOverdue || isDueSoon) && { borderWidth: 1.5, borderColor: isOverdue ? NAVY : GOLD },
        ]}
        onPress={() => handleItemPress(item)}
      >
        <View style={s.taskContent}>
          <View style={s.taskTopRow}>
            <Text style={[s.taskTitle, item.isDone && s.taskTitleDone]} numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={(e) => { e.stopPropagation(); handleItemAction(item); }} style={{ padding: 4 }}>
              <Feather name="more-vertical" size={16} color={NAVY} />
            </Pressable>
          </View>

          <View style={s.taskMetaRow}>
            <Feather name="clock" size={12} color="#475569" />
            <Text style={[s.taskMetaText, (isOverdue || isDueSoon) && s.taskMetaUrgent]}>
              {timeRange}
            </Text>
          </View>

          <Text style={s.assignedLabel}>{T('subject') || 'Assigned to'}</Text>
          <View style={s.avatarsRow}>
            <View style={s.avatarWrap}>
              <Text style={s.avatarText}>{subject.charAt(0)}</Text>
            </View>
            <Text style={s.assigneeText}>{subject}</Text>
          </View>
        </View>
      </Pressable>
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
          <Text style={s.headerTitle}>Calendar</Text>
          <Pressable style={s.headerBtn}>
            <Feather name="more-horizontal" size={24} color={TEXT_PRIMARY} />
          </Pressable>
        </View>

        {/* Month Navigator */}
        <View style={s.monthNavRow}>
          <Pressable style={s.monthNavBtn} onPress={goToPrevMonth} hitSlop={12}>
            <Feather name="chevron-left" size={20} color={TEXT_SECONDARY} />
          </Pressable>
          <Text style={s.monthNavTitle}>{getMonthYearLabel(activeDate)}</Text>
          <Pressable style={s.monthNavBtn} onPress={goToNextMonth} hitSlop={12}>
            <Feather name="chevron-right" size={20} color={TEXT_SECONDARY} />
          </Pressable>
        </View>
      </View>
      {/* Horizontal Calendar Strip — all days in month */}
      <View style={s.weekStrip}>
        <ScrollView 
          ref={calendarStripRef}
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
        >
          {monthDays.map((day) => {
            const isActive = activeDate === day.dateISO;
            const isToday = todayISO === day.dateISO;
            return (
              <Pressable 
                key={day.dateISO} 
                style={[s.weekDay, isActive && s.weekDayActive, !isActive && isToday && s.weekDayToday]} 
                onPress={() => setActiveDate(day.dateISO)}
              >
                <Text style={[s.weekDate, isActive && s.weekDateActive]}>{day.dayNum}</Text>
                <Text style={[s.weekLabel, isActive && s.weekLabelActive]}>{day.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
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
  headerTitle: { fontSize: 20, fontWeight: '700', color: TEXT_PRIMARY },

  // Month Navigator
  monthNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, gap: 16 },
  monthNavBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  monthNavTitle: { fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY, minWidth: 100, textAlign: 'center' },
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

  // Assigned label
  assignedLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 10,
    marginBottom: 4,
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
    marginBottom: 24,
  },
  weekDay: { alignItems: 'center', justifyContent: 'center', width: 44, height: 60, borderRadius: 16 },
  weekDayActive: { backgroundColor: NAVY },
  weekDayToday: { borderWidth: 1.5, borderColor: NAVY },
  weekDate: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 2 },
  weekDateActive: { color: '#ffffff' },
  weekLabel: { fontSize: 11, fontWeight: '600', color: TEXT_SECONDARY },
  weekLabelActive: { color: '#ffffff' },

  // Month Grid
  monthCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 20,
  },
  // Month Grid dots (for tasks)
  dayDot: {
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
    borderRadius: 20,
    padding: 16,
    alignItems: 'flex-start',
    gap: 14,
    position: 'relative',
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  taskContent: { flex: 1 },
  taskTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  taskTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', lineHeight: 22, flex: 1, paddingRight: 8 },
  taskTitleDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taskMetaText: { fontSize: 12, fontWeight: '500', color: '#475569' },
  taskMetaUrgent: { fontWeight: '700', color: '#dc2626' },
  
  // Assignee / Avatars Row
  avatarsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  avatarText: { fontSize: 10, fontWeight: '800', color: NAVY },
  assigneeText: { fontSize: 11, fontWeight: '600', color: '#64748b' },

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
