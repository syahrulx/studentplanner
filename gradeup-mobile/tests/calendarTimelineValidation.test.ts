/**
 * Run: npx --yes tsx tests/calendarTimelineValidation.test.ts
 *
 * Fixtures are the real UKM rows from `university_calendar_offers` that caused report
 * 7fd88c4a ("all of the calendar options end on mid semester break").
 */
import assert from 'node:assert/strict';
import { validateCalendarTimeline } from '../src/lib/calendarTimelineValidation';

/** Offer c20e1194 — complete Semester 1 2026/2027, must publish without complaint. */
const goodTimeline = [
  { type: 'registration', label: 'Registration', startDate: '2026-09-19', endDate: '2026-09-27' },
  { type: 'lecture', label: 'Lectures', startDate: '2026-09-28', endDate: '2026-11-08' },
  { type: 'break', label: 'Mid Semester Break', startDate: '2026-11-09', endDate: '2026-11-15' },
  { type: 'lecture', label: 'Lectures', startDate: '2026-11-16', endDate: '2027-01-10' },
  { type: 'revision', label: 'Revision Break', startDate: '2027-01-11', endDate: '2027-01-17' },
  { type: 'exam', label: 'Examinations', startDate: '2027-01-18', endDate: '2027-02-07' },
  { type: 'break', label: 'Semester Break', startDate: '2027-02-08', endDate: '2027-02-28' },
];

assert.deepEqual(
  validateCalendarTimeline({
    periods: goodTimeline,
    startDate: '2026-09-28',
    endDate: '2027-02-07',
  }),
  [],
);

/** Offer 02d3bbde — the broken one: lectures after the mid-semester break were never captured. */
const brokenTimeline = [
  { type: 'registration', label: 'Registration for New Students', startDate: '2026-09-14', endDate: '2026-09-27' },
  { type: 'lecture', label: 'Lectures', startDate: '2026-09-28', endDate: '2026-11-08' },
  { type: 'holiday', label: 'Deepavali', startDate: '2026-11-08', endDate: '2026-11-08' },
  { type: 'break', label: 'Mid Semester Break', startDate: '2026-11-09', endDate: '2026-11-15' },
  { type: 'holiday', label: 'Deepavali Holiday', startDate: '2026-11-09', endDate: '2026-11-09' },
  { type: 'exam', label: 'Examinations', startDate: '2027-01-18', endDate: '2027-02-07' },
];

const brokenProblems = validateCalendarTimeline({
  periods: brokenTimeline,
  startDate: '2026-09-28',
  endDate: '2026-11-08',
});
assert.equal(brokenProblems.length, 1);
assert.match(brokenProblems[0], /63 days are missing between 2026-11-15 and 2027-01-18/);

/** Nested holidays sit inside other blocks and must never be read as a gap. */
assert.deepEqual(
  validateCalendarTimeline({
    periods: [
      { type: 'lecture', label: 'Lectures', startDate: '2026-09-28', endDate: '2026-12-20' },
      { type: 'holiday', label: 'Deepavali', startDate: '2026-11-08', endDate: '2026-11-08' },
    ],
    startDate: '2026-09-28',
    endDate: '2026-12-20',
  }),
  [],
);

/** The eight UKM rows with `periods_json` empty — the case that made every option look identical. */
const empty = validateCalendarTimeline({ periods: [], startDate: '2026-09-19', endDate: '2027-02-08' });
assert.equal(empty.length, 1);
assert.match(empty[0], /no timeline/);
assert.deepEqual(
  validateCalendarTimeline({ periods: null, startDate: '2026-09-19', endDate: '2027-02-08' }),
  empty,
);

/** A timeline that stops short of the stated semester end. */
const short = validateCalendarTimeline({
  periods: [{ type: 'lecture', label: 'Lectures', startDate: '2026-09-28', endDate: '2026-11-08' }],
  startDate: '2026-09-28',
  endDate: '2027-02-07',
});
assert.equal(short.length, 1);
assert.match(short[0], /stops on 2026-11-08 but the semester runs to 2027-02-07/);

/** Malformed entries are reported before the structural checks run. */
assert.match(
  validateCalendarTimeline({
    periods: [{ type: 'lecture', label: 'Lectures', startDate: '28/09/2026', endDate: '2026-11-08' }],
    startDate: '2026-09-28',
    endDate: '2026-11-08',
  })[0],
  /valid start and end dates/,
);
assert.match(
  validateCalendarTimeline({
    periods: [{ type: 'lecture', label: 'Lectures', startDate: '2026-11-08', endDate: '2026-09-28' }],
    startDate: '2026-09-28',
    endDate: '2026-11-08',
  })[0],
  /ends before it starts/,
);

/** Teaching weeks are counted from lecture periods, so a timeline without one is unusable. */
assert.match(
  validateCalendarTimeline({
    periods: [{ type: 'break', label: 'Semester Break', startDate: '2026-09-28', endDate: '2027-02-07' }],
    startDate: '2026-09-28',
    endDate: '2027-02-07',
  })[0],
  /no lecture period/,
);


/**
 * Real extraction output for UKM's ASASIpintar Semester 1: the ten-week lecture block after the
 * mid-semester test was dropped, but three public holidays fell inside the hole it left. Counting
 * holidays as coverage split one 77-day gap into sub-threshold pieces and reported 52 days, which
 * also disagreed with the bar drawn from the same periods.
 */
const holidaysMaskingAGap = [
  { type: 'registration', label: 'Lapor Diri Pelajar Baru dan MMP', startDate: '2026-06-22', endDate: '2026-06-24' },
  { type: 'lecture', label: 'Sesi Pembelajaran', startDate: '2026-06-29', endDate: '2026-08-16' },
  { type: 'break', label: 'Cuti Pertengahan Semester', startDate: '2026-08-17', endDate: '2026-08-23' },
  { type: 'test', label: 'Peperiksaan Pertengahan Semester', startDate: '2026-08-24', endDate: '2026-08-30' },
  { type: 'holiday', label: 'Hari Kebangsaan', startDate: '2026-08-31', endDate: '2026-08-31' },
  { type: 'holiday', label: 'Hari Malaysia', startDate: '2026-09-16', endDate: '2026-09-16' },
  { type: 'holiday', label: 'Hari Deepavali', startDate: '2026-11-08', endDate: '2026-11-09' },
  { type: 'exam', label: 'Peperiksaan Akhir', startDate: '2026-11-16', endDate: '2026-11-22' },
  { type: 'break', label: 'Cuti Semester', startDate: '2026-11-23', endDate: '2026-12-06' },
];

const masked = validateCalendarTimeline({
  periods: holidaysMaskingAGap,
  startDate: '2026-06-29',
  endDate: '2026-08-16',
});
assert.equal(masked.length, 1);
assert.match(masked[0], /77 days are missing between 2026-08-30 and 2026-11-16/);

/** Holidays alone are not a semester. */
assert.match(
  validateCalendarTimeline({
    periods: [{ type: 'holiday', label: 'Deepavali', startDate: '2026-11-08', endDate: '2026-11-08' }],
    startDate: '2026-09-28',
    endDate: '2027-02-07',
  })[0],
  /only lists public holidays/,
);

console.log('calendarTimelineValidation: all assertions passed');
