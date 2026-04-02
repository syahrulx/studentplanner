import type { AcademicCalendar } from '../types';
import type { RevisionSettings } from '../storage';

type AcademicPeriod = NonNullable<AcademicCalendar['periods']>[number];

/**
 * Map a due date (YYYY-MM-DD) to teaching week 1..totalWeeks using 7-day blocks from semester start.
 * Same formula as the planner week strip: `Math.floor(diffDays / 7) + 1`.
 * Returns null if calendar is missing, dates invalid, or due date falls outside 1..totalWeeks.
 *
 * @param profileStartFallback — when calendar row has no `startDate`, use profile `user.startDate`
 *   so tasks still bucket into teaching weeks (same anchor as planner / progress).
 */
/**
 * Snap a date **back** to the Sunday that starts its visible Sun–Sat week.
 * Example: Mon 2026-03-30 → Sun 2026-03-29 (matches the planner strip).
 */
function snapToWeekSunday(d: Date): Date {
  const dow = d.getDay(); // 0=Sun, 1=Mon … 6=Sat
  if (dow === 0) return d;
  const snapped = new Date(d);
  snapped.setDate(snapped.getDate() - dow);
  return snapped;
}

export function dueDateToTeachingWeek(
  dueDateStr: string,
  calendar: AcademicCalendar | null | undefined,
  profileStartFallback?: string | null,
): number | null {
  const raw = dueDateToTeachingWeekRaw(dueDateStr, calendar, profileStartFallback);
  if (raw == null) return null;
  const totalWeeks = Math.max(1, calendar?.totalWeeks ?? 14);
  return Math.min(Math.max(raw, 1), totalWeeks);
}

/**
 * Same mapping as `dueDateToTeachingWeek` but WITHOUT clamping to calendar.totalWeeks.
 * Used to extend UI week ranges when tasks exist beyond the configured teaching-week count
 * (e.g. exam weeks 15/16).
 */
export function dueDateToTeachingWeekRaw(
  dueDateStr: string,
  calendar: AcademicCalendar | null | undefined,
  profileStartFallback?: string | null,
): number | null {
  // If detailed HEA-style periods exist, compute week by counting instructional/assessment weeks
  // (lecture + revision + test + exam), skipping breaks.
  if (calendar?.periods && Array.isArray(calendar.periods) && calendar.periods.length > 0) {
    const due = (dueDateStr || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
    const dueDate = new Date(`${due}T00:00:00`);
    if (Number.isNaN(dueDate.getTime())) return null;

    const countedTypes = new Set(['lecture', 'revision', 'test', 'exam']);
    const counted = calendar.periods.filter((p: AcademicPeriod) => countedTypes.has(p.type));
    if (counted.length === 0) return null;
    const start = counted.map((p) => p.startDate).sort()[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;

    // Snap start back to week-Sunday for UI alignment.
    const startDate = snapToWeekSunday(new Date(`${start}T00:00:00`));
    if (dueDate.getTime() < startDate.getTime()) return 1;

    // Build a set of "counted days" between start..due inclusive.
    const countedDays = new Set<string>();
    for (const p of counted) {
      const s = new Date(`${p.startDate}T00:00:00`);
      const e = new Date(`${p.endDate}T00:00:00`);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
      const cur = new Date(s);
      while (cur.getTime() <= e.getTime()) {
        countedDays.add(
          `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`,
        );
        cur.setDate(cur.getDate() + 1);
      }
    }

    // Count how many counted weeks (Sun–Sat blocks) have started up to this due date.
    // A week "counts" if it contains at least 1 counted day.
    let week = 1;
    let cursor = new Date(startDate);
    while (cursor.getTime() <= dueDate.getTime()) {
      const weekStart = new Date(cursor);
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 6);
      let hasLecture = false;
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (countedDays.has(key)) {
          hasLecture = true;
          break;
        }
      }
      if (cursor.getTime() === startDate.getTime()) {
        // Week 1 is always week 1; no-op
      } else if (hasLecture) {
        week += 1;
      }
      cursor.setDate(cursor.getDate() + 7);
    }
    return Math.max(week, 1);
  }

  const start = (calendar?.startDate ?? profileStartFallback ?? '').trim().slice(0, 10);
  const due = (dueDateStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  const startDate = snapToWeekSunday(new Date(`${start}T00:00:00`));
  const dueDate = new Date(`${due}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(dueDate.getTime())) return null;
  const diffDays = Math.floor((dueDate.getTime() - startDate.getTime()) / 864e5);
  const rawWeek = Math.floor(diffDays / 7) + 1;
  return Math.max(rawWeek, 1);
}

/**
 * Teaching week for pulse / stress / workload — **due date only**, exactly the same formula as the
 * planner week strip. `suggestedWeek` is intentionally ignored so the graph always matches what
 * the user sees in the planner.
 */
export function taskTeachingWeekForWorkload(
  task: { dueDate: string; suggestedWeek?: number },
  calendar: AcademicCalendar | null | undefined,
  profileStartFallback?: string | null,
): number | null {
  return dueDateToTeachingWeek(task.dueDate, calendar, profileStartFallback);
}

/**
 * Count tasks per teaching week (length = totalWeeks).
 * `open` — only incomplete (planner pressure). `all` — include done (semester workload shape / charts).
 */
export function taskCountsByDueWeek(
  tasks: { dueDate: string; isDone: boolean; suggestedWeek?: number }[],
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
    const w = taskTeachingWeekForWorkload(t, calendar, profileStartFallback);
    if (w != null) counts[w - 1] += 1;
  }
  return counts;
}

/** Count open (not done) tasks per teaching week; length = totalWeeks. */
export function taskCountsByOpenDueWeek(
  tasks: { dueDate: string; isDone: boolean; suggestedWeek?: number }[],
  calendar: AcademicCalendar | null | undefined,
  profileStartFallback?: string | null,
): number[] {
  return taskCountsByDueWeek(tasks, calendar, 'open', profileStartFallback);
}

/** YYYY-MM-DD for each calendar day in a 1-based teaching week (same 7-day blocks as due dates). */
function teachingWeekDateISOs(
  week1Based: number,
  calendar: AcademicCalendar | null | undefined,
  profileStartFallback?: string | null,
): string[] | null {
  const start = (calendar?.startDate ?? profileStartFallback ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const n = Math.max(1, calendar?.totalWeeks ?? 14);
  if (week1Based < 1 || week1Based > n) return null;
  const base = new Date(`${start}T12:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  const out: string[] = [];
  const off = (week1Based - 1) * 7;
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + off + i);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  }
  return out;
}

