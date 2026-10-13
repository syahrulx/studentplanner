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
  listVerificationRequests,
  type AdminServiceRow,
  type AdminServiceStats,
  type AdminServiceReportRow,
  type AdminVerificationRow,
} from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';
import { ServiceCard, ServiceCardSkeleton } from '../components/services/ServiceCard';
import { ServiceDetailPanel } from '../components/services/ServiceDetailPanel';
import { CATEGORIES, capitalize, type ServiceAction } from '../components/services/serviceFormat';

/** "in_progress" is a page-only filter: it loads all statuses and keeps claimed + submitted. */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'claimed', label: 'Claimed' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All kinds' },
  { value: 'request', label: 'Requests' },
  { value: 'offer', label: 'Offers' },
];

const PILL_BASE = 'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-black transition-colors';
const PILL_ON = 'bg-slate-900 text-white dark:bg-white dark:text-slate-950';
const PILL_OFF = 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';

const SECONDARY_BTN =
  'inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';

function StatChip({
  label,
  value,
  tone = 'slate',
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'emerald' | 'amber' | 'sky' | 'rose';
  active?: boolean;
  onClick?: () => void;
}) {
  const valueColor: Record<string, string> = {
    slate: 'text-slate-900 dark:text-slate-100',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    amber: 'text-amber-700 dark:text-amber-300',
    sky: 'text-sky-700 dark:text-sky-300',
    rose: 'text-rose-700 dark:text-rose-300',
  };
  const loudRose = tone === 'rose' && value > 0;
  const box = loudRose
    ? 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40'
    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
  const ring = active ? 'ring-2 ring-slate-900 dark:ring-white' : '';
  const content = (
    <>
      <span className={`text-lg font-black tabular-nums ${valueColor[tone]}`}>{value}</span>
      <span className={`text-xs font-bold ${loudRose ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>
        {loudRose ? '🚩 ' : ''}{label}
      </span>
    </>
  );
  const cls = `inline-flex items-baseline gap-1.5 rounded-2xl border px-3 py-1.5 ${box} ${ring}`;
  if (!onClick) return <div className={cls}>{content}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`${cls} transition-colors hover:border-slate-300 dark:hover:border-slate-700`}>
      {content}
    </button>
  );
}

export function ServicesRoute() {
  const { searchQuery } = useAdminSearch();
  const [activeTab, setActiveTab] = useState<'services' | 'verifications'>('services');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<AdminServiceRow[]>([]);
  const [stats, setStats] = useState<AdminServiceStats | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  /** Narrow list to services that have at least one user report (moderation queue). */
  const [reportFilter, setReportFilter] = useState<'all' | 'reported'>('all');

  // Detail panel
  const [selected, setSelected] = useState<AdminServiceRow | null>(null);
  const [reports, setReports] = useState<AdminServiceReportRow[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const [rows, s] = await Promise.all([
        listAdminServices({
          status: statusFilter === 'in_progress' ? 'all' : statusFilter,
          kind: kindFilter,
          category: catFilter,
          limit: 300,
        }),
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

  // Keep the page behind still while the detail is open.
  useEffect(() => {
    if (!selected) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [selected]);

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
    if (statusFilter === 'in_progress') {
      rows = rows.filter((s) => s.service_status === 'claimed' || s.service_status === 'submitted');
    }
    if (reportFilter === 'reported') {
      rows = rows.filter((s) => (s.report_count ?? 0) > 0);
    }
    if (!searchQuery.trim()) return rows;
    return rows.filter((s) =>
      matchesAdminSearch(searchQuery, s.id, s.title, s.body || '', s.author_name || '', s.claimer_name || ''),
    );
  }, [items, searchQuery, reportFilter, statusFilter]);

  const reportedInList = useMemo(() => items.filter((s) => (s.report_count ?? 0) > 0).length, [items]);

  const handleAction = async (action: ServiceAction, id: string) => {
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

  const toggleStatus = (value: string) => setStatusFilter((cur) => (cur === value ? 'all' : value));
  const hasFilters = statusFilter !== 'all' || kindFilter !== 'all' || catFilter !== 'all' || reportFilter !== 'all';

  return (
    <div>
      {/* Header */}
      <MotionSection>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Services</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Requests and offers students post. Check reported ones and step in when needed.
            </p>
          </div>
          {activeTab === 'services' && (
            <button type="button" onClick={() => void refresh()} disabled={busy} className={SECONDARY_BTN}>
              {busy ? 'Loading…' : 'Refresh'}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-4 inline-flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/70" role="tablist">
          {([
            { id: 'services', label: 'Services' },
            { id: 'verifications', label: '🎓 Student verifications' },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className={`rounded-xl px-4 py-2 text-sm font-black transition-colors ${
                activeTab === t.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </MotionSection>

      {activeTab === 'verifications' ? (
        <VerificationsPanel />
      ) : (
      <>
        {/* Stats strip */}
        {stats && (
          <MotionPanel className="mt-5">
            <div className="flex flex-wrap gap-2">
              <StatChip label="Total" value={stats.total} />
              <StatChip label="Open" value={stats.open} tone="emerald"
                active={statusFilter === 'open'} onClick={() => toggleStatus('open')} />
              <StatChip label="In progress" value={stats.claimed + stats.submitted} tone="amber"
                active={statusFilter === 'in_progress'} onClick={() => toggleStatus('in_progress')} />
              <StatChip label="Completed" value={stats.completed} tone="sky"
                active={statusFilter === 'completed'} onClick={() => toggleStatus('completed')} />
              <StatChip label="Cancelled" value={stats.cancelled}
                active={statusFilter === 'cancelled'} onClick={() => toggleStatus('cancelled')} />
              <StatChip label="Offers made" value={stats.total_offers} />
              <StatChip label="Reviews" value={stats.total_reviews} />
              <StatChip label="Reported" value={stats.reported} tone="rose"
                active={reportFilter === 'reported'}
                onClick={() => setReportFilter((cur) => (cur === 'reported' ? 'all' : 'reported'))} />
            </div>
          </MotionPanel>
        )}

        {/* Filter bar */}
        <MotionPanel className="mt-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                {STATUS_OPTIONS.map((o) => (
                  <button key={o.value} type="button" onClick={() => setStatusFilter(o.value)}
                    aria-pressed={statusFilter === o.value}
                    className={`${PILL_BASE} ${statusFilter === o.value ? PILL_ON : PILL_OFF}`}>
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {KIND_OPTIONS.map((o) => (
                  <button key={o.value} type="button" onClick={() => setKindFilter(o.value)}
                    aria-pressed={kindFilter === o.value}
                    className={`${PILL_BASE} ${kindFilter === o.value ? PILL_ON : PILL_OFF}`}>
                    {o.label}
                  </button>
                ))}
                <select
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                  aria-label="Category"
                  className="h-8 rounded-full border border-slate-200 bg-white pl-3 pr-8 text-xs font-black text-slate-700 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c === 'all' ? 'All categories' : capitalize(c)}</option>
                  ))}
                </select>
                <button type="button"
                  onClick={() => setReportFilter((cur) => (cur === 'reported' ? 'all' : 'reported'))}
                  aria-pressed={reportFilter === 'reported'}
                  className={`${PILL_BASE} ${reportFilter === 'reported' ? PILL_ON : PILL_OFF}`}>
                  🚩 Reported only
                  {reportedInList > 0 && (
                    <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                      {reportedInList}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </MotionPanel>

        {err && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
            {err}
          </div>
        )}

        {/* List */}
        <MotionPanel className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>
              {busy ? 'Loading…' : `${filtered.length} service${filtered.length !== 1 ? 's' : ''}`}
            </span>
            {hasFilters && (
              <button type="button"
                onClick={() => { setStatusFilter('all'); setKindFilter('all'); setCatFilter('all'); setReportFilter('all'); }}
                className="font-black text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                Clear filters
              </button>
            )}
          </div>

          <div className="space-y-3">
            {busy ? (
              <>
                <ServiceCardSkeleton />
                <ServiceCardSkeleton />
                <ServiceCardSkeleton />
              </>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
                <div className="text-3xl">🧰</div>
                <div className="mt-2 text-sm font-black text-slate-900 dark:text-slate-100">No services found</div>
                <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {hasFilters || searchQuery.trim() ? 'Try clearing the filters or search.' : 'Nothing has been posted yet.'}
                </div>
              </div>
            ) : (
              filtered.map((s) => (
                <ServiceCard key={s.id} service={s} onOpen={(row) => void openDetail(row)}
                  onAction={(a, id) => void handleAction(a, id)} />
              ))
            )}
          </div>
        </MotionPanel>

        {/* Detail panel (portal into document.body, see ServiceDetailPanel) */}
        {selected && (
          <ServiceDetailPanel
            service={selected}
            reports={reports}
            loadingReports={loadingReports}
            onClose={() => setSelected(null)}
            onAction={(a, id) => void handleAction(a, id)}
          />
        )}
      </>
      )}
    </div>
  );
}

