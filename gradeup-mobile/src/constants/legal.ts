import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

/**
 * Legal / compliance endpoints used throughout the app.
 * Required by Apple App Review Guidelines 5.1.1 (Privacy) and 1.2 (UGC safety).
 *
 * - Privacy Policy lives on the public website — App Store Connect requires a URL.
 *   Replace the placeholder with your hosted page before submission.
 * - Terms of Use (EULA) and Community Guidelines are rendered in-app, so they
 *   do not require a public URL.
 */

/** Public URL to the hosted Privacy Policy. Must be reachable for App Review. */
export const PRIVACY_POLICY_URL = 'https://aizztech.com/privacy/rencana';

/** In-app route to the Terms of Use screen. */
export const TERMS_OF_USE_ROUTE = '/legal/terms';

/** In-app route to the Community Guidelines screen. */
export const COMMUNITY_GUIDELINES_ROUTE = '/legal/guidelines';

/** Support contact email shown in legal screens and error flows. */
export const SUPPORT_EMAIL = 'contact@aizztech.com';

/** Open any external legal URL in the in-app browser (safe no-op on failure). */
export function openExternalLegalUrl(url: string): Promise<unknown> {
  return WebBrowser.openBrowserAsync(url).catch(() => undefined);
}

/** Open the hosted Privacy Policy page. */
export function openPrivacyPolicy(): Promise<unknown> {
  return openExternalLegalUrl(PRIVACY_POLICY_URL);
}

/** Navigate to the in-app Terms of Use screen. */
export function openTermsOfUse(): void {
  router.push(TERMS_OF_USE_ROUTE as never);
}

/** Navigate to the in-app Community Guidelines screen. */
export function openCommunityGuidelines(): void {
  router.push(COMMUNITY_GUIDELINES_ROUTE as never);
}

/**
 * Back-compat: existing callers pass one URL. Privacy Policy stays external;
 * anything else we recognize routes in-app.
 */
export function openLegalUrl(url: string): Promise<unknown> | void {
  if (url === PRIVACY_POLICY_URL) return openPrivacyPolicy();
  return openExternalLegalUrl(url);
}
