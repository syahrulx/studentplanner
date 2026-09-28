import type { TranslationKey } from '@/src/i18n';
import { toISO } from '@/src/utils/date';

/**
 * Dates and times drawn on the lock screen pictures and shown in the Studio.
 *
 * Every date is a local 'YYYY-MM-DD' string, turned into a Date at local noon.
 * `new Date('2026-09-27')` parses as UTC midnight (the previous evening west
 * of Greenwich), and noon keeps a DST shift from pushing the day either way.
 *
 * Day and month names come from the ls* comma lists rather than Intl: the
 * picture has to follow the app language, not the phone's region, and Hermes'
 * Intl coverage varies by iOS version. The one exception is the ghost clock
 * date, which imitates the system lock screen and so follows the phone.
 */

export type LockTranslate = (key: TranslationKey) => string;

const EN_DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const EN_DAYS_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const EN_DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const EN_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const EN_MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const CLOCK = /^(\d{1,2})[:.](\d{2})(?::\d{2}(?:\.\d+)?)?\s*(?:([aApP])\.?\s*[mM]\.?)?$/;
const JUST_NOW_MS = 60_000;

// ─── Translation helpers ─────────────────────────────────────────────────────

/**
 * T(key), or the English text when the key is missing. t() hands back the key
 * itself for an unknown key, and a raw 'lsAsOf' must never reach a wallpaper.
 */
export function lsText(T: LockTranslate, key: TranslationKey, fallback: string): string {
  const value = T(key);
  return value && value !== key ? value : fallback;
}

/** A comma list from i18n; the English list when it is missing or malformed. */
function lsList(T: LockTranslate, key: TranslationKey, fallback: readonly string[]): readonly string[] {
  const raw = lsText(T, key, '');
  if (!raw) return fallback;
  const parts = raw.split(',').map((p) => p.trim());
  return parts.length === fallback.length && parts.every(Boolean) ? parts : fallback;
}

/** 'Tue' / 'Sel' for 0=Sun..6=Sat. */
export function dayShortName(weekday: number, T: LockTranslate): string {
  return lsList(T, 'lsDaysShort', EN_DAYS_SHORT)[weekday] ?? '';
}

/** 'T' / 'S' for 0=Sun..6=Sat. */
export function dayInitial(weekday: number, T: LockTranslate): string {
  return lsList(T, 'lsDaysInitial', EN_DAYS_INITIAL)[weekday] ?? '';
}

/** 'Sep' / 'Sep' for month 0..11. */
export function monthShortName(month0: number, T: LockTranslate): string {
  return lsList(T, 'lsMonthsShort', EN_MONTHS_SHORT)[month0] ?? '';
}

// ─── Local dates ─────────────────────────────────────────────────────────────

/** Local noon on `dateISO`, or null when it is not 'YYYY-MM-DD'. */
export function dateFromISO(dateISO: string): Date | null {
  const m = ISO_DATE.exec(dateISO ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isoFromDate(d: Date): string {
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = dateFromISO(dateISO);
  if (!d) return dateISO;
  d.setDate(d.getDate() + days);
  return isoFromDate(d);
}

/** 0=Sun..6=Sat, or -1 when `dateISO` is not a date. */
export function weekdayOfISO(dateISO: string): number {
  return dateFromISO(dateISO)?.getDay() ?? -1;
}

/** Whole local calendar days from `fromMs` to `toMs` (DST-safe). */
function calendarDaysBetween(fromMs: number, toMs: number): number {
  const a = new Date(fromMs);
  const b = new Date(toMs);
  const dayA = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 12).getTime();
  const dayB = new Date(b.getFullYear(), b.getMonth(), b.getDate(), 12).getTime();
  return Math.round((dayB - dayA) / 864e5);
}

// ─── Times ───────────────────────────────────────────────────────────────────

/**
 * 'HH:MM' (24 h) from '8:00', '08:00:00' (Postgres `time`) or '2:30 PM';
 * null when unreadable.
 */
export function normalizeClock(value: string | null | undefined): string | null {
  const m = CLOCK.exec((value ?? '').trim());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (minute > 59) return null;
  const meridiem = m[3]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'p' ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Minutes since midnight, for sorting. Unreadable times sort last so a
 * malformed row never jumps ahead of a real 8 AM class.
 */
export function clockMinutes(value: string | null | undefined): number {
  const clock = normalizeClock(value);
  return clock ? Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3)) : 24 * 60;
}

/**
 * The OS 12/24-hour preference. Hermes may leave `hourCycle` out of
 * resolvedOptions, so fall back to `hour12` and then to formatting 13:00.
 */
export function detectUses24h(): boolean {
  try {
    const format = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });
    const { hourCycle, hour12 } = format.resolvedOptions();
    if (hourCycle) return hourCycle === 'h23' || hourCycle === 'h24';
    if (typeof hour12 === 'boolean') return !hour12;
    return format.format(new Date(2000, 0, 1, 13)).includes('13');
  } catch {
    return false;
  }
}

/**
 * Time split so the canvas can draw the suffix smaller:
 * { main: '8:00', suffix: 'AM' } or { main: '08:00', suffix: '' }.
 */
