import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { Chip, EmptyState, FactGrid, Notice, Pill, PillGroup, SidePanel, SkeletonRows } from '../ui/page';
import { useSafeActionDialog } from './SafeActionDialog';
import { OutlineDangerButton } from './events/OutlineDangerButton';
import { audienceLabel, dateTime, photosOf, statusMeta, typeMeta } from './events/postUi';

/**
 * One community post (event, memo or service) for admins: photos, details,
 * who liked it, every comment (with delete) and every report. Data from
 * admin_community_post_detail() (gradeup-mobile migration
 * 20261013000006_admin_community_post_detail.sql).
 */

type Person = { user_id?: string; reporter_id?: string; name: string | null; email: string | null; avatar?: string | null; created_at: string };
type Comment = Person & { id: string; content: string };
type Report = Person & { reason: string };
type Detail = {
  post: Record<string, unknown> & {
    id: string; title: string; body: string | null; post_type: string; status: string; pinned: boolean;
    image_urls?: string[] | null; image_url?: string | null; university_id: string | null; campus: string | null;
    event_date: string | null; event_time: string | null; location: string | null; expires_at: string | null;
    like_count?: number; created_at: string; author_name: string | null; author_email: string | null;
  };
  likes: Person[];
  comments: Comment[];
  reports: Report[];
};

type Tab = 'comments' | 'likes' | 'reports';

function Avatar({ name, src }: { name: string | null; src?: string | null }) {
  if (src) return <img src={src} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  const initials = (name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-200 text-[11px] font-black text-slate-600 dark:bg-slate-700 dark:text-slate-200">
      {initials}
    </span>
  );
}

function PersonLine({ p }: { p: Person }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="text-sm font-black text-slate-900 dark:text-white">{p.name || 'No name'}</span>
      {p.email ? <span className="truncate text-xs font-semibold text-slate-400 dark:text-slate-500">{p.email}</span> : null}
      <span className="ml-auto whitespace-nowrap text-[11px] font-semibold tabular-nums text-slate-400 dark:text-slate-500">{dateTime(p.created_at)}</span>
    </div>
  );
}

