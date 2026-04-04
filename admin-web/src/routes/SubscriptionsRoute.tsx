import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listUsers,
  setUserSubscriptionPlan,
  SUBSCRIPTION_PLANS,
  listSubscriptionPlanFeatures,
  saveAllSubscriptionPlanFeatures,
  type AdminUserRow,
  type SubscriptionPlan,
} from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';
import { IconPencil } from '../ui/icons';

type LocalFeature = { id: string; label: string; enabled: boolean };

const TIER_META: { plan: SubscriptionPlan; title: string; viewShell: string }[] = [
  { plan: 'free', title: 'Free', viewShell: 'border-slate-700/90 bg-slate-900/55' },
  { plan: 'plus', title: 'Plus', viewShell: 'border-sky-800/60 bg-sky-950/25' },
  { plan: 'pro', title: 'Pro', viewShell: 'border-violet-800/60 bg-violet-950/25' },
];

function emptyTierState(): Record<SubscriptionPlan, LocalFeature[]> {
  return { free: [], plus: [], pro: [] };
}

function PlanFeaturesSection() {
  const [byTier, setByTier] = useState<Record<SubscriptionPlan, LocalFeature[]>>(emptyTierState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const rows = await listSubscriptionPlanFeatures();
      const next = emptyTierState();
      for (const r of rows) {
        if (r.tier !== 'free' && r.tier !== 'plus' && r.tier !== 'pro') continue;
        next[r.tier].push({ id: r.id, label: r.label, enabled: r.enabled });
      }
      setByTier(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load plan features');
      setByTier(emptyTierState());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateTier = (plan: SubscriptionPlan, items: LocalFeature[]) => {
    setByTier((prev) => ({ ...prev, [plan]: items }));
  };

  const addLine = (plan: SubscriptionPlan) => {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${plan}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    updateTier(plan, [...byTier[plan], { id, label: '', enabled: true }]);
  };

  const saveAndClose = async () => {
    setSaving(true);
    setErr('');
    try {
      await saveAllSubscriptionPlanFeatures(byTier);
      await load();
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = async () => {
    setEditing(false);
    await load();
  };

  return (
    <MotionSection delay={0.03} className="mt-6">
      <MotionPanel>
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-[#0b0e14] shadow-xl ring-1 ring-white/5">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">What each plan unlocks</h2>
                <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-400">
                  {editing
                    ? 'Tick a line to show it on the student profile. Edit text inline, then save. Empty lines are dropped when you save.'
                    : 'Summary of Free, Plus, and Pro. Tap the pencil to edit copy and visibility. Use this when assigning plans in the table below.'}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {editing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void saveAndClose()}
                      disabled={saving || loading}
                      className="h-11 rounded-2xl bg-sky-500 px-5 text-sm font-black text-white shadow-lg shadow-sky-900/30 hover:bg-sky-400 disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void cancelEdit()}
                      disabled={saving || loading}
                      className="h-11 rounded-2xl border border-slate-600 bg-transparent px-5 text-sm font-black text-slate-200 hover:bg-white/5 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    disabled={loading}
                    className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-600 bg-slate-800/80 px-4 text-sm font-black text-slate-100 hover:border-slate-500 hover:bg-slate-800 disabled:opacity-50"
                    aria-label="Edit plan copy"
                  >
                    <IconPencil className="h-5 w-5 text-sky-400" />
                    Edit
                  </button>
                )}
              </div>
            </div>

            {err ? (
              <div className="mt-5 rounded-2xl border border-rose-500/40 bg-rose-950/50 px-4 py-3 text-sm font-semibold text-rose-200">
                {err}
              </div>
            ) : null}

            {loading ? (
              <div className="mt-10 py-12 text-center text-sm font-semibold text-slate-500">Loading…</div>
            ) : (
              <div className="mt-8 grid gap-4 lg:grid-cols-3">
                {TIER_META.map((col) => (
                  <div
                    key={col.plan}
                    className={`rounded-2xl border p-4 sm:p-5 ${col.viewShell}`}
                  >
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Plan</div>
                    <div className="mt-1 text-xl font-black text-white">{col.title}</div>

                    {!editing ? (
                      <ul className="mt-5 space-y-3">
                        {byTier[col.plan].length === 0 ? (
                          <li className="text-sm font-semibold text-slate-500">No lines yet. Edit to add copy.</li>
                        ) : (
                          byTier[col.plan].map((row) => (
                            <li key={row.id} className="flex gap-3 text-sm leading-snug">
                              <span
                                className={`mt-0.5 shrink-0 font-black ${row.enabled ? 'text-sky-400' : 'text-slate-600'}`}
                                aria-hidden
                              >
                                {row.enabled ? '✓' : '○'}
                              </span>
                              <span
                                className={`min-w-0 font-semibold ${row.enabled ? 'text-slate-200' : 'text-slate-500 line-through decoration-slate-600'}`}
                              >
                                {row.label || '—'}
                              </span>
                            </li>
                          ))
                        )}
                      </ul>
                    ) : (
                      <>
                        <ul className="mt-4 space-y-2">
                          {byTier[col.plan].map((row, idx) => (
                            <li
                              key={row.id}
                              className="flex gap-2 rounded-xl border border-slate-700/80 bg-[#0f1419] p-2"
                            >
                              <label className="mt-2 flex shrink-0 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={row.enabled}
                                  onChange={(e) => {
                                    const next = [...byTier[col.plan]];
                                    next[idx] = { ...row, enabled: e.target.checked };
                                    updateTier(col.plan, next);
                                  }}
                                  className="h-4 w-4 rounded border-slate-500 bg-slate-800 text-sky-500 focus:ring-sky-500 focus:ring-offset-0"
                                />
                                <span className="sr-only">Show on profile for {col.title}</span>
                              </label>
                              <input
                                value={row.label}
                                onChange={(e) => {
                                  const next = [...byTier[col.plan]];
                                  next[idx] = { ...row, label: e.target.value };
                                  updateTier(col.plan, next);
                                }}
                                placeholder="Feature description"
                                className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-2 text-sm font-semibold text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  updateTier(
                                    col.plan,
                                    byTier[col.plan].filter((_, i) => i !== idx),
                                  );
                                }}
                                className="shrink-0 self-center rounded-lg px-2 py-1 text-xs font-black text-rose-400 hover:bg-rose-950/60"
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() => addLine(col.plan)}
                          className="mt-3 w-full rounded-xl border border-dashed border-slate-600 py-2.5 text-xs font-black text-slate-400 hover:border-sky-500/60 hover:text-sky-300"
                        >
                          + Add line
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </MotionPanel>
    </MotionSection>
  );
}

function Chip({ children, tone }: { children: string; tone: 'green' | 'amber' | 'rose' | 'slate' }) {
  const cls =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100'
        : tone === 'rose'
          ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100'
          : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200';
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-black ${cls}`}>{children}</span>;
}

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

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Subscriptions</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          View each user&apos;s plan and change it. Everyone defaults to free until you upgrade them.
          {searchQuery.trim() ? (
            <span className="mt-1 block text-xs font-bold text-brand-600 dark:text-brand-400">
              Also filtering loaded rows by the top search bar.
            </span>
          ) : null}
        </div>
      </MotionSection>

      <PlanFeaturesSection />

      <MotionSection delay={0.05} className="mt-6">
        <MotionPanel>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:flex-wrap">
                <label className="block min-w-[200px] flex-1">
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Search</div>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Name or Student ID"
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
                <label className="block lg:w-56">
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">University</div>
                  <input
                    value={universityId}
                    onChange={(e) => setUniversityId(e.target.value)}
                    placeholder="e.g. uitm"
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
                <label className="block lg:w-44">
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Plan filter</div>
                  <select
                    value={planFilter}
                    onChange={(e) => setPlanFilter(e.target.value as 'all' | SubscriptionPlan)}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="all">All plans</option>
                    {SUBSCRIPTION_PLANS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                onClick={refresh}
                disabled={busy}
                className="h-11 shrink-0 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70"
              >
                {busy ? 'Loading…' : 'Search'}
              </button>
            </div>

            {err ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
                {err}
              </div>
            ) : null}

            <div className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Showing {rows.length} of {count} (server filter: {planFilter === 'all' ? 'all plans' : planFilter})
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[960px] border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Student ID</th>
                    <th className="px-3 py-2">University</th>
                    <th className="px-3 py-2">Plan</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => {
                    const st = u.status === 'active' ? 'green' : u.status === 'disabled' ? 'amber' : 'rose';
                    return (
                      <tr
                        key={u.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40"
                      >
                        <td className="px-3 py-3 text-sm font-black text-slate-900 dark:text-slate-100">{u.name || '-'}</td>
                        <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{u.student_id || '-'}</td>
                        <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{u.university_id || '-'}</td>
                        <td className="px-3 py-3">
                          <select
                            value={u.subscription_plan}
                            disabled={savingId === u.id}
                            onChange={(e) => void onPlanChange(u.id, e.target.value as SubscriptionPlan)}
                            className="h-9 min-w-[140px] rounded-xl border border-slate-200 bg-white px-2 text-xs font-black uppercase tracking-wide text-slate-900 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                          >
                            {SUBSCRIPTION_PLANS.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <Chip tone={st}>{u.status}</Chip>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && !busy ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                        {searchQuery.trim() && items.length > 0
                          ? 'No loaded users match the top search. Clear it or run Search again.'
                          : 'No users found for this filter.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </MotionPanel>
      </MotionSection>
    </div>
  );
}
