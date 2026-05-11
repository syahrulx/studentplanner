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

function timeToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return Number.NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

const DAY_ORDER: Record<DayOfWeek, number> = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

/**
 * Collapse back-to-back periods of the same subject/lecturer/room on the same
 * day into a single block. This is what makes PDF/picture-imported timetables
 * look like the student-ID one (e.g. three BM rows 08:20–09:00, 09:00–09:40,
 * 09:40–10:20 become one BM block 08:20–10:20).
 *
 * Rules:
 *  - Group by (day, subjectCode, subjectName, lecturer, location, group) — case-insensitive, trimmed.
 *  - Sort by start time.
 *  - Merge when the next slot's start <= current slot's end (touching or overlapping).
 *  - Keep first entry's id.
 */
export function mergeConsecutiveTimetableEntries(
  entries: TimetableEntry[],
): TimetableEntry[] {
  const groups = new Map<string, TimetableEntry[]>();
  for (const e of entries) {
    const key = [
      e.day,
      (e.subjectCode || '').toUpperCase().trim(),
      (e.subjectName || '').toUpperCase().trim(),
      (e.lecturer || '').toUpperCase().trim(),
      (e.location || '').toUpperCase().trim(),
      (e.group || '').toUpperCase().trim(),
    ].join('|');
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  const merged: TimetableEntry[] = [];
  for (const list of groups.values()) {
    list.sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
    );
    let cur: TimetableEntry | null = null;
    for (const e of list) {
      const sMin = timeToMinutes(e.startTime);
      const eMin = timeToMinutes(e.endTime);
      if (Number.isNaN(sMin) || Number.isNaN(eMin) || eMin <= sMin) {
        if (cur) merged.push(cur);
        cur = null;
        merged.push(e);
        continue;
      }
      if (!cur) {
        cur = { ...e };
        continue;
      }
      const curEndMin = timeToMinutes(cur.endTime);
      if (sMin <= curEndMin) {
        if (eMin > curEndMin) cur.endTime = e.endTime;
      } else {
        merged.push(cur);
        cur = { ...e };
      }
    }
    if (cur) merged.push(cur);
  }

  merged.sort((a, b) => {
    const d = (DAY_ORDER[a.day] ?? 99) - (DAY_ORDER[b.day] ?? 99);
    if (d !== 0) return d;
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });
  return merged;
}

/** Map edge-function slot rows to app TimetableEntry (client-side safety net). */
export function apiSlotsToTimetableEntries(slots: ApiTimetableSlot[]): TimetableEntry[] {
  const raw: TimetableEntry[] = [];
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
    raw.push({
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
  return mergeConsecutiveTimetableEntries(raw);
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
