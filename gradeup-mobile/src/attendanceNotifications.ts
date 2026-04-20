import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { IosAuthorizationStatus } from 'expo-notifications';
import type { TimetableEntry } from './types';
import { attendanceOccurrenceKey, ensureAttendanceCategory, getAnsweredOccurrenceSet } from './attendanceRecording';

// Android channel importance cannot be changed once created.
// Bump the channel id so existing installs get a fresh HIGH-importance channel (restores popup/banner).
const CHANNEL_ATTENDANCE = 'attendance_checkin_v2';
const ID_PREFIX = 'attendance-';

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
type WeekdayLabel = (typeof WEEKDAY_LABELS)[number];

/**
 * `rescheduleAttendanceNotifications` is invoked from multiple places (AppContext refreshes).
 * If calls overlap, each call cancels "current" schedules then both proceed to schedule, producing duplicates.
 * We serialize runs to guarantee a single cancel+schedule transaction at a time.
 */
let rescheduleQueue: Promise<void> = Promise.resolve();

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

function requestFromScheduledEntry(n: unknown): { id: string; data: Record<string, unknown> | undefined } {
  const raw = n as Record<string, any>;
  const req = (raw?.request ?? raw) as Notifications.NotificationRequest;
  const id = String(req?.identifier ?? '');
  const data = (req?.content as { data?: Record<string, unknown> } | undefined)?.data;
  return { id, data };
}

/** Cancel every class check-in schedule, including legacy ids, so reschedule cannot stack duplicates. */
export async function cancelAllAttendanceNotifications(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    (all ?? []).map(async (entry) => {
      const { id, data } = requestFromScheduledEntry(entry as any);
      if (!id) return;
      const isAttendance = data?.type === 'attendance_checkin' || id.startsWith(ID_PREFIX);
      if (!isAttendance) return;
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    }),
  );
}

/** One Expo id per reminder fire + visible subject so duplicate rows cannot stack. */
function notifIdForOccurrence(subjectKey: string, fireAtMs: number): string {
  const safe = String(subjectKey)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 48) || 'class';
  return `${ID_PREFIX}${safe}_${fireAtMs}`;
}

function subjectKeyFromEntry(entry: TimetableEntry): string {
  const disp = String(entry.displayName || '').trim().toLowerCase();
  const name = String(entry.subjectName || '').trim().toLowerCase();
  const code = String(entry.subjectCode || '').trim().toLowerCase();
  return disp || name || code || 'class';
}

function localNotificationsAllowed(perm: Notifications.NotificationPermissionsStatus): boolean {
  if (perm.granted) return true;
  if (perm.status === 'granted') return true;
  if (Platform.OS === 'ios' && perm.ios) {
    const s = perm.ios.status;
    return (
      s === IosAuthorizationStatus.AUTHORIZED ||
      s === IosAuthorizationStatus.PROVISIONAL ||
      s === IosAuthorizationStatus.EPHEMERAL
    );
  }
  return false;
}

export async function rescheduleAttendanceNotifications(
  userId: string,
  timetable: TimetableEntry[],
  opts?: { horizonDays?: number },
): Promise<void> {
  rescheduleQueue = rescheduleQueue
    .catch(() => {})
    .then(async () => {
      const perm = await Notifications.getPermissionsAsync();
      if (!localNotificationsAllowed(perm)) return;

      await ensureAttendanceChannel();
      await ensureAttendanceCategory().catch(() => {});
      await cancelAllAttendanceNotifications();

      const horizonDays = Math.max(1, Math.min(31, Number(opts?.horizonDays ?? 14)));
      const now = new Date();
      const today = startOfDay(now);
      const answered = await getAnsweredOccurrenceSet().catch(() => new Set<string>());
      const scheduledCanon = new Set<string>();

      for (const entry of timetable) {
        const day = normalizeWeekday(entry.day);
        const time = parseHHMM(entry.startTime);
        if (!day || !time) continue;

        for (let i = 0; i <= horizonDays; i++) {
          const d = addDays(today, i);
          const weekdayLabel = WEEKDAY_LABELS[d.getDay()];
          if (weekdayLabel !== day) continue;

          const scheduledStartAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), time.hour, time.minute, 0, 0);
          // Exact wall-clock offset: trigger fires when (now >= classStart - 5min), i.e. at T−5 minutes.
          const fireAt = new Date(scheduledStartAt.getTime() - 5 * 60_000);
          if (fireAt.getTime() <= Date.now()) continue;
          if (answered.has(attendanceOccurrenceKey(entry.id, scheduledStartAt.toISOString()))) continue;

          const slotMs = Math.round(scheduledStartAt.getTime() / (5 * 60_000)) * (5 * 60_000);
          const canonKey = `${subjectKeyFromEntry(entry)}|${slotMs}`;
          if (scheduledCanon.has(canonKey)) continue;
          scheduledCanon.add(canonKey);

          const subject = (entry.displayName || entry.subjectName || entry.subjectCode || 'Class').trim();
          await Notifications.scheduleNotificationAsync({
            identifier: notifIdForOccurrence(subjectKeyFromEntry(entry), fireAt.getTime()),
            content: {
              title: 'Class check-in',
              body: `Did you attend class "${subject}" in 5 more minutes?`,
              sound: 'default',
              categoryIdentifier: 'attendance_checkin',
              data: {
                type: 'attendance_checkin',
                userId,
                timetableEntryId: entry.id,
                scheduledStartAt: scheduledStartAt.toISOString(),
                fireAtMs: fireAt.getTime(),
                subjectCode: entry.subjectCode ?? '',
                subjectName: entry.subjectName ?? '',
                subjectKey: subjectKeyFromEntry(entry),
                displaySubject: subject,
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
    });

  return rescheduleQueue;
}
