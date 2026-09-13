/**
 * Run: npm run test:eval-live
 *
 * Calls the deployed edge functions with real study material and asserts the
 * properties an answer must hold however the model words it. This is the half
 * that catches model and prompt regressions, which no amount of unit testing
 * will: the code is unchanged, the output is worse.
 *
 * It costs real tokens and consumes daily generation quota, so it never runs by
 * accident. Two environment variables are required:
 *
 *   EVAL_SUPABASE_URL    your project URL
 *   EVAL_ACCESS_TOKEN    a signed-in user's access token
 *
 * Getting a token: sign in on the app with a test account, then in the
 * simulator's storage read `sb-<project>-auth-token` and take `access_token`.
 * Tokens expire in an hour, which is deliberate. A permanent credential in a
 * test runner is a credential that leaks.
 *
 * Run this before shipping a prompt change or a model swap, and compare the
 * output to the previous run. A single failure is not necessarily a
 * regression, since the model is free to word things differently; the same
 * failure twice is.
 */
import {
  checkQuizQuestions,
  checkFlashcards,
  checkTutorAnswer,
  checkNoAbsentTerms,
  report,
  type EvalQuestion,
  type EvalCard,
} from './eval/properties';
import { ALL_FIXTURES, STAKEHOLDER_FIXTURE } from './eval/fixtures';

const SUPABASE_URL = (process.env.EVAL_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
const ACCESS_TOKEN = (process.env.EVAL_ACCESS_TOKEN ?? '').trim();

if (!SUPABASE_URL || !ACCESS_TOKEN) {
  console.log(
    '\nSkipped: set EVAL_SUPABASE_URL and EVAL_ACCESS_TOKEN to run the live evals.' +
      '\nThey call the deployed functions and spend real tokens.\n',
  );
  process.exit(0);
}

const QUIZ_COUNT = 5;
let passed = 0;
let failed = 0;

function record(name: string, failures: string[]) {
  if (report(name, failures)) passed += 1;
  else failed += 1;
}

async function invoke(fn: string, body: unknown): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${fn}: HTTP ${res.status}`);
  // Edge functions report failures in the body with a 200, so a caller that
  // only checks the status would read an error object as a result.
  if (json?.error) throw new Error(`${fn}: ${json.error.message ?? json.error}`);
  return json;
}

async function evalQuiz() {
  console.log('\nQuiz generation');
  for (const fx of ALL_FIXTURES) {
    try {
      const data = await invoke('ai_generate', {
        kind: 'quiz',
        content: `[Study source 1]\n${fx.content}`,
        source_note_ids: [`note-${fx.id}`],
        count: QUIZ_COUNT,
        quiz_type: 'mixed',
        difficulty: 'medium',
      });
      const questions: EvalQuestion[] = data.questions ?? [];
      const failures = checkQuizQuestions(questions, fx.content, QUIZ_COUNT);
      for (const q of questions) {
        failures.push(...checkNoAbsentTerms(`${q.question} ${q.explanation ?? ''}`, fx.absentTerms, 'quiz'));
      }
      record(`quiz from "${fx.title}" (${questions.length} questions)`, failures);
    } catch (e: any) {
      record(`quiz from "${fx.title}"`, [e?.message ?? String(e)]);
    }
  }
}

async function evalFlashcards() {
  console.log('\nFlashcard generation');
  for (const fx of ALL_FIXTURES) {
    try {
      const data = await invoke('generate_flashcards', {
        source: 'text',
        content: fx.content,
        count: 8,
      });
      const cards: EvalCard[] = data.cards ?? [];
      record(`flashcards from "${fx.title}" (${cards.length} cards)`, checkFlashcards(cards, fx.content));
    } catch (e: any) {
      record(`flashcards from "${fx.title}"`, [e?.message ?? String(e)]);
    }
  }
}

async function evalTutor() {
  console.log('\nTutor answers');
  const fx = STAKEHOLDER_FIXTURE;

  // Grounded questions: the answer must carry the fact from the material.
  for (const gt of fx.groundTruth) {
    try {
      const data = await invoke('ai_generate', {
        kind: 'chat',
        content: fx.content,
        subject_name: fx.title,
        question: gt.question,
        chat_history: [{ role: 'user', content: gt.question }],
      });
      const answer = String(data.response ?? '');
      record(`"${gt.question}"`, checkTutorAnswer(answer, gt.mustContain, fx.absentTerms, 'tutor'));
    } catch (e: any) {
      record(`"${gt.question}"`, [e?.message ?? String(e)]);
    }
  }

  // A question the material cannot answer. The tutor may still teach from
  // general knowledge, but it must not pretend the notes said so.
  try {
    const q = 'What does my lecturer say the exam weighting is for this topic?';
    const data = await invoke('ai_generate', {
      kind: 'chat',
      content: fx.content,
      subject_name: fx.title,
      question: q,
      chat_history: [{ role: 'user', content: q }],
    });
    const answer = String(data.response ?? '');
    const failures: string[] = [];
    // The material states no weighting, so a confident percentage is invented.
    if (/\b\d{1,3}\s?%/.test(answer) && !/not (?:in|stated|mentioned|specified)|does not|no .*(?:weighting|information)/i.test(answer)) {
      failures.push('states an exam weighting the material never gives');
    }
    record('declines a fact the material does not contain', failures);
  } catch (e: any) {
    record('declines a fact the material does not contain', [e?.message ?? String(e)]);
  }
}

async function main() {
  console.log(`\nLive evals against ${SUPABASE_URL}`);
  await evalQuiz();
  await evalFlashcards();
  await evalTutor();

  console.log(`\n${passed} passed, ${failed} failed.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
