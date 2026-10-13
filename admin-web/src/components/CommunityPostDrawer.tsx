import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useSafeActionDialog } from './SafeActionDialog';

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

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function Avatar({ name, src }: { name: string | null; src?: string | null }) {
  if (src) return <img src={src} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />;
  const initials = (name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-200 text-[11px] font-black text-slate-600 dark:bg-slate-700 dark:text-slate-200">{initials}</span>;
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">{title} <span className="text-slate-400">({count})</span></div>
      {children}
    </section>
  );
}

export function CommunityPostDrawer({ postId, onClose, onChanged }: { postId: string; onClose: () => void; onChanged?: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'comments' | 'likes' | 'reports'>('comments');
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
  const photos = post ? (post.image_urls?.length ? post.image_urls : post.image_url ? [post.image_url] : []) : [];
  const list = (people: Person[], extra?: (p: Person) => ReactNode) =>
    people.length === 0 ? <div className="text-sm text-slate-400">None yet.</div> : (
      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {people.map((p, i) => (
          <div key={`${p.user_id ?? p.reporter_id}-${i}`} className="flex items-start gap-3 px-3 py-2.5">
            <Avatar name={p.name} src={p.avatar} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-black text-slate-900 dark:text-white">{p.name || 'No name'}</span>
                <span className="text-xs text-slate-400">{p.email}</span>
                <span className="ml-auto text-[11px] text-slate-400">{when(p.created_at)}</span>
              </div>
              {extra?.(p)}
            </div>
          </div>
        ))}
      </div>
    );

  return createPortal(
    <div className="fixed inset-0 z-[140] flex justify-end bg-slate-950/50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {safeActionDialog}
      <aside className="h-full w-full max-w-2xl space-y-5 overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900" role="dialog" aria-label="Post details">
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">{post ? `${post.post_type} · ${post.status}${post.pinned ? ' · pinned' : ''}` : 'Post'}</div>
          <button type="button" onClick={onClose} className="text-sm font-black text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
        </div>
        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">{error}</div> : null}
        {!data && !error ? <div className="p-8 text-center text-sm text-slate-400">Loading…</div> : null}

        {post ? (
          <>
            {photos.length ? (
              <div className={`grid gap-2 ${photos.length > 1 ? 'grid-cols-2' : ''}`}>
                {photos.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="" className="max-h-80 w-full rounded-2xl object-cover" />
                  </a>
                ))}
              </div>
            ) : null}
            <div>
              <div className="text-2xl font-black text-slate-950 dark:text-white">{post.title}</div>
              <div className="mt-1 text-sm font-semibold text-slate-500">
                by {post.author_name || '—'} <span className="text-slate-400">{post.author_email}</span> · {when(post.created_at)}
              </div>
              {post.body ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{post.body}</p> : null}
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 p-4 text-sm dark:border-slate-800">
              {[
                ['Who sees it', post.university_id ? `${post.university_id.toUpperCase()}${post.campus ? ` · ${post.campus}` : ' · whole university'}` : 'Everyone'],
                ['Event date', post.event_date ? `${post.event_date}${post.event_time ? ` ${post.event_time}` : ''}` : '—'],
                ['Place', post.location || '—'],
                ['Hides after', post.expires_at ? when(post.expires_at) : 'Never'],
              ].map(([k, v]) => (
                <div key={k}><dt className="text-[10px] font-black uppercase tracking-wide text-slate-400">{k}</dt><dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100">{v}</dd></div>
              ))}
            </dl>

            <div className="flex gap-2">
              {([
                ['comments', `💬 Comments ${data!.comments.length}`],
                ['likes', `♡ Likes ${data!.likes.length}`],
                ['reports', `⚑ Reports ${data!.reports.length}`],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setTab(id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black ${tab === id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'} ${id === 'reports' && data!.reports.length ? 'ring-2 ring-rose-400' : ''}`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'comments' ? (
              <Section title="Comments" count={data!.comments.length}>
                {list(data!.comments, (p) => {
                  const c = p as Comment;
                  return (
                    <div className="mt-0.5 flex items-start gap-2">
                      <p className="flex-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{c.content}</p>
                      <button type="button" onClick={() => deleteComment(c)} className="shrink-0 rounded-lg border border-rose-200 px-2 py-0.5 text-[11px] font-black text-rose-700 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-300">Delete</button>
                    </div>
                  );
                })}
              </Section>
            ) : tab === 'likes' ? (
              <Section title="Liked by" count={data!.likes.length}>{list(data!.likes)}</Section>
            ) : (
              <Section title="Reported by" count={data!.reports.length}>
                {list(data!.reports, (p) => <div className="mt-0.5 text-sm text-rose-700 dark:text-rose-300">Reason: {(p as Report).reason}</div>)}
              </Section>
            )}
            <p className="text-xs font-semibold text-slate-400">Private: names and emails are for moderation only.</p>
          </>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}
