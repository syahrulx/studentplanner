/**
 * Detect and surface the "monthly AI token limit reached" error across every
 * AI feature in the app.
 *
 * The backend (see supabase/functions/_shared/tokenLimit.ts) returns an error
 * envelope of shape `{ error: { message, code: 'MONTHLY_TOKEN_LIMIT' } }` when
 * the user has exhausted the monthly token budget for their plan. That code or
 * a message matching /monthly ai token limit/i is the signal for this module.
 */
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { t } from '@/src/i18n';
import { localizedTrialCta, localizedTrialTagline } from '@/src/lib/upgradePrompt';
import type { AppLanguage } from '@/src/storage';

export const MONTHLY_TOKEN_LIMIT_CODE = 'MONTHLY_TOKEN_LIMIT';

const MONTHLY_LIMIT_REGEX = /monthly ai token limit/i;

type ErrorLike =
  | string
  | null
  | undefined
  | {
      code?: string | null;
      message?: string | null;
      details?: unknown;
      error?: { code?: string | null; message?: string | null } | null;
    };

function errorString(err: ErrorLike): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const direct = err.message ?? '';
  const nested = err.error?.message ?? '';
  const details = typeof err.details === 'string' ? err.details : '';
  return [direct, nested, details].filter(Boolean).join(' ');
}

function errorCode(err: ErrorLike): string {
  if (!err || typeof err === 'string') return '';
  return String(err.code ?? err.error?.code ?? '').toUpperCase();
}

/** Returns true when the given error represents an exhausted monthly AI quota. */
export function isMonthlyLimitError(err: ErrorLike): boolean {
  if (errorCode(err) === MONTHLY_TOKEN_LIMIT_CODE) return true;
  const msg = errorString(err);
  return !!msg && MONTHLY_LIMIT_REGEX.test(msg);
}

export const SMART_CAPTURE_LIMIT_CODE = 'SMART_CAPTURE_LIMIT';

const SMART_CAPTURE_LIMIT_REGEX = /daily smart capture limit/i;

/**
 * Returns true when the given error is the exhausted daily Smart Capture quota
 * (Free tier). Unlike the monthly token limit this is handled inside the Smart
 * Capture sheet as a paywall card, not as a system Alert.
 */
export function isSmartCaptureLimitError(err: ErrorLike): boolean {
  if (errorCode(err) === SMART_CAPTURE_LIMIT_CODE) return true;
  const msg = errorString(err);
  return !!msg && SMART_CAPTURE_LIMIT_REGEX.test(msg);
}

/**
 * When the monthly budget refills.
 *
 * The server sums usage since the start of the current UTC month, so the reset
 * is always midnight UTC on the 1st. Naming the actual date beats "next month":
 * a student who hits the cap on the 29th only has to wait two days, and the
 * vague wording made that sound like a month of waiting.
 */
function nextResetLabel(language: AppLanguage): string {
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  try {
    // `AppLanguage` is currently 'en' only; compare loosely so adding 'ms'
    // later needs no change here.
    const locale = String(language) === 'ms' ? 'ms-MY' : 'en-GB';
    return reset.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  } catch {
    return reset.toISOString().slice(0, 10);
  }
}

let alertShowing = false;

/**
 * Show the standard "you've hit your monthly AI limit" alert with an Upgrade
 * CTA that navigates to the subscription plans screen.
 *
 * Safe to call from multiple code paths — if the alert is already on screen we
 * no-op so rapid-fire AI requests don't spawn duplicate dialogs.
 */
export function showMonthlyLimitAlert(language: AppLanguage = 'en'): void {
  if (alertShowing) return;
  alertShowing = true;

  // Only Free users can be sold a Plus trial, and the store already knows that:
  // an existing subscriber is not eligible, so the tagline comes back empty and
  // the dialog keeps its original wording. That saves threading the plan through
  // all eight call sites just to ask a question the store answers better.
  const tagline = localizedTrialTagline(language, 'plus');

  Alert.alert(
    t(language, 'aiMonthlyLimitTitle'),
    [t(language, 'aiMonthlyLimitMessage').replace('{date}', nextResetLabel(language)), tagline]
      .filter(Boolean)
      .join(' '),
    [
      {
        text: t(language, 'aiMonthlyLimitLater'),
        style: 'cancel',
        onPress: () => {
          alertShowing = false;
        },
      },
      {
        text: localizedTrialCta(language, 'plus', t(language, 'aiMonthlyLimitUpgrade')),
        style: 'default',
        onPress: () => {
          alertShowing = false;
          try {
            router.push('/subscription-plans' as never);
          } catch {
            // best-effort navigation; ignore if not mounted yet.
          }
        },
      },
    ],
    {
      cancelable: true,
      onDismiss: () => {
        alertShowing = false;
      },
    },
  );
}

/**
 * Convenience: returns true (and shows the alert) when the error is a monthly
 * limit error. Call sites can branch with `if (handleMonthlyLimit(err, lang)) return;`.
 */
export function handleMonthlyLimit(err: ErrorLike, language: AppLanguage = 'en'): boolean {
  if (isMonthlyLimitError(err)) {
    showMonthlyLimitAlert(language);
    return true;
  }
  return false;
}
