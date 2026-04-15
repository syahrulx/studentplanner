import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { TimetableEntry } from './types';

const CHANNEL_ATTENDANCE = 'attendance';
const ID_PREFIX = 'attendance-';

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
type WeekdayLabel = (typeof WEEKDAY_LABELS)[number];

function normalizeWeekday(raw: string): WeekdayLabel | null {
  const s = String(raw || '').trim().toLowerCase();
  for (const d of WEEKDAY_LABELS) {
    if (d.toLowerCase() === s) return d;
  }
  // common abbreviations
  const map: Record<string, WeekdayLabel> = {
    sun: 'Sunday',
    mon: 'Monday',
    tue: 'Tuesday',
    tues: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    thur: 'Thursday',
    thurs: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
  };
  return map[s] ?? null;
}

function parseHHMM(raw: string): { hour: number; minute: number } | null {
  const s = String(raw || '').trim();
  const m = /^(\d{1,2})\s*:?\s*(\d{2})$/.exec(s);
  if (!m) return null;
  const hour = Math.max(0, Math.min(23, Number(m[1])));
  const minute = Math.max(0, Math.min(59, Number(m[2])));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { hour, minute };
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 864e5);
}

export async function ensureAttendanceChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ATTENDANCE, {
    name: 'Class attendance',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
}

export async function cancelAllAttendanceNotifications(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const mine = all.filter((n) => n.identifier.startsWith(ID_PREFIX));
  await Promise.all(mine.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

function notifId(entryId: string, scheduledStartAtMs: number): string {
  return `${ID_PREFIX}${entryId}-${scheduledStartAtMs}`;
}

export async function rescheduleAttendanceNotifications(
  userId: string,
  timetable: TimetableEntry[],
  opts?: { horizonDays?: number },
): Promise<void> {
  const perm = await Notifications.getPermissionsAsync();
  const status = (perm as any)?.status as string | undefined;
  if (status !== 'granted') return;

  await ensureAttendanceChannel();
  await cancelAllAttendanceNotifications();

  const horizonDays = Math.max(1, Math.min(31, Number(opts?.horizonDays ?? 14)));
  const now = new Date();
  const today = startOfDay(now);

  for (const entry of timetable) {
    const day = normalizeWeekday(entry.day);
    const time = parseHHMM(entry.startTime);
    if (!day || !time) continue;

    for (let i = 0; i <= horizonDays; i++) {
      const d = addDays(today, i);
      const weekdayLabel = WEEKDAY_LABELS[d.getDay()];
      if (weekdayLabel !== day) continue;

      const scheduledStartAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), time.hour, time.minute, 0, 0);
      const fireAt = new Date(scheduledStartAt.getTime() - 5 * 60_000);
      if (fireAt.getTime() <= Date.now()) continue;

      const subject = (entry.displayName || entry.subjectName || entry.subjectCode || 'Class').trim();
      await Notifications.scheduleNotificationAsync({
        identifier: notifId(entry.id, scheduledStartAt.getTime()),
        content: {
          title: 'Class check-in',
          body: `Did you attend class "${subject}" in 5 more minutes?`,
          sound: true,
          categoryIdentifier: 'attendance_checkin',
          data: {
            type: 'attendance_checkin',
            userId,
            timetableEntryId: entry.id,
            scheduledStartAt: scheduledStartAt.toISOString(),
            subjectCode: entry.subjectCode ?? '',
            subjectName: entry.subjectName ?? '',
          },
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ATTENDANCE } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ATTENDANCE } : {}),
        },
      });
    }
  }
}

