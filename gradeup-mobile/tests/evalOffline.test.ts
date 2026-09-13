/**
 * Run: npm run test:eval-offline
 *
 * The half of the eval suite that needs no network and costs nothing, so it can
 * run on every change. It covers the logic that decides whether a student's
 * answer is right and when a card comes back, which is where a silent
 * regression does the most damage: nobody notices grading drift, they just
 * quietly stop trusting the app.
 *
 * The property checks themselves are also exercised here against known-bad
 * input. An assertion that cannot fail is worse than no assertion, because it
 * reports success either way.
 */
import assert from 'node:assert/strict';

import { gradeShortAnswer, computeLocalScore, pointsForAnswer } from '../src/lib/quizGrading';
import { rateCard, isDue, dueCounts, renderCloze, cardFaces } from '../src/lib/fsrs';
import type { Flashcard } from '../src/types';
import { checkQuizQuestions, checkFlashcards, checkTutorAnswer } from './eval/properties';
import { STAKEHOLDER_FIXTURE } from './eval/fixtures';

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (e: any) {
    failures += 1;
    console.log(`  FAIL  ${name}`);
    console.log(`          ${e?.message?.split('\n')[0] ?? e}`);
  }
}

console.log('\nShort-answer grading');

check('accepts the exact answer, ignoring case and punctuation', () => {
  assert.equal(gradeShortAnswer('Rate constant', 'rate constant'), true);
  assert.equal(gradeShortAnswer('  RATE  CONSTANT  ', 'rate constant'), true);
  assert.equal(gradeShortAnswer('rate-constant!', 'rate constant'), true);
});

check('accepts a listed alternative phrasing', () => {
  assert.equal(gradeShortAnswer('k', 'rate constant', ['k']), true);
  assert.equal(gradeShortAnswer('activation energy', 'Ea', ['activation energy']), true);
});

check('forgives a typo but not a different word', () => {
  assert.equal(gradeShortAnswer('stakeholdr', 'stakeholder'), true);
  assert.equal(gradeShortAnswer('shareholder', 'stakeholder'), false);
});

// This is the bug the grading rewrite existed to fix: the old check accepted any
// substring, so a single letter scored full marks.
check('rejects a substring of the answer', () => {
  assert.equal(gradeShortAnswer('a', 'activation energy'), false);
  assert.equal(gradeShortAnswer('rate', 'rate constant'), false);
  assert.equal(gradeShortAnswer('energy', 'activation energy'), false);
});

check('rejects empty input', () => {
  assert.equal(gradeShortAnswer('', 'anything'), false);
  assert.equal(gradeShortAnswer('   ', 'anything'), false);
});

console.log('\nScoring');

check('a fast correct answer earns the speed bonus, a slow one does not', () => {
  assert.equal(pointsForAnswer(true, 3000), 15);
  assert.equal(pointsForAnswer(true, 9000), 10);
  assert.equal(pointsForAnswer(false, 100), 0);
});

check('the running score accumulates every bonus, not just the last', () => {
  const score = computeLocalScore([
    { questionIndex: 0, selectedIndex: 1, correct: true, timeMs: 1000 },
    { questionIndex: 1, selectedIndex: 0, correct: true, timeMs: 2000 },
    { questionIndex: 2, selectedIndex: 2, correct: false, timeMs: 1000 },
  ] as any);
  assert.equal(score, 30);
});

console.log('\nFSRS scheduling');

const newCard: Flashcard = { id: 'c1', front: 'Q', back: 'A' };

check('a new card is due immediately', () => {
  assert.equal(isDue(newCard, new Date()), true);
});

check('Forgot keeps the card in the session, Too easy pushes it past tomorrow', () => {
  const now = new Date();
  const again = rateCard(newCard, 1, now).card;
  const easy = rateCard(newCard, 4, now).card;
  const gapMinutes = (c: Flashcard) => (new Date(c.due!).getTime() - now.getTime()) / 60000;
  assert.ok(gapMinutes(again) < 60, `Forgot scheduled ${gapMinutes(again)} minutes out`);
  assert.ok(gapMinutes(easy) > 60 * 24, `Too easy scheduled only ${gapMinutes(easy)} minutes out`);
});

check('each review is logged with the state from before it', () => {
  const { log } = rateCard(newCard, 3, new Date());
  assert.equal(log.rating, 3);
  assert.equal(log.state, 0, 'a first review must record the card as New');
  assert.equal(log.card_id, 'c1');
});

check('due counts separate what is waiting from what is not', () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  const counts = dueCounts(
    [newCard, { id: 'c2', front: 'Q', back: 'A', due: tomorrow, state: 2 }],
    new Date(),
  );
  assert.equal(counts.due, 1);
});

console.log('\nCloze rendering');

