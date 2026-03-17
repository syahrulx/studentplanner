import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeId } from '@/constants/Themes';
import type { Course } from '../types';

const KEY_HAS_SEEN_TUTORIAL = 'hasSeenTutorial';
const KEY_THEME = 'appTheme';
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

const validThemes: ThemeId[] = ['dark', 'light', 'minimal', 'modern', 'retro'];

export async function getTheme(): Promise<ThemeId> {
  try {
    const value = await AsyncStorage.getItem(KEY_THEME);
    if (value && validThemes.includes(value as ThemeId)) return value as ThemeId;
  } catch {}
  return 'light';
}

export async function setTheme(theme: ThemeId): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_THEME, theme);
  } catch {}
}

export type AppLanguage = 'en' | 'ms';
export type AppLoghat = 'negeriSembilan' | 'kelantan' | 'kedah' | 'melaka';

export async function getLanguage(): Promise<AppLanguage> {
  try {
    const value = await AsyncStorage.getItem(KEY_LANGUAGE);
    if (value === 'en' || value === 'ms') return value;
  } catch {}
  return 'en';
}

export async function setLanguage(lang: AppLanguage): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_LANGUAGE, lang);
  } catch {}
}

export async function getLoghat(): Promise<AppLoghat | null> {
  try {
    const value = await AsyncStorage.getItem(KEY_LOGHAT);
    if (value === 'negeriSembilan' || value === 'kelantan' || value === 'kedah' || value === 'melaka') {
      return value;
    }
  } catch {}
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

// Planner view (day | week | month | all)
const KEY_PLANNER_VIEW = 'plannerView';
const KEY_PLANNER_LAYOUT = 'plannerLayout';

export type PlannerViewMode = 'week' | 'month' | 'all';
export type PlannerLayoutMode = 'timeline' | 'grid';

export async function getPlannerView(): Promise<PlannerViewMode> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PLANNER_VIEW);
    if (raw === 'week' || raw === 'month' || raw === 'all') {
      return raw;
    }
  } catch {}
  return 'week';
}

export async function setPlannerView(view: PlannerViewMode): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PLANNER_VIEW, view);
  } catch {}
}

export async function getPlannerLayout(): Promise<PlannerLayoutMode> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PLANNER_LAYOUT);
    if (raw === 'timeline' || raw === 'grid') {
      return raw;
    }
  } catch {}
  return 'timeline';
}

export async function setPlannerLayout(layout: PlannerLayoutMode): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PLANNER_LAYOUT, layout);
  } catch {}
}
