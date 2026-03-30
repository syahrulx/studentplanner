import type { SemesterPhase } from '@/src/types';
import type { AcademicCalendar } from '@/src/types';

export type AcademicProgress = {
  week: number;
  isBreak: boolean;
  label: string;
  semesterPhase: SemesterPhase;
};

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
  const totalWeeks = Math.max(1, calendar?.totalWeeks ?? 14);
  const periods = calendar?.periods;
  if (!periods || !Array.isArray(periods) || periods.length === 0) {
    return getAcademicProgress(calendar?.startDate ?? profileStartFallback ?? '', totalWeeks);
  }
  const lectures = periods.filter((p) => p.type === 'lecture');
  if (lectures.length === 0) {
    return getAcademicProgress(calendar?.startDate ?? profileStartFallback ?? '', totalWeeks);
  }

  const startISO = lectures.map((p) => p.startDate).sort()[0];
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

  // Build lecture day set.
  const lectureDays = new Set<string>();
  for (const p of lectures) {
    const s = new Date(`${p.startDate}T00:00:00`);
    const e = new Date(`${p.endDate}T00:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
    const cur = new Date(s);
    while (cur.getTime() <= e.getTime()) {
      lectureDays.add(
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
        if (lectureDays.has(key)) {
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
