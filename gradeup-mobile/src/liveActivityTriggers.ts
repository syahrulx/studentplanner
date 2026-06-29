import { Platform } from 'react-native';
import type { Course, DayOfWeek, Task, TimetableEntry } from './types';
import type { ThemeId } from '@/constants/Themes';
import { homeWidgetThemeFromId } from './lib/homeWidgetProps';
import { getLiveActivityPrefs } from './liveActivityPrefs';
import { startOrReplaceLiveActivity, endLiveActivity, type LiveActivityInput } from './liveActivityManager';
import type { CustomThemeColors } from './storage';

const JS_TO_DAY: DayOfWeek[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// How far ahead each ambient activity starts appearing.
const NEXT_CLASS_LEAD_MS = 60 * 60 * 1000; // class starts within an hour
const ATTENDANCE_LEAD_MS = 5 * 60 * 1000; // check-in window opens 5 min before
const ATTENDANCE_GRACE_MS = 15 * 60 * 1000; // keep the check-in activity for 15 min after start
const DEADLINE_LEAD_MS = 24 * 60 * 60 * 1000; // deadline within the next day
const DAY_MS = 24 * 60 * 60 * 1000;

function parseTimeToMinutes(t: string): number | null {
  const m = String(t || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function slotLabel(e: TimetableEntry): string {
  return (e.displayName || e.subjectCode || e.subjectName || '').trim() || 'Class';
}

type TodaySlot = { startMs: number; endMs: number; label: string; location: string };

function todaySlots(timetable: TimetableEntry[], now: Date): TodaySlot[] {
  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  const dow = JS_TO_DAY[new Date(y, mo, d, 12, 0, 0).getDay()];

  const slots: TodaySlot[] = [];
  for (const e of timetable) {
    if (e.day !== dow) continue;
    const s = parseTimeToMinutes(e.startTime);
    const en = parseTimeToMinutes(e.endTime);
    if (s == null || en == null) continue;
    const startMs = new Date(y, mo, d, Math.floor(s / 60), s % 60, 0, 0).getTime();
    let endMs = new Date(y, mo, d, Math.floor(en / 60), en % 60, 0, 0).getTime();
    if (endMs <= startMs) endMs += DAY_MS; // tolerate overnight slots
    slots.push({ startMs, endMs, label: slotLabel(e), location: (e.location || '').trim() });
  }
  slots.sort((a, b) => a.startMs - b.startMs);
  return slots;
}

function nearestTaskDue(tasks: Task[], courses: Course[], nowMs: number): { title: string; subtitle: string; dueMs: number } | null {
  const courseById = new Map(courses.map((c) => [c.id, c]));
  let best: { title: string; subtitle: string; dueMs: number } | null = null;
  for (const t of tasks) {
    if (t.isDone || t.needsDate) continue;
    if (t.repeatDays && t.repeatDays.length > 0) continue;
    if (!t.dueDate) continue;
    const time = /^\d{1,2}:\d{2}/.test(t.dueTime || '') ? t.dueTime : '23:59';
    const dueMs = new Date(`${t.dueDate}T${time}:00`).getTime();
    if (!Number.isFinite(dueMs)) continue;
    if (dueMs <= nowMs || dueMs > nowMs + DEADLINE_LEAD_MS) continue;
    if (!best || dueMs < best.dueMs) {
      const course = courseById.get(t.courseId);
      best = {
        title: (t.title || 'Task').trim().slice(0, 80),
        subtitle: (course?.name || t.courseId || '').trim().slice(0, 40),
        dueMs,
      };
    }
  }
  return best;
}

export type AmbientLiveActivityInput = {
  signedIn: boolean;
  timetable: TimetableEntry[];
  tasks: Task[];
  courses: Course[];
  themeId: ThemeId;
  themePack?: string;
  spiderBlueAccents?: boolean;
  customThemeColors?: CustomThemeColors | null;
  now?: Date;
};

/**
 * Reconciles the single ambient Live Activity for the user's active mode
 * (next class, deadline, or class check-in). Study timer is started only from
 * the study timer screen. Safe to call on a timer and on data changes.
 */
export async function reconcileAmbientLiveActivities(input: AmbientLiveActivityInput): Promise<void> {
  if (Platform.OS !== 'ios') return;

  const now = input.now ?? new Date();
  const nowMs = now.getTime();

  if (!input.signedIn) {
    await endLiveActivity('attendance');
    await endLiveActivity('nextClass');
    await endLiveActivity('deadline');
    return;
  }

  const { activeMode } = await getLiveActivityPrefs();

  if (!activeMode || activeMode === 'studyTimer') {
    await endLiveActivity('attendance');
    await endLiveActivity('nextClass');
    await endLiveActivity('deadline');
    return;
  }

  const theme = homeWidgetThemeFromId(
    input.themeId,
    input.themePack,
    input.spiderBlueAccents ?? true,
    input.customThemeColors,
  );
  const themeProps: Pick<LiveActivityInput, 'accent' | 'text' | 'textSecondary'> = {
    accent: theme.primary,
    text: theme.text,
    textSecondary: theme.textSecondary,
  };

  const slots = todaySlots(input.timetable, now);

  if (activeMode !== 'attendance') await endLiveActivity('attendance');
  if (activeMode !== 'nextClass') await endLiveActivity('nextClass');
  if (activeMode !== 'deadline') await endLiveActivity('deadline');

  if (activeMode === 'attendance') {
    const checkin = slots.find(
      (s) => nowMs >= s.startMs - ATTENDANCE_LEAD_MS && nowMs < s.startMs + ATTENDANCE_GRACE_MS,
    );
    if (checkin) {
      await startOrReplaceLiveActivity('attendance', {
        title: checkin.label,
        subtitle: checkin.location || 'Tap to record attendance',
        startMs: checkin.startMs - ATTENDANCE_LEAD_MS,
        endMs: checkin.startMs,
        ...themeProps,
      });
    } else {
      await endLiveActivity('attendance');
    }
    return;
  }

  if (activeMode === 'nextClass') {
    const upcoming = slots.find((s) => nowMs < s.endMs && nowMs >= s.startMs - NEXT_CLASS_LEAD_MS);
    if (upcoming) {
      const ongoing = nowMs >= upcoming.startMs;
      await startOrReplaceLiveActivity('nextClass', {
        title: upcoming.label,
        subtitle: ongoing
          ? upcoming.location || 'In progress'
          : upcoming.location || 'Starts soon',
        startMs: ongoing ? upcoming.startMs : upcoming.startMs - NEXT_CLASS_LEAD_MS,
        endMs: ongoing ? upcoming.endMs : upcoming.startMs,
        ...themeProps,
      });
    } else {
      await endLiveActivity('nextClass');
    }
    return;
  }

  if (activeMode === 'deadline') {
    const due = nearestTaskDue(input.tasks, input.courses, nowMs);
    if (due) {
      await startOrReplaceLiveActivity('deadline', {
        title: due.title,
        subtitle: due.subtitle || 'Due soon',
        startMs: nowMs,
        endMs: due.dueMs,
        ...themeProps,
      });
    } else {
      await endLiveActivity('deadline');
    }
  }
}
