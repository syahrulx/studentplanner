/**
 * FSRS scheduling for flashcards.
 *
 * Thin wrapper around `ts-fsrs` that converts between our `Flashcard` shape
 * (ISO-string dates, camelCase, all scheduling fields optional) and the
 * library's `Card` (Date objects, snake_case). Cards that have never been
 * reviewed – or legacy rows created before the FSRS columns existed – are
 * treated as brand-new cards due right now.
 *
 * Column mapping (public.flashcards):
 *   due, stability, difficulty, elapsed_days, scheduled_days, learning_steps,
 *   reps, lapses, state (0 New, 1 Learning, 2 Review, 3 Relearning), last_review
 */
import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type Grade,
  type ReviewLog,
} from 'ts-fsrs';
import type { Flashcard, FlashcardState } from '../types';

export type FlashcardRating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

/** Row shape for `public.flashcard_reviews` (state BEFORE the review). */
export interface ReviewLogRow {
  card_id: string;
  note_id: string | null;
  rating: FlashcardRating;
  state: FlashcardState;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  review_at: string;
  duration_ms: number | null;
}

export interface DueCounts {
  /** Cards whose `due` is at or before `now` (includes never-reviewed cards). */
  due: number;
  new: number;
  learning: number; // Learning + Relearning
  review: number;
  total: number;
}

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: true,
  enable_short_term: true,
});

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

