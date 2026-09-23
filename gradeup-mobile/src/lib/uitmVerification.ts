import { supabase } from './supabase';

/**
 * UiTM matric ownership verification.
 *
 * Timetables are fetched from public UiTM sources using a matric alone, so the
 * request itself proves nothing about who is asking. Before fetching we require
 * an OTP delivered to {matric}@student.uitm.edu.my — the one place only that
 * matric's owner can read.
 *
 * This is a narrower claim than `profiles.student_verified` (Services), which is
 * granted for any institutional-looking address at any university. A Services
 * verification is reused here only when it happens to be a UiTM student address
 * whose local part is the matric being claimed.
 */

const UITM_STUDENT_DOMAIN = 'student.uitm.edu.my';

/** Matric shape UiTM issues — digits only. Keep in sync with the Edge Function regex. */
const MATRIC_RE = /^\d{6,12}$/;

export function isValidMatric(matric: string): boolean {
  return MATRIC_RE.test(matric.trim());
}

export function uitmStudentEmailFor(matric: string): string {
  return `${matric.trim()}@${UITM_STUDENT_DOMAIN}`;
}

/** Matric from a UiTM student address, or null if it is not one. */
export function matricFromUitmStudentEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  if (!e.endsWith(`@${UITM_STUDENT_DOMAIN}`)) return null;
  const local = e.split('@')[0];
  return MATRIC_RE.test(local) ? local : null;
}

/** Mask an address for display: 2024123456@… → 2024***456@student.uitm.edu.my */
export function maskStudentEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || local.length <= 6) return email;
  return `${local.slice(0, 4)}***${local.slice(-3)}@${domain}`;
}

/**
 * The matric this user has already proven, if any.
 *
 * Checked in order of strength:
 * 1. `profiles.verified_matric` — proven through this flow.
 * 2. The signed-in auth email, when it is itself a UiTM student address.
 * 3. An approved Services verification against a UiTM student address.
 */
export async function getVerifiedUitmMatric(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('verified_matric')
    .eq('id', user.id)
    .maybeSingle();

  const stored = (profile as { verified_matric?: string | null } | null)?.verified_matric;
  if (stored && MATRIC_RE.test(stored)) return stored;

  const fromAuthEmail = matricFromUitmStudentEmail(user.email);
  if (fromAuthEmail) return fromAuthEmail;

  const { data: request } = await supabase
    .from('student_verification_requests')
    .select('status, student_email')
    .eq('user_id', user.id)
    .maybeSingle();

  const req = request as { status?: string; student_email?: string } | null;
  if (req?.status === 'approved') {
    const fromRequest = matricFromUitmStudentEmail(req.student_email);
    if (fromRequest) return fromRequest;
  }

  return null;
}

/** True when this exact matric is already proven — no OTP needed. */
export async function isMatricVerified(matric: string): Promise<boolean> {
  const verified = await getVerifiedUitmMatric();
  return verified != null && verified === matric.trim();
}

export type SendMatricOtpResult = 'sent' | 'already_verified';

/** Why a verification step failed, in the terms the student needs to hear it. */
export type MatricOtpErrorCode =
  | 'invalid_matric'
  | 'signed_out'
  | 'offline'
  | 'rate_limited'
  | 'server_down'
  | 'send_failed'
  | 'invalid_code'
  | 'expired'
  | 'locked'
  | 'unknown';

/**
 * Error with a code attached.
 *
 * Both steps used to throw a bare Error, so the screen could only print
 * whatever string came back — "Failed to fetch" for a dead connection,
 * a Postgres message for a locked code. The code is what lets the popup say
 * what happened and what to do about it.
 */
export class MatricOtpError extends Error {
  readonly code: MatricOtpErrorCode;
  constructor(code: MatricOtpErrorCode, message: string) {
    super(message);
    this.name = 'MatricOtpError';
    this.code = code;
  }
}

/** Send a 6-digit code to {matric}@student.uitm.edu.my. */
export async function sendUitmMatricOtp(matric: string): Promise<SendMatricOtpResult> {
  const trimmed = matric.trim();
  if (!isValidMatric(trimmed)) {
    throw new MatricOtpError('invalid_matric', 'That does not look like a UiTM matric number.');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new MatricOtpError('signed_out', 'Sign in to verify your student ID.');

  const fnUrl = `${(supabase as any).supabaseUrl}/functions/v1/send-student-otp`;
  let res: Response;
  try {
    res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: (supabase as any).supabaseKey,
      },
      body: JSON.stringify({
        student_email: uitmStudentEmailFor(trimmed),
        purpose: 'uitm_matric',
      }),
    });
  } catch (e) {
    // fetch only rejects when the request never completed: no network, DNS,
    // TLS. An HTTP error is a resolved response and is handled below.
    throw new MatricOtpError('offline', 'We could not reach Rencana.');
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code: MatricOtpErrorCode =
      res.status === 429 ? 'rate_limited'
      : res.status === 401 || res.status === 403 ? 'signed_out'
      : res.status >= 500 ? 'server_down'
      : 'send_failed';
    throw new MatricOtpError(code, json?.error || 'Could not send the verification code.');
  }
  return json?.status === 'already_verified' ? 'already_verified' : 'sent';
}

