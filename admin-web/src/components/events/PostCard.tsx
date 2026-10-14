import { useState } from 'react';
import type { AdminCommunityPostRow } from '../../lib/api';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/page';
import { OutlineDangerButton } from './OutlineDangerButton';
import { audienceLabel, photosOf, shortDate, statusMeta, typeMeta } from './postUi';

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
  const likes = post.like_count ?? 0;

  return (
    <article
      className={`rounded-2xl border bg-white p-4 transition-colors dark:bg-slate-900 ${
        flagged
          ? 'border-l-4 border-rose-300 hover:border-rose-400 dark:border-rose-800 dark:hover:border-rose-700'
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
            <button
              type="button"
              onClick={onView}
              className="line-clamp-2 min-w-0 break-words text-left text-base font-black leading-snug text-slate-900 hover:underline dark:text-slate-100"
            >
              {post.title}
            </button>
            {post.body ? (
              <p className="mt-1 line-clamp-2 whitespace-pre-line break-words text-sm font-medium text-slate-500 dark:text-slate-400">
                {post.body}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Chip tone={tm.tone}>{tm.label}</Chip>
              <Chip tone={sm.tone}>{sm.label}</Chip>
              {post.pinned ? <Chip tone="warning">Pinned</Chip> : null}
              <Chip title="Who sees it">{audienceLabel(post)}</Chip>
              <Chip title="Author">by {post.author_name || 'Unknown'}</Chip>
              <Chip title="Posted on">
                <span className="tabular-nums">{shortDate(post.created_at)}</span>
              </Chip>
              <Chip title="Likes">
                <span className="tabular-nums">{likes}</span> like{likes === 1 ? '' : 's'}
              </Chip>
              <Chip title="Photos">
                <span className="tabular-nums">{photos.length}</span> photo{photos.length === 1 ? '' : 's'}
              </Chip>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 md:w-28 md:shrink-0 md:flex-col md:border-t-0 md:pt-0">
          <Button size="sm" onClick={onView}>
            View
          </Button>
          <Button size="sm" variant="secondary" onClick={onTogglePin} title={post.pinned ? 'Unpin' : 'Pin'}>
            {post.pinned ? 'Unpin' : 'Pin'}
          </Button>
          {post.status === 'active' ? (
            <Button size="sm" variant="secondary" onClick={() => onSetStatus('flagged')}>
              Flag
            </Button>
          ) : flagged ? (
            <Button size="sm" variant="secondary" onClick={() => onSetStatus('active')}>
              Unflag
            </Button>
          ) : null}
          <OutlineDangerButton onClick={onDelete}>Delete</OutlineDangerButton>
        </div>
      </div>
    </article>
  );
}
