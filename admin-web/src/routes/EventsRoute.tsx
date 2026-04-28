import { useEffect, useMemo, useState } from 'react';
import { listCommunityPosts, updateCommunityPost, deleteCommunityPost, type AdminCommunityPostRow } from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  event: { label: 'Event', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  service: { label: 'Service', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  memo: { label: 'Memo', color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300' },
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  flagged: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
};

export function EventsRoute() {
  const { searchQuery } = useAdminSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<AdminCommunityPostRow[]>([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const rows = await listCommunityPosts({
        postType: typeFilter !== 'all' ? typeFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        limit: 300,
      });
      setItems(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load posts');
    } finally {
      setBusy(false);
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

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

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

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Events & Posts</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Manage community events, services, and memos.
        </div>
      </MotionSection>

      <MotionPanel className="mt-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          {/* Filters */}
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex gap-3">
              <label className="block">
                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Type</div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">All types</option>
                  <option value="event">Events</option>
                  <option value="service">Services</option>
                  <option value="memo">Memos</option>
                </select>
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Status</div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                  <option value="flagged">Flagged</option>
                </select>
              </label>
            </div>
            <button
              onClick={() => void refresh()}
              disabled={busy}
              className="h-11 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70"
            >
              {busy ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {err ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
              {err}
            </div>
          ) : null}

          {/* Table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2">Post</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Author</th>
                  <th className="px-3 py-2">University</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const tb = TYPE_BADGE[p.post_type] || { label: p.post_type, color: 'bg-slate-100' };
                  const sb = STATUS_BADGE[p.status] || '';
                  return (
                    <tr
                      key={p.id}
                      className="border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40"
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {p.pinned && <span title="Pinned">📌</span>}
                          <div>
                            <div className="text-sm font-black text-slate-900 dark:text-slate-100 max-w-[280px] truncate">{p.title}</div>
                            {p.body && (
                              <div className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400 max-w-[280px] truncate">{p.body}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-xl px-2.5 py-1 text-xs font-bold ${tb.color}`}>{tb.label}</span>
                      </td>
                      <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{p.author_name || '—'}</td>
                      <td className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {p.university_id?.toUpperCase() || '—'}
                        {p.campus ? ` / ${p.campus}` : ''}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-xl px-2.5 py-1 text-xs font-bold ${sb}`}>{p.status}</span>
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                        {formatDate(p.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleTogglePin(p)}
                            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                            title={p.pinned ? 'Unpin' : 'Pin'}
                          >
                            {p.pinned ? '📌 Unpin' : 'Pin'}
                          </button>
                          {p.status === 'active' ? (
                            <button
                              onClick={() => handleSetStatus(p, 'flagged')}
                              className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-black text-amber-800 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200"
                            >
                              Flag
                            </button>
                          ) : p.status === 'flagged' ? (
                            <button
                              onClick={() => handleSetStatus(p, 'active')}
                              className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-black text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200"
                            >
                              Unflag
                            </button>
                          ) : null}
                          <button
                            onClick={() => handleDelete(p)}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-black text-rose-800 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && !busy ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                      No posts found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {filtered.length} post{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      </MotionPanel>
    </div>
  );
}
