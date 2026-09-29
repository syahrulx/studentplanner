/**
 * Run: npx --yes tsx tests/lockScreenModel.test.ts
 * (also worth running under TZ=America/Los_Angeles: every date must stay local)
 *
 * Guards what each self-refreshing lock screen picture says.
 *
 * The pictures are drawn days ahead and looked at while the phone is locked,
 * so a wrong row is not a glitch the student can scroll past: it is on their
 * lock screen all day. These assertions pin the rules that decide the rows
 * (recurring tasks, per-day completion, placeholder dates, subtasks, overdue),
 * the week strip order, the undated fallback, and the signature that decides
 * whether a picture is redrawn or carried forward.
 *
 * The dates are real: semester 20264 starts Sunday 27 Sep 2026, so Tuesday
 * 29 Sep is week 1 and Tuesday 5 Jan 2027 falls in study week (week 15).
 */
import assert from 'node:assert/strict';
import { t } from '../src/i18n';
import { lockClassDetail } from '../src/lib/lockScreen/lockScreenFormat';
import type { AcademicCalendar, Task, TimetableEntry } from '../src/types';
import { DEFAULT_LOCK_SCREEN_CONFIG, type LockScreenConfig } from '../src/lib/lockScreen/types';
import {
  fmtAsOf,
  fmtHeaderDate,
  fmtRange,
  fmtTime,
  fmtTimeInline,
  fmtWhen,
  normalizeClock,
  type LockTranslate,
} from '../src/lib/lockScreen/lockScreenFormat';
import {
  buildLockScreenDayModel,
  buildLockScreenFallbackModel,
  buildLockScreenModels,
  collectLockScreenTasks,
  lockScreenA11ySummary,
  lockScreenEmptyTitle,
  lockScreenNextLine,
  lockScreenRenderDates,
  lockScreenSignature,
  type LockScreenModelInput,
} from '../src/lib/lockScreen/lockScreenModel';

const T: LockTranslate = (k) => t('en', k);
/** Minimal Malay T: only the keys this test reads; everything else falls back. */
const MS: Record<string, string> = { lsAm: 'PG', lsPm: 'PTG', lsDaysShort: 'Ahd,Isn,Sel,Rab,Kha,Jum,Sab' };
const T_MS: LockTranslate = (k) => MS[k] ?? k;
/** What t() does for a key that does not exist. */
const T_MISSING: LockTranslate = (k) => k;

function entry(id: string, day: TimetableEntry['day'], code: string, start: string, end: string, extra: Partial<TimetableEntry> = {}): TimetableEntry {
  return { id, day, subjectCode: code, subjectName: `${code} name`, lecturer: '-', startTime: start, endTime: end, location: '-', ...extra };
}

function task(id: string, extra: Partial<Task>): Task {
  return { id, title: id, courseId: 'CSC301', type: 'Assignment', dueDate: '2026-09-29', dueTime: '', notes: '', isDone: false, ...extra };
}

const TIMETABLE: TimetableEntry[] = [
  // Deliberately out of order and in the raw formats the database hands back.
  entry('c-mat', 'Tuesday', 'MAT210', '2:00 PM', '4:00 PM', { location: 'BK-3', group: '2' }),
  entry('c-csc', 'Tuesday', 'CSC301', '08:00:00', '10:00:00', { location: '-', group: 'CS2305A' }),
  entry('c-eng', 'Wednesday', 'ENG101', '10:00', '12:00', { displayName: 'English' }),
  entry('c-bio', 'Monday', 'BIO110', '09:00', '11:00', { location: 'BK2' }),
];

const COMPLETIONS = new Set(['rec-done:2026-09-29']);

