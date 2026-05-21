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

const TAG = '[RevenueCat]';

/**
 * Initialize RevenueCat. Call once at app startup after the user is
 * authenticated. The `userId` should be the Supabase auth user ID so that
 * RevenueCat webhooks can reference the same user.
 */
export async function initPurchases(userId: string): Promise<void> {
  console.log(`${TAG} ============================================================`);
  console.log(`${TAG} initPurchases() called`);
  console.log(`${TAG} Platform.OS = "${Platform.OS}"`);
  console.log(`${TAG} userId = "${userId}"`);
  console.log(`${TAG} _configured = ${_configured}`);

  if (_configured) {
    console.log(`${TAG} Already configured — skipping re-init.`);
    return;
  }

  // Graceful fallback for Expo Go / Web where native module is missing
  if (!Purchases) {
    console.error(`${TAG} FATAL: Native Purchases module is null/undefined!`);
    console.error(`${TAG} This means react-native-purchases did not link correctly.`);
    console.error(`${TAG} Are you running inside Expo Go? You must use a dev build (eas build --profile development).`);
    if (__DEV__) {
      console.warn(`${TAG} DEV MODE: In-app purchases are disabled in Expo Go. Use 'eas build' to test subscriptions.`);
    }
    return;
  }

  console.log(`${TAG} Purchases native module found OK.`);

  const apiKey = Platform.OS === 'ios' ? RC_APPLE_KEY : RC_GOOGLE_KEY;
  console.log(`${TAG} Selected API key for platform "${Platform.OS}": ${apiKey}`);
  console.log(`${TAG} Using appUserID: "${userId}"`);

  if (__DEV__) {
    console.log(`${TAG} DEV mode — setting log level to DEBUG`);
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  console.log(`${TAG} Calling Purchases.configure()...`);
  try {
    await Purchases.configure({ apiKey, appUserID: userId });
    _configured = true;
    console.log(`${TAG} ✅ Purchases.configure() SUCCESS. _configured = true`);
  } catch (error: any) {
    console.error(`${TAG} ❌ Purchases.configure() FAILED`);
    console.error(`${TAG} Error name:    ${error?.name}`);
    console.error(`${TAG} Error message: ${error?.message}`);
    console.error(`${TAG} Error code:    ${error?.code}`);
    console.error(`${TAG} Full error:    ${JSON.stringify(error, null, 2)}`);
    throw error;
  }
  console.log(`${TAG} ============================================================`);
}

/** Log out from RevenueCat (call on sign-out). */
export async function logOutPurchases(): Promise<void> {
  console.log(`${TAG} logOutPurchases() called. _configured = ${_configured}`);
  try {
    if (_configured && Purchases) {
      await Purchases.logOut();
      _configured = false;
      console.log(`${TAG} ✅ logOutPurchases() SUCCESS. _configured = false`);
    } else {
      console.warn(`${TAG} logOutPurchases() skipped — not configured or Purchases module missing.`);
    }
  } catch (error: any) {
    console.error(`${TAG} ❌ logOutPurchases() FAILED: ${error?.message}`);
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
  console.log(`${TAG} ---- planFromCustomerInfo() ----`);

  const activeKeys = Object.keys(info.entitlements.active);
  console.log(`${TAG} Active entitlement keys: [${activeKeys.join(', ') || 'NONE'}]`);
  console.log(`${TAG} Looking for PRO entitlement:  "${ENTITLEMENT_PRO}"`);
  console.log(`${TAG} Looking for PLUS entitlement: "${ENTITLEMENT_PLUS}"`);

  if (info.entitlements.active[ENTITLEMENT_PRO]) {
    const ent = info.entitlements.active[ENTITLEMENT_PRO];
    console.log(`${TAG} ✅ Matched PRO — productIdentifier: "${ent.productIdentifier}", expirationDate: "${ent.expirationDate}"`);
    return 'pro';
  }
  if (info.entitlements.active[ENTITLEMENT_PLUS]) {
    const ent = info.entitlements.active[ENTITLEMENT_PLUS];
    console.log(`${TAG} ✅ Matched PLUS — productIdentifier: "${ent.productIdentifier}", expirationDate: "${ent.expirationDate}"`);
    return 'plus';
  }

  console.log(`${TAG} No paid entitlement found — returning FREE`);
  return 'free';
}

/** Get the current plan from RevenueCat (uses SDK cache, fast). */
export async function getCurrentPlan(): Promise<SubscriptionPlan> {
  console.log(`${TAG} getCurrentPlan() called. _configured = ${_configured}`);
  if (!_configured) {
    console.warn(`${TAG} getCurrentPlan() — not configured, returning free`);
    return 'free';
  }
  try {
    console.log(`${TAG} Calling Purchases.getCustomerInfo()...`);
    const info = await Purchases.getCustomerInfo();
    console.log(`${TAG} getCustomerInfo() OK. originalAppUserId: "${info.originalAppUserId}"`);
    return planFromCustomerInfo(info);
  } catch (error: any) {
    console.error(`${TAG} ❌ getCurrentPlan() FAILED: ${error?.message} (code: ${error?.code})`);
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
  console.log(`${TAG} ============================================================`);
  console.log(`${TAG} getOfferings() called`);
  console.log(`${TAG} _configured = ${_configured}`);
  console.log(`${TAG} Platform.OS  = "${Platform.OS}"`);

  if (!_configured) {
    console.error(`${TAG} ❌ getOfferings() called BEFORE initPurchases(). Purchases not configured yet!`);
    return { plusPackage: null, proPackage: null, raw: null };
  }

  try {
    console.log(`${TAG} Calling Purchases.getOfferings()...`);
    const offerings = await Purchases.getOfferings();

    console.log(`${TAG} ✅ getOfferings() raw response received`);
    console.log(`${TAG} offerings.current identifier: "${offerings.current?.identifier ?? 'NULL — no current offering!'}"`);
    console.log(`${TAG} All offering keys in offerings.all: [${Object.keys(offerings.all).join(', ') || 'EMPTY'}]`);

    const current = offerings.current;

    if (!current) {
      console.error(`${TAG} ❌ offerings.current is NULL!`);
      console.error(`${TAG} This means no offering is marked as 'current' in your RevenueCat dashboard.`);
      console.error(`${TAG} Fix: Go to RevenueCat Dashboard → Your App → Offerings → Set one offering as Current.`);
      console.error(`${TAG} Available offering keys: [${Object.keys(offerings.all).join(', ')}]`);
      return { plusPackage: null, proPackage: null, raw: offerings };
    }

    console.log(`${TAG} Current offering: "${current.identifier}" — "${current.serverDescription}"`);
    console.log(`${TAG} availablePackages count: ${current.availablePackages.length}`);

    if (current.availablePackages.length === 0) {
      console.error(`${TAG} ❌ availablePackages is EMPTY!`);
      console.error(`${TAG} This means Google Play has not returned any products.`);
      console.error(`${TAG} Common causes:`);
      console.error(`${TAG}   1. Subscription products are still in DRAFT state on Google Play Console.`);
      console.error(`${TAG}   2. Google Play Developer API is not enabled in Google Cloud Console.`);
      console.error(`${TAG}   3. RevenueCat service account credentials are invalid or expired.`);
      console.error(`${TAG}   4. The app package name in RevenueCat does not exactly match Google Play.`);
      console.error(`${TAG}   5. Your Google account is not added as a License Tester in Google Play Console.`);
    }

    // Log every single package in detail
    current.availablePackages.forEach((pkg, idx) => {
      console.log(`${TAG} --- Package [${idx}] ---`);
      console.log(`${TAG}   pkg.identifier:             "${pkg.identifier}"`);
      console.log(`${TAG}   pkg.packageType:            "${pkg.packageType}"`);
      console.log(`${TAG}   pkg.product.identifier:     "${pkg.product.identifier}"`);
      console.log(`${TAG}   pkg.product.title:          "${pkg.product.title}"`);
      console.log(`${TAG}   pkg.product.description:    "${pkg.product.description}"`);
      console.log(`${TAG}   pkg.product.price:          ${pkg.product.price}`);
      console.log(`${TAG}   pkg.product.priceString:    "${pkg.product.priceString}"`);
      console.log(`${TAG}   pkg.product.currencyCode:   "${pkg.product.currencyCode}"`);
      console.log(`${TAG}   pkg.product.productCategory: "${(pkg.product as any).productCategory ?? 'n/a'}"`);
    });

    // Match Plus package
    console.log(`${TAG} Searching for PLUS package (looking for "plus" or "monthly" in identifiers)...`);
    const plusPackage =
      current.availablePackages.find((p) =>
        p.product.identifier.toLowerCase().includes('plus') ||
        p.identifier.toLowerCase().includes('plus')
      ) ??
      current.availablePackages.find((p) =>
        p.identifier.toLowerCase().includes('monthly')
      ) ?? null;

    if (plusPackage) {
      console.log(`${TAG} ✅ PLUS package found: productId="${plusPackage.product.identifier}", pkgId="${plusPackage.identifier}", price="${plusPackage.product.priceString}"`);
    } else {
      console.error(`${TAG} ❌ PLUS package NOT FOUND. None of the ${current.availablePackages.length} packages matched "plus" or "monthly".`);
      console.error(`${TAG} Available product identifiers: [${current.availablePackages.map(p => p.product.identifier).join(', ')}]`);
      console.error(`${TAG} Available package identifiers: [${current.availablePackages.map(p => p.identifier).join(', ')}]`);
      console.error(`${TAG} Fix: Ensure your Google Play product ID or RevenueCat package identifier contains the word "plus" or "monthly".`);
    }

    // Match Pro package
    console.log(`${TAG} Searching for PRO package (looking for "pro" in identifiers)...`);
    const proPackage =
      current.availablePackages.find((p) =>
        p.product.identifier.toLowerCase().includes('pro') ||
        p.identifier.toLowerCase().includes('pro')
      ) ?? null;

    if (proPackage) {
      console.log(`${TAG} ✅ PRO package found: productId="${proPackage.product.identifier}", pkgId="${proPackage.identifier}", price="${proPackage.product.priceString}"`);
    } else {
      console.error(`${TAG} ❌ PRO package NOT FOUND. None of the ${current.availablePackages.length} packages matched "pro".`);
      console.error(`${TAG} Available product identifiers: [${current.availablePackages.map(p => p.product.identifier).join(', ')}]`);
      console.error(`${TAG} Fix: Ensure your Google Play product ID or RevenueCat package identifier contains the word "pro".`);
    }

    console.log(`${TAG} getOfferings() FINAL RESULT — plusPackage: ${plusPackage ? 'FOUND' : 'NULL'}, proPackage: ${proPackage ? 'FOUND' : 'NULL'}`);
    console.log(`${TAG} ============================================================`);
    return { plusPackage, proPackage, raw: offerings };

  } catch (error: any) {
    console.error(`${TAG} ❌ getOfferings() threw an exception!`);
    console.error(`${TAG} Error name:    ${error?.name}`);
    console.error(`${TAG} Error message: ${error?.message}`);
    console.error(`${TAG} Error code:    ${error?.code}`);
    console.error(`${TAG} Error underlyingErrorMessage: ${error?.underlyingErrorMessage}`);
    console.error(`${TAG} Full error:    ${JSON.stringify(error, null, 2)}`);
    console.error(`${TAG} ============================================================`);
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
  console.log(`${TAG} ============================================================`);
  console.log(`${TAG} purchasePackage() called`);
  console.log(`${TAG} _configured = ${_configured}`);
  console.log(`${TAG} pkg.identifier:         "${pkg.identifier}"`);
  console.log(`${TAG} pkg.product.identifier: "${pkg.product.identifier}"`);
  console.log(`${TAG} pkg.product.price:      ${pkg.product.price}`);
  console.log(`${TAG} pkg.product.priceString:"${pkg.product.priceString}"`);

  if (!_configured) {
    console.error(`${TAG} ❌ purchasePackage() called but RevenueCat is not configured!`);
    throw new Error('RevenueCat is not configured yet.');
  }

  try {
    console.log(`${TAG} Calling Purchases.purchasePackage()... waiting for Google Play billing sheet.`);
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    console.log(`${TAG} ✅ purchasePackage() SUCCESS`);
    console.log(`${TAG} customerInfo.originalAppUserId: "${customerInfo.originalAppUserId}"`);
    console.log(`${TAG} customerInfo active entitlements: [${Object.keys(customerInfo.entitlements.active).join(', ') || 'NONE'}]`);
    const plan = planFromCustomerInfo(customerInfo);
    console.log(`${TAG} Resolved plan after purchase: "${plan}"`);
    console.log(`${TAG} ============================================================`);
    return plan;
  } catch (error: any) {
    console.error(`${TAG} ❌ purchasePackage() FAILED`);
    console.error(`${TAG} Error name:                  ${error?.name}`);
    console.error(`${TAG} Error message:               ${error?.message}`);
    console.error(`${TAG} Error code:                  ${error?.code}`);
    console.error(`${TAG} Error userCancelled:         ${error?.userCancelled}`);
    console.error(`${TAG} Error underlyingErrorMessage:${error?.underlyingErrorMessage}`);
    console.error(`${TAG} Full error:                  ${JSON.stringify(error, null, 2)}`);
    console.error(`${TAG} ============================================================`);
    throw error;
  }
}

/** Returns true if the given error is a user-cancellation (not a real error). */
export function isPurchaseCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  const cancelled =
    e.userCancelled === true ||
    (e as any).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
  console.log(`${TAG} isPurchaseCancelled() = ${cancelled} (userCancelled=${e.userCancelled}, code=${(e as any).code})`);
  return cancelled;
}

/**
 * Restore previous purchases (e.g., after reinstall or on a new device).
 * Apple requires a visible "Restore Purchases" button.
 */
export async function restorePurchases(): Promise<SubscriptionPlan> {
  console.log(`${TAG} ============================================================`);
  console.log(`${TAG} restorePurchases() called`);
  console.log(`${TAG} _configured = ${_configured}`);

  if (!_configured || !Purchases) {
    console.error(`${TAG} ❌ restorePurchases() — not configured or Purchases module missing.`);
    throw new Error('RevenueCat is not configured or not supported on this platform.');
  }

  try {
    console.log(`${TAG} Calling Purchases.restorePurchases()...`);
    const info = await Purchases.restorePurchases();
    console.log(`${TAG} ✅ restorePurchases() SUCCESS`);
    console.log(`${TAG} Restored active entitlements: [${Object.keys(info.entitlements.active).join(', ') || 'NONE'}]`);
    const plan = planFromCustomerInfo(info);
    console.log(`${TAG} Resolved plan after restore: "${plan}"`);
    console.log(`${TAG} ============================================================`);
    return plan;
  } catch (error: any) {
    console.error(`${TAG} ❌ restorePurchases() FAILED`);
    console.error(`${TAG} Error name:    ${error?.name}`);
    console.error(`${TAG} Error message: ${error?.message}`);
    console.error(`${TAG} Error code:    ${error?.code}`);
    console.error(`${TAG} Full error:    ${JSON.stringify(error, null, 2)}`);
    console.error(`${TAG} ============================================================`);
    throw error;
  }
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
  console.log(`${TAG} onCustomerInfoUpdate() registering listener. _configured = ${_configured}`);

  if (!_configured || !Purchases) {
    console.warn(`${TAG} onCustomerInfoUpdate() — not configured, returning no-op unsubscribe.`);
    return () => {};
  }

  const wrappedCallback = (info: CustomerInfo) => {
    console.log(`${TAG} 🔔 CustomerInfo updated! Active entitlements: [${Object.keys(info.entitlements.active).join(', ') || 'NONE'}]`);
    const plan = planFromCustomerInfo(info);
    console.log(`${TAG} Plan resolved from live update: "${plan}"`);
    callback(plan, info);
  };

  Purchases.addCustomerInfoUpdateListener(wrappedCallback);
  console.log(`${TAG} ✅ CustomerInfo update listener registered.`);

  return () => {
    console.log(`${TAG} Removing CustomerInfo update listener.`);
    try {
      if (Purchases) {
        Purchases.removeCustomerInfoUpdateListener(wrappedCallback);
        console.log(`${TAG} ✅ CustomerInfo update listener removed.`);
      }
    } catch (error: any) {
      console.warn(`${TAG} Could not remove CustomerInfo listener: ${error?.message}`);
      // ignore in case listener cleanup is called after SDK teardown
    }
  };
}
