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
<div>GROUP A: FOUNDATION/PROFESSIONAL</div>

<table>
  <tr><td colspan="2">SEMESTER JUNE OCTOBER 2026 [20264]</td></tr>
  <tr><th>Activity</th><th>Date</th></tr>
  <tr><td>Lecture</td><td>21 June 2026 - 4 October 2026</td></tr>
  <tr><td>Semester Break</td><td>5 October 2026 - 7 November 2026</td></tr>
</table>

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

<div>GROUP A: FOUNDATION/PROFESSIONAL</div>

<table>
  <tr><td colspan="2">SEMESTER NOVEMBER 2026 MAY 2027 [20272]</td></tr>
  <tr><th>Activity</th><th>Date</th></tr>
  <tr><td>Lecture</td><td>8 November 2026 - 28 February 2027</td></tr>
</table>

<table>
  <tr><td colspan="2">KALENDAR AKADEMIK SESI II 2025/2026 PROGRAM ASASI / PROFESIONAL SEMESTER DISEMBER 2025 – MEI 2026 (20262)</td></tr>
  <tr><th>AKTIVITI</th><th>TARIKH</th></tr>
  <tr><td>Kuliah 1</td><td>22 Disember 2025 – 8 Februari 2026</td></tr>
  <tr><td>Kuliah 2</td><td>23 Februari 2026 – 10 Mei 2026</td></tr>
</table>
`;
// The last table is a detailed "KALENDAR AKADEMIK" block for a *different* Group A
// term. Its session is SESI II; the June–October term is slot 4, which the
// session fallback maps to "I" — and `includes('I-')` matched "II-". That let a
// December–May table redefine a June–October semester as starting in December.
// The two Group A blocks bracket Group B on purpose. The live page interleaves
// the groups the same way (A and B summaries, then A and B detailed tables), so
// a parser that slices from the first matching header to the end of the page
// hands Foundation students every Group B table as well, and hands Group B the
// trailing Group A tables.

globalThis.fetch = (async () => ({
  ok: true,
  text: async () => HEA_FIXTURE,
})) as unknown as typeof fetch;

import { fetchUitmAcademicCalendar } from '../src/lib/uitmAcademicCalendar';

const SEM_20262 = '2026-03-29';
const INTERSESSION = '2026-08-17';
const SEM_20264 = '2026-09-27';
// Group A runs on its own calendar — Foundation's 20264 is June–October, not
// September–February — so the two groups must never see each other's tables.
const A_SEM_20264 = '2026-06-21';
const A_SEM_20272 = '2026-11-08';

async function startOn(
  targetDateISO: string,
  preferredTermCode?: string,
  group: 'A' | 'B' = 'B',
): Promise<string> {
  const cal = await fetchUitmAcademicCalendar(group, { targetDateISO, preferredTermCode, variant: 'auto' });
  assert.ok(cal, `expected a Group ${group} calendar for ${targetDateISO}`);
  return cal.startDate;
}

async function main(): Promise<void> {
  // Foundation students read Group A, and only Group A. Sliced to the end of the
  // page this used to return the earliest date in any table — Group B's — and
  // the Home screen showed a week number in the forties.
  assert.equal(await startOn('2026-09-23', undefined, 'A'), A_SEM_20264);
  assert.equal(await startOn('2026-12-01', undefined, 'A'), A_SEM_20272);

  // A detailed table from another term must not widen the chosen one. The
  // fixture's December–May "KALENDAR AKADEMIK" block would have pushed this
  // semester's end past May 2026 and its start back to December 2025.
  const foundationSep = await fetchUitmAcademicCalendar('A', { targetDateISO: '2026-09-23', variant: 'auto' });
  assert.ok(foundationSep);
  assert.equal(foundationSep.startDate, A_SEM_20264);
  assert.ok(foundationSep.endDate <= '2026-10-31', `endDate ${foundationSep.endDate} should stay inside the June–October term`);
  for (const p of foundationSep.periods ?? []) {
    assert.ok(p.startDate >= '2026-05-01', `period ${p.label} (${p.startDate}) leaked in from another term`);
  }

  // And Group B must not see the Group A block that follows it on the page:
  // 1 December sits inside both B's 20264 and A's 20272, so a section that
  // leaked A's tables could pick either.
  assert.equal(await startOn('2026-12-01'), SEM_20264);

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

  // ── Short semester (semester antara) ──────────────────────────────────────
  // Asking for it is the only way to get it: 'auto' and 'normal' skip every
  // session-3 term, which is why a student sitting one had no way to see it.
  const short = await fetchUitmAcademicCalendar('B', { targetDateISO: '2026-09-05', termKind: 'short' });
  assert.ok(short);
  assert.equal(short.startDate, INTERSESSION);
  assert.equal(short.resolvedTermKind, 'short');
  assert.equal(short.shortSemesterUnavailable, false);
  assert.match(short.semesterLabel, /Short semester/);
  // 17 Aug – 20 Sep is five weeks, not the fourteen every term used to report.
  assert.equal(short.totalWeeks, 5);

  const normal = await fetchUitmAcademicCalendar('B', { targetDateISO: '2026-09-05', termKind: 'normal' });
  assert.ok(normal);
  assert.equal(normal.startDate, SEM_20262);
  assert.equal(normal.resolvedTermKind, 'normal');
  assert.equal(normal.totalWeeks, 14);

  // A code left over from a normal semester must not override the choice.
  const shortDespitePin = await fetchUitmAcademicCalendar('B', {
    targetDateISO: '2026-09-05',
    preferredTermCode: '20262',
    termKind: 'short',
  });
  assert.ok(shortDespitePin);
  assert.equal(shortDespitePin.startDate, INTERSESSION);

  // Group A publishes no intersession in this fixture: fall back to the normal
  // term and say so, rather than returning nothing or silently pretending.
  const noShort = await fetchUitmAcademicCalendar('A', { targetDateISO: '2026-09-23', termKind: 'short' });
  assert.ok(noShort);
  assert.equal(noShort.shortSemesterUnavailable, true);
  assert.equal(noShort.resolvedTermKind, 'normal');
  assert.equal(noShort.startDate, A_SEM_20264);

  console.log('uitmTermSelection: all assertions passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
