import { supabase } from './supabase';

/** True when this account is a GradeUp admin (admin_users, not disabled). Matches DB `is_admin()` for plan changes. */
export async function fetchIsGradeUpAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('disabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return false;
  return data.disabled !== true;
}
