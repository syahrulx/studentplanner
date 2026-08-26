import type { AcademicPeriod } from '../types';

/**
 * Guards for crowdsourced calendar submissions. A published calendar is applied by other
 * students at the same university, so a half-filled timeline silently breaks their planner:
 * the month grid only draws days covered by a period, and teaching weeks are counted from
 * `lecture` periods only.
 *
 * The failure this protects against was real — a UKM submission listed lectures up to the
 * mid-semester break and then jumped straight to the final exams, leaving nine weeks blank
 * for every student who applied it.
 */

/**
 * Longest allowed hole between two consecutive entries. Real calendars run back-to-back
 * (registration → lectures → break → lectures → revision → exams); anything longer than
 * three weeks means a block was missed rather than genuinely empty.
 */
export const MAX_TIMELINE_GAP_DAYS = 21;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseISO(value: unknown): Date | null {
  const iso = String(value ?? '').trim().slice(0, 10);
  if (!ISO_DATE.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 864e5);
}

function formatDate(iso: string): string {
  return String(iso ?? '').slice(0, 10);
}

function toISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Human-readable problems with a submitted timeline; empty array means it is publishable.
 * Messages are shown to the student verbatim, so each one says what to fix.
 */
export function validateCalendarTimeline(input: {
  periods: unknown;
  startDate: string;
  endDate: string;
}): string[] {
  const problems: string[] = [];

  if (!Array.isArray(input.periods) || input.periods.length === 0) {
    return [
      'This calendar has no timeline. Upload the official calendar PDF or image so the dates can be extracted — a calendar without lecture, break and exam dates cannot show anything in the planner.',
    ];
  }

  const entries: Array<{ period: AcademicPeriod; start: Date; end: Date }> = [];
  const holidays: Array<{ period: AcademicPeriod; start: Date; end: Date }> = [];
  input.periods.forEach((raw, index) => {
    const period = raw as Partial<AcademicPeriod> | null;
    const label = String(period?.label ?? '').trim() || `Entry ${index + 1}`;
    const start = parseISO(period?.startDate);
    const end = parseISO(period?.endDate);
    if (!String(period?.type ?? '').trim()) {
      problems.push(`"${label}" has no type (lecture, break, exam, …).`);
      return;
    }
    if (!start || !end) {
      problems.push(`"${label}" needs valid start and end dates in YYYY-MM-DD format.`);
      return;
    }
    if (start.getTime() > end.getTime()) {
      problems.push(`"${label}" ends before it starts.`);
      return;
    }
    // A public holiday is a marker inside whatever block surrounds it, not coverage of its own.
    // Counting them here let a scattered handful mask a real hole: a missing ten-week lecture
    // block read as three sub-threshold gaps because Hari Kebangsaan, Hari Malaysia and Deepavali
    // happened to fall inside it, and the figure disagreed with the bar drawn from the same data.
    if (String(period?.type) === 'holiday') {
      holidays.push({ period: period as AcademicPeriod, start, end });
      return;
    }
    entries.push({ period: period as AcademicPeriod, start, end });
  });

  if (problems.length > 0) return problems;

  if (entries.length === 0) {
    return [
      'This calendar only lists public holidays. Add the lecture, break and exam dates so the planner has a semester to work from.',
    ];
  }

  entries.sort((a, b) => a.start.getTime() - b.start.getTime());

  const hasLecture = entries.some((e) => String(e.period.type) === 'lecture');
  if (!hasLecture) {
    problems.push(
      'The timeline has no lecture period. Teaching weeks are counted from lecture dates, so the planner cannot work without at least one.',
    );
  }

  // Track the furthest end seen so far rather than the previous entry's end: holidays nested
  // inside a lecture block are normal and must not read as a gap.
  let coveredUntil = entries[0].end;
  for (let i = 1; i < entries.length; i++) {
    const current = entries[i];
    const gap = daysBetween(coveredUntil, current.start) - 1;
    if (gap > MAX_TIMELINE_GAP_DAYS) {
      problems.push(
        `${gap} days are missing between ${toISO(coveredUntil)} and ${formatDate(current.period.startDate)}. A block of the semester (usually the lectures after the mid-semester break) was not captured — check the official calendar and add it.`,
      );
    }
    if (current.end.getTime() > coveredUntil.getTime()) coveredUntil = current.end;
  }

  const endDate = parseISO(input.endDate);
  if (endDate && coveredUntil.getTime() < endDate.getTime()) {
    problems.push(
      `The timeline stops on ${toISO(coveredUntil)} but the semester runs to ${formatDate(input.endDate)}. Add the missing dates, or correct the semester end date.`,
    );
  }

  return problems;
}
