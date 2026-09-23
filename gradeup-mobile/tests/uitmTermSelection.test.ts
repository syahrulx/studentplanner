/**
 * Run: npx --yes tsx tests/uitmTermSelection.test.ts
 *
 * Guards which HEA term code the app picks when nobody has told it one.
 *
 * The bug this locks down: `deriveUitmTermCodeFromDate` mapped the whole of
 * September to session 3, the intersession. On 23 Sep 2026 — four days before
 * semester 20264 began — a Group B student was measured against the
 * intersession that started 17 August and shown "Week 6" instead of Week 1.
 * September is precisely where the two terms overlap, so no rule based on the
 * month number can separate them; the code must come from the published dates.
 *
 * The fixture below is trimmed from the live page
 * (https://hea.uitm.edu.my/index.php/calendars/academic-calendar) and keeps the
 * real Group B dates for 2026: semester 20262 runs to 20 September, the 20263
 * intersession runs 17 August – 20 September, and semester 20264 starts
 * 27 September. `20272` reproduces the catch-all bucket the parser produces for
 * the last `[code]` on the page, which spans two years and must never be picked.
 *
 * No `KALENDAR AKADEMIK` heading here on purpose: that keeps the detailed-table
 * parser out of the way so these assertions only exercise term selection.
 */
import assert from 'node:assert/strict';

const HEA_FIXTURE = `
<div>GROUP B: PRE-DIPLOMA, DIPLOMA, BACHELOR, MASTER AND PhD</div>

<table>
  <tr><td colspan="2">SEMESTER MARCH AUGUST 2026 [20262]</td></tr>
  <tr><th>Activity</th><th>Date</th></tr>
  <tr><td>Lecture</td><td>29 March 2026 - 20 September 2026</td></tr>
  <tr><td>Semester Break</td><td>21 September 2026 - 26 September 2026</td></tr>
</table>

<table>
  <tr><td colspan="2">INTERSESSION [20263]</td></tr>
  <tr><th>Activity</th><th>Date</th></tr>
  <tr><td>Intersession Lecture</td><td>17 August 2026 - 20 September 2026</td></tr>
</table>

<table>
  <tr><td colspan="2">SEMESTER SEPTEMBER 2026 FEBRUARY 2027 [20264]</td></tr>
  <tr><th>Activity</th><th>Date</th></tr>
  <tr><td>Lecture</td><td>27 September 2026 - 19 December 2026</td></tr>
  <tr><td>Semester Break</td><td>20 December 2026 - 26 December 2026</td></tr>
  <tr><td>Lecture</td><td>27 December 2026 - 9 January 2027</td></tr>
</table>

<table>
  <tr><td colspan="2">CATCH-ALL BUCKET [20272]</td></tr>
  <tr><th>Activity</th><th>Date</th></tr>
  <tr><td>Lecture</td><td>22 December 2025 - 20 December 2027</td></tr>
</table>
`;

globalThis.fetch = (async () => ({
  ok: true,
  text: async () => HEA_FIXTURE,
})) as unknown as typeof fetch;

import { fetchUitmAcademicCalendar } from '../src/lib/uitmAcademicCalendar';

const SEM_20262 = '2026-03-29';
const INTERSESSION = '2026-08-17';
const SEM_20264 = '2026-09-27';

async function startOn(targetDateISO: string, preferredTermCode?: string): Promise<string> {
  const cal = await fetchUitmAcademicCalendar('B', { targetDateISO, preferredTermCode, variant: 'auto' });
  assert.ok(cal, `expected a calendar for ${targetDateISO}`);
  return cal.startDate;
}

async function main(): Promise<void> {
  // The reported case: the week before the semester starts reads as the semester
  // that is about to begin, not as week 6 of an intersession the student skipped.
  assert.equal(await startOn('2026-09-23'), SEM_20264);

  // Mid-September, while 20262 is still running, stays on 20262 — the point is
  // that the intersession is never what an unpinned student is measured against.
  assert.equal(await startOn('2026-09-05'), SEM_20262);
  assert.notEqual(await startOn('2026-08-25'), INTERSESSION);
  assert.notEqual(await startOn('2026-09-15'), INTERSESSION);

  // A term that is actually running wins over one that is merely near.
  assert.equal(await startOn('2026-07-15'), SEM_20262);
  assert.equal(await startOn('2026-11-15'), SEM_20264);
  assert.equal(await startOn('2027-01-05'), SEM_20264);

  // Nothing refreshes `profiles.hea_term_code`, so a code saved one semester must
  // not pin that student to a dead term for good.
  assert.equal(await startOn('2026-09-23', '20262'), SEM_20264);
  assert.equal(await startOn('2026-11-15', '20262'), SEM_20264);

  // A pin whose lectures are still running is still honoured, and a student who
  // really is sitting the intersession can still ask for it by code.
  assert.equal(await startOn('2026-11-15', '20264'), SEM_20264);
  assert.equal(await startOn('2026-09-05', '20263'), INTERSESSION);

  // The two-year catch-all bucket is a parse artefact and must never be chosen.
  for (const d of ['2026-07-15', '2026-09-05', '2026-09-23', '2026-11-15', '2027-01-05']) {
    assert.notEqual(await startOn(d), '2025-12-22');
  }

  console.log('uitmTermSelection: all assertions passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
