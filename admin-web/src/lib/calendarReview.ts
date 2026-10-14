import type { CrowdsourcedCalendarRow, UitmCalendarContributionRow } from './api';

/**
 * Review helpers for the Community submissions tab. They only read rows and
 * suggest an action; nothing here deletes or approves anything.
 */

type PeriodLike = { type?: unknown; startDate?: unknown; endDate?: unknown };

function periodsOf(value: unknown): PeriodLike[] {
  return Array.isArray(value) ? (value as PeriodLike[]) : [];
}

/**
 * Same identity the app uses when it hides copies from students
 * (src/lib/universityCalendarOffersDb.ts → calendarKey): university, campus,
 * programme, dates and timeline. The label is ignored, because one calendar
 * arrives spelled many ways ("Sem 1 26/27", "s1 26/27").
 */
export function crowdsourcedCalendarKey(row: CrowdsourcedCalendarRow): string {
  const timeline = periodsOf(row.periods_json)
    .map((p) => `${String(p.type ?? '')}:${String(p.startDate ?? '')}:${String(p.endDate ?? '')}`)
    .sort()
    .join(',');
  const programme = (row as { program_level?: string | null }).program_level ?? '';
  return [row.university_id, row.campus_id ?? '', programme, row.start_date, row.end_date, timeline].join('|');
}

export type DuplicateInfo = {
  groupKey: string;
  /** How many submissions share this calendar. */
  size: number;
  /** The copy to keep; every other copy in the group is suggested for deletion. */
  keepId: string;
  keep: boolean;
};

/**
 * Groups crowdsourced calendars that students would see as the same calendar,
 * and picks one copy to keep: the fewest reports, then the fuller timeline,
 * then the oldest (students may already be using it).
 */
export function crowdsourcedDuplicates(rows: CrowdsourcedCalendarRow[]): Map<string, DuplicateInfo> {
  const groups = new Map<string, CrowdsourcedCalendarRow[]>();
  for (const row of rows) {
    const key = crowdsourcedCalendarKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const out = new Map<string, DuplicateInfo>();
  groups.forEach((members, groupKey) => {
    if (members.length < 2) return;
    const best = [...members].sort(
      (a, b) =>
        (a.report_count ?? 0) - (b.report_count ?? 0) ||
        periodsOf(b.periods_json).length - periodsOf(a.periods_json).length ||
        a.created_at.localeCompare(b.created_at),
    )[0];
    for (const row of members) {
      out.set(row.id, { groupKey, size: members.length, keepId: best.id, keep: row.id === best.id });
    }
  });
  return out;
}

export type UitmVerdict = { verdict: 'approve' | 'reject' | 'check'; reason: string };

function uitmKey(row: UitmCalendarContributionRow): string {
  return [row.group_code, row.calendar_variant, row.start_date, row.end_date].join('|');
}

/** Weeks a UiTM term may run beyond its teaching weeks: mid-semester break, revision and exams. */
const EXTRA_WEEKS = 7;

function weeksBetween(start: string, end: string): number | null {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.ceil((b - a + 864e5) / (7 * 864e5));
}

/** A suggested decision for each pending UiTM submission, with the reason. */
export function uitmSuggestions(rows: UitmCalendarContributionRow[], todayISO: string): Map<string, UitmVerdict> {
  const approvedKeys = new Set(rows.filter((r) => r.status === 'approved').map(uitmKey));
  const firstPendingByKey = new Map<string, string>();
  [...rows]
    .filter((r) => r.status === 'pending')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .forEach((r) => {
      const key = uitmKey(r);
      if (!firstPendingByKey.has(key)) firstPendingByKey.set(key, r.id);
    });

  const out = new Map<string, UitmVerdict>();
  for (const row of rows) {
    if (row.status !== 'pending') continue;
    const key = uitmKey(row);
    if (approvedKeys.has(key)) {
      out.set(row.id, { verdict: 'reject', reason: 'Same dates are already approved for this group.' });
      continue;
    }
    if (firstPendingByKey.get(key) !== row.id) {
      out.set(row.id, { verdict: 'reject', reason: 'Duplicate of an earlier pending submission. Review that one instead.' });
      continue;
    }
    if (row.end_date < todayISO) {
      out.set(row.id, { verdict: 'reject', reason: 'This semester has already ended.' });
      continue;
    }
    // total_weeks is TEACHING weeks; the dates also span the mid-semester
    // break, revision week and exams, so a UiTM term of 14 teaching weeks
    // normally runs about 18-20 weeks end to end. Only flag a span that is
    // shorter than the teaching weeks, or longer than they plus EXTRA_WEEKS.
    const weeks = weeksBetween(row.start_date, row.end_date);
    if (row.total_weeks < 8 || row.total_weeks > 30) {
      out.set(row.id, {
        verdict: 'check',
        reason: `Says ${row.total_weeks} teaching weeks, which is unusual for a UiTM semester. Check before approving.`,
      });
      continue;
    }
    if (weeks !== null && weeks < row.total_weeks - 1) {
      out.set(row.id, {
        verdict: 'check',
        reason: `Says ${row.total_weeks} teaching weeks, but the dates only cover about ${weeks} weeks. Check before approving.`,
      });
      continue;
    }
    if (weeks !== null && weeks > row.total_weeks + EXTRA_WEEKS) {
      out.set(row.id, {
        verdict: 'check',
        reason: `The dates cover about ${weeks} weeks for ${row.total_weeks} teaching weeks: more break and exam time than usual (${row.total_weeks + EXTRA_WEEKS} at most). Check before approving.`,
      });
      continue;
    }
    if (!row.source_url) {
      out.set(row.id, { verdict: 'check', reason: 'No source link to verify against. Approve only if the dates look right.' });
      continue;
    }
    out.set(row.id, { verdict: 'approve', reason: 'Teaching weeks fit the dates (allowing for break and exams), has a source, and no duplicate.' });
  }
  return out;
}
