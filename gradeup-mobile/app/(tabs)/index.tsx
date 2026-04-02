import { useMemo, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Image, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { ThemeIcon } from '@/components/ThemeIcon';
import { formatDisplayDate, getTodayISO } from '@/src/utils/date';
import { useTranslations } from '@/src/i18n';
import { getDaysUntilTaskDue, selectTodaysFocusTask } from '@/src/lib/taskUtils';
import { dueDateToTeachingWeekRaw, peakWeekFromTaskCounts, taskCountsByOpenDueWeek } from '@/src/lib/academicWeek';
import { useTheme, useThemeId } from '@/hooks/useTheme';
import { themePrefersLightOutline, type ThemeId, type ThemePalette } from '@/constants/Themes';

/** Home header: darker base + stronger waves (only these themes; blush/emerald unchanged). */
const HEADER_VISUAL_BOOST_IDS: ReadonlySet<ThemeId> = new Set(['light', 'dark', 'midnight']);

/**
 * Home header navy — same base as profile hero in light mode (`#003366`).
 * Flat gradient stops so hue matches the profile card; wave + overlay do the variation (like profile).
 */
const PROFILE_HERO_NAVY = '#003366';

const LIGHT_HOME_HEADER = {
  accent2: PROFILE_HERO_NAVY,
  primary: PROFILE_HERO_NAVY,
  secondary: PROFILE_HERO_NAVY,
  sheenAccent: '#06b6d4',
} as const;

/** Dark theme: same navy as profile reference (not cyan-teal) so header matches the deep blue look. */
const DARK_HEADER_DEEP = {
  accent2: PROFILE_HERO_NAVY,
  primary: PROFILE_HERO_NAVY,
  secondary: PROFILE_HERO_NAVY,
  sheenAccent: '#38bdf8',
} as const;

/** Darker antique gold header (midnight / black & gold) */
const MIDNIGHT_HEADER_DEEP = {
  accent2: '#4a3a0c',
  primary: '#7a6218',
  secondary: '#8f7318',
  sheenAccent: '#d4af37',
} as const;

const WEEKDAY_TO_NUM: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const GOLD = '#f59e0b';
const OVERDUE_COLOR = '#dc2626';

function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDaysLeft(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T23:59:59');
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 864e5);
}

