import type { SubscriptionPlan } from '../types';

/** Placeholder when profile field is not set (e.g. before university connect). */
export const PROFILE_PLACEHOLDER = '—';

export function subscriptionPlanLabel(plan?: SubscriptionPlan | null): string {
  const p = plan === 'plus' || plan === 'pro' ? plan : 'free';
  if (p === 'plus') return 'Plus';
  if (p === 'pro') return 'Pro';
  return 'Free';
}

export function subscriptionPlanSummary(plan?: SubscriptionPlan | null): string {
  const p = plan === 'plus' || plan === 'pro' ? plan : 'free';
  const copy: Record<SubscriptionPlan, string> = {
    free: 'Core planner, timetable, tasks, notes, flashcards, community, circles, and location privacy.',
    plus: 'Everything in Free, plus higher AI limits for SOW and task extraction, and Google Classroom.',
    pro: 'Everything in Plus, with maximum AI usage and early access to new premium features.',
  };
  return copy[p];
}

export function displayProfileText(value: string | undefined | null): string {
  const t = (value ?? '').trim();
  return t.length > 0 ? t : PROFILE_PLACEHOLDER;
}

export function displayPortalSemester(sem: number | undefined | null): string {
  if (sem != null && Number.isFinite(sem) && sem > 0) return String(Math.floor(sem));
  return PROFILE_PLACEHOLDER;
}
