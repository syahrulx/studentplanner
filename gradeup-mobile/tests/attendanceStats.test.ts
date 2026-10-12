/**
 * Run: npx --yes tsx tests/attendanceStats.test.ts
 *
 * The profile's attendance section: counts per subject, "not answered" for
 * classes with no check-in, and the UiTM three-absence warning.
 */
import assert from 'node:assert/strict';

import {
  computeAttendanceStats,
  subjectWarning,
  type AttendanceEventLike,
  type AttendanceStatsHelpers,
} from '../src/lib/attendanceStats';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const helpers: AttendanceStatsHelpers = {
  weekdayIndex: (day) => {
    const i = DAYS.indexOf(day.toLowerCase());
    return i < 0 ? null : i;
  },
  parseTime: (t) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
  },
  // Week of 2026-10-04 is a mid-semester break.
  isClassDay: (d) => !(d >= new Date(2026, 9, 4) && d < new Date(2026, 9, 11)),
};

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();
const ev = (
  id: string,
  when: string,
  status: AttendanceEventLike['status'],
  code: string,
): AttendanceEventLike => ({ timetableEntryId: id, scheduledStartAt: when, status, subjectCode: code, subjectName: '' });

const timetable = [
  { id: 'a', day: 'Monday', startTime: '08:00', subjectCode: 'MGT555', subjectName: 'Analisis Perniagaan' },
  { id: 'b', day: 'Wednesday', startTime: '10:00', subjectCode: 'ECO653', subjectName: 'Ekonomi Perindustrian' },
];

// Semester starts Sun 2026-09-20; "now" is Mon 2026-10-12 at 07:00.
// Mondays due: 21 Sep, 28 Sep, (5 Oct is the break). 12 Oct is today, not counted yet.
// Wednesdays due: 23 Sep, 30 Sep, (7 Oct is the break).
const now = new Date(2026, 9, 12, 7, 0);
const stats = computeAttendanceStats({
  events: [
    ev('a', at(2026, 9, 21, 8), 'present', 'MGT555'),
    ev('old-id', at(2026, 9, 28, 8), 'absent', 'mgt555'), // re-imported timetable: different id, same class
    ev('b', at(2026, 9, 23, 10), 'cancelled', 'ECO653'),
    ev('b', at(2026, 8, 1, 10), 'absent', 'ECO653'), // last semester, ignored
  ],
  timetable,
  semesterStartISO: '2026-09-20',
  firstCheckinAt: at(2026, 4, 1, 9), // answered check-ins last semester already
  now,
  helpers,
});

const mgt = stats.subjects.find((s) => s.code === 'MGT555')!;
assert.equal(mgt.name, 'Analisis Perniagaan');
assert.deepEqual([mgt.present, mgt.absent, mgt.notAnswered, mgt.percent], [1, 1, 0, 50]);

const eco = stats.subjects.find((s) => s.code === 'ECO653')!;
assert.deepEqual([eco.present, eco.absent, eco.cancelled, eco.notAnswered, eco.percent], [0, 0, 1, 1, null]);

assert.deepEqual(stats.overall, { present: 1, absent: 1, cancelled: 1, notAnswered: 1, percent: 50 });

// UiTM: three absences in one subject.
const row = { ...mgt, absent: 2 };
assert.equal(subjectWarning(row, { kind: 'absences', limit: 3 })?.level, 'near');
assert.equal(subjectWarning({ ...mgt, absent: 3 }, { kind: 'absences', limit: 3 })?.level, 'over');
assert.equal(subjectWarning({ ...mgt, absent: 1 }, { kind: 'absences', limit: 3 }), null);

// Others: a minimum percent.
assert.equal(subjectWarning({ ...mgt, percent: 75 }, { kind: 'percent', limit: 80 })?.level, 'over');
assert.equal(subjectWarning({ ...mgt, percent: 82 }, { kind: 'percent', limit: 80 })?.level, 'near');
assert.equal(subjectWarning({ ...mgt, percent: 95 }, { kind: 'percent', limit: 80 }), null);
assert.equal(subjectWarning({ ...mgt, percent: null }, { kind: 'percent', limit: 80 }), null);

// No semester start: nothing is due, nothing breaks.
const empty = computeAttendanceStats({ events: [], timetable, semesterStartISO: '', firstCheckinAt: null, now, helpers });

// Installed mid-semester: first check-in on Mon 28 Sep. The Monday and
// Wednesday before it are not "not answered"; Wed 30 Sep still is.
const late = computeAttendanceStats({
  events: [ev('a', at(2026, 9, 28, 8), 'present', 'MGT555')],
  timetable,
  semesterStartISO: '2026-09-20',
  firstCheckinAt: at(2026, 9, 28, 8),
  now,
  helpers,
});
assert.equal(late.subjects.find((s) => s.code === 'MGT555')!.notAnswered, 0);
assert.equal(late.subjects.find((s) => s.code === 'ECO653')!.notAnswered, 1);

// Never answered a check-in: nothing is "not answered".
const never = computeAttendanceStats({ events: [], timetable, semesterStartISO: '2026-09-20', firstCheckinAt: null, now, helpers });
assert.equal(never.overall.notAnswered, 0);
assert.deepEqual(empty.overall, { present: 0, absent: 0, cancelled: 0, notAnswered: 0, percent: null });

console.log('attendanceStats: all tests passed');
