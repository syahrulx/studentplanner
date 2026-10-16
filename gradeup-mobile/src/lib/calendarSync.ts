import type { Event as DeviceEvent } from 'expo-calendar';
import type { Task } from '../types';
import { calendarEventToTask, stableCalendarTaskId } from './calendarImport';

/**
 * Keeps tasks imported from the phone calendar in step with the phone.
 *
 * Import is a one-time copy; this re-reads the same phone events later and
 * carries over what changed there (date, time, title, notes). It is careful
 * with the student's own work:
 *
 * - Only tasks that came from the phone calendar (`cal-…` ids) are looked at.
 * - A field is changed only when the phone changed it AND the student did not
 *   change it in Rencana since. An edit in Rencana always wins.
 * - Course, type, done, repeat and every other field are never touched.
 * - Done tasks are left alone, and nothing is ever deleted or added: an event
 *   deleted on the phone stays in Rencana, a task deleted in Rencana stays
 *   deleted.
 * - Repeating events are skipped: all their dates share one id, so there is no
 *   telling which date the task stands for.
 *
 * "Did the student change it?" is answered with a snapshot: what the phone
 * said the last time the task was imported or synced, kept on this device.
 * The phone calendar is per device too (event ids differ between devices), so
 * only the phone that imported a task ever syncs it.
 */

/** The four fields an import fills in, normalised the way the task stores them. */
export type CalendarFields = { title: string; dueDate: string; dueTime: string; notes: string };
/** taskId → what the phone said last time. */
export type CalendarSnapshots = Record<string, CalendarFields>;

const FIELDS = ['title', 'dueDate', 'dueTime', 'notes'] as const;

export function calendarFields(t: Pick<Task, 'title' | 'dueDate' | 'dueTime' | 'notes'>): CalendarFields {
  return {
    title: String(t.title ?? '').trim(),
    dueDate: String(t.dueDate ?? '').trim().slice(0, 10),
    dueTime: String(t.dueTime ?? '').trim().slice(0, 5),
    notes: String(t.notes ?? ''),
  };
}

/** The phone calendar and event a task was imported from, or null if it wasn't. */
export function calendarSource(task: Pick<Task, 'id' | 'sourceMessage'>): { calendarId: string; eventId: string } | null {
  if (!String(task.id).startsWith('cal-') || !task.sourceMessage) return null;
  // Calendar ids have no ':' (UUIDs on iOS, numbers on Android); iOS event ids do.
  const cut = task.sourceMessage.indexOf(':');
  if (cut <= 0) return null;
  const calendarId = task.sourceMessage.slice(0, cut);
  const eventId = task.sourceMessage.slice(cut + 1);
  if (!eventId || stableCalendarTaskId(calendarId, eventId) !== task.id) return null;
  return { calendarId, eventId };
}

/** What the phone says now for one task: its fields, or 'skip' when it can't be trusted. */
export type PhoneEventState = CalendarFields | 'skip';

/**
 * Phone events by the task id they would import as. An id seen more than once
 * (a repeating event's dates), a repeating event, or a bad date is 'skip'.
 */
export function phoneStateByTaskId(
  events: DeviceEvent[],
  calendarTitleById: Map<string, string>,
): Map<string, PhoneEventState> {
  const out = new Map<string, PhoneEventState>();
  for (const ev of events) {
    const id = stableCalendarTaskId(ev.calendarId, ev.id);
    if (out.has(id)) {
      out.set(id, 'skip');
      continue;
    }
    const start = new Date(ev.startDate);
    if (ev.recurrenceRule || Number.isNaN(start.getTime())) {
      out.set(id, 'skip');
      continue;
    }
    const task = calendarEventToTask(ev, ev.calendarId, calendarTitleById.get(ev.calendarId) ?? 'Calendar');
    out.set(id, calendarFields(task));
  }
  return out;
}

export type CalendarSyncUpdate = {
  taskId: string;
  /** What the task held when planned; applied only if it still holds it. */
  before: Partial<CalendarFields>;
  changes: Partial<CalendarFields>;
};

export function planCalendarSync(
  tasks: Task[],
  phone: Map<string, PhoneEventState>,
  snapshots: CalendarSnapshots,
): { updates: CalendarSyncUpdate[]; snapshots: CalendarSnapshots } {
  const updates: CalendarSyncUpdate[] = [];
  const nextSnapshots: CalendarSnapshots = {};

  for (const task of tasks) {
    if (!calendarSource(task)) continue;
    const saved = snapshots[task.id];
    const state = phone.get(task.id);
    if (task.isDone || !state || state === 'skip') {
      // Not readable now (deleted, hidden calendar, repeating) or done: keep what we knew.
      if (saved) nextSnapshots[task.id] = saved;
      continue;
    }
    const now = calendarFields(task);
    // Imported before snapshots existed: if the title and notes are still the
    // phone's, the student most likely never edited it, so its date is the
    // one imported. Otherwise trust nothing and start from today's phone values.
    const base: CalendarFields =
      saved ??
      (now.title === state.title && now.notes === state.notes
        ? { ...state, dueDate: now.dueDate, dueTime: now.dueTime }
        : state);

    const before: Partial<CalendarFields> = {};
    const changes: Partial<CalendarFields> = {};
    for (const f of FIELDS) {
      const phoneChanged = state[f] !== base[f];
      const editedHere = now[f] !== base[f];
      if (phoneChanged && !editedHere && now[f] !== state[f]) {
        before[f] = now[f];
        changes[f] = state[f];
      }
    }
    if (Object.keys(changes).length > 0) updates.push({ taskId: task.id, before, changes });
    nextSnapshots[task.id] = state;
  }
  return { updates, snapshots: nextSnapshots };
}
