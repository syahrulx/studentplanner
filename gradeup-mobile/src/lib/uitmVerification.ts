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

/** Send a 6-digit code to {matric}@student.uitm.edu.my. */
export async function sendUitmMatricOtp(matric: string): Promise<SendMatricOtpResult> {
  const trimmed = matric.trim();
  if (!isValidMatric(trimmed)) {
    throw new Error('That does not look like a UiTM matric number.');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in to verify your student ID.');

  const fnUrl = `${(supabase as any).supabaseUrl}/functions/v1/send-student-otp`;
  const res = await fetch(fnUrl, {
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

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Could not send the verification code.');
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
