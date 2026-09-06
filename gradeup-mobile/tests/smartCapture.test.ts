/**
 * Run: npx --yes tsx tests/smartCapture.test.ts
 *
 * Covers the parts of Smart Capture that are pure logic: OCR chrome removal,
 * duplicate detection against the planner, and the capture inbox state machine
 * that carries a share across the login flow.
 */
import assert from 'node:assert/strict';

import {
  buildReviewItems,
  cleanOcrText,
  normalizeTitle,
  taskKey,
} from '../src/lib/smartCapture/captureMatching';
import {
  CAPTURE_MAX_AGE_MS,
  clearActiveCapture,
  clearCapture,
  enqueueCapture,
  getActiveCapture,
  isCaptureStale,
  peekCapture,
  promoteCapture,
  shareKeyOf,
  subscribeCapture,
  takeCaptureIfStale,
} from '../src/lib/smartCapture/captureInboxStore';
import type { TaskExtractionDTO } from '../src/lib/taskExtraction';

// ---------------------------------------------------------------------------
// OCR clean-up
// ---------------------------------------------------------------------------

// A WhatsApp screenshot as Vision/ML Kit typically returns it.
const WHATSAPP_OCR = [
  '9:41',
  '▮▮▮',
  'Dr Aminah',
  'online',
  'Assignment 2 kena hantar sebelum 11:59 PM pada 14 March.',
  '10:32 AM',
  '✓✓',
  '',
  '',
  '',
  'Forwarded',
  'Quiz 1 will be held in Week 8.',
  '22:41 ✓✓',
  'You reacted 👍 to this message',
].join('\n');

const cleaned = cleanOcrText(WHATSAPP_OCR);

// Chat chrome is gone.
assert.ok(!cleaned.includes('10:32 AM'), 'bubble timestamp should be dropped');
assert.ok(!cleaned.includes('22:41'), 'bubble timestamp with ticks should be dropped');
assert.ok(!cleaned.includes('Forwarded'), '"Forwarded" label should be dropped');
assert.ok(!cleaned.includes('You reacted'), 'reaction line should be dropped');
assert.ok(!cleaned.includes('online'), 'presence line should be dropped');
assert.ok(!cleaned.includes('▮'), 'status bar glyphs should be dropped');
assert.ok(!cleaned.includes('9:41'), 'status bar clock should be dropped');

// Real content, including a deadline time inside a sentence, is preserved.
assert.ok(
  cleaned.includes('Assignment 2 kena hantar sebelum 11:59 PM pada 14 March.'),
  'a time inside a sentence is a real deadline and must survive',
);
assert.ok(cleaned.includes('Quiz 1 will be held in Week 8.'), 'task line must survive');
assert.ok(cleaned.includes('Dr Aminah'), 'sender name is left for the model to judge');

// Runs of blank lines collapse to at most one.
assert.ok(!/\n\n\n/.test(cleaned), 'no more than one consecutive blank line');

// Dates written with a dot separator must survive: "12.03" is 12 March, not a
// clock time. Only an am/pm or tick suffix makes a dotted number a timestamp.
assert.equal(cleanOcrText('12.03'), '12.03', 'a bare dotted date is not a timestamp');
assert.equal(cleanOcrText('9.30'), '9.30');
assert.equal(cleanOcrText('9.30 pm'), '', 'a dotted time with am/pm is chrome');
assert.equal(cleanOcrText('9.30 \u2713\u2713'), '', 'a dotted time with ticks is chrome');
assert.equal(
  cleanOcrText('Kuiz 2\n12.03\nBab 4'),
  'Kuiz 2\n12.03\nBab 4',
  'a timetable screenshot keeps its date line',
);

// A real chat screenshot: a whole scrollback, mostly irrelevant, with the one
// message that matters at the bottom and wrapped across two OCR lines.
const CHAT_DUMP = [
  '6:10', '5G', '52', '259', 'PJJ', 'You',
  '10:40 - 2:50', '11-1', '1:30 PM \u2713',
  'Tuesday', 'Hutang :', 'Mama :50', 'Kakak :138', '8:38 PM \u2713',
  'Wednesday', 'Hutang :', 'Kakak : 220', 'Edited 2:59 PM \u2713',
  'Today', 'Assignment1 isp601 kena hantar', 'jumaat ni , sila siapkan', '5:58 PM \u2713',
].join('\n');

