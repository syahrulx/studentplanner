import { getTodayISO } from '@/src/utils/date';
import type { SemesterPhase } from '@/src/types';

function diffCalendarDays(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO.slice(0, 10)}T12:00:00`);
  const to = new Date(`${toISO.slice(0, 10)}T12:00:00`);
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

/** Map a due date to 1-based semester week; same rule as planner (week 1 = first 7 days from start). */
export function deriveSemesterWeekForDueDate(
  dueDateISO: string,
  semesterStartISO: string,
  totalWeeks: number
): { week: number; beforeSemester: boolean; afterSemester: boolean; inSemester: boolean } {
  const due = dueDateISO.slice(0, 10);
  const start = semesterStartISO.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return { week: 1, beforeSemester: false, afterSemester: false, inSemester: true };
  }
  const d = diffCalendarDays(start, due);
  if (d < 0) {
    return { week: 0, beforeSemester: true, afterSemester: false, inSemester: false };
  }
  const week = Math.ceil((d + 1) / 7);
  if (week > totalWeeks) {
    return { week, beforeSemester: false, afterSemester: true, inSemester: false };
  }
  return { week, beforeSemester: false, afterSemester: false, inSemester: true };
}

export type SowWeekAlignmentTask = {
  title: string;
  due_date: string;
  suggested_week?: number;
};

export type SowWeekAlignmentResult = {
  hasIssues: boolean;
  needsCalendarSetup: boolean;
  affectedWeeks: number[];
  message: string;
};

/**
 * Compares SOW task due dates (and optional AI suggested_week) to the user's academic calendar.
 * Used before save / Semester Pulse so users see when PDF dates don't line up with their semester.
 */
export function analyzeSowWeekAlignment(
  tasks: SowWeekAlignmentTask[],
  ctx: {
    semesterStart: string;
    totalWeeks: number;
    currentWeek: number;
    isBreak?: boolean;
    todayISO?: string;
    semesterPhase?: SemesterPhase;
  }
): SowWeekAlignmentResult {
  const { semesterStart, totalWeeks, currentWeek, isBreak } = ctx;
  const phase = ctx.semesterPhase ?? 'teaching';
  const todayISO = ctx.todayISO ?? getTodayISO();
  const affected = new Set<number>();
  const lines: string[] = [];

  const startOk = semesterStart && /^\d{4}-\d{2}-\d{2}$/.test(semesterStart.slice(0, 10));
  if (!startOk) {
    return {
      hasIssues: true,
      needsCalendarSetup: true,
      affectedWeeks: [],
      message:
        'Set your semester start (and length) under Profile → Academic Calendar or Stress Map. Without it, Semester Pulse cannot check whether this SOW matches your real weeks.',
    };
  }

  let pulseLine: string;
  if (phase === 'no_calendar') {
    pulseLine = `Semester Pulse: academic calendar not fully set. Today is ${todayISO}.\n\n`;
  } else if (phase === 'before_start') {
    pulseLine = `Semester Pulse: teaching has not started yet (semester begins ${semesterStart.slice(0, 10)}). Today is ${todayISO}.\n\n`;
  } else if (phase === 'break_after' || isBreak) {
    pulseLine = `Semester Pulse: semester break or between semesters (after week ${totalWeeks}). Today is ${todayISO}.\n\n`;
  } else {
    pulseLine = `Semester Pulse: you are in week ${currentWeek} of ${totalWeeks}. Today is ${todayISO}.\n\n`;
  }

  const beforeTitles: string[] = [];
  const afterLines: string[] = [];
  const driftLines: string[] = [];

  for (const t of tasks) {
    const title = (t.title || '').trim() || 'Task';
    const due = (t.due_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;

    const derived = deriveSemesterWeekForDueDate(due, semesterStart, totalWeeks);
    if (derived.beforeSemester) {
      beforeTitles.push(`• ${title} (${due})`);
      affected.add(0);
    } else if (derived.afterSemester) {
      afterLines.push(`• ${title} — due ${due} → week ${derived.week} (past your ${totalWeeks}-week semester)`);
      affected.add(derived.week);
    }

    const sw = t.suggested_week;
    if (typeof sw === 'number' && sw > 0 && derived.inSemester && Math.abs(sw - derived.week) >= 2) {
      driftLines.push(`• ${title}: document implied week ${sw}, but ${due} falls in week ${derived.week} on your calendar`);
      affected.add(sw);
      affected.add(derived.week);
    }
  }

  if (beforeTitles.length) {
    lines.push(
      `Due before semester start (${semesterStart.slice(0, 10)}):\n${beforeTitles.slice(0, 6).join('\n')}${
        beforeTitles.length > 6 ? `\n… +${beforeTitles.length - 6} more` : ''
      }`
    );
  }
  if (afterLines.length) {
    lines.push(
      `Outside your teaching weeks (1–${totalWeeks}):\n${afterLines.slice(0, 6).join('\n')}${
        afterLines.length > 6 ? `\n… +${afterLines.length - 6} more` : ''
      }`
    );
  }
  if (driftLines.length) {
    lines.push(
      `Week numbers in the file don’t match your calendar dates:\n${driftLines.slice(0, 5).join('\n')}${
        driftLines.length > 5 ? `\n… +${driftLines.length - 5} more` : ''
      }`
    );
  }

  const affectedWeeks = [...affected].filter((n) => n > 0).sort((a, b) => a - b);
  const weeksSummary =
    affectedWeeks.length > 0
      ? `\n\nAffected semester weeks (from this SOW): ${affectedWeeks.join(', ')}.`
      : beforeTitles.length > 0
        ? '\n\nSome items fall before week 1.'
        : '';

  const body = lines.join('\n\n');
  const message = pulseLine + body + weeksSummary;

  return {
    hasIssues: lines.length > 0,
    needsCalendarSetup: false,
    affectedWeeks,
    message: message.trim(),
  };
}
