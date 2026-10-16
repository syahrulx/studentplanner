import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { Event as DeviceEvent } from 'expo-calendar';
import type { Task } from '../types';
import { calendarFields, calendarSource, phoneStateByTaskId, planCalendarSync, type CalendarSnapshots, type CalendarSyncUpdate } from './calendarSync';

/**
 * Runs the phone calendar sync (see calendarSync.ts) on this device.
 *
 * Light by design: it reads the phone's own calendar (no internet), only
 * while the app is open, at most once every SYNC_EVERY_MS, and only for a
 * student who imported something and already allowed calendar access. It never
 * asks for access. Only tasks that actually changed are saved, so a normal run
 * sends nothing to the server.
 */

export const SYNC_EVERY_MS = 15 * 60 * 1000;
/** Most tasks changed in one run, so a bulk move on the phone can't flood the server. */
const MAX_UPDATES_PER_RUN = 50;
/** Events moved outside the read window are looked up one by one, up to this many. */
const MAX_SINGLE_LOOKUPS = 30;

const enabledKey = 'calendarAutoSync:enabled:v1';
const snapshotsKey = (uid: string) => `calendarAutoSync:snapshots:v1:${uid}`;

export async function isCalendarAutoSyncOn(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(enabledKey)) !== '0';
  } catch {
    return true;
  }
}

export async function setCalendarAutoSyncOn(on: boolean): Promise<void> {
  await AsyncStorage.setItem(enabledKey, on ? '1' : '0');
}

async function loadSnapshots(uid: string): Promise<CalendarSnapshots> {
  try {
    const raw = await AsyncStorage.getItem(snapshotsKey(uid));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveSnapshots(uid: string, s: CalendarSnapshots): Promise<void> {
  try {
    await AsyncStorage.setItem(snapshotsKey(uid), JSON.stringify(s));
  } catch {
    /* next run rebuilds it */
  }
}

/** Called by the import screen: what the phone said for each task just imported. */
export async function rememberImportedTasks(uid: string, tasks: Task[]): Promise<void> {
  if (!uid || tasks.length === 0) return;
  const s = await loadSnapshots(uid);
  for (const t of tasks) s[t.id] = calendarFields(t);
  await saveSnapshots(uid, s);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * One sync pass. `applyUpdate` must re-check the task right before writing
 * (the student may have edited it while this ran); see CalendarSyncUpdate.before.
 */
export async function runCalendarSync(
  uid: string,
  tasks: Task[],
  applyUpdate: (u: CalendarSyncUpdate) => void,
): Promise<{ changed: number }> {
  if (Platform.OS === 'web' || !uid) return { changed: 0 };
  const imported = tasks.filter((t) => calendarSource(t));
  if (imported.length === 0) return { changed: 0 };
  if (!(await isCalendarAutoSyncOn())) return { changed: 0 };

  const Calendar = await import('expo-calendar');
  const perm = await Calendar.getCalendarPermissionsAsync();
  if (perm.status !== 'granted') return { changed: 0 };

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const titleById = new Map(calendars.map((c) => [c.id, c.title || (c as { name?: string }).name || 'Calendar']));
  const wanted = [...new Set(imported.map((t) => calendarSource(t)!.calendarId))].filter((id) => titleById.has(id));
  if (wanted.length === 0) return { changed: 0 };

  const now = new Date();
  const events: DeviceEvent[] = await Calendar.getEventsAsync(wanted, addDays(now, -60), addDays(now, 400));

  // Events moved far away (or past the window) aren't in that read: look them up by id.
  const seen = new Set(events.map((e) => `${e.calendarId}:${e.id}`));
  const missing = imported
    .filter((t) => !t.isDone && !seen.has(t.sourceMessage!) && wanted.includes(calendarSource(t)!.calendarId))
    .slice(0, MAX_SINGLE_LOOKUPS);
  for (const t of missing) {
    try {
      const ev = await Calendar.getEventAsync(calendarSource(t)!.eventId);
      if (ev && ev.calendarId === calendarSource(t)!.calendarId) events.push(ev);
    } catch {
      /* deleted on the phone: leave the task as it is */
    }
  }

  const phone = phoneStateByTaskId(events, titleById);
  const plan = planCalendarSync(tasks, phone, await loadSnapshots(uid));
  const updates = plan.updates.slice(0, MAX_UPDATES_PER_RUN);
  for (const u of updates) applyUpdate(u);
  // Updates over the cap keep their old snapshot, so the next run picks them up.
  const old = await loadSnapshots(uid);
  for (const u of plan.updates.slice(MAX_UPDATES_PER_RUN)) {
    if (old[u.taskId]) plan.snapshots[u.taskId] = old[u.taskId];
    else delete plan.snapshots[u.taskId];
  }
  await saveSnapshots(uid, plan.snapshots);
  return { changed: updates.length };
}
