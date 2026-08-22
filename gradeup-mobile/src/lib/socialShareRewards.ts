import type Feather from '@expo/vector-icons/Feather';

/**
 * Config for the "post about Rencana, earn free Plus" reward. The numbers
 * mirror the server-side rules in migration 20260823000000_social_share_rewards.sql
 * (submit_social_share_claim / review_social_share_claim) — keep both in sync.
 */

export type SocialSharePlatform = 'threads' | 'x' | 'facebook' | 'instagram' | 'tiktok';

export const SHARE_PLATFORMS: ReadonlyArray<{
  id: SocialSharePlatform;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  urlPlaceholder: string;
}> = [
  { id: 'threads', label: 'Threads', icon: 'at-sign', urlPlaceholder: 'https://www.threads.com/@you/post/…' },
  { id: 'x', label: 'X', icon: 'x', urlPlaceholder: 'https://x.com/you/status/…' },
  { id: 'facebook', label: 'Facebook', icon: 'facebook', urlPlaceholder: 'https://www.facebook.com/…' },
  { id: 'instagram', label: 'Instagram', icon: 'instagram', urlPlaceholder: 'https://www.instagram.com/p/…' },
  { id: 'tiktok', label: 'TikTok', icon: 'video', urlPlaceholder: 'https://www.tiktok.com/@you/video/…' },
];

export const SHARE_TIERS: ReadonlyArray<{ likes: number; days: number }> = [
  { likes: 50, days: 7 },
  { likes: 200, days: 14 },
  { likes: 1000, days: 30 },
  { likes: 2000, days: 60 },
];

export const SHARE_COOLDOWN_DAYS = 30;
export const SHARE_MAX_PENDING = 3;
export const SHARE_MIN_POST_AGE_HOURS = 48;

export function daysForLikes(likes: number): number {
  let days = 0;
  for (const tier of SHARE_TIERS) {
    if (likes >= tier.likes) days = tier.days;
  }
  return days;
}

export const SHARE_MESSAGE =
  'I plan my classes, assignments and study streaks with Rencana 📚✨ ' +
  'If you’re a student in Malaysia you need this app. https://www.rencana.com.my';

export const SUBMIT_ERROR_COPY: Record<string, string> = {
  not_authenticated: 'Please sign in again before submitting.',
  invalid_platform: 'Pick one of the supported platforms.',
  invalid_likes: 'Enter the number of likes your post has right now.',
  screenshot_required: 'Attach a screenshot that shows your post and its like count.',
  invalid_screenshot_path: 'The screenshot upload failed. Please pick it again.',
  invalid_url: 'Paste the full https:// link to your post.',
  host_not_allowed: 'That link isn’t from a supported platform. Use the post’s share link.',
  post_already_claimed: 'This post has already been claimed.',
  too_many_pending: `You already have ${SHARE_MAX_PENDING} claims in review. Wait for those first.`,
  platform_cooldown: `You already submitted a post for this platform in the last ${SHARE_COOLDOWN_DAYS} days.`,
};

export function submitErrorCopy(code: string): string {
  return SUBMIT_ERROR_COPY[code] ?? 'Could not submit your claim. Please check your connection and try again.';
}
