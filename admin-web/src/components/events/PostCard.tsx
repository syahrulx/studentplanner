import { useState } from 'react';
import type { AdminCommunityPostRow } from '../../lib/api';
import { CHIP, META_CHIP, audienceLabel, photosOf, shortDate, statusMeta, typeMeta } from './postUi';

const BTN = 'inline-flex h-9 items-center justify-center rounded-xl px-3 text-xs font-black transition-colors';

/** One community post in the admin list: thumbnail, title, preview, details and actions. */
export function PostCard({
  post,
  onView,
  onTogglePin,
  onSetStatus,
  onDelete,
}: {
  post: AdminCommunityPostRow;
  onView: () => void;
  onTogglePin: () => void;
  onSetStatus: (status: 'active' | 'flagged') => void;
  onDelete: () => void;
}) {
  const [thumbBroken, setThumbBroken] = useState(false);
  const tm = typeMeta(post.post_type);
  const sm = statusMeta(post.status);
  const photos = photosOf(post);
  const thumb = photos[0];
  const flagged = post.status === 'flagged';

  return (
    <article
      className={`rounded-2xl border bg-white p-4 transition-colors dark:bg-slate-900 ${
        flagged
          ? 'border-rose-300 border-l-4 hover:border-rose-400 dark:border-rose-800 dark:hover:border-rose-700'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
      }`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex min-w-0 flex-1 gap-4">
          <button
            type="button"
            onClick={onView}
            className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-slate-800"
            aria-label={`View ${post.title}`}
          >
            {thumb && !thumbBroken ? (
              <img src={thumb} alt="" loading="lazy" onError={() => setThumbBroken(true)} className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-2xl" aria-hidden>
                {tm.emoji}
              </span>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={onView}
                className="line-clamp-2 min-w-0 break-words text-left text-base font-black leading-snug text-slate-900 hover:underline dark:text-slate-100"
              >
                {post.title}
              </button>
              {flagged ? (
                <span className={`${CHIP} mt-0.5 shrink-0 bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300`}>⚑ Flagged</span>
              ) : null}
            </div>
            {post.body ? (
              <p className="mt-1 line-clamp-2 whitespace-pre-line break-words text-sm font-medium text-slate-500 dark:text-slate-400">
                {post.body}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className={`${CHIP} ${tm.chip}`}>{tm.label}</span>
              {!flagged ? <span className={`${CHIP} ${sm.chip}`}>{sm.label}</span> : null}
              {post.pinned ? (
                <span className={`${CHIP} bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300`}>📌 Pinned</span>
              ) : null}
              <span className={META_CHIP} title="Who sees it">
                👥 {audienceLabel(post)}
              </span>
              <span className={META_CHIP} title="Author">
                ✍️ {post.author_name || 'Unknown'}
              </span>
              <span className={`${META_CHIP} tabular-nums`} title="Posted on">
                {shortDate(post.created_at)}
              </span>
              <span className={`${META_CHIP} tabular-nums`} title="Likes">
                ♡ {post.like_count ?? 0}
              </span>
              <span className={`${META_CHIP} tabular-nums`} title="Photos">
                🖼 {photos.length} photo{photos.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 md:w-28 md:shrink-0 md:flex-col md:border-t-0 md:pt-0">
          <button
            type="button"
            onClick={onView}
            className={`${BTN} bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200`}
          >
            View
          </button>
          <button
            type="button"
            onClick={onTogglePin}
            title={post.pinned ? 'Unpin' : 'Pin'}
            className={`${BTN} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`}
          >
            {post.pinned ? 'Unpin' : 'Pin'}
          </button>
          {post.status === 'active' ? (
            <button
              type="button"
              onClick={() => onSetStatus('flagged')}
              className={`${BTN} border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40`}
            >
              Flag
            </button>
          ) : flagged ? (
            <button
              type="button"
              onClick={() => onSetStatus('active')}
              className={`${BTN} border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/40`}
            >
              Unflag
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            className={`${BTN} border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/40`}
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

/** Grey placeholder card shown while posts load. */
export function PostCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" aria-hidden>
      <div className="flex gap-4">
        <div className="h-[72px] w-[72px] shrink-0 rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="min-w-0 flex-1 space-y-2.5 pt-1">
          <div className="h-4 w-2/3 rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 w-full rounded-lg bg-slate-100 dark:bg-slate-800/70" />
          <div className="h-3 w-4/5 rounded-lg bg-slate-100 dark:bg-slate-800/70" />
          <div className="flex gap-1.5 pt-1">
            <div className="h-5 w-14 rounded-lg bg-slate-100 dark:bg-slate-800/70" />
            <div className="h-5 w-20 rounded-lg bg-slate-100 dark:bg-slate-800/70" />
            <div className="h-5 w-16 rounded-lg bg-slate-100 dark:bg-slate-800/70" />
          </div>
        </div>
        <div className="hidden w-28 shrink-0 space-y-2 md:block">
          <div className="h-9 rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-9 rounded-xl bg-slate-100 dark:bg-slate-800/70" />
        </div>
      </div>
    </div>
  );
}
