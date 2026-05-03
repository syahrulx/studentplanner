import * as Calendar from 'expo-calendar';
import type { Calendar as DeviceCalendar, Event as DeviceEvent } from 'expo-calendar';
import type { Task } from '../types';
import { getTodayISO } from '../utils/date';
import { normalizeTaskType, normalizeTime } from './taskUtils';

/** Max events per import to avoid huge transactions / UI freeze. */
export const CALENDAR_IMPORT_MAX_EVENTS = 800;

export function stableCalendarTaskId(calendarId: string, eventId: string): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/%/g, '_');
  return `cal-${enc(calendarId)}-${enc(eventId)}`;
}

export async function ensureCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.getCalendarPermissionsAsync();
  if (status === 'granted') return true;
  const { status: next } = await Calendar.requestCalendarPermissionsAsync();
  return next === 'granted';
}

/** Calendars that can hold events; prefer those visible / synced on Android. */
export async function getEventCalendars(): Promise<DeviceCalendar[]> {
  const list = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return list.filter((c) => {
    if (c.isVisible === false) return false;
    if (c.isSynced === false) return false;
    return true;
  });
}

export async function fetchEventsInRange(
  calendarIds: string[],
  start: Date,
  end: Date,
): Promise<DeviceEvent[]> {
  if (calendarIds.length === 0) return [];
  return Calendar.getEventsAsync(calendarIds, start, end);
}

function toLocalYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toLocalHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function combineCalendarAndEventTitle(calendarTitle: string, eventTitle: string): string {
  const c = calendarTitle.trim();
  const e = (eventTitle ?? '').trim();
  if (c && e) return `${c}: ${e}`;
  if (e) return e;
  if (c) return c;
  return 'Calendar event';
}

function buildNotesFromEvent(event: DeviceEvent): string {
  const parts: string[] = [];
  if (event.location) parts.push(`Location: ${event.location}`);
  if (event.notes) parts.push(event.notes);
  return parts.join('\n\n');
}

export function calendarEventToTask(
  event: DeviceEvent,
  calendarId: string,
  calendarTitle: string,
): Task {
  const start = new Date(event.startDate);
  const invalid = Number.isNaN(start.getTime());
  const dueDate = invalid ? getTodayISO() : toLocalYMD(start);
  const dueTime = invalid ? '23:59' : event.allDay ? '23:59' : normalizeTime(toLocalHM(start));
  const title = combineCalendarAndEventTitle(calendarTitle, event.title ?? '');
  const type = normalizeTaskType(title);

  return {
    id: stableCalendarTaskId(calendarId, event.id),
    title,
    courseId: '',
    type,
    dueDate,
    dueTime,
    notes: buildNotesFromEvent(event),
    isDone: false,
    sourceMessage: `${calendarId}:${event.id}`,
    needsDate: invalid,
  };
}
