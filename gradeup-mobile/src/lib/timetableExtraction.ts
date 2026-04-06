import type { DayOfWeek, TimetableEntry } from '../types';
import { normalizeTimeDisplay } from './timetableValidation';

const VALID_DAYS: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const DAY_ALIASES: Record<string, DayOfWeek> = {
  MON: 'Monday',
  MONDAY: 'Monday',
  ISNIN: 'Monday',
  TUE: 'Tuesday',
  TUES: 'Tuesday',
  TUESDAY: 'Tuesday',
  SELASA: 'Tuesday',
  WED: 'Wednesday',
  WEDS: 'Wednesday',
  WEDNESDAY: 'Wednesday',
  RABU: 'Wednesday',
  THU: 'Thursday',
  THUR: 'Thursday',
  THURS: 'Thursday',
  THURSDAY: 'Thursday',
  KHAMIS: 'Thursday',
  FRI: 'Friday',
  FRIDAY: 'Friday',
  JUMAAT: 'Friday',
  SAT: 'Saturday',
  SATURDAY: 'Saturday',
  SABTU: 'Saturday',
  SUN: 'Sunday',
  SUNDAY: 'Sunday',
  AHAD: 'Sunday',
};

export function normalizeExtractedDay(raw: string): DayOfWeek | null {
  const s = raw.trim();
  if (!s) return null;
  for (const d of VALID_DAYS) {
    if (d.toLowerCase() === s.toLowerCase()) return d;
  }
  const key = s.replace(/\./g, '').toUpperCase().replace(/\s+/g, '');
  return DAY_ALIASES[key] ?? null;
}

export function normalizeExtractedTime(raw: string): string | null {
  return normalizeTimeDisplay(raw);
}

export type ApiTimetableSlot = {
  day: string;
  start_time: string;
  end_time: string;
  subject_code: string;
  subject_name: string;
  lecturer?: string;
  location?: string;
  group?: string;
};

function makeEntryId(index: number): string {
  return `tt-import-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Map edge-function slot rows to app TimetableEntry (client-side safety net). */
export function apiSlotsToTimetableEntries(slots: ApiTimetableSlot[]): TimetableEntry[] {
  const out: TimetableEntry[] = [];
  let i = 0;
  for (const row of slots) {
    const day = normalizeExtractedDay(row.day);
    const startTime = normalizeExtractedTime(row.start_time);
    const endTime = normalizeExtractedTime(row.end_time);
    if (!day || !startTime || !endTime) continue;
    const code = (row.subject_code || 'CLASS').trim().slice(0, 32);
    const name = (row.subject_name || code).trim().slice(0, 200);
    const lect = (row.lecturer ?? '-').trim() || '-';
    const loc = (row.location ?? '-').trim() || '-';
    const group = (row.group ?? '').trim().slice(0, 80);
    out.push({
      id: makeEntryId(i++),
      day,
      subjectCode: code,
      subjectName: name,
      lecturer: lect,
      startTime,
      endTime,
      location: loc,
      ...(group ? { group } : {}),
    });
  }
  return out;
}

export function parseExtractTimetableResponse(data: unknown): ApiTimetableSlot[] {
  if (!data || typeof data !== 'object') return [];
  const slots = (data as { slots?: unknown }).slots;
  if (!Array.isArray(slots)) return [];
  return slots
    .map((s) => {
      const r = s as Record<string, unknown>;
      return {
        day: String(r.day ?? ''),
        start_time: String(r.start_time ?? r.startTime ?? ''),
        end_time: String(r.end_time ?? r.endTime ?? ''),
        subject_code: String(r.subject_code ?? r.subjectCode ?? ''),
        subject_name: String(r.subject_name ?? r.subjectName ?? ''),
        lecturer: r.lecturer != null ? String(r.lecturer) : undefined,
        location: r.location != null ? String(r.location) : undefined,
        group: r.group != null ? String(r.group) : undefined,
      };
    })
    .filter((r) => r.day && r.start_time && r.end_time);
}