export function CommunityPostDrawer({ postId, onClose, onChanged }: { postId: string; onClose: () => void; onChanged?: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('comments');
  const [photoIndex, setPhotoIndex] = useState(0);
  const { requestSafeAction, safeActionDialog } = useSafeActionDialog();

  const load = useCallback(async () => {
    const { data: d, error: e } = await supabase.rpc('admin_community_post_detail', { p_post_id: postId });
    if (e) {
      setError(e.code === 'PGRST202' || /could not find the function/i.test(e.message)
        ? 'Post details need gradeup-mobile migration 20261013000006_admin_community_post_detail.sql. Run it in the Supabase SQL Editor.'
        : e.message);
      return;
    }
    setData(d as Detail);
    setError(null);
  }, [postId]);
  useEffect(() => { void load(); }, [load]);

  const deleteComment = (c: Comment) =>
    requestSafeAction({
      title: 'Delete this comment',
      operation: 'Delete comment',
      affectedCount: 1,
      subject: `${c.name || c.email || 'Student'}: “${c.content.slice(0, 120)}${c.content.length > 120 ? '…' : ''}”`,
      requireReason: true,
      irreversible: true,
      warning: 'The comment disappears for everyone. Its text is kept in the admin log with your reason.',
      onConfirm: async (reason) => {
        const { error: e } = await supabase.rpc('admin_delete_community_post_comment', { p_comment_id: c.id, p_reason: reason });
        if (e) throw new Error(e.message);
        await load();
        onChanged?.();
      },
    });

  const post = data?.post;
  const photos = post ? photosOf(post) : [];
  const shownIndex = Math.min(photoIndex, Math.max(photos.length - 1, 0));
  const shownPhoto = photos.length ? photos[shownIndex] : null;
  const tm = post ? typeMeta(post.post_type) : null;
  const sm = post ? statusMeta(post.status) : null;

  const about: [ReactNode, ReactNode][] = post && data
    ? [
        ['Who sees it', audienceLabel(post)],
        ['Event date', post.event_date ? `${post.event_date}${post.event_time ? ` ${post.event_time}` : ''}` : '—'],
        ['Place', post.location || '—'],
        ['Hides after', post.expires_at ? dateTime(post.expires_at) : 'Never'],
        ['Likes', data.likes.length],
        ['Comments', data.comments.length],
        [
          'Reports',
          data.reports.length ? <span className="text-rose-700 dark:text-rose-300">{data.reports.length}</span> : 0,
        ],
      ]
    : [];

  const tabs: { id: Tab; label: string; count: number }[] = data
    ? [
        { id: 'comments', label: 'Comments', count: data.comments.length },
        { id: 'likes', label: 'Likes', count: data.likes.length },
        { id: 'reports', label: 'Reports', count: data.reports.length },
      ]
    : [];

  const title = post ? post.title : error ? 'Could not load this post' : 'Loading…';

  return (
    <>
      <SidePanel
        title={title}
        subtitle={
          post ? (
            <>
              by <span className="font-black text-slate-800 dark:text-slate-100">{post.author_name || '—'}</span>
              {post.author_email ? <span className="text-slate-400 dark:text-slate-500"> · {post.author_email}</span> : null}
              <span className="text-slate-400 dark:text-slate-500"> · {dateTime(post.created_at)}</span>
            </>
          ) : undefined
        }
        chips={
          post && tm && sm ? (
            <>
              <Chip tone={tm.tone}>{tm.label}</Chip>
              <Chip tone={sm.tone}>{sm.label}</Chip>
              {post.pinned ? <Chip tone="warning">Pinned</Chip> : null}
            </>
          ) : (
            <Chip>Post</Chip>
          )
        }
        onClose={onClose}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {!data && !error ? <SkeletonRows rows={3} height="h-24" /> : null}

        {post && data ? (
          <>
            {/* Photos */}
            {shownPhoto ? (
              <div className="space-y-2">
                <a href={shownPhoto} target="_blank" rel="noreferrer" title="Open full size in a new tab" className="block overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
                  <img src={shownPhoto} alt="" className="max-h-96 w-full object-contain" />
                </a>
                {photos.length > 1 ? (
                  <div className="flex gap-2">
                    {photos.map((url, i) => {
                      const selected = i === shownIndex;
                      return (
                        <button
                          key={`${url}-${i}`}
                          type="button"
                          onClick={() => setPhotoIndex(i)}
                          aria-label={`Show photo ${i + 1}`}
                          aria-pressed={selected}
                          className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl ring-2 transition ${
                            selected
                              ? 'ring-slate-900 dark:ring-white'
                              : 'opacity-70 ring-transparent hover:opacity-100 dark:ring-transparent'
                          }`}
                        >
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {post.body ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-slate-200">{post.body}</p>
            ) : null}

            <FactGrid items={about} />

            {/* Activity: comments / likes / reports */}
            <div role="group" aria-label="Post activity">
              <PillGroup>
                {tabs.map((t) => (
                  <Pill key={t.id} active={tab === t.id} count={t.count} alert={t.id === 'reports'} onClick={() => setTab(t.id)}>
                    {t.label}
                  </Pill>
                ))}
              </PillGroup>
            </div>

            {tab === 'comments' ? (
              data.comments.length === 0 ? (
                <EmptyState title="No comments yet." />
              ) : (
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {data.comments.map((c, i) => (
                    <li key={c.id ?? `${c.user_id}-${i}`} className="flex items-start gap-3 px-4 py-3">
                      <Avatar name={c.name} src={c.avatar} />
                      <div className="min-w-0 flex-1">
                        <PersonLine p={c} />
                        <div className="mt-1 flex items-start gap-3">
                          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">{c.content}</p>
                          <OutlineDangerButton onClick={() => deleteComment(c)} size="xs" className="shrink-0">
                            Delete
                          </OutlineDangerButton>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : tab === 'likes' ? (
              data.likes.length === 0 ? (
                <EmptyState title="No likes yet." />
              ) : (
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {data.likes.map((p, i) => (
                    <li key={`${p.user_id}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar name={p.name} src={p.avatar} />
                      <div className="min-w-0 flex-1">
                        <PersonLine p={p} />
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : data.reports.length === 0 ? (
              <EmptyState title="No reports.">Nobody has reported this post.</EmptyState>
            ) : (
              <ul className="divide-y divide-rose-100 rounded-2xl border border-rose-200 bg-rose-50/60 dark:divide-rose-900/40 dark:border-rose-900/50 dark:bg-rose-950/30">
                {data.reports.map((r, i) => (
                  <li key={`${r.reporter_id}-${i}`} className="flex items-start gap-3 px-4 py-3">
                    <Avatar name={r.name} src={r.avatar} />
                    <div className="min-w-0 flex-1">
                      <PersonLine p={r} />
                      <div className="mt-1 text-sm text-rose-800 dark:text-rose-200">
                        <span className="font-black">Reason:</span> {r.reason || '—'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">Private: names and emails are for moderation only.</p>
          </>
        ) : null}
      </SidePanel>
      {safeActionDialog}
    </>
  );
}
