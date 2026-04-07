import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { RevisionSettings, RevisionDay } from './storage';

const REVISION_MAIN_ID = 'revision-main';
const REVISION_POSTPONE_ID = 'revision-postpone';
const CHANNEL_ID = 'revision';

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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureRevisionChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Study reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
}

export async function requestRevisionPermissions(): Promise<boolean> {
  await ensureRevisionChannel();
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function cancelAllRevisionNotifications(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REVISION_MAIN_ID);
  await Notifications.cancelScheduledNotificationAsync(REVISION_POSTPONE_ID);
}

/** Schedule notification from revision settings (once = single date, repeated = daily or weekly). */
export async function scheduleRevisionNotification(settings: RevisionSettings): Promise<void> {
  await cancelAllRevisionNotifications();
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
    data: { type: 'revision' },
  };
  if (settings.repeat === 'once' && settings.singleDate) {
    const [y, m, d] = settings.singleDate.split('-').map(Number);
    const date = new Date(y, m - 1, d, hour, minute, 0);
    if (date.getTime() > Date.now()) {
      await Notifications.scheduleNotificationAsync({
        identifier: REVISION_MAIN_ID,
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          channelId: CHANNEL_ID,
        },
      });
    }
    return;
  }
  if (settings.day === 'Every day') {
    await Notifications.scheduleNotificationAsync({
      identifier: REVISION_MAIN_ID,
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
      identifier: REVISION_MAIN_ID,
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
}

/** Schedule a one-time revision reminder (for postpone, minutes from now). */
export async function schedulePostponedRevision(minutesFromNow: number): Promise<void> {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutesFromNow);
  await scheduleRevisionAtDate(date);
}

/** Schedule a one-time revision reminder at a specific date/time (for postpone). */
export async function scheduleRevisionAtDate(date: Date): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REVISION_POSTPONE_ID);
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
