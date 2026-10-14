import { useEffect, useMemo, useState } from 'react';
import { listCommunityPosts, updateCommunityPost, deleteCommunityPost, type AdminCommunityPostRow } from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { Button } from '../ui/Button';
import { EmptyState, Notice, PageHeader, Panel, Pill, PillGroup, SkeletonRows } from '../ui/page';
import { AdminPostComposer } from '../components/AdminPostComposer';
import { CommunityPostDrawer } from '../components/CommunityPostDrawer';
import { PostCard } from '../components/events/PostCard';

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
    <div className="space-y-5">
      <PageHeader
        title="Events & posts"
        description="Events, memos and services students post in the app. Open one to see its photos, comments, likes and reports."
        actions={
          <>
            <Button variant="secondary" onClick={() => void refresh()} disabled={busy}>
              {busy ? 'Loading…' : 'Refresh'}
            </Button>
            <Button onClick={() => setComposing(true)}>+ Post as Admin Rencana</Button>
          </>
        }
      />

      {/* Quick filters with counts */}
      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
          <div role="group" aria-label="Filter by type">
            <PillGroup label="Type">
              {TYPE_PILLS.map((p) => (
                <Pill key={p.value} count={typeCount(p.value)} active={typeFilter === p.value} onClick={() => setTypeFilter(p.value)}>
                  {p.label}
                </Pill>
              ))}
            </PillGroup>
          </div>
          <div role="group" aria-label="Filter by status">
            <PillGroup label="Status">
              {STATUS_PILLS.map((p) => (
                <Pill
                  key={p.value}
                  count={statusCount(p.value)}
                  active={statusFilter === p.value}
                  alert={p.value === 'flagged'}
                  title={statusFilter === p.value ? 'Click again to show every status' : undefined}
                  onClick={() => setStatusFilter(statusFilter === p.value ? 'all' : p.value)}
                >
                  {p.label}
                </Pill>
              ))}
            </PillGroup>
          </div>
        </div>
        <div className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {items.length >= LOAD_LIMIT
            ? `Counts are for the newest ${LOAD_LIMIT} posts loaded, so real totals may be higher.`
            : 'Counts are for the posts loaded with these filters.'}
          {searching ? ` ${filtered.length} of ${items.length} match your search.` : ''}
        </div>
      </Panel>

      {err ? <Notice tone="danger">{err}</Notice> : null}

      {/* List */}
      {showSkeletons ? (
        <SkeletonRows rows={3} height="h-28" />
      ) : filtered.length === 0 && err && items.length === 0 ? null : filtered.length === 0 ? (
        <EmptyState
          title={searching ? 'Nothing matches your search.' : 'No posts here yet.'}
          action={<Button onClick={() => setComposing(true)}>+ Post as Admin Rencana</Button>}
        >
          {searching
            ? 'Try other words, or clear the search box at the top.'
            : typeFilter !== 'all' || statusFilter !== 'all'
              ? 'Try another filter above, or share something with students yourself.'
              : 'When students share events, memos or services, they show up here. You can also post one yourself.'}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onView={() => setViewing(p.id)}
              onTogglePin={() => void handleTogglePin(p)}
              onSetStatus={(status) => void handleSetStatus(p, status)}
              onDelete={() => void handleDelete(p)}
            />
          ))}
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Showing {filtered.length} post{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

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
    </div>
  );
}
