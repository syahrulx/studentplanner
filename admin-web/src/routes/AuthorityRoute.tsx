import { useEffect, useMemo, useState } from 'react';
import { listAuthorityRequests, reviewAuthorityRequest, deleteAuthorityRequest, type AdminAuthorityRequestRow } from '../lib/api';
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
    const label = decision === 'approved' ? 'approve' : (req.status === 'approved' ? 'revoke' : 'reject');
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} authority request from "${req.user_name}"?`)) return;
    try {
      await reviewAuthorityRequest(req.id, decision);
      setSelected(null);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${label}`);
    }
  };

  const handleDelete = async (req: AdminAuthorityRequestRow) => {
    if (!confirm(`Permanently delete authority request from "${req.user_name}"? This cannot be undone.`)) return;
    try {
      await deleteAuthorityRequest(req.id);
      setSelected(null);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete');
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
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between pb-4 border-b border-slate-100 dark:border-slate-800/60">
            <label className="block">
              <div className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Status Filter</div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 min-w-[160px] appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm font-bold text-slate-700 outline-none transition-shadow hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600"
                style={{ backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394A3B8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '10px auto' }}
              >
                <option value="all">All Requests</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <button
              onClick={() => void refresh()}
              disabled={busy}
              className="h-10 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {busy ? 'Loading…' : 'Refresh Data'}
            </button>
          </div>

          {err ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
              {err}
            </div>
          ) : null}

          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_360px] items-start">
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
                            'cursor-pointer transition-all',
                            isSelected
                              ? 'bg-brand-50/60 ring-1 ring-inset ring-brand-500 dark:bg-brand-900/20 dark:ring-brand-500/50'
                              : 'bg-white hover:bg-slate-50 ring-1 ring-inset ring-slate-200 dark:bg-slate-900/40 dark:hover:bg-slate-900/60 dark:ring-slate-800',
                          ].join(' ')}
                          style={{ borderRadius: '16px', overflow: 'hidden' }}
                          onClick={() => setSelected(isSelected ? null : r)}
                        >
                        <td className="px-4 py-4 rounded-l-2xl">
                          <div className="text-sm font-black text-slate-900 dark:text-slate-100">{r.user_name || 'Unknown'}</div>
                          <div className="mt-0.5 font-mono text-[11px] font-semibold text-slate-400 dark:text-slate-500">{r.user_id}</div>
                        </td>
                        <td className="px-4 py-4 text-sm font-semibold text-slate-700 dark:text-slate-200">{r.role_title}</td>
                        <td className="px-4 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{r.university_id?.toUpperCase() || '—'}</div>
                          {(r.campus_name || r.organization_name) && (
                            <div className="mt-1.5 flex flex-col gap-1">
                              {r.campus_name && <div className="text-[11px] font-medium leading-snug"><span className="opacity-60 font-semibold uppercase tracking-wider text-[9px] mr-1">Campus</span> {r.campus_name}</div>}
                              {r.organization_name && <div className="text-[11px] font-medium leading-snug"><span className="opacity-60 font-semibold uppercase tracking-wider text-[9px] mr-1">Org</span> {r.organization_name}</div>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-xl px-2.5 py-1 text-[11px] uppercase tracking-wider font-bold ${STATUS_BADGE[r.status] || ''}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs font-semibold text-slate-400 dark:text-slate-500 whitespace-nowrap tabular-nums rounded-r-2xl">
                          {formatDate(r.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && !busy ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-16 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 mb-3">
                          <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                          </svg>
                        </div>
                        <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                          No requests found
                        </div>
                        <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                          Try changing your filters or refreshing the data.
                        </div>
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
                  {selected.campus_name && (
                    <div>
                      <div className="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Campus</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{selected.campus_name}</div>
                    </div>
                  )}
                  {selected.organization_name && (
                    <div>
                      <div className="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Organization / Club</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{selected.organization_name}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Justification</div>
                    <div className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                      {selected.justification || 'No justification provided.'}
                    </div>
                  </div>
                  {selected.proof_url && (
                    <div>
                      <div className="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Proof of Authorization</div>
                      <a 
                        href={selected.proof_url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-400 dark:hover:text-brand-300"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        View Attachment
                      </a>
                    </div>
                  )}
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
                    <div className="flex flex-col gap-3 pt-2">
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Reviewed on {formatDate(selected.reviewed_at)}
                      </div>
                      <div className="flex gap-2">
                        {selected.status === 'approved' && (
                          <button
                            onClick={() => handleReview(selected, 'rejected')}
                            className="h-11 flex-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-700 shadow-soft hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-500"
                          >
                            Revoke Approval
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(selected)}
                          className="h-11 flex-1 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-700 shadow-soft hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-500"
                        >
                          Delete Record
                        </button>
                      </div>
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
