import type { ThemeId, ThemePalette } from '@/constants/Themes';
import { THEMES, CAT_THEME_OVERRIDE, MONO_THEME_OVERRIDE, PURPLE_THEME_OVERRIDE, resolveSpiderTheme } from '@/constants/Themes';
import type { Course, DayOfWeek, Task, TimetableEntry } from '../types';
import { getTodayISO, isTaskPastDueNow } from '../utils/date';
import { compareTasksByDueDate, getDaysUntilTaskDue } from './taskUtils';
import { getRecommendedToday } from './studyRecommendations';
import type { RecommendationFeedback } from './recommendationDb';

const JS_TO_DAY: DayOfWeek[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export type HomeWidgetTaskRow = {
  id: string;
  title: string;
  subtitle: string;
  accent: 'overdue' | 'today' | 'default';
};

export type HomeWidgetClassRow = {
  startTime: string;
  endTime: string;
  label: string;
  location: string;
};

/** Snapshot of app theme colors for home-screen widgets (matches Profile → App theme). */
export type HomeWidgetTheme = {
  themeId: ThemeId;
  themePack?: string;
  background: string;
  backgroundSecondary: string;
  card: string;
  border: string;
  primary: string;
  text: string;
  textSecondary: string;
  danger: string;
  warning: string;
  focusCard?: string;
  focusCardText?: string;
};

/**
 * Progress on a task the user has broken into steps.
 *
 * The widget shows the *next* step rather than the parent: the whole point of
 * a breakdown is to surface one small action, and "Find references" is a far
 * more useful thing to see on a home screen than "Research paper".
 */
export type HomeWidgetBreakdown = {
  parentTitle: string;
  doneCount: number;
  totalCount: number;
  /** Null once every step is finished. */
  nextStepTitle: string | null;
  /** Short label for the next step's own date, e.g. "Today" or "Mon 25". */
  nextStepWhen: string | null;
};

/** Today's suggestion, mirroring the home hero card. */
export type HomeWidgetRecommendation = {
  title: string;
  summary: string;
};

export type HomeWidgetProps = {
  dateISO: string;
  greeting: string;
  signedIn: boolean;
  tasks: HomeWidgetTaskRow[];
  classes: HomeWidgetClassRow[];
  spiderWebImageUri?: string;
  theme: HomeWidgetTheme;
  /** Absent when nothing is broken down, or every step is done. */
  breakdown?: HomeWidgetBreakdown | null;
  /** Absent when there is nothing worth suggesting today. */
  recommendation?: HomeWidgetRecommendation | null;
};

export function homeWidgetThemeFromId(
  themeId: ThemeId, 
  themePack?: string, 
  spiderBlueAccents = true,
  customThemeColors?: import('../storage').CustomThemeColors | null
): HomeWidgetTheme {
  let t: ThemePalette = THEMES[themeId] ?? THEMES.light;
  if (themePack === 'cat') t = CAT_THEME_OVERRIDE;
  else if (themePack === 'mono') t = MONO_THEME_OVERRIDE;
  else if (themePack === 'spider') t = resolveSpiderTheme(spiderBlueAccents);
  else if (themePack === 'purple') t = PURPLE_THEME_OVERRIDE;
  else if (themePack === 'purple') t = PURPLE_THEME_OVERRIDE;

  // Pass through ALL theme colors directly so the widget fully mirrors
  // the user's chosen app theme — background, text, accents, everything.
  return {
    themeId: t.id,
    themePack,
    background: t.background,
    backgroundSecondary: t.backgroundSecondary,
    card: t.card,
    border: t.border,
    primary: t.primary,
    text: t.text,
    textSecondary: themePack === 'custom' && customThemeColors?.textSecondary ? customThemeColors.textSecondary : t.textSecondary,
    danger: t.danger,
    warning: t.warning,
    focusCard: themePack === 'custom' && customThemeColors?.focusCard ? customThemeColors.focusCard : (t as any).focusCard,
    focusCardText: themePack === 'custom' && customThemeColors?.focusCardText ? customThemeColors.focusCardText : (t as any).focusCardText,
  };
}

/** Use when widget receives an older snapshot without `theme`. */
export function resolveHomeWidgetTheme(props: Partial<HomeWidgetProps> | null | undefined): HomeWidgetTheme {
  const id = props?.theme?.themeId;
  const pack = props?.theme?.themePack;
  if (id && id in THEMES) return homeWidgetThemeFromId(id as ThemeId, pack, true);
  return homeWidgetThemeFromId('light', pack, true);
}

function timeSortKey(t: string): number {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0);
}

