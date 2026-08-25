import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { IosAuthorizationStatus } from 'expo-notifications';
import type { AcademicCalendar, TimetableEntry } from './types';
import {
  attendanceOccurrenceKey,
  ensureAttendanceCategory,
  getAnsweredOccurrenceSet,
  isAttendanceCheckinExpired,
} from './attendanceRecording';
import { getAcademicProgressFromCalendar } from './lib/academicUtils';
import { getNotificationPrefs } from './storage';

// Android channel importance cannot be changed once created.
// Bump the channel id so existing installs get a fresh HIGH-importance channel (restores popup/banner).
const CHANNEL_ATTENDANCE = 'attendance_checkin_v2';
// Legacy LOW-importance sibling. It used to carry check-ins when the user turned
// the toggle off — that "off but still delivered" behaviour is gone, so the
// channel is deleted on startup instead of created.
const CHANNEL_ATTENDANCE_SILENT = 'attendance_checkin_silent_v1';
const ID_PREFIX = 'attendance-';

// iOS caps pending local notifications at 64 per app. Leave headroom for task +
// revision + push schedules so auto-generated (UiTM) timetables — which expand
// to many occurrences across the horizon — don't silently drop the soonest
// classes once the budget is exhausted. We keep the NEAREST occurrences.
const MAX_ATTENDANCE_NOTIFICATIONS = 40;

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
  // Align with `timetableParsers/uitm` DAY_MAP — portal / CDN sometimes uses Malay labels.
  const alias: Record<string, WeekdayLabel> = {
    isnin: 'Monday',
    mon: 'Monday',
    monday: 'Monday',
    selasa: 'Tuesday',
    tue: 'Tuesday',
    tues: 'Tuesday',
    tuesday: 'Tuesday',
    rabu: 'Wednesday',
    wed: 'Wednesday',
    wednesday: 'Wednesday',
    khamis: 'Thursday',
    thu: 'Thursday',
    thur: 'Thursday',
    thurs: 'Thursday',
    thursday: 'Thursday',
    jumaat: 'Friday',
    jumat: 'Friday',
    fri: 'Friday',
    friday: 'Friday',
    sabtu: 'Saturday',
    sat: 'Saturday',
    saturday: 'Saturday',
    ahad: 'Sunday',
    sun: 'Sunday',
    sunday: 'Sunday',
  };
  if (alias[s]) return alias[s];
  for (const d of WEEKDAY_LABELS) {
    if (d.toLowerCase() === s) return d;
  }
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

/** Same shapes as UiTM `normalizeTime` — student-portal rows often use AM/PM or 0800 without a colon. */
function parseHHMM(raw: string): { hour: number; minute: number } | null {
  let t = String(raw || '').trim();
  if (!t) return null;

  const amPm = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (amPm) {
    let h = parseInt(amPm[1], 10);
    const minute = parseInt(amPm[2], 10);
    const p = amPm[3].toLowerCase();
    if (p === 'pm' && h < 12) h += 12;
    if (p === 'am' && h === 12) h = 0;
    if (Number.isFinite(h) && Number.isFinite(minute) && minute >= 0 && minute <= 59 && h >= 0 && h <= 23) {
      return { hour: h, minute };
    }
    return null;
  }

  t = t.replace(/\s+/g, '').replace('.', ':');
  if (/^\d{4}$/.test(t)) {
    t = t.slice(0, 2) + ':' + t.slice(2);
  }

  const m = /^(\d{1,2})\s*:?\s*(\d{2})$/.exec(t);
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

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateInRange(date: string, start: string | undefined, end: string | undefined): boolean {
  if (!start || !end) return false;
  return date >= start.slice(0, 10) && date <= end.slice(0, 10);
}

/**
 * Last teaching day implied by `startDate` + `totalWeeks` (+ the week-align
 * offset), for calendars that never stored an explicit `endDate`.
 * Mirrors `getAcademicProgress`: the semester is measured from the Sunday that
 * opens week 1, and week N ends on the Saturday of that week.
 */
function teachingEndFromWeeks(calendar: AcademicCalendar): string | null {
  const trimmed = (calendar.startDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const raw = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(raw.getTime())) return null;
  const totalWeeks = Math.max(1, Number(calendar.totalWeeks) || 14);
  const offset = Math.trunc(Number(calendar.teachingWeekOffset) || 0);
  // currentWeek = rawWeek + offset, so teaching runs out `offset` weeks earlier.
  const weeks = totalWeeks - offset;
  if (weeks < 1) return null;
  const sunday = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate() - raw.getDay());
  return localDateKey(addDays(sunday, weeks * 7 - 1));
}

