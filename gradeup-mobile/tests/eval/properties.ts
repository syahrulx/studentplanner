/**
 * Property checks for AI output.
 *
 * An eval cannot assert an exact answer: the model is free to word things
 * differently every run, and pinning the wording would fail on paraphrase while
 * still passing on nonsense. These check the properties that must hold no
 * matter how the model phrases itself, which is what actually breaks when a
 * prompt or model changes.
 *
 * Each returns a list of failures rather than throwing, so one run reports
 * every problem instead of stopping at the first.
 */

export interface EvalQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  kind?: string;
  expectedAnswer?: string | null;
  acceptedAnswers?: string[] | null;
  explanation?: string | null;
  proof?: string | null;
  sourceIndex?: number | null;
}

export interface EvalCard {
  front: string;
  back: string;
  type?: string;
  hint?: string | null;
  source_excerpt?: string | null;
}

/** Lowercase, strip punctuation, collapse whitespace. */
export function norm(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Significant words, so "the" and "of" do not make two sentences look alike. */
const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'of', 'in', 'to', 'and', 'or', 'for',
  'it', 'on', 'at', 'by', 'be', 'as', 'that', 'this', 'with', 'from', 'which', 'what',
]);

export function contentWords(s: string): Set<string> {
  return new Set(norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w)));
}

/** Jaccard overlap, used to spot two questions that are the same question. */
export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits += 1;
  return hits / (a.size + b.size - hits);
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

export function checkQuizQuestions(
  questions: EvalQuestion[],
  source: string,
  requested: number,
): string[] {
  const fail: string[] = [];
  const sourceWords = contentWords(source);

  if (questions.length === 0) {
    return ['no questions returned'];
  }
  // The server accepts a partial set rather than inventing filler, so the floor
  // is 70% of what was asked for, matching its own quality gate.
  if (questions.length < Math.ceil(requested * 0.7)) {
    fail.push(`only ${questions.length}/${requested} questions returned`);
  }

  const seen: Set<string>[] = [];
  questions.forEach((q, i) => {
    const at = `q${i + 1}`;

    if (!q.question || q.question.trim().length < 10) {
      fail.push(`${at}: question text too short`);
    }

    const isShort = q.kind === 'short_answer' || (q.options?.length ?? 0) === 0;
    if (isShort) {
      if (!q.expectedAnswer?.trim()) fail.push(`${at}: short answer with no expectedAnswer`);
      if (q.correctIndex !== -1) fail.push(`${at}: short answer must use correctIndex -1`);
    } else {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        fail.push(`${at}: fewer than 2 options`);
      } else {
        if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
          fail.push(`${at}: correctIndex ${q.correctIndex} out of range for ${q.options.length} options`);
        }
        const uniqueOptions = new Set(q.options.map(norm));
        if (uniqueOptions.size !== q.options.length) fail.push(`${at}: duplicate options`);
        if (q.options.some((o) => /^option \d+$/i.test(o.trim()))) {
          fail.push(`${at}: placeholder option text`);
        }
        if (q.options.some((o) => /all of the above|none of the above/i.test(o))) {
          fail.push(`${at}: uses all/none of the above`);
        }
      }
    }

    // The explanation is the whole point of answering, so an empty or one-word
    // one is a silent quality regression.
    if (!q.explanation || q.explanation.trim().length < 30) {
      fail.push(`${at}: explanation missing or too short`);
    }
    if (!q.proof || q.proof.trim().length < 5) {
      fail.push(`${at}: proof missing`);
    }

    // Grounding: the proof is supposed to come from the material, so most of its
    // content words should appear there. A proof about something absent means
    // the question was invented.
    if (q.proof) {
      const proofWords = contentWords(q.proof);
      if (proofWords.size >= 3) {
        let found = 0;
        for (const w of proofWords) if (sourceWords.has(w)) found += 1;
        if (found / proofWords.size < 0.5) {
          fail.push(`${at}: proof not grounded in the source ("${q.proof.slice(0, 60)}")`);
        }
      }
    }

    // Em dashes were removed from the app's own copy; model output should match.
    if (/[—–]/.test(`${q.question} ${q.explanation ?? ''}`)) {
      fail.push(`${at}: contains an em or en dash`);
    }

    const words = contentWords(q.question);
    seen.forEach((prev, j) => {
      if (overlap(words, prev) > 0.7) fail.push(`${at}: near-duplicate of q${j + 1}`);
    });
    seen.push(words);
  });

  return fail;
}

