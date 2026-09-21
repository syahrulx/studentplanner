/**
 * Turn an Edge Function error envelope into copy a student can actually act on.
 *
 * Every AI function under supabase/functions/* answers failures as
 * `{ error: { message, code } }`, and `message` is written for whoever deploys
 * the project: it names env vars, bucket policies and CLI commands. Those
 * strings used to reach the user unedited — a student who picked a PDF was told
 * "Set the secret on the server: npx supabase secrets set OPENAI_API_KEY=sk-...",
 * an instruction they cannot follow and should never have seen.
 *
 * So: screens branch on the `code`, never on the message, and the raw detail
 * goes to the dev console only. `code` is also the more accurate signal — the
 * client used to treat every `OPENAI` code as "the key is missing", when that
 * code is returned for any OpenAI failure including rate limits and timeouts.
 */
import { Alert } from 'react-native';
import { t, type TranslationKey } from '@/src/i18n';
import { captureError } from '@/src/lib/monitoring';
import type { AppLanguage } from '@/src/storage';

export type AiErrorLike = { message?: string | null; code?: string | null } | null | undefined;

type Copy = { title: TranslationKey; body: TranslationKey };

const GENERIC: Copy = { title: 'aiErrorTitle', body: 'aiErrorGeneric' };
const SESSION: Copy = { title: 'signInRequired', body: 'aiErrorSession' };

/**
 * Codes come from the `errorBody(...)`/`errorJson(...)` helpers in the Edge
 * Functions, plus the few the client invents when a call never reaches them
 * (NO_SESSION, INVOKE_FAILED, INVALID_RESPONSE).
 */
const BY_CODE: Record<string, Copy> = {
  // Server-side misconfiguration: missing or placeholder secrets. The student
  // can do nothing about it, so don't hand them a shell command — say it's ours.
  CONFIG: { title: 'aiErrorTitle', body: 'aiErrorUnavailable' },
  // Any non-2xx from OpenAI: rate limit, timeout, model error, bad key.
  OPENAI: { title: 'aiErrorTitle', body: 'aiErrorService' },
  INTERNAL: { title: 'aiErrorTitle', body: 'aiErrorService' },
  INVOKE_FAILED: { title: 'aiErrorTitle', body: 'aiErrorService' },
  INVALID_RESPONSE: { title: 'aiErrorTitle', body: 'aiErrorService' },

  UNAUTHORIZED: SESSION,
  NO_SESSION: SESSION,
  FORBIDDEN: SESSION,

  STORAGE: { title: 'aiErrorTitle', body: 'aiErrorFileUnreadable' },
  TOO_LARGE: { title: 'aiErrorTitle', body: 'aiErrorTooLarge' },

  // The file opened but carried no usable text layer — the one failure the
  // student can actually fix, so this copy tells them how.
  PDF_READ: { title: 'aiErrorTitle', body: 'aiErrorNoText' },
  PDF_TEXT: { title: 'aiErrorTitle', body: 'aiErrorNoText' },
  EMPTY_EXTRACTION: { title: 'aiErrorTitle', body: 'aiErrorNoText' },

  PARSE: { title: 'aiErrorTitle', body: 'aiErrorUnreadableDoc' },
  DB: { title: 'aiErrorTitle', body: 'aiErrorSaveFailed' },
  BAD_REQUEST: GENERIC,
};

/**
 * Last resort when the envelope carried no code — older deploys and the raw
 * gateway errors from supabase-js only give us a sentence.
 */
function copyFromMessage(message: string): Copy {
  if (/invalid jwt|jwt.*invalid|unauthoriz|not authenticated/i.test(message)) return SESSION;
  if (/openai|api key|rate limit|timed? ?out/i.test(message)) return { title: 'aiErrorTitle', body: 'aiErrorService' };
  if (/bucket|storage|download/i.test(message)) return { title: 'aiErrorTitle', body: 'aiErrorFileUnreadable' };
  if (/scanned|image-only|no readable text|text layer/i.test(message)) return { title: 'aiErrorTitle', body: 'aiErrorNoText' };
  if (/too large|exceeds/i.test(message)) return { title: 'aiErrorTitle', body: 'aiErrorTooLarge' };
  return GENERIC;
}

/** Map an Edge Function error onto the localized title/body a user should see. */
export function describeAiError(
  err: AiErrorLike,
  language: AppLanguage = 'en',
): { title: string; message: string } {
  const code = String(err?.code ?? '').toUpperCase();
  const message = String(err?.message ?? '');
  const copy = BY_CODE[code] ?? (message ? copyFromMessage(message) : GENERIC);
  return { title: t(language, copy.title), message: t(language, copy.body) };
}

/**
 * Put the real failure where developers look.
 *
 * In dev that's the console, with the full server message. In release it's
 * Sentry, with the code only: some server messages quote the student's own
 * document back (EMPTY_EXTRACTION embeds a text preview), and monitoring.ts
 * promises never to ship note contents. The code plus HTTP status is what
 * actually answers "why is extraction failing" anyway — a wave of CONFIG means
 * a secret is unset, OPENAI means the model call itself is failing.
 */
export function logAiError(tag: string, err: AiErrorLike, extra?: Record<string, unknown>): void {
  const code = String(err?.code ?? '').toUpperCase() || 'UNKNOWN';
  if (__DEV__) {
    console.warn(`[${tag}] AI request failed`, { code, message: err?.message ?? null, ...extra });
    return;
  }
  captureError(new Error(`AI request failed (${tag}): ${code}`), { tag, code, ...extra });
}

/**
 * The usual one-liner for a call site: log the developer detail, show the user
 * a clean dialog. Callers must still handle the monthly-token-limit error
 * first (see `isMonthlyLimitError`) — that one has its own upgrade dialog.
 */
export function alertAiError(
  tag: string,
  err: AiErrorLike,
  language: AppLanguage = 'en',
  extra?: Record<string, unknown>,
): void {
  logAiError(tag, err, extra);
  const { title, message } = describeAiError(err, language);
  Alert.alert(title, message);
}