/**
 * True when the user's own calendar says the semester is over — study week,
 * exam period or semester break. Derived here (not just passed in by the
 * caller) because most reschedule triggers — foreground resume, timetable
 * edits, initial load — have no reason to know the semester phase, and used to
 * re-seed check-ins that the break kill-switch had just cancelled.
 */
function calendarIndicatesSemesterBreak(calendar: AcademicCalendar | null | undefined): boolean {
  if (!calendar) return false;
  const progress = getAcademicProgressFromCalendar(calendar);
  return progress.semesterPhase === 'break_after' || progress.isBreak;
}

/**
 * Conservative calendar gate: suppress only when the user's own active
 * calendar clearly identifies the date as outside teaching. If calendar data
 * is absent or incomplete, reminders continue instead of guessing.
 */
function isLectureDate(date: Date, calendar: AcademicCalendar | null | undefined): boolean {
  if (!calendar) return true;
  const key = localDateKey(date);
  if (calendar.startDate && key < calendar.startDate.slice(0, 10)) return false;
  if (calendar.endDate && key > calendar.endDate.slice(0, 10)) return false;
  if (dateInRange(key, calendar.breakStartDate, calendar.breakEndDate)) return false;

  const periods = Array.isArray(calendar.periods) ? calendar.periods : [];
  if (periods.length === 0) {
    // No periods and no endDate: the calendar is just `startDate` + `totalWeeks`,
    // which used to read as "teaching forever" and kept class check-ins firing
    // right through the semester break. Derive the last teaching day instead.
    // Only safe here — with periods present, the lecture gate below is exact,
    // and a weeks-derived cut-off would wrongly suppress lecture dates that
    // mid-semester breaks pushed past week `totalWeeks`.
    if (calendar.endDate) return true;
    const lastTeachingDay = teachingEndFromWeeks(calendar);
    return !lastTeachingDay || key <= lastTeachingDay;
  }
  const matching = periods.filter((period) => dateInRange(key, period.startDate, period.endDate));
  if (matching.some((period) => period.type !== 'lecture')) return false;
  const hasLecturePeriods = periods.some((period) => period.type === 'lecture');
  return !hasLecturePeriods || matching.some((period) => period.type === 'lecture');
}

export async function ensureAttendanceChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ATTENDANCE, {
    name: 'Class attendance',
    importance: Notifications.AndroidImportance.HIGH,
  });
  // Drop the legacy silent sibling on upgrade — nothing posts to it any more,
  // and leaving it behind shows a dead "Class attendance (silent)" row in the
  // Android app notification settings.
  await Notifications.deleteNotificationChannelAsync(CHANNEL_ATTENDANCE_SILENT).catch(() => {});
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

/**
 * Clear check-ins whose class day has already passed. A check-in is only
 * answerable on the day, so a stale one sitting in the notification shade is
 * dead weight — and tapping it used to still record attendance days later.
 * Runs on every reschedule trigger (app load, foreground resume, timetable edit).
 */
export async function dismissExpiredAttendanceCheckins(): Promise<void> {
  const [presented, scheduled] = await Promise.all([
    Notifications.getPresentedNotificationsAsync().catch(() => []),
    Notifications.getAllScheduledNotificationsAsync().catch(() => []),
  ]);
  await Promise.all([
    ...(presented ?? []).map(async (notification) => {
      const request = notification.request;
      const data = request.content?.data as Record<string, unknown> | undefined;
      if (data?.type !== 'attendance_checkin') return;
      if (!isAttendanceCheckinExpired(String(data.scheduledStartAt ?? ''))) return;
      await Notifications.dismissNotificationAsync(request.identifier).catch(() => {});
    }),
    ...(scheduled ?? []).map(async (entry) => {
      const { id, data } = requestFromScheduledEntry(entry as any);
      if (!id || data?.type !== 'attendance_checkin') return;
      if (!isAttendanceCheckinExpired(String(data.scheduledStartAt ?? ''))) return;
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    }),
  ]);
}