function getDueTimeLabelRaw(dueDate: string): { key: 'overdue' | 'dueToday' | 'tomorrow' | 'daysLeft'; days: number } {
  const days = getDaysLeft(dueDate);
  if (days < 0) return { key: 'overdue', days };
  if (days === 0) return { key: 'dueToday', days };
  if (days === 1) return { key: 'tomorrow', days };
  return { key: 'daysLeft', days };
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(0, 0, 0, ${alpha})`;
  const int = parseInt(clean, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type FocusStudyItem = {
  studyKey: string;
  date: string;
  time: string;
  code: string;
  room: string;
  type: 'STUDY';
  name: string;
};

function createDashboardStyles(theme: ThemePalette) {
  const primary = theme.primary;
  const bg = theme.background;
  const card = theme.card;
  const border = theme.border;
  const text = theme.text;
  const textSecondary = theme.textSecondary;
  const bgSecondary = theme.backgroundSecondary;
  const chipTint = `${primary}33`;
  const chipBorder = `${primary}44`;
  const metaPillOutline = themePrefersLightOutline(theme) ? 'rgba(255,255,255,0.82)' : border;
  const taskCardOutline = themePrefersLightOutline(theme) ? 'rgba(255,255,255,0.38)' : border;

  return StyleSheet.create({
    container: { flex: 1 },
    content: { paddingTop: 0, paddingBottom: 100 },
    headerWrap: {
      paddingHorizontal: 16,
      paddingTop: 56,
      paddingBottom: 55,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 4,
      overflow: 'hidden',
    },
    peakAlertBox: {
      backgroundColor: card,
      borderRadius: 18,
      paddingHorizontal: 20,
      paddingVertical: 20,
      marginTop: 22,
      zIndex: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: border,
    },
    peakAlertTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    peakAlertLeft: {},
    peakAlertWeek: {
      fontSize: 20,
      fontWeight: '800',
      color: text,
      letterSpacing: -0.3,
    },
    peakAlertLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: textSecondary,
      letterSpacing: 1.2,
      marginTop: 4,
    },
    peakAlertSubline: {
      fontSize: 11,
      fontWeight: '600',
      color: textSecondary,
      marginTop: 4,
      maxWidth: 220,
      lineHeight: 15,
    },
    peakAlertBadge: {
      backgroundColor: bgSecondary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
    },
    peakAlertBadgeMuted: {
      backgroundColor: bgSecondary,
      opacity: 0.85,
    },
    peakAlertBadgeText: {
      fontSize: 12,
      fontWeight: '800',
      color: text,
      letterSpacing: 0.4,
    },
    peakAlertBadgeTextMuted: {
      fontSize: 10,
      color: textSecondary,
    },
    peakAlertBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 16,
      marginBottom: 10,
    },
    peakAlertProgressLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: textSecondary,
      letterSpacing: 1.2,
    },
    peakAlertFinalLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: textSecondary,
      letterSpacing: 0.5,
    },
    peakAlertDots: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    peakAlertDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: border,
    },
    peakAlertDotCurrent: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: GOLD,
    },
    peakAlertDotPast: {
      backgroundColor: textSecondary,
    },
    peakAlertDotPeak: {
      borderWidth: 2,
      borderColor: '#dc2626',
      backgroundColor: '#fecaca',
    },
    headerGradient: {
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    headerSheen: {
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    headerWave: {
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    headerTextureOverlay: {
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 1 },
    greeting: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    subtitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    headerIconBtn: { padding: 4 },

    pressed: { opacity: 0.96 },

    sectionWrapper: { marginHorizontal: 20, marginBottom: 32 },
    sectionWrapperFirst: { marginTop: 24 },
    sectionHeader: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: primary },
    sectionSubcopy: { fontSize: 13, lineHeight: 19, color: textSecondary, marginBottom: 16, maxWidth: '92%' },

    focusCard: {
      borderRadius: 26,
      paddingHorizontal: 18,
      paddingVertical: 16,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: taskCardOutline,
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.045,
      shadowRadius: 16,
      elevation: 3,
    },
    focusCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    focusPillsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    focusCoursePill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    focusCoursePillText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
    focusStatusPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    focusStatusPillText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
    focusArrowButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: bgSecondary,
      borderWidth: 1,
      borderColor: taskCardOutline,
    },
    focusTitle: {
      fontSize: 18,
      fontWeight: '800',
      lineHeight: 23,
      color: text,
      letterSpacing: -0.4,
    },
    focusSupportText: {
      fontSize: 13,
      fontWeight: '600',
      color: textSecondary,
      marginTop: 6,
    },
    focusMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
      marginTop: 14,
    },
    focusMetaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: bgSecondary,
      borderWidth: 1,
      borderColor: metaPillOutline,
    },
    focusMetaText: { fontSize: 13, fontWeight: '700', color: textSecondary },
    focusEmptyWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 156,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: taskCardOutline,
      borderRadius: 28,
      paddingHorizontal: 24,
    },
    focusEmptyIcon: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chipTint,
      marginBottom: 16,
    },
    focusEmpty: { fontSize: 18, fontWeight: '700', color: text, marginBottom: 6 },
    focusEmptySub: { fontSize: 14, fontWeight: '500', color: primary },

    timelineHeader: { marginBottom: 16 },
    timelineHeaderBody: { flex: 1, minWidth: 0 },
    upcomingPanel: {
      backgroundColor: bgSecondary,
      borderRadius: 26,
      padding: 16,
      borderWidth: 1,
      borderColor: taskCardOutline,
    },
    upcomingLeadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 14,
    },
    upcomingLeadBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: chipTint,
      borderWidth: 1,
      borderColor: chipBorder,
    },
    upcomingLeadBadgeText: { fontSize: 12, fontWeight: '800', color: primary, letterSpacing: 0.3 },
    upcomingSeeAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: taskCardOutline,
    },
    upcomingSeeAllText: { fontSize: 13, fontWeight: '700', color: primary },
    upcomingEmptyCard: {
      alignItems: 'center',
      paddingVertical: 24,
      paddingHorizontal: 18,
      borderRadius: 20,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: taskCardOutline,
    },
    upcomingEmptyIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chipTint,
      marginBottom: 14,
    },
    upcomingEmptyTitle: { fontSize: 16, fontWeight: '700', color: text, textAlign: 'center' },
    upcomingEmptySub: { fontSize: 13, lineHeight: 19, color: textSecondary, textAlign: 'center', marginTop: 8 },
    upcomingEmptyButton: {
      marginTop: 18,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: primary,
    },
    upcomingEmptyButtonText: { color: theme.textInverse, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
    upcomingDateRow: { marginBottom: 10 },
    upcomingDateChip: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: chipTint,
      borderWidth: 1,
      borderColor: chipBorder,
    },
    upcomingDateChipText: { fontSize: 12, fontWeight: '800', color: primary, letterSpacing: 0.3 },
    upcomingCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderRadius: 22,
      paddingVertical: 16,
      paddingHorizontal: 16,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: taskCardOutline,
      marginBottom: 12,
    },
    upcomingAccent: {
      width: 6,
      alignSelf: 'stretch',
      borderRadius: 999,
    },
    upcomingCardBody: { flex: 1, minWidth: 0 },
    upcomingCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    upcomingTimeWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    upcomingTime: { fontSize: 13, fontWeight: '700', color: textSecondary },
    upcomingTitle: {
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 22,
      color: text,
      letterSpacing: -0.3,
    },
    upcomingTitleDone: { color: textSecondary, textDecorationLine: 'line-through' },
    upcomingMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 },
    upcomingSubjectDot: { width: 8, height: 8, borderRadius: 4 },
    upcomingMetaText: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: textSecondary },
    upcomingMetaDivider: { fontSize: 13, color: textSecondary, fontWeight: '700' },
    upcomingMoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingTop: 8,
      paddingBottom: 2,
    },
    upcomingMoreText: { fontSize: 13, fontWeight: '700', color: primary },

    studyingWidget: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 20,
      marginBottom: 20,
      marginTop: -10,
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: chipTint,
      borderWidth: 1,
      borderColor: taskCardOutline,
    },
  });
}

export default function Dashboard() {
  const {
    user,
    tasks,
    courses,
    academicCalendar,
    revisionSettingsList,
    completedStudyKeys,
    pinnedTaskIds,
    getSubjectColor,
    language,
    pendingClassroomTasks,
    clearPendingClassroomTasks,
  } = useApp();
  const { friendsWithStatus } = useCommunity();
  const theme = useTheme();
  const themeId = useThemeId();
  const styles = useMemo(() => createDashboardStyles(theme), [theme]);

  const headerVisualBoost = HEADER_VISUAL_BOOST_IDS.has(themeId);

  let headerPrimary: string;
  let headerAccent2: string;
  let headerSecondary: string;
  let headerSheenAccent: string;

  if (themeId === 'light') {
    headerAccent2 = LIGHT_HOME_HEADER.accent2;
    headerPrimary = LIGHT_HOME_HEADER.primary;
    headerSecondary = LIGHT_HOME_HEADER.secondary;
    headerSheenAccent = LIGHT_HOME_HEADER.sheenAccent;
  } else if (themeId === 'dark') {
    const base = headerVisualBoost ? DARK_HEADER_DEEP : { accent2: theme.accent2, primary: theme.primary, secondary: theme.secondary, sheenAccent: theme.accent };
    headerAccent2 = base.accent2;
    headerPrimary = base.primary;
    headerSecondary = base.secondary;
    headerSheenAccent = base.sheenAccent;
  } else if (themeId === 'midnight') {
    const base = headerVisualBoost ? MIDNIGHT_HEADER_DEEP : { accent2: theme.accent2, primary: theme.primary, secondary: theme.secondary, sheenAccent: theme.accent };
    headerAccent2 = base.accent2;
    headerPrimary = base.primary;
    headerSecondary = base.secondary;
    headerSheenAccent = base.sheenAccent;
  } else {
    headerAccent2 = theme.accent2;
    headerPrimary = theme.primary;
    headerSecondary = theme.secondary;
    headerSheenAccent = theme.accent;
  }

  /** Match profile hero: wave 0.35 + overlay rgba(0,51,102,0.35) — same recipe as profile. */
  const profileMatchTexture = themeId === 'light' || themeId === 'dark';
  const headerWaveOpacity = profileMatchTexture ? 0.35 : headerVisualBoost ? 0.58 : 0.35;
  const headerTextureOverlayAlpha = profileMatchTexture ? 0.35 : headerVisualBoost ? 0.18 : 0.35;
  const headerSheenAlpha = profileMatchTexture ? 0.08 : headerVisualBoost ? 0.12 : 0.22;

  const headerOnPrimary =
    themeId === 'light' || themeId === 'midnight'
      ? '#ffffff'
      : themeId === 'dark' && headerVisualBoost
        ? theme.text
        : theme.textInverse;
  const headerOnPrimaryMuted =
    themeId === 'light' || themeId === 'midnight'
      ? hexToRgba('#ffffff', 0.88)
      : themeId === 'dark' && headerVisualBoost
        ? hexToRgba(theme.text, 0.88)
        : hexToRgba(theme.textInverse, 0.88);
  const T = useTranslations(language);

  useEffect(() => {
    if (pendingClassroomTasks.length === 0) return;
    const count = pendingClassroomTasks.length;
    const courseNames = [...new Set(pendingClassroomTasks.map(t => t.courseName))].join(', ');
    Alert.alert(
      'New Classroom Tasks',
      `${count} new task${count !== 1 ? 's' : ''} found in Google Classroom:\n\n${courseNames}\n\nWould you like to review and import them?`,
      [
        {
          text: 'Later',
          style: 'cancel',
          onPress: async () => {
            const { getClassroomPrefs, setClassroomPrefs } = require('@/src/storage');
            const prefs = await getClassroomPrefs();
            if (prefs) {
              const dismissed = new Set(prefs.dismissedNewTaskIds ?? []);
              pendingClassroomTasks.forEach((t: { workId: string }) => dismissed.add(t.workId));
              await setClassroomPrefs({ ...prefs, dismissedNewTaskIds: [...dismissed] });
            }
            clearPendingClassroomTasks();
          },
        },
        {
          text: 'Review',
          onPress: () => {
            clearPendingClassroomTasks();
            router.push('/classroom-sync' as any);
          },
        },
      ],
    );
  }, [pendingClassroomTasks.length]);
  const baseTotalWeeks = academicCalendar?.totalWeeks ?? 14;
  const maxTaskWeek = useMemo(() => {
    if (!academicCalendar) return baseTotalWeeks;
    let maxW = baseTotalWeeks;
    for (const t of tasks) {
      const w = dueDateToTeachingWeekRaw(t.dueDate, academicCalendar, user.startDate);
      if (typeof w === 'number' && w > maxW) maxW = w;
    }
    return maxW;
  }, [tasks, academicCalendar, user.startDate, baseTotalWeeks]);
  const effectiveCalendar = useMemo(
    () => (academicCalendar ? { ...academicCalendar, totalWeeks: Math.max(baseTotalWeeks, maxTaskWeek) } : academicCalendar),
    [academicCalendar, baseTotalWeeks, maxTaskWeek],
  );
  const totalWeeks = effectiveCalendar?.totalWeeks ?? baseTotalWeeks;
  const semesterPhase = user.semesterPhase ?? 'teaching';
  const focusTask = useMemo(
    () => selectTodaysFocusTask(tasks, pinnedTaskIds),
    [tasks, pinnedTaskIds]
  );

  const studyingFriends = useMemo(
    () => friendsWithStatus.filter((f) => f.activity?.activity_type === 'studying'),
    [friendsWithStatus]
  );

  const taskWeekCounts = useMemo(
    () => taskCountsByOpenDueWeek(tasks, effectiveCalendar, user.startDate),
    [tasks, effectiveCalendar, user.startDate],
  );
  const { week: taskPeakWeek, max: taskPeakMax } = useMemo(
    () => peakWeekFromTaskCounts(taskWeekCounts),
    [taskWeekCounts],
  );

  const headerSemesterStatus = useMemo(() => {
    if (semesterPhase === 'no_calendar') return T('semesterNotConfigured');
    if (semesterPhase === 'before_start') return T('semesterNotStartedShort');
    if (semesterPhase === 'break_after' || user.isBreak) return T('semesterBreak') || 'Semester Break';
    return `${T('week')} ${user.currentWeek}`;
  }, [semesterPhase, user.isBreak, user.currentWeek, T]);

  const pulseMainTitle = useMemo(() => {
    if (semesterPhase === 'no_calendar') return T('semesterNotConfigured');
    if (semesterPhase === 'before_start') return T('notInSemester');
    if (semesterPhase === 'break_after' || user.isBreak) return T('semesterBreak') || 'Semester Break';
    return `${T('week')} ${user.currentWeek}`;
  }, [semesterPhase, user.isBreak, user.currentWeek, T]);

  const pulseBadgeText = useMemo(() => {
    if (semesterPhase === 'teaching' && !user.isBreak) {
      if (taskPeakMax === 0 || taskPeakWeek < 1) return T('tasksPulseNoTasks');
      if (taskPeakWeek === user.currentWeek) {
        return `${T('week')} ${user.currentWeek} · ${T('peakAlert')}`;
      }
      return `W${taskPeakWeek} ${T('peakAlert')}`;
    }
    if (semesterPhase === 'break_after' || user.isBreak) return T('betweenSemestersBadge');
    if (semesterPhase === 'before_start') return T('semesterNotStartedShort');
    return T('semesterNotConfigured');
  }, [semesterPhase, user.isBreak, user.currentWeek, taskPeakWeek, taskPeakMax, T]);

  const now = new Date();
  const todayStr = getTodayISO();
  const in30Days = new Date(now);
  in30Days.setDate(in30Days.getDate() + 30);
  const in30Str = toLocalISO(in30Days);

  const deadlineItems = tasks
    .filter((t) => !t.isDone && t.dueDate >= todayStr && t.dueDate <= in30Str)
    .map((t) => ({
      taskId: t.id,
      date: t.dueDate,
      time: t.dueTime,
      code: t.courseId,
      room: T('onlineSubmission'),
      type: 'DEADLINE' as const,
      name: t.title,
    }));

  const studyItems: FocusStudyItem[] = [];
  for (const revisionSettings of revisionSettingsList) {
    if (!revisionSettings.time) continue;
    const [h, m] = revisionSettings.time.split(':').map((x) => parseInt(x, 10) || 0);
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const subject = revisionSettings.subjectId || 'Study';
    const topic = revisionSettings.topic ? ` • ${revisionSettings.topic}` : '';
    if (revisionSettings.repeat === 'once' && revisionSettings.singleDate) {
      const dateStr = revisionSettings.singleDate;
      if (dateStr >= todayStr && dateStr <= in30Str) {
        studyItems.push({ studyKey: `${dateStr}T${timeStr}`, date: dateStr, time: timeStr, code: subject, room: `${revisionSettings.durationMinutes} min${topic}`, type: 'STUDY', name: T('timeToStudy') });
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
          studyItems.push({ studyKey: `${dateStr}T${timeStr}`, date: dateStr, time: timeStr, code: subject, room: `${revisionSettings.durationMinutes} min${topic}`, type: 'STUDY', name: T('timeToStudy') });
        }
      }
    }
  }

  const scheduleWithinMonth = [...deadlineItems, ...studyItems].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : a.time.localeCompare(b.time);
  });
  const previewItems = scheduleWithinMonth.slice(0, 8);
  const hiddenUpcomingCount = Math.max(0, scheduleWithinMonth.length - previewItems.length);

  const nextStudyItem = useMemo(() => {
    const pendingStudyItems = studyItems.filter((item) => !completedStudyKeys.includes(item.studyKey));
    if (pendingStudyItems.length === 0) return null;
    return [...pendingStudyItems].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      return dateCompare !== 0 ? dateCompare : a.time.localeCompare(b.time);
    })[0];
  }, [completedStudyKeys, revisionSettingsList, todayStr, in30Str]);

  const focusCard = useMemo(() => {
    if (focusTask) {
      const info = getDueTimeLabelRaw(focusTask.task.dueDate);
      const subjectColor = getSubjectColor(focusTask.task.courseId);
      const days = info.days;
      let statusColor: string;
      if (days < 0 || days === 0) {
        // Overdue or today – very near => red
        statusColor = '#dc2626';
      } else if (days <= 3) {
        // 1–3 days => medium near => yellow
        statusColor = '#ca8a04';
      } else {
        // Far away => green
        statusColor = '#15803d';
      }
      return {
        kind: 'task' as const,
        title: focusTask.task.title,
        code: focusTask.task.courseId,
        date: focusTask.task.dueDate,
        time: focusTask.task.dueTime,
        accentColor: subjectColor,
        statusColor,
        badgeBackground: theme.card,
        label:
          info.key === 'daysLeft'
            ? `${info.days} ${T('daysLeft')}`
            : T(info.key),
        subtitle:
          focusTask.reason === 'pinned'
            ? `${T('subject')} • ${focusTask.task.priority}`
            : `${focusTask.task.type} • ${focusTask.task.priority}`,
        onPress: () => router.push({ pathname: '/task-details', params: { id: focusTask.task.id } } as any),
      };
    }

    if (nextStudyItem) {
      const info = getDueTimeLabelRaw(nextStudyItem.date);
      const subjectColor = getSubjectColor(nextStudyItem.code);
      return {
        kind: 'study' as const,
        title: nextStudyItem.name,
        code: nextStudyItem.code,
        date: nextStudyItem.date,
        time: nextStudyItem.time,
        accentColor: subjectColor,
        statusColor: subjectColor,
        badgeBackground: theme.card,
        label:
          info.key === 'daysLeft'
            ? `${info.days} ${T('daysLeft')}`
            : T(info.key),
        subtitle: nextStudyItem.room,
        onPress: () => router.push('/(tabs)/planner' as any),
      };
    }

    return null;
  }, [focusTask, nextStudyItem, T, getSubjectColor, theme.card]);

  const formatDateLabel = (dateStr: string) => formatDisplayDate(dateStr);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      {/* Header: greeting + week + profile + week peak alert (white box) */}
      <View
        style={[
          styles.headerWrap,
          {
            backgroundColor: headerPrimary,
            shadowColor: headerPrimary,
          },
        ]}
      >
        <LinearGradient
          colors={[headerAccent2, headerPrimary, headerSecondary]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFillObject, styles.headerGradient]}
        />
        <Image
          source={require('../../assets/images/wave-texture.png')}
          style={[StyleSheet.absoluteFillObject, styles.headerWave, { opacity: headerWaveOpacity }]}
          resizeMode="cover"
        />
        <View
          style={[
            StyleSheet.absoluteFillObject,
            styles.headerTextureOverlay,
            { backgroundColor: hexToRgba(headerPrimary, headerTextureOverlayAlpha) },
          ]}
        />
        <View
          style={[
            StyleSheet.absoluteFillObject,
            styles.headerSheen,
            { backgroundColor: hexToRgba(headerSheenAccent, headerSheenAlpha) },
          ]}
        />
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: headerOnPrimary }]}>{T('hello')}, {user.name.split(' ')[0]}</Text>
            <View style={styles.row}>
              <View style={[styles.dot, { backgroundColor: theme.warning }]} />
              <Text style={[styles.subtitle, { color: headerOnPrimaryMuted }]}>
                {headerSemesterStatus}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              onPress={() => router.push('/profile' as any)}
              style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.7 }]}
            >
              <ThemeIcon name="user" size={22} color={headerOnPrimary} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/settings' as any)}
              style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.7 }]}
            >
              <Feather name="settings" size={22} color={headerOnPrimary} />
            </Pressable>
          </View>
        </View>
        {/* Week peak alert – compact white box inside header */}
        <Pressable
          style={({ pressed }) => [styles.peakAlertBox, pressed && styles.pressed]}
          onPress={() => router.push('/stress-map' as any)}
        >
          <View style={styles.peakAlertTop}>
            <View style={styles.peakAlertLeft}>
              <Text style={styles.peakAlertWeek}>{pulseMainTitle}</Text>
              {semesterPhase === 'before_start' && user.startDate?.slice(0, 10)?.length === 10 ? (
                <Text style={styles.peakAlertSubline}>
                  {T('starts')} {formatDisplayDate(user.startDate.slice(0, 10))}
                </Text>
              ) : null}
              {semesterPhase === 'no_calendar' ? (
                <Text style={styles.peakAlertSubline}>{T('tapToSetCalendar')}</Text>
              ) : null}
              <Text style={styles.peakAlertLabel}>{T('semesterPulse')}</Text>
            </View>
            <View style={[styles.peakAlertBadge, semesterPhase !== 'teaching' && styles.peakAlertBadgeMuted]}>
              <Text
                style={[styles.peakAlertBadgeText, semesterPhase !== 'teaching' && styles.peakAlertBadgeTextMuted]}
                numberOfLines={semesterPhase === 'teaching' ? 1 : 3}
                adjustsFontSizeToFit
              >
                {pulseBadgeText}
              </Text>
            </View>
          </View>
          <View style={styles.peakAlertBottom}>
            <Text style={styles.peakAlertProgressLabel}>{T('progress')}</Text>
            <Text style={styles.peakAlertFinalLabel}>
              W{totalWeeks} {T('final')}
            </Text>
          </View>
          <View style={styles.peakAlertDots}>
            {Array.from({ length: totalWeeks }, (_, i) => {
              const weekNum = i + 1;
              let dotStyles: object[] = [styles.peakAlertDot];
              if (semesterPhase === 'teaching' && !user.isBreak) {
                const isCurrent = weekNum === user.currentWeek;
                const isTaskPeak = taskPeakMax > 0 && taskPeakWeek >= 1 && weekNum === taskPeakWeek;
                if (isCurrent) dotStyles.push(styles.peakAlertDotCurrent);
                else if (weekNum < user.currentWeek) dotStyles.push(styles.peakAlertDotPast);
                if (isTaskPeak && !isCurrent) dotStyles.push(styles.peakAlertDotPeak);
              } else if (semesterPhase === 'break_after' || user.isBreak) {
                dotStyles.push(styles.peakAlertDotPast);
              }
              return <View key={weekNum} style={dotStyles} />;
            })}
          </View>
        </Pressable>
      </View>

      {/* Today's focus */}
      <View style={[styles.sectionWrapper, styles.sectionWrapperFirst]}>
        <Text style={styles.sectionHeader}>{T('todaysFocus')}</Text>
        <Text style={styles.sectionSubcopy}>
          {focusCard ? 'Your most important next move, ready to open in one tap.' : 'No urgent items right now. Planner and study are in a good place.'}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.focusCard,
            pressed && styles.pressed,
          ]}
          onPress={() => {
            if (focusCard) {
              focusCard.onPress();
            } else {
              router.push('/(tabs)/planner' as any);
            }
          }}
        >
          {focusCard ? (
            <>
              <View style={styles.focusCardHeader}>
                <View style={styles.focusPillsRow}>
                  <View style={[styles.focusCoursePill, { backgroundColor: hexToRgba(focusCard.accentColor, 0.12), borderColor: hexToRgba(focusCard.accentColor, 0.16) }]}>
                    <Text
                      style={[
                        styles.focusCoursePillText,
                        {
                          color:
                            themeId === 'dark' || themeId === 'midnight' ? theme.text : focusCard.accentColor,
                        },
                      ]}
                    >
                      {focusCard.code}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.focusStatusPill,
                      {
                        backgroundColor: focusCard.badgeBackground,
                        borderColor: hexToRgba(focusCard.statusColor, 0.3),
                      },
                    ]}
                  >
                    <Text style={[styles.focusStatusPillText, { color: focusCard.statusColor }]}>
                      {focusCard.label}
                    </Text>
                  </View>
                </View>
                <View style={styles.focusArrowButton}>
                  <Feather name="arrow-up-right" size={17} color={theme.primary} />
                </View>
              </View>
              <Text style={styles.focusTitle} numberOfLines={2}>{focusCard.title}</Text>
              <Text style={styles.focusSupportText} numberOfLines={1}>
                {focusCard.subtitle}
              </Text>
              <View style={styles.focusMetaRow}>
                <View style={styles.focusMetaPill}>
                  <Feather name="calendar" size={13} color={theme.textSecondary} />
                  <Text style={styles.focusMetaText}>{formatDisplayDate(focusCard.date)}</Text>
                </View>
                <View style={styles.focusMetaPill}>
                  <Feather name="clock" size={13} color={theme.textSecondary} />
                  <Text style={styles.focusMetaText}>{(focusCard.time || '').slice(0, 5)}</Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.focusEmptyWrap}>
              <View style={styles.focusEmptyIcon}>
                <Feather name="sun" size={22} color={theme.primary} />
              </View>
              <Text style={styles.focusEmpty}>{T('noTasksToday')}</Text>
              <Text style={styles.focusEmptySub}>{T('youreAllSet')}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Friends Studying Widget */}
      {studyingFriends.length > 0 && (
        <Pressable
          style={({ pressed }) => [
            styles.studyingWidget,
            pressed && styles.pressed,
          ]}
          onPress={() => router.push('/study-timer' as any)}
        >
          <Text style={{ fontSize: 15, fontWeight: '800', color: theme.primary, flex: 1 }}>
            📚 {studyingFriends.length} friend{studyingFriends.length > 1 ? 's' : ''} studying now
          </Text>
          <Text style={{ fontSize: 13, color: '#3b82f6', fontWeight: '700' }}>Join →</Text>
        </Pressable>
      )}

      {/* Timeline / Upcoming */}
      <View style={styles.sectionWrapper}>
        <View style={styles.timelineHeader}>
          <View style={styles.timelineHeaderBody}>
            <Text style={styles.sectionHeader}>{T('upcoming')}</Text>
            <Text style={styles.sectionSubcopy}>A tighter view of your next deadlines and study windows.</Text>
          </View>
        </View>
        <View style={styles.upcomingPanel}>
          <View style={styles.upcomingLeadRow}>
            <View style={styles.upcomingLeadBadge}>
              <Text style={styles.upcomingLeadBadgeText}>{scheduleWithinMonth.length} items</Text>
            </View>
            <Pressable style={styles.upcomingSeeAllButton} onPress={() => router.push('/(tabs)/planner' as any)}>
              <Text style={styles.upcomingSeeAllText}>{T('seeAll')}</Text>
              <Feather name="arrow-right" size={14} color={theme.primary} />
            </Pressable>
          </View>
          {previewItems.length === 0 ? (
            <View style={styles.upcomingEmptyCard}>
              <View style={styles.upcomingEmptyIcon}>
                <Feather name="calendar" size={20} color={theme.primary} />
              </View>
              <Text style={styles.upcomingEmptyTitle}>{T('nothingIn30Days')}</Text>
              <Text style={styles.upcomingEmptySub}>New tasks and revision sessions will appear here automatically.</Text>
              <Pressable style={styles.upcomingEmptyButton} onPress={() => router.push('/(tabs)/planner' as any)}>
                <Text style={styles.upcomingEmptyButtonText}>{T('seeAll')}</Text>
              </Pressable>
            </View>
          ) : (
            previewItems.map((item, idx) => {
              const showDateHeader = idx === 0 || previewItems[idx - 1].date !== item.date;
              const isStudy = item.type === 'STUDY';
              const studyDone = isStudy && completedStudyKeys.includes((item as { studyKey?: string }).studyKey ?? '');
              let accent: string;
              if (isStudy) {
                // Study time: always dark grey accent, independent of urgency
                accent = '#4b5563';
              } else {
                // Tasks: color by how near the deadline is
                const days = getDaysLeft(item.date);
                if (days < 0 || days === 0) {
                  accent = '#dc2626'; // red – very near / overdue
                } else if (days <= 3) {
                  accent = '#eab308'; // yellow – medium near
                } else {
                  accent = '#22c55e'; // green – far
                }
              }
              return (
                <View key={`${item.type}-${item.date}-${item.time}-${idx}`}>
                  {showDateHeader && (
                    <View style={[styles.upcomingDateRow, idx > 0 && { marginTop: 18 }]}>
                      <View style={styles.upcomingDateChip}>
                        <Text style={styles.upcomingDateChipText}>{formatDateLabel(item.date)}</Text>
                      </View>
                    </View>
                  )}
                  <Pressable
                    style={({ pressed }) => [
                      styles.upcomingCard,
                      pressed && styles.pressed,
                    ]}
                    disabled={isStudy}
                    onPress={() => {
                      const taskId = (item as { taskId?: string }).taskId;
                      if (taskId) {
                        router.push({ pathname: '/task-details', params: { id: taskId } } as any);
                      }
                    }}
                  >
                    <View style={[styles.upcomingAccent, { backgroundColor: accent }]} />
                    <View style={styles.upcomingCardBody}>
                      <View style={styles.upcomingCardTop}>
                        <View style={styles.upcomingTimeWrap}>
                          <Feather name="clock" size={12} color={theme.textSecondary} />
                          <Text style={styles.upcomingTime}>{(item.time || '').slice(0, 5)}</Text>
                        </View>
                        {!isStudy ? <Feather name="chevron-right" size={18} color={theme.textSecondary} /> : null}
                      </View>
                      <Text style={[styles.upcomingTitle, studyDone && styles.upcomingTitleDone]} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <View style={styles.upcomingMetaRow}>
                        <View style={[styles.upcomingSubjectDot, { backgroundColor: accent }]} />
                        <Text style={styles.upcomingMetaText} numberOfLines={1}>{item.code}</Text>
                        <Text style={styles.upcomingMetaDivider}>•</Text>
                        <Text style={styles.upcomingMetaText} numberOfLines={1}>{item.room}</Text>
                      </View>
                    </View>
                  </Pressable>
                </View>
              );
            })
          )}
          {hiddenUpcomingCount > 0 ? (
            <Pressable style={styles.upcomingMoreRow} onPress={() => router.push('/(tabs)/planner' as any)}>
              <Text style={styles.upcomingMoreText}>+{hiddenUpcomingCount} more items in planner</Text>
              <Feather name="arrow-right" size={15} color={theme.primary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}
