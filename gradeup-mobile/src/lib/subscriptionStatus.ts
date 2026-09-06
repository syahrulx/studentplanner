/**
 * Trial and billing state, derived from the server-owned columns on `profiles`.
 *
 * Those columns are written only by `recompute_subscription_access()`, which the
 * authenticated RevenueCat/Curlec webhooks call. The client reads them and never
 * writes them, so a device that fakes a purchase cannot fake a trial either.
 *
 * A store free trial charges the card the moment it ends. Everything here exists
 * so the app can say that out loud before the charge lands.
 */

import type { SubscriptionPlan } from '../types';
import { subscriptionPlanLabel } from './profileDisplay';

const DAY_MS = 86_400_000;

/**
 * Statuses where entitlement still stands but the subscription will not renew —
 * the user cancelled, so access simply runs out at `expiresAt`.
 */
const NON_RENEWING_STATUSES = new Set(['cancelled', 'paused']);

/** Statuses where access is already gone; never render a countdown for these. */
const LAPSED_STATUSES = new Set(['expired', 'refunded', 'free']);

/** The billing facts the client mirrors from the server. */
export interface SubscriptionBilling {
  /** trial | introductory | active | cancelled | billing_issue | expired | … */
  subscriptionStatus?: string;
  /** Store period type: TRIAL | INTRO | NORMAL | PROMOTIONAL | PREPAID. */
  subscriptionPeriodType?: string;
  /** ISO timestamp when the current period ends (trial end, for a trial). */
  subscriptionExpiresAt?: string;
  subscriptionPlan?: SubscriptionPlan;
}

export interface TrialState {
  plan: Exclude<SubscriptionPlan, 'free'>;
  /** When the free period ends — the moment the card gets charged, if renewing. */
  endsAt: Date;
  /**
   * Whole days remaining, rounded up: 1 means "ends within the next 24 hours",
   * so the copy can say "last day" rather than a misleading "0 days left".
   */
  daysLeft: number;
  /** False once the user cancels — access lapses at `endsAt` instead of converting. */
  willRenew: boolean;
}

/**
 * Returns trial details when the user is inside a store free trial, else null.
 *
 * Cancelling during a trial makes the webhook write status `cancelled` while
 * `period_type` stays TRIAL, so period type — not status — decides whether this
 * is a trial, and status only decides whether it converts.
 */
export function getTrialState(billing: SubscriptionBilling, now: Date = new Date()): TrialState | null {
  const plan = billing.subscriptionPlan;
  if (plan !== 'plus' && plan !== 'pro') return null;

  const periodType = (billing.subscriptionPeriodType ?? '').trim().toUpperCase();
  if (periodType !== 'TRIAL') return null;

  const status = (billing.subscriptionStatus ?? '').trim().toLowerCase();
  if (LAPSED_STATUSES.has(status)) return null;

  const raw = (billing.subscriptionExpiresAt ?? '').trim();
  if (!raw) return null;
  const endsAt = new Date(raw);
  if (Number.isNaN(endsAt.getTime())) return null;

  const remainingMs = endsAt.getTime() - now.getTime();
  if (remainingMs <= 0) return null;

  return {
    plan,
    endsAt,
    daysLeft: Math.max(1, Math.ceil(remainingMs / DAY_MS)),
    willRenew: !NON_RENEWING_STATUSES.has(status),
  };
}

/** True while the trial is close enough to its charge date to interrupt the user. */
export function isTrialEndingSoon(trial: TrialState): boolean {
  return trial.daysLeft <= 3;
}

/** Short badge text, e.g. "TRIAL · 3 DAYS". */
export function trialBadgeLabel(trial: TrialState): string {
  if (trial.daysLeft === 1) return 'TRIAL · LAST DAY';
  return `TRIAL · ${trial.daysLeft} DAYS`;
}

/** Headline for a banner, e.g. "3 days left of your Plus trial". */
export function trialHeadline(trial: TrialState): string {
  const plan = subscriptionPlanLabel(trial.plan);
  if (trial.daysLeft === 1) return `Last day of your ${plan} trial`;
  return `${trial.daysLeft} days left of your ${plan} trial`;
}

/** Formats the end date the way a receipt would, e.g. "12 Sep". */
export function formatTrialEndDate(trial: TrialState): string {
  return trial.endsAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * The line that has to appear before the charge: what happens, and when.
 * `price` is the store's own localised price string when the paywall has it.
 */
export function trialRenewalNotice(trial: TrialState, price?: string | null): string {
  const when = formatTrialEndDate(trial);
  if (!trial.willRenew) {
    return `Cancelled — your ${subscriptionPlanLabel(trial.plan)} access ends ${when}. You won't be charged.`;
  }
  const amount = price?.trim() ? ` ${price.trim()}` : '';
  return `You'll be charged${amount} on ${when} unless you cancel before then.`;
}

/** Settings-row subtitle for any plan, trial-aware. */
export function planRowSubtitle(billing: SubscriptionBilling, now: Date = new Date()): string {
  const trial = getTrialState(billing, now);
  if (trial) {
    const when = formatTrialEndDate(trial);
    return trial.willRenew
      ? `Free trial — ${trial.daysLeft === 1 ? 'ends today' : `${trial.daysLeft} days left`}, then billed ${when}.`
      : `Free trial — cancelled, access ends ${when}.`;
  }
  if (billing.subscriptionPlan === 'pro') return 'Active: Pro tier with highest AI limits.';
  if (billing.subscriptionPlan === 'plus') return 'Active: Plus tier with daily study snaps.';
  return 'Manage plan, unlock AI limits & custom themes.';
}
