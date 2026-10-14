import { useEffect, useMemo, useState } from 'react';
import { listSocialShareClaims, reviewSocialShareClaim, type SocialShareClaimRow } from '../lib/api';
import { useAdminSearch } from '../state/AdminSearchContext';
import { Button } from '../ui/Button';
import { Chip, EmptyState, Notice, PageHeader, Panel, Pill, PillGroup, SkeletonRows } from '../ui/page';
import { ClaimReviewPanel } from '../components/people/ClaimReviewPanel';
import { formatDateTime } from '../components/people/format';
import {
  PLATFORM_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  isYoungerThan48h,
  type ClaimStatus,
} from '../components/people/shareRewards';

const STATUS_PILLS: ClaimStatus[] = ['pending', 'approved', 'rejected'];

export function ShareRewardsRoute() {
  const { searchQuery: globalSearch } = useAdminSearch();

  const [items, setItems] = useState<SocialShareClaimRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | 'all'>('pending');
  const [selected, setSelected] = useState<SocialShareClaimRow | null>(null);

  async function refresh() {
    setBusy(true);
    setErr(null);
    try {
      const res = await listSocialShareClaims(statusFilter === 'all' ? undefined : statusFilter);
      setItems(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filteredItems = useMemo(() => {
    const q = (globalSearch || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) =>
      [r.user_email, r.post_url, r.platform, r.user_id]
        .filter((x): x is string => !!x)
        .some((h) => h.toLowerCase().includes(q)),
    );
  }, [items, globalSearch]);

  // Counts of the claims loaded right now. A status count is only shown when it
  // is true for the loaded list (e.g. while "Approved" is picked we cannot know
  // how many are pending).
  const counts = useMemo(
    () => ({
      pending: items.filter((r) => r.status === 'pending').length,
      approved: items.filter((r) => r.status === 'approved').length,
      rejected: items.filter((r) => r.status === 'rejected').length,
      total: items.length,
    }),
    [items],
  );

  async function review(input: {
    id: string;
    approve: boolean;
    approvedLikes?: number | null;
    awardedDays?: number | null;
    note?: string;
  }): Promise<void> {
    await reviewSocialShareClaim(input);
    setSelected(null);
    await refresh();
  }

  const searching = (globalSearch || '').trim().length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Share rewards"
        description="Students post about Rencana to earn free Plus days. Open the live post, check the like count yourself, then award days. Access and profile update by themselves when you approve."
        actions={
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void refresh()}>
            {busy ? 'Loading…' : 'Refresh'}
          </Button>
        }
      />

      <Panel padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <PillGroup label="Status">
            {STATUS_PILLS.map((s) => (
              <Pill
                key={s}
                active={statusFilter === s}
                count={statusFilter === 'all' || statusFilter === s ? counts[s] : null}
                alert={s === 'pending'}
                onClick={() => setStatusFilter(s)}
              >
                {STATUS_LABEL[s]}
              </Pill>
            ))}
            <Pill active={statusFilter === 'all'} count={statusFilter === 'all' ? counts.total : null} onClick={() => setStatusFilter('all')}>
              All
            </Pill>
          </PillGroup>
          {searching ? (
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {filteredItems.length} of {items.length} match the top search
            </div>
          ) : null}
        </div>

        {err ? (
          <div className="px-5 pt-4">
            <Notice tone="danger">{err}</Notice>
          </div>
        ) : null}

        {busy && items.length === 0 ? (
          <div className="p-5">
            <SkeletonRows rows={4} height="h-16" />
          </div>
        ) : filteredItems.length === 0 ? (
          busy ? null : (
            <div className="p-5">
              <EmptyState title="No claims here." />
            </div>
          )
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredItems.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  className="grid w-full grid-cols-1 gap-3 px-5 py-3 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center dark:hover:bg-slate-800/40 dark:focus-visible:bg-slate-800/40"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-black text-slate-900 dark:text-slate-100">
                        {row.user_email ?? row.user_id.slice(0, 8)}
                      </span>
                      {row.status === 'pending' && row.has_non_promo_access ? <Chip tone="warning">Already paid</Chip> : null}
                      {row.status === 'pending' && isYoungerThan48h(row.created_at) ? <Chip tone="danger">Under 48h old</Chip> : null}
                    </div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {PLATFORM_LABEL[row.platform] ?? row.platform} · submitted {formatDateTime(row.created_at)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <div className="text-right">
                      <div className="text-sm font-black tabular-nums text-slate-900 dark:text-white">{row.claimed_likes.toLocaleString()}</div>
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">claimed likes</div>
                    </div>
                    <Chip tone={STATUS_TONE[row.status]}>
                      {row.status === 'approved' && row.awarded_days ? `${STATUS_LABEL[row.status]} · +${row.awarded_days}d` : STATUS_LABEL[row.status]}
                    </Chip>
                    <span className="inline-flex h-8 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      {row.status === 'pending' ? 'Review' : 'View'}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {selected ? <ClaimReviewPanel row={selected} onClose={() => setSelected(null)} onReview={review} /> : null}
    </div>
  );
}
