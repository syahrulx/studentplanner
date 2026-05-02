import { useEffect, useMemo, useState } from 'react';
import {
  listAdminServices,
  fetchAdminServiceStats,
  listAdminServiceReports,
  adminForceCancelService,
  adminForceCompleteService,
  adminForceReopenService,
  adminClearReports,
  deleteCommunityPost,
  type AdminServiceRow,
  type AdminServiceStats,
  type AdminServiceReportRow,
} from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  claimed: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  completed: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

const KIND_COLORS: Record<string, string> = {
  request: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  offer: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
};

const CATEGORIES = ['all','tutoring','printing','transport','food','errands','tech','design','other'];

function fmt(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtPrice(s: AdminServiceRow) {
  if (s.price_type === 'free') return 'Free';
  const amt = s.accepted_amount ?? s.price_amount;
  if (amt == null) return 'Negotiable';
  return `${s.currency || 'MYR'} ${Number(amt).toLocaleString()}`;
}

export function ServicesRoute() {
  const { searchQuery } = useAdminSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<AdminServiceRow[]>([]);
  const [stats, setStats] = useState<AdminServiceStats | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  /** Narrow list to services that have at least one user report (moderation queue). */
  const [reportFilter, setReportFilter] = useState<'all' | 'reported'>('all');

  // Detail modal
  const [selected, setSelected] = useState<AdminServiceRow | null>(null);
  const [reports, setReports] = useState<AdminServiceReportRow[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const [rows, s] = await Promise.all([
        listAdminServices({ status: statusFilter, kind: kindFilter, category: catFilter, limit: 300 }),
        fetchAdminServiceStats(),
      ]);
      setItems(rows);
      setStats(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void refresh(); }, [statusFilter, kindFilter, catFilter]);

  const openDetail = async (s: AdminServiceRow) => {
    setSelected(s);
    setLoadingReports(true);
    try {
      const r = await listAdminServiceReports(s.id);
      setReports(r);
    } catch { setReports([]); }
    finally { setLoadingReports(false); }
  };

  const filtered = useMemo(() => {
    let rows = items;
    if (reportFilter === 'reported') {
      rows = rows.filter((s) => (s.report_count ?? 0) > 0);
    }
    if (!searchQuery.trim()) return rows;
    return rows.filter((s) =>
      matchesAdminSearch(searchQuery, s.id, s.title, s.body || '', s.author_name || '', s.claimer_name || ''),
    );
  }, [items, searchQuery, reportFilter]);

  const handleAction = async (action: string, id: string) => {
    const labels: Record<string, string> = {
      cancel: 'Force cancel this service?',
      complete: 'Force complete this service?',
      reopen: 'Force reopen this service? This will clear the claimer.',
      delete: 'Permanently delete this service? This cannot be undone.',
      clearReports: 'Clear all reports for this service?',
    };
    if (!confirm(labels[action] || 'Are you sure?')) return;
    try {
      if (action === 'cancel') await adminForceCancelService(id);
      else if (action === 'complete') await adminForceCompleteService(id);
      else if (action === 'reopen') await adminForceReopenService(id);
      else if (action === 'delete') await deleteCommunityPost(id);
      else if (action === 'clearReports') await adminClearReports(id);
      setSelected(null);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  };

  // Stat card component
  const Stat = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <div className="text-2xl font-black tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs font-bold uppercase tracking-wide opacity-70">{label}</div>
    </div>
  );

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Service Marketplace</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Monitor, moderate, and manage all services across campuses. Filter by <strong className="text-slate-700 dark:text-slate-200">Reports: Reported only</strong> to review user-flagged listings — open a row for report reasons, then <strong className="text-slate-700 dark:text-slate-200">Delete service</strong> or clear reports.
        </div>
      </MotionSection>

      {/* Stats grid */}
      {stats && (
        <MotionPanel className="mt-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
            <Stat label="Total" value={stats.total} color="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 text-slate-900 dark:text-slate-100" />
            <Stat label="Open" value={stats.open} color="border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200" />
            <Stat label="In Progress" value={stats.claimed + stats.submitted} color="border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200" />
            <Stat label="Completed" value={stats.completed} color="border-sky-200 bg-sky-50 dark:border-sky-900/40 dark:bg-sky-950/30 text-sky-800 dark:text-sky-200" />
            <Stat label="Reports" value={stats.reported} color="border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200" />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
              <span className="text-sm font-black text-slate-900 dark:text-slate-100">{stats.total_offers}</span>
              <span className="ml-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">offers made</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
              <span className="text-sm font-black text-slate-900 dark:text-slate-100">{stats.total_reviews}</span>
              <span className="ml-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">reviews</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
              <span className="text-sm font-black text-slate-900 dark:text-slate-100">{stats.cancelled}</span>
              <span className="ml-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">cancelled</span>
            </div>
          </div>
        </MotionPanel>
      )}

      {/* Filters + table */}
      <MotionPanel className="mt-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap gap-3">
              <label className="block">
                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Status</div>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                  <option value="all">All status</option>
                  <option value="open">Open</option>
                  <option value="claimed">Claimed</option>
                  <option value="submitted">Submitted</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Kind</div>
                <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                  <option value="all">All kinds</option>
                  <option value="request">Request</option>
                  <option value="offer">Offer</option>
                </select>
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Category</div>
                <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c === 'all' ? 'All categories' : c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Reports</div>
                <select value={reportFilter} onChange={(e) => setReportFilter(e.target.value as 'all' | 'reported')}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                  <option value="all">All services</option>
                  <option value="reported">Reported only (has flags)</option>
                </select>
              </label>
            </div>
            <button onClick={() => void refresh()} disabled={busy}
              className="h-11 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70">
              {busy ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {err && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">{err}</div>}

          {/* Table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1100px] border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2">Service</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Author</th>
                  <th className="px-3 py-2">Taker</th>
                  <th className="px-3 py-2">Reports</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="cursor-pointer border border-slate-200 bg-slate-50/60 hover:bg-slate-100/80 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900/60"
                    onClick={() => openDetail(s)}>
                    <td className="px-3 py-3">
                      <div className="max-w-[240px] truncate text-sm font-black text-slate-900 dark:text-slate-100">{s.title}</div>
                      <div className="mt-0.5 max-w-[240px] truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{s.service_category || '—'}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-xl px-2.5 py-1 text-xs font-bold ${KIND_COLORS[s.service_kind] || ''}`}>{s.service_kind}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-xl px-2.5 py-1 text-xs font-bold ${STATUS_COLORS[s.service_status] || ''}`}>{s.service_status}</span>
                      {s.cancel_requested_by && <span className="ml-1 text-xs text-rose-500" title="Cancel requested">⚠️</span>}
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{fmtPrice(s)}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{s.author_name || '—'}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{s.claimer_name || '—'}</td>
                    <td className="px-3 py-3">
                      {(s.report_count ?? 0) > 0 ? (
                        <span className="inline-flex rounded-xl bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                          🚩 {s.report_count}
                        </span>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">{fmt(s.created_at)}</td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1.5">
                        {s.service_status !== 'cancelled' && s.service_status !== 'completed' && (
                          <button onClick={() => handleAction('cancel', s.id)}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-black text-rose-800 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200">
                            Cancel
                          </button>
                        )}
                        <button onClick={() => handleAction('delete', s.id)}
                          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !busy && (
                  <tr><td colSpan={9} className="px-3 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">No services found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {filtered.length} service{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      </MotionPanel>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} aria-label="Close" />
          <div className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <button onClick={() => setSelected(null)} className="absolute right-4 top-4 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg font-black">✕</button>

            <div className="text-xl font-black text-slate-900 dark:text-slate-100 pr-8">{selected.title}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              <span className={`rounded-xl px-2.5 py-1 text-xs font-bold ${KIND_COLORS[selected.service_kind]}`}>{selected.service_kind}</span>
              <span className={`rounded-xl px-2.5 py-1 text-xs font-bold ${STATUS_COLORS[selected.service_status]}`}>{selected.service_status}</span>
              {selected.service_category && <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{selected.service_category}</span>}
            </div>

            {selected.body && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{selected.body}</p>}

            {/* Info grid */}
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Price</div>
                <div className="mt-1 font-black text-slate-900 dark:text-slate-100">{fmtPrice(selected)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Deadline</div>
                <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{selected.deadline_at ? fmt(selected.deadline_at) : '—'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Author</div>
                <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{selected.author_name}</div>
                <div className="text-xs text-slate-400 font-mono truncate">{selected.author_id}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Taker</div>
                <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{selected.claimer_name || '—'}</div>
                {selected.claimed_by && <div className="text-xs text-slate-400 font-mono truncate">{selected.claimed_by}</div>}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Revisions</div>
                <div className="mt-1 font-black text-slate-900 dark:text-slate-100">{selected.revision_count} / {selected.max_revisions}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Offers</div>
                <div className="mt-1 font-black text-slate-900 dark:text-slate-100">{selected.offer_count ?? 0}</div>
              </div>
            </div>

            {/* Location (university, campus, specific place) */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Location</div>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-slate-500 dark:text-slate-400">University</dt>
                  <dd className="min-w-0 flex-1 font-semibold text-slate-900 dark:text-slate-100">
                    {selected.university_name || selected.university_id || '—'}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-slate-500 dark:text-slate-400">Campus</dt>
                  <dd className="min-w-0 flex-1 font-semibold text-slate-900 dark:text-slate-100">{selected.campus || '—'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-slate-500 dark:text-slate-400">Specific place</dt>
                  <dd className="min-w-0 flex-1 font-semibold text-slate-900 dark:text-slate-100">{selected.location || '—'}</dd>
                </div>
              </dl>
            </div>

            {/* Delivery */}
            {selected.delivery_note && (
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-950/30">
                <div className="text-xs font-black uppercase tracking-wide text-blue-600 dark:text-blue-300">Delivery Note</div>
                <div className="mt-1 text-sm text-blue-900 dark:text-blue-100">{selected.delivery_note}</div>
              </div>
            )}

            {/* Reports */}
            <div className="mt-4">
              <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                User reports ({reports.length})
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Each row is a student submission. Use <span className="font-semibold text-slate-700 dark:text-slate-300">Delete service</span> below to permanently remove this listing from the marketplace when moderation confirms a violation.
              </p>
              {loadingReports ? (
                <div className="mt-2 text-sm text-slate-400">Loading…</div>
              ) : reports.length === 0 ? (
                <div className="mt-2 text-sm text-slate-400">No reports.</div>
              ) : (
                <div className="mt-2 space-y-2">
                  {reports.map((r) => (
                    <div key={r.id} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/30">
                      <div className="text-sm font-semibold text-rose-900 dark:text-rose-100">{r.reason}</div>
                      <div className="mt-0.5 text-xs text-rose-600 dark:text-rose-300">by {r.reporter_name} · {fmt(r.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Admin actions */}
            <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
              {selected.service_status !== 'completed' && selected.service_status !== 'cancelled' && (
                <>
                  <button onClick={() => handleAction('complete', selected.id)}
                    className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-black text-sky-800 hover:bg-sky-100 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200">
                    ✅ Force Complete
                  </button>
                  <button onClick={() => handleAction('reopen', selected.id)}
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-800 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                    🔓 Force Reopen
                  </button>
                  <button onClick={() => handleAction('cancel', selected.id)}
                    className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-black text-rose-800 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200">
                    ❌ Force Cancel
                  </button>
                </>
              )}
              {reports.length > 0 && (
                <button onClick={() => handleAction('clearReports', selected.id)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                  🧹 Clear Reports
                </button>
              )}
              <button onClick={() => handleAction('delete', selected.id)}
                className="rounded-2xl border border-rose-300 bg-rose-100 px-4 py-2 text-sm font-black text-rose-900 hover:bg-rose-200 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                🗑️ Delete Service
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-400 font-mono break-all">ID: {selected.id}</div>
          </div>
        </div>
      )}
    </div>
  );
}
