/**
 * Web stub for the RevenueCat wrapper.
 *
 * RevenueCat is NOT used on web. `react-native-purchases` has no web build (and
 * is aliased to an empty stub in metro.config.js for web bundles). On web we
 * expose the same API surface as `purchases.ts` but as safe no-ops, and the
 * paywall ([app/subscription-plans.tsx]) hands the upgrade/manage flow off to the
 * existing Rencana subscription website (rencana.com.my, Curlec/Razorpay).
 *
 * That website shares this app's Supabase project, so a successful payment
 * updates `profiles.subscription_plan` (the source of truth for entitlements)
 * and the new plan syncs straight back into the web app on next load.
 */
import type { PurchasesPackage, CustomerInfo, PurchasesOfferings } from 'react-native-purchases';
import type { SubscriptionPlan } from '../types';

const TAG = '[RevenueCat:web]';

export async function initPurchases(_userId: string): Promise<void> {
  // No native billing on web — nothing to configure.
  console.log(`${TAG} initPurchases() no-op on web.`);
}

export async function logOutPurchases(): Promise<void> {
  // No-op on web.
}

export function planFromCustomerInfo(info: CustomerInfo): SubscriptionPlan {
  const active = info?.entitlements?.active ?? {};
  if (active['Rencana Pro']) return 'pro';
  if (active['Rencana Plus']) return 'plus';
  return 'free';
}

export async function getCurrentPlan(): Promise<SubscriptionPlan> {
  // Plan is resolved from Supabase profile on web; default to free here.
  return 'free';
}

export interface PlanOfferings {
  plusPackage: PurchasesPackage | null;
  proPackage: PurchasesPackage | null;
  raw: PurchasesOfferings | null;
}

export async function getOfferings(): Promise<PlanOfferings> {
  // No purchasable packages on web.
  return { plusPackage: null, proPackage: null, raw: null };
}

export async function purchasePackage(_pkg: PurchasesPackage): Promise<SubscriptionPlan> {
  throw new Error('In-app purchases are not available on the web. Please use the Rencana mobile app.');
}

export function isPurchaseCancelled(_error: unknown): boolean {
  return false;
}

export async function restorePurchases(): Promise<SubscriptionPlan> {
  throw new Error('Restore purchases is only available in the Rencana mobile app.');
}

export function onCustomerInfoUpdate(
  _callback: (plan: SubscriptionPlan, info: CustomerInfo) => void,
): () => void {
  // No live entitlement stream on web.
  return () => {};
}
