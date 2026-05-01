import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEME_IDS, type ThemeId } from '@/constants/Themes';
import type { Course } from './types';

const KEY_HAS_SEEN_TUTORIAL = 'hasSeenTutorial';
const KEY_HAS_SEEN_NON_UITM_TIMETABLE_INTRO = 'hasSeenNonUitmTimetableIntro';
const KEY_THEME = 'appTheme';
const KEY_THEME_PACK = 'appThemePack';
const KEY_SPIDER_BLUE_ACCENTS = 'spiderBlueAccents';
const KEY_LANGUAGE = 'appLanguage';
const KEY_LOGHAT = 'appLoghat';

export async function getHasSeenTutorial(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(KEY_HAS_SEEN_TUTORIAL);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setHasSeenTutorial(value: boolean): Promise<void> {
  try {
    if (value) {
      await AsyncStorage.setItem(KEY_HAS_SEEN_TUTORIAL, 'true');
    } else {
      await AsyncStorage.removeItem(KEY_HAS_SEEN_TUTORIAL);
    }
  } catch {}
}

export async function getHasSeenNonUitmTimetableIntro(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(KEY_HAS_SEEN_NON_UITM_TIMETABLE_INTRO);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setHasSeenNonUitmTimetableIntro(value: boolean): Promise<void> {
  try {
    if (value) {
      await AsyncStorage.setItem(KEY_HAS_SEEN_NON_UITM_TIMETABLE_INTRO, 'true');
    } else {
      await AsyncStorage.removeItem(KEY_HAS_SEEN_NON_UITM_TIMETABLE_INTRO);
    }
  } catch {}
}

/** Themes removed from the app — map to closest current option */
const LEGACY_THEME_MAP: Record<string, ThemeId> = {
  minimal: 'light',
  retro: 'light',
  modern: 'emerald',
};

export async function getTheme(): Promise<ThemeId> {
  try {
    const value = await AsyncStorage.getItem(KEY_THEME);
    if (!value) return 'light';
    if (THEME_IDS.includes(value as ThemeId)) return value as ThemeId;
    const migrated = LEGACY_THEME_MAP[value];
    if (migrated) {
      await setTheme(migrated);
      return migrated;
    }
  } catch {}
  return 'light';
}

export async function setTheme(theme: ThemeId): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_THEME, theme);
  } catch {}
}

export type ThemePackId = 'none' | 'cat' | 'mono' | 'spider' | 'purple';

export async function getThemePack(): Promise<ThemePackId> {
  try {
    const raw = await AsyncStorage.getItem(KEY_THEME_PACK);
    if (raw === 'cat') return 'cat';
    if (raw === 'mono') return 'mono';
    if (raw === 'spider') return 'spider';
    if (raw === 'purple') return 'purple';
  } catch {}
  return 'none';
}

export async function setThemePack(pack: ThemePackId): Promise<void> {
  try {
    if (pack === 'none') {
      await AsyncStorage.removeItem(KEY_THEME_PACK);
      return;
    }
    await AsyncStorage.setItem(KEY_THEME_PACK, pack);
  } catch {}
}

export async function getSpiderBlueAccents(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SPIDER_BLUE_ACCENTS);
    if (raw === 'false') return false;
  } catch {}
  return true;
}

export async function setSpiderBlueAccents(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_SPIDER_BLUE_ACCENTS, enabled ? 'true' : 'false');
  } catch {}
}

export type AppLanguage = 'en';
export type AppLoghat = 'negeriSembilan' | 'kelantan' | 'kedah' | 'melaka';

export async function getLanguage(): Promise<AppLanguage> {
  try { await AsyncStorage.removeItem(KEY_LANGUAGE); } catch {}
  return 'en';
}

export async function setLanguage(lang: AppLanguage): Promise<void> {
  try { await AsyncStorage.setItem(KEY_LANGUAGE, 'en'); } catch {}
}

export async function getLoghat(): Promise<AppLoghat | null> {
  try { await AsyncStorage.removeItem(KEY_LOGHAT); } catch {}
  return null;
}

export async function setLoghat(loghat: AppLoghat | null): Promise<void> {
  try {
    if (!loghat) {
      await AsyncStorage.removeItem(KEY_LOGHAT);
    } else {
      await AsyncStorage.setItem(KEY_LOGHAT, loghat);
    }
  } catch {}
}

// Revision / Study time
const KEY_REVISION = 'revisionSettings';

export type RevisionDay = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Every day';

export type RevisionRepeat = 'once' | 'repeated';