export function buildHomeWidgetProps(input: {
  tasks: Task[];
  timetable: TimetableEntry[];
  courses: Course[];
  pinnedTaskIds: string[];
  userName: string;
  signedIn: boolean;
  themeId: ThemeId;
  themePack?: string;
  spiderBlueAccents?: boolean;
  spiderWebImageUri?: string;
  todayISO?: string;
  maxTasks?: number;
  maxClasses?: number;
  customThemeColors?: import('../storage').CustomThemeColors | null;
  /**
   * Feedback on past suggestions. Without it a recommendation the user already
   * dismissed would keep showing on the home screen after it disappeared from
   * the app, so an absent list suppresses the widget's recommendation entirely
   * rather than risking that mismatch.
   */
  recommendationFeedback?: RecommendationFeedback[];
}): HomeWidgetProps {
  const todayISO = input.todayISO ?? getTodayISO();
  const maxTasks = input.maxTasks ?? 5;
  const maxClasses = input.maxClasses ?? 6;
  const theme = homeWidgetThemeFromId(input.themeId, input.themePack, input.spiderBlueAccents ?? true, input.customThemeColors);

  if (!input.signedIn) {
    return {
      dateISO: todayISO,
      greeting: 'Rencana',
      signedIn: false,
      tasks: [],
      classes: [],
      spiderWebImageUri: input.spiderWebImageUri,
      theme,
      breakdown: null,
      recommendation: null,
    };
  }

  const courseById = new Map(input.courses.map((c) => [c.id, c]));
  const pinned = new Set(input.pinnedTaskIds);
  const pending = input.tasks.filter((t) => !t.isDone);

  const scored = pending.map((task) => {
    const days = getDaysUntilTaskDue(task, todayISO);
    const overdue = !task.needsDate && isTaskPastDueNow(task);
    const bucket = overdue ? 0 : days === 0 ? 1 : days < 0 ? 0 : pinned.has(task.id) ? 2 : days === 1 ? 3 : 4;
    return { task, bucket, days };
  });

  scored.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    if (a.days < 0 && b.days < 0 && a.days !== b.days) return b.days - a.days;
    return compareTasksByDueDate(a.task, b.task);
  });

  const tasks: HomeWidgetTaskRow[] = scored.slice(0, maxTasks).map(({ task, days, bucket }) => {
    const course = courseById.get(task.courseId);
    const subtitle = (course?.name || task.courseId).trim().slice(0, 32);
    let accent: HomeWidgetTaskRow['accent'] = 'default';
    if (bucket === 0 || days < 0) accent = 'overdue';
    else if (days === 0) accent = 'today';
    return {
      id: task.id,
      title: task.title.trim().slice(0, 120),
      subtitle,
      accent,
    };
  });

  const dow = JS_TO_DAY[new Date(`${todayISO}T12:00:00`).getDay()];
  const dayClasses = input.timetable
    .filter((e) => e.day === dow)
    .sort((a, b) => timeSortKey(a.startTime) - timeSortKey(b.startTime));

  const classes: HomeWidgetClassRow[] = dayClasses.slice(0, maxClasses).map((e) => ({
    startTime: e.startTime.trim(),
    endTime: e.endTime.trim(),
    label: (e.displayName || e.subjectCode || e.subjectName || '').trim().slice(0, 28),
    location: (e.location || '').trim().slice(0, 24),
  }));

  const rawName = (input.userName || '').trim();
  const first = rawName.split(/\s+/)[0] || 'there';
  const greeting = `Hi, ${first}`;

  return {
    dateISO: todayISO,
    greeting,
    signedIn: true,
    tasks,
    classes,
    spiderWebImageUri: input.spiderWebImageUri,
    theme,
    breakdown: buildWidgetBreakdown(input.tasks, todayISO),
    recommendation: input.recommendationFeedback
      ? summariseRecommendation(input.tasks, input.recommendationFeedback, todayISO)
      : null,
  };
}

/**
 * The most urgent unfinished breakdown, reduced to what fits a widget.
 *
 * "Most urgent" is decided by the next unfinished step's date, not the
 * parent's deadline — the step is the thing being asked for today.
 */
function buildWidgetBreakdown(tasks: Task[], todayISO: string): HomeWidgetBreakdown | null {
  const stepsByParent = new Map<string, Task[]>();
  tasks.forEach((task) => {
    if (!task.parentTaskId) return;
    const siblings = stepsByParent.get(task.parentTaskId) ?? [];
    siblings.push(task);
    stepsByParent.set(task.parentTaskId, siblings);
  });
  if (stepsByParent.size === 0) return null;

  let best: { breakdown: HomeWidgetBreakdown; sortKey: string } | null = null;
  const pick = (candidate: { breakdown: HomeWidgetBreakdown; sortKey: string }) => {
    if (!best || candidate.sortKey < best.sortKey) best = candidate;
  };

  stepsByParent.forEach((steps, parentId) => {
    const parent = tasks.find((task) => task.id === parentId);
    if (!parent || parent.isDone) return;
    const ordered = [...steps].sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
    const nextStep = ordered.find((step) => !step.isDone);
    if (!nextStep) return; // Fully done: nothing left to nudge about.

    const breakdown: HomeWidgetBreakdown = {
      parentTitle: parent.title.trim().slice(0, 60),
      doneCount: ordered.filter((step) => step.isDone).length,
      totalCount: ordered.length,
      nextStepTitle: nextStep.title.trim().slice(0, 60),
      nextStepWhen: shortWhenLabel(nextStep.dueDate, todayISO),
    };
    pick({ breakdown, sortKey: (nextStep.dueDate ?? '').slice(0, 10) });
  });

  return best ? (best as { breakdown: HomeWidgetBreakdown }).breakdown : null;
}

/** "Today" / "Tomorrow" / "Mon 25" — short enough for a widget row. */
function shortWhenLabel(iso: string, todayISO: string): string | null {
  const clean = (iso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
  if (clean === todayISO) return 'Today';
  const date = new Date(`${clean}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date(`${todayISO}T12:00:00`);
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (days === 1) return 'Tomorrow';
  if (days < 0) return 'Overdue';
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${names[date.getDay()]} ${date.getDate()}`;
}

function summariseRecommendation(
  tasks: Task[],
  feedback: RecommendationFeedback[],
  todayISO: string,
): HomeWidgetRecommendation | null {
  const recommendation = getRecommendedToday({ tasks, feedback, today: todayISO });
  if (!recommendation) return null;
  return {
    title: recommendation.title.trim().slice(0, 60),
    summary: recommendation.summary.trim().slice(0, 140),
  };
}
