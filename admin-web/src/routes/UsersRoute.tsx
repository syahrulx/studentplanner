import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  deleteUser,
  listAiUsageForUsers,
  listUsers,
  MONTHLY_TOKEN_LIMITS,
  resetUserMonthlyTokens,
  resolveMonthlyLimit,
  setUserStatus,
  setUserTokenLimit,
  type AdminUserRow,
  type SubscriptionPlan,
} from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';

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

function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function formatJoinDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function UsageBar({
  used,
  plan,
  override,
}: {
  used: number;
  plan: SubscriptionPlan;
  override: number | null;
}) {
  const planLimit = MONTHLY_TOKEN_LIMITS[plan] ?? MONTHLY_TOKEN_LIMITS.free;
  const limit = resolveMonthlyLimit(plan, override);
  const hasOverride = override != null && override > 0 && override !== planLimit;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const tone =
    pct >= 100
      ? 'bg-rose-500 dark:bg-rose-500'
      : pct >= 80
        ? 'bg-amber-500 dark:bg-amber-400'
        : 'bg-emerald-500 dark:bg-emerald-400';
  const tooltip =
    `AI tokens this month\n` +
    `Used: ${used.toLocaleString()} / ${limit.toLocaleString()} (${pct}%)\n` +
    `Plan: ${plan}${hasOverride ? ` (admin override)` : ''}\n` +
    (hasOverride ? `Plan default: ${planLimit.toLocaleString()}\n` : '') +
    `Remaining: ${Math.max(0, limit - used).toLocaleString()}`;
  return (
    <div className="min-w-[140px] max-w-[200px]" title={tooltip}>
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          {formatTokens(used)} / {formatTokens(limit)}
          {hasOverride ? (
            <span className="rounded-full border border-brand-200 bg-brand-50 px-1.5 py-[1px] text-[9px] font-black uppercase text-brand-700 dark:border-brand-900/50 dark:bg-brand-950/40 dark:text-brand-200">
              custom
            </span>
          ) : null}
        </span>
        <span
          className={
            pct >= 100
              ? 'text-rose-600 dark:text-rose-300'
              : pct >= 80
                ? 'text-amber-600 dark:text-amber-300'
                : 'text-emerald-600 dark:text-emerald-300'
          }
        >
          {pct}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ${tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

type ActionVariant = 'neutral' | 'amber' | 'rose' | 'danger';

function ActionsMenu({
  items,
}: {
  items: Array<{ label: string; onClick: () => void | Promise<void>; variant?: ActionVariant; divider?: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-900 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        Actions
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path
            d="M2.5 4.5L6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-slate-800 dark:bg-slate-900 dark:ring-white/5"
        >
          <ul className="py-1">
            {items.map((it, idx) => {
              const variantCls =
                it.variant === 'danger'
                  ? 'text-white bg-slate-900 hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600'
                  : it.variant === 'rose'
                    ? 'text-rose-700 hover:bg-rose-50 dark:text-rose-200 dark:hover:bg-rose-950/40'
                    : it.variant === 'amber'
                      ? 'text-amber-700 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/40'
                      : 'text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800';
              return (
                <li key={idx} className={it.divider ? 'mt-1 border-t border-slate-200 pt-1 dark:border-slate-800' : ''}>
                  <button
                    type="button"
                    role="menuitem"
                    className={`block w-full px-3 py-2 text-left text-xs font-black ${variantCls}`}
                    onClick={async () => {
                      setOpen(false);
                      await it.onClick();
                    }}
                  >
                    {it.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

type TokenDialogMode = 'reset' | 'set_limit';

type TokenDialogState = {
  mode: TokenDialogMode;
  user: AdminUserRow;
  used: number;
};

function TokenActionDialog({
  state,
  onClose,
  onApply,
}: {
  state: TokenDialogState;
  onClose: () => void;
  onApply: (opts: { limit: number | null }) => Promise<void>;
}) {
  const { mode, user, used } = state;
  const planLimit = MONTHLY_TOKEN_LIMITS[user.subscription_plan] ?? MONTHLY_TOKEN_LIMITS.free;
  const currentLimit = resolveMonthlyLimit(user.subscription_plan, user.ai_token_limit_override);
  const userLabel = user.name || user.student_id || user.id.slice(0, 8);

  // Step 1 = review; step 2 = final confirm (double-confirmation the user asked for).
  const [step, setStep] = useState<1 | 2>(1);
  const [limitInput, setLimitInput] = useState<string>(
    mode === 'set_limit' && user.ai_token_limit_override ? String(user.ai_token_limit_override) : '',
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const parsedLimit: number | null = useMemo(() => {
    if (mode !== 'set_limit') return null;
    const trimmed = limitInput.trim();
    if (!trimmed) return null;
    const n = Number(trimmed.replace(/[_,\s]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  }, [mode, limitInput]);
  const limitInputValid =
    mode !== 'set_limit' || limitInput.trim() === '' || parsedLimit != null;

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onEsc);
    // Prevent background scroll while the dialog is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, busy]);

  const title =
    mode === 'reset' ? `Reset this month's AI usage` : `Set custom AI token limit`;

  const goNext = () => {
    setErr('');
    if (mode === 'set_limit' && !limitInputValid) {
      setErr('Enter a positive whole number, or leave blank to clear the override.');
      return;
    }
    setStep(2);
  };

  const apply = async () => {
    setErr('');
    setBusy(true);
    try {
      if (mode === 'reset') {
        await onApply({ limit: null });
      } else {
        // Blank input → clear the override (revert to plan default).
        await onApply({ limit: parsedLimit });
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="token-action-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/60">
          <div id="token-action-title" className="text-base font-black text-slate-900 dark:text-slate-100">
            {title}
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {userLabel} · plan <span className="font-black uppercase">{user.subscription_plan}</span>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5 text-sm">
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
            <div>
              <div className="font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                This month used
              </div>
              <div className="mt-1 font-black text-slate-900 dark:text-slate-100">
                {used.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Current limit
              </div>
              <div className="mt-1 font-black text-slate-900 dark:text-slate-100">
                {currentLimit.toLocaleString()}
                {user.ai_token_limit_override ? (
                  <span className="ml-1 text-[10px] font-black uppercase text-brand-600 dark:text-brand-300">
                    (custom)
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {mode === 'reset' ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
              This will delete all <span className="font-black">ai_token_usage</span> rows for this
              user in the current UTC month. The user's "X / {currentLimit.toLocaleString()}" bar
              resets to 0 and they can keep using AI immediately. Historic totals from previous
              months are not affected.
            </div>
          ) : null}

          {mode === 'set_limit' ? (
            <label className="block">
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                New monthly limit (tokens)
              </div>
              <input
                inputMode="numeric"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && step === 1) goNext();
                }}
                placeholder={`Plan default is ${planLimit.toLocaleString()}`}
                disabled={busy || step === 2}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {[planLimit, 50_000, 100_000, 200_000, 500_000].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={busy || step === 2}
                    onClick={() => setLimitInput(String(n))}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {n.toLocaleString()}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy || step === 2}
                  onClick={() => setLimitInput('')}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Clear override
                </button>
              </div>
              <div className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Leave blank to remove the override and fall back to the plan default
                ({planLimit.toLocaleString()} tokens).
              </div>
            </label>
          ) : null}

          {step === 2 ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
              {mode === 'reset' ? (
                <>
                  Final confirmation. You're about to reset{' '}
                  <span className="font-black">{userLabel}</span>'s AI usage for this month to 0.
                </>
              ) : parsedLimit == null ? (
                <>
                  Final confirmation. You're about to remove the custom limit for{' '}
                  <span className="font-black">{userLabel}</span> and revert to the plan default of{' '}
                  <span className="font-black">{planLimit.toLocaleString()}</span> tokens/month.
                </>
              ) : (
                <>
                  Final confirmation. You're about to set{' '}
                  <span className="font-black">{userLabel}</span>'s monthly limit to{' '}
                  <span className="font-black">{parsedLimit.toLocaleString()}</span> tokens
                  {parsedLimit < used ? (
                    <>
                      {' '}— note that this is{' '}
                      <span className="font-black">below</span> their current usage of{' '}
                      {used.toLocaleString()}, so the user will already be capped.
                    </>
                  ) : null}
                  .
                </>
              )}
            </div>
          ) : null}

          {err ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
              {err}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/60">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-900 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          {step === 1 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={busy || (mode === 'set_limit' && !limitInputValid)}
              className="h-9 rounded-xl bg-slate-900 px-3 text-xs font-black text-white hover:bg-black disabled:opacity-60 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={apply}
              disabled={busy}
              className={`h-9 rounded-xl px-3 text-xs font-black text-white disabled:opacity-60 ${
                mode === 'reset'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-brand-600 hover:bg-brand-700'
              }`}
            >
              {busy ? 'Applying…' : mode === 'reset' ? 'Reset usage' : 'Apply limit'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function UsersRoute() {
  type RowLimit = 25 | 50 | 100 | 200 | 'all';
  type SortKey = 'newest' | 'oldest' | 'name_az' | 'name_za' | 'usage_high' | 'usage_low';
  const { searchQuery } = useAdminSearch();
  const [query, setQuery] = useState('');
  const [universityId, setUniversityId] = useState('');
  const [rowLimit, setRowLimit] = useState<RowLimit>(50);
  const [sortBy, setSortBy] = useState<SortKey>('newest');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [count, setCount] = useState(0);
  const [usageByUser, setUsageByUser] = useState<Record<string, number>>({});
  const [usageLoading, setUsageLoading] = useState(false);
  const [tokenDialog, setTokenDialog] = useState<TokenDialogState | null>(null);
  const hasMounted = useRef(false);

  const loadUsage = async (users: AdminUserRow[]) => {
    const ids = users.map((u) => u.id).filter(Boolean);
    if (!ids.length) {
      setUsageByUser({});
      return;
    }
    setUsageLoading(true);
    try {
      const totals = await listAiUsageForUsers(ids);
      setUsageByUser(totals);
    } catch (e) {
      // Non-fatal: users table still renders, the usage column just shows "—".
      console.warn('Failed to load AI usage:', e);
    } finally {
      setUsageLoading(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const baseArgs = {
        query: query.trim() || undefined,
        universityId: universityId.trim() || undefined,
      };

      if (rowLimit === 'all') {
        const pageSize = 200;
        let offset = 0;
        let total = 0;
        const merged: AdminUserRow[] = [];
        for (;;) {
          const res = await listUsers({ ...baseArgs, limit: pageSize, offset });
          if (offset === 0) total = res.count;
          merged.push(...res.items);
          if (res.items.length < pageSize || merged.length >= total) break;
          offset += res.items.length;
        }
        setItems(merged);
        setCount(total);
        void loadUsage(merged);
      } else {
        const res = await listUsers({ ...baseArgs, limit: rowLimit, offset: 0 });
        setItems(res.items);
        setCount(res.count);
        void loadUsage(res.items);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowLimit]);

  const filteredRows = useMemo(() => {
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

  const rows = useMemo(() => {
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === 'name_az') {
        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
      }
      if (sortBy === 'name_za') {
        return (b.name || '').localeCompare(a.name || '', undefined, { sensitivity: 'base' });
      }
      if (sortBy === 'usage_high') {
        return (usageByUser[b.id] ?? 0) - (usageByUser[a.id] ?? 0);
      }
      return (usageByUser[a.id] ?? 0) - (usageByUser[b.id] ?? 0);
    });
    return arr;
  }, [filteredRows, sortBy, usageByUser]);

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Users</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Search, view, disable/ban, and delete users.
          {searchQuery.trim() ? (
            <span className="mt-1 block text-xs font-bold text-brand-600 dark:text-brand-400">
              Also filtering loaded rows by the top search bar.
            </span>
          ) : null}
        </div>
      </MotionSection>

      <MotionSection delay={0.05} className="mt-6">
        <MotionPanel>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row">
            <label className="block flex-1">
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Search</div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or Student ID"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="block md:w-64">
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">University</div>
              <input
                value={universityId}
                onChange={(e) => setUniversityId(e.target.value)}
                placeholder="e.g. uitm"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="block md:w-36">
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Show</div>
              <select
                value={rowLimit}
                onChange={(e) => setRowLimit(e.target.value as RowLimit)}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value={25}>25 users</option>
                <option value={50}>50 users</option>
                <option value={100}>100 users</option>
                <option value={200}>200 users</option>
                <option value="all">All users</option>
              </select>
            </label>
            <label className="block md:w-44">
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Sort</div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="newest">Newest joined</option>
                <option value="oldest">Oldest joined</option>
                <option value="name_az">Name A-Z</option>
                <option value="name_za">Name Z-A</option>
                <option value="usage_high">AI usage highest</option>
                <option value="usage_low">AI usage lowest</option>
              </select>
            </label>
          </div>
          <button
            onClick={refresh}
            disabled={busy}
            className="h-11 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70"
          >
            {busy ? 'Loading…' : 'Search'}
          </button>
        </div>

        {err ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
            {err}
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>Showing {rows.length} of {count}</span>
          {usageLoading ? <span className="text-brand-600 dark:text-brand-400">· loading AI usage…</span> : null}
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1040px] border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Student ID</th>
                <th className="px-3 py-2">University</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Joined</th>
                <th className="px-3 py-2" title="AI tokens used this calendar month (UTC). Hover the bar for details.">
                  AI usage · this month
                </th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const tone = u.status === 'active' ? 'green' : u.status === 'disabled' ? 'amber' : 'rose';
                const planTone =
                  u.subscription_plan === 'free' ? 'slate' : u.subscription_plan === 'plus' ? 'green' : 'amber';
                const used = usageByUser[u.id] ?? 0;
                return (
                  <tr key={u.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40">
                    <td className="px-3 py-3 text-sm font-black text-slate-900 dark:text-slate-100">{u.name || '-'}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{u.student_id || '-'}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{u.university_id || '-'}</td>
                    <td className="px-3 py-3">
                      <Chip tone={planTone}>{u.subscription_plan}</Chip>
                    </td>
                    <td className="px-3 py-3">
                      <Chip tone={tone}>{u.status}</Chip>
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200" title={u.created_at || '-'}>
                      {formatJoinDate(u.created_at)}
                    </td>
                    <td className="px-3 py-3">
                      <UsageBar
                        used={used}
                        plan={u.subscription_plan}
                        override={u.ai_token_limit_override}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <ActionsMenu
                        items={[
                          {
                            label: 'Activate',
                            onClick: async () => {
                              await setUserStatus(u.id, 'active');
                              await refresh();
                            },
                          },
                          {
                            label: 'Disable',
                            variant: 'amber',
                            onClick: async () => {
                              await setUserStatus(u.id, 'disabled');
                              await refresh();
                            },
                          },
                          {
                            label: 'Ban',
                            variant: 'rose',
                            onClick: async () => {
                              await setUserStatus(u.id, 'banned');
                              await refresh();
                            },
                          },
                          {
                            label: 'Reset AI usage',
                            variant: 'amber',
                            divider: true,
                            onClick: () => {
                              setTokenDialog({ mode: 'reset', user: u, used });
                            },
                          },
                          {
                            label: 'Set AI limit',
                            onClick: () => {
                              setTokenDialog({ mode: 'set_limit', user: u, used });
                            },
                          },
                          {
                            label: 'Delete',
                            variant: 'danger',
                            divider: true,
                            onClick: async () => {
                              const expected = (u.student_id && u.student_id.trim()) || u.id.slice(0, 8);
                              const typed = window.prompt(
                                `This permanently deletes user "${u.name || u.id}" and their auth account.\n\n` +
                                  `Type the student ID (or first 8 chars of their UUID) to confirm:\n\n${expected}`,
                              );
                              if (!typed) return;
                              if (typed.trim() !== expected) {
                                alert('Confirmation did not match. User was NOT deleted.');
                                return;
                              }
                              await deleteUser(u.id);
                              await refresh();
                            },
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !busy ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {searchQuery.trim() && items.length > 0
                      ? 'No loaded users match the top search. Clear it or run Search again.'
                      : 'No users found.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
        </MotionPanel>
      </MotionSection>

      {tokenDialog ? (
        <TokenActionDialog
          state={tokenDialog}
          onClose={() => setTokenDialog(null)}
          onApply={async ({ limit }) => {
            if (tokenDialog.mode === 'reset') {
              await resetUserMonthlyTokens(tokenDialog.user.id);
            } else {
              await setUserTokenLimit(tokenDialog.user.id, limit);
            }
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}
