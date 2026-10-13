import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useSafeActionDialog } from './SafeActionDialog';
import { CHIP, audienceLabel, dateTime, photosOf, statusMeta, typeMeta } from './events/postUi';

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

function EmptyTab({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-400 dark:border-slate-700 dark:text-slate-500">
      {children}
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

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

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

  const about: [string, ReactNode][] = post && data
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

  return createPortal(
    <div className="fixed inset-0 z-[140] flex justify-end bg-slate-950/50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {safeActionDialog}
      <aside
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        role="dialog"
        aria-label="Post details"
      >
        {/* Sticky header */}
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {post && tm && sm ? (
                  <>
                    <span className={`${CHIP} ${tm.chip}`}>{tm.emoji} {tm.label}</span>
                    <span className={`${CHIP} ${sm.chip}`}>{sm.label}</span>
                    {post.pinned ? (
                      <span className={`${CHIP} bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300`}>📌 Pinned</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Post</span>
                )}
              </div>
              <h2 className="mt-1.5 line-clamp-2 break-words text-xl font-black leading-snug text-slate-950 dark:text-white">
                {post ? post.title : error ? 'Could not load this post' : 'Loading…'}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-sm font-black text-slate-500 hover:bg-slate-200 hover:text-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="space-y-5 p-6">
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">{error}</div>
          ) : null}
          {!data && !error ? (
            <div className="animate-pulse space-y-3" aria-label="Loading">
              <div className="h-56 rounded-2xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-4 w-1/2 rounded-lg bg-slate-100 dark:bg-slate-800" />
              <div className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800" />
            </div>
          ) : null}

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

              {/* Author + body */}
              <div>
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  <span>
                    by <span className="font-black text-slate-800 dark:text-slate-100">{post.author_name || '—'}</span>
                  </span>
                  {post.author_email ? <span className="text-xs text-slate-400 dark:text-slate-500">{post.author_email}</span> : null}
                  <span className="text-xs text-slate-400 dark:text-slate-500">· {dateTime(post.created_at)}</span>
                </div>
                {post.body ? (
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-slate-200">{post.body}</p>
                ) : null}
              </div>

              {/* About */}
              <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">About</div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {about.map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-[10px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">{k}</dt>
                      <dd className="mt-0.5 break-words font-semibold text-slate-800 dark:text-slate-100">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              {/* Tabs */}
              <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Post activity">
                {tabs.map((t) => {
                  const selected = tab === t.id;
                  const alert = t.id === 'reports' && t.count > 0;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setTab(t.id)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition-colors ${
                        selected
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                      }`}
                    >
                      {t.label}
                      <span
                        className={`rounded-full px-1.5 text-[11px] leading-5 tabular-nums ${
                          alert
                            ? 'bg-rose-500 text-white dark:bg-rose-500 dark:text-white'
                            : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {t.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {tab === 'comments' ? (
                data.comments.length === 0 ? (
                  <EmptyTab>No comments yet.</EmptyTab>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {data.comments.map((c, i) => (
                      <li key={c.id ?? `${c.user_id}-${i}`} className="flex items-start gap-3 px-4 py-3">
                        <Avatar name={c.name} src={c.avatar} />
                        <div className="min-w-0 flex-1">
                          <PersonLine p={c} />
                          <div className="mt-1 flex items-start gap-3">
                            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">{c.content}</p>
                            <button
                              type="button"
                              onClick={() => deleteComment(c)}
                              className="shrink-0 rounded-lg border border-rose-200 px-2 py-0.5 text-[11px] font-black text-rose-700 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              ) : tab === 'likes' ? (
                data.likes.length === 0 ? (
                  <EmptyTab>No likes yet.</EmptyTab>
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
                <EmptyTab>No reports. Nobody has reported this post.</EmptyTab>
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
        </div>
      </aside>
    </div>,
    document.body,
  );
}
