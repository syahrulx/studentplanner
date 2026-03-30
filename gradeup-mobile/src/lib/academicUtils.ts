import type { SemesterPhase } from '@/src/types';

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

  // Snap forward to the next Sunday so week boundaries match the planner's Sun–Sat view.
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
  const startDate = dow === 0 ? raw : new Date(raw.getFullYear(), raw.getMonth(), raw.getDate() + (7 - dow));

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
