import { supabase } from './supabase';
import { upsertTask } from './taskDb';
import * as coursesDb from './coursesDb';
import type { Task, Course } from '../types';
import { getTodayISO } from '../utils/date';
import { TaskType } from '../types';
import {
  getClassroomToken,
  setClassroomToken,
  clearClassroomToken,
  getClassroomPrefs,
  setClassroomPrefs,
} from '../storage';
import {
  exchangeCodeForTokens,
  refreshAccessToken,
  revokeToken,
  getGoogleClientIds,
  pickPlatformClientId,
} from './googleOauth';

/**
 * Google Classroom integration.
 *
 * Classroom authentication runs through a dedicated Google OAuth client
 * (see `googleOauth.ts`) and is completely decoupled from Supabase auth.
 * Connecting or disconnecting Classroom therefore never mutates the user's
 * Rencana login session, even when the Google account used for Classroom
 * differs from the one used to sign in to Rencana.
 */

// ---------- Types ----------

export interface GoogleCourse {
  id: string;
  name: string;
  section?: string;
  descriptionHeading?: string;
  courseState: string;
}

export interface GoogleCourseWork {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  workType: string;
  dueDate?: { year: number; month: number; day: number };
  dueTime?: { hours?: number; minutes?: number };
  alternateLink?: string;
}

export interface CourseWithWork extends GoogleCourse {
  courseWork: GoogleCourseWork[];
  /** True while assignments are loading in progressive UI */
  courseLoadPending?: boolean;
  /** Google coursework request failed (empty list may be error vs no work) */
  courseLoadError?: boolean;
}

export interface SyncResult {
  syncedCount: number;
  failedCount: number;
  errors: string[];
}

export interface PendingNewTask {
  workId: string;
  title: string;
  courseGoogleId: string;
  courseName: string;
  hasDueDate: boolean;
}

// ---------- Token management ----------

/**
 * Finalize the OAuth handshake started by the `useClassroomAuth` hook.
 * Exchanges the one-time auth code for access + refresh tokens and
 * persists them locally. Returns the fresh access token.
 */
export async function completeClassroomAuth(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
}): Promise<string> {
  const tok = await exchangeCodeForTokens(params);
  await setClassroomToken({
    accessToken: tok.accessToken,
    expiresAt: tok.expiresAt,
    refreshToken: tok.refreshToken,
  });
  return tok.accessToken;
}

/**
 * Return a valid Classroom access token, refreshing when expired.
 *
 * **iOS**: Uses the stored refresh token + our client ID (client-side refresh).
 * **Android**: No client-side refresh token available (Supabase's provider tokens
 *   are tied to Supabase's Google client). Instead, calls the `refresh-classroom-token`
 *   Edge Function which refreshes server-side using Supabase's stored credentials.
 *
 * Returns null when no stored token exists or all refresh attempts fail.
 */
