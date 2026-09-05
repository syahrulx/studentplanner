import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { decode } from 'base64-arraybuffer';

function reportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message = typeof value.message === 'string' ? value.message.trim() : '';
    const details = typeof value.details === 'string' ? value.details.trim() : '';
    const hint = typeof value.hint === 'string' ? value.hint.trim() : '';
    if (message) return [message, details, hint].filter(Boolean).join('\n');
    if (typeof value.code === 'string') return `Could not submit the report (${value.code}).`;
  }
  return 'Could not submit the report. Please check your connection and try again.';
}

export async function uploadSupportScreenshot(base64Image: string, ext: string = 'jpeg'): Promise<string> {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) throw new Error('You must be signed in to upload an image.');
  
  const userId = userRes.user.id;
  const filePath = `${userId}/${Date.now()}.${ext}`;
  
  const { error: uploadError } = await supabase.storage
    .from('support-screenshots')
    .upload(filePath, decode(base64Image), {
      contentType: `image/${ext}`,
    });
    
  if (uploadError) throw uploadError;
  
  const { data } = supabase.storage.from('support-screenshots').getPublicUrl(filePath);
  return data.publicUrl;
}

export type UserReportKind =
  | 'bug'
  | 'issue'
  | 'faq'
  | 'app_complaint'
  | 'user_complaint'
  | 'semester_calendar'
  | 'campus_request'
  | 'grading'
  | 'widget'
  | 'other';

export interface SubmitUserReportInput {
  kind: UserReportKind;
  subject: string;
  message: string;
  /** Free-text @handle / email when reporting another user. */
  targetUserHandle?: string;
  /** Optional email or WhatsApp number for fast feedback. */
  contactInfo?: string;
  /** Optional screenshot URL (public URL from support-screenshots bucket). */
  screenshotUrl?: string;
}

function detectPlatform(): 'ios' | 'android' | 'web' | 'other' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'web') return 'web';
  return 'other';
}

function detectAppVersion(): string | null {
  const v =
    (Constants?.expoConfig as { version?: unknown } | null | undefined)?.version ??
    Constants?.nativeAppVersion ??
    null;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Submit through a narrowly scoped SQL function. It derives reporter_id from
 * auth.uid() server-side, so a user cannot create a report for somebody else.
 */
export async function submitUserReport(input: SubmitUserReportInput): Promise<{ id: string }> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const user = userData.user;
  if (!user) throw new Error('You must be signed in to submit a report.');

  const subject = input.subject.trim().slice(0, 200);
  const message = input.message.trim().slice(0, 4000);
  if (!subject) throw new Error('Subject is required.');
  if (!message) throw new Error('Message is required.');

  const targetHandle = (input.targetUserHandle ?? '').trim();

  const { data, error } = await supabase.rpc('submit_my_support_report', {
    p_kind: input.kind,
    p_subject: subject,
    p_message: message,
    p_target_user_handle: targetHandle.length > 0 ? targetHandle.slice(0, 200) : null,
    p_contact_info: input.contactInfo?.trim() || null,
    p_screenshot_url: input.screenshotUrl?.trim() || null,
    p_app_version: detectAppVersion(),
    p_platform: detectPlatform(),
  });

  if (error) throw new Error(reportErrorMessage(error));
  const id = String(data ?? '').trim();
  if (!id) throw new Error('The report was not saved. Please try again.');
  return { id };
}

export { reportErrorMessage };