function revisionDayMatches(date: Date, day: RevisionSettings['day']): boolean {
  if (day === 'Every day') return true;
  const map: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const want = map[day];
  if (want === undefined) return false;
  return date.getDay() === want;
}

/**
 * Study / revision load per teaching week: sum of session length in **hours** (durationMinutes / 60)
 * for each occurrence that falls in that week. Once = one date; repeated = each matching weekday
 * in each teaching week (inclusive of "Every day").
 */
export function revisionStudyLoadByWeek(
  list: RevisionSettings[],
  calendar: AcademicCalendar | null | undefined,
  profileStartFallback?: string | null,
): number[] {
  const n = calendar?.totalWeeks ?? 14;
  const loads = Array.from({ length: n }, () => 0);
  const start = (calendar?.startDate ?? profileStartFallback ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return loads;

  for (const s of list) {
    if (!s?.enabled) continue;
    const hours = Math.max(0, Number(s.durationMinutes) || 0) / 60;

    if (s.repeat === 'once') {
      const d = (s.singleDate || '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const w = dueDateToTeachingWeek(d, calendar, profileStartFallback);
      if (w != null) loads[w - 1] += hours;
      continue;
    }

    for (let w = 1; w <= n; w++) {
      const dates = teachingWeekDateISOs(w, calendar, profileStartFallback);
      if (!dates) continue;
      for (const iso of dates) {
        const dt = new Date(`${iso}T12:00:00`);
        if (Number.isNaN(dt.getTime())) continue;
        if (!revisionDayMatches(dt, s.day)) continue;
        loads[w - 1] += hours;
      }
    }
  }
  return loads;
}

/** Sum of estimated task hours per teaching week (`effort` hours per task, minimum 1). */
export function taskEffortHoursByDueWeek(
  tasks: { dueDate: string; isDone: boolean; suggestedWeek?: number; effort?: number }[],
  calendar: AcademicCalendar | null | undefined,
  mode: 'open' | 'all' = 'all',
  profileStartFallback?: string | null,
): number[] {
  const n = calendar?.totalWeeks ?? 14;
  const sums = Array.from({ length: n }, () => 0);
  const start = (calendar?.startDate ?? profileStartFallback ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return sums;
  for (const t of tasks) {
    if (mode === 'open' && t.isDone) continue;
    const w = taskTeachingWeekForWorkload(t, calendar, profileStartFallback);
    if (w == null) continue;
    const h = Number(t.effort);
    sums[w - 1] += Number.isFinite(h) && h > 0 ? h : 1;
  }
  return sums;
}

/** Task estimated hours per week + revision/study hours per week (same length). */
export function combinedWorkloadByWeek(
  tasks: { dueDate: string; isDone: boolean; suggestedWeek?: number; effort?: number }[],
  revisions: RevisionSettings[],
  calendar: AcademicCalendar | null | undefined,
  taskMode: 'open' | 'all' = 'all',
  profileStartFallback?: string | null,
): number[] {
  const taskPart = taskEffortHoursByDueWeek(tasks, calendar, taskMode, profileStartFallback);
  const studyPart = revisionStudyLoadByWeek(revisions, calendar, profileStartFallback);
  return taskPart.map((c, i) => c + (studyPart[i] ?? 0));
}

/**
 * Workload velocity: **1 point per planner item** (any type: Assignment, Quiz, Lab, Project, Test).
 * Week = due-date teaching week vs academic calendar start (same as planner).
 */
export function workloadVelocityPointsByWeek(
  tasks: { dueDate: string; isDone: boolean; suggestedWeek?: number }[],
  calendar: AcademicCalendar | null | undefined,
  taskMode: 'open' | 'all' = 'all',
  profileStartFallback?: string | null,
): number[] {
  const n = calendar?.totalWeeks ?? 14;
  const points = Array.from({ length: n }, () => 0);
  const start = (calendar?.startDate ?? profileStartFallback ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return points;
  for (const t of tasks) {
    if (taskMode === 'open' && t.isDone) continue;
    const w = taskTeachingWeekForWorkload(t, calendar, profileStartFallback);
    if (w != null) points[w - 1] += 1;
  }
  return points;
}

/** 1-based week index with highest count; week 0 when there is no workload. Ties → latest week. */
export function peakWeekFromTaskCounts(counts: number[]): { week: number; max: number } {
  let max = 0;
  let idx = -1;
  counts.forEach((c, i) => {
    if (c > max || (c === max && c > 0 && (idx < 0 || i > idx))) {
      max = c;
      idx = i;
    }
  });
  if (max === 0) return { week: 0, max: 0 };
  return { week: idx + 1, max };
}