/** Remove pending and already-presented check-ins for exact timetable rows. */
export async function cancelAttendanceNotificationsForEntries(entryIds: string[]): Promise<void> {
  const ids = new Set(entryIds.map((id) => String(id).trim()).filter(Boolean));
  if (ids.size === 0) return;
  const [scheduled, presented] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync().catch(() => []),
    Notifications.getPresentedNotificationsAsync().catch(() => []),
  ]);
  await Promise.all([
    ...(scheduled ?? []).map(async (entry) => {
      const request = requestFromScheduledEntry(entry);
      const timetableEntryId = String(request.data?.timetableEntryId ?? '');
      if (!request.id || !ids.has(timetableEntryId)) return;
      await Notifications.cancelScheduledNotificationAsync(request.id).catch(() => {});
    }),
    ...(presented ?? []).map(async (notification) => {
      const request = notification.request;
      const timetableEntryId = String(request.content.data?.timetableEntryId ?? '');
      if (!request.identifier || !ids.has(timetableEntryId)) return;
      await Notifications.dismissNotificationAsync(request.identifier).catch(() => {});
    }),
  ]);
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

type PlannedOccurrence = {
  entry: TimetableEntry;
  scheduledStartAt: Date;
  fireAt: Date;
  subject: string;
  subjectKey: string;
};

