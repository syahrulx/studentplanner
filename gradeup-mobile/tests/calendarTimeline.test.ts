/**
 * Run: npx --yes tsx tests/calendarTimeline.test.ts
 *
 * Fixtures are the real UKM calendars behind report 7fd88c4a — the complete Semester 1 2026/2027
 * and the broken one that jumped from the mid-semester break to the final exams.
 */
import assert from 'node:assert/strict';
import {
  parsePeriodsJson,
  summarizeTimeline,
  termStatus,
  timelineSegments,
  toAcademicPeriods,
  groupOffersForPicker,
  type PickerOffer,
} from '../src/lib/calendarTimeline';

const complete = [
  { type: 'registration', label: 'Registration', startDate: '2026-09-19', endDate: '2026-09-27' },
  { type: 'lecture', label: 'Lectures', startDate: '2026-09-28', endDate: '2026-11-08' },
  { type: 'break', label: 'Mid Semester Break', startDate: '2026-11-09', endDate: '2026-11-15' },
  { type: 'lecture', label: 'Lectures', startDate: '2026-11-16', endDate: '2027-01-10' },
  { type: 'revision', label: 'Revision Break', startDate: '2027-01-11', endDate: '2027-01-17' },
  { type: 'exam', label: 'Examinations', startDate: '2027-01-18', endDate: '2027-02-07' },
];

const broken = [
  { type: 'lecture', label: 'Lectures', startDate: '2026-09-28', endDate: '2026-11-08' },
  { type: 'break', label: 'Mid Semester Break', startDate: '2026-11-09', endDate: '2026-11-15' },
  { type: 'exam', label: 'Examinations', startDate: '2027-01-18', endDate: '2027-02-07' },
];

// A healthy calendar is contiguous: every segment is a real period, none is a gap.
const completeSegments = timelineSegments(complete);
assert.equal(completeSegments.filter((s) => s.type === 'gap').length, 0);
assert.equal(completeSegments.length, complete.length);

// The broken one shows the hole the student reported, sized and dated.
const brokenSegments = timelineSegments(broken);
const gaps = brokenSegments.filter((s) => s.type === 'gap');
assert.equal(gaps.length, 1);
assert.equal(gaps[0].days, 63);
assert.equal(gaps[0].startDate, '2026-11-16');
assert.equal(gaps[0].endDate, '2027-01-17');

// Holidays nest inside the block around them, so they neither split it nor read as a gap.
const withHoliday = [
  { type: 'lecture', label: 'Lectures', startDate: '2026-09-28', endDate: '2026-12-20' },
  { type: 'holiday', label: 'Deepavali', startDate: '2026-11-08', endDate: '2026-11-08' },
];
assert.equal(timelineSegments(withHoliday).length, 1);
assert.equal(summarizeTimeline(withHoliday).holidayCount, 1);

// 6 weeks of lectures + 8 weeks = 14, which is what the calendar claims.
const summary = summarizeTimeline(complete);
assert.equal(summary.lectureWeeks, 14);
assert.match(summary.text, /14 weeks of lectures/);
assert.match(summary.text, /1 week break/);
assert.match(summary.text, /3 weeks exams/);

assert.deepEqual(timelineSegments([]), []);
assert.deepEqual(summarizeTimeline([]), { text: '', lectureWeeks: 0, holidayCount: 0 });

// Term status drives the picker badges.
assert.deepEqual(termStatus('2026-09-28', '2027-02-07', '2026-10-05'), {
  kind: 'running',
  weekLabel: 'Week 2',
});
assert.deepEqual(termStatus('2026-09-28', '2027-02-07', '2026-08-26'), {
  kind: 'upcoming',
  weeksAway: 5,
  monthLabel: undefined,
});
// Far-off terms read as a month, not "starts in 46 weeks".
assert.equal(termStatus('2027-07-12', '2027-09-05', '2026-08-26').kind, 'upcoming');
assert.equal(
  (termStatus('2027-07-12', '2027-09-05', '2026-08-26') as { monthLabel?: string }).monthLabel,
  'July 2027',
);
assert.deepEqual(termStatus('2026-03-09', '2026-06-28', '2026-08-26'), {
  kind: 'ended',
  weeksAgo: 8,
});
assert.deepEqual(termStatus('', '', '2026-08-26'), { kind: 'unknown' });

// Unknown period types survive as `other` rather than being dropped.
const narrowed = toAcademicPeriods(
  parsePeriodsJson('[{"type":"kuliah","label":"X","startDate":"2026-01-01","endDate":"2026-01-07"}]'),
);
assert.equal(narrowed[0].type, 'other');
assert.equal(narrowed[0].label, 'X');
assert.deepEqual(parsePeriodsJson('not json'), []);
assert.deepEqual(parsePeriodsJson('{"type":"lecture"}'), []);

// Picker grouping: programme decides relevance, today's date decides the bucket.
type TestOffer = PickerOffer & { id: string };

const offer = (
  id: string,
  startDate: string,
  endDate: string,
  programLevel?: PickerOffer['programLevel'],
): TestOffer => ({ id, startDate, endDate, programLevel });

const grouped = groupOffersForPicker(
  [
    offer('undergrad-now', '2026-06-29', '2026-11-22'),
    offer('asasi-now', '2026-06-29', '2026-11-22', 'Foundation'),
    offer('next', '2027-03-01', '2027-07-11'),
    offer('finished', '2026-03-09', '2026-06-28'),
  ],
  { academicLevel: 'Bachelor', todayISO: '2026-08-26' },
);
assert.deepEqual(grouped.forYou.map((o) => o.id), ['undergrad-now']);
assert.deepEqual(grouped.upcoming.map((o) => o.id), ['next']);
// The foundation calendar and the finished session stay reachable, just not up front.
assert.deepEqual(grouped.others.map((o) => o.id).sort(), ['asasi-now', 'finished']);

// A student whose programme is unknown sees every current calendar rather than none.
const unknownLevel = groupOffersForPicker(
  [offer('undergrad-now', '2026-06-29', '2026-11-22'), offer('asasi-now', '2026-06-29', '2026-11-22', 'Foundation')],
  { academicLevel: null, todayISO: '2026-08-26' },
);
assert.equal(unknownLevel.forYou.length, 2);

// The inter-semester break trails the term and must not be counted inside it: UKM's undergraduate
// Semester 2 ends with a nine-week "Cuti Semester" that made the summary read "11 weeks break".
const withTrailingBreak = [
  { type: 'lecture', label: 'Lectures', startDate: '2027-03-01', endDate: '2027-04-18' },
  { type: 'break', label: 'Cuti Pertengahan Semester', startDate: '2027-04-19', endDate: '2027-04-25' },
  { type: 'lecture', label: 'Lectures', startDate: '2027-04-26', endDate: '2027-06-13' },
  { type: 'exam', label: 'Peperiksaan', startDate: '2027-06-21', endDate: '2027-07-11' },
  { type: 'break', label: 'Cuti Semester', startDate: '2027-07-12', endDate: '2027-09-12' },
];
assert.match(summarizeTimeline(withTrailingBreak).text, /1 week break/);
assert.equal(
  timelineSegments(withTrailingBreak).some((s) => s.label === 'Cuti Semester'),
  false,
);
// A mid-semester break is still counted, and the exam gap before it still shows.
assert.match(summarizeTimeline(withTrailingBreak).text, /3 weeks exams/);

console.log('calendarTimeline: all assertions passed');
