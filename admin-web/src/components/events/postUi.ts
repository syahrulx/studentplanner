/**
 * Shared look for community posts (events, memos, services) in the admin:
 * labels, chip tones (for the kit's Chip) and small text helpers used by the
 * Events & posts list and the post side panel. Presentation only — no data calls here.
 */
import type { Tone } from '../../ui/tones';

export type PostType = 'event' | 'memo' | 'service';
export type PostStatus = 'active' | 'closed' | 'flagged';

export const TYPE_META: Record<string, { label: string; emoji: string; tone: Tone }> = {
  event: { label: 'Event', emoji: '📅', tone: 'info' },
  memo: { label: 'Memo', emoji: '📌', tone: 'violet' },
  service: { label: 'Service', emoji: '🧰', tone: 'warning' },
};

export const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
  flagged: { label: 'Flagged', tone: 'danger' },
};

export function typeMeta(type: string) {
  return TYPE_META[type] ?? { label: type, emoji: '📝', tone: 'neutral' as Tone };
}

export function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, tone: 'neutral' as Tone };
}

/** All photo URLs of a post, newest format (image_urls) first, old single image_url as fallback. */
export function photosOf(post: { image_urls?: string[] | null; image_url?: string | null }): string[] {
  if (post.image_urls?.length) return post.image_urls;
  return post.image_url ? [post.image_url] : [];
}

/** Who can see the post: everyone, a whole university, or one campus. */
export function audienceLabel(post: { university_id: string | null; campus: string | null }): string {
  if (!post.university_id) return 'Everyone';
  return `${post.university_id.toUpperCase()} · ${post.campus || 'whole university'}`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
