import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Task } from './types';
import { getNotificationPrefs, type NotificationPrefs } from './storage';
import { getTaskDueDateTimeEnd } from './utils/date';

// ── Android Channels ──────────────────────────────────────────────────────────

const CHANNEL_TASKS = 'tasks';
const CHANNEL_COMMUNITY = 'community';
const CHANNEL_WEEKLY = 'weekly';

export async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Promise.all([
    Notifications.setNotificationChannelAsync(CHANNEL_TASKS, {
      name: 'Task reminders',
      importance: Notifications.AndroidImportance.HIGH,
    }),
    Notifications.setNotificationChannelAsync(CHANNEL_COMMUNITY, {
      name: 'Community',
      importance: Notifications.AndroidImportance.DEFAULT,
    }),
    Notifications.setNotificationChannelAsync(CHANNEL_WEEKLY, {
      name: 'Weekly summary',
      importance: Notifications.AndroidImportance.DEFAULT,
    }),
  ]);
}

// ── Permissions ───────────────────────────────────────────────────────────────

export async function requestNotificationPermissions(): Promise<boolean> {
  await ensureNotificationChannels();
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── Task deadline notifications ───────────────────────────────────────────────

function taskNotifId(taskId: string, daysBefore: number): string {
  return `task-${taskId}-${daysBefore}d`;
}

function taskOverdueNotifId(taskId: string): string {
  return `task-${taskId}-overdue`;
}

export async function cancelTaskNotifications(taskId: string): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const prefix = `task-${taskId}-`;
  const mine = all.filter((n) => n.identifier.startsWith(prefix));
  await Promise.all(mine.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

export async function scheduleTaskNotifications(task: Task, prefs?: NotificationPrefs): Promise<void> {
  const p = prefs ?? (await getNotificationPrefs());
  if (!p.tasksEnabled || task.isDone || task.needsDate) return;

  await cancelTaskNotifications(task.id);

  const [y, m, d] = task.dueDate.split('-').map(Number);
  if (!y || !m || !d) return;

  const dueBase = new Date(y, m - 1, d, 9, 0, 0, 0);
  if (Number.isNaN(dueBase.getTime())) return;

  for (const daysBefore of p.taskLeadDays) {
    const fireDate = new Date(dueBase.getTime() - daysBefore * 864e5);
    if (fireDate.getTime() <= Date.now()) continue;

    const label =
      daysBefore === 0
        ? 'Due today'
        : daysBefore === 1
          ? 'Due tomorrow'
          : `Due in ${daysBefore} days`;

    await Notifications.scheduleNotificationAsync({
      identifier: taskNotifId(task.id, daysBefore),
      content: {
        title: `${label}: ${task.title}`,
        body: `${task.courseId} · ${task.type}`,
        sound: true,
        data: { type: 'task_reminder', taskId: task.id },
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_TASKS } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_TASKS } : {}),
      },
    });
  }

  if (p.taskOverdueEnabled) {
    const dueEnd = getTaskDueDateTimeEnd(task);
    if (dueEnd) {
      // One alert shortly after the real deadline (due date + due time), not the next calendar morning.
      const overdueFire = new Date(dueEnd.getTime() + 60_000);
      if (overdueFire.getTime() > Date.now()) {
        await Notifications.scheduleNotificationAsync({
          identifier: taskOverdueNotifId(task.id),
          content: {
            title: `Overdue: ${task.title}`,
            body: `Past due ${task.dueDate} ${(task.dueTime ?? '').slice(0, 5)} · ${task.courseId} · ${task.type}`,
            sound: true,
            data: { type: 'task_overdue', taskId: task.id },
            ...(Platform.OS === 'android' ? { channelId: CHANNEL_TASKS } : {}),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: overdueFire,
            ...(Platform.OS === 'android' ? { channelId: CHANNEL_TASKS } : {}),
          },
        });
      }
    }
  }
}

export async function rescheduleAllTaskNotifications(tasks: Task[]): Promise<void> {
  const prefs = await getNotificationPrefs();

  const all = await Notifications.getAllScheduledNotificationsAsync();
  const taskIds = all.filter((n) => n.identifier.startsWith('task-')).map((n) => n.identifier);
  await Promise.all(taskIds.map((id) => Notifications.cancelScheduledNotificationAsync(id)));

  if (!prefs.tasksEnabled) return;

  const active = tasks.filter((t) => !t.isDone && !t.needsDate);
  for (const task of active) {
    await scheduleTaskNotifications(task, prefs);
  }
}

// ── Study timer completion ────────────────────────────────────────────────────

const STUDY_TIMER_ID = 'study-timer';

export async function scheduleStudyTimerComplete(focusMinutes: number, courseId?: string): Promise<void> {
  const prefs = await getNotificationPrefs();
  if (!prefs.studyTimerEnabled) return;

  await Notifications.cancelScheduledNotificationAsync(STUDY_TIMER_ID).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: STUDY_TIMER_ID,
    content: {
      title: 'Focus session complete',
      body: courseId
        ? `${focusMinutes}min session for ${courseId} is done. Time for a break!`
        : `${focusMinutes}min focus session is done. Time for a break!`,
      sound: true,
      data: { type: 'study_complete' },
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_TASKS } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: focusMinutes * 60,
      repeats: false,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_TASKS } : {}),
    },
  });
}

export async function cancelStudyTimerNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(STUDY_TIMER_ID).catch(() => {});
}

// ── Classroom sync ────────────────────────────────────────────────────────────

export async function fireClassroomSyncNotification(newCount: number): Promise<void> {
  if (newCount <= 0) return;
  const prefs = await getNotificationPrefs();
  if (!prefs.classroomSyncEnabled) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'New Classroom tasks',
      body: `${newCount} new task${newCount !== 1 ? 's' : ''} found in Google Classroom.`,
      sound: true,
      data: { type: 'classroom_sync' },
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_TASKS } : {}),
    },
    trigger: null,
  });
}

// ── Shared task ───────────────────────────────────────────────────────────────

export async function fireSharedTaskNotification(fromName: string, taskTitle: string): Promise<void> {
  const prefs = await getNotificationPrefs();
  if (!prefs.sharedTasksEnabled) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'New shared task',
      body: `${fromName} shared "${taskTitle}" with you.`,
      sound: true,
      data: { type: 'shared_task' },
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_COMMUNITY } : {}),
    },
    trigger: null,
  });
}

// ── Weekly summary ────────────────────────────────────────────────────────────

const WEEKLY_SUMMARY_ID = 'weekly-summary';

export async function scheduleWeeklySummary(prefs?: NotificationPrefs): Promise<void> {
  const p = prefs ?? (await getNotificationPrefs());
  if (!p.weeklySummaryEnabled) {
    await cancelWeeklySummary();
    return;
  }

  await Notifications.cancelScheduledNotificationAsync(WEEKLY_SUMMARY_ID).catch(() => {});

  const [hStr, mStr] = p.weeklySummaryTime.split(':');
  const hour = parseInt(hStr, 10) || 20;
  const minute = parseInt(mStr, 10) || 0;
  const weekday = (p.weeklySummaryDay % 7) + 1; // Expo: 1=Sun … 7=Sat

  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_SUMMARY_ID,
    content: {
      title: 'Weekly summary',
      body: 'Check your progress and upcoming tasks for the week.',
      sound: true,
      data: { type: 'weekly_summary' },
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_WEEKLY } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday,
      hour,
      minute,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_WEEKLY } : {}),
    },
  });
}

export async function cancelWeeklySummary(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_SUMMARY_ID).catch(() => {});
}