export type VerifyMatricOtpResult = {
  status: 'verified' | 'invalid' | 'expired' | 'locked' | 'error';
  matric?: string;
  message?: string;
};

/** Confirm the code and record the matric as owned by this user. */
export async function verifyUitmMatricOtp(code: string): Promise<VerifyMatricOtpResult> {
  const { data, error } = await supabase.rpc('verify_uitm_matric_otp', {
    p_code: code.trim(),
  });
  if (error) throw error;
  return data as VerifyMatricOtpResult;
}

/** A failure, phrased for the student. */
export type MatricOtpProblem = {
  code: MatricOtpErrorCode;
  title: string;
  message: string;
  /** What to do next; shown under the message. */
  hint?: string;
  /** The ID itself is wrong — offer to go back and change it. */
  needsNewId: boolean;
  /** A fresh code is what fixes this. */
  canResend: boolean;
  /**
   * Worth interrupting for. A mistyped code is not: it is already obvious from
   * the boxes clearing, and a popup on every wrong digit is noise.
   */
  blocking: boolean;
};

/** Offline shows up as a rejected fetch, and its message is never presentable. */
function looksOffline(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? '');
  return /network request failed|failed to fetch|network error|timeout|timed out|abort/i.test(m);
}

function problemFor(code: MatricOtpErrorCode, serverMessage?: string): MatricOtpProblem {
  switch (code) {
    case 'invalid_matric':
      return {
        code, title: 'Check your student ID',
        message: 'A UiTM matric number is 6 to 12 digits, like 2024123456.',
        hint: 'Type the digits only — no letters, spaces or dashes.',
        needsNewId: true, canResend: false, blocking: true,
      };
    case 'signed_out':
      return {
        code, title: 'Sign in again',
        message: 'Your session has expired, so we could not confirm who is asking.',
        hint: 'Close this, sign in again, then verify your student ID.',
        needsNewId: false, canResend: false, blocking: true,
      };
    case 'offline':
      return {
        code, title: 'No connection',
        message: 'Rencana could not reach the internet, so the code was not sent.',
        hint: 'Check your Wi-Fi or data, then try again.',
        needsNewId: false, canResend: true, blocking: true,
      };
    case 'rate_limited':
      return {
        code, title: 'Too many tries',
        message: serverMessage || 'You have asked for several codes in a short time.',
        hint: 'Wait a few minutes before asking for another one.',
        needsNewId: false, canResend: false, blocking: true,
      };
    case 'server_down':
      return {
        code, title: 'Rencana is having trouble',
        message: 'The verification service did not respond. This is on our side, not yours.',
        hint: 'Try again in a minute.',
        needsNewId: false, canResend: true, blocking: true,
      };
    case 'send_failed':
      return {
        code, title: 'Code not sent',
        message: serverMessage || 'We could not send a code to that student email.',
        hint: 'Make sure the matric is yours and your UiTM student email is active.',
        needsNewId: true, canResend: true, blocking: true,
      };
    case 'invalid_code':
      return {
        code, title: 'Wrong code',
        message: serverMessage || 'That code does not match the one we sent.',
        hint: 'Check the newest email — an older code stops working once a new one is sent.',
        needsNewId: false, canResend: true, blocking: false,
      };
    case 'expired':
      return {
        code, title: 'Code expired',
        message: serverMessage || 'That code is too old to use.',
        hint: 'Tap Resend code and use the newest email.',
        needsNewId: false, canResend: true, blocking: true,
      };
    case 'locked':
      return {
        code, title: 'Verification locked',
        message: serverMessage || 'Too many wrong codes were entered for this student ID.',
        hint: 'Wait a while before trying again. If this was not you, change your UiTM email password.',
        needsNewId: false, canResend: false, blocking: true,
      };
    default:
      return {
        code: 'unknown', title: 'Something went wrong',
        message: serverMessage || 'We could not finish verifying your student ID.',
        hint: 'Try again. If it keeps happening, contact us from Settings → Help.',
        needsNewId: false, canResend: true, blocking: true,
      };
  }
}

/** Explain a `sendUitmMatricOtp` failure. */
export function describeSendOtpProblem(e: unknown): MatricOtpProblem {
  if (e instanceof MatricOtpError) return problemFor(e.code, e.message);
  if (looksOffline(e)) return problemFor('offline');
  return problemFor('unknown', e instanceof Error ? e.message : undefined);
}

/** Explain a non-verified `verifyUitmMatricOtp` result. */
export function describeVerifyResult(result: VerifyMatricOtpResult): MatricOtpProblem {
  const code: MatricOtpErrorCode =
    result.status === 'invalid' ? 'invalid_code'
    : result.status === 'expired' ? 'expired'
    : result.status === 'locked' ? 'locked'
    : 'unknown';
  return problemFor(code, result.message);
}

/** Explain a `verifyUitmMatricOtp` throw — the RPC never reached Postgres. */
export function describeVerifyProblem(e: unknown): MatricOtpProblem {
  if (e instanceof MatricOtpError) return problemFor(e.code, e.message);
  if (looksOffline(e)) return problemFor('offline');
  return problemFor('unknown', e instanceof Error ? e.message : undefined);
}