export async function getValidToken(): Promise<string | null> {
  const cached = await getClassroomToken();
  if (!cached) return null;

  // Token still valid — use it
  if (cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  // ── Try client-side refresh (works on iOS with real refresh token) ──
  if (cached.refreshToken) {
    const clientId = pickPlatformClientId(getGoogleClientIds());
    if (clientId) {
      try {
        const tok = await refreshAccessToken({
          refreshToken: cached.refreshToken,
          clientId,
        });
        await setClassroomToken({
          accessToken: tok.accessToken,
          expiresAt: tok.expiresAt,
          refreshToken: tok.refreshToken ?? cached.refreshToken,
        });
        return tok.accessToken;
      } catch {
        /* fall through to server-side refresh */
      }
    }
  }

  // ── Try server-side refresh via Edge Function (Android) ──
  try {
    const freshToken = await refreshTokenViaEdgeFunction();
    if (freshToken) {
      await setClassroomToken({
        accessToken: freshToken.accessToken,
        expiresAt: freshToken.expiresAt,
        // No client-side refresh token — Edge Function handles it next time too
      });
      // Also update the saved provider tokens so useClassroomAuth stays fresh
      const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
      await AsyncStorage.setItem(
        'googleProviderTokens',
        JSON.stringify({
          accessToken: freshToken.accessToken,
          refreshToken: '',
          expiresAt: freshToken.expiresAt,
        }),
      );
      return freshToken.accessToken;
    }
  } catch {
    /* Edge Function not available or failed */
  }

  return null;
}

/**
 * Call the `refresh-classroom-token` Edge Function to get a fresh Google
 * access token. The Edge Function uses Supabase's stored Google refresh
 * token + client secret to refresh server-side.
 */
async function refreshTokenViaEdgeFunction(): Promise<{
  accessToken: string;
  expiresAt: number;
} | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const supabaseUrl = (await import('expo-constants')).default.expoConfig?.extra?.supabaseUrl;
    if (!supabaseUrl) return null;

    const res = await fetch(`${supabaseUrl}/functions/v1/refresh-classroom-token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) return null;

    const json = await res.json();
    if (!json.accessToken) return null;

    return {
      accessToken: json.accessToken,
      expiresAt: json.expiresAt || Date.now() + 3600000,
    };
  } catch {
    return null;
  }
}

// ---------- Paginated Google API helper ----------

async function fetchPaginated<T>(url: string, initialToken: string, key: string): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | undefined;
  let retries429 = 0;
  let authToken = initialToken;
  let did401Retry = false;

  do {
    const fullUrl = pageToken
      ? `${url}${url.includes('?') ? '&' : '?'}pageToken=${pageToken}`
      : url;

    const res = await fetch(fullUrl, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (res.status === 429) {
      if (retries429++ >= 3) {
        throw new Error('Google Classroom is busy. Please wait a minute and try again.');
      }
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retries429)));
      continue;
    }

    if (res.status === 401) {
      if (!did401Retry) {
        did401Retry = true;
        const cached = await getClassroomToken();
        const clientId = pickPlatformClientId(getGoogleClientIds());
        if (cached?.refreshToken && clientId) {
          try {
            const tok = await refreshAccessToken({
              refreshToken: cached.refreshToken,
              clientId,
            });
            await setClassroomToken({
              accessToken: tok.accessToken,
              expiresAt: tok.expiresAt,
              refreshToken: tok.refreshToken ?? cached.refreshToken,
            });
            authToken = tok.accessToken;
            retries429 = 0;
            continue;
          } catch {
            /* fall through to disconnect */
          }
        }
      }
      await clearClassroomToken();
      throw new Error('Google sign-in expired. Reconnect Google Classroom from Settings.');
    }

    if (!res.ok) throw new Error(`Google Classroom could not load data (code ${res.status}).`);

    const json = await res.json();
    items.push(...(json[key] || []));
    pageToken = json.nextPageToken;
    retries429 = 0;
  } while (pageToken);

  return items;
}

export async function fetchGoogleCourses(token: string): Promise<GoogleCourse[]> {
  return fetchPaginated(
    'https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE',
    token,
    'courses',
  );
}

export async function fetchCourseWork(token: string, courseId: string): Promise<GoogleCourseWork[]> {
  return fetchPaginated(
    `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork`,
    token,
    'courseWork',
  );
}

/** Fetch all active courses together with their coursework (for the selection screen). */
export async function fetchCoursesWithWork(token: string): Promise<CourseWithWork[]> {
  const courses = await fetchGoogleCourses(token);
  const out: CourseWithWork[] = [];
  for (const c of courses) {
    try {
      const cw = await fetchCourseWork(token, c.id);
      out.push({ ...c, courseWork: cw, courseLoadError: false });
    } catch {
      out.push({ ...c, courseWork: [], courseLoadError: true });
    }
  }
  return out;
}

const DEFAULT_COURSEWORK_CONCURRENCY = 4;

/**
 * Load courses first, then fetch coursework in parallel batches while calling onUpdate with the full list each time.
 */
export async function loadCoursesWithWorkProgressive(
  token: string,
  onUpdate: (courses: CourseWithWork[]) => void,
  concurrency: number = DEFAULT_COURSEWORK_CONCURRENCY,
): Promise<CourseWithWork[]> {
  const courseList = await fetchGoogleCourses(token);
  const results: CourseWithWork[] = courseList.map((c) => ({
    ...c,
    courseWork: [],
    courseLoadPending: true,
    courseLoadError: false,
  }));
  onUpdate([...results]);

  const conc = Math.max(1, Math.min(concurrency, courseList.length || 1));
  for (let batchStart = 0; batchStart < courseList.length; batchStart += conc) {
    const slice = courseList.slice(batchStart, batchStart + conc);
    await Promise.all(
      slice.map(async (c, j) => {
        const i = batchStart + j;
        try {
          const cw = await fetchCourseWork(token, c.id);
          results[i] = { ...c, courseWork: cw, courseLoadPending: false, courseLoadError: false };
        } catch {
          results[i] = { ...c, courseWork: [], courseLoadPending: false, courseLoadError: true };
        }
      }),
    );
    onUpdate([...results]);
  }

  return results;
}

// ---------- Task mapping ----------

function mapWorkType(wt: string): TaskType | null {
  switch (wt) {
    case 'ASSIGNMENT':
      return TaskType.Assignment;
    case 'SHORT_ANSWER_QUESTION':
    case 'MULTIPLE_CHOICE_QUESTION':
    case 'QUIZ':
      return TaskType.Quiz;
    case 'MATERIAL':
      return null;
    default:
      return TaskType.Assignment;
  }
}

/** Whether this coursework row can appear in the import picker. */
export function isSelectableClassroomWork(work: GoogleCourseWork, includeMaterials: boolean): boolean {
  if (mapWorkType(work.workType) !== null) return true;
  return Boolean(includeMaterials && work.workType === 'MATERIAL');
}

function deadlineRisk(dueDateStr: string): Task['deadlineRisk'] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr + 'T00:00:00');
  const days = Math.floor((due.getTime() - now.getTime()) / 86_400_000);
  return days <= 2 ? 'High' : days <= 7 ? 'Medium' : 'Low';
}

function suggestedWeek(dueDateStr: string, semesterStart?: string): number {
  const start = semesterStart ? new Date(semesterStart + 'T00:00:00') : new Date();
  start.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr + 'T00:00:00');
  return Math.max(1, Math.ceil((due.getTime() - start.getTime()) / (7 * 86_400_000)));
}

export function buildTask(
  work: GoogleCourseWork,
  courseName: string,
  existingTasks: Task[],
  semesterStart?: string,
  includeMaterials?: boolean,
): Task | null {
  let type = mapWorkType(work.workType);
  if (!type) {
    if (includeMaterials && work.workType === 'MATERIAL') {
      type = TaskType.Assignment;
    } else {
      return null;
    }
  }

  const taskId = `gc-${work.id}`;
  const existing = existingTasks.find(t => t.id === taskId);

  // If the user has already set a real date (needsDate is false), preserve it
  const existingHasRealDate = existing && !existing.needsDate;

  let dateStr: string;
  let timeStr: string;
  let taskNeedsDate: boolean;

  if (work.dueDate) {
    dateStr = `${work.dueDate.year}-${String(work.dueDate.month).padStart(2, '0')}-${String(work.dueDate.day).padStart(2, '0')}`;
    timeStr = '23:59';
    if (work.dueTime) {
      timeStr = `${String(work.dueTime.hours || 0).padStart(2, '0')}:${String(work.dueTime.minutes || 0).padStart(2, '0')}`;
    }
    taskNeedsDate = false;
  } else if (existingHasRealDate) {
    // User manually set a real date — keep their edit
    dateStr = existing!.dueDate;
    timeStr = existing!.dueTime;
    taskNeedsDate = false;
  } else {
    // No due date in Classroom — treat as today in memory; DB stores null + needs_date=true.
    dateStr = getTodayISO();
    timeStr = '23:59';
    taskNeedsDate = true;
  }

  return {
    id: taskId,
    title: work.title || 'Untitled Classroom Task',
    courseId: `gc-course-${work.courseId}`,
    type,
    dueDate: dateStr,
    dueTime: timeStr,
    notes:
      work.description ||
      (work.workType === 'MATERIAL'
        ? `Reading (Google Classroom): ${courseName}`
        : `From Google Classroom: ${courseName}`),
    isDone: existing?.isDone ?? false,
    deadlineRisk: deadlineRisk(taskNeedsDate ? new Date().toISOString().slice(0, 10) : dateStr),
    suggestedWeek: suggestedWeek(taskNeedsDate ? new Date().toISOString().slice(0, 10) : dateStr, semesterStart),
    sourceMessage: work.alternateLink,
    needsDate: taskNeedsDate,
  };
}

// ---------- Sync engine ----------

async function fetchExistingGcTasks(userId: string): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .like('id', 'gc-%');

  return (data || []).map((r: any): Task => {
    const id = String(r.id);
    const needsDate = Boolean(r.needs_date);
    const dueDate = needsDate ? getTodayISO() : String(r.due_date ?? getTodayISO());
    return {
      id,
      title: String(r.title ?? ''),
      courseId: String(r.course_id ?? ''),
      type: r.type as TaskType,
      dueDate,
      dueTime: String(r.due_time ?? ''),
      notes: String(r.notes ?? ''),
      isDone: Boolean(r.is_done),
      deadlineRisk: (r.deadline_risk ?? 'Medium') as Task['deadlineRisk'],
      suggestedWeek: Number(r.suggested_week ?? 0),
      sourceMessage: r.source_message ? String(r.source_message) : undefined,
      needsDate,
    };
  });
}

/** Sync selected Google Classroom courses into the tasks table.
 *  @param selectedTaskIds When provided (first-time import), only tasks whose Google
 *  coursework ID is in this list are saved. Omit (or pass undefined) for auto-sync
 *  which imports all coursework from the selected courses.
 */
export async function syncSelectedCourses(
  selectedCourseIds: string[],
  onProgress?: (courseName: string, current: number, total: number) => void,
  semesterStart?: string,
  selectedTaskIds?: string[],
): Promise<SyncResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not logged in');

  const token = await getValidToken();
  if (!token) throw new Error('Google token expired. Please reconnect Google Classroom.');

  const prefsMeta = await getClassroomPrefs();
  const includeMaterials = Boolean(prefsMeta?.includeClassroomMaterials);

  const taskIdFilter = selectedTaskIds ? new Set(selectedTaskIds) : null;

  const existingTasks = await fetchExistingGcTasks(user.id);
  const allCourses = await fetchGoogleCourses(token);
  const selected = allCourses.filter(c => selectedCourseIds.includes(c.id));

  let syncedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < selected.length; i++) {
    const course = selected[i];
    onProgress?.(course.name, i + 1, selected.length);

    const localCourse: Course = {
      id: `gc-course-${course.id}`,
      name: course.name,
      creditHours: 3,
      workload: [2, 3, 4, 6, 5, 7, 8, 4, 6, 8, 10, 9, 10, 4],
    };
    await coursesDb.addCourse(user.id, localCourse).catch(() => {});

    try {
      const work = await fetchCourseWork(token, course.id);
      for (const w of work) {
        if (taskIdFilter && !taskIdFilter.has(w.id)) continue;

        const task = buildTask(w, course.name, existingTasks, semesterStart, includeMaterials);
        if (!task) continue;

        const { error } = await upsertTask(user.id, task);
        if (error) {
          failedCount++;
          errors.push(`${w.title}: ${error.message}`);
        } else {
          syncedCount++;
        }
      }
    } catch (e: any) {
      errors.push(`${course.name}: ${e.message}`);
    }
  }

  const prefs = await getClassroomPrefs();
  if (prefs) {
    await setClassroomPrefs({ ...prefs, lastSyncAt: Date.now() });
  }

  return { syncedCount, failedCount, errors };
}

/** Silent auto-sync using saved preferences. Returns null if not configured. */
export async function autoSync(semesterStart?: string): Promise<SyncResult | null> {
  const prefs = await getClassroomPrefs();
  if (!prefs?.autoSync || prefs.selectedCourseIds.length === 0) return null;

  const token = await getValidToken();
  if (!token) return null;

  /** Always sync all coursework for selected courses so new assignments are picked up. */
  return syncSelectedCourses(prefs.selectedCourseIds, undefined, semesterStart, undefined);
}

/**
 * Check for tasks in the user's selected courses that haven't been imported yet
 * (i.e., not in selectedTaskIds and not previously dismissed).
 * Does NOT import anything — just returns the list so the caller can prompt the user.
 */
export async function checkForNewTasks(): Promise<PendingNewTask[]> {
  const prefs = await getClassroomPrefs();
  if (!prefs || prefs.selectedCourseIds.length === 0) return [];

  const token = await getValidToken();
  if (!token) return [];

  const alreadySelected = new Set(prefs.selectedTaskIds ?? []);
  const dismissed = new Set(prefs.dismissedNewTaskIds ?? []);

  let allCourses: GoogleCourse[];
  try {
    allCourses = await fetchGoogleCourses(token);
  } catch {
    return [];
  }

  const courseMap = new Map(allCourses.map(c => [c.id, c.name]));
  const result: PendingNewTask[] = [];

  for (const courseId of prefs.selectedCourseIds) {
    try {
      const work = await fetchCourseWork(token, courseId);
      const courseName = courseMap.get(courseId) ?? courseId;
      const includeMaterials = Boolean(prefs.includeClassroomMaterials);
      for (const w of work) {
        if (alreadySelected.has(w.id)) continue;
        if (dismissed.has(w.id)) continue;
        if (!isSelectableClassroomWork(w, includeMaterials)) continue;
        result.push({
          workId: w.id,
          title: w.title || 'Untitled',
          courseGoogleId: courseId,
          courseName,
          hasDueDate: !!w.dueDate,
        });
      }
    } catch {}
  }

  return result;
}

/**
 * Clear all Classroom data (token + preferences). Best-effort revokes the
 * Google grant so the next connect triggers a fresh consent screen.
 */
export async function disconnectClassroom(): Promise<void> {
  const cached = await getClassroomToken();
  const tokenToRevoke = cached?.refreshToken || cached?.accessToken;
  if (tokenToRevoke) {
    await revokeToken(tokenToRevoke);
  }
  await clearClassroomToken();
  await setClassroomPrefs(null);

  // Also clear saved provider tokens (Android direct-token flow)
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem('googleProviderTokens');
  } catch {}
}

/** Whether user has completed initial setup with selected courses. */
export async function isClassroomConnected(): Promise<boolean> {
  const prefs = await getClassroomPrefs();
  return prefs !== null && prefs.selectedCourseIds.length > 0;
}

export { getClassroomPrefs };