check('a deletion is hidden on the front and restored on the back', () => {
  const r = renderCloze('The {{c1::mitochondrion}} makes ATP.');
  assert.equal(r.isCloze, true);
  assert.ok(!r.front.includes('mitochondrion'), 'the answer leaked onto the front');
  assert.ok(r.back.includes('mitochondrion'), 'the answer is missing from the back');
});

check('plain cards are left alone', () => {
  const faces = cardFaces({ id: 'c', front: 'What is ATP?', back: 'Energy currency' });
  assert.equal(faces.isCloze, false);
  assert.equal(faces.front, 'What is ATP?');
});

// Quiz payload validation (validateGeneratedQuizQuestions, buildBalancedQuizSource)
// is not covered here: it lives in src/lib/studyApi.ts alongside the Supabase
// client, so importing it pulls in React Native, which this runner cannot parse.
// The same properties are asserted against real server output in the live evals.

console.log('\nProperty checks catch bad AI output');

// If these pass silently on bad input, every live eval below is worthless.
// Each check runs against real material, so a grounding failure means the proof
// is absent from THIS text rather than from an empty string.
const SRC = STAKEHOLDER_FIXTURE.content;
check('a duplicated question is reported', () => {
  const bad = checkQuizQuestions(
    [
      { question: 'What is the highest influence rating on the scale?', options: ['1', '5', '10', '0'], correctIndex: 2, explanation: 'y'.repeat(40), proof: 'influence is rated 0 to 10' },
      { question: 'What is the highest influence rating in the scale?', options: ['1', '5', '10', '0'], correctIndex: 2, explanation: 'y'.repeat(40), proof: 'influence is rated 0 to 10' },
    ],
    SRC,
    2,
  );
  assert.ok(bad.some((f) => f.includes('near-duplicate')), bad.join('; '));
});

check('an out-of-range answer index is reported', () => {
  const bad = checkQuizQuestions(
    [{ question: 'Which rating can terminate the project?', options: ['0', '5'], correctIndex: 9, explanation: 'z'.repeat(40), proof: 'influence is rated 0 to 10' }],
    SRC,
    1,
  );
  assert.ok(bad.some((f) => f.includes('out of range')), bad.join('; '));
});

check('an ungrounded proof is reported', () => {
  const bad = checkQuizQuestions(
    [{ question: 'What does the burndown chart show?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'q'.repeat(40), proof: 'velocity tracking sprint burndown backlog grooming' }],
    SRC,
    1,
  );
  assert.ok(bad.some((f) => f.includes('not grounded')), bad.join('; '));
});

check('a missing explanation is reported', () => {
  const bad = checkQuizQuestions(
    [{ question: 'Who signs off the deliverable?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, proof: 'the project sponsor signs off' }],
    SRC,
    1,
  );
  assert.ok(bad.some((f) => f.includes('explanation')), bad.join('; '));
});

check('a cloze card with no deletion is reported', () => {
  const bad = checkFlashcards([{ front: 'The mitochondrion makes ATP', back: 'mitochondrion', type: 'cloze' }], 'mitochondrion ATP');
  assert.ok(bad.some((f) => f.includes('no deletion')), bad.join('; '));
});

check('an over-long flashcard back is reported', () => {
  const bad = checkFlashcards([{ front: 'What is a stakeholder?', back: 'x'.repeat(400) }], 'stakeholder');
  assert.ok(bad.some((f) => f.includes('too long')), bad.join('; '));
});

check('a tutor answer that invents a term is reported', () => {
  const bad = checkTutorAnswer(
    'You should track this on a Gantt chart to see the critical path clearly and plan ahead.',
    [],
    STAKEHOLDER_FIXTURE.absentTerms,
    'tutor',
  );
  assert.ok(bad.some((f) => f.includes('Gantt chart')), bad.join('; '));
});

check('a formula that needs layout inline, or a wide table, is reported', () => {
  // Inline maths is only converted to plain characters, so a fraction there
  // loses its layout. It belongs in a $$ block.
  const latex = checkTutorAnswer('The half life is $\\frac{0.693}{k}$ for a first order reaction here.', [], [], 't');
  assert.ok(latex.some((f) => f.includes('needs a $$ block')), latex.join('; '));

  // A display block is correct and must not be reported.
  const ok = checkTutorAnswer('The half life for a first order reaction is:\n\n$$\\frac{0.693}{k}$$\n\nIt does not depend on concentration.', [], [], 't');
  assert.equal(ok.length, 0, ok.join('; '));

  const table = checkTutorAnswer(
    'Here is the breakdown of every stakeholder in your notes.\n\n| Name | Role | Interest | Influence |\n| --- | --- | --- | --- |\n| A | B | C | D |',
    [], [], 't',
  );
  assert.ok(table.some((f) => f.includes('wider than 3 columns')), table.join('; '));
});

console.log(
  failures === 0
    ? '\nAll offline evals passed.\n'
    : `\n${failures} offline eval(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
