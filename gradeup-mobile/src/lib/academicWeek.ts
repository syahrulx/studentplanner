import type { AcademicCalendar } from '../types';

/**
 * Map a due date (YYYY-MM-DD) to teaching week 1..totalWeeks using the same
 * week boundaries as {@link getAcademicProgress} (7-day blocks from semester start).
 * Returns null if calendar is missing, dates invalid, or due date falls outside 1..totalWeeks.
 */
/**
 * @param profileStartFallback — when calendar row has no `startDate`, use profile `user.startDate`
 *   so tasks still bucket into teaching weeks (same anchor as planner / progress).
 */
export function dueDateToTeachingWeek(
  dueDateStr: string,
  calendar: AcademicCalendar | null | undefined,
  profileStartFallback?: string | null,
): number | null {
  const start = (calendar?.startDate ?? profileStartFallback ?? '').trim().slice(0, 10);
  const due = (dueDateStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  const startDate = new Date(`${start}T00:00:00`);
  const dueDate = new Date(`${due}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(dueDate.getTime())) return null;
  const totalWeeks = Math.max(1, calendar?.totalWeeks ?? 14);
  const diffMs = dueDate.getTime() - startDate.getTime();
  const week = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  if (week < 1 || week > totalWeeks) return null;
  return week;
}

/**
 * Count tasks per teaching week (length = totalWeeks).
 * `open` — only incomplete (planner pressure). `all` — include done (semester workload shape / charts).
 */
export function taskCountsByDueWeek(
  tasks: { dueDate: string; isDone: boolean }[],
  calendar: AcademicCalendar | null | undefined,
  mode: 'open' | 'all' = 'open',
  profileStartFallback?: string | null,
): number[] {
  const n = calendar?.totalWeeks ?? 14;
  const counts = Array.from({ length: n }, () => 0);
  const start = (calendar?.startDate ?? profileStartFallback ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return counts;
  for (const t of tasks) {
    if (mode === 'open' && t.isDone) continue;
    const w = dueDateToTeachingWeek(t.dueDate, calendar, profileStartFallback);
    if (w != null) counts[w - 1] += 1;
  }
  return counts;
}

/** Count open (not done) tasks per teaching week; length = totalWeeks. */
export function taskCountsByOpenDueWeek(
  tasks: { dueDate: string; isDone: boolean }[],
  calendar: AcademicCalendar | null | undefined,
  profileStartFallback?: string | null,
): number[] {
  return taskCountsByDueWeek(tasks, calendar, 'open', profileStartFallback);
}

/** 1-based week index with highest count; week 0 when there is no workload. */
export function peakWeekFromTaskCounts(counts: number[]): { week: number; max: number } {
  let max = 0;
  let idx = 0;
  counts.forEach((c, i) => {
    if (c > max) {
      max = c;
      idx = i;
    }
  });
  if (max === 0) return { week: 0, max: 0 };
  return { week: idx + 1, max };
}
