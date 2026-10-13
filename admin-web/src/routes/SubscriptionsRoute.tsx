import { useEffect, useMemo, useState } from 'react';
import {
  listUsers,
  setUserSubscriptionPlan,
  SUBSCRIPTION_PLANS,
  type AdminUserRow,
  type SubscriptionPlan,
} from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { Button } from '../ui/Button';
import { Label, TextInput } from '../ui/Input';
import { Chip, EmptyState, Notice, PageHeader, Panel, Pill, PillGroup, SkeletonRows } from '../ui/page';
import { accountStatusTone, capitalize } from '../components/people/format';
import { PlanFeaturesPanel } from '../components/people/PlanFeaturesPanel';

export function SubscriptionsRoute() {
  const { searchQuery } = useAdminSearch();
  const [query, setQuery] = useState('');
  const [universityId, setUniversityId] = useState('');
  const [planFilter, setPlanFilter] = useState<'all' | SubscriptionPlan>('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [count, setCount] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const res = await listUsers({
        query: query.trim() || undefined,
        universityId: universityId.trim() || undefined,
        plan: planFilter === 'all' ? undefined : planFilter,
        limit: 80,
        offset: 0,
      });
      setItems(res.items);
      setCount(res.count);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planFilter]);

  const rows = useMemo(() => {
    if (!searchQuery.trim()) return items;
    return items.filter((u) =>
      matchesAdminSearch(
        searchQuery,
        u.id,
        u.name,
        u.student_id,
        u.university_id,
        u.status,
        u.subscription_plan,
        u.created_at,
      ),
    );
  }, [items, searchQuery]);

  const onPlanChange = async (userId: string, next: SubscriptionPlan) => {
    setSavingId(userId);
    setErr('');
    try {
      await setUserSubscriptionPlan(userId, next);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update plan');
    } finally {
      setSavingId(null);
    }
  };

  const searching = searchQuery.trim().length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        description="See each student's plan and change it. Everyone is on Free until you upgrade them."
      />

      <PlanFeaturesPanel />

      <Panel
        padded={false}
        title="Plan per student"
        description={`Showing ${rows.length.toLocaleString()} of ${count.toLocaleString()}${searching ? ', also filtered by the top search bar' : ''}. A new plan is saved as soon as you pick it.`}
      >
        <div className="space-y-4 border-b border-slate-100 p-5 dark:border-slate-800">
          <PillGroup label="Plan">
            <Pill active={planFilter === 'all'} onClick={() => setPlanFilter('all')}>
              All plans
            </Pill>
            {SUBSCRIPTION_PLANS.map((p) => (
              <Pill key={p} active={planFilter === p} onClick={() => setPlanFilter(p)}>
                {capitalize(p)}
              </Pill>
            ))}
          </PillGroup>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Label htmlFor="subs-search" className="mb-1">Search</Label>
              <TextInput id="subs-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or student ID" />
            </div>
            <div className="sm:w-56">
              <Label htmlFor="subs-university" className="mb-1">University</Label>
              <TextInput id="subs-university" value={universityId} onChange={(e) => setUniversityId(e.target.value)} placeholder="e.g. uitm" />
            </div>
            <Button onClick={refresh} disabled={busy} className="shrink-0">
              {busy ? 'Loading…' : 'Search'}
            </Button>
          </div>
          {err ? <Notice tone="danger">{err}</Notice> : null}
        </div>

        {busy && items.length === 0 ? (
          <div className="p-5">
            <SkeletonRows rows={5} height="h-12" />
          </div>
        ) : rows.length === 0 ? (
          busy ? null : (
            <div className="p-5">
              <EmptyState title={searching && items.length > 0 ? 'No loaded users match the top search' : 'No users found for this filter'}>
                {searching && items.length > 0 ? 'Clear it or run Search again.' : undefined}
              </EmptyState>
            </div>
          )
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((u) => (
              <li key={u.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{u.name || '-'}</div>
                  <div className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {u.student_id || '-'} · {u.university_id || '-'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Chip tone={accountStatusTone(u.status)}>{capitalize(u.status)}</Chip>
                  <select
                    value={u.subscription_plan}
                    disabled={savingId === u.id}
                    onChange={(e) => void onPlanChange(u.id, e.target.value as SubscriptionPlan)}
                    aria-label={`Plan for ${u.name || u.student_id || u.id}`}
                    className="h-9 w-32 rounded-xl border border-slate-200 bg-white px-2 text-xs font-black uppercase tracking-wide text-slate-900 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {SUBSCRIPTION_PLANS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