/** An answer that cites a term the material never mentions is invented. */
export function checkNoAbsentTerms(text: string, absent: string[], label: string): string[] {
  const hay = norm(text);
  return absent
    .filter((term) => hay.includes(norm(term)))
    .map((term) => `${label}: cites "${term}", which is not in the material`);
}

// ---------------------------------------------------------------------------
// Flashcards
// ---------------------------------------------------------------------------

export function checkFlashcards(cards: EvalCard[], source: string): string[] {
  const fail: string[] = [];
  if (cards.length === 0) return ['no cards returned'];

  const sourceWords = contentWords(source);
  const seenFronts: Set<string>[] = [];

  cards.forEach((c, i) => {
    const at = `card${i + 1}`;
    if (!c.front?.trim()) fail.push(`${at}: empty front`);
    if (!c.back?.trim()) fail.push(`${at}: empty back`);

    // A back long enough to be a paragraph defeats the point of a flashcard.
    if ((c.back ?? '').length > 260) fail.push(`${at}: back too long (${c.back.length} chars)`);

    if (c.type === 'cloze' && !/\{\{c\d+::[^}]+\}\}/.test(c.front ?? '')) {
      fail.push(`${at}: typed cloze but has no deletion`);
    }
    if (/^what is (chapter|the introduction|this)/i.test(c.front ?? '')) {
      fail.push(`${at}: vague front ("${c.front.slice(0, 50)}")`);
    }
    if (/[—–]/.test(`${c.front} ${c.back}`)) fail.push(`${at}: contains an em or en dash`);

    if (c.source_excerpt) {
      const ex = contentWords(c.source_excerpt);
      if (ex.size >= 3) {
        let found = 0;
        for (const w of ex) if (sourceWords.has(w)) found += 1;
        if (found / ex.size < 0.5) fail.push(`${at}: source_excerpt not found in the material`);
      }
    }

    const words = contentWords(c.front ?? '');
    seenFronts.forEach((prev, j) => {
      if (overlap(words, prev) > 0.7) fail.push(`${at}: near-duplicate of card${j + 1}`);
    });
    seenFronts.push(words);
  });

  return fail;
}

// ---------------------------------------------------------------------------
// Tutor answers
// ---------------------------------------------------------------------------

export function checkTutorAnswer(
  answer: string,
  mustContain: string[],
  absent: string[],
  label: string,
): string[] {
  const fail: string[] = [];
  const hay = norm(answer);

  if (answer.trim().length < 40) fail.push(`${label}: answer too short to teach anything`);

  for (const needle of mustContain) {
    if (!hay.includes(norm(needle))) {
      fail.push(`${label}: answer omits "${needle}"`);
    }
  }
  fail.push(...checkNoAbsentTerms(answer, absent, label));

  if (/[—–]/.test(answer)) fail.push(`${label}: contains an em or en dash`);
  // LaTeX is now rendered, so the check inverts: what matters is that a
  // formula needing real layout is in a $$ block rather than inline, where it
  // is only converted to plain characters.
  const inline = answer.match(/(?<!\$)\$(?!\$)([^$\n]{1,200})\$(?!\$)/g) ?? [];
  for (const m of inline) {
    if (/\\frac|\\sqrt|\\int|\\sum|\\begin\{/.test(m)) {
      fail.push(`${label}: "${m.slice(0, 40)}" needs a $$ block, not inline maths`);
    }
  }
  if (/\\begin\{(?:align|equation|matrix)/.test(answer) && !answer.includes('$$')) {
    fail.push(`${label}: LaTeX environment outside a $$ block`);
  }
  // A wide Markdown table is unreadable on a phone; the prompt asks for
  // per-row blocks instead.
  const header = answer.match(/^\|(.+)\|\s*$/m);
  if (header && header[1].split('|').length > 3) {
    fail.push(`${label}: returned a table wider than 3 columns`);
  }

  return fail;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export function report(name: string, failures: string[]): boolean {
  if (failures.length === 0) {
    console.log(`  PASS  ${name}`);
    return true;
  }
  console.log(`  FAIL  ${name}`);
  for (const f of failures) console.log(`          ${f}`);
  return false;
}
