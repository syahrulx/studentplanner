import type { SupabaseClient } from '@supabase/supabase-js';
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

export async function getCourses(supabase: SupabaseClient, userId: string): Promise<Course[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('subject_id', { ascending: true });

  if (error) return [];
  return (data ?? []).map((row) => rowToCourse(row as Record<string, unknown>));
}

export function courseNameById(courses: Course[], courseId: string): string {
  return courses.find((c) => c.id === courseId)?.name ?? (courseId || "General");
}
