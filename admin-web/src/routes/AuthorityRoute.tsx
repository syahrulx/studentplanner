import { useCallback, useEffect, useMemo, useState } from 'react';
import { listAuthorityRequests, reviewAuthorityRequest, deleteAuthorityRequest, type AdminAuthorityRequestRow } from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { Button } from '../ui/Button';
import { Chip, EmptyState, FactGrid, Notice, PageHeader, Panel, Pill, PillGroup, SidePanel, SkeletonRows } from '../ui/page';
import type { Tone } from '../ui/tones';

const STATUS_TONE: Record<string, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

function StatusChip({ status }: { status: string }) {
  return <Chip tone={STATUS_TONE[status] ?? 'neutral'}>{status.charAt(0).toUpperCase() + status.slice(1)}</Chip>;
}

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

  const closeDetail = useCallback(() => setSelected(null), []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Authority requests"
        description="Review and manage authority role requests. Approved users can post official memos."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={busy}>
            {busy ? 'Loading…' : 'Refresh'}
          </Button>
        }
      />

      {err ? <Notice tone="danger">{err}</Notice> : null}

      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <PillGroup label="Status">
            {STATUS_FILTERS.map((f) => (
              <Pill key={f.value} active={statusFilter === f.value} onClick={() => setStatusFilter(f.value)}>
                {f.label}
              </Pill>
            ))}
          </PillGroup>
          <div className="text-xs font-bold text-slate-500 sm:ml-auto dark:text-slate-400">
            {filtered.length} request{filtered.length !== 1 ? 's' : ''}
            {searchQuery.trim() ? <span className="ml-2 text-brand-600 dark:text-brand-400">Filtered by the top search bar</span> : null}
          </div>
        </div>

        {busy && items.length === 0 ? (
          <div className="p-5"><SkeletonRows rows={4} height="h-16" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No requests found">Try changing your filters or refreshing the data.</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((r) => {
              const isSelected = selected?.id === r.id;
              const place = [r.university_id?.toUpperCase(), r.campus_name, r.organization_name].filter(Boolean).join(' · ');
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(isSelected ? null : r)}
                    aria-pressed={isSelected}
                    className="flex w-full flex-col gap-2 px-5 py-3 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-slate-800/40"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-black text-slate-900 dark:text-slate-100">{r.user_name || 'Unknown'}</span>
                        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">· {r.role_title}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{place || '—'}</div>
                      <div className="mt-0.5 truncate font-mono text-[11px] font-semibold text-slate-400 dark:text-slate-500">{r.user_id}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-slate-400 dark:text-slate-500">{formatDate(r.created_at)}</span>
                      <StatusChip status={r.status} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {selected ? (
        <SidePanel
          title={selected.user_name || 'Unknown'}
          subtitle={selected.role_title}
          chips={<StatusChip status={selected.status} />}
          onClose={closeDetail}
          width="max-w-xl"
          footer={
            selected.status === 'pending' ? (
              <>
                <Button variant="danger" onClick={() => handleReview(selected, 'rejected')}>Reject</Button>
                <button
                  type="button"
                  onClick={() => handleReview(selected, 'approved')}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-elev1 transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 dark:hover:bg-emerald-500"
                >
                  Approve
                </button>
              </>
            ) : selected.reviewed_at ? (
              <>
                <span className="mr-auto self-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Reviewed on {formatDate(selected.reviewed_at)}
                </span>
                {selected.status === 'approved' ? (
                  <button
                    type="button"
                    onClick={() => handleReview(selected, 'rejected')}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
                  >
                    Revoke approval
                  </button>
                ) : null}
                <Button variant="danger" onClick={() => handleDelete(selected)}>Delete record</Button>
              </>
            ) : undefined
          }
        >
          {err ? <Notice tone="danger">{err}</Notice> : null}
          <FactGrid
            items={[
              ['University', selected.university_id?.toUpperCase() || '—'],
              ...(selected.campus_name ? [['Campus', selected.campus_name] as [string, string]] : []),
              ...(selected.organization_name ? [['Organisation / club', selected.organization_name] as [string, string]] : []),
              ['Submitted', formatDate(selected.created_at)],
              ['User ID', selected.user_id],
            ]}
          />
          <div>
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Justification</div>
            <div className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-700 dark:text-slate-200">
              {selected.justification || 'No justification provided.'}
            </div>
          </div>
          {selected.proof_url ? (
            <div>
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Proof of authorisation</div>
              <a
                href={selected.proof_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-400 dark:hover:text-brand-300"
              >
                <svg aria-hidden className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                View attachment
              </a>
            </div>
          ) : null}
        </SidePanel>
      ) : null}
    </div>
  );
}
