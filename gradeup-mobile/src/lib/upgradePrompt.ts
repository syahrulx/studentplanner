/**
 * One source of truth for the copy on every "this needs Plus/Pro" gate.
 *
 * A gate fires at the exact moment the user wants the feature, which is the
 * best place in the app to mention the free trial. The store decides who is
 * actually eligible, so the trial is only ever named when RevenueCat has said
 * this store account would get one — the gate must never promise something the
 * paywall then fails to offer.
 */

import { getOfferings, type FreeTrialOffer, type FreeTrialUnit } from './purchases';
import { t, type TranslationKey } from '../i18n';
import type { AppLanguage } from '../storage';
import type { SubscriptionPlan } from '../types';

export type PaidPlan = Exclude<SubscriptionPlan, 'free'>;

interface TrialOffers {
  plus: FreeTrialOffer | null;
  pro: FreeTrialOffer | null;
}

/**
 * Null until primed. Gates read this synchronously and simply fall back to
 * trial-free copy while it is unknown, so a slow store never blocks a dialog.
 */
let cachedOffers: TrialOffers | null = null;
let inflight: Promise<TrialOffers> | null = null;

/**
 * Warm the trial-eligibility cache. Safe to call more than once; concurrent
 * calls share a single store round-trip. Never throws — an unreachable store
 * just leaves the gates on their plain copy.
 */
export async function primeTrialOffers(): Promise<void> {
  if (cachedOffers) return;
  if (!inflight) {
    inflight = getOfferings()
      .then((offerings) => ({ plus: offerings.plusTrial, pro: offerings.proTrial }))
      .catch(() => ({ plus: null, pro: null }))
      .finally(() => {
        inflight = null;
      });
  }
  cachedOffers = await inflight;
}

/** Drop the cache after a purchase or sign-out: eligibility is per store account. */
export function resetTrialOffers(): void {
  cachedOffers = null;
}

/**
 * The trial the store would grant for `plan`, or null when there is none, the
 * user is not eligible, or the cache has not been primed yet.
 */
export function getTrialOfferFor(plan: PaidPlan): FreeTrialOffer | null {
  if (!cachedOffers) return null;
  return plan === 'pro' ? cachedOffers.pro : cachedOffers.plus;
}

export interface UpgradeCopy {
  /** Dialog title, e.g. "Try Plus free for 7 days". */
  title: string;
  /** Body: what they unlock, then the trial terms when one is on offer. */
  message: string;
  /** Confirm-button label, e.g. "Start free trial". */
  cta: string;
}

export interface UpgradeCopyOptions {
  /** Lowest plan that unlocks the feature. */
  plan: PaidPlan;
  /** What the user was trying to do, e.g. "Handwritten notebooks and PDF annotation". */
  feature: string;
  /** Optional sentence selling the feature, appended after the plan line. */
  detail?: string;
  /** Set when `feature` is plural, so the sentence reads "are available". */
  plural?: boolean;
  /** Title used when no trial is available. Defaults to a generic plan title. */
  fallbackTitle?: string;
}

/** Human label for the gate: Pro-only features shouldn't read as "Plus or Pro". */
function planPhrase(plan: PaidPlan): string {
  return plan === 'pro' ? 'Rencana Pro' : 'Plus or Pro';
}

/**
 * Builds the gate dialog's copy, naming the free trial whenever the store says
 * this account is eligible for one.
 */
export function upgradeCopy({
  plan,
  feature,
  detail,
  plural,
  fallbackTitle,
}: UpgradeCopyOptions): UpgradeCopy {
  const trial = getTrialOfferFor(plan);
  const planName = plan === 'pro' ? 'Pro' : 'Plus';
  const lead = [
    `${feature} ${plural ? 'are' : 'is'} available with ${planPhrase(plan)}.`,
    detail?.trim(),
  ]
    .filter(Boolean)
    .join(' ');

  if (!trial) {
    return {
      title: fallbackTitle ?? `${planName} feature`,
      message: lead,
      cta: 'View plans',
    };
  }

  // Lead with what the feature does, not with the offer. The old copy opened
  // with "Try Plus free for 7 days" and buried the benefit under a sentence of
  // cancellation terms, which reads like a contract rather than an invitation.
  return {
    title: feature,
    message: [detail?.trim() || lead, `Free for ${trial.durationText}. Cancel anytime.`]
      .filter(Boolean)
      .join(' '),
    cta: 'Try it free',
  };
}

/**
 * Label for an inline upsell button or banner, e.g. "Try Plus free for 7 days".
 * Falls back to "Upgrade to Plus".
 */
export function upgradeButtonLabel(plan: PaidPlan): string {
  const trial = getTrialOfferFor(plan);
  const planName = plan === 'pro' ? 'Pro' : 'Plus';
  return trial ? `Try ${planName} free for ${trial.durationText}` : `Upgrade to ${planName}`;
}

/** Short confirm-button label for a dialog, where there is no room for the full offer. */
export function upgradeCtaLabel(plan: PaidPlan): string {
  return getTrialOfferFor(plan) ? 'Try it free' : 'Upgrade';
}

/**
 * A sentence to append to a message this module doesn't own — a usage-limit
 * warning, say. Empty when no trial is on offer, so callers can join it in
 * unconditionally.
 */
export function trialTagline(plan: PaidPlan): string {
  const trial = getTrialOfferFor(plan);
  if (!trial) return '';
  const planName = plan === 'pro' ? 'Pro' : 'Plus';
  return `Try ${planName} free for ${trial.durationText}. Cancel anytime.`;
}

// ---------------------------------------------------------------------------
// Localised variants, for the gates whose surrounding copy is already translated
// ---------------------------------------------------------------------------

/** Singular/plural translation keys per store duration unit. */
const DURATION_KEYS: Record<FreeTrialUnit, readonly [TranslationKey, TranslationKey]> = {
  day: ['trialDurationDay', 'trialDurationDays'],
  week: ['trialDurationWeek', 'trialDurationWeeks'],
  month: ['trialDurationMonth', 'trialDurationMonths'],
  year: ['trialDurationYear', 'trialDurationYears'],
};

/**
 * The store hands back an English duration ("7 days"), which cannot be dropped
 * into a Malay sentence. Rebuild it from the structured value instead.
 */
function localizedDuration(lang: AppLanguage, trial: FreeTrialOffer): string {
  const [one, many] = DURATION_KEYS[trial.durationUnit];
  const key = trial.durationValue === 1 ? one : many;
  return t(lang, key).replace('{count}', String(trial.durationValue));
}

/** `trialTagline` in the user's language; '' when no trial is on offer. */
export function localizedTrialTagline(lang: AppLanguage, plan: PaidPlan): string {
  const trial = getTrialOfferFor(plan);
  if (!trial) return '';
  return t(lang, 'trialTagline')
    .replace('{plan}', plan === 'pro' ? 'Pro' : 'Plus')
    .replace('{duration}', localizedDuration(lang, trial));
}

/** Translated "Start free trial", or the caller's existing label when none is offered. */
export function localizedTrialCta(lang: AppLanguage, plan: PaidPlan, fallback: string): string {
  return getTrialOfferFor(plan) ? t(lang, 'trialCta') : fallback;
}
