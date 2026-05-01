import type { ComponentProps } from 'react';
import Feather from '@expo/vector-icons/Feather';

export type FeatherGlyphName = ComponentProps<typeof Feather>['name'];

/** Legacy circle emoji stored in DB → Feather glyph for display only */
export const LEGACY_CIRCLE_EMOJI_TO_FEATHER: Record<string, FeatherGlyphName> = {
  '👥': 'users',
  '📚': 'book-open',
  '🏫': 'home',
  '🎓': 'award',
  '💼': 'briefcase',
  '🎵': 'music',
  '⚽': 'circle',
  '🎮': 'monitor',
  '🏠': 'home',
  '🌟': 'star',
  '🔬': 'activity',
  '🎪': 'calendar',
};

export function featherForLegacyCircleEmoji(emoji: string | null | undefined): FeatherGlyphName {
  const key = String(emoji || '').trim();
  return LEGACY_CIRCLE_EMOJI_TO_FEATHER[key] ?? 'users';
}

/** Circle creation picker: still persists legacy emoji server-side; UI shows Feather only */
export const CIRCLE_ICON_CHOICES: { emoji: string; icon: FeatherGlyphName }[] = [
  { emoji: '👥', icon: 'users' },
  { emoji: '📚', icon: 'book-open' },
  { emoji: '🏫', icon: 'home' },
  { emoji: '🎓', icon: 'award' },
  { emoji: '💼', icon: 'briefcase' },
  { emoji: '🎵', icon: 'music' },
  { emoji: '⚽', icon: 'circle' },
  { emoji: '🎮', icon: 'monitor' },
  { emoji: '🏠', icon: 'home' },
  { emoji: '🌟', icon: 'star' },
  { emoji: '🔬', icon: 'activity' },
  { emoji: '🎪', icon: 'calendar' },
];

/** Notification inbox rows — payload `reaction_type` strings stay unchanged */
export function featherForReactionRow(isBump: boolean, reactionType: string | null | undefined): FeatherGlyphName {
  if (isBump) return 'zap';
  const t = String(reactionType || '').trim();
  switch (t) {
    case '📋':
      return 'clipboard';
    case '🎮':
      return 'monitor';
    case '👋':
      return 'user-plus';
    case '🤝':
      return 'check-circle';
    case '🔥':
      return 'trending-up';
    case '💪':
      return 'activity';
    case '📚':
      return 'book-open';
    case '❤️':
    case '❤':
      return 'heart';
    case '👍':
      return 'thumbs-up';
    case '🎉':
      return 'award';
    case '💬':
      return 'message-circle';
    default:
      return 'star';
  }
}
