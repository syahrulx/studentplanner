/**
 * A student's own class attendance for the current semester, built from their
 * class check-ins (class_attendance_events) and their timetable.
 *
 * Kept free of React Native imports so it runs in a plain test: the calendar
 * and timetable parsing it needs is passed in by the caller (see
 * useAttendanceStats), which uses the same helpers the check-in reminders do.
 */

export type AttendanceEventLike = {
  timetableEntryId: string;
  scheduledStartAt: string;
  status: 'present' | 'absent' | 'cancelled';
  subjectCode: string;
  subjectName: string;
};

export type TimetableEntryLike = {
  id: string;
  day: string;
  startTime: string;
  subjectCode: string;
  subjectName: string;
  displayName?: string;
};

export type AttendanceCounts = {
  present: number;
  absent: number;
  cancelled: number;
  /** Classes whose day is over with no check-in answered. */
  notAnswered: number;
  /** present ÷ (present + absent), 0–100, or null before any is recorded. */
  percent: number | null;
};

export type SubjectAttendance = AttendanceCounts & {
  key: string;
  code: string;
  name: string;
};

export type AttendanceStats = {
  overall: AttendanceCounts;
  subjects: SubjectAttendance[];
};

export type AttendanceStatsHelpers = {
  /** 0 = Sunday … 6 = Saturday, or null when the day can't be read. */
  weekdayIndex: (day: string) => number | null;
  parseTime: (time: string) => { hour: number; minute: number } | null;
  /** False on breaks, exam weeks and anything else the calendar says has no classes. */
  isClassDay: (date: Date) => boolean;
};

const WEEK_MS = 7 * 864e5;

function subjectKey(code: string, name: string): string {
  const c = code.trim().toUpperCase();
  return c || name.trim().toUpperCase() || 'CLASS';
}

/** Same minute, whatever the milliseconds or timezone suffix. */
function minuteKey(iso: string): string | null {
  const t = Date.parse(String(iso || '').trim());
  if (!Number.isFinite(t)) return null;
  return new Date(Math.floor(t / 60_000) * 60_000).toISOString();
}

function percentOf(present: number, absent: number): number | null {
  const counted = present + absent;
  return counted > 0 ? Math.round((present / counted) * 100) : null;
}

