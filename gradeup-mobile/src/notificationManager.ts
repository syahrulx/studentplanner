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
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

// ── Task deadline notifications ───────────────────────────────────────────────

// iOS caps pending local notifications at 64 per app and silently discards the
// overflow. Every module works to a share: tasks 24, attendance 24, revision 4,
// weekly/timer/postpone 3 — 55 of 64, leaving headroom.
const MAX_TASK_NOTIFICATIONS = 24;
// Reminders further out than this aren't booked yet. The app re-seeds on every
// foreground, so a task due next month claims its slot as the date approaches
// instead of squatting on one for weeks.
const TASK_HORIZON_DAYS = 14;

function taskNotifId(taskId: string, daysBefore: number): string {
  return `task-${taskId}-${daysBefore}d`;
}

function taskOverdueNotifId(taskId: string): string {
  return `task-${taskId}-overdue`;
}

/** ID for one weekday-recurring notification on a specific weekday (0..6). */
function taskRepeatNotifId(taskId: string, dow: number): string {
  return `task-${taskId}-repeat-${dow}`;
}

export async function cancelTaskNotifications(taskId: string): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const prefix = `task-${taskId}-`;
  const mine = all.filter((n) => n.identifier.startsWith(prefix));
  await Promise.all(mine.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

export async function cancelAllTaskNotifications(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const mine = all.filter((n) => n.identifier.startsWith('task-'));
  await Promise.all(mine.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

type PlannedTaskNotif = {
  id: string;
  /** When this will next fire. Drives horizon filtering and nearest-first ordering. */
  fireAt: Date;
  title: string;
  body: string;
  data: Record<string, unknown>;
  /** Weekly repeats stay recurring; everything else is a one-shot on `fireAt`. */
  weekly?: { weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; hour: number; minute: number };
};

/** Next time a weekly slot comes round. expo weekday is 1..7 with Sunday = 1. */
function nextWeeklyOccurrence(expoWeekday: number, hour: number, minute: number, from: Date): Date {
  const targetDow = expoWeekday - 1; // JS getDay(): 0 = Sunday
  const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hour, minute, 0, 0);
  let delta = (targetDow - candidate.getDay() + 7) % 7;
  if (delta === 0 && candidate.getTime() <= from.getTime()) delta = 7;
  return new Date(candidate.getTime() + delta * 864e5);
}

/** Everything this task wants to fire, without touching the OS. */
function planTaskNotifications(task: Task, p: NotificationPrefs, now: Date): PlannedTaskNotif[] {
  if (!p.tasksEnabled || task.needsDate) return [];
  const planned: PlannedTaskNotif[] = [];
  const courseLine = task.courseId ? `${task.courseId} · ${task.type}` : String(task.type ?? '');

  // ── Recurring "Repeat" to-dos ──────────────────────────────────────────
  // No single due date — a weekly-repeating notification on each selected
  // weekday at the task's due time. Opted into via "Remind me each day".
  const repeatDays = Array.isArray(task.repeatDays) ? task.repeatDays : [];
  if (repeatDays.length > 0) {
    if (!task.repeatNotify) return [];
    const [hhStr, mmStr] = (task.dueTime || '09:00').split(':');
    const hour = Math.min(23, Math.max(0, Number(hhStr) || 9));
    const minute = Math.min(59, Math.max(0, Number(mmStr) || 0));
    for (const dow of repeatDays) {
      if (!Number.isInteger(dow) || dow < 0 || dow > 6) continue;
      const weekday = ((dow + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7);
      planned.push({
        id: taskRepeatNotifId(task.id, dow),
        fireAt: nextWeeklyOccurrence(weekday, hour, minute, now),
        title: task.title,
        body: courseLine,
        data: { type: 'task_repeat', taskId: task.id, dow },
        weekly: { weekday, hour, minute },
      });
    }
    return planned;
  }

  if (task.isDone) return [];

  const [y, m, d] = task.dueDate.split('-').map(Number);
  if (!y || !m || !d) return [];

  const [hStr, mmStr] = (p.taskReminderTime || '09:00').split(':');
  const rHour = parseInt(hStr, 10) || 9;
  const rMin = parseInt(mmStr, 10) || 0;

  const dueBase = new Date(y, m - 1, d, rHour, rMin, 0, 0);
  if (Number.isNaN(dueBase.getTime())) return [];

  for (const daysBefore of p.taskLeadDays) {
    const fireAt = new Date(dueBase.getTime() - daysBefore * 864e5);
    if (fireAt.getTime() <= now.getTime()) continue;
    const label =
      daysBefore === 0
        ? 'Due today'
        : daysBefore === 1
          ? 'Due tomorrow'
          : `Due in ${daysBefore} days`;
    planned.push({
      id: taskNotifId(task.id, daysBefore),
      fireAt,
      title: `${label}: ${task.title}`,
      body: `${task.courseId} · ${task.type}`,
      data: { type: 'task_reminder', taskId: task.id },
    });
  }

  if (p.taskOverdueEnabled) {
    const dueEnd = getTaskDueDateTimeEnd(task);
    if (dueEnd) {
      // One alert shortly after the real deadline (due date + due time), not the next calendar morning.
      const overdueFire = new Date(dueEnd.getTime() + 60_000);
      if (overdueFire.getTime() > now.getTime()) {
        planned.push({
          id: taskOverdueNotifId(task.id),
          fireAt: overdueFire,
          title: `Overdue: ${task.title}`,
          body: `Past due ${task.dueDate} ${(task.dueTime ?? '').slice(0, 5)} · ${task.courseId} · ${task.type}`,
          data: { type: 'task_overdue', taskId: task.id },
        });
      }
    }
  }

  return planned;
}

/** Anything further out than the horizon is left for a later re-seed to claim. */
function withinHorizon(planned: PlannedTaskNotif, now: Date): boolean {
  return planned.fireAt.getTime() <= now.getTime() + TASK_HORIZON_DAYS * 864e5;
}

async function schedulePlanned(planned: PlannedTaskNotif): Promise<void> {
  const content = {
    title: planned.title,
    body: planned.body,
    sound: true,
    data: planned.data,
    ...(Platform.OS === 'android' ? { channelId: CHANNEL_TASKS } : {}),
  };
  const trigger = planned.weekly
    ? {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY as const,
        weekday: planned.weekly.weekday,
        hour: planned.weekly.hour,
        minute: planned.weekly.minute,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_TASKS } : {}),
      }
    : {
        type: Notifications.SchedulableTriggerInputTypes.DATE as const,
        date: planned.fireAt,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_TASKS } : {}),
      };
  await Notifications.scheduleNotificationAsync({ identifier: planned.id, content, trigger });
}

