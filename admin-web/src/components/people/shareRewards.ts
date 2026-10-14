import type { SocialShareClaimRow, SocialSharePlatform } from '../../lib/api';
import type { Tone } from '../../ui/tones';

export type ClaimStatus = SocialShareClaimRow['status'];

export const PLATFORM_LABEL: Record<SocialSharePlatform, string> = {
  threads: 'Threads',
  x: 'X',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const STATUS_TONE: Record<ClaimStatus, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

export function isYoungerThan48h(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < 48 * 60 * 60 * 1000;
}

/** Date of the user's current paid access ending. */
export function formatExpiry(iso: string | null | undefined): string {
  if (!iso) return 'no expiry';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}
