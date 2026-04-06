import type { SemesterPhase } from '@/src/types';
import type { AcademicCalendar } from '@/src/types';

export type AcademicProgress = {
  week: number;
  isBreak: boolean;
  label: string;
  semesterPhase: SemesterPhase;
};

type AcademicPeriod = NonNullable<AcademicCalendar['periods']>[number];

/** Default floor when `total_weeks` is missing (typical semester length). */
export const MIN_DEFAULT_TEACHING_WEEKS = 14;
/**
 * If `computeCountedWeeksFromPeriods` exceeds the calendar’s stored `total_weeks` (floored) by more than this,
 * keep stored — HEA day-counting can otherwise jump to ~25 while the real term is ~14–16.
 */
export const MAX_PERIOD_WEEKS_OVER_STORED = 6;
/** Pulse / planner may extend this many weeks past the calendar baseline for open tasks (finals, SOW due dates). */
export const MAX_EXTRA_WEEKS_BEYOND_CALENDAR = 2;

/**
 * Single number to persist as `academic_calendars.total_weeks`: stored value, optionally nudged up by
 * period math only when the bump is small enough to be plausible.
 */
export function mergeTeachingWeeksForStoredCalendar(cal: AcademicCalendar | null | undefined): number {
  if (!cal) return MIN_DEFAULT_TEACHING_WEEKS;
  const storedNum = Number(cal.totalWeeks);
  const baseline = Math.max(
    MIN_DEFAULT_TEACHING_WEEKS,
    Number.isFinite(storedNum) && storedNum >= 1 ? Math.floor(storedNum) : MIN_DEFAULT_TEACHING_WEEKS,
  );
  if (!cal.periods || !Array.isArray(cal.periods) || cal.periods.length === 0) return baseline;
  const computed = computeCountedWeeksFromPeriods(cal.periods as AcademicPeriod[]);
  if (computed == null) return baseline;
  if (computed <= baseline + MAX_PERIOD_WEEKS_OVER_STORED) {
    return Math.max(baseline, computed);
  }
  return baseline;
}

function snapToWeekSunday(d: Date): Date {
  const dow = d.getDay(); // 0=Sun
  if (dow === 0) return d;
  const snapped = new Date(d);
  snapped.setDate(snapped.getDate() - dow);
  return snapped;
}

function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Compute how many "counted weeks" exist in a HEA-style calendar.
 * A week (Sun–Sat) counts if it contains at least 1 day from the counted period types.
 * Break weeks are naturally skipped because they have no counted days.
 */
export function computeCountedWeeksFromPeriods(
  periods: AcademicPeriod[] | null | undefined,
  countedTypes: Set<string> = new Set(['lecture', 'revision', 'test', 'exam']),
): number | null {
  if (!periods || !Array.isArray(periods) || periods.length === 0) return null;
  const counted = periods.filter((p) => countedTypes.has(p.type));
  if (counted.length === 0) return null;

  const countedDays = new Set<string>();
  let earliest = '';
  let latest = '';
  for (const p of counted) {
    const s = (p.startDate || '').slice(0, 10);
    const e = (p.endDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) continue;
    const cur = new Date(`${s}T00:00:00`);
    const end = new Date(`${e}T00:00:00`);
    if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime())) continue;
    while (cur.getTime() <= end.getTime()) {
      const k = iso(cur);
      countedDays.add(k);
      if (!earliest || k < earliest) earliest = k;
      if (!latest || k > latest) latest = k;
      cur.setDate(cur.getDate() + 1);
    }
  }
  if (countedDays.size === 0 || !earliest || !latest) return null;

  const startSunday = snapToWeekSunday(new Date(`${earliest}T00:00:00`));
  startSunday.setHours(0, 0, 0, 0);
  const last = new Date(`${latest}T00:00:00`);
  last.setHours(0, 0, 0, 0);

  let weeks = 0;
  const cursor = new Date(startSunday);
  for (let guard = 0; guard < 120 && cursor.getTime() <= last.getTime(); guard++) {
    let hasCounted = false;
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      d.setDate(d.getDate() + i);
      if (countedDays.has(iso(d))) {
        hasCounted = true;
        break;
      }
    }
    if (hasCounted) weeks += 1;
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks > 0 ? weeks : null;
}