export async function scheduleTaskNotifications(task: Task, prefs?: NotificationPrefs): Promise<void> {
  const p = prefs ?? (await getNotificationPrefs());
  if (!p.tasksEnabled || task.needsDate) return;

  await cancelTaskNotifications(task.id);

  const now = new Date();
  for (const planned of planTaskNotifications(task, p, now)) {
    if (!withinHorizon(planned, now)) continue;
    await schedulePlanned(planned);
  }
}

export async function rescheduleAllTaskNotifications(tasks: Task[]): Promise<void> {
  const prefs = await getNotificationPrefs();

  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  const taskIds = (all ?? []).filter((n) => n.identifier.startsWith('task-')).map((n) => n.identifier);
  await Promise.all(
    taskIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})),
  );

  if (!prefs.tasksEnabled) return;

  const active = tasks.filter((t) => {
    if (t.needsDate) return false;
    // Recurring tasks aren't gated by `isDone` — that flag is irrelevant for
    // them. The recurring branch inside `planTaskNotifications` handles the
    // `repeatNotify` opt-out instead.
    const isRecurring = Array.isArray(t.repeatDays) && t.repeatDays.length > 0;
    if (isRecurring) return true;
    return !t.isDone;
  });

  // Plan everything first, then keep only the soonest MAX_TASK_NOTIFICATIONS.
  // Scheduling task-by-task let a student with 27 open tasks claim ~108 of the
  // 64 slots iOS allows, pushing out class check-ins and study reminders with
  // no error anywhere — the overflow just never fired.
  const now = new Date();
  const planned = active
    .flatMap((task) => planTaskNotifications(task, prefs, now))
    .filter((entry) => withinHorizon(entry, now))
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
    .slice(0, MAX_TASK_NOTIFICATIONS);

  for (const entry of planned) {
    await schedulePlanned(entry);
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
