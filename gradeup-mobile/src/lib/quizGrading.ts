/**
 * Client-side quiz grading helpers.
 *
 * These mirror the database functions `quiz_normalize_answer` /
 * `quiz_short_answer_correct` and the scoring formula used by
 * `finish_quiz_participant` (see migration 20260906000001). They exist ONLY so
 * the UI can give instant feedback and keep the live score display consistent
 * with what the server will compute. The RPC result is always authoritative.
 */

/** Speed bonus threshold shared with the DB (`time_ms > 0 and time_ms < 5000`). */
export const SPEED_BONUS_MS = 5000;
export const POINTS_PER_CORRECT = 10;
export const SPEED_BONUS_POINTS = 5;

/**
 * Same normalisation as `public.quiz_normalize_answer` followed by the
 * whitespace collapse applied in `quiz_short_answer_correct`:
 * lowercase, replace every non [a-z0-9\s] char with a space, trim, collapse
 * runs of whitespace to one space.
 */
export function normalizeAnswer(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Classic Levenshtein edit distance (insert / delete / substitute = 1). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Single-row DP to keep memory bounded for long answers.
  let previous = new Array<number>(b.length + 1);
  let current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) previous[j] = j;

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1, // deletion
        current[j - 1] + 1, // insertion
        previous[j - 1] + cost, // substitution
      );
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length];
}

/**
 * Lenient-but-safe short-answer grader. Returns true when the normalised
 * `given` text equals the normalised expected answer, equals one of the
 * accepted aliases, or is within a small Levenshtein tolerance of the
 * expected answer (typos). Never a bare substring test.
 *
 * Tolerance = max(1, floor(len(expected) * 0.2)), applied only when the
 * normalised given answer is at least 3 characters long.
 */
export function gradeShortAnswer(
  given: string | null | undefined,
  expected: string | null | undefined,
  accepted?: readonly string[] | null,
): boolean {
  const g = normalizeAnswer(given);
  const e = normalizeAnswer(expected);
  if (g === '' || e === '') return false;
  if (g === e) return true;

  if (Array.isArray(accepted)) {
    for (const alias of accepted) {
      if (g === normalizeAnswer(alias)) return true;
    }
  }

  const tolerance = Math.max(1, Math.floor(e.length * 0.2));
  if (g.length >= 3 && levenshtein(g, e) <= tolerance) return true;
  return false;
}

/** True when an answer with this response time earns the speed bonus. */
export function earnsSpeedBonus(timeMs: number): boolean {
  return timeMs > 0 && timeMs < SPEED_BONUS_MS;
}

/** Points for a single answer, identical to the DB formula. */
export function pointsForAnswer(correct: boolean, timeMs: number): number {
  if (!correct) return 0;
  return POINTS_PER_CORRECT + (earnsSpeedBonus(timeMs) ? SPEED_BONUS_POINTS : 0);
}

/** Accumulated score for a set of answers (display only; the RPC is authoritative). */
export function computeLocalScore(
  answers: ReadonlyArray<{ correct: boolean; timeMs: number }>,
): number {
  let total = 0;
  for (const a of answers) total += pointsForAnswer(a.correct, a.timeMs);
  return total;
}
