/**
 * Run: npx --yes tsx tests/relativeDates.test.ts
 *
 * "Kena hantar jumaat ni" used to land in the planner with no due date: the
 * model was told to blank out anything relative it could not pin down, and
 * nothing had pinned the Malay day words down for it.
 */
import assert from 'node:assert/strict';

import { resolveRelativeDayReferences } from '../src/utils/relativeDates';

const SUNDAY = '2026-09-06';
const WEDNESDAY = '2026-09-09';

// The message that started this.
assert.equal(
  resolveRelativeDayReferences('Assignment1 isp601 kena hantar jumaat ni , sila siapkan', SUNDAY),
  'Assignment1 isp601 kena hantar jumaat ni (2026-09-11) , sila siapkan',
);

// Malay and English weekdays, with and without a qualifier.
assert.equal(resolveRelativeDayReferences('hantar jumaat', SUNDAY), 'hantar jumaat (2026-09-11)');
assert.equal(resolveRelativeDayReferences('this Friday', SUNDAY), 'this Friday (2026-09-11)');
assert.equal(resolveRelativeDayReferences('khamis ini', SUNDAY), 'khamis ini (2026-09-10)');
assert.equal(resolveRelativeDayReferences('isnin', SUNDAY), 'isnin (2026-09-07)');

// "depan" / "next" mean the same weekday a week later.
assert.equal(resolveRelativeDayReferences('khamis depan', SUNDAY), 'khamis depan (2026-09-17)');
assert.equal(resolveRelativeDayReferences('next Monday', SUNDAY), 'next Monday (2026-09-14)');

// Day-relative words.
assert.equal(resolveRelativeDayReferences('quiz esok', SUNDAY), 'quiz esok (2026-09-07)');
assert.equal(resolveRelativeDayReferences('besok', SUNDAY), 'besok (2026-09-07)');
assert.equal(resolveRelativeDayReferences('tomorrow', SUNDAY), 'tomorrow (2026-09-07)');
assert.equal(resolveRelativeDayReferences('lusa', SUNDAY), 'lusa (2026-09-08)');
assert.equal(resolveRelativeDayReferences('hari ini', SUNDAY), 'hari ini (2026-09-06)');
assert.equal(resolveRelativeDayReferences('malam ni', SUNDAY), 'malam ni (2026-09-06)');

// When the named day is today, "ni" means today.
assert.equal(resolveRelativeDayReferences('ahad ni', SUNDAY), 'ahad ni (2026-09-06)');
// ...and "depan" still means a week out.
assert.equal(resolveRelativeDayReferences('ahad depan', SUNDAY), 'ahad depan (2026-09-13)');

// Mid-week, a day already gone this week resolves to the coming one.
assert.equal(resolveRelativeDayReferences('isnin ni', WEDNESDAY), 'isnin ni (2026-09-14)');
assert.equal(resolveRelativeDayReferences('jumaat', WEDNESDAY), 'jumaat (2026-09-11)');

// A deadline that already passed is not ours to guess at.
assert.equal(resolveRelativeDayReferences('jumaat lepas', SUNDAY), 'jumaat lepas');
assert.equal(resolveRelativeDayReferences('last Friday', SUNDAY), 'last Friday');

// "minggu N" belongs to resolveWeekReferences, and "minggu" must not be read
// as Sunday.
assert.equal(resolveRelativeDayReferences('minggu 8 punya kerja', SUNDAY), 'minggu 8 punya kerja');
assert.equal(resolveRelativeDayReferences('minggu depan', SUNDAY), 'minggu depan');

// Real dates are left exactly as written.
assert.equal(resolveRelativeDayReferences('due 15 March 2027', SUNDAY), 'due 15 March 2027');
assert.equal(resolveRelativeDayReferences('due 2026-09-11', SUNDAY), 'due 2026-09-11');

// Never annotate twice, however the pipeline is re-run.
const once = resolveRelativeDayReferences('jumaat ni', SUNDAY);
assert.equal(resolveRelativeDayReferences(once, SUNDAY), once, 'annotation is idempotent');

// Several references in one message all resolve.
assert.equal(
  resolveRelativeDayReferences('quiz esok, assignment jumaat ni', SUNDAY),
  'quiz esok (2026-09-07), assignment jumaat ni (2026-09-11)',
);

// A bad "today" is survivable — return the message untouched rather than throw.
assert.equal(resolveRelativeDayReferences('jumaat ni', 'not-a-date'), 'jumaat ni');
assert.equal(resolveRelativeDayReferences('', SUNDAY), '');

console.log('relativeDates: all assertions passed');