const TASKS: Task[] = [
  task('lab-report', { title: 'Lab report', dueTime: '10:00' }),
  // Recurring every Tuesday from 1 Sep; the stored dueDate is only a placeholder.
  task('gym', { title: 'Gym', courseId: 'gc-course-9', dueDate: '2026-09-01', repeatDays: [2] }),
  task('rec-done', { title: 'Flashcards', dueDate: '2026-09-01', repeatDays: [2] }),
  task('placeholder', { title: 'Classroom import', needsDate: true }),
  task('step', { title: 'Write intro', parentTaskId: 'lab-report' }),
  task('late', { title: 'Late essay', dueDate: '2026-09-20' }),
  task('late-done', { title: 'Done essay', dueDate: '2026-09-21', isDone: true }),
  task('late-step', { title: 'Old step', dueDate: '2026-09-20', parentTaskId: 'late' }),
  task('late-placeholder', { title: 'Old import', dueDate: '2026-09-20', needsDate: true }),
];

const CALENDAR = {
  id: 'cal',
  semesterLabel: 'UiTM (Group B)',
  startDate: '2026-09-27',
  endDate: '2027-01-09',
  totalWeeks: 14,
  isActive: true,
} as AcademicCalendar;

function makeInput(overrides: Partial<LockScreenModelInput> = {}): LockScreenModelInput {
  const subjectColors: Record<string, string> = { CSC301: '#3b82f6', MAT210: '#f59e0b' };
  return {
    timetable: TIMETABLE,
    tasks: TASKS,
    courses: [{ id: 'gc-course-9', name: 'Physics', creditHours: 3, workload: [] }],
    subjectColors,
    getSubjectColor: (id) => subjectColors[id] ?? '#888888',
    isTaskDoneOn: (tk, day) => (tk.repeatDays?.length ? COMPLETIONS.has(`${tk.id}:${day}`) : tk.isDone),
    pulseCalendar: CALENDAR,
    totalWeeks: 14,
    startDate: '2026-09-27',
    currentWeek: 1,
    weekStartsOn: 'monday',
    language: 'en',
    T,
    nowMs: new Date(2026, 8, 26, 23, 40).getTime(),
    uses24h: false,
    ...overrides,
  };
}

function testFormat(): void {
  assert.deepEqual(fmtTime('08:00', false, T), { main: '8:00', suffix: 'AM' });
  assert.deepEqual(fmtTime('08:00', true, T), { main: '08:00', suffix: '' });
  assert.equal(fmtTimeInline('00:30', false, T), '12:30 AM');
  assert.equal(fmtTimeInline('12:00', false, T), '12:00 PM');
  assert.equal(fmtTimeInline('08:00', false, T_MS), '8:00 PG');
  assert.equal(fmtTimeInline('14:05', false, T_MISSING), '2:05 PM', 'missing lsPm falls back to English');

  assert.equal(normalizeClock('2:30 PM'), '14:30');
  assert.equal(normalizeClock('08:00:00'), '08:00');
  assert.equal(normalizeClock('12:15 am'), '00:15');
  assert.equal(normalizeClock('25:00'), null);

  assert.equal(fmtHeaderDate('2026-09-29', T), 'TUE · 29 SEP');
  assert.equal(fmtHeaderDate('2026-09-29', T_MS), 'SEL · 29 SEP');
  assert.equal(fmtHeaderDate('2026-09-29', T_MISSING), 'TUE · 29 SEP', 'missing lists fall back to English');
  assert.equal(fmtRange('2026-09-28', '2026-10-04', T), '28 SEP – 4 OCT');
  assert.equal(fmtRange('2026-10-05', '2026-10-11', T), '5 – 11 OCT');

  const now = new Date(2026, 8, 27, 9, 0).getTime();
  assert.equal(fmtWhen(now - 30_000, now, T, false), 'just now');
  assert.equal(fmtWhen(new Date(2026, 8, 27, 7, 2).getTime(), now, T, false), '7:02 AM today');
  assert.equal(fmtWhen(new Date(2026, 8, 26, 7, 2).getTime(), now, T, false), 'yesterday, 7:02 AM');
  assert.equal(fmtWhen(new Date(2026, 8, 24, 7, 2).getTime(), now, T, false), 'Thu 24 Sep');
  assert.equal(fmtAsOf(new Date(2026, 8, 26, 23, 40).getTime(), T, false), 'as of Sat 11:40 PM');
}