// ─── Student Verification Panel ─────────────────────────────────────────────

const VERIFICATION_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
};

function VerificationsPanel() {
  const [items, setItems] = useState<AdminVerificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [stats, setStats] = useState<{ total: number } | null>(null);

  const refresh = async () => {
    setLoading(true);
    setErr('');
    try {
      // We only care about OTP verified rows now
      const rows = await listVerificationRequests('approved');
      const otpRows = rows.filter(r => r.admin_note === 'Verified via OTP');
      setItems(otpRows);
      setStats({ total: otpRows.length });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <>
      <MotionPanel className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {stats && (
              <div className="inline-flex items-baseline gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 dark:border-emerald-900/40 dark:bg-emerald-950/30">
                <span className="text-lg font-black tabular-nums text-emerald-700 dark:text-emerald-300">{stats.total}</span>
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Verified by email code</span>
              </div>
            )}
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Recent students who confirmed their student email.</span>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={loading} className={SECONDARY_BTN}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </MotionPanel>

      {err && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </div>
      )}

      <MotionPanel className="mt-4">
        <div className="space-y-3">
          {loading && items.length === 0 && (
            <>
              <ServiceCardSkeleton />
              <ServiceCardSkeleton />
              <ServiceCardSkeleton />
            </>
          )}

          {items.map((v) => (
            <div
              key={v.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {v.user_name || 'Unknown'}
                  </div>
                  <div className="mt-0.5 break-all text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Student email: <span className="text-slate-700 dark:text-slate-200">{v.student_email}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    {v.user_id}
                  </div>
                </div>
                <span className={`shrink-0 rounded-xl px-2.5 py-1 text-xs font-bold ${VERIFICATION_STATUS_COLORS[v.status] || ''}`}>
                  {v.status}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex rounded-xl bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                  ✅ Verified via OTP
                </span>
                <span className="inline-flex rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {v.reviewed_at ? new Date(v.reviewed_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Date unknown'}
                </span>
              </div>
            </div>
          ))}

          {items.length === 0 && !loading && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              No OTP verifications found.
            </div>
          )}
        </div>

        <div className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {items.length} verified user{items.length !== 1 ? 's' : ''}
        </div>
      </MotionPanel>
    </>
  );
}
