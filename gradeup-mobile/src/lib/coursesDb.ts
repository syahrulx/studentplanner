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
  };
}

export async function getCourses(userId: string): Promise<Course[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('subject_id', { ascending: true });

  if (error) return [];
  return (data ?? []).map((row) => rowToCourse(row as Record<string, unknown>));
}

export async function addCourse(
  userId: string,
  course: Course
): Promise<{ error: { message: string; code?: string } | null }> {
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      subject_id: course.id,
      name: course.name,
      credit_hours: course.creditHours,
      workload: course.workload,
    },
    { onConflict: 'user_id,subject_id' }
  );
  return { error: error ? { message: error.message, code: error.code } : null };
}

export async function updateCourse(userId: string, course: Course): Promise<void> {
  await supabase
    .from(TABLE)
    .update({
      name: course.name,
      credit_hours: course.creditHours,
      workload: course.workload,
    })
    .eq('user_id', userId)
    .eq('subject_id', course.id);
}

export async function deleteCourse(userId: string, subjectId: string): Promise<void> {
  await supabase.from(TABLE).delete().eq('user_id', userId).eq('subject_id', subjectId);
}

export async function deleteAllCoursesForUser(userId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId);
  if (error) throw new Error(error.message || 'Failed to delete subjects');
}