function testRenderDates(): void {
  assert.deepEqual(lockScreenRenderDates('2026-12-28'), [
    '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
  ]);
  // US DST ends 1 Nov 2026; a 24 h step from midnight would repeat a day there.
  assert.deepEqual(lockScreenRenderDates('2026-10-30'), [
    '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05',
  ]);
}

function testDayRows(): void {
  const input = makeInput();
  const tue = buildLockScreenDayModel(input, '2026-09-29');

  assert.equal(tue.kind, 'day');
  assert.equal(tue.weekday, 2);
  assert.equal(tue.headerDate, 'TUE · 29 SEP');
  assert.equal(tue.weekLabel, 'WEEK 1');
  assert.equal(tue.noClassesPeriod, false);

  assert.deepEqual(tue.classes.map((c) => [c.label, c.start, c.end]), [
    ['CSC301', '08:00', '10:00'],
    ['MAT210', '14:00', '16:00'],
  ]);
  assert.equal(tue.classes[0].room, 'Online', 'a "-" room is an online class, as on the grid');
  assert.equal(tue.classes[0].group, 'CS2305A', 'a section code needs no G');
  assert.equal(tue.classes[1].room, 'BK-3');
  assert.equal(tue.classes[1].group, 'G2');
  assert.equal(lockClassDetail(tue.classes[1], { rooms: true, group: false }), 'BK-3');
  assert.equal(lockClassDetail(tue.classes[1], { rooms: true, group: true }), 'BK-3 · G2');
  assert.equal(lockClassDetail(tue.classes[1], { rooms: false, group: true }), 'G2');
  assert.equal(lockClassDetail(tue.classes[0], { rooms: false, group: false }), null, 'nothing to print drops the line');
  assert.equal(tue.classes[0].name, 'CSC301 name');
  assert.equal(tue.classes[0].onColor, '#ffffff');
  assert.equal(tue.next, null, 'next is only for days without classes');

  // Recurring "Gym" shows on its weekday; "Flashcards" was ticked for this date;
  // the Classroom placeholder and the step never reach the lock screen.
  assert.deepEqual(tue.tasks.map((r) => [r.key, r.trailing]), [
    ['lab-report', '10:00 AM'],
    ['gym', 'Physics'],
  ]);
  assert.equal(tue.overdueCount, 1, 'only "Late essay": done, stepped, placeholder and recurring tasks do not count');

  // A week later the recurring task is open again and today's task is overdue.
  const nextTue = buildLockScreenDayModel(input, '2026-10-06');
  // Both are untimed, so the title decides: "Flashcards" before "Gym".
  assert.deepEqual(nextTue.tasks.map((r) => r.key), ['rec-done', 'gym']);
  assert.equal(nextTue.overdueCount, 2);

  const thu = buildLockScreenDayModel(input, '2026-10-01');
  assert.deepEqual(thu.classes, []);
  assert.deepEqual(thu.next, { dayShort: 'Mon', time: '9:00 AM', label: 'BIO110', room: 'BK2', group: null });
  // A day with no classes still shows a room, on the Next line, when rooms are on.
  assert.equal(lockScreenNextLine(thu.next!, T, null), 'Next: Mon 9:00 AM · BIO110');
  assert.equal(lockScreenNextLine(thu.next!, T, { rooms: true, group: false }), 'Next: Mon 9:00 AM · BIO110 · BK2');
  assert.equal(lockScreenEmptyTitle(thu, T), 'All clear');
  assert.equal(lockScreenEmptyTitle(buildLockScreenDayModel(input, '2026-10-03'), T), 'Free day. Recharge.');

  assert.equal(
    lockScreenA11ySummary(tue, T),
    'Week 1. First 8:00 AM, CSC301, then 1 more. 2 due. 1 overdue.',
  );
}

