import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export function getServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

export type AuthorizeOk = {
  admin: SupabaseClient;
  /** Auth user id of the admin making the request. `null` when authed via ADMIN_WEB_DEV_SECRET. */
  adminUserId: string | null;
  /** Admin row (undefined for dev-secret calls; cached after the DB lookup). */
  adminRole: 'super_admin' | 'staff' | null;
  /** `true` when the call was authenticated via the dev bypass secret. */
  viaDevSecret: boolean;
};

export type AuthorizeErr = { error: string; status: number };

/** Admin JWT, or Bearer token matching ADMIN_WEB_DEV_SECRET (local dev only). */
export async function authorizeAdminRequest(req: Request): Promise<AuthorizeOk | AuthorizeErr> {
  const admin = getServiceClient();
  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const devSecret = (Deno.env.get('ADMIN_WEB_DEV_SECRET') || '').trim();

  if (devSecret && bearer === devSecret) {
    return { admin, adminUserId: null, adminRole: null, viaDevSecret: true };
  }

  if (!bearer) return { error: 'missing_jwt', status: 401 };

  const { data: userRes, error: userErr } = await admin.auth.getUser(bearer);
  if (userErr || !userRes?.user) return { error: 'invalid_jwt', status: 401 };

  const uid = userRes.user.id;
  const { data: adminRow } = await admin
    .from('admin_users')
    .select('role,disabled')
    .eq('user_id', uid)
    .maybeSingle();
  if (!adminRow || adminRow.disabled) return { error: 'not_admin', status: 403 };

  return {
    admin,
    adminUserId: uid,
    adminRole: (adminRow.role as 'super_admin' | 'staff') ?? 'staff',
    viaDevSecret: false,
  };
}
