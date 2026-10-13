import { useCallback, useEffect, useState } from 'react';
import {
  listSubscriptionPlanFeatures,
  saveAllSubscriptionPlanFeatures,
  type SubscriptionPlan,
} from '../../lib/api';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { IconPencil } from '../../ui/icons';
import { Notice, Panel, SkeletonRows } from '../../ui/page';

type LocalFeature = { id: string; label: string; enabled: boolean };

const TIER_META: { plan: SubscriptionPlan; title: string; shell: string; tick: string }[] = [
  {
    plan: 'free',
    title: 'Free',
    shell: 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40',
    tick: 'text-slate-500 dark:text-slate-300',
  },
  {
    plan: 'plus',
    title: 'Plus',
    shell: 'border-sky-200 bg-sky-50/60 dark:border-sky-900/60 dark:bg-sky-950/30',
    tick: 'text-sky-600 dark:text-sky-400',
  },
  {
    plan: 'pro',
    title: 'Pro',
    shell: 'border-violet-200 bg-violet-50/60 dark:border-violet-900/60 dark:bg-violet-950/30',
    tick: 'text-violet-600 dark:text-violet-400',
  },
];

function emptyTierState(): Record<SubscriptionPlan, LocalFeature[]> {
  return { free: [], plus: [], pro: [] };
}

/** "What each plan unlocks": the lines students see on their profile, per plan. */
export function PlanFeaturesPanel() {
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
    <Panel
      title="What each plan unlocks"
      description={
        editing
          ? 'Tick a line to show it on the student profile. Edit text inline, then save. Empty lines are dropped when you save.'
          : 'The lines students see for Free, Plus and Pro. Crossed-out lines are hidden from the profile.'
      }
      actions={
        editing ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => void cancelEdit()} disabled={saving || loading}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void saveAndClose()} disabled={saving || loading}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={loading} aria-label="Edit plan copy">
            <IconPencil className="h-4 w-4" />
            Edit
          </Button>
        )
      }
    >
      {err ? <Notice tone="danger" className="mb-4">{err}</Notice> : null}

      {loading ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <SkeletonRows rows={1} height="h-40" />
          <SkeletonRows rows={1} height="h-40" />
          <SkeletonRows rows={1} height="h-40" />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {TIER_META.map((col) => (
            <div key={col.plan} className={cn('rounded-2xl border p-4', col.shell)}>
              <div className="text-base font-black text-slate-900 dark:text-white">{col.title}</div>

              {!editing ? (
                <ul className="mt-3 space-y-2">
                  {byTier[col.plan].length === 0 ? (
                    <li className="text-sm font-semibold text-slate-500 dark:text-slate-400">No lines yet. Edit to add copy.</li>
                  ) : (
                    byTier[col.plan].map((row) => (
                      <li key={row.id} className="flex gap-2.5 text-sm leading-snug">
                        <span className={cn('mt-0.5 shrink-0 font-black', row.enabled ? col.tick : 'text-slate-400 dark:text-slate-600')} aria-hidden>
                          {row.enabled ? '✓' : '○'}
                        </span>
                        <span
                          className={cn(
                            'min-w-0 font-semibold',
                            row.enabled
                              ? 'text-slate-800 dark:text-slate-200'
                              : 'text-slate-400 line-through decoration-slate-400 dark:text-slate-500 dark:decoration-slate-600',
                          )}
                        >
                          {row.label || '—'}
                          {!row.enabled ? <span className="sr-only"> (hidden from profile)</span> : null}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              ) : (
                <>
                  <ul className="mt-3 space-y-2">
                    {byTier[col.plan].map((row, idx) => (
                      <li
                        key={row.id}
                        className="flex gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900"
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
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 focus:ring-offset-0 dark:border-slate-600 dark:bg-slate-800"
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
                          aria-label={`${col.title} feature line`}
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-100 dark:placeholder:text-slate-600"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            updateTier(
                              col.plan,
                              byTier[col.plan].filter((_, i) => i !== idx),
                            );
                          }}
                          className="shrink-0 self-center rounded-lg px-2 py-1 text-xs font-black text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/60"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => addLine(col.plan)}
                    className="mt-3 w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-xs font-black text-slate-500 hover:border-brand-500 hover:text-brand-700 dark:border-slate-600 dark:text-slate-400 dark:hover:border-brand-400 dark:hover:text-brand-300"
                  >
                    + Add line
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
