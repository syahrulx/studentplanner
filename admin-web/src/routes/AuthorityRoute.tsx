import { useEffect, useMemo, useState } from 'react';
import { listAuthorityRequests, reviewAuthorityRequest, type AdminAuthorityRequestRow } from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
};

export function AuthorityRoute() {
  const { searchQuery } = useAdminSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<AdminAuthorityRequestRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selected, setSelected] = useState<AdminAuthorityRequestRow | null>(null);

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const rows = await listAuthorityRequests({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        limit: 300,
      });
      setItems(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load requests');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [statusFilter]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return items;
    return items.filter((r) =>
      matchesAdminSearch(searchQuery, r.id, r.user_name || '', r.role_title, r.university_id || '', r.justification || ''),
    );
  }, [items, searchQuery]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleReview = async (req: AdminAuthorityRequestRow, decision: 'approved' | 'rejected') => {
    const label = decision === 'approved' ? 'approve' : 'reject';
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} authority request from "${req.user_name}"?`)) return;
    try {
      await reviewAuthorityRequest(req.id, decision);
      setSelected(null);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${label}`);
    }
  };

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Authority Requests</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Review and manage authority role requests. Approved users can post official memos.
        </div>
      </MotionSection>

      <MotionPanel className="mt-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          {/* Filters */}
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <label className="block">
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Status</div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
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

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_400px]">
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">University</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const isSelected = selected?.id === r.id;
                    return (
                      <tr
                        key={r.id}
                        className={[
                          'cursor-pointer rounded-2xl border transition',
                          isSelected
                            ? 'border-brand-500 bg-brand-600/10 dark:bg-brand-400/10'
                            : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-950/70',
                        ].join(' ')}
                        onClick={() => setSelected(isSelected ? null : r)}
                      >
                        <td className="px-3 py-3">
                          <div className="text-sm font-black text-slate-900 dark:text-slate-100">{r.user_name || 'Unknown'}</div>
                          <div className="mt-0.5 font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">{r.user_id}</div>
                        </td>
                        <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{r.role_title}</td>
                        <td className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {r.university_id?.toUpperCase() || '—'}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-xl px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[r.status] || ''}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                          {formatDate(r.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && !busy ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                        No requests found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* Detail panel */}
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-950/40">
              <div className="text-sm font-black text-slate-900 dark:text-slate-100">Request Details</div>
              <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Select a request to review.</div>

              {selected ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">User</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{selected.user_name}</div>
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Role Title</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{selected.role_title}</div>
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">University</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selected.university_id?.toUpperCase() || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Justification</div>
                    <div className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                      {selected.justification || 'No justification provided.'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Status</div>
                    <span className={`mt-1 inline-flex rounded-xl px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[selected.status] || ''}`}>
                      {selected.status}
                    </span>
                  </div>

                  {selected.status === 'pending' && (
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => handleReview(selected, 'approved')}
                        className="h-11 flex-1 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white shadow-soft hover:bg-emerald-700"
                      >
                        ✅ Approve
                      </button>
                      <button
                        onClick={() => handleReview(selected, 'rejected')}
                        className="h-11 flex-1 rounded-2xl bg-rose-600 px-4 text-sm font-black text-white shadow-soft hover:bg-rose-700"
                      >
                        ❌ Reject
                      </button>
                    </div>
                  )}
                  {selected.status !== 'pending' && selected.reviewed_at && (
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Reviewed on {formatDate(selected.reviewed_at)}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {filtered.length} request{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      </MotionPanel>
    </div>
  );
}
