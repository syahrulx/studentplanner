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

  Alert.alert(
    t(language, 'aiMonthlyLimitTitle'),
    t(language, 'aiMonthlyLimitMessage'),
    [
      {
        text: t(language, 'aiMonthlyLimitLater'),
        style: 'cancel',
        onPress: () => {
          alertShowing = false;
        },
      },
      {
        text: t(language, 'aiMonthlyLimitUpgrade'),
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
