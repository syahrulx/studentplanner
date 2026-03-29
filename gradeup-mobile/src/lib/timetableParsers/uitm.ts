import { FunctionsHttpError } from '@supabase/functions-js';
import type { TimetableEntry } from '../../types';
import { supabase } from '../supabase';

/**
 * UiTM MyStudent timetable fetcher.
 *
 * Edge function signs in with Firebase using the same email domain as
 * https://mystudent.uitm.edu.my/ ({matric}@mystudent.uitm.edu.my), then loads
 * the official CDN timetable JSON.
 */

function messageFromUnknownBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  if (typeof o.error === 'string') return o.error;
  if (o.error && typeof o.error === 'object' && typeof (o.error as { message?: string }).message === 'string') {
    return (o.error as { message: string }).message;
  }
  if (typeof o.message === 'string') return o.message;
  return null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

async function invokeFetchTimetable(body: Record<string, unknown>): Promise<unknown> {
  const headers = await authHeaders();
  const { data, error, response } = await supabase.functions.invoke('fetch_timetable', {
    body,
    headers,
  });

  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const raw = await res.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    const fromJson = messageFromUnknownBody(parsed);
    const msg =
      fromJson ||
      (raw && raw.length > 0 && raw.length < 400 ? raw : null) ||
      `Timetable service error (HTTP ${res.status}). Try again or check that fetch_timetable is deployed.`;
    throw new Error(msg);
  }

  if (error) {
    throw new Error(error.message || 'Failed to reach timetable service');
  }

  if (response && !response.ok) {
    const fromJson = messageFromUnknownBody(data);
    throw new Error(fromJson || `Timetable service error (HTTP ${response.status})`);
  }

  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    throw new Error(String((data as { error: string }).error));
  }

  return data;
}

/**
 * @param emailOrMatric - Full student email (e.g. …@mystudent.uitm.edu.my) or matric only
 */
export type MyStudentProfilePayload = {
  matric: string;
  fullName?: string;
  program?: string;
  part?: number;
  campus?: string;
  faculty?: string;
  studyMode?: string;
  semester?: number;
  personalEmail?: string;
};

/** Maps Edge `profile` into `profileDb.updateProfile` / AppContext `updateProfile` fields. */
export function profileUpdatesFromMyStudentPayload(
  p: MyStudentProfilePayload | null | undefined,
  fallbackMatric?: string,
): {
  name?: string;
  studentId?: string;
  program?: string;
  part?: number;
  campus?: string;
  faculty?: string;
  studyMode?: string;
  currentSemester?: number;
  mystudentEmail?: string;
} {
  const matric = (p?.matric || fallbackMatric || '').trim();
  if (!matric) return {};
  const part =
    p?.part != null && p.part > 0
      ? p.part
      : p?.semester != null && p.semester > 0 && p.semester < 20
        ? p.semester
        : undefined;
  return {
    studentId: matric,
    ...(p?.fullName?.trim() ? { name: p.fullName.trim() } : {}),
    ...(p?.program?.trim() ? { program: p.program.trim() } : {}),
    ...(part != null ? { part } : {}),
    ...(p?.campus?.trim() ? { campus: p.campus.trim() } : {}),
    ...(p?.faculty?.trim() ? { faculty: p.faculty.trim() } : {}),
    ...(p?.studyMode?.trim() ? { studyMode: p.studyMode.trim() } : {}),
    ...(p?.semester != null && p.semester > 0 ? { currentSemester: p.semester } : {}),
    ...(p?.personalEmail?.trim() ? { mystudentEmail: p.personalEmail.trim() } : {}),
  };
}

export async function fetchUitmTimetable(
  emailOrMatric: string,
  password: string,
  courses?: string[],
): Promise<{
  entries: TimetableEntry[];
  coursesFound: string[];
  campus?: string;
  matric?: string;
  profile?: MyStudentProfilePayload;
}> {
  const data = (await invokeFetchTimetable({
    email: emailOrMatric.trim(),
    password,
    courses: courses && courses.length > 0 ? courses : undefined,
  })) as {
    entries?: unknown[];
    courses_found?: string[];
    campus?: string;
    matric?: string;
    profile?: MyStudentProfilePayload;
  };

  const entries: TimetableEntry[] = (data?.entries || []).map((e: any) => ({
    id: e.id || `uitm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    day: e.day,
    subjectCode: e.subjectCode || e.subject_code || '',
    subjectName: e.subjectName || e.subject_name || e.subjectCode || '',
    lecturer: e.lecturer || '-',
    startTime: e.startTime || e.start_time || '',
    endTime: e.endTime || e.end_time || '',
    location: e.location || '-',
    group: e.group || undefined,
  }));

  return {
    entries,
    coursesFound: data?.courses_found || [],
    campus: data?.campus,
    matric: data?.matric,
    profile: data?.profile,
  };
}

/** Sign in to MyStudent and return CDN profile only (no timetable fetch). */
export async function fetchUitmProfileOnly(
  emailOrMatric: string,
  password: string,
): Promise<MyStudentProfilePayload> {
  const data = (await invokeFetchTimetable({
    email: emailOrMatric.trim(),
    password,
    profileOnly: true,
  })) as { profile?: MyStudentProfilePayload; ok?: boolean };
  const profile = data?.profile;
  if (!profile?.matric) {
    throw new Error('Could not load your MyStudent profile. Check email/matric and password.');
  }
  return profile;
}

/** Matric for storing in profile — from email local-part or raw matric. */
export function matricFromStudentLoginInput(input: string): string {
  const t = input.trim();
  if (!t) return t;
  const at = t.indexOf('@');
  return at === -1 ? t : t.slice(0, at);
}
