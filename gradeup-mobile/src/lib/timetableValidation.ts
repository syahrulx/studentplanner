import type { TimetableEntry, DayOfWeek } from '../types';

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseTimeToMinutes(raw: string): number | null {
  const t = raw.trim();
  const m = t.match(TIME_RE);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return h * 60 + min;
}

/**
 * Accepts 08:30, 8:30, 8:3, 830, 0930, 8.30 — normalises to minutes for editing UX.
 */
export function lenientParseTimeToMinutes(raw: string): number | null {
  let t = raw.trim().replace(/\./g, ':').replace(/\s+/g, '');
  if (!t) return null;
  if (/^\d{3,4}$/.test(t)) {
    const pad = t.length === 3 ? `0${t}` : t;
    const h = parseInt(pad.slice(0, 2), 10);
    const min = parseInt(pad.slice(2, 4), 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return h * 60 + min;
    return null;
  }
  const m = t.match(/^([01]?\d|2[0-3]):([0-5]?\d)$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Returns HH:mm or null if invalid. */
export function normalizeTimeDisplay(raw: string): string | null {
  const mins = lenientParseTimeToMinutes(raw);
  if (mins === null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function intervalsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const as = parseTimeToMinutes(aStart);
  const ae = parseTimeToMinutes(aEnd);
  const bs = parseTimeToMinutes(bStart);
  const be = parseTimeToMinutes(bEnd);
  if (as === null || ae === null || bs === null || be === null) return false;
  return as < be && ae > bs;
}

/** Another entry on the same day with overlapping time (exclusive of touching endpoints). */
export function findOverlappingTimetableEntry(
  entries: TimetableEntry[],
  candidate: { id: string; day: DayOfWeek; startTime: string; endTime: string },
): TimetableEntry | null {
  for (const e of entries) {
    if (e.id === candidate.id) continue;
    if (e.day !== candidate.day) continue;
    if (intervalsOverlap(candidate.startTime, candidate.endTime, e.startTime, e.endTime)) {
      return e;
    }
  }
  return null;
}

export const TIMETABLE_DAY_ORDER: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
