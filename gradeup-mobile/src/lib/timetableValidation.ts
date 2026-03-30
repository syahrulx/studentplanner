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

/** Returns HH:mm or null if invalid. */
export function normalizeTimeDisplay(raw: string): string | null {
  const mins = parseTimeToMinutes(raw);
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
