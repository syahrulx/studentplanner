import type { TranslationKey } from '@/src/i18n';
import type { AppLanguage } from '@/src/storage';
import type { AcademicCalendar, AcademicPeriod, Course, DayOfWeek, SharedTask, Task, TimetableEntry } from '@/src/types';
import { getPostTeachingKind, type PostTeachingKind } from '@/src/lib/academicUtils';
import { teachingWeekNumberForDate } from '@/src/lib/academicWeek';
import { contrastText } from '@/src/lib/contrast';
import { expandTasksForDate, isRecurringTask } from '@/src/lib/recurringTasks';
import { normalizeTime } from '@/src/lib/taskUtils';
import { getTimetableEntryColor } from '@/src/lib/timetableSlotColors';
import {
  addDaysISO,
  clockMinutes,
  dayInitial,
  dayShortName,
  fmtAsOf,
  fmtGlanceDate,
  fmtHeaderDate,
  fmtRange,
  fmtTimeInline,
  lockClassDetail,
  lsText,
  normalizeClock,
  weekdayOfISO,
  type LockTranslate,
} from './lockScreenFormat';
import type {
  LockClassRow,
  LockNextClass,
  LockScreenConfig,
  LockScreenDayModel,
  LockTaskRow,
  LockWeekCell,
  LockWeekChip,
} from './types';

/**
 * What each lock screen picture shows, as plain data: one model per upcoming
 * day plus an undated fallback. Pure, so the render host, the Studio preview
 * and the tests all draw from exactly the same thing.
 *
 * A model's signature decides whether its picture is redrawn, so every field
 * here has to be deterministic for the same inputs. The only clock-dependent
 * field, `asOf`, is left out of the signature.
 */

/** Bump when a template's drawing changes, so every live picture is redrawn. */
export const LOCK_SCREEN_TEMPLATE_VERSION = 2;

/** today..today+6: the intent serves the fallback past the last one. */
const RENDER_DAYS = 7;
/** How far ahead "Next: Wed 8:00 AM" looks on a day with no classes. */
const NEXT_CLASS_LOOKAHEAD_DAYS = 14;
/**
 * teachingWeekNumberForDate clamps to its cap, so a teaching-length cap would
 * hide every study, exam and break week of a calendar without published rows
 * (those with rows are read from the rows). 60 is past any semester.
 */
const UNCLAMPED_WEEK_CAP = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_NAMES: readonly DayOfWeek[] = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

export interface LockScreenModelInput {
  timetable: readonly TimetableEntry[];
  /** Already merged with accepted shared tasks (collectLockScreenTasks). */
  tasks: Task[];
  courses: readonly Course[];
  subjectColors: Record<string, string>;
  getSubjectColor: (courseId: string) => string;
  isTaskDoneOn: (t: Task, dateISO: string) => boolean;
  /** academicCalendar with totalWeeks replaced, exactly as Home builds it. */
  pulseCalendar: AcademicCalendar | null;
  totalWeeks: number;
  startDate: string | null;
  /**
   * Part of the shared input but not read: the profile's week is only right
   * for today, and a picture for next Tuesday needs that day's own week.
   */
  currentWeek: number;
  weekStartsOn: 'monday' | 'sunday';
  /** Part of the shared input; the language already reaches the model through T. */
  language: AppLanguage;
  T: (k: TranslationKey) => string;
  /** When the data was read; only feeds `asOf`. */
  nowMs: number;
  uses24h: boolean;
}

interface PeriodInfo {
  weekLabel: string | null;
  noClassesPeriod: boolean;
}

const NO_PERIOD: PeriodInfo = { weekLabel: null, noClassesPeriod: false };

/** Per-input work shared by the 7 day models and the fallback. */
interface Derived {
  /** Index 0=Sun..6=Sat, each sorted by start time. */
  classesByWeekday: LockClassRow[][];
  chipsByWeekday: LockWeekChip[][];
  periods: Map<string, PeriodInfo>;
}

// Keyed on the input object, so treat an input as immutable once built.
const derivedCache = new WeakMap<LockScreenModelInput, Derived>();

// ─── Classes ─────────────────────────────────────────────────────────────────

