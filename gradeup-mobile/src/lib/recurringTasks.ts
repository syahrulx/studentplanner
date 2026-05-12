/**
 * Helpers for working with recurring ("Repeat") tasks.
 *
 * A task is "recurring" when its `repeatDays` array is non-empty. The values
 * are Postgres DOW integers (0=Sun..6=Sat). When a task is recurring, its
 * stored `dueDate` is a placeholder (today at creation time) and should NOT
 * be used for filtering or display — use `taskOccursOn` instead.
 */

import type { Task } from '../types';

export function isRecurringTask(task: Pick<Task, 'repeatDays'>): boolean {
  return Array.isArray(task.repeatDays) && task.repeatDays.length > 0;
}

/** Convert "YYYY-MM-DD" to a JS day-of-week (0=Sun..6=Sat) at noon local time. */
function dowFromISO(dateISO: string): number | null {
  const d = new Date(`${dateISO.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.getDay();
}

/** True if `task` occurs on the calendar date `dateISO`. */
export function taskOccursOn(task: Pick<Task, 'dueDate' | 'repeatDays'>, dateISO: string): boolean {
  const day = dateISO.slice(0, 10);
  if (isRecurringTask(task)) {
    const dow = dowFromISO(day);
    if (dow == null) return false;
    return (task.repeatDays ?? []).includes(dow);
  }
  return task.dueDate === day;
}

/**
 * Expand a list of tasks into virtual occurrences for `dateISO`. Recurring
 * tasks get a fresh shallow copy with `dueDate` rewritten to `dateISO` so
 * downstream UI can treat each occurrence like a one-off task. Non-recurring
 * tasks that happen to match the date are passed through unchanged.
 */
export function expandTasksForDate(tasks: Task[], dateISO: string): Task[] {
  const day = dateISO.slice(0, 10);
  const dow = dowFromISO(day);
  const out: Task[] = [];
  for (const t of tasks) {
    if (isRecurringTask(t)) {
      if (dow != null && (t.repeatDays ?? []).includes(dow)) {
        out.push({ ...t, dueDate: day });
      }
    } else if (t.dueDate === day) {
      out.push(t);
    }
  }
  return out;
}

/**
 * Expand all recurring tasks across a date range into virtual one-off rows.
 * Useful for week / month / "all upcoming" planner views. Range is inclusive
 * of both endpoints. Order is preserved per date.
 */
export function expandTasksForRange(tasks: Task[], startISO: string, endISO: string): Task[] {
  const start = new Date(`${startISO.slice(0, 10)}T12:00:00`);
  const end = new Date(`${endISO.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const out: Task[] = [];
  const oneOffByDate = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!isRecurringTask(t)) {
      const arr = oneOffByDate.get(t.dueDate) ?? [];
      arr.push(t);
      oneOffByDate.set(t.dueDate, arr);
    }
  }
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const dow = cursor.getDay();
    for (const t of tasks) {
      if (isRecurringTask(t) && (t.repeatDays ?? []).includes(dow)) {
        out.push({ ...t, dueDate: iso });
      }
    }
    for (const t of oneOffByDate.get(iso) ?? []) out.push(t);
  }
  return out;
}
