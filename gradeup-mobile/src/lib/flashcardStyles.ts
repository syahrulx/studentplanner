/**
 * Card styles for the flashcard review, a paid perk.
 *
 * Purely visual: every style shows the same question, the same answer and the
 * same two swipe pills, and grades the same way. Nothing here changes what a
 * review does, only what it looks like.
 *
 * The pills are deliberately not themeable. They are the one part that has to
 * stay readable whatever is behind them, and they already cost us once — fixed
 * red and green on a card painted with the theme's primary failed contrast on
 * all ten themes, scoring 1.06 on the sky blue. A style may change everything
 * except those.
 */
import type { SubscriptionPlan } from '../types';
import { isAtLeastPlus, isPro } from './flashcardGenerationLimits';

export type FlashcardStyleId = 'classic' | 'notebook' | 'holographic' | 'bold';

export interface FlashcardStyleFace {
  /** Card background. Two or more stops means a gradient, top-left to bottom-right. */
  background: string[];
  /** Question or answer colour. Picked against the background, never assumed. */
  text: string;
  /** The small "tap to reveal" line. */
  hint: string;
  border?: string;
  borderWidth?: number;
  /** A hard offset shadow, as the Bold style uses instead of a soft one. */
  hardShadow?: string;
  radius: number;
  /** 'serif' prints the card in Georgia, which is what makes Notebook read as paper. */
  fontFamily?: 'system' | 'serif' | 'mono';
  /** Ruled lines, drawn behind the text. */
  rules?: { color: string; gap: number; margin?: string };
  /** The foil sheen Holographic sits inside. */
  foil?: boolean;
}

export interface FlashcardStyle {
  id: FlashcardStyleId;
  name: string;
  /** The least plan that may use it. */
  tier: 'free' | 'plus' | 'pro';
  front: FlashcardStyleFace;
  back: FlashcardStyleFace;
}

/** The card as it has always looked. Free, and the fallback for everyone. */
const CLASSIC_NOTE = 'Follows your app theme.';

export const FLASHCARD_STYLES: Record<FlashcardStyleId, FlashcardStyle> = {
  classic: {
    id: 'classic',
    name: 'Classic',
    tier: 'free',
    // Resolved from the theme at render time; these are only a safe fallback.
    front: { background: ['#1e293b'], text: '#ffffff', hint: '#94a3b8', radius: 28 },
    back: { background: ['#2563eb'], text: '#ffffff', hint: '#dbeafe', radius: 28 },
  },

  notebook: {
    id: 'notebook',
    name: 'Notebook',
    tier: 'plus',
    front: {
      background: ['#fdfcf6'],
      text: '#23242a',
      hint: '#a6a294',
      border: '#e6e2d6',
      borderWidth: 2,
      radius: 26,
      fontFamily: 'serif',
      rules: { color: '#d9e4f0', gap: 34, margin: '#f0b9b9' },
    },
    back: {
      background: ['#fdfcf6'],
      text: '#23242a',
      hint: '#a6a294',
      border: '#e6e2d6',
      borderWidth: 2,
      radius: 26,
      fontFamily: 'serif',
      rules: { color: '#d9e4f0', gap: 34, margin: '#f0b9b9' },
    },
  },

  holographic: {
    id: 'holographic',
    name: 'Holographic',
    tier: 'pro',
    front: {
      background: ['#0d0e18'],
      text: '#f4f6ff',
      hint: '#8f93ad',
      radius: 28,
      foil: true,
    },
    back: {
      background: ['#0d0e18'],
      text: '#f4f6ff',
      hint: '#8f93ad',
      radius: 28,
      foil: true,
    },
  },

  bold: {
    id: 'bold',
    name: 'Bold',
    tier: 'pro',
    front: {
      background: ['#ffd93d'],
      text: '#111317',
      hint: '#6b6650',
      border: '#111317',
      borderWidth: 4,
      hardShadow: '#111317',
      radius: 20,
    },
    back: {
      background: ['#9ae6b4'],
      text: '#111317',
      hint: '#4b6b57',
      border: '#111317',
      borderWidth: 4,
      hardShadow: '#111317',
      radius: 20,
    },
  },
};

export const FLASHCARD_STYLE_ORDER: FlashcardStyleId[] = ['classic', 'notebook', 'holographic', 'bold'];

/** Whether this plan may use this style. */
export function canUseFlashcardStyle(id: FlashcardStyleId, plan: SubscriptionPlan | null | undefined): boolean {
  const tier = FLASHCARD_STYLES[id]?.tier ?? 'free';
  if (tier === 'free') return true;
  if (tier === 'plus') return isAtLeastPlus(plan);
  return isPro(plan);
}

/**
 * The style to actually draw.
 *
 * A student who buys Pro, picks Holographic and later lapses to Free would
 * otherwise keep a card they are no longer paying for — and worse, we would be
 * reading a saved preference they cannot change back. Falling through to
 * Classic keeps the screen honest without deleting what they chose, so it
 * returns if they resubscribe.
 */
export function resolveFlashcardStyle(
  id: FlashcardStyleId | null | undefined,
  plan: SubscriptionPlan | null | undefined,
): FlashcardStyle {
  if (id && FLASHCARD_STYLES[id] && canUseFlashcardStyle(id, plan)) return FLASHCARD_STYLES[id];
  return FLASHCARD_STYLES.classic;
}

export const CLASSIC_STYLE_NOTE = CLASSIC_NOTE;
