/**
 * Shared look for community posts (events, memos, services) in the admin:
 * labels, chip colours and small text helpers used by the Events & posts
 * list and the post side panel. Presentation only — no data calls here.
 */

export type PostType = 'event' | 'memo' | 'service';
export type PostStatus = 'active' | 'closed' | 'flagged';

export const TYPE_META: Record<string, { label: string; emoji: string; chip: string }> = {
  event: { label: 'Event', emoji: '📅', chip: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  memo: { label: 'Memo', emoji: '📌', chip: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300' },
  service: { label: 'Service', emoji: '🧰', chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
};

export const STATUS_META: Record<string, { label: string; chip: string }> = {
  active: { label: 'Active', chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  closed: { label: 'Closed', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  flagged: { label: 'Flagged', chip: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300' },
};

const NEUTRAL_CHIP = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

export function typeMeta(type: string) {
  return TYPE_META[type] ?? { label: type, emoji: '📝', chip: NEUTRAL_CHIP };
}

export function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, chip: NEUTRAL_CHIP };
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

export const CHIP = 'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold';
export const META_CHIP = `${CHIP} ${NEUTRAL_CHIP}`;