export interface RevisionSettings {
  id?: string; // from DB (study_times.id) when loaded
  enabled: boolean;
  time: string; // "HH:mm" 24h
  subjectId: string;
  day: RevisionDay;
  durationMinutes: number;
  topic: string;
  repeat: RevisionRepeat;
  singleDate?: string; // "YYYY-MM-DD" when repeat === 'once'
}

const DEFAULT_REVISION: RevisionSettings = {
  enabled: false,
  time: '20:00',
  subjectId: '',
  day: 'Every day',
  durationMinutes: 60,
  topic: '',
  repeat: 'repeated',
};

export async function getRevisionSettings(): Promise<RevisionSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY_REVISION);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RevisionSettings>;
      if (typeof parsed.enabled === 'boolean' && typeof parsed.time === 'string') {
        return {
          ...DEFAULT_REVISION,
          ...parsed,
          subjectId: typeof parsed.subjectId === 'string' ? parsed.subjectId : DEFAULT_REVISION.subjectId,
          day: parsed.day && ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Every day'].includes(parsed.day) ? parsed.day : DEFAULT_REVISION.day,
          durationMinutes: typeof parsed.durationMinutes === 'number' && [15,30,45,60,90].includes(parsed.durationMinutes) ? parsed.durationMinutes : DEFAULT_REVISION.durationMinutes,
          topic: typeof parsed.topic === 'string' ? parsed.topic : DEFAULT_REVISION.topic,
          repeat: parsed.repeat === 'once' || parsed.repeat === 'repeated' ? parsed.repeat : DEFAULT_REVISION.repeat,
          singleDate: typeof parsed.singleDate === 'string' ? parsed.singleDate : undefined,
        };
      }
    }
  } catch {}
  return DEFAULT_REVISION;
}

export async function setRevisionSettings(settings: RevisionSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_REVISION, JSON.stringify(settings));
  } catch {}
}

// Completed study sessions (keys like "YYYY-MM-DDTHH:mm") so user can mark study as done
const KEY_COMPLETED_STUDIES = 'completedStudyKeys';

export async function getCompletedStudyKeys(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_COMPLETED_STUDIES);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === 'string');
    }
  } catch {}
  return [];
}

export async function setCompletedStudyKeys(keys: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_COMPLETED_STUDIES, JSON.stringify(keys));
  } catch {}
}

// Pinned task IDs (max 2) – tasks stay at top of planner
const KEY_PINNED_TASKS = 'pinnedTaskIds';
const MAX_PINNED_TASKS = 2;

export async function getPinnedTaskIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PINNED_TASKS);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === 'string').slice(0, MAX_PINNED_TASKS);
    }
  } catch {}
  return [];
}

export async function setPinnedTaskIds(ids: string[]): Promise<void> {
  try {
    const trimmed = ids.slice(0, MAX_PINNED_TASKS);
    await AsyncStorage.setItem(KEY_PINNED_TASKS, JSON.stringify(trimmed));
  } catch {}
}

// Subject/course color mapping – user can assign a color per subject
const KEY_SUBJECT_COLORS = 'subjectColors';

export async function getSubjectColors(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SUBJECT_COLORS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof k === 'string' && typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v)) out[k] = v;
        }
        return out;
      }
    }
  } catch {}
  return {};
}

export async function setSubjectColors(colors: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_SUBJECT_COLORS, JSON.stringify(colors));
  } catch {}
}

// User-added courses/subjects (Study page)
const KEY_COURSES = 'userCourses';

function isCourse(c: unknown): c is Course {
  return (
    typeof c === 'object' &&
    c !== null &&
    'id' in c &&
    'name' in c &&
    typeof (c as Course).id === 'string' &&
    typeof (c as Course).name === 'string' &&
    typeof (c as Course).creditHours === 'number' &&
    Array.isArray((c as Course).workload)
  );
}

export async function getCourses(): Promise<Course[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_COURSES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const list = parsed.filter(isCourse);
        if (list.length > 0) return list;
      }
    }
  } catch {}
  return null;
}

export async function setCourses(courses: Course[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_COURSES, JSON.stringify(courses));
  } catch {}
}

// Planner view (week | month | all)
const KEY_PLANNER_VIEW = 'plannerView';

export type PlannerViewMode = 'day' | 'week' | 'month' | 'all';

export async function getPlannerView(): Promise<PlannerViewMode> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PLANNER_VIEW);
    if (raw === 'day' || raw === 'week' || raw === 'month' || raw === 'all') {
      return raw;
    }
  } catch {}
  return 'day';
}

export async function setPlannerView(view: PlannerViewMode): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PLANNER_VIEW, view);
  } catch {}
}

