import { supabase } from './supabase';
import type { Course } from '../types';

const TABLE = 'user_courses';

const DEFAULT_WORKLOAD = [2, 3, 4, 6, 5, 7, 8, 4, 6, 8, 10, 9, 10, 4];

function rowToCourse(row: Record<string, unknown>): Course {
  const workloadRaw = row.workload;
  let workload: number[] = DEFAULT_WORKLOAD;
  if (Array.isArray(workloadRaw)) {
    workload = workloadRaw.map((n) => Number(n) || 0).slice(0, 14);
    if (workload.length < 14) {
      workload = [...workload, ...DEFAULT_WORKLOAD.slice(workload.length)];
    }
  }
  return {
    id: String(row.subject_id ?? ''),
    name: String(row.name ?? ''),
    creditHours: Number(row.credit_hours ?? 3) || 3,
    workload,
    sortOrder: Number(row.sort_order ?? 0) || 0,
  };
}

export async function getCourses(userId: string): Promise<Course[]> {
  let { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('subject_id', { ascending: true });

  // `sort_order` is an additive column (202607270004_user_course_display_order).
  // If the build reaches users before that migration is applied, PostgREST
  // rejects the WHOLE query and we would return [] — which AppContext writes
  // straight into state, silently wiping every subject the user has, on every
  // launch. Retry without the ordering so the courses still load.
  // Same staged-rollout guard as studyDb.ts's `note_type` handling.
  if (error && /sort_order/i.test(error.message ?? '')) {
    const legacy = await supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('subject_id', { ascending: true });
    data = legacy.data;
    error = legacy.error;
  }

  if (error) {
    // Never fail silently here: an empty array overwrites real user data.
    console.warn('[coursesDb] getCourses failed:', error);
    return [];
  }
  return (data ?? []).map((row) => rowToCourse(row as Record<string, unknown>));
}

export async function addCourse(
  userId: string,
  course: Course
): Promise<{ error: { message: string; code?: string } | null }> {
  const base = {
    user_id: userId,
    subject_id: course.id,
    name: course.name,
    credit_hours: course.creditHours,
    workload: course.workload,
  };
  let { error } = await supabase.from(TABLE).upsert(
    { ...base, sort_order: course.sortOrder ?? 2147483647 },
    { onConflict: 'user_id,subject_id' }
  );
  // See getCourses: keep adding subjects working if the additive sort_order
  // migration hasn't reached this database yet.
  if (error && /sort_order/i.test(error.message ?? '')) {
    const legacy = await supabase.from(TABLE).upsert(base, { onConflict: 'user_id,subject_id' });
    error = legacy.error;
  }
  return { error: error ? { message: error.message, code: error.code } : null };
}

export async function updateCourse(userId: string, course: Course): Promise<void> {
  const base: Record<string, unknown> = {
    name: course.name,
    credit_hours: course.creditHours,
    workload: course.workload,
  };
  const updates: Record<string, unknown> = { ...base };
  if (course.sortOrder != null) updates.sort_order = course.sortOrder;
  const { error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('user_id', userId)
    .eq('subject_id', course.id);
  if (error && /sort_order/i.test(error.message ?? '')) {
    await supabase.from(TABLE).update(base).eq('user_id', userId).eq('subject_id', course.id);
  }
}

export async function deleteCourse(userId: string, subjectId: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('subject_id', subjectId);
  if (error) throw new Error(error.message || 'Failed to delete subject');
}

export async function deleteAllCoursesForUser(userId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId);
  if (error) throw new Error(error.message || 'Failed to delete subjects');
}