/**
 * Current position in the academic semester from a start date and total teaching weeks.
 * - no_calendar: missing/invalid start date
 * - before_start: today is before semester start
 * - teaching: within weeks 1..totalWeeks
 * - break_after: today is after the last teaching week (semester break / between semesters)
 */
export function getAcademicProgress(startDateStr: string, totalWeeks: number = 14): AcademicProgress {
  const trimmed = (startDateStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return {
      week: 1,
      isBreak: false,
      label: 'Set academic calendar',
      semesterPhase: 'no_calendar',
    };
  }

  // Snap back to the Sunday that starts the visible Sun–Sat week.
  const raw = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(raw.getTime())) {
    return {
      week: 1,
      isBreak: false,
      label: 'Set academic calendar',
      semesterPhase: 'no_calendar',
    };
  }
  const dow = raw.getDay();
  const startDate = dow === 0 ? raw : new Date(raw.getFullYear(), raw.getMonth(), raw.getDate() - dow);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const diffTime = now.getTime() - startDate.getTime();
  const weeksDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7)) + 1;

  if (weeksDiff < 1) {
    return {
      week: 1,
      isBreak: false,
      label: 'Before semester',
      semesterPhase: 'before_start',
    };
  }

  if (weeksDiff > totalWeeks) {
    return {
      week: totalWeeks,
      isBreak: true,
      label: 'Semester break',
      semesterPhase: 'break_after',
    };
  }

  return {
    week: weeksDiff,
    isBreak: false,
    label: `Week ${weeksDiff}`,
    semesterPhase: 'teaching',
  };
}

/**
 * Academic progress computed from a detailed calendar (when available).
 * Teaching week increments only on weeks that contain at least one "lecture" day.
 */
export function getAcademicProgressFromCalendar(
  calendar: AcademicCalendar | null | undefined,
  profileStartFallback?: string,
): AcademicProgress {
  const totalWeeks = Math.max(
    1,
    calendar?.totalWeeks ??
      computeCountedWeeksFromPeriods(calendar?.periods as any) ??
      14,
  );
  const periods = calendar?.periods;
  if (!periods || !Array.isArray(periods) || periods.length === 0) {
    return getAcademicProgress(calendar?.startDate ?? profileStartFallback ?? '', totalWeeks);
  }
  const countedTypes = new Set(['lecture', 'revision', 'test', 'exam']);
  const counted = periods.filter((p) => countedTypes.has(p.type));
  if (counted.length === 0) {
    return getAcademicProgress(calendar?.startDate ?? profileStartFallback ?? '', totalWeeks);
  }

  const startISO = counted.map((p) => p.startDate).sort()[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startISO)) {
    return getAcademicProgress(calendar?.startDate ?? profileStartFallback ?? '', totalWeeks);
  }

  // Snap back to the Sunday that starts the visible Sun–Sat week (planner alignment).
  const raw = new Date(`${startISO}T00:00:00`);
  const dow = raw.getDay();
  const startDate = dow === 0 ? raw : new Date(raw.getFullYear(), raw.getMonth(), raw.getDate() - dow);
  startDate.setHours(0, 0, 0, 0);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (now.getTime() < startDate.getTime()) {
    return { week: 1, isBreak: false, label: 'Before semester', semesterPhase: 'before_start' };
  }

  // Build counted day set.
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

  let week = 1;
  let cursor = new Date(startDate);
  while (cursor.getTime() <= now.getTime()) {
    if (cursor.getTime() !== startDate.getTime()) {
      let hasLecture = false;
      for (let i = 0; i < 7; i++) {
        const d = new Date(cursor);
        d.setDate(d.getDate() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (countedDays.has(key)) {
          hasLecture = true;
          break;
        }
      }
      if (hasLecture) week += 1;
    }
    cursor.setDate(cursor.getDate() + 7);
  }

  if (week > totalWeeks) {
    return { week: totalWeeks, isBreak: true, label: 'Semester break', semesterPhase: 'break_after' };
  }
  return { week, isBreak: false, label: `Week ${week}`, semesterPhase: 'teaching' };
}