const chat = cleanOcrText(CHAT_DUMP);
assert.ok(chat.includes('Assignment1 isp601 kena hantar'), 'the task line survives');
assert.ok(chat.includes('jumaat ni'), 'the date phrase survives even when wrapped');
assert.ok(chat.includes('Today'), 'day separators survive as dating context');
assert.ok(chat.includes('10:40 - 2:50'), 'a time range is content, not a bubble timestamp');
assert.ok(!chat.includes('5:58 PM'), 'bubble timestamps go');
assert.ok(!chat.includes('8:38 PM'), 'bubble timestamps go');
assert.ok(!chat.includes('Edited'), 'the edit marker goes');
assert.ok(
  chat.length > 20,
  'a busy screenshot must clear the OCR floor, or it never reaches extraction',
);

assert.equal(cleanOcrText(''), '');
assert.equal(cleanOcrText('10:32 AM\n✓✓'), '', 'chrome-only input yields nothing');
assert.equal(
  cleanOcrText('  Submit by 5pm  '),
  'Submit by 5pm',
  'whitespace is trimmed but content is untouched',
);

// ---------------------------------------------------------------------------
// Title normalisation and duplicate detection
// ---------------------------------------------------------------------------

assert.equal(normalizeTitle('  Assignment   2 '), 'assignment 2');
assert.equal(normalizeTitle('ASSIGNMENT 2'), normalizeTitle('assignment 2'));
assert.equal(taskKey('Assignment 2', '2026-03-14'), 'assignment 2|2026-03-14');
assert.equal(taskKey('Assignment 2', null), 'assignment 2|');

function dto(overrides: Partial<TaskExtractionDTO>): TaskExtractionDTO {
  return {
    title: 'Task',
    course_id: 'CSC101',
    type: 'Assignment',
    due_date: '2026-03-14',
    due_time: '23:59',
    priority: 'Medium',
    effort_hours: 2,
    ...overrides,
  };
}

const existingTasks = [
  { title: 'Assignment 2', dueDate: '2026-03-14' },
  { title: 'Quiz 1', dueDate: '2026-03-20' },
];

const items = buildReviewItems(
  [
    dto({ title: 'Assignment 2', due_date: '2026-03-14' }), // exact duplicate
    dto({ title: 'assignment  2', due_date: '2026-03-14' }), // same after normalising
    dto({ title: 'Assignment 2', due_date: '2026-03-21' }), // same name, new date
    dto({ title: 'Lab Report', due_date: '2026-03-18' }), // brand new
  ],
  existingTasks,
);

assert.equal(items.length, 4);
assert.deepEqual(
  items.map((i) => i.alreadyExists),
  [true, true, false, false],
  'only same-title-and-date pairs count as duplicates',
);
assert.deepEqual(
  items.map((i) => i.selected),
  [false, false, true, true],
  'duplicates start unchecked so nothing is silently doubled up',
);
assert.equal(new Set(items.map((i) => i.localId)).size, 4, 'local ids are unique');
assert.equal(items[3].course_id, 'CSC101', 'the rest of the DTO is carried through');

// An empty planner means nothing is a duplicate.
assert.deepEqual(
  buildReviewItems([dto({})], []).map((i) => i.selected),
  [true],
);

// ---------------------------------------------------------------------------
// Capture inbox
// ---------------------------------------------------------------------------

clearCapture();
assert.equal(peekCapture(), null);
assert.equal(getActiveCapture(), null);

let notifications = 0;
const unsubscribe = subscribeCapture(() => {
  notifications += 1;
});

const shared = enqueueCapture({ source: 'share' });
assert.equal(peekCapture()?.id, shared.id);
assert.equal(notifications, 1, 'subscribers hear about a new capture');