function classRow(e: TimetableEntry, subjectColors: Record<string, string>, onlineLabel: string): LockClassRow {
  const code = (e.subjectCode ?? '').trim();
  const subjectName = (e.subjectName ?? '').trim();
  const label = (e.displayName ?? '').trim() || code || subjectName;
  const location = (e.location ?? '').trim();
  const group = (e.group ?? '').trim();
  // No room (empty or "-") is an online class, exactly as the timetable grid
  // labels it. A bare number reads as a group only with the G; a section code
  // like "CS2305A" already says what it is.
  const room = location && location !== '-' ? location : onlineLabel;
  const groupLabel = group && group !== '-' ? (/^\d+$/.test(group) ? `G${group}` : group) : null;
  const color = getTimetableEntryColor(e, subjectColors);
  return {
    key: e.id,
    start: normalizeClock(e.startTime) ?? (e.startTime ?? '').trim(),
    end: normalizeClock(e.endTime) ?? (e.endTime ?? '').trim(),
    label,
    name: subjectName && subjectName !== label ? subjectName : null,
    room,
    group: groupLabel,
    color,
    onColor: contrastText(color),
  };
}

function derive(input: LockScreenModelInput): Derived {
  const cached = derivedCache.get(input);
  if (cached) return cached;

  const classesByWeekday: LockClassRow[][] = WEEKDAY_NAMES.map(() => []);
  const sorted = [...input.timetable].sort(
    (a, b) =>
      clockMinutes(a.startTime) - clockMinutes(b.startTime) ||
      clockMinutes(a.endTime) - clockMinutes(b.endTime) ||
      compareText(a.id, b.id),
  );
  for (const e of sorted) {
    const weekday = WEEKDAY_NAMES.indexOf(e.day);
    if (weekday >= 0) classesByWeekday[weekday].push(classRow(e, input.subjectColors, lsText(input.T, 'timetableRoomOnline', 'Online')));
  }
  const chipsByWeekday = classesByWeekday.map((rows) =>
    rows.map((r) => ({ label: r.label.slice(0, 6), color: r.color, onColor: r.onColor })),
  );

  const derived: Derived = { classesByWeekday, chipsByWeekday, periods: new Map() };
  derivedCache.set(input, derived);
  return derived;
}

// ─── Week label ──────────────────────────────────────────────────────────────

function breakPeriod(kind: PostTeachingKind | null, T: LockTranslate): PeriodInfo {
  const key = kind === 'study' ? 'studyWeek' : kind === 'exam' ? 'examWeek' : 'semesterBreak';
  return { weekLabel: T(key).toUpperCase(), noClassesPeriod: true };
}

/**
 * A published break row covering the day. HEA publishes the gap before a
 * semester as the outgoing term's "Semester Break", and Home already reads
 * that as a break rather than "not started" (getAcademicProgressFromCalendar).
 */
function inPublishedBreak(calendar: AcademicCalendar | null, dateISO: string): boolean {
  return (calendar?.periods ?? []).some(
    (p) =>
      (p.type === 'break' || p.type === 'special_break') &&
      String(p.startDate ?? '').slice(0, 10) <= dateISO &&
      dateISO <= String(p.endDate ?? '').slice(0, 10),
  );
}

type CalendarDayKind = 'teaching' | PostTeachingKind;

/**
 * Strongest first, for a day several periods cover: a mid-semester test inside
 * lecture weeks is still a teaching day, and UiTM files its revision week
 * alongside an EET "test" row. A test outside lecture weeks is the finals
 * (UiTM files those as 'test' too). Orientation, holidays and the like say
 * nothing about classes, so they don't decide.
 */
const PERIOD_KINDS: readonly (readonly [readonly string[], CalendarDayKind])[] = [
  [['lecture'], 'teaching'],
  [['revision'], 'study'],
  [['exam', 'test'], 'exam'],
  [['break', 'special_break'], 'semester_break'],
];

function kindOfPeriods(periods: readonly AcademicPeriod[], dates: readonly string[]): CalendarDayKind | null {
  const types = new Set<string>();
  for (const p of periods) {
    const start = String(p.startDate ?? '').slice(0, 10);
    const end = String(p.endDate ?? '').slice(0, 10);
    if (dates.some((d) => start <= d && d <= end)) types.add(String(p.type));
  }
  return PERIOD_KINDS.find(([kinds]) => kinds.some((k) => types.has(k)))?.[1] ?? null;
}

