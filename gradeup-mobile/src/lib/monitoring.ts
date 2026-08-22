import * as Sentry from '@sentry/react-native';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

// Inlined at build time; monitoring is a silent no-op until the DSN is
// configured (locally in .env, in CI as an EAS secret).
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initMonitoring(): void {
  if (!SENTRY_DSN) return;
  const version = Application.nativeApplicationVersion;
  const build = Application.nativeBuildVersion;
  Sentry.init({
    dsn: SENTRY_DSN,
    // Tag every event with the store release/build so crash spikes can be
    // pinned to a specific version. Null on web, where Sentry falls back to
    // its own defaults.
    release: version ? `rencana@${version}${build ? `+${build}` : ''}` : undefined,
    dist: build ?? undefined,
    environment: __DEV__ ? 'development' : 'production',
    // Crash/error reporting only for now — tracing and replay stay off until
    // there's an explicit budget decision for them.
    tracesSampleRate: 0,
    // Never attach user IP/device identifiers, and never log note contents,
    // tokens, or user messages via captureMessage/breadcrumbs.
    sendDefaultPii: false,
  });
  Sentry.setTag('platform_os', Platform.OS);
}

/** Report a handled error to Sentry (no-op when monitoring is off). */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!SENTRY_DSN) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
