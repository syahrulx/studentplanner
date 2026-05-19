/**
 * RevenueCat SDK wrapper — centralizes all in-app purchase logic.
 *
 * RevenueCat is the single source of truth for the *client*; the Supabase
 * `profiles.subscription_plan` column is kept in sync via webhooks and is
 * the source of truth for *server-side* Edge Functions (AI limits, etc.).
 */
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type PurchasesPackage,
  type CustomerInfo,
  type PurchasesOfferings,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import type { SubscriptionPlan } from '../types';

// ---------------------------------------------------------------------------
// RevenueCat Public API Keys
// ---------------------------------------------------------------------------
const RC_APPLE_KEY  = 'appl_XBBfZrTxsJDKUzQSSwGQTlXjkHa';
const RC_GOOGLE_KEY = 'goog_MFXUkzlzKOWEKwydNgYFZIsyaFb';

// ---------------------------------------------------------------------------
// Entitlement IDs (must match what you create in RevenueCat dashboard)
// ---------------------------------------------------------------------------
const ENTITLEMENT_PRO  = 'Rencana Pro';
const ENTITLEMENT_PLUS = 'Rencana Plus';

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

let _configured = false;

/**
 * Initialize RevenueCat. Call once at app startup after the user is
 * authenticated. The `userId` should be the Supabase auth user ID so that
 * RevenueCat webhooks can reference the same user.
 */
export async function initPurchases(userId: string): Promise<void> {
  if (_configured) return;

  // Graceful fallback for Expo Go / Web where native module is missing
  if (!Purchases) {
    if (__DEV__) {
      console.warn(
        '[RevenueCat] Native Purchases module is null. If you are running inside Expo Go, in-app purchases are disabled. Use a development build (eas build) to test subscriptions.'
      );
    }
    return;
  }

  const apiKey = Platform.OS === 'ios' ? RC_APPLE_KEY : RC_GOOGLE_KEY;

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  await Purchases.configure({ apiKey, appUserID: userId });
  _configured = true;
}

/** Log out from RevenueCat (call on sign-out). */
export async function logOutPurchases(): Promise<void> {
  try {
    if (_configured && Purchases) {
      await Purchases.logOut();
      _configured = false;
    }
  } catch {
    // ignore — may not be configured yet
  }
}

// ---------------------------------------------------------------------------
// Plan mapping
// ---------------------------------------------------------------------------

/**
 * Derive the Rencana SubscriptionPlan from RevenueCat's CustomerInfo.
 * Pro takes precedence over Plus.
 */
export function planFromCustomerInfo(info: CustomerInfo): SubscriptionPlan {
  console.log('[RevenueCat] planFromCustomerInfo active entitlements:', Object.keys(info.entitlements.active));
  if (info.entitlements.active[ENTITLEMENT_PRO]) {
    console.log('[RevenueCat] Matched PRO');
    return 'pro';
  }
  if (info.entitlements.active[ENTITLEMENT_PLUS]) {
    console.log('[RevenueCat] Matched PLUS');
    return 'plus';
  }
  console.log('[RevenueCat] Matched FREE');
  return 'free';
}

/** Get the current plan from RevenueCat (uses SDK cache, fast). */
export async function getCurrentPlan(): Promise<SubscriptionPlan> {
  if (!_configured) return 'free';
  try {
    const info = await Purchases.getCustomerInfo();
    return planFromCustomerInfo(info);
  } catch {
    return 'free';
  }
}

// ---------------------------------------------------------------------------
// Offerings (for the paywall UI)
// ---------------------------------------------------------------------------

export interface PlanOfferings {
  plusPackage: PurchasesPackage | null;
  proPackage: PurchasesPackage | null;
  /** Raw offerings for debugging / advanced usage */
  raw: PurchasesOfferings | null;
}

/** Fetch available packages for the paywall. */
export async function getOfferings(): Promise<PlanOfferings> {
  if (!_configured) return { plusPackage: null, proPackage: null, raw: null };
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;

    if (!current) return { plusPackage: null, proPackage: null, raw: offerings };

    const plusPackage =
      current.availablePackages.find((p) =>
        p.product.identifier.toLowerCase().includes('plus') ||
        p.identifier.toLowerCase().includes('plus')
      ) ??
      current.availablePackages.find((p) =>
        p.identifier.toLowerCase().includes('monthly')
      ) ?? null;

    const proPackage =
      current.availablePackages.find((p) =>
        p.product.identifier.toLowerCase().includes('pro') ||
        p.identifier.toLowerCase().includes('pro')
      ) ?? null;

    console.log('[RevenueCat] Detected packages:', {
      plus: plusPackage?.product.identifier,
      pro: proPackage?.product.identifier,
    });

    return { plusPackage, proPackage, raw: offerings };
  } catch {
    return { plusPackage: null, proPackage: null, raw: null };
  }
}

// ---------------------------------------------------------------------------
// Purchase & Restore
// ---------------------------------------------------------------------------

/** Purchase a package. Returns the new plan after the transaction completes. */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<SubscriptionPlan> {
  if (!_configured) throw new Error('RevenueCat is not configured yet.');
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return planFromCustomerInfo(customerInfo);
}

/** Returns true if the given error is a user-cancellation (not a real error). */
export function isPurchaseCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  return (
    e.userCancelled === true ||
    (e as any).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  );
}

/**
 * Restore previous purchases (e.g., after reinstall or on a new device).
 * Apple requires a visible "Restore Purchases" button.
 */
export async function restorePurchases(): Promise<SubscriptionPlan> {
  if (!_configured || !Purchases) {
    throw new Error('RevenueCat is not configured or not supported on this platform.');
  }
  const info = await Purchases.restorePurchases();
  return planFromCustomerInfo(info);
}

// ---------------------------------------------------------------------------
// Listener (for real-time plan changes mid-session)
// ---------------------------------------------------------------------------

/**
 * Subscribe to real-time entitlement changes. Returns an unsubscribe function.
 * Use this in AppContext so the UI reacts immediately when a subscription
 * renews, expires, or the user upgrades.
 */
export function onCustomerInfoUpdate(
  callback: (plan: SubscriptionPlan, info: CustomerInfo) => void,
): () => void {
  if (!_configured || !Purchases) {
    return () => {}; // No-op unsubscribe function
  }

  const wrappedCallback = (info: CustomerInfo) => {
    callback(planFromCustomerInfo(info), info);
  };

  Purchases.addCustomerInfoUpdateListener(wrappedCallback);
  return () => {
    try {
      if (Purchases) {
        Purchases.removeCustomerInfoUpdateListener(wrappedCallback);
      }
    } catch {
      // ignore in case listener cleanup is called after SDK teardown
    }
  };
}