/**
 * What a published calendar says about one day: its own periods first, then
 * its Sun–Sat week (the planner's week), so the weekend before revision week
 * reads as revision rather than falling through a gap between rows. null when
 * the calendar says nothing: past its last row, or a hole in it.
 */
function calendarDayKind(periods: readonly AcademicPeriod[], dateISO: string): CalendarDayKind | null {
  const own = kindOfPeriods(periods, [dateISO]);
  if (own) return own;
  const sunday = addDaysISO(dateISO, -weekdayOfISO(dateISO));
  return kindOfPeriods(periods, Array.from({ length: 7 }, (_, i) => addDaysISO(sunday, i)));
}

function computePeriod(input: LockScreenModelInput, dateISO: string): PeriodInfo {
  const { pulseCalendar, startDate, totalWeeks, T } = input;
  const semStart = (pulseCalendar?.startDate ?? startDate ?? '').trim().slice(0, 10);
  if (!ISO_DATE.test(semStart)) return NO_PERIOD;
  if (dateISO < semStart) {
    // Without a published break the timetable may well be next semester's
    // already, so draw it; with one, a class on the picture would be a lie.
    return inPublishedBreak(pulseCalendar, dateISO) ? breakPeriod('semester_break', T) : NO_PERIOD;
  }
  const raw = teachingWeekNumberForDate(dateISO, pulseCalendar, startDate, UNCLAMPED_WEEK_CAP, 0);
  const weekN = (n: number): PeriodInfo => ({
    weekLabel: lsText(T, 'lsWeekN', 'WEEK {n}').replace('{n}', String(n)),
    noClassesPeriod: false,
  });

  const periods = pulseCalendar?.periods ?? [];
  if (periods.length > 0) {
    // A published calendar counts only lecture weeks, so `raw` stalls through
    // mid-semester breaks and stops at the last lecture week: it never passes
    // totalWeeks and can't tell revision from finals. The rows themselves can.
    // Where they say nothing, draw the classes without a week, the same as
    // before the semester with no published break (and the planner's "Week -").
    const kind = calendarDayKind(periods, dateISO);
    if (kind == null) return NO_PERIOD;
    if (kind !== 'teaching') return breakPeriod(kind, T);
    return raw ? weekN(raw) : NO_PERIOD;
  }

  if (!raw) return NO_PERIOD;
  if (raw <= totalWeeks) return weekN(raw);
  // Past the last week with only the profile's start date to go on, the date
  // is far more likely stale than the semester over. Hiding the classes would
  // leave a student with a blank lock screen for good, so only a real
  // calendar may declare study, exam or break weeks.
  if (!pulseCalendar) return NO_PERIOD;
  return breakPeriod(getPostTeachingKind(raw, totalWeeks), T);
}