export async function rescheduleAttendanceNotifications(
  userId: string,
  timetable: TimetableEntry[],
  opts?: { horizonDays?: number; semesterBreak?: boolean; academicCalendar?: AcademicCalendar | null },
): Promise<void> {
  rescheduleQueue = rescheduleQueue
    .catch(() => {})
    .then(async () => {
      // Both run ahead of the early returns below, so the legacy silent channel
      // is retired and yesterday's check-ins are swept even for users whose
      // check-ins are switched off or who are on semester break.
      await ensureAttendanceChannel().catch(() => {});
      await dismissExpiredAttendanceCheckins().catch(() => {});

      // Read prefs before anything else: both switches below are hard stops
      // that must also clear whatever is already pending.
      const prefs = await getNotificationPrefs().catch(() => null);
      const checkinsEnabled = prefs?.attendanceCheckinPopup ?? true;
      const pauseOutsideLecturePeriods = prefs?.pauseAttendanceOutsideLecturePeriods ?? true;

      if (!checkinsEnabled) {
        await cancelAllAttendanceNotifications();
        if (__DEV__) console.log('[attendance] skip reschedule: class check-ins turned off');
        return;
      }
      // `opts.semesterBreak` is the caller's own read of the semester phase
      // (from the user profile); the derived check covers every caller that has
      // no reason to know it. Both answer to the same "Pause outside lecture
      // weeks" switch — otherwise a caller passing the flag would cancel
      // check-ins that the very next reschedule puts straight back.
      const inBreak =
        opts?.semesterBreak === true || calendarIndicatesSemesterBreak(opts?.academicCalendar);
      if (pauseOutsideLecturePeriods && inBreak) {
        await cancelAllAttendanceNotifications();
        if (__DEV__) console.log('[attendance] skip reschedule: semester break / exam period');
        return;
      }

      const perm = await Notifications.getPermissionsAsync();
      if (!localNotificationsAllowed(perm)) {
        if (__DEV__) {
          console.log(
            '[attendance] skip reschedule: notification permission not granted',
            { granted: perm.granted },
          );
        }
        return;
      }

      await ensureAttendanceCategory().catch(() => {});
      await cancelAllAttendanceNotifications();

      const androidChannelId = CHANNEL_ATTENDANCE;

      const horizonDays = Math.max(1, Math.min(31, Number(opts?.horizonDays ?? 14)));
      const now = new Date();
      const today = startOfDay(now);
      const answered = await getAnsweredOccurrenceSet().catch(() => new Set<string>());
      const scheduledCanon = new Set<string>();

      // PHASE 1: enumerate every valid future occurrence (no OS calls yet).
      // We need all of them up-front so we can sort by fireAt and keep only the
      // NEAREST MAX_ATTENDANCE_NOTIFICATIONS slots — iOS caps pending locals at
      // 64 and a semester-wide UiTM timetable easily blows past that.
      let skippedBadDayOrTime = 0;
      const planned: PlannedOccurrence[] = [];

      for (const entry of timetable) {
        const day = normalizeWeekday(entry.day);
        const time = parseHHMM(entry.startTime);
        if (!day || !time) {
          skippedBadDayOrTime += 1;
          continue;
        }

        for (let i = 0; i <= horizonDays; i++) {
          const d = addDays(today, i);
          const weekdayLabel = WEEKDAY_LABELS[d.getDay()];
          if (weekdayLabel !== day) continue;

          const scheduledStartAt = new Date(
            d.getFullYear(), d.getMonth(), d.getDate(), time.hour, time.minute, 0, 0,
          );
          if (pauseOutsideLecturePeriods && !isLectureDate(scheduledStartAt, opts?.academicCalendar)) continue;
          // Exact wall-clock offset: trigger fires when (now >= classStart - 5min), i.e. at T−5 minutes.
          const fireAt = new Date(scheduledStartAt.getTime() - 5 * 60_000);
          if (fireAt.getTime() <= Date.now()) continue;
          if (answered.has(attendanceOccurrenceKey(entry.id, scheduledStartAt.toISOString()))) continue;

          const subjectKey = subjectKeyFromEntry(entry);
          const slotMs = Math.round(scheduledStartAt.getTime() / (5 * 60_000)) * (5 * 60_000);
          const canonKey = `${subjectKey}|${slotMs}`;
          if (scheduledCanon.has(canonKey)) continue;
          scheduledCanon.add(canonKey);

          const subject = (entry.displayName || entry.subjectName || entry.subjectCode || 'Class').trim();
          planned.push({ entry, scheduledStartAt, fireAt, subject, subjectKey });
        }
      }

      // Sort ASC by fire time so the nearest classes always get scheduled,
      // even when the timetable is bigger than MAX_ATTENDANCE_NOTIFICATIONS.
      planned.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
      const budgeted = planned.slice(0, MAX_ATTENDANCE_NOTIFICATIONS);
      const dropped = planned.length - budgeted.length;

      // PHASE 2: schedule with per-iteration try/catch. A single bad entry must
      // never poison the whole batch — that's the failure mode that makes
      // auto-generated (UiTM) timetables appear to have "no notifications".
      let scheduledOk = 0;
      let scheduledFailed = 0;
      for (const p of budgeted) {
        try {
          await Notifications.scheduleNotificationAsync({
            identifier: notifIdForOccurrence(p.subjectKey, p.fireAt.getTime()),
            content: {
              title: 'Class check-in',
              body: `Did you attend class "${p.subject}" in 5 more minutes?`,
              sound: true,
              categoryIdentifier: 'attendance_checkin',
              data: {
                type: 'attendance_checkin',
                userId,
                timetableEntryId: p.entry.id,
                scheduledStartAt: p.scheduledStartAt.toISOString(),
                fireAtMs: p.fireAt.getTime(),
                subjectCode: p.entry.subjectCode ?? '',
                subjectName: p.entry.subjectName ?? '',
                subjectKey: p.subjectKey,
                displaySubject: p.subject,
              },
              ...(Platform.OS === 'android' ? { channelId: androidChannelId } : {}),
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: p.fireAt,
              ...(Platform.OS === 'android' ? { channelId: androidChannelId } : {}),
            },
          });
          scheduledOk += 1;
        } catch (err) {
          scheduledFailed += 1;
          if (__DEV__) {
            console.error('[attendance] scheduleNotificationAsync failed', {
              entryId: p.entry.id,
              subject: p.subject,
              fireAt: p.fireAt.toISOString(),
              err,
            });
          }
        }
      }

      if (__DEV__) {
        console.log('[attendance] reschedule summary', {
          timetableRows: timetable.length,
          skippedBadDayOrTime,
          plannedOccurrences: planned.length,
          dropped,
          scheduledOk,
          scheduledFailed,
          horizonDays,
          cap: MAX_ATTENDANCE_NOTIFICATIONS,
        });
      }
    });

  return rescheduleQueue;
}
