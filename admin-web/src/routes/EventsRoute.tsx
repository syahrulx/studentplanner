import { useEffect, useMemo, useState } from 'react';
import { listCommunityPosts, updateCommunityPost, deleteCommunityPost, type AdminCommunityPostRow } from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';
import { AdminPostComposer } from '../components/AdminPostComposer';
import { CommunityPostDrawer } from '../components/CommunityPostDrawer';
import { FilterPill } from '../components/events/FilterPill';
import { PostCard, PostCardSkeleton } from '../components/events/PostCard';

const LOAD_LIMIT = 300;

const TYPE_PILLS = [
  { value: 'all', label: 'All' },
  { value: 'event', label: 'Events' },
  { value: 'memo', label: 'Memos' },
  { value: 'service', label: 'Services' },
] as const;

const STATUS_PILLS = [
  { value: 'active', label: 'Active' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'closed', label: 'Closed' },
] as const;

const PRIMARY_BTN =
  'h-11 rounded-2xl bg-slate-900 px-4 text-sm font-black text-white shadow-soft hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200';

export function EventsRoute() {
  const { searchQuery } = useAdminSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<AdminCommunityPostRow[]>([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [composing, setComposing] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const rows = await listCommunityPosts({
        postType: typeFilter !== 'all' ? typeFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        limit: LOAD_LIMIT,
      });
      setItems(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load posts');
    } finally {
      setBusy(false);
      setLoadedOnce(true);
    }
  };

  useEffect(() => {
    void refresh();
  }, [typeFilter, statusFilter]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return items;
    return items.filter((p) =>
      matchesAdminSearch(searchQuery, p.id, p.title, p.body || '', p.author_name || '', p.university_id || '', p.campus || ''),
    );
  }, [items, searchQuery]);

  // Counts come from the posts loaded right now (the server already applied
  // the type/status filters). A count is only shown when it is true for the
  // loaded list: e.g. while "Events" is picked we cannot know how many memos exist.
  const counts = useMemo(() => {
    const byType: Record<string, number> = { all: items.length };
    const byStatus: Record<string, number> = {};
    for (const p of items) {
      byType[p.post_type] = (byType[p.post_type] ?? 0) + 1;
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    }
    return { byType, byStatus };
  }, [items]);

  const typeCount = (value: string) =>
    typeFilter === 'all' || typeFilter === value ? (counts.byType[value] ?? 0) : null;
  const statusCount = (value: string) =>
    statusFilter === 'all' || statusFilter === value ? (counts.byStatus[value] ?? 0) : null;

  const handleTogglePin = async (post: AdminCommunityPostRow) => {
    try {
      await updateCommunityPost(post.id, { pinned: !post.pinned });
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  const handleSetStatus = async (post: AdminCommunityPostRow, status: 'active' | 'closed' | 'flagged') => {
    try {
      await updateCommunityPost(post.id, { status });
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  const handleDelete = async (post: AdminCommunityPostRow) => {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    try {
      await deleteCommunityPost(post.id);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const searching = searchQuery.trim().length > 0;
  const showSkeletons = busy && (!loadedOnce || items.length === 0);

  return (
    <div>
      {viewing ? <CommunityPostDrawer postId={viewing} onClose={() => setViewing(null)} onChanged={() => void refresh()} /> : null}
      {composing ? (
        <AdminPostComposer
          onClose={() => setComposing(false)}
          onPosted={async () => {
            setComposing(false);
            await refresh();
          }}
        />
      ) : null}

      {/* Header */}
      <MotionSection>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Events & posts</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Events, memos and services students post in the app. Open one to see its photos, comments, likes and reports.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={busy}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {busy ? 'Loading…' : 'Refresh'}
            </button>
            <button type="button" onClick={() => setComposing(true)} className={PRIMARY_BTN}>
              + Post as Admin Rencana
            </button>
          </div>
        </div>
      </MotionSection>

      {/* Quick filters with counts */}
      <MotionPanel className="mt-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by type">
              <span className="mr-1 text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Type</span>
              {TYPE_PILLS.map((p) => (
                <FilterPill
                  key={p.value}
                  label={p.label}
                  count={typeCount(p.value)}
                  active={typeFilter === p.value}
                  onClick={() => setTypeFilter(p.value)}
                />
              ))}
            </div>
            <div className="hidden h-6 w-px bg-slate-200 dark:bg-slate-700 lg:block" aria-hidden />
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
              <span className="mr-1 text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Status</span>
              {STATUS_PILLS.map((p) => (
                <FilterPill
                  key={p.value}
                  label={p.label}
                  count={statusCount(p.value)}
                  active={statusFilter === p.value}
                  alert={p.value === 'flagged'}
                  title={statusFilter === p.value ? 'Click again to show every status' : undefined}
                  onClick={() => setStatusFilter(statusFilter === p.value ? 'all' : p.value)}
                />
              ))}
            </div>
          </div>
          <div className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {items.length >= LOAD_LIMIT
              ? `Counts are for the newest ${LOAD_LIMIT} posts loaded, so real totals may be higher.`
              : 'Counts are for the posts loaded with these filters.'}
            {searching ? ` ${filtered.length} of ${items.length} match your search.` : ''}
          </div>
        </div>
      </MotionPanel>

      {err ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </div>
      ) : null}

      {/* List */}
      <div className="mt-4 space-y-3">
        {showSkeletons ? (
          <>
            <PostCardSkeleton />
            <PostCardSkeleton />
            <PostCardSkeleton />
          </>
        ) : filtered.length === 0 && err && items.length === 0 ? null : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <div className="text-3xl" aria-hidden>
              🗓️
            </div>
            <div className="mt-3 text-base font-black text-slate-900 dark:text-slate-100">
              {searching ? 'Nothing matches your search.' : 'No posts here yet.'}
            </div>
            <p className="mx-auto mt-1 max-w-md text-sm font-semibold text-slate-500 dark:text-slate-400">
              {searching
                ? 'Try other words, or clear the search box at the top.'
                : typeFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try another filter above, or share something with students yourself.'
                  : 'When students share events, memos or services, they show up here. You can also post one yourself.'}
            </p>
            <button type="button" onClick={() => setComposing(true)} className={`${PRIMARY_BTN} mt-5`}>
              + Post as Admin Rencana
            </button>
          </div>
        ) : (
          filtered.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onView={() => setViewing(p.id)}
              onTogglePin={() => void handleTogglePin(p)}
              onSetStatus={(status) => void handleSetStatus(p, status)}
              onDelete={() => void handleDelete(p)}
            />
          ))
        )}
      </div>

      {!showSkeletons && filtered.length > 0 ? (
        <div className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Showing {filtered.length} post{filtered.length !== 1 ? 's' : ''}
        </div>
      ) : null}
    </div>
  );
}
