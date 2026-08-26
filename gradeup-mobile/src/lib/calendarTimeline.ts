import type { AcademicLevel, AcademicPeriod, AcademicPeriodType } from '../types';

/**
 * Shared vocabulary for anything that shows or edits a semester timeline: the submission editor,
 * the calendar picker, and the preview bar. Keeping the type list, colours and week maths in one
 * place is what lets a student see the same shape before publishing that everyone else sees after.
 */

export type PeriodRow = {
  type: string;
  label: string;
  startDate: string;
  endDate: string;
};

/** Ordered the way a semester actually runs, so the picker reads top to bottom. */
export const PERIOD_TYPE_OPTIONS: { value: AcademicPeriodType; label: string }[] = [
  { value: 'registration', label: 'Registration' },
  { value: 'orientation', label: 'Orientation' },
  { value: 'lecture', label: 'Lectures' },
  { value: 'test', label: 'Mid-semester test' },
  { value: 'break', label: 'Break' },
  { value: 'special_break', label: 'Special break' },
  { value: 'holiday', label: 'Public holiday' },
  { value: 'revision', label: 'Revision week' },
  { value: 'exam', label: 'Examinations' },
  { value: 'industrial_training', label: 'Industrial training' },
  { value: 'other', label: 'Other' },
];

export function periodTypeLabel(type: string): string {
  return PERIOD_TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type;
}