// ---------- Google Classroom sync ----------

const KEY_CLASSROOM_TOKEN = 'classroomToken';
const KEY_CLASSROOM_PREFS = 'classroomPrefs';

export interface ClassroomTokenCache {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}

export interface ClassroomPrefs {
  selectedCourseIds: string[];
  selectedTaskIds: string[];
  autoSync: boolean;
  lastSyncAt: number | null;
  dismissedNewTaskIds?: string[];
  /** When true, MATERIAL items import as generic tasks (readings). */
  includeClassroomMaterials?: boolean;
}

export async function getClassroomToken(): Promise<ClassroomTokenCache | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_CLASSROOM_TOKEN);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.accessToken && typeof parsed.expiresAt === 'number') return parsed;
    }
  } catch {}
  return null;
}

export async function setClassroomToken(token: ClassroomTokenCache): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_CLASSROOM_TOKEN, JSON.stringify(token));
  } catch {}
}

export async function clearClassroomToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_CLASSROOM_TOKEN);
  } catch {}
}

export async function getClassroomPrefs(): Promise<ClassroomPrefs | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_CLASSROOM_PREFS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.selectedCourseIds)) return parsed;
    }
  } catch {}
  return null;
}

export async function setClassroomPrefs(prefs: ClassroomPrefs | null): Promise<void> {
  try {
    if (!prefs) {
      await AsyncStorage.removeItem(KEY_CLASSROOM_PREFS);
    } else {
      await AsyncStorage.setItem(KEY_CLASSROOM_PREFS, JSON.stringify(prefs));
    }
  } catch {}
}

const KEY_HAS_DISMISSED_CLASSROOM_PROMO = 'hasDismissedClassroomPromo';

export async function getHasDismissedClassroomPromo(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(KEY_HAS_DISMISSED_CLASSROOM_PROMO);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setHasDismissedClassroomPromo(value: boolean): Promise<void> {
  try {
    if (value) {
      await AsyncStorage.setItem(KEY_HAS_DISMISSED_CLASSROOM_PROMO, 'true');
    } else {
      await AsyncStorage.removeItem(KEY_HAS_DISMISSED_CLASSROOM_PROMO);
    }
  } catch {}
}

// ---------- Notification preferences ----------

const KEY_NOTIFICATION_PREFS = 'notificationPrefs';

export interface NotificationPrefs {
  tasksEnabled: boolean;
  taskLeadDays: number[];
  /** One alert shortly after the due date and time if the task is still incomplete. */
  taskOverdueEnabled: boolean;
  studyTimerEnabled: boolean;
  classroomSyncEnabled: boolean;
  sharedTasksEnabled: boolean;
  /**
   * When true (default), the 5-minutes-before-class attendance check-in shows a
   * banner / sound / popup. When false, the notification is still scheduled and
   * delivered silently (no banner, no sound) — it remains visible inside the
   * in-app Notification Manager and the OS notification center, so the user can
   * still record their attendance from there. Only the popup is suppressed.
   */
  attendanceCheckinPopup: boolean;
  weeklySummaryEnabled: boolean;
  weeklySummaryDay: number;   // 0=Sun … 6=Sat
  weeklySummaryTime: string;  // "HH:mm"
  todaysFocusPref: 'all' | 'task' | 'study' | 'exam';
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  tasksEnabled: true,
  taskLeadDays: [3, 1, 0],
  taskOverdueEnabled: true,
  studyTimerEnabled: true,
  classroomSyncEnabled: true,
  sharedTasksEnabled: true,
  attendanceCheckinPopup: true,
  weeklySummaryEnabled: false,
  weeklySummaryDay: 0,
  weeklySummaryTime: '20:00',
  todaysFocusPref: 'all',
};

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY_NOTIFICATION_PREFS);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
      return {
        ...DEFAULT_NOTIFICATION_PREFS,
        ...parsed,
        taskLeadDays: Array.isArray(parsed.taskLeadDays)
          ? parsed.taskLeadDays.filter((n) => typeof n === 'number')
          : DEFAULT_NOTIFICATION_PREFS.taskLeadDays,
        taskOverdueEnabled:
          typeof parsed.taskOverdueEnabled === 'boolean'
            ? parsed.taskOverdueEnabled
            : DEFAULT_NOTIFICATION_PREFS.taskOverdueEnabled,
        attendanceCheckinPopup:
          typeof parsed.attendanceCheckinPopup === 'boolean'
            ? parsed.attendanceCheckinPopup
            : DEFAULT_NOTIFICATION_PREFS.attendanceCheckinPopup,
        todaysFocusPref:
          parsed.todaysFocusPref && ['all', 'task', 'study', 'exam'].includes(parsed.todaysFocusPref)
            ? parsed.todaysFocusPref
            : DEFAULT_NOTIFICATION_PREFS.todaysFocusPref,
      };
    }
  } catch {}
  return { ...DEFAULT_NOTIFICATION_PREFS };
}