function periodOf(input: LockScreenModelInput, derived: Derived, dateISO: string): PeriodInfo {
  let info = derived.periods.get(dateISO);
  if (!info) {
    info = computePeriod(input, dateISO);
    derived.periods.set(dateISO, info);
  }
  return info;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

/** Same label Home puts next to a task (formatSubjectName in (tabs)/index.tsx). */
function courseLabel(courseId: string, courses: readonly Course[]): string {
  if (/^gc-course-/i.test(courseId ?? '')) {
    return courses.find((c) => c.id === courseId)?.name ?? courseId.replace(/^gc-course-/i, '');
  }
  return courseId ?? '';
}

function taskRowsFor(input: LockScreenModelInput, dateISO: string): LockTaskRow[] {
  const { T, uses24h } = input;
  return expandTasksForDate(input.tasks, dateISO)
    .filter((t) => !t.parentTaskId && !t.needsDate && !input.isTaskDoneOn(t, dateISO))
    .map((t) => ({ t, time: normalizeTime(t.dueTime) }))
    // Title and id break ties so the order, and with it the signature, never
    // depends on how the task list happened to be ordered.
    .sort((a, b) => compareText(a.time, b.time) || compareText(a.t.title, b.t.title) || compareText(a.t.id, b.t.id))
    .map(({ t, time }) => ({
      key: t.id,
      title: (t.title ?? '').trim(),
      trailing: time !== '23:59' ? fmtTimeInline(time, uses24h, T) : courseLabel(t.courseId, input.courses),
      color: input.getSubjectColor(t.courseId ?? ''),
    }));
}

/**
 * One-off tasks still open from before D. Recurring tasks are left out: a
 * missed daily to-do is not a deadline. Shown as a count only, which stays
 * honest on future days because completing one re-renders every picture.
 */
function overdueCountFor(tasks: readonly Task[], dateISO: string): number {
  let count = 0;
  for (const t of tasks) {
    if (t.isDone || t.parentTaskId || t.needsDate || isRecurringTask(t)) continue;
    const due = (t.dueDate ?? '').slice(0, 10);
    if (ISO_DATE.test(due) && due < dateISO) count += 1;
  }
  return count;
}

// ─── Day model ───────────────────────────────────────────────────────────────

function nextClassAfter(input: LockScreenModelInput, derived: Derived, dateISO: string): LockNextClass | null {
  for (let i = 1; i <= NEXT_CLASS_LOOKAHEAD_DAYS; i++) {
    const day = addDaysISO(dateISO, i);
    if (periodOf(input, derived, day).noClassesPeriod) continue;
    const weekday = weekdayOfISO(day);
    const first = derived.classesByWeekday[weekday]?.[0];
    if (first) {
      return {
        dayShort: dayShortName(weekday, input.T),
        time: fmtTimeInline(first.start, input.uses24h, input.T),
        label: first.label,
        room: first.room,
        group: first.group,
      };
    }
  }
  return null;
}

function weekCell(
  input: LockScreenModelInput,
  derived: Derived,
  weekday: number,
  day: { dateISO: string; focusISO: string } | null,
): LockWeekCell {
  const offDay = day != null && periodOf(input, derived, day.dateISO).noClassesPeriod;
  const chips = offDay ? [] : derived.chipsByWeekday[weekday].slice();
  return {
    dateISO: day?.dateISO ?? '',
    dayShort: dayShortName(weekday, input.T).toUpperCase(),
    initial: dayInitial(weekday, input.T),
    dayNum: day ? Number(day.dateISO.slice(8, 10)) : 0,
    isFocus: day != null && day.dateISO === day.focusISO,
    isPast: day != null && day.dateISO < day.focusISO,
    chips,
    hasClasses: chips.length > 0,
    firstColor: chips[0]?.color ?? null,
  };
}

function firstWeekday(input: LockScreenModelInput): number {
  return input.weekStartsOn === 'sunday' ? 0 : 1;
}

export function lockScreenRenderDates(todayISO: string): string[] {
  return Array.from({ length: RENDER_DAYS }, (_, i) => addDaysISO(todayISO, i));
}

/** The picture for `dateISO`. An unreadable date gets the undated fallback. */
export function buildLockScreenDayModel(input: LockScreenModelInput, dateISO: string): LockScreenDayModel {
  const focus = (dateISO ?? '').slice(0, 10);
  const weekday = weekdayOfISO(focus);
  if (weekday < 0) return buildLockScreenFallbackModel(input);

  const { T, uses24h } = input;
  const derived = derive(input);
  const period = periodOf(input, derived, focus);
  const classes = period.noClassesPeriod ? [] : derived.classesByWeekday[weekday].slice();

  const start = firstWeekday(input);
  const weekStartISO = addDaysISO(focus, -((weekday - start + 7) % 7));
  const week = Array.from({ length: 7 }, (_, i) =>
    weekCell(input, derived, (start + i) % 7, { dateISO: addDaysISO(weekStartISO, i), focusISO: focus }),
  );

  return {
    kind: 'day',
    dateISO: focus,
    weekday,
    headerDate: fmtHeaderDate(focus, T),
    glanceDate: fmtGlanceDate(focus, T),
    weekLabel: period.weekLabel,
    noClassesPeriod: period.noClassesPeriod,
    classes,
    tasks: taskRowsFor(input, focus),
    overdueCount: overdueCountFor(input.tasks, focus),
    next: classes.length ? null : nextClassAfter(input, derived, focus),
    week,
    weekRange: fmtRange(week[0].dateISO, week[6].dateISO, T),
    asOf: fmtAsOf(input.nowMs, T, uses24h),
    uses24h,
  };
}

/**
 * Served when no dated picture covers today (Rencana not opened for a week).
 * Nothing in it can go stale: no dates, no "today", no tasks, just the weekly
 * timetable in the student's usual week order.
 */
export function buildLockScreenFallbackModel(input: LockScreenModelInput): LockScreenDayModel {
  const derived = derive(input);
  const start = firstWeekday(input);
  return {
    kind: 'fallback',
    dateISO: null,
    weekday: -1,
    headerDate: '',
    glanceDate: '',
    weekLabel: null,
    noClassesPeriod: false,
    classes: [],
    tasks: [],
    overdueCount: 0,
    next: null,
    week: Array.from({ length: 7 }, (_, i) => weekCell(input, derived, (start + i) % 7, null)),
    weekRange: '',
    asOf: '',
    uses24h: input.uses24h,
  };
}

/** Every model the host draws in one pass, plus the dates in serve order. */
export function buildLockScreenModels(
  input: LockScreenModelInput,
  todayISO: string,
): { dates: string[]; days: Record<string, LockScreenDayModel>; fallback: LockScreenDayModel } {
  const dates = lockScreenRenderDates(todayISO);
  const days: Record<string, LockScreenDayModel> = {};
  for (const d of dates) days[d] = buildLockScreenDayModel(input, d);
  return { dates, days, fallback: buildLockScreenFallbackModel(input) };
}

// ─── Shared tasks ────────────────────────────────────────────────────────────

function isSharedTaskFor(value: unknown, recipientId: string | null): value is SharedTask & { task: Task } {
  if (!value || typeof value !== 'object') return false;
  const st = value as Partial<SharedTask>;
  return st.recipient_id === recipientId && st.task != null && typeof st.task === 'object';
}

/**
 * Own tasks plus accepted shared ones, merged the way Home does
 * ((tabs)/index.tsx `allTasks`) so the lock screen never disagrees with it.
 * `acceptedSharedTasks` is CommunityContext's SharedTask[]; the recipient's
 * own tick decides whether a shared task is done.
 */
export function collectLockScreenTasks(
  tasks: Task[],
  acceptedSharedTasks: unknown[] | null,
  communityUserId: string | null,
): Task[] {
  if (!acceptedSharedTasks?.length) return tasks;
  const ownIds = new Set(tasks.map((t) => t.id));
  const shared: Task[] = [];
  for (const st of acceptedSharedTasks) {
    if (isSharedTaskFor(st, communityUserId) && !ownIds.has(st.task_id)) {
      shared.push({ ...st.task, isDone: st.recipient_completed });
    }
  }
  return shared.length ? [...tasks, ...shared] : tasks;
}

// ─── Signature ───────────────────────────────────────────────────────────────

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** JSON with sorted object keys, so equal data always hashes the same. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const fields = Object.keys(obj)
      .filter((k) => obj[k] !== undefined && typeof obj[k] !== 'function')
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
    return `{${fields.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** FNV-1a 32-bit over UTF-16 code units, as 8 hex digits. */
export function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Everything that changes the pixels of one picture. Equal signatures mean
 * the live file can be carried forward instead of redrawn.
 *
 * `photoStamp` is anything that changes when the photo file does (its
 * modification time); it only counts while the background is the photo.
 */
export function lockScreenSignature(
  model: LockScreenDayModel,
  config: LockScreenConfig,
  env: { W: number; H: number; scale: number; accent: string; photoStamp: string | null },
): string {
  return fnv1a32(
    stableStringify({
      v: LOCK_SCREEN_TEMPLATE_VERSION,
      W: env.W,
      H: env.H,
      scale: env.scale,
      uses24h: model.uses24h,
      accent: env.accent,
      ink: config.panel,
      bg: config.background,
      photo:
        config.background === 'photo' && config.photoPath ? `${config.photoPath}:${env.photoStamp ?? ''}` : null,
      dim: config.dim,
      top: config.top,
      topFrac: config.topFrac,
      size: config.size,
      show: config.show,
      template: config.template,
      model: { ...model, asOf: undefined },
    }),
  );
}

// ─── Words ───────────────────────────────────────────────────────────────────

function sentenceCase(text: string): string {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * "Next: Mon 8:00 AM · CSC301", plus the room/group the Show tab has on. On a
 * day with no classes this is the only line they can appear in, so without it
 * the Rooms switch would seem to do nothing on weekends.
 */
export function lockScreenNextLine(
  next: LockNextClass,
  T: LockTranslate,
  show: { rooms: boolean; group: boolean } | null,
): string {
  const line = lsText(T, 'lsNextLine', 'Next: {day} {time} · {subject}')
    .replace('{day}', next.dayShort)
    .replace('{time}', next.time)
    .replace('{subject}', next.label);
  const detail = lockClassDetail(next, show);
  return detail ? `${line} · ${detail}` : line;
}

/**
 * The empty-block title for a day with no classes, in the Today template's
 * order: the break name, then "Free day" on a weekend or "All clear" on a
 * weekday when nothing is due either, otherwise "No classes today".
 */
export function lockScreenEmptyTitle(model: LockScreenDayModel, T: LockTranslate): string {
  if (model.noClassesPeriod && model.weekLabel) {
    // The model keeps the pill's upper-case label; find its proper-case source.
    const key = (['studyWeek', 'examWeek', 'semesterBreak'] as const).find(
      (k) => T(k).toUpperCase() === model.weekLabel,
    );
    return key ? T(key) : sentenceCase(model.weekLabel);
  }
  if (model.tasks.length === 0) {
    return model.weekday === 0 || model.weekday === 6
      ? lsText(T, 'lsFreeDay', 'Free day. Recharge.')
      : lsText(T, 'lsAllClear', 'All clear');
  }
  return lsText(T, 'lsNoClasses', 'No classes today');
}

/** VoiceOver has no business reading "middle dot"; a comma pauses the same way. */
function speakable(text: string): string {
  return text.replace(/\s+·\s+/g, ', ').trim();
}

function joinSentences(parts: string[]): string {
  return parts
    .map(speakable)
    .filter(Boolean)
    .map((s) => (/[.!?…]$/.test(s) ? s : `${s}.`))
    .join(' ');
}

/**
 * What the picture says, for VoiceOver on the preview, e.g.
 * "Week 5. First 8:00 AM, CSC301, then 2 more. 2 due. 1 overdue."
 */
export function lockScreenA11ySummary(model: LockScreenDayModel, T: (k: TranslationKey) => string): string {
  if (model.kind === 'fallback') {
    return joinSentences([
      sentenceCase(lsText(T, 'lsYourWeek', 'YOUR WEEK')),
      lsText(T, 'lsFallbackFooter', 'Open Rencana to refresh'),
    ]);
  }

  const parts: string[] = [];
  if (model.weekLabel && !model.noClassesPeriod) parts.push(sentenceCase(model.weekLabel));

  const first = model.classes[0];
  if (first) {
    let line = lsText(T, 'lsFirstLine', 'First {time} · {subject}')
      .replace('{time}', fmtTimeInline(first.start, model.uses24h, T))
      .replace('{subject}', first.label);
    if (model.classes.length > 1) {
      line += `, ${lsText(T, 'lsThenMore', 'then {n} more').replace('{n}', String(model.classes.length - 1))}`;
    }
    parts.push(line);
  } else {
    parts.push(lockScreenEmptyTitle(model, T));
    if (model.next) parts.push(lockScreenNextLine(model.next, T, null));
  }

  if (model.tasks.length > 0) {
    parts.push(lsText(T, 'lsDueCount', '{n} due').replace('{n}', String(model.tasks.length)));
  } else if (first || model.noClassesPeriod) {
    // With no classes and nothing due, the title already said "Free day" or "All clear".
    parts.push(lsText(T, 'lsNothingDue', 'Nothing due. Nice.'));
  }
  if (model.overdueCount > 0) {
    parts.push(lsText(T, 'lsOverdueCount', '{n} overdue').replace('{n}', String(model.overdueCount)));
  }
  return joinSentences(parts);
}