// The launcher promotes before navigating, so the payload survives the hop.
const promoted = promoteCapture();
assert.equal(promoted?.id, shared.id);
assert.equal(peekCapture(), null, 'pending slot is emptied on promote');
assert.equal(getActiveCapture()?.id, shared.id, 'the sheet reads it from the active slot');

// Promoting again with nothing pending keeps showing the same capture, which is
// what a re-render of the sheet must see.
assert.equal(promoteCapture()?.id, shared.id);

// A second share arriving while the sheet is open replaces the active one.
const second = enqueueCapture({ source: 'paste', text: 'Quiz on Friday' });
assert.equal(peekCapture()?.id, second.id);
assert.equal(promoteCapture()?.id, second.id);
assert.equal(getActiveCapture()?.text, 'Quiz on Friday');

// Text and image payloads round-trip untouched.
clearCapture();
const picked = enqueueCapture({ source: 'picker', imageUri: 'file:///tmp/shot.png' });
assert.equal(picked.imageUri, 'file:///tmp/shot.png');
assert.equal(picked.source, 'picker');
assert.ok(picked.id !== shared.id, 'each capture gets its own id');

// Staleness: a share left unopened through a long sign-up is dropped, not
// replayed at a surprising moment.
clearCapture();
const fresh = enqueueCapture({ source: 'share' });
assert.equal(isCaptureStale(fresh), false);
assert.equal(takeCaptureIfStale(), false, 'a fresh capture is kept');
assert.equal(peekCapture()?.id, fresh.id);

const old = enqueueCapture({ source: 'share', receivedAt: Date.now() - CAPTURE_MAX_AGE_MS - 1000 });
assert.equal(isCaptureStale(old), true);
assert.equal(takeCaptureIfStale(), true, 'an aged-out capture is dropped');
assert.equal(peekCapture(), null);

// A capture that lands while the sheet is closing must be handed back to the
// launcher, not destroyed. The sheet passes the id it actually showed.
clearCapture();
const first = enqueueCapture({ source: 'share' });
assert.equal(promoteCapture()?.id, first.id);
const arrivedDuringClose = enqueueCapture({ source: 'share' });
promoteCapture(); // the open sheet promotes it in the same tick it unmounts
assert.equal(getActiveCapture()?.id, arrivedDuringClose.id);
clearActiveCapture(first.id); // unmount cleanup, holding the older id
assert.equal(getActiveCapture(), null);
assert.equal(
  peekCapture()?.id,
  arrivedDuringClose.id,
  'the newer capture goes back to pending so the launcher reopens the sheet',
);

// Closing after reviewing the capture it was given discards it for good.
clearCapture();
const reviewed = enqueueCapture({ source: 'share' });
promoteCapture();
clearActiveCapture(reviewed.id);
assert.equal(getActiveCapture(), null);
assert.equal(peekCapture(), null, 'a reviewed capture is not replayed');

unsubscribe();
const before = notifications;
enqueueCapture({ source: 'share' });
assert.equal(notifications, before, 'unsubscribed listeners stop being called');
clearCapture();

// ---------------------------------------------------------------------------
// Share de-duplication key
// ---------------------------------------------------------------------------

const payloadsA = [{ value: 'hello', mimeType: 'text/plain', shareType: 'text' }];
const payloadsB = [{ value: 'hello', mimeType: 'text/plain', shareType: 'text' }];
const payloadsC = [{ value: 'other', mimeType: 'text/plain', shareType: 'text' }];

assert.equal(shareKeyOf(payloadsA), shareKeyOf(payloadsB), 'identical payloads share a key');
assert.notEqual(shareKeyOf(payloadsA), shareKeyOf(payloadsC), 'different text means a new share');
assert.equal(shareKeyOf([]), '');
assert.notEqual(
  shareKeyOf([{ value: 'x', shareType: 'text' }]),
  shareKeyOf([{ value: 'x', shareType: 'image' }]),
  'the same value shared as a different type is a different share',
);

console.log('smartCapture: all assertions passed');