function toDate(value: string | null | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function clampState(value: number | undefined): FlashcardState {
  if (value === 1 || value === 2 || value === 3) return value;
  return 0;
}

/** True when the card carries FSRS state (has been scheduled at least once). */
export function hasSchedulerState(card: Flashcard): boolean {
  return card.due != null && card.state != null;
}

/** Build a ts-fsrs `Card` from our Flashcard. Unscheduled cards become empty cards due now. */
export function createSchedulerCard(card: Flashcard, now: Date = new Date()): Card {
  if (!hasSchedulerState(card)) {
    return createEmptyCard(now);
  }
  return {
    due: toDate(card.due, now),
    stability: card.stability ?? 0,
    difficulty: card.difficulty ?? 0,
    elapsed_days: card.elapsedDays ?? 0,
    scheduled_days: card.scheduledDays ?? 0,
    learning_steps: card.learningSteps ?? 0,
    reps: card.reps ?? 0,
    lapses: card.lapses ?? 0,
    state: clampState(card.state) as State,
    last_review: card.lastReview ? toDate(card.lastReview, now) : undefined,
  };
}

/** Copy scheduler fields from a ts-fsrs `Card` back onto a Flashcard. */
export function applySchedulerCard(card: Flashcard, next: Card): Flashcard {
  return {
    ...card,
    due: next.due.toISOString(),
    stability: next.stability,
    difficulty: next.difficulty,
    elapsedDays: next.elapsed_days,
    scheduledDays: next.scheduled_days,
    learningSteps: next.learning_steps,
    reps: next.reps,
    lapses: next.lapses,
    state: clampState(next.state),
    lastReview: next.last_review ? next.last_review.toISOString() : null,
  };
}

function toGrade(rating: FlashcardRating): Grade {
  switch (rating) {
    case 1:
      return Rating.Again;
    case 2:
      return Rating.Hard;
    case 3:
      return Rating.Good;
    default:
      return Rating.Easy;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a rating to a card. Returns the updated card and a review-log row that
 * captures the state BEFORE the review (what `flashcard_reviews` stores).
 */
export function rateCard(
  card: Flashcard,
  rating: FlashcardRating,
  now: Date = new Date(),
  durationMs?: number,
): { card: Flashcard; log: ReviewLogRow } {
  const before = createSchedulerCard(card, now);
  const { card: after, log } = scheduler.next(before, now, toGrade(rating));
  const updatedAt = now.toISOString();
  return {
    card: { ...applySchedulerCard(card, after), updatedAt },
    log: reviewLogToRow(card, log, rating, durationMs),
  };
}

function reviewLogToRow(
  card: Flashcard,
  log: ReviewLog,
  rating: FlashcardRating,
  durationMs?: number,
): ReviewLogRow {
  return {
    card_id: card.id,
    note_id: card.noteId ?? null,
    rating,
    state: clampState(log.state),
    due: log.due.toISOString(),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: log.elapsed_days,
    scheduled_days: log.scheduled_days,
    review_at: log.review.toISOString(),
    duration_ms:
      typeof durationMs === 'number' && Number.isFinite(durationMs)
        ? Math.max(0, Math.round(durationMs))
        : null,
  };
}

/** A card is due when it has never been scheduled or its due date has passed. */
export function isDue(card: Flashcard, now: Date = new Date()): boolean {
  if (!hasSchedulerState(card)) return true;
  return toDate(card.due, now).getTime() <= now.getTime();
}

export function dueCounts(cards: Flashcard[], now: Date = new Date()): DueCounts {
  const counts: DueCounts = { due: 0, new: 0, learning: 0, review: 0, total: cards.length };
  for (const c of cards) {
    if (isDue(c, now)) counts.due += 1;
    const st = hasSchedulerState(c) ? clampState(c.state) : 0;
    if (st === 0) counts.new += 1;
    else if (st === 2) counts.review += 1;
    else counts.learning += 1;
  }
  return counts;
}

/** Earliest upcoming due date among cards that are NOT yet due, or null. */
export function nextDueDate(cards: Flashcard[], now: Date = new Date()): Date | null {
  let best: Date | null = null;
  for (const c of cards) {
    if (!hasSchedulerState(c)) continue;
    const d = toDate(c.due, now);
    if (d.getTime() <= now.getTime()) continue;
    if (!best || d.getTime() < best.getTime()) best = d;
  }
  return best;
}

/**
 * Human-friendly interval label, e.g. "<10m", "45m", "3h", "3d", "2.1mo", "1.5y".
 */
export function formatInterval(from: Date, to: Date): string {
  const ms = Math.max(0, to.getTime() - from.getTime());
  const minutes = ms / 60_000;
  if (minutes < 10) return '<10m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  const months = days / 30.44;
  if (months < 12) return `${months < 10 ? months.toFixed(1) : Math.round(months)}mo`;
  const years = days / 365.25;
  return `${years < 10 ? years.toFixed(1) : Math.round(years)}y`;
}

/** Preview the interval each rating would produce, as short labels. */
export function previewIntervals(
  card: Flashcard,
  now: Date = new Date(),
): Record<FlashcardRating, string> {
  const before = createSchedulerCard(card, now);
  const preview = scheduler.repeat(before, now);
  return {
    1: formatInterval(now, preview[Rating.Again].card.due),
    2: formatInterval(now, preview[Rating.Hard].card.due),
    3: formatInterval(now, preview[Rating.Good].card.due),
    4: formatInterval(now, preview[Rating.Easy].card.due),
  };
}

// ---------------------------------------------------------------------------
// Cloze rendering
// ---------------------------------------------------------------------------

const CLOZE_RE = /\{\{c\d+::([^}]*?)(?:::[^}]*?)?\}\}/g;

export function isClozeText(text: string): boolean {
  CLOZE_RE.lastIndex = 0;
  return CLOZE_RE.test(text);
}

/**
 * Render cloze markup. `{{c1::answer}}` (optionally `{{c1::answer::hint}}`)
 * becomes `____` on the front and the plain answer on the back.
 */
export function renderCloze(front: string): { front: string; back: string; isCloze: boolean } {
  if (!isClozeText(front)) return { front, back: front, isCloze: false };
  return {
    front: front.replace(CLOZE_RE, '____'),
    back: front.replace(CLOZE_RE, (_m, answer: string) => answer),
    isCloze: true,
  };
}

/**
 * Text to show for a card's two faces. Cloze cards derive the front (blanked)
 * and back (filled-in) from the cloze markup; other cards use front/back as-is.
 */
export function cardFaces(card: Flashcard): { front: string; back: string; isCloze: boolean } {
  const rawFront = card.front ?? card.question ?? '';
  const rawBack = card.back ?? card.answer ?? '';
  if (card.cardType === 'cloze' || isClozeText(rawFront)) {
    const c = renderCloze(rawFront);
    if (c.isCloze) {
      // Prefer the filled-in text; append an explicit back if the generator
      // supplied additional explanation that differs from the raw front.
      const extra = rawBack.trim();
      const redundant =
        !extra ||
        extra === rawFront.trim() ||
        c.back.toLowerCase().includes(extra.toLowerCase());
      return { front: c.front, back: redundant ? c.back : `${c.back}\n\n${extra}`, isCloze: true };
    }
  }
  return { front: rawFront, back: rawBack, isCloze: false };
}

export { State as FsrsState, Rating as FsrsRating };
