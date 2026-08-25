import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { RevisionSettings, RevisionDay } from './storage';
import './notificationsForeground';

// One schedule per study time. This used to be a single fixed id shared by every
// study time, so saving a second one silently displaced the first, and deleting
// one re-scheduled a *different* one into the same slot — which read as "I
// deleted it but the reminder still fires every day".
const REVISION_ID_PREFIX = 'revision-';
/** Pre-per-setting installs parked every study time here; still cancelled on upgrade. */
const LEGACY_REVISION_MAIN_ID = 'revision-main';
const REVISION_POSTPONE_ID = 'revision-postpone';
const CHANNEL_ID = 'revision';
/** Share of the 64 pending local notifications iOS allows per app. */
const MAX_REVISION_NOTIFICATIONS = 4;

/** Settings saved while signed out have no DB id; they still get their own stable slot. */
function notifIdForSetting(settingId: string | undefined): string {
  return `${REVISION_ID_PREFIX}${String(settingId || 'local').trim() || 'local'}`;
}

const WEEKDAY_NUM: Record<RevisionDay, number> = {
  Sunday: 1,
  Monday: 2,
  Tuesday: 3,
  Wednesday: 4,
  Thursday: 5,
  Friday: 6,
  Saturday: 7,
  'Every day': 1, // unused for DAILY
};

export async function ensureRevisionChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Study reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

export async function requestRevisionPermissions(): Promise<boolean> {
  await ensureRevisionChannel();
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

/**
 * Cancel the per-study-time reminders (and the legacy shared slot), but leave a
 * pending "postpone" alone — that one is a deliberate one-off the user asked
 * for, and it must survive the rebuild that runs on every app load.
 */
async function cancelStudyTimeReminders(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(LEGACY_REVISION_MAIN_ID).catch(() => {});
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(
    (all ?? []).map(async (entry) => {
      const req = ((entry as any)?.request ?? entry) as Notifications.NotificationRequest;
      const id = String(req?.identifier ?? '');
      if (!id || id === REVISION_POSTPONE_ID) return;
      const data = (req?.content as { data?: Record<string, unknown> } | undefined)?.data;
      if (data?.type !== 'revision' && !id.startsWith(REVISION_ID_PREFIX)) return;
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    }),
  );
}

/** Cancel every study reminder including any pending postpone. Sign-out / clear-all paths. */
export async function cancelAllRevisionNotifications(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REVISION_POSTPONE_ID).catch(() => {});
  await cancelStudyTimeReminders();
}

/** Cancel just this study time's reminder, leaving the others alone. */
export async function cancelRevisionNotification(settingId: string | undefined): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notifIdForSetting(settingId)).catch(() => {});
}

/**
 * Rebuild every study reminder from the saved list — the DB is the source of
 * truth, so anything deleted simply isn't re-scheduled.
 */
export async function rescheduleAllRevisionNotifications(list: RevisionSettings[]): Promise<void> {
  await cancelStudyTimeReminders();
  let used = 0;
  for (const settings of list) {
    if (!settings.enabled) continue;
    // Share of the 64 pending-notification limit iOS enforces. The list is
    // newest-first, so the most recently created study times win. The busiest
    // account in production has 3, so this bites nobody today — it just stops
    // study times from crowding out class check-ins and task reminders.
    if (used >= MAX_REVISION_NOTIFICATIONS) break;
    // Count only what actually took a slot. A "once" study time whose date has
    // passed schedules nothing, and the DB is full of them — counting those
    // would have spent the whole budget on dead rows and dropped the live
    // recurring reminder underneath them.
    if (await scheduleRevisionNotification(settings)) used += 1;
  }
}

/** Schedule notification from revision settings (once = single date, repeated = daily or weekly). */
export async function scheduleRevisionNotification(settings: RevisionSettings): Promise<boolean> {
  // Android drops notifications posted to a channel that doesn't exist yet. The
  // channel used to be created only when enabling a study time, so scheduling
  // from any other path — the app-load rebuild, or signing in on a new device —
  // could silently produce reminders that never appear. Idempotent, no-op on iOS.
  await ensureRevisionChannel().catch(() => {});
  const notifId = notifIdForSetting(settings.id);
  // Only this study time's own slot — cancelling all here is what made saving a
  // second study time wipe the first one's reminder.
  await Notifications.cancelScheduledNotificationAsync(notifId).catch(() => {});
  const [hourStr, minuteStr] = settings.time.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10) || 0;
  const subjectLabel = settings.subjectId ? ` (${settings.subjectId})` : '';
  const topicLabel = settings.topic ? `: ${settings.topic}` : '';
  const body = `Study${subjectLabel}${topicLabel}. Open the app to begin or postpone.`;
  const content = {
    title: 'Time to study',
    body,
    sound: true,
    data: { type: 'revision', settingId: settings.id ?? null },
  };
  if (settings.repeat === 'once' && settings.singleDate) {
    const [y, m, d] = settings.singleDate.split('-').map(Number);
    const date = new Date(y, m - 1, d, hour, minute, 0);
    if (date.getTime() > Date.now()) {
      await Notifications.scheduleNotificationAsync({
        identifier: notifId,
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          channelId: CHANNEL_ID,
        },
      });
      return true;
    }
    // Date already passed — nothing scheduled, so it claims no slot.
    return false;
  }
  if (settings.day === 'Every day') {
    await Notifications.scheduleNotificationAsync({
      identifier: notifId,
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: CHANNEL_ID,
      },
    });
  } else {
    const weekday = WEEKDAY_NUM[settings.day];
    await Notifications.scheduleNotificationAsync({
      identifier: notifId,
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour,
        minute,
        channelId: CHANNEL_ID,
      },
    });
  }
  // Daily and weekly reminders recur, so each one holds a slot for good.
  return true;
}

/** Schedule a one-time revision reminder (for postpone, minutes from now). */
export async function schedulePostponedRevision(minutesFromNow: number): Promise<void> {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutesFromNow);
  await scheduleRevisionAtDate(date);
}

/** Schedule a one-time revision reminder at a specific date/time (for postpone). */
export async function scheduleRevisionAtDate(date: Date): Promise<void> {
  await ensureRevisionChannel().catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(REVISION_POSTPONE_ID).catch(() => {});
  if (date.getTime() <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: REVISION_POSTPONE_ID,
    content: {
      title: 'Time to study',
      body: 'Your postponed revision time is now. Open the app to begin.',
      sound: true,
      data: { type: 'revision' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: CHANNEL_ID,
    },
  });
}
