/**
 * Run: npx --yes tsx tests/semesterBreakPhase.test.ts
 *
 * What a student sees in the gap between two semesters.
 *
 * `getAcademicProgressFromCalendar` used to return `before_start` for every day
 * before the first lecture, which the home screen renders as "Semester not
 * started yet" — true, but it tells a student nothing about where they are. HEA
 * publishes the gap as a real row: the outgoing term 20262 carries
 * "Semester Break" running 10 Aug – 27 Sep 2026, right up to 20264's first
 * lecture on 27 September. When such a row covers today, say so.
 *
 * The fallback still matters, so it is asserted too: someone who sets up a
 * calendar months ahead, with no published break covering the day, is not on a
 * break and must keep reading "before start".
 *
 * Dates below are the real Group B 2026/2027 ones, so this doubles as a guard on
 * the semester-20264 payload in supabase-fix-uitm-20264-calendar.sql.
 */
import assert from 'node:assert/strict';
import type { AcademicCalendar } from '../src/types';

const PERIODS = [
  { type: 'break', label: 'Semester Break', startDate: '2026-08-10', endDate: '2026-09-26' },
  { type: 'lecture', label: 'All Students • Lecture', startDate: '2026-09-27', endDate: '2026-12-19' },
  { type: 'special_break', label: 'Mid-Semester Break /Special Break', startDate: '2026-12-20', endDate: '2026-12-26' },
  { type: 'lecture', label: 'Lecture', startDate: '2026-12-27', endDate: '2027-01-09' },
] as unknown as AcademicCalendar['periods'];

const CAL = {
  id: 'test',
  semesterLabel: 'UiTM (Group B) – Official HEA',
  startDate: '2026-09-27',
  endDate: '2027-01-09',
  totalWeeks: 14,
  periods: PERIODS,
  teachingWeekOffset: 0,
  selectionSource: 'automatic',
  isActive: true,
} as AcademicCalendar;

/** Same calendar with the published break removed — the fallback control. */
const CAL_NO_BREAK = {
  ...CAL,
  periods: (PERIODS ?? []).filter((p) => p.startDate !== '2026-08-10'),
} as AcademicCalendar;

const RealDate = Date;

/** Freeze "today". The function under test reads `new Date()` with no argument. */
function freezeToday(iso: string): void {
  const fixed = new RealDate(`${iso}T09:00:00`).getTime();
  class FrozenDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date>) {
      super(...((args.length ? args : [fixed]) as ConstructorParameters<typeof Date>));
    }
    static now(): number {
      return fixed;
    }
  }
  (globalThis as { Date: DateConstructor }).Date = FrozenDate as unknown as DateConstructor;
}

async function progressOn(day: string, calendar: AcademicCalendar) {
  freezeToday(day);
  try {
    // Fresh module instance per frozen clock.
    const { getAcademicProgressFromCalendar } = await import(`../src/lib/academicUtils?day=${day}`);
    return getAcademicProgressFromCalendar(calendar);
  } finally {
    (globalThis as { Date: DateConstructor }).Date = RealDate;
  }
}

async function main(): Promise<void> {
  // Inside the published break, before the semester starts.
  for (const day of ['2026-08-15', '2026-09-20', '2026-09-23', '2026-09-26']) {
    const p = await progressOn(day, CAL);
    assert.equal(p.semesterPhase, 'break_after', `${day} should read as a break`);
    assert.equal(p.isBreak, true, `${day} should set isBreak`);
  }

  // Same days with no break row published — must not claim a break.
  for (const day of ['2026-08-15', '2026-09-23']) {
    const p = await progressOn(day, CAL_NO_BREAK);
    assert.equal(p.semesterPhase, 'before_start', `${day} without a break row should stay before_start`);
    assert.equal(p.isBreak, false, `${day} without a break row must not set isBreak`);
  }

  // The break must end the moment teaching begins — 27 Sep is a lecture day.
  const first = await progressOn('2026-09-27', CAL);
  assert.equal(first.semesterPhase, 'teaching');
  assert.equal(first.week, 1);

  // And the weeks that follow are unaffected by the added row.
  for (const [day, week] of [['2026-09-28', 1], ['2026-10-04', 2], ['2026-11-15', 8]] as const) {
    const p = await progressOn(day, CAL);
    assert.equal(p.semesterPhase, 'teaching', `${day} should be teaching`);
    assert.equal(p.week, week, `${day} should be week ${week}`);
    const control = await progressOn(day, CAL_NO_BREAK);
    assert.equal(control.week, week, `${day} week must not depend on the break row`);
  }

  console.log('semesterBreakPhase: all assertions passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
