import type { DayOfWeek, TimetableEntry } from '../types';

const JS_TO_DAY: DayOfWeek[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function parseTimeToMinutes(t: string): number | null {
  const m = String(t || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min < 0 || min > 59 || h < 0 || h > 23) {
    return null;
  }
  return h * 60 + min;
}

function slotLabel(e: TimetableEntry): string {
  const code = (e.subjectCode || '').trim();
  const display = (e.displayName || '').trim();
  const name = (e.subjectName || '').trim();
  return (display || code || name).trim() || 'Class';
}

function sortByStartTime(entries: TimetableEntry[]): TimetableEntry[] {
  return [...entries].sort((a, b) => {
    const sa = parseTimeToMinutes(a.startTime) ?? 0;
    const sb = parseTimeToMinutes(b.startTime) ?? 0;
    return sa - sb;
  });
}

/**
 * Returns the timetable subject label for the slot that contains `at` (local time), if any.
 */
export function getCurrentTimetableSubjectLabel(
  entries: TimetableEntry[],
  at: Date = new Date(),
): string | null {
  if (!entries?.length) return null;
  const y = at.getFullYear();
  const mo = at.getMonth();
  const d = at.getDate();
  const dow = JS_TO_DAY[new Date(y, mo, d, 12, 0, 0).getDay()];
  const nowMin = at.getHours() * 60 + at.getMinutes();

  const todaySlots = sortByStartTime(entries.filter((e) => e.day === dow));
  if (todaySlots.length === 0) return null;

  for (const e of todaySlots) {
    const start = parseTimeToMinutes(e.startTime);
    const end = parseTimeToMinutes(e.endTime);
    if (start == null || end == null) continue;
    if (end > start) {
      if (nowMin >= start && nowMin < end) return slotLabel(e);
    } else {
      // Overnight slot (rare for classes)
      if (nowMin >= start || nowMin < end) return slotLabel(e);
    }
  }
  return null;
}

/** True when activity detail is empty or the generic "Studying" placeholder. */
export function isGenericStudyingDetail(detail?: string | null): boolean {
  const t = (detail || '').trim();
  if (!t) return true;
  return t.toLowerCase() === 'studying';
}

export type StudyingStatusOpts = { isSelf: boolean; timetable: TimetableEntry[] };

/**
 * Line shown after the 📚 emoji for `studying`: live slot for self when detail is generic;
 * friends rely on stored detail / course_name (filled when they set status or start the timer).
 */
export function studyingStatusDetailText(
  detail: string | null | undefined,
  courseName: string | null | undefined,
  opts: StudyingStatusOpts,
): string {
  const d = (detail || '').trim();
  const cn = (courseName || '').trim();
  if (opts.isSelf) {
    const tt = getCurrentTimetableSubjectLabel(opts.timetable);
    if (isGenericStudyingDetail(detail) && tt) return tt;
    if (d && !isGenericStudyingDetail(d)) return d;
    if (cn && cn.toLowerCase() !== 'studying') return cn;
    if (tt) return tt;
    return d || cn || 'Studying';
  }
  if (d && !isGenericStudyingDetail(d)) return d;
  if (cn && cn.toLowerCase() !== 'studying') return cn;
  return 'Studying';
}