export async function setNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_NOTIFICATION_PREFS, JSON.stringify(prefs));
  } catch {}
}

/**
 * Lightweight reader used by the global notification handler to decide whether
 * the 5-min-before-class popup should appear in the foreground. We deliberately
 * read the persisted blob directly so this stays a tiny synchronous-feeling
 * lookup that works even before the app's React tree has mounted.
 */
export async function getAttendanceCheckinPopupEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEY_NOTIFICATION_PREFS);
    if (!raw) return DEFAULT_NOTIFICATION_PREFS.attendanceCheckinPopup;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    if (typeof parsed.attendanceCheckinPopup === 'boolean') {
      return parsed.attendanceCheckinPopup;
    }
  } catch {}
  return DEFAULT_NOTIFICATION_PREFS.attendanceCheckinPopup;
}

// ---------- Timetable / week preferences ----------

/** First day of week for timetable / calendar-style views */
export type WeekStartsOn = 'monday' | 'sunday';

const KEY_WEEK_STARTS_ON = 'weekStartsOn';

export async function getWeekStartsOn(): Promise<WeekStartsOn> {
  try {
    const raw = await AsyncStorage.getItem(KEY_WEEK_STARTS_ON);
    if (raw === 'sunday' || raw === 'monday') return raw;
  } catch {}
  return 'monday';
}

export async function setWeekStartsOn(mode: WeekStartsOn): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_WEEK_STARTS_ON, mode);
  } catch {}
}

const KEY_AUTO_DELETE_PAST_TASKS = 'autoDeletePastTasks';

/** When true, tasks whose due date+time have passed are removed (planner + cloud). Default: false. */
export async function getAutoDeletePastTasks(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEY_AUTO_DELETE_PAST_TASKS);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {}
  return false;
}

export async function setAutoDeletePastTasks(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_AUTO_DELETE_PAST_TASKS, enabled ? 'true' : 'false');
  } catch {}
}

/** Timetable week grid / list: optional lines per class slot */
export type TimetableSlotDetailsVisibility = {
  /** When true, show full course name under the code; when false, code only (compact). Default false. */
  courseName: boolean;
  /**
   * When course name is off: if true, show all 7 day columns and scroll horizontally.
   * If false, fit first 5 days of the week on screen (no horizontal scroll).
   */
  scrollAllDaysInCompact: boolean;
  room: boolean;
  lecturer: boolean;
  group: boolean;
};

const KEY_TIMETABLE_SLOT_DETAILS = 'timetableSlotDetails';

const DEFAULT_TIMETABLE_SLOT_DETAILS: TimetableSlotDetailsVisibility = {
  courseName: false,
  scrollAllDaysInCompact: false,
  room: true,
  lecturer: true,
  group: true,
};

export async function getTimetableSlotDetailsVisibility(): Promise<TimetableSlotDetailsVisibility> {
  try {
    const raw = await AsyncStorage.getItem(KEY_TIMETABLE_SLOT_DETAILS);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TimetableSlotDetailsVisibility>;
      return {
        courseName:
          typeof parsed.courseName === 'boolean'
            ? parsed.courseName
            : DEFAULT_TIMETABLE_SLOT_DETAILS.courseName,
        scrollAllDaysInCompact:
          typeof parsed.scrollAllDaysInCompact === 'boolean'
            ? parsed.scrollAllDaysInCompact
            : DEFAULT_TIMETABLE_SLOT_DETAILS.scrollAllDaysInCompact,
        room: typeof parsed.room === 'boolean' ? parsed.room : DEFAULT_TIMETABLE_SLOT_DETAILS.room,
        lecturer: typeof parsed.lecturer === 'boolean' ? parsed.lecturer : DEFAULT_TIMETABLE_SLOT_DETAILS.lecturer,
        group: typeof parsed.group === 'boolean' ? parsed.group : DEFAULT_TIMETABLE_SLOT_DETAILS.group,
      };
    }
  } catch {}
  return { ...DEFAULT_TIMETABLE_SLOT_DETAILS };
}

export async function setTimetableSlotDetailsVisibility(
  v: TimetableSlotDetailsVisibility,
): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_TIMETABLE_SLOT_DETAILS, JSON.stringify(v));
  } catch {}
}
