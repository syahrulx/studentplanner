import type { TimetableEntryRow } from './api';

const DAY_ALIASES: Record<string, string> = {
  monday: 'Monday',
  mon: 'Monday',
  isnin: 'Monday',
  tuesday: 'Tuesday',
  tue: 'Tuesday',
  selasa: 'Tuesday',
  wednesday: 'Wednesday',
  wed: 'Wednesday',
  rabu: 'Wednesday',
  thursday: 'Thursday',
  thu: 'Thursday',
  khamis: 'Thursday',
  friday: 'Friday',
  fri: 'Friday',
  jumaat: 'Friday',
  saturday: 'Saturday',
  sat: 'Saturday',
  sabtu: 'Saturday',
  sunday: 'Sunday',
  sun: 'Sunday',
  ahad: 'Sunday',
};

export const WEEK_DAYS_MON_FIRST = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type WeekDayLabel = (typeof WEEK_DAYS_MON_FIRST)[number];

export function normalizeTimetableDay(raw: string): WeekDayLabel | null {
  const t = raw.trim();
  if (!t) return null;
  const key = t.toLowerCase().replace(/[^a-z]/g, '');
  const alias = DAY_ALIASES[key];
  if (alias) return alias as WeekDayLabel;
  const cap = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  if ((WEEK_DAYS_MON_FIRST as readonly string[]).includes(cap)) return cap as WeekDayLabel;
  return null;
}

/** Parse "08:00", "8:00", "0800", "800" into minutes from midnight. */
export function parseTimeToMinutes(t: string): number | null {
  const s = t.replace(/\s+/g, '').replace('.', ':');
  const amPm = s.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  if (amPm) {
    let h = parseInt(amPm[1], 10);
    const m = parseInt(amPm[2], 10);
    const p = amPm[3].toLowerCase();
    if (p === 'pm' && h < 12) h += 12;
    if (p === 'am' && h === 12) h = 0;
    return h * 60 + m;
  }
  const m2 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m2) return parseInt(m2[1], 10) * 60 + parseInt(m2[2], 10);
  if (/^\d{4}$/.test(s)) return parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(2), 10);
  if (/^\d{3}$/.test(s)) return parseInt(s.slice(0, 1), 10) * 60 + parseInt(s.slice(1), 10);
  return null;
}

export function minutesToHHMM(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function defaultSlotColor(subjectCode: string): string {
  let h = 0;
  const s = subjectCode || 'X';
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * 17) % 360;
  return `hsl(${h} 62% 42%)`;
}

export type GridSlot = {
  row: TimetableEntryRow;
  day: WeekDayLabel;
  startMin: number;
  endMin: number;
  title: string;
  color: string;
};

export function entriesToGridSlots(entries: TimetableEntryRow[]): GridSlot[] {
  const out: GridSlot[] = [];
  for (const row of entries) {
    const day = normalizeTimetableDay(row.day);
    if (!day) continue;
    const startMin = parseTimeToMinutes(row.start_time);
    const endMin = parseTimeToMinutes(row.end_time);
    if (startMin == null || endMin == null || endMin <= startMin) continue;
    const title = (row.display_name || row.subject_name || row.subject_code || 'Slot').trim();
    const color = (row.slot_color || '').trim() || defaultSlotColor(row.subject_code || '');
    out.push({ row, day, startMin, endMin, title, color });
  }
  return out;
}

/** Half-open intervals [a0, a1) and [b0, b1) — touching endpoints do not overlap (e.g. 10:00 end vs 10:00 start). */
export function timetableIntervalsOverlapHalfOpen(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/** First entry on the same canonical day whose time range overlaps the proposed range (excluding one id when editing). */
export function findConflictingTimetableEntry(
  entries: TimetableEntryRow[],
  opts: {
    excludeEntryId?: string;
    day: WeekDayLabel;
    startMin: number;
    endMin: number;
  },
): TimetableEntryRow | null {
  for (const e of entries) {
    if (opts.excludeEntryId && e.id === opts.excludeEntryId) continue;
    const d = normalizeTimetableDay(e.day);
    if (d !== opts.day) continue;
    const es = parseTimeToMinutes(e.start_time);
    const ee = parseTimeToMinutes(e.end_time);
    if (es == null || ee == null || ee <= es) continue;
    if (timetableIntervalsOverlapHalfOpen(opts.startMin, opts.endMin, es, ee)) return e;
  }
  return null;
}
