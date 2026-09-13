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

/** True when a DSN is configured, i.e. events will actually be sent. */
export function isMonitoringEnabled(): boolean {
  return !!SENTRY_DSN;
}

/**
 * Attach a breadcrumb to the next event (no-op when monitoring is off).
 *
 * Breadcrumbs are the only context a native crash carries, so keep them free
 * of note contents, tokens and user messages — see the `sendDefaultPii` note
 * in `initMonitoring`.
 */
export function addBreadcrumb(breadcrumb: Sentry.Breadcrumb): void {
  if (!SENTRY_DSN) return;
  Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Supabase/PostgREST failures arrive as plain objects — `{ code, details,
 * hint, message }` — not `Error`s. Sentry can't title, group or stack-trace a
 * bare object, so every one of them lands in a single issue called "Object
 * captured as exception with keys: ...", which real bugs then hide inside.
 */
type SupabaseLikeError = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

function asSupabaseError(value: unknown): SupabaseLikeError | null {
  if (value === null || typeof value !== 'object' || value instanceof Error) return null;
  const candidate = value as SupabaseLikeError;
  return typeof candidate.message === 'string' ? candidate : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// postgrest-js reports a failed fetch as `FetchError: <reason>` with an empty
// `code`; a non-empty code means the server actually answered.
const TRANSIENT_MESSAGE_PATTERNS = [
  'fetcherror',
  'network request failed',
  'networkerror',
  'failed to fetch',
  'load failed',
  'the internet connection appears to be offline',
  'timed out',
  'timeout',
  'aborted',
];

/**
 * True for "the request never reached the server" failures: offline, a flaky
 * connection, a Wi-Fi/cellular handover mid-flight.
 *
 * These are expected in an offline-first app and are already retried, so
 * reporting them buries the failures that actually need a code change.
 */
export function isTransientNetworkError(value: unknown): boolean {
  const supabaseError = asSupabaseError(value);
  if (supabaseError && readString(supabaseError.code)) return false;

  const message = supabaseError
    ? String(supabaseError.message)
    : value instanceof Error
      ? value.message
      : typeof value === 'string'
        ? value
        : '';

  const haystack = message.toLowerCase();
  return haystack.length > 0 && TRANSIENT_MESSAGE_PATTERNS.some((p) => haystack.includes(p));
}

function toReportableError(value: unknown): Error {
  if (value instanceof Error) return value;

  const supabaseError = asSupabaseError(value);
  if (supabaseError) {
    // Lead with the code so Sentry groups a permission failure separately from
    // a constraint violation instead of lumping every Supabase error together.
    const code = readString(supabaseError.code) ?? 'no_code';
    const error = new Error(`[${code}] ${String(supabaseError.message)}`);
    error.name = 'SupabaseError';
    return error;
  }

  if (typeof value === 'string') return new Error(value);
  return new Error(`Non-error value thrown: ${Object.prototype.toString.call(value)}`);
}

/** Report a handled error to Sentry (no-op when monitoring is off). */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!SENTRY_DSN) return;

  const supabaseError = asSupabaseError(error);
  // `details` is deliberately dropped: Postgres puts the offending row's values
  // in there (ids, subject codes), and this app does not send user data.
  const extra = {
    ...(supabaseError
      ? {
          supabase_code: readString(supabaseError.code),
          supabase_hint: readString(supabaseError.hint),
        }
      : {}),
    ...context,
  };

  Sentry.captureException(toReportableError(error), { extra });
}