function testWeekCells(): void {
  const monday = buildLockScreenDayModel(makeInput(), '2026-09-29');
  assert.deepEqual(monday.week.map((c) => c.dayShort), ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
  assert.deepEqual(monday.week.map((c) => c.dayNum), [28, 29, 30, 1, 2, 3, 4]);
  assert.deepEqual(monday.week.map((c) => c.isFocus), [false, true, false, false, false, false, false]);
  assert.deepEqual(monday.week.map((c) => c.isPast), [true, false, false, false, false, false, false]);
  assert.deepEqual(monday.week[1].chips.map((c) => c.label), ['CSC301', 'MAT210']);
  assert.equal(monday.week[2].chips[0].label, 'Englis', 'chips use the display name, cut to 6');
  assert.equal(monday.weekRange, '28 SEP – 4 OCT');

  const sunday = buildLockScreenDayModel(makeInput({ weekStartsOn: 'sunday' }), '2026-09-29');
  assert.deepEqual(sunday.week.map((c) => c.dayShort), ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);
  assert.deepEqual(sunday.week.map((c) => c.dateISO), [
    '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03',
  ]);
  assert.equal(sunday.week[2].isFocus, true);
  assert.equal(sunday.weekRange, '27 SEP – 3 OCT');
}

function testBreaks(): void {
  const input = makeInput();
  const studyWeek = buildLockScreenDayModel(input, '2027-01-05');
  assert.equal(studyWeek.weekLabel, 'STUDY WEEK');
  assert.equal(studyWeek.noClassesPeriod, true);
  assert.deepEqual(studyWeek.classes, []);
  assert.ok(studyWeek.week.every((c) => c.chips.length === 0), 'no chips in study and exam weeks');
  assert.equal(lockScreenEmptyTitle(studyWeek, T), 'Study Week');

  // Before the first lecture: a published break hides the classes, no row keeps them.
  const withBreak = {
    ...CALENDAR,
    periods: [
      { type: 'break', label: 'Semester Break', startDate: '2026-08-10', endDate: '2026-09-26' },
      { type: 'lecture', label: 'Lecture', startDate: '2026-09-27', endDate: '2026-12-19' },
    ],
  } as AcademicCalendar;
  const onBreak = buildLockScreenDayModel(makeInput({ pulseCalendar: withBreak }), '2026-09-22');
  assert.equal(onBreak.weekLabel, 'SEMESTER BREAK');
  assert.deepEqual(onBreak.classes, []);
  assert.equal(buildLockScreenDayModel(makeInput({ pulseCalendar: withBreak }), '2026-09-29').weekLabel, 'WEEK 1');

  const beforeStart = buildLockScreenDayModel(input, '2026-09-22');
  assert.equal(beforeStart.weekLabel, null);
  assert.equal(beforeStart.classes.length, 2);

  const noCalendar = buildLockScreenDayModel(makeInput({ pulseCalendar: null, startDate: null }), '2026-09-29');
  assert.equal(noCalendar.weekLabel, null);

  // A stale profile start date alone never hides the timetable.
  const staleProfile = buildLockScreenDayModel(makeInput({ pulseCalendar: null, startDate: '2026-01-05' }), '2026-09-29');
  assert.equal(staleProfile.noClassesPeriod, false);
  assert.equal(staleProfile.weekLabel, null);
  assert.equal(staleProfile.classes.length, 2);
}

/**
 * The real UiTM (Group B) 20264 rows (supabase-fix-uitm-20264-calendar.sql).
 * A periods calendar counts only lecture weeks, so the week number stalls
 * through breaks and never passes 14: the rows have to decide instead.
 */
function testPublishedPeriods(): void {
  const uitm = {
    ...CALENDAR,
    periods: [
      { type: 'break', label: 'Semester Break', startDate: '2026-08-10', endDate: '2026-09-26' },
      { type: 'lecture', label: 'All Students • Lecture', startDate: '2026-09-27', endDate: '2026-12-19' },
      { type: 'special_break', label: 'Mid-Semester Break', startDate: '2026-12-20', endDate: '2026-12-26' },
      { type: 'lecture', label: 'Lecture', startDate: '2026-12-27', endDate: '2027-01-09' },
      { type: 'test', label: 'English Exit Test (EET Speaking)', startDate: '2027-01-11', endDate: '2027-01-17' },
      { type: 'revision', label: 'Revision Week', startDate: '2027-01-11', endDate: '2027-01-17' },
      { type: 'test', label: 'Final Examination/Assessment', startDate: '2027-01-18', endDate: '2027-02-07' },
      { type: 'break', label: 'Semester Break', startDate: '2027-02-05', endDate: '2027-03-14' },
    ],
  } as AcademicCalendar;
  const on = (dateISO: string) => buildLockScreenDayModel(makeInput({ pulseCalendar: uitm }), dateISO);
  const expectOff = (dateISO: string, label: string) => {
    const model = on(dateISO);
    assert.equal(model.weekLabel, label, dateISO);
    assert.equal(model.noClassesPeriod, true, dateISO);
    assert.deepEqual(model.classes, [], `${dateISO}: no class on the picture`);
  };

  assert.equal(on('2026-09-29').weekLabel, 'WEEK 1');
  assert.equal(on('2026-12-15').weekLabel, 'WEEK 12');
  expectOff('2026-12-22', 'SEMESTER BREAK');
  assert.ok(on('2026-12-22').week.every((c) => c.chips.length === 0), 'a break week has no chips');
  // The week count resumes after the break instead of counting it.
  assert.equal(on('2026-12-29').weekLabel, 'WEEK 13');
  assert.equal(on('2026-12-29').classes.length, 2);
  assert.equal(on('2027-01-05').weekLabel, 'WEEK 14');
  // The EET "test" row shares revision week: revision wins.
  expectOff('2027-01-12', 'STUDY WEEK');
  // Sunday 10 Jan is in no row; its week is revision week.
  assert.equal(on('2027-01-10').weekLabel, 'STUDY WEEK');
  expectOff('2027-01-19', 'EXAM WEEK');
  expectOff('2027-01-26', 'EXAM WEEK');
  // Finals and the break overlap by three days; the exams are still running.
  assert.equal(on('2027-02-05').weekLabel, 'EXAM WEEK');
  expectOff('2027-02-09', 'SEMESTER BREAK');
  expectOff('2027-03-02', 'SEMESTER BREAK');
  // Past the calendar's last row it says nothing: classes, no week.
  const after = on('2027-03-23');
  assert.equal(after.weekLabel, null);
  assert.equal(after.classes.length, 2);
  // "Next class" skips the break instead of promising a class during it.
  assert.equal(on('2027-02-10').next, null);
  assert.deepEqual(on('2026-12-24').next, { dayShort: 'Mon', time: '9:00 AM', label: 'BIO110', room: 'BK2', group: null });
}

function testFallback(): void {
  const fallback = buildLockScreenFallbackModel(makeInput());
  assert.equal(fallback.kind, 'fallback');
  assert.equal(fallback.dateISO, null);
  assert.equal(fallback.weekday, -1);
  assert.equal(fallback.headerDate, '');
  assert.equal(fallback.weekRange, '');
  assert.equal(fallback.asOf, '');
  assert.equal(fallback.weekLabel, null);
  assert.deepEqual(fallback.tasks, []);
  assert.equal(fallback.overdueCount, 0);
  assert.ok(fallback.week.every((c) => c.dateISO === '' && c.dayNum === 0 && !c.isFocus && !c.isPast));
  assert.deepEqual(fallback.week.map((c) => c.chips.length), [1, 2, 1, 0, 0, 0, 0]);

  const all = buildLockScreenModels(makeInput(), '2026-09-27');
  assert.equal(all.dates.length, 7);
  assert.equal(all.days['2026-09-29'].headerDate, 'TUE · 29 SEP');
  assert.equal(all.fallback.kind, 'fallback');
}

function testSignature(): void {
  const env = { W: 393, H: 852, scale: 3, accent: '#7C3AED', photoStamp: null };
  const config: LockScreenConfig = DEFAULT_LOCK_SCREEN_CONFIG;
  const evening = buildLockScreenDayModel(makeInput(), '2026-09-29');
  const morning = buildLockScreenDayModel(makeInput({ nowMs: new Date(2026, 8, 27, 7, 5).getTime() }), '2026-09-29');
  assert.notEqual(evening.asOf, morning.asOf);
  assert.equal(lockScreenSignature(evening, config, env), lockScreenSignature(morning, config, env));
  assert.match(lockScreenSignature(evening, config, env), /^[0-9a-f]{8}$/);

  const moved = TIMETABLE.map((e) => (e.id === 'c-csc' ? { ...e, startTime: '09:00' } : e));
  const changed = buildLockScreenDayModel(makeInput({ timetable: moved }), '2026-09-29');
  assert.notEqual(lockScreenSignature(changed, config, env), lockScreenSignature(evening, config, env));

  assert.notEqual(
    lockScreenSignature(evening, { ...config, template: 'week' }, env),
    lockScreenSignature(evening, config, env),
  );
  // A photo that is not the background must not force a redraw.
  assert.equal(
    lockScreenSignature(evening, { ...config, photoPath: 'file:///bg/1.jpg' }, { ...env, photoStamp: '1' }),
    lockScreenSignature(evening, config, env),
  );
}

function testSharedTasks(): void {
  const own = [task('mine', {})];
  const shared = [
    { recipient_id: 'u1', task_id: 's1', recipient_completed: true, task: task('s1', { isDone: false }) },
    { recipient_id: 'u2', task_id: 's2', recipient_completed: false, task: task('s2', {}) },
    { recipient_id: 'u1', task_id: 'mine', recipient_completed: false, task: task('mine', {}) },
    { recipient_id: 'u1', task_id: 's3', recipient_completed: false },
  ];
  const merged = collectLockScreenTasks(own, shared, 'u1');
  assert.deepEqual(merged.map((x) => [x.id, x.isDone]), [['mine', false], ['s1', true]]);
  assert.equal(collectLockScreenTasks(own, null, 'u1'), own, 'no shared tasks keeps the same array');
}

function testTimetable(): void {
  const input = makeInput();
  const tue = buildLockScreenDayModel(input, '2026-09-29');
  const days = tue.timetable.map((d) => `${d.dayShort}:${d.classes.map((c) => c.label).join('+')}`);
  // Monday week: the five weekdays always, free ones included; no weekend without a class.
  assert.deepEqual(days, ['MON:BIO110', 'TUE:CSC301+MAT210', 'WED:English', 'THU:', 'FRI:']);
  assert.equal(tue.timetable[1].classes[0].room, 'Online', 'a class with no room reads Online, as on the grid');

  // Undated on purpose: a study-week day and the fallback carry the same timetable.
  const studyWeek = buildLockScreenDayModel(input, '2027-01-05');
  assert.equal(studyWeek.noClassesPeriod, true);
  assert.deepEqual(studyWeek.timetable, tue.timetable, 'break weeks do not empty the timetable');
  assert.deepEqual(buildLockScreenFallbackModel(input).timetable, tue.timetable);

  // A weekend day joins only when it has a class.
  const withSat = makeInput({ timetable: [...TIMETABLE, entry('c-sat', 'Saturday', 'LAB900', '09:00', '11:00')] });
  assert.deepEqual(
    buildLockScreenDayModel(withSat, '2026-09-29').timetable.map((d) => d.dayShort),
    ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
  );

  // A Sunday week (Kedah/Kelantan/Terengganu) leads with Sunday and ends on Thursday.
  const sunWeek = buildLockScreenDayModel(makeInput({ weekStartsOn: 'sunday' }), '2026-09-29');
  assert.deepEqual(sunWeek.timetable.map((d) => d.dayShort), ['SUN', 'MON', 'TUE', 'WED', 'THU']);
}

function main(): void {
  testFormat();
  testRenderDates();
  testDayRows();
  testWeekCells();
  testBreaks();
  testPublishedPeriods();
  testFallback();
  testSignature();
  testSharedTasks();
  testTimetable();
  console.log('lockScreenModel: all assertions passed');
}

main();
