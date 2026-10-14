// Compare-only check: does a UiTM community calendar submission match UiTM's
// official HEA calendar? Shown to the admin as a hint. It never approves or
// rejects anything. Uses the same HEA parser as the app (vendor/uitm, kept in
// sync by scripts/sync-uitm-hea-parser.mjs).
import { getUitmHeaPage, type UitmCalendarContributionRow } from './api';
import { parseUitmAcademicCalendar } from '../vendor/uitm/uitmHeaParser';

/** Dates within this many days count as the same. */
const TOLERANCE_DAYS = 3;

export type HeaCheck =
  | { kind: 'match'; heaLabel: string; heaStart: string; heaEnd: string }
  | { kind: 'differs'; heaLabel: string; heaStart: string; heaEnd: string; startDiff: number; endDiff: number }
  | { kind: 'not_on_hea' }
  | { kind: 'unavailable'; reason: string };

export type HeaPage = { html: string; fetchedAt: string; stale: boolean };

export async function loadHeaPage(refresh = false): Promise<HeaPage> {
  const res = await getUitmHeaPage(refresh);
  if (!res?.html) throw new Error('HEA page was empty');
  return { html: res.html, fetchedAt: res.fetched_at, stale: Boolean(res.stale) };
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

// Parts of the semester itself (not the break or registration after it).
const TERM_TYPES = new Set(['lecture', 'test', 'revision', 'exam']);

export function compareWithHea(row: UitmCalendarContributionRow, page: HeaPage): HeaCheck {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(row.end_date)) {
    return { kind: 'unavailable', reason: 'submission has no clear dates' };
  }
  let hea;
  try {
    hea = parseUitmAcademicCalendar(page.html, row.group_code, {
      targetDateISO: row.start_date,
      preferredTermCode: row.term_code ?? undefined,
      variant: row.calendar_variant,
    });
  } catch (e) {
    return { kind: 'unavailable', reason: e instanceof Error ? e.message : 'could not read HEA' };
  }
  if (!hea?.startDate || !hea.endDate) return { kind: 'not_on_hea' };

  // HEA's endDate is the last lecture day. A student's calendar usually runs to
  // the end of exams, so use the last lecture/revision/exam day as the term end.
  // The semester break and registration notices after it are not counted.
  let heaEnd = hea.endDate;
  for (const p of hea.periods ?? []) {
    if (TERM_TYPES.has(p.type) && p.endDate > heaEnd) heaEnd = p.endDate;
  }
  const overlaps = row.start_date <= heaEnd && row.end_date >= hea.startDate;
  if (!overlaps) return { kind: 'not_on_hea' };

  const startDiff = dayDiff(row.start_date, hea.startDate);
  // Accept either end: last lecture day or end of exams.
  const endDiffExam = dayDiff(row.end_date, heaEnd);
  const endDiffLecture = dayDiff(row.end_date, hea.endDate);
  const endDiff = Math.abs(endDiffLecture) < Math.abs(endDiffExam) ? endDiffLecture : endDiffExam;
  const heaLabel = hea.semesterLabel || 'HEA semester';
  if (Math.abs(startDiff) <= TOLERANCE_DAYS && Math.abs(endDiff) <= TOLERANCE_DAYS) {
    return { kind: 'match', heaLabel, heaStart: hea.startDate, heaEnd };
  }
  return { kind: 'differs', heaLabel, heaStart: hea.startDate, heaEnd, startDiff, endDiff };
}

/** Short plain-words text for one result. */
export function describeHeaCheck(c: HeaCheck): string {
  const days = (n: number) => `${n > 0 ? '+' : ''}${n} day${Math.abs(n) === 1 ? '' : 's'}`;
  switch (c.kind) {
    case 'match':
      return `Same as HEA (${c.heaStart} to ${c.heaEnd}).`;
    case 'differs': {
      const parts: string[] = [];
      if (Math.abs(c.startDiff) > TOLERANCE_DAYS) parts.push(`start ${days(c.startDiff)}`);
      if (Math.abs(c.endDiff) > TOLERANCE_DAYS) parts.push(`end ${days(c.endDiff)}`);
      return `HEA says ${c.heaStart} to ${c.heaEnd}; this one is ${parts.join(', ')}.`;
    }
    case 'not_on_hea':
      return 'HEA has no matching semester for this group yet.';
    case 'unavailable':
      return `Couldn't check HEA: ${c.reason}.`;
  }
}
