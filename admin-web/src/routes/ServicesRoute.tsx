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
import { Button } from '../ui/Button';
import { Select } from '../ui/Input';
import { Chip, EmptyState, Notice, PageHeader, Panel, Pill, PillGroup, SkeletonRows, StatItem, StatStrip } from '../ui/page';
import type { Tone } from '../ui/tones';
import { ServiceCard } from '../components/services/ServiceCard';
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
    <div className="space-y-5">
      <PageHeader
        title="Services"
        description="Requests and offers students post. Check reported ones and step in when needed."
        actions={
          activeTab === 'services' ? (
            <Button variant="secondary" onClick={() => void refresh()} disabled={busy}>
              {busy ? 'Loading…' : 'Refresh'}
            </Button>
          ) : undefined
        }
      />

      <div role="group" aria-label="Services sections">
        <PillGroup>
          <Pill active={activeTab === 'services'} onClick={() => setActiveTab('services')}>
            Services
          </Pill>
          <Pill active={activeTab === 'verifications'} onClick={() => setActiveTab('verifications')}>
            Student verifications
          </Pill>
        </PillGroup>
      </div>

      {activeTab === 'verifications' ? (
        <VerificationsPanel />
      ) : (
      <>
        {stats && (
          <StatStrip>
            <StatItem label="Total" value={stats.total} />
            <StatItem label="Open" value={stats.open} tone="success"
              active={statusFilter === 'open'} onClick={() => toggleStatus('open')} />
            <StatItem label="In progress" value={stats.claimed + stats.submitted} tone="warning"
              active={statusFilter === 'in_progress'} onClick={() => toggleStatus('in_progress')} />
            <StatItem label="Completed" value={stats.completed} tone="info"
              active={statusFilter === 'completed'} onClick={() => toggleStatus('completed')} />
            <StatItem label="Cancelled" value={stats.cancelled}
              active={statusFilter === 'cancelled'} onClick={() => toggleStatus('cancelled')} />
            <StatItem label="Offers made" value={stats.total_offers} />
            <StatItem label="Reviews" value={stats.total_reviews} />
            <StatItem label="Reported" value={stats.reported} tone={stats.reported > 0 ? 'danger' : 'neutral'}
              active={reportFilter === 'reported'}
              onClick={() => setReportFilter((cur) => (cur === 'reported' ? 'all' : 'reported'))} />
          </StatStrip>
        )}

        {/* Filters */}
        <Panel>
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
            <PillGroup label="Status">
              {STATUS_OPTIONS.map((o) => (
                <Pill key={o.value} active={statusFilter === o.value} onClick={() => setStatusFilter(o.value)}>
                  {o.label}
                </Pill>
              ))}
            </PillGroup>
            <div className="flex flex-wrap items-center gap-3">
              <PillGroup label="Kind">
                {KIND_OPTIONS.map((o) => (
                  <Pill key={o.value} active={kindFilter === o.value} onClick={() => setKindFilter(o.value)}>
                    {o.label}
                  </Pill>
                ))}
              </PillGroup>
              <Select
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                aria-label="Category"
                className="!h-8 !w-auto !rounded-xl !px-3 !text-xs"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c === 'all' ? 'All categories' : capitalize(c)}</option>
                ))}
              </Select>
              <Pill
                active={reportFilter === 'reported'}
                count={reportedInList > 0 ? reportedInList : null}
                alert
                onClick={() => setReportFilter((cur) => (cur === 'reported' ? 'all' : 'reported'))}
              >
                Reported only
              </Pill>
            </div>
          </div>
        </Panel>

        {err && <Notice tone="danger">{err}</Notice>}

        {/* List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
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

          {busy ? (
            <SkeletonRows rows={3} height="h-28" />
          ) : filtered.length === 0 ? (
            <EmptyState title="No services found">
              {hasFilters || searchQuery.trim() ? 'Try clearing the filters or search.' : 'Nothing has been posted yet.'}
            </EmptyState>
          ) : (
            filtered.map((s) => (
              <ServiceCard key={s.id} service={s} onOpen={(row) => void openDetail(row)}
                onAction={(a, id) => void handleAction(a, id)} />
            ))
          )}
        </div>

        {/* Detail panel (kit SidePanel, drawn into document.body) */}
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

const VERIFICATION_STATUS_TONE: Record<string, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
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
    <Panel
      title="Students verified by email code"
      description="Recent students who confirmed their student email."
      actions={
        <>
          {stats && <Chip tone="success">{stats.total} verified</Chip>}
          <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {err && <Notice tone="danger">{err}</Notice>}

        {loading && items.length === 0 && <SkeletonRows rows={3} height="h-16" />}

        {items.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {items.map((v) => (
              <li key={v.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-900 dark:text-slate-100">{v.user_name || 'Unknown'}</div>
                  <div className="mt-0.5 break-all text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Student email: <span className="text-slate-700 dark:text-slate-200">{v.student_email}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">{v.user_id}</div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={VERIFICATION_STATUS_TONE[v.status] ?? 'neutral'}>{v.status}</Chip>
                  <Chip tone="success">Verified via OTP</Chip>
                  <Chip title="Verified on">
                    <span className="tabular-nums">
                      {v.reviewed_at ? new Date(v.reviewed_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Date unknown'}
                    </span>
                  </Chip>
                </div>
              </li>
            ))}
          </ul>
        )}

        {items.length === 0 && !loading && <EmptyState title="No OTP verifications found." />}
      </div>
    </Panel>
  );
}
