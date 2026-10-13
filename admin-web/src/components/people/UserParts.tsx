import type { ReactNode } from 'react';
import { MONTHLY_TOKEN_LIMITS, resolveMonthlyLimit, type AdminUserRow, type SubscriptionPlan } from '../../lib/api';
import { cn } from '../../ui/cn';
import { Chip, FactGrid } from '../../ui/page';
import {
  accountStatusTone,
  billingTone,
  capitalize,
  formatBillingStatus,
  formatCountry,
  formatDateTime,
  formatJoinDate,
  formatTokens,
  planTone,
} from './format';

/** AI tokens used this month against the user's limit. Hover for the full numbers. */
export function UsageBar({ used, plan, override }: { used: number; plan: SubscriptionPlan; override: number | null }) {
  const planLimit = MONTHLY_TOKEN_LIMITS[plan] ?? MONTHLY_TOKEN_LIMITS.free;
  const limit = resolveMonthlyLimit(plan, override);
  const hasOverride = override != null && override > 0 && override !== planLimit;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const bar = pct >= 100 ? 'bg-rose-500 dark:bg-rose-500' : pct >= 80 ? 'bg-amber-500 dark:bg-amber-400' : 'bg-emerald-500 dark:bg-emerald-400';
  const text = pct >= 100 ? 'text-rose-600 dark:text-rose-300' : pct >= 80 ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300';
  const tooltip =
    `AI tokens this month\n` +
    `Used: ${used.toLocaleString()} / ${limit.toLocaleString()} (${pct}%)\n` +
    `Plan: ${plan}${hasOverride ? ` (admin override)` : ''}\n` +
    (hasOverride ? `Plan default: ${planLimit.toLocaleString()}\n` : '') +
    `Remaining: ${Math.max(0, limit - used).toLocaleString()}`;
  return (
    <div className="w-full" title={tooltip}>
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          AI {formatTokens(used)} / {formatTokens(limit)}
          {hasOverride ? (
            <span className="rounded-md bg-brand-50 px-1.5 text-[9px] font-black uppercase text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
              custom
            </span>
          ) : null}
        </span>
        <span className={text}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className={cn('h-full rounded-full transition-all duration-300', bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Plan, billing state (when not free) and account status chips. */
export function UserChips({ u }: { u: AdminUserRow }) {
  return (
    <>
      <Chip tone={planTone(u.subscription_plan)}>{capitalize(u.subscription_plan)}</Chip>
      {u.subscription_status !== 'free' ? (
        <Chip tone={billingTone(u.subscription_status)}>{formatBillingStatus(u.subscription_status)}</Chip>
      ) : null}
      <Chip tone={accountStatusTone(u.status)}>{capitalize(u.status)}</Chip>
    </>
  );
}

/** One user in the list. The whole row opens the detail panel. */
export function UserRow({ u, used, onOpen }: { u: AdminUserRow; used: number; onOpen: () => void }) {
  const meta = [u.student_id, u.university_id, formatCountry(u.country)].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-1 gap-3 px-4 py-3 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 md:grid-cols-[minmax(0,1fr)_auto_180px] md:items-center md:gap-5 dark:hover:bg-slate-800/40 dark:focus-visible:bg-slate-800/40"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{u.name || '-'}</div>
        <div className="truncate text-xs font-semibold text-slate-600 dark:text-slate-300" title={u.email ?? undefined}>
          {u.email || '—'}
        </div>
        <div className="mt-0.5 truncate text-xs font-semibold text-slate-400 dark:text-slate-500">
          {meta} · <span title={u.created_at || '-'}>joined {formatJoinDate(u.created_at)}</span> · {u.id.slice(0, 8)}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 md:justify-end">
        <UserChips u={u} />
      </div>
      <UsageBar used={used} plan={u.subscription_plan} override={u.ai_token_limit_override} />
    </button>
  );
}

/** Every stored field for one user, shown in the detail panel. */
export function UserFacts({ u, usedThisMonth }: { u: AdminUserRow; usedThisMonth: number }) {
  const planLimit = MONTHLY_TOKEN_LIMITS[u.subscription_plan] ?? MONTHLY_TOKEN_LIMITS.free;
  const effectiveLimit = resolveMonthlyLimit(u.subscription_plan, u.ai_token_limit_override);
  const pct = effectiveLimit > 0 ? Math.min(100, Math.round((usedThisMonth / effectiveLimit) * 100)) : 0;

  const profile: [string, string][] = [
    ['User ID', u.id],
    ['Email', u.email?.trim() || '—'],
    ['Display name', u.name?.trim() || '—'],
    ['Student ID', u.student_id?.trim() || '—'],
    ['University', u.university_id?.trim() || '—'],
    ['Country', formatCountry(u.country)],
    ['Device', u.device_platform ?? '—'],
    ['Status', u.status],
    ['Joined', formatDateTime(u.created_at)],
    ['Profile updated', formatDateTime(u.updated_at)],
  ];
  const billing: [string, string][] = [
    ['Plan', u.subscription_plan],
    ['Billing state', formatBillingStatus(u.subscription_status)],
    ['Billing source', u.subscription_store || '—'],
    ['Environment', u.subscription_environment || '—'],
    ['Product', u.subscription_product_id || '—'],
    [
      'Recorded price',
      u.subscription_price == null ? '—' : `${u.subscription_currency || ''} ${u.subscription_price.toFixed(2)}`.trim(),
    ],
    ['Subscription expires', formatDateTime(u.subscription_expires_at)],
    ['Billing last synced', formatDateTime(u.subscription_updated_at)],
  ];
  const ai: [string, string][] = [
    ['AI usage (this month, UTC)', `${usedThisMonth.toLocaleString()} / ${effectiveLimit.toLocaleString()} (${pct}%)`],
    [
      'AI limit override',
      u.ai_token_limit_override != null && u.ai_token_limit_override > 0
        ? `${u.ai_token_limit_override.toLocaleString()} tokens/mo (plan default ${planLimit.toLocaleString()})`
        : `Plan default (${planLimit.toLocaleString()} tokens/mo)`,
    ],
  ];

  return (
    <>
      <FactSection title="Profile" items={profile} />
      <FactSection title="Billing" items={billing} />
      <FactSection title="AI usage" items={ai}>
        <div className="mt-2">
          <UsageBar used={usedThisMonth} plan={u.subscription_plan} override={u.ai_token_limit_override} />
        </div>
      </FactSection>
    </>
  );
}

function FactSection({ title, items, children }: { title: string; items: [string, string][]; children?: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
      <FactGrid items={items} />
      {children}
    </section>
  );
}
