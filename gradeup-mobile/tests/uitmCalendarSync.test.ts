/**
 * Run: npx --yes tsx tests/uitmCalendarSync.test.ts
 *
 * Oct 2026: 593 UiTM students sat on the "Pending auto-sync" placeholder.
 * - the HEA parser (now shared with the uitm_calendar Edge Function) still
 *   reads the live page the same way;
 * - a week shift now applies to a calendar with dates but no lecture rows;
 * - the placeholder is recognised even after a student re-saves it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseUitmAcademicCalendar, HEA_CALENDAR_URL } from '../src/lib/uitmHeaParser';
import { teachingWeekNumberForDate } from '../src/lib/academicWeek';
import { isPendingPlaceholderCalendar } from '../src/lib/pendingCalendar';

(async () => {
  // 1. Week shift without lecture rows: the reported case.
  const placeholder: any = {
    id: 'x', semesterLabel: 'Pending auto-sync', startDate: '2026-10-12', endDate: '2027-01-17',
    totalWeeks: 14, isActive: true, teachingWeekOffset: 2,
  };
  assert.equal(teachingWeekNumberForDate('2026-10-14', placeholder, undefined, 14, 1), 3);
  assert.equal(teachingWeekNumberForDate('2026-10-14', { ...placeholder, teachingWeekOffset: 0 }, undefined, 14, 1), 1);
  // Before the start date the shift does not apply (same as the period path).
  assert.equal(teachingWeekNumberForDate('2026-10-01', placeholder, undefined, 14, 1), 1);
  // Never past the cap.
  assert.equal(teachingWeekNumberForDate('2027-01-15', { ...placeholder, teachingWeekOffset: 5 }, undefined, 14, 1), 14);

  // 2. Placeholder detection, whoever saved it.
  assert.equal(isPendingPlaceholderCalendar(placeholder), true);
  assert.equal(isPendingPlaceholderCalendar({ ...placeholder, selectionSource: 'user' }), true);
  assert.equal(isPendingPlaceholderCalendar({ ...placeholder, periods: [{ type: 'lecture', label: 'x', startDate: '2026-09-27', endDate: '2026-12-19' }] }), false);
  assert.equal(isPendingPlaceholderCalendar({ ...placeholder, semesterLabel: 'UiTM (Group B) – Official HEA' }), false);
  assert.equal(isPendingPlaceholderCalendar(null), false);

  // 3. Parser on the live page (skipped offline).
  let html = '';
  try {
    const res = await fetch(HEA_CALENDAR_URL);
    if (res.ok) html = await res.text();
  } catch {}
  if (html) {
    const b = parseUitmAcademicCalendar(html, 'B', { targetDateISO: '2026-10-14' });
    assert.ok(b && b.periods && b.periods.length > 0, 'group B parsed');
    const firstLecture = b!.periods!.filter((p) => p.type === 'lecture').map((p) => p.startDate).sort()[0];
    assert.equal(firstLecture, '2026-09-27');
    const official: any = { id: 'y', ...b, isActive: true };
    assert.equal(teachingWeekNumberForDate('2026-10-14', official, undefined, 14, 1), 3);
    console.log('live HEA: group B week 3 on 14 Oct');
  } else {
    console.log('live HEA unreachable: parser check skipped');
  }

  // 4. The Edge Function copy is in step with the app's parser.
  const app = readFileSync('src/lib/uitmHeaParser.ts', 'utf8');
  const fn = readFileSync('supabase/functions/_shared/uitmHeaParser.ts', 'utf8');
  assert.ok(fn.includes(app.replace("from './uitmHeaTypes'", "from './uitmHeaTypes.ts'")), 'run node scripts/sync-uitm-hea-parser.js');

  console.log('uitmCalendarSync: all tests passed');
})();
