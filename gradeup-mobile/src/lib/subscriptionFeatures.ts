import { supabase } from './supabase';
import type { SubscriptionPlan } from '../types';

function normalizeTier(raw: string | null | undefined): SubscriptionPlan {
  if (raw === 'plus' || raw === 'pro') return raw;
  return 'free';
}

/** Enabled feature lines for a tier (for profile / marketing). Falls back to empty if table missing or error. */
export async function getEnabledSubscriptionFeaturesForTier(tier: SubscriptionPlan): Promise<string[]> {
  const t = normalizeTier(tier);
  const { data, error } = await supabase
    .from('subscription_plan_features')
    .select('label')
    .eq('tier', t)
    .eq('enabled', true)
    .order('sort_order', { ascending: true });
  if (error || !data?.length) return [];
  return data.map((r) => String((r as { label: string }).label ?? '').trim()).filter(Boolean);
}

export async function getEnabledSubscriptionFeaturesAllTiers(): Promise<Record<SubscriptionPlan, string[]>> {
  const [free, plus, pro] = await Promise.all([
    getEnabledSubscriptionFeaturesForTier('free'),
    getEnabledSubscriptionFeaturesForTier('plus'),
    getEnabledSubscriptionFeaturesForTier('pro'),
  ]);
  return { free, plus, pro };
}