export function fmtTime(hhmm: string, uses24h: boolean, T: LockTranslate): { main: string; suffix: string } {
  const clock = normalizeClock(hhmm);
  if (!clock) return { main: (hhmm ?? '').trim(), suffix: '' };
  if (uses24h) return { main: clock, suffix: '' };
  const hour = Number(clock.slice(0, 2));
  return {
    main: `${hour % 12 || 12}:${clock.slice(3)}`,
    suffix: hour < 12 ? lsText(T, 'lsAm', 'AM') : lsText(T, 'lsPm', 'PM'),
  };
}

/** '8:00 AM' / '8:00 PG' / '08:00'. */
export function fmtTimeInline(hhmm: string, uses24h: boolean, T: LockTranslate): string {
  const { main, suffix } = fmtTime(hhmm, uses24h, T);
  return suffix ? `${main} ${suffix}` : main;
}

/** Local time of a timestamp, e.g. '7:02 AM' (for "Worked at {time}"). */
export function fmtTimeOfDay(ms: number, uses24h: boolean, T: LockTranslate): string {
  const d = new Date(ms);
  return fmtTimeInline(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, uses24h, T);
}

// ─── Dates ───────────────────────────────────────────────────────────────────

/** 'TUE · 30 SEP' */
export function fmtHeaderDate(dateISO: string, T: LockTranslate): string {
  const d = dateFromISO(dateISO);
  if (!d) return '';
  return `${dayShortName(d.getDay(), T).toUpperCase()} · ${d.getDate()} ${monthShortName(d.getMonth(), T).toUpperCase()}`;
}

/** 'TUE 30 SEP' */
export function fmtGlanceDate(dateISO: string, T: LockTranslate): string {
  const d = dateFromISO(dateISO);
  if (!d) return '';
  return `${dayShortName(d.getDay(), T).toUpperCase()} ${d.getDate()} ${monthShortName(d.getMonth(), T).toUpperCase()}`;
}

/** '29 SEP – 5 OCT', or '6 – 12 OCT' inside one month. */
export function fmtRange(startISO: string, endISO: string, T: LockTranslate): string {
  const a = dateFromISO(startISO);
  const b = dateFromISO(endISO);
  if (!a || !b) return '';
  const monthB = monthShortName(b.getMonth(), T).toUpperCase();
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()} – ${b.getDate()} ${monthB}`;
  }
  return `${a.getDate()} ${monthShortName(a.getMonth(), T).toUpperCase()} – ${b.getDate()} ${monthB}`;
}

/**
 * The system lock screen's date line in the phone's own locale, e.g.
 * 'Tuesday 30 September' or 'Tuesday, September 30'. 'short' is the compact
 * iOS 27 top row ('Tue 30 Sep').
 */
export function fmtGhostDate(dateISO: string, style: 'long' | 'short' = 'long'): string {
  const d = dateFromISO(dateISO);
  if (!d) return '';
  const long = style === 'long';
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: long ? 'long' : 'short',
      day: 'numeric',
      month: long ? 'long' : 'short',
    }).format(d);
  } catch {
    const day = (long ? EN_DAYS_LONG : EN_DAYS_SHORT)[d.getDay()];
    const month = (long ? EN_MONTHS_LONG : EN_MONTHS_SHORT)[d.getMonth()];
    return `${day} ${d.getDate()} ${month}`;
  }
}

/** 'just now' | '7:02 AM today' | 'yesterday, 7:02 AM' | 'Thu 25 Sep' */
export function fmtWhen(ms: number, now: number, T: LockTranslate, uses24h: boolean): string {
  if (Math.abs(now - ms) < JUST_NOW_MS) return lsText(T, 'lsWhenJustNow', 'just now');
  const days = calendarDaysBetween(ms, now);
  if (days === 0 || days === 1) {
    const time = fmtTimeOfDay(ms, uses24h, T);
    return days === 0
      ? lsText(T, 'lsWhenToday', '{time} today').replace('{time}', time)
      : lsText(T, 'lsWhenYesterday', 'yesterday, {time}').replace('{time}', time);
  }
  const d = new Date(ms);
  return `${dayShortName(d.getDay(), T)} ${d.getDate()} ${monthShortName(d.getMonth(), T)}`;
}

/**
 * 'as of Sat 11:40 PM': when the picture's data was read. A weekday rather
 * than "today" because the picture is looked at on later days.
 */
export function fmtAsOf(nowMs: number, T: LockTranslate, uses24h: boolean): string {
  const when = `${dayShortName(new Date(nowMs).getDay(), T)} ${fmtTimeOfDay(nowMs, uses24h, T)}`;
  return lsText(T, 'lsAsOf', 'as of {when}').replace('{when}', when);
}

/**
 * The small print under a class: its room and/or group, whichever the Show
 * tab has on. Null when there is nothing to print, so a template can drop the
 * line (and geometry can drop the taller row) instead of drawing it empty.
 */
export function lockClassDetail(
  row: { room: string | null; group: string | null },
  show: { rooms: boolean; group: boolean } | null,
): string | null {
  if (!show) return null;
  const parts = [show.rooms ? row.room : null, show.group ? row.group : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
