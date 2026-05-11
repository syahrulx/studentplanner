import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export type UserReportKind =
  | 'bug'
  | 'issue'
  | 'faq'
  | 'app_complaint'
  | 'user_complaint'
  | 'other';

export interface SubmitUserReportInput {
  kind: UserReportKind;
  subject: string;
  message: string;
  /** Free-text @handle / email when reporting another user. */
  targetUserHandle?: string;
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
 * Insert a user-submitted report. Requires an authenticated session; RLS only
 * allows the reporter to insert rows where reporter_id = auth.uid().
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

  // Best-effort snapshot of the user's current display name (profile row may
  // not always be loaded yet; we silently fall back to auth metadata).
  let displayName: string | null = null;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .maybeSingle();
    const name = (profile as { name?: string | null } | null)?.name;
    if (typeof name === 'string' && name.trim().length > 0) {
      displayName = name.trim();
    }
  } catch {
    /* swallow — snapshot fields are best-effort */
  }
  if (!displayName) {
    const metaName = (user.user_metadata as Record<string, unknown> | null | undefined)?.name;
    if (typeof metaName === 'string' && metaName.trim().length > 0) {
      displayName = metaName.trim();
    }
  }

  const targetHandle = (input.targetUserHandle ?? '').trim();

  const { data, error } = await supabase
    .from('support_reports')
    .insert({
      reporter_id: user.id,
      reporter_name_snapshot: displayName,
      reporter_email_snapshot: user.email ?? null,
      kind: input.kind,
      subject,
      message,
      target_user_handle: targetHandle.length > 0 ? targetHandle.slice(0, 200) : null,
      app_version: detectAppVersion(),
      platform: detectPlatform(),
    })
    .select('id')
    .single();

  if (error) throw error;
  return { id: String((data as { id?: string } | null)?.id ?? '') };
}