/** Same palette the month grid uses, so a period keeps its colour everywhere it appears. */
export function periodTypeColor(type: string): string {
  switch (type) {
    case 'registration':
      return '#8b5cf6';
    case 'orientation':
      return '#6366f1';
    case 'lecture':
      return '#22c55e';
    case 'test':
    case 'revision':
    case 'exam':
      return '#ef4444';
    case 'break':
    case 'special_break':
      return '#22d3ee';
    case 'holiday':
      return '#f43f5e';
    case 'industrial_training':
      return '#f97316';
    default:
      return '#94a3b8';
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(iso: string): Date | null {
  const trimmed = String(iso ?? '').trim().slice(0, 10);
  if (!ISO_DATE.test(trimmed)) return null;
  const d = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Inclusive day count: a Mon–Sun period is 7 days, not 6. */
function inclusiveDays(startISO: string, endISO: string): number {
  const s = toDate(startISO);
  const e = toDate(endISO);
  if (!s || !e || e.getTime() < s.getTime()) return 0;
  return Math.round((e.getTime() - s.getTime()) / 864e5) + 1;
}

export function parsePeriodsJson(json: string): PeriodRow[] {
  const trimmed = String(json ?? '').trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
      .map((p) => ({
        type: String(p.type ?? 'other'),
        label: String(p.label ?? ''),
        startDate: String(p.startDate ?? '').slice(0, 10),
        endDate: String(p.endDate ?? '').slice(0, 10),
      }));
  } catch {
    return [];
  }
}

export function serializePeriods(rows: PeriodRow[]): string {
  return rows.length > 0 ? JSON.stringify(rows, null, 2) : '';
}

const KNOWN_TYPES = new Set<string>(PERIOD_TYPE_OPTIONS.map((option) => option.value));

/**
 * Narrow editor rows to stored periods. A row carries `type: string` because it can come from an
 * AI extraction as easily as from the picker; anything outside `AcademicPeriodType` becomes
 * `other` rather than being dropped, so a row is never silently lost.
 */
export function toAcademicPeriods(rows: PeriodRow[]): AcademicPeriod[] {
  return rows.map((row) => ({
    type: (KNOWN_TYPES.has(row.type) ? row.type : 'other') as AcademicPeriodType,
    label: row.label,
    startDate: row.startDate,
    endDate: row.endDate,
  }));
}

export function sortPeriods<T extends { startDate: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
}

/**
 * Public holidays sit *inside* the lecture or break block around them. They are drawn as markers
 * rather than segments, and excluded from week totals so a semester is not counted twice.
 */
function isNested(type: string): boolean {
  return type === 'holiday';
}

export type TimelineSummary = {
  /** e.g. `14 weeks of lectures · 1 week break · 3 weeks exams`. Empty when there is nothing to say. */
  text: string;
  lectureWeeks: number;
  holidayCount: number;
};

const SUMMARY_GROUPS: { types: string[]; singular: string; plural: string }[] = [
  { types: ['lecture'], singular: 'week of lectures', plural: 'weeks of lectures' },
  { types: ['break', 'special_break'], singular: 'week break', plural: 'weeks break' },
  { types: ['revision'], singular: 'week revision', plural: 'weeks revision' },
  { types: ['test', 'exam'], singular: 'week exams', plural: 'weeks exams' },
  { types: ['industrial_training'], singular: 'week training', plural: 'weeks training' },
];

export function summarizeTimeline(rows: Array<{ type: string; startDate: string; endDate: string }>): TimelineSummary {
  const parts: string[] = [];
  let lectureWeeks = 0;

  for (const group of SUMMARY_GROUPS) {
    const days = rows
      .filter((r) => group.types.includes(r.type))
      .reduce((sum, r) => sum + inclusiveDays(r.startDate, r.endDate), 0);
    if (days <= 0) continue;
    const weeks = Math.max(1, Math.round(days / 7));
    if (group.types[0] === 'lecture') lectureWeeks = weeks;
    parts.push(`${weeks} ${weeks === 1 ? group.singular : group.plural}`);
  }

  const holidayCount = rows.filter((r) => isNested(r.type)).length;
  return { text: parts.join(' · '), lectureWeeks, holidayCount };
}

export type TimelineSegment = {
  type: string | 'gap';
  label: string;
  startDate: string;
  endDate: string;
  days: number;
};

/**
 * Left-to-right segments covering the whole span, with unaccounted stretches returned as `gap`.
 * A gap is what "the calendar ends at the mid-semester break" looks like as a shape, which is the
 * point: it is visible before applying rather than months into the semester.
 */
export function timelineSegments(
  rows: Array<{ type: string; label: string; startDate: string; endDate: string }>,
): TimelineSegment[] {
  const usable = sortPeriods(
    rows.filter((r) => !isNested(r.type) && inclusiveDays(r.startDate, r.endDate) > 0),
  );
  if (usable.length === 0) return [];

  const segments: TimelineSegment[] = [];
  let cursor = toDate(usable[0].startDate);
  if (!cursor) return [];

  for (const row of usable) {
    const start = toDate(row.startDate);
    const end = toDate(row.endDate);
    if (!start || !end) continue;

    // Overlapping entries (a break inside a lecture block) contribute nothing new.
    if (end.getTime() < cursor.getTime()) continue;

    if (start.getTime() > cursor.getTime()) {
      const gapDays = Math.round((start.getTime() - cursor.getTime()) / 864e5);
      if (gapDays > 0) {
        segments.push({
          type: 'gap',
          label: 'Nothing scheduled',
          startDate: isoOf(cursor),
          endDate: isoOf(new Date(start.getTime() - 864e5)),
          days: gapDays,
        });
      }
    }

    const from = start.getTime() > cursor.getTime() ? start : cursor;
    const days = Math.round((end.getTime() - from.getTime()) / 864e5) + 1;
    if (days > 0) {
      segments.push({
        type: row.type,
        label: row.label || periodTypeLabel(row.type),
        startDate: isoOf(from),
        endDate: row.endDate,
        days,
      });
    }
    cursor = new Date(end.getTime() + 864e5);
  }

  return segments;
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Where today sits relative to a term, for the "running now / starts in N weeks" badge. */
export type TermStatus =
  | { kind: 'running'; weekLabel: string }
  | { kind: 'upcoming'; weeksAway: number }
  | { kind: 'ended'; weeksAgo: number }
  | { kind: 'unknown' };

export function termStatus(startISO: string, endISO: string, todayISO?: string): TermStatus {
  const start = toDate(startISO);
  const end = toDate(endISO);
  const today = toDate(todayISO ?? new Date().toISOString().slice(0, 10));
  if (!start || !end || !today) return { kind: 'unknown' };

  if (today.getTime() < start.getTime()) {
    const days = Math.round((start.getTime() - today.getTime()) / 864e5);
    return { kind: 'upcoming', weeksAway: Math.max(1, Math.round(days / 7)) };
  }
  if (today.getTime() > end.getTime()) {
    const days = Math.round((today.getTime() - end.getTime()) / 864e5);
    return { kind: 'ended', weeksAgo: Math.max(1, Math.round(days / 7)) };
  }
  const week = Math.floor((today.getTime() - start.getTime()) / 864e5 / 7) + 1;
  return { kind: 'running', weekLabel: `Week ${week}` };
}

/** The minimum an offer needs for the picker to place it; kept structural so this stays testable. */
export type PickerOffer = {
  startDate: string;
  endDate: string;
  programLevel?: AcademicLevel;
};

export type GroupedOffers<T extends PickerOffer> = {
  /** Running today and matching the student's programme — usually exactly one entry. */
  forYou: T[];
  /** Starts later and matches their programme. */
  upcoming: T[];
  /** Other programmes, and anything already finished. Collapsed by default in the picker. */
  others: T[];
};

/**
 * Split the list into what a student is likely to want versus everything else. A UKM student was
 * shown fourteen options and a unikl student twenty, all distinguished only by whatever label the
 * submitter typed ("s1 26/27", "SEM 1", "Sem 3 Xbme 3"), with no way to tell which was theirs.
 *
 * Programme is the sharpest filter — an offer with no `programLevel` applies to everyone — and
 * today's date decides the rest. Nothing is hidden, only ordered: a student whose programme is
 * unknown still sees every current calendar at the top.
 */
export function groupOffersForPicker<T extends PickerOffer>(
  offers: T[],
  options?: { academicLevel?: AcademicLevel | null; todayISO?: string },
): GroupedOffers<T> {
  const today = options?.todayISO ?? new Date().toISOString().slice(0, 10);
  const level = options?.academicLevel ?? null;

  const matchesProgramme = (offer: T) => !offer.programLevel || !level || offer.programLevel === level;

  const forYou: T[] = [];
  const upcoming: T[] = [];
  const others: T[] = [];

  for (const offer of offers) {
    if (!matchesProgramme(offer) || offer.endDate < today) {
      others.push(offer);
    } else if (offer.startDate <= today) {
      forYou.push(offer);
    } else {
      upcoming.push(offer);
    }
  }

  const byStart = (a: T, b: T) => a.startDate.localeCompare(b.startDate);
  return {
    forYou: forYou.sort(byStart),
    upcoming: upcoming.sort(byStart),
    others: others.sort(byStart),
  };
}
