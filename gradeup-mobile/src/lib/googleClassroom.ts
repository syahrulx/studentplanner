import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { upsertTask } from './taskDb';
import * as coursesDb from './coursesDb';
import type { Task, Course } from '../types';
import { getTodayISO } from '../utils/date';
import { TaskType, Priority } from '../types';
import {
  getClassroomToken,
  setClassroomToken,
  clearClassroomToken,
  getClassroomPrefs,
  setClassroomPrefs,
  type ClassroomPrefs,
} from '../storage';

const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
].join(' ');

WebBrowser.maybeCompleteAuthSession();

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

export async function getValidToken(): Promise<string | null> {
  const cached = await getClassroomToken();
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.provider_token) {
    await setClassroomToken({
      accessToken: session.provider_token,
      expiresAt: Date.now() + 3_600_000,
      refreshToken: session.provider_refresh_token || cached?.refreshToken,
    });
    return session.provider_token;
  }

  // Attempt to refresh the Supabase session which may yield a new provider_token
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.provider_token) {
      await setClassroomToken({
        accessToken: data.session.provider_token,
        expiresAt: Date.now() + 3_600_000,
        refreshToken: data.session.provider_refresh_token || cached?.refreshToken,
      });
      return data.session.provider_token;
    }
  } catch {}

  return null;
}

/**
 * Full browser-based OAuth flow. Only called when cached/session tokens are unavailable.
 */
export async function connectGoogleClassroom(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You must be logged in first.');

  const existing = await getValidToken();
  if (existing) return existing;

  const redirectUrl = Linking.createURL('/google-callback');
  const isLinked =
    session.user.app_metadata?.providers?.includes('google') ||
    session.user.identities?.some((id: any) => id.provider === 'google');

  // Only force consent on first link so we get a refresh token
  const queryParams: Record<string, string> = { access_type: 'offline' };
  if (!isLinked) queryParams.prompt = 'consent';

  const oauthOpts = { redirectTo: redirectUrl, queryParams, scopes: SCOPES };

  const { data, error } = isLinked
    ? await supabase.auth.signInWithOAuth({ provider: 'google', options: oauthOpts })
    : await supabase.auth.linkIdentity({ provider: 'google', options: oauthOpts });

  if (error) throw new Error('Failed to start Google login: ' + error.message);
  if (!data?.url) throw new Error('Failed to get authorization URL.');

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

  if (res.type !== 'success' || !res.url) {
    throw new Error(res.type === 'cancel' ? 'Sign-in was cancelled.' : 'Browser session was dismissed.');
  }

  const fragment = res.url.split('#')[1] || res.url.split('?')[1] || '';
  const providerToken = fragment.match(/provider_token=([^&]+)/)?.[1];
  const providerRefresh = fragment.match(/provider_refresh_token=([^&]+)/)?.[1];

  if (providerToken) {
    const decoded = decodeURIComponent(providerToken);
    await setClassroomToken({
      accessToken: decoded,
      expiresAt: Date.now() + 3_600_000,
      refreshToken: providerRefresh ? decodeURIComponent(providerRefresh) : undefined,
    });
    return decoded;
  }

  // Fallback: re-read session
  const { data: fresh } = await supabase.auth.getSession();
  if (fresh.session?.provider_token) {
    await setClassroomToken({
      accessToken: fresh.session.provider_token,
      expiresAt: Date.now() + 3_600_000,
      refreshToken: fresh.session.provider_refresh_token || undefined,
    });
    return fresh.session.provider_token;
  }

  throw new Error('Google sign-in succeeded but no Classroom token was returned.');
}

// ---------- Paginated Google API helper ----------

async function fetchPaginated<T>(url: string, token: string, key: string): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | undefined;
  let retries = 0;

  do {
    const fullUrl = pageToken
      ? `${url}${url.includes('?') ? '&' : '?'}pageToken=${pageToken}`
      : url;

    const res = await fetch(fullUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 429) {
      if (retries++ >= 3) throw new Error('Google API rate limit. Try again later.');
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retries)));
      continue;
    }

    if (res.status === 401) {
      await clearClassroomToken();
      throw new Error('Google token expired. Please reconnect.');
    }

    if (!res.ok) throw new Error(`Google API error (${res.status})`);

    const json = await res.json();
    items.push(...(json[key] || []));
    pageToken = json.nextPageToken;
    retries = 0;
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
      out.push({ ...c, courseWork: cw });
    } catch {
      out.push({ ...c, courseWork: [] });
    }
  }
  return out;
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
): Task | null {
  const type = mapWorkType(work.workType);
  if (!type) return null;

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
    priority: existing?.priority ?? Priority.Medium,
    effort: existing?.effort ?? 1,
    notes: work.description || `From Google Classroom: ${courseName}`,
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
      priority: r.priority as Priority,
      effort: Number(r.effort_hours ?? 0),
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

        const task = buildTask(w, course.name, existingTasks, semesterStart);
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

  const taskFilter = prefs.selectedTaskIds?.length ? prefs.selectedTaskIds : undefined;
  return syncSelectedCourses(prefs.selectedCourseIds, undefined, semesterStart, taskFilter);
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
      for (const w of work) {
        if (alreadySelected.has(w.id)) continue;
        if (dismissed.has(w.id)) continue;
        if (mapWorkType(w.workType) === null) continue;
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

/** Clear all Classroom data (token + preferences). */
export async function disconnectClassroom(): Promise<void> {
  await clearClassroomToken();
  await setClassroomPrefs(null);
}

/** Whether user has completed initial setup with selected courses. */
export async function isClassroomConnected(): Promise<boolean> {
  const prefs = await getClassroomPrefs();
  return prefs !== null && prefs.selectedCourseIds.length > 0;
}

export { getClassroomPrefs };