export function computeAttendanceStats(input: {
  events: AttendanceEventLike[];
  timetable: TimetableEntryLike[];
  /** First day of the semester, YYYY-MM-DD. */
  semesterStartISO: string;
  /**
   * The student's very first check-in, ever. "Not answered" counts from that
   * day, not from the semester start: someone who installed the app in week 6
   * never had a chance to answer weeks 1 to 5. Null = never answered one, so
   * nothing counts as not answered.
   */
  firstCheckinAt: string | null;
  now: Date;
  helpers: AttendanceStatsHelpers;
}): AttendanceStats {
  const { events, timetable, semesterStartISO, firstCheckinAt, now, helpers } = input;
  const semesterStart = new Date(`${semesterStartISO.slice(0, 10)}T00:00:00`);
  const startMs = semesterStart.getTime();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const bySubject = new Map<string, SubjectAttendance>();
  const subjectFor = (code: string, name: string): SubjectAttendance => {
    const key = subjectKey(code, name);
    let row = bySubject.get(key);
    if (!row) {
      row = { key, code: code.trim().toUpperCase(), name: name.trim(), present: 0, absent: 0, cancelled: 0, notAnswered: 0, percent: null };
      bySubject.set(key, row);
    } else if (!row.name && name.trim()) {
      row.name = name.trim();
    }
    return row;
  };

  // Every subject on the timetable gets a row, with its name, before any
  // check-in is counted: check-ins often carry the code alone.
  for (const entry of timetable) {
    subjectFor(entry.subjectCode || '', (entry.displayName || entry.subjectName || '').trim());
  }

  // One answer per class: the last one wins, keyed like the database's
  // unique index (entry + start time).
  const answers = new Map<string, AttendanceEventLike>();
  for (const ev of events) {
    const at = minuteKey(ev.scheduledStartAt);
    if (!at) continue;
    const t = Date.parse(at);
    if (!Number.isFinite(startMs) || t < startMs || t >= now.getTime() + WEEK_MS) continue;
    answers.set(`${ev.timetableEntryId}|${at}`, ev);
  }

  // A class also counts as answered when the same subject has an answer at the
  // same minute under another entry id: re-importing a timetable gives every
  // row a new id, and that must not turn answered classes into unanswered ones.
  const answeredBySubjectMinute = new Set<string>();
  for (const [key, ev] of answers) {
    const at = key.slice(key.indexOf('|') + 1);
    answeredBySubjectMinute.add(`${subjectKey(ev.subjectCode, ev.subjectName)}|${at}`);
    const row = subjectFor(ev.subjectCode, ev.subjectName);
    row[ev.status] += 1;
  }

  // Classes that were due: every timetable slot on every class day from the
  // later of the semester start and the first check-in, until yesterday.
  // Today's are left out because a check-in can still be answered until midnight.
  const firstMs = Date.parse(String(firstCheckinAt ?? ''));
  const firstDay = Number.isFinite(firstMs)
    ? (() => { const f = new Date(firstMs); return new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime(); })()
    : NaN;
  const dueFromMs = Math.max(startMs, firstDay);
  if (Number.isFinite(dueFromMs) && dueFromMs < todayStart) {
    const seen = new Set<string>();
    for (const entry of timetable) {
      const weekday = helpers.weekdayIndex(entry.day);
      const time = helpers.parseTime(entry.startTime);
      if (weekday == null || !time) continue;
      const code = entry.subjectCode || '';
      const name = (entry.displayName || entry.subjectName || '').trim();
      const sKey = subjectKey(code, name);

      const first = new Date(semesterStart);
      first.setDate(first.getDate() + ((weekday - first.getDay() + 7) % 7));
      for (let d = new Date(first); d.getTime() < todayStart; d.setDate(d.getDate() + 7)) {
        const startsAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), time.hour, time.minute);
        if (d.getTime() < dueFromMs) continue;
        if (!helpers.isClassDay(startsAt)) continue;
        const at = startsAt.toISOString();
        // Two rows for one class (a duplicated import) are one class.
        const slot = `${sKey}|${at}`;
        if (seen.has(slot)) continue;
        seen.add(slot);
        if (answers.has(`${entry.id}|${at}`) || answeredBySubjectMinute.has(slot)) continue;
        subjectFor(code, name).notAnswered += 1;
      }
    }
  }

  const subjects = [...bySubject.values()]
    .map((row) => ({ ...row, percent: percentOf(row.present, row.absent) }))
    .sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));

  const overall = subjects.reduce<AttendanceCounts>(
    (sum, row) => ({
      present: sum.present + row.present,
      absent: sum.absent + row.absent,
      cancelled: sum.cancelled + row.cancelled,
      notAnswered: sum.notAnswered + row.notAnswered,
      percent: null,
    }),
    { present: 0, absent: 0, cancelled: 0, notAnswered: 0, percent: null },
  );
  overall.percent = percentOf(overall.present, overall.absent);

  return { overall, subjects };
}

/** UiTM counts absences per subject (three can bring a warning letter); others use a minimum %. */
export type AttendanceRule =
  | { kind: 'absences'; limit: number }
  | { kind: 'percent'; limit: number };

export type SubjectWarning = { level: 'over' | 'near'; text: string } | null;

export function subjectWarning(row: SubjectAttendance, rule: AttendanceRule): SubjectWarning {
  if (rule.kind === 'absences') {
    if (row.absent >= rule.limit) {
      return { level: 'over', text: `${row.absent} absences · you may get a warning letter` };
    }
    if (row.absent === rule.limit - 1 && row.absent > 0) {
      return { level: 'near', text: `${row.absent} absences · 1 more and you may get a warning letter` };
    }
    return null;
  }
  if (row.percent == null) return null;
  if (row.percent < rule.limit) return { level: 'over', text: `${row.percent}% · below ${rule.limit}%` };
  if (row.percent < rule.limit + 5) return { level: 'near', text: `${row.percent}% · close to ${rule.limit}%` };
  return null;
}
