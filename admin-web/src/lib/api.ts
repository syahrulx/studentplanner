import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

const bypassAuth = import.meta.env.VITE_BYPASS_ADMIN_AUTH === 'true';
const devSecret = String(import.meta.env.VITE_ADMIN_WEB_DEV_SECRET || '').trim();

/** Prefer logged-in JWT; with bypass + VITE_ADMIN_WEB_DEV_SECRET, use dev token (must match Edge secret ADMIN_WEB_DEV_SECRET). */
export async function adminInvokeHeaders(): Promise<Record<string, string>> {
  const { data: sessionRes } = await supabase.auth.getSession();
  const token = sessionRes.session?.access_token;
  if (token) return { Authorization: `Bearer ${token}` };
  if (bypassAuth && devSecret) return { Authorization: `Bearer ${devSecret}` };
  throw new Error('Not logged in');
}

async function hasSessionJwt(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session?.access_token);
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  const anyErr = err as any;
  if (anyErr && typeof anyErr === 'object' && typeof anyErr.message === 'string') return new Error(anyErr.message);
  return new Error(typeof err === 'string' ? err : JSON.stringify(err));
}

function shouldFallbackInvokeOnFetchFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
  return (
    /failed to fetch|networkerror|load failed|network request failed|aborted|failed to send/i.test(msg) ||
    name === 'FunctionsFetchError'
  );
}

/** Prefer plain `fetch` (SDK invoke is flaky in some browsers); on network failure only, retry `functions.invoke`. */
async function invokeEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ data: unknown; error: Error | null }> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${functionName}`;

  const parseBody = async (res: Response): Promise<{ data: unknown; error: Error | null }> => {
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      return { data: null, error: new Error(`${functionName}: invalid JSON (${res.status})`) };
    }
    if (!res.ok) {
      const errMsg =
        json && typeof json === 'object' && json !== null && 'error' in json
          ? String((json as { error: string }).error)
          : `HTTP ${res.status}`;
      return { data: null, error: new Error(`${functionName}: ${errMsg}`) };
    }
    return { data: json, error: null };
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: headers.Authorization,
      },
      body: JSON.stringify(body),
    });
    return parseBody(res);
  } catch (e) {
    if (!shouldFallbackInvokeOnFetchFailure(e)) {
      return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
    }
  }

  const sdk = await supabase.functions.invoke(functionName, { body, headers });
  if (!sdk.error) return { data: sdk.data, error: null };
  return { data: sdk.data, error: sdk.error as Error };
}

function unwrapFunctionData<T>(data: unknown, fnError: unknown): T {
  if (fnError) throw fnError;
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

export type AdminRole = 'super_admin' | 'staff';

export type AdminProfile = {
  uid: string;
  email: string;
  role: AdminRole;
  disabled?: boolean;
};

export async function getMyAdminProfile(): Promise<AdminProfile> {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not logged in');

  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id,email,role,disabled')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Not an admin.');
  return { uid: data.user_id, email: data.email, role: data.role, disabled: data.disabled };
}

export type DashboardOverview = {
  total_users: number;
  total_universities: number;
  total_courses: number;
  total_timetables: number;
};

function normalizeOverviewRpc(raw: unknown): DashboardOverview {
  const o =
    typeof raw === 'string'
      ? (JSON.parse(raw) as Record<string, unknown>)
      : (raw as Record<string, unknown>);
  return {
    total_users: Number(o.total_users),
    total_universities: Number(o.total_universities),
    total_courses: Number(o.total_courses ?? 0),
    total_timetables: Number(o.total_timetables),
  };
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const { data: sessionRes } = await supabase.auth.getSession();
  const hasJwt = Boolean(sessionRes.session?.access_token);

  if (hasJwt) {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_dashboard_overview');
    if (!rpcErr && rpcData != null) {
      try {
        return normalizeOverviewRpc(rpcData);
      } catch {
        /* fall through */
      }
    }
    // If RPC failed, don't try Edge Function (Edge calls are currently failing for you).
    // This error message will usually tell us what's missing (migration, policies, etc.).
    if (rpcErr) throw toError(rpcErr);
    throw new Error('Failed to load dashboard overview');
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_users', { action: 'dashboard_overview' }, headers);
  return unwrapFunctionData<DashboardOverview>(data, error);
}

export type CourseUsageRow = {
  course_id: string;
  course_name: string | null;
  user_count: number;
};

export async function getCourseUsageTop(limit = 10): Promise<CourseUsageRow[]> {
  const { data, error } = await supabase.rpc('admin_course_usage_top', { limit_count: limit });
  if (error) throw toError(error);
  const arr = data as unknown;
  if (!Array.isArray(arr)) return [];
  return arr as CourseUsageRow[];
}

export type AiTokenUsagePoint = {
  name: string; // YYYY-MM-DD
  tokens: number;
};

export async function getAiTokenUsageSeriesLast14Days(): Promise<AiTokenUsagePoint[]> {
  // Last 14 days, including today.
  const now = new Date();
  const days: Array<{ key: string; name: string }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    days.push({ key, name: key });
  }

  const since = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000).toISOString();

  // Uses RLS (admin policy) so no Edge Function required.
  const { data, error } = await supabase
    .from('ai_token_usage')
    .select('created_at,total_tokens')
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  if (error) throw toError(error);

  const totalsByDay = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ created_at: string; total_tokens: number | null }>) {
    const dayKey = new Date(row.created_at).toISOString().slice(0, 10);
    const prev = totalsByDay.get(dayKey) ?? 0;
    totalsByDay.set(dayKey, prev + (row.total_tokens ?? 0));
  }

  return days.map((d) => ({ name: d.name, tokens: totalsByDay.get(d.key) ?? 0 }));
}

export type SubscriptionPlan = 'free' | 'plus' | 'pro';

export const SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = ['free', 'plus', 'pro'] as const;

export function normalizeSubscriptionPlan(raw: string | null | undefined): SubscriptionPlan {
  if (raw === 'plus' || raw === 'pro') return raw;
  return 'free';
}

export type AdminUserRow = {
  id: string;
  name: string | null;
  student_id: string | null;
  university_id: string | null;
  status: 'active' | 'disabled' | 'banned';
  subscription_plan: SubscriptionPlan;
  created_at: string;
  updated_at?: string | null;
};

function mapAdminUserRows(rows: unknown[]): AdminUserRow[] {
  return (rows as Array<Partial<AdminUserRow> & { subscription_plan?: string | null }>).map((r) => ({
    id: String(r.id ?? ''),
    name: r.name ?? null,
    student_id: r.student_id ?? null,
    university_id: r.university_id ?? null,
    status: (r.status as AdminUserRow['status']) ?? 'active',
    subscription_plan: normalizeSubscriptionPlan(r.subscription_plan),
    created_at: String(r.created_at ?? ''),
    updated_at: r.updated_at ?? null,
  }));
}

export async function listUsers(opts: {
  query?: string;
  universityId?: string;
  plan?: 'all' | SubscriptionPlan;
  limit?: number;
  offset?: number;
}) {
  if (await hasSessionJwt()) {
    const limit = Math.max(1, Math.min(200, Number(opts.limit ?? 50)));
    const offset = Math.max(0, Number(opts.offset ?? 0));
    const plan = opts.plan ?? 'all';
    let query = supabase
      .from('profiles')
      .select('id,name,student_id,university_id,created_at,status,updated_at,subscription_plan', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    const q = (opts.query ?? '').trim();
    const universityId = (opts.universityId ?? '').trim();
    if (universityId) query = query.eq('university_id', universityId);
    if (plan === 'free' || plan === 'plus' || plan === 'pro') query = query.eq('subscription_plan', plan);
    if (q) {
      // Strip PostgREST `or(...)` control chars so users can't break out of
      // the grouped filter and inject additional clauses (e.g. `),email.ilike.%`).
      const safe = q.replace(/[,():*\\%]/g, ' ').trim();
      if (safe) query = query.or(`name.ilike.%${safe}%,student_id.ilike.%${safe}%`);
    }
    const { data, error, count } = await query;
    if (error) throw toError(error);
    return {
      items: mapAdminUserRows(data ?? []),
      count: count ?? 0,
      offset,
      limit,
    };
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_users', { action: 'list', ...opts }, headers);
  const res = unwrapFunctionData<{ items: AdminUserRow[]; count: number; offset: number; limit: number }>(data, error);
  return { ...res, items: mapAdminUserRows(res.items as unknown[]) };
}

export async function setUserStatus(userId: string, status: AdminUserRow['status']) {
  // Always route through the Edge Function so the audit row is written
  // server-side with the acting admin's uid (prevents self-reported logs
  // from the browser).
  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_users', { action: 'set_status', userId, status }, headers);
  return unwrapFunctionData<{ ok: boolean }>(data, error);
}

export async function setUserSubscriptionPlan(userId: string, subscription_plan: SubscriptionPlan) {
  // Always route through the Edge Function so the audit row is written
  // server-side with the acting admin's uid.
  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_users',
    { action: 'set_subscription_plan', userId, subscription_plan },
    headers,
  );
  return unwrapFunctionData<{ ok: boolean }>(data, error);
}

export type SubscriptionFeatureRow = {
  id: string;
  tier: SubscriptionPlan;
  label: string;
  enabled: boolean;
  sort_order: number;
};

async function persistSubscriptionTierFeaturesDb(
  tier: SubscriptionPlan,
  items: Array<{ id: string; label: string; enabled: boolean }>,
) {
  const trimmed = items
    .map((it) => ({ ...it, label: it.label.trim() }))
    .filter((it) => it.label.length > 0);
  const rows = trimmed.map((it, i) => ({
    id: it.id,
    tier,
    label: it.label.slice(0, 2000),
    enabled: Boolean(it.enabled),
    sort_order: i,
  }));
  const { data: existing, error: e1 } = await supabase.from('subscription_plan_features').select('id').eq('tier', tier);
  if (e1) throw toError(e1);
  const keep = new Set(rows.map((r) => r.id));
  const toDelete = ((existing ?? []) as Array<{ id: string }>).map((r) => r.id).filter((id) => !keep.has(id));
  if (toDelete.length) {
    const { error: e2 } = await supabase.from('subscription_plan_features').delete().in('id', toDelete);
    if (e2) throw toError(e2);
  }
  if (rows.length) {
    const { error: e3 } = await supabase.from('subscription_plan_features').upsert(rows, { onConflict: 'id' });
    if (e3) throw toError(e3);
  }
}

export async function listSubscriptionPlanFeatures(): Promise<SubscriptionFeatureRow[]> {
  if (await hasSessionJwt()) {
    const { data, error } = await supabase
      .from('subscription_plan_features')
      .select('id,tier,label,enabled,sort_order')
      .order('tier', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) throw toError(error);
    return (data ?? []) as SubscriptionFeatureRow[];
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_data', { action: 'subscription_plan_features_list' }, headers);
  const res = unwrapFunctionData<{ items: SubscriptionFeatureRow[] }>(data, error);
  return res.items ?? [];
}

export async function saveSubscriptionPlanTierFeatures(
  tier: SubscriptionPlan,
  items: Array<{ id: string; label: string; enabled: boolean }>,
): Promise<{ ok: true }> {
  if (await hasSessionJwt()) {
    await persistSubscriptionTierFeaturesDb(tier, items);
    return { ok: true as const };
  }

  const trimmed = items
    .map((it) => ({ ...it, label: it.label.trim() }))
    .filter((it) => it.label.length > 0);
  const rows = trimmed.map((it, i) => ({
    id: it.id,
    tier,
    label: it.label.slice(0, 2000),
    enabled: Boolean(it.enabled),
    sort_order: i,
  }));

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_data',
    { action: 'subscription_plan_features_save', tier, items: rows },
    headers,
  );
  unwrapFunctionData<{ ok: boolean }>(data, error);
  return { ok: true as const };
}

export async function saveAllSubscriptionPlanFeatures(
  byTier: Record<SubscriptionPlan, Array<{ id: string; label: string; enabled: boolean }>>,
): Promise<{ ok: true }> {
  for (const tier of SUBSCRIPTION_PLANS) {
    await saveSubscriptionPlanTierFeatures(tier, byTier[tier] ?? []);
  }
  return { ok: true as const };
}

export async function deleteUser(userId: string) {
  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_users', { action: 'delete', userId }, headers);
  return unwrapFunctionData<{ ok: boolean }>(data, error);
}

export type UniversityRow = {
  id: string;
  name: string;
  api_endpoint: string | null;
  login_method: 'manual' | 'api';
  request_method: 'GET' | 'POST';
  required_params: unknown;
  response_sample?: unknown;
};

export async function listUniversities() {
  if (await hasSessionJwt()) {
    const { data, error } = await supabase
      .from('universities')
      .select('id,name,api_endpoint,login_method,request_method,required_params,response_sample')
      .order('name', { ascending: true });
    if (error) throw toError(error);
    return (data ?? []) as UniversityRow[];
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_data', { action: 'universities_list' }, headers);
  const res = unwrapFunctionData<{ items: UniversityRow[] }>(data, error);
  return res.items;
}

export async function upsertUniversity(row: UniversityRow) {
  if (await hasSessionJwt()) {
    const { data, error } = await supabase.from('universities').upsert(row).select().single();
    if (error) throw toError(error);
    return data as UniversityRow;
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_data', { action: 'university_upsert', row }, headers);
  const res = unwrapFunctionData<{ row: UniversityRow }>(data, error);
  return res.row;
}

export async function deleteUniversity(id: string) {
  if (await hasSessionJwt()) {
    const { error } = await supabase.from('universities').delete().eq('id', id);
    if (error) throw toError(error);
    return;
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_data', { action: 'university_delete', id }, headers);
  unwrapFunctionData<{ ok: boolean }>(data, error);
}

export async function testFetch(universityId: string, params: Record<string, unknown>) {
  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_data', { action: 'test_fetch', universityId, params }, headers);
  return unwrapFunctionData<{ ok: boolean; httpStatus: number; elapsedMs: number; data: unknown }>(data, error);
}

export async function getMapping(universityId: string) {
  if (await hasSessionJwt()) {
    const { data, error } = await supabase
      .from('university_mappings')
      .select('university_id,timetable_mapping')
      .eq('university_id', universityId)
      .maybeSingle();
    if (error) throw toError(error);
    return data as { university_id: string; timetable_mapping: unknown } | null;
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_data', { action: 'mapping_get', universityId }, headers);
  const res = unwrapFunctionData<{ mapping: { university_id: string; timetable_mapping: unknown } | null }>(data, error);
  return res.mapping;
}

export async function saveMapping(universityId: string, timetable_mapping: unknown) {
  if (await hasSessionJwt()) {
    const { data, error } = await supabase
      .from('university_mappings')
      .upsert({ university_id: universityId, timetable_mapping })
      .select()
      .single();
    if (error) throw toError(error);
    return data as { university_id: string; timetable_mapping: unknown };
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_data',
    { action: 'mapping_save', universityId, timetable_mapping },
    headers,
  );
  const res = unwrapFunctionData<{ mapping: { university_id: string; timetable_mapping: unknown } }>(data, error);
  return res.mapping;
}

export type AdminLogRow = {
  id: string;
  type: 'api_request' | 'failed_login' | 'error';
  status: 'success' | 'failed';
  meta: unknown;
  created_at: string;
};

export async function listAdminLogs(opts: { type?: string; status?: string; limit?: number }) {
  if (await hasSessionJwt()) {
    const lim = Math.max(1, Math.min(500, Number(opts.limit ?? 200)));
    const type = opts.type ?? 'all';
    const status = opts.status ?? 'all';
    let q = supabase.from('admin_logs').select('id,type,status,meta,created_at').order('created_at', { ascending: false }).limit(lim);
    if (type !== 'all') q = q.eq('type', type);
    if (status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw toError(error);
    return (data ?? []) as AdminLogRow[];
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_data',
    {
      action: 'logs_list',
      type: opts.type ?? 'all',
      status: opts.status ?? 'all',
      limit: opts.limit ?? 200,
    },
    headers,
  );
  const res = unwrapFunctionData<{ items: AdminLogRow[] }>(data, error);
  return res.items;
}

export type TimetableEntryRow = {
  id: string;
  user_id: string;
  day: string;
  subject_code: string;
  subject_name: string;
  lecturer: string;
  start_time: string;
  end_time: string;
  location: string;
  display_name?: string | null;
  slot_color?: string | null;
  group_name?: string | null;
  semester_label?: string | null;
};

export type TimetableUserSummaryRow = {
  user_id: string;
  entry_count: number;
  profile: {
    id: string;
    name: string | null;
    student_id: string | null;
    university_id: string | null;
  } | null;
};

export type AttendanceUserSummaryRow = {
  user_id: string;
  total: number;
  present: number;
  absent: number;
  cancelled: number;
  present_rate: number; // 0..1
  last_days: number;
  last_present_rate: number; // 0..1
  profile: {
    id: string;
    name: string | null;
    student_id: string | null;
    university_id: string | null;
  } | null;
};

export type AttendanceEventRow = {
  id: string;
  user_id: string;
  timetable_entry_id: string;
  scheduled_start_at: string;
  status: 'present' | 'absent' | 'cancelled';
  recorded_at: string;
  source: string;
  subject_code: string;
  subject_name: string;
};

async function aggregateTimetableUserCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const batch = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.from('timetable_entries').select('user_id').range(offset, offset + batch - 1);
    if (error) throw toError(error);
    const chunk = (data ?? []) as { user_id: string }[];
    for (const r of chunk) {
      counts.set(r.user_id, (counts.get(r.user_id) || 0) + 1);
    }
    if (chunk.length < batch) break;
    offset += batch;
    if (offset > 120_000) break;
  }
  return counts;
}

export async function listTimetableUsersSummary(): Promise<TimetableUserSummaryRow[]> {
  if (await hasSessionJwt()) {
    const counts = await aggregateTimetableUserCounts();
    const userIds = Array.from(counts.keys());
    if (!userIds.length) return [];
    const { data: profs, error } = await supabase
      .from('profiles')
      .select('id,name,student_id,university_id')
      .in('id', userIds);
    if (error) throw toError(error);
    const pmap = new Map((profs ?? []).map((p) => [p.id, p]));
    const users = userIds.map((id) => ({
      user_id: id,
      entry_count: counts.get(id) ?? 0,
      profile: (pmap.get(id) as TimetableUserSummaryRow['profile']) ?? null,
    }));
    users.sort((a, b) => b.entry_count - a.entry_count);
    return users;
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_data', { action: 'timetables_users_summary' }, headers);
  const res = unwrapFunctionData<{ users: TimetableUserSummaryRow[] }>(data, error);
  return res.users;
}

const TIMETABLE_ENTRY_SELECT =
  'id,user_id,day,subject_code,subject_name,lecturer,start_time,end_time,location,display_name,slot_color,group_name,semester_label';

export async function listTimetableEntries(opts: { userId?: string; universityId?: string; limit?: number }) {
  if (await hasSessionJwt()) {
    const lim = Math.max(1, Math.min(500, Number(opts.limit ?? 200)));
    const userId = opts.userId?.trim() || '';
    const universityId = opts.universityId?.trim() || '';
    let q = supabase.from('timetable_entries').select(TIMETABLE_ENTRY_SELECT);
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q.limit(lim);
    if (error) throw toError(error);
    let items = (data ?? []) as TimetableEntryRow[];
    if (universityId) {
      const ids = Array.from(new Set(items.map((x) => x.user_id)));
      if (ids.length) {
        const { data: profs, error: pe } = await supabase.from('profiles').select('id,university_id').in('id', ids);
        if (pe) throw toError(pe);
        const map = new Map((profs ?? []).map((p) => [p.id, p.university_id]));
        items = items.filter((t) => map.get(t.user_id) === universityId);
      }
    }
    return items;
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_data',
    {
      action: 'timetables_list',
      userId: opts.userId?.trim() || '',
      universityId: opts.universityId?.trim() || '',
      limit: opts.limit ?? 200,
    },
    headers,
  );
  const res = unwrapFunctionData<{ items: TimetableEntryRow[] }>(data, error);
  return res.items;
}

export async function listAttendanceUserSummary(opts?: { limit?: number; sinceDays?: number }): Promise<AttendanceUserSummaryRow[]> {
  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_data',
    {
      action: 'attendance_user_summary',
      limit: opts?.limit ?? 200,
      sinceDays: opts?.sinceDays ?? 14,
    },
    headers,
  );
  const res = unwrapFunctionData<{ items: AttendanceUserSummaryRow[] }>(data, error);
  return res.items ?? [];
}

export async function listAttendanceUserEvents(opts: {
  userId: string;
  limit?: number;
  from?: string;
  to?: string;
}): Promise<AttendanceEventRow[]> {
  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_data',
    {
      action: 'attendance_user_events',
      userId: opts.userId,
      limit: opts.limit ?? 200,
      from: opts.from ?? '',
      to: opts.to ?? '',
    },
    headers,
  );
  const res = unwrapFunctionData<{ items: AttendanceEventRow[] }>(data, error);
  return res.items ?? [];
}

export type PublicLocationProfile = {
  id: string;
  name: string | null;
  student_id: string | null;
  university_id: string | null;
};

export type PublicLocationRow = {
  user_id: string;
  latitude: number;
  longitude: number;
  place_name: string | null;
  visibility: string;
  updated_at: string;
  profile: PublicLocationProfile | null;
};

export async function listPublicUserLocations(opts?: { limit?: number }) {
  if (await hasSessionJwt()) {
    const lim = Math.max(1, Math.min(500, Number(opts?.limit ?? 200)));
    const { data: locs, error } = await supabase
      .from('user_locations')
      .select('user_id,latitude,longitude,place_name,visibility,updated_at')
      .eq('visibility', 'public')
      .order('updated_at', { ascending: false })
      .limit(lim);
    if (error) throw toError(error);
    const ids = Array.from(new Set((locs ?? []).map((l: { user_id: string }) => l.user_id)));
    if (!ids.length) return [] as PublicLocationRow[];
    const { data: profs, error: pe } = await supabase
      .from('profiles')
      .select('id,name,student_id,university_id')
      .in('id', ids);
    if (pe) throw toError(pe);
    const pmap = new Map((profs ?? []).map((p: PublicLocationProfile) => [p.id, p]));
    return (locs ?? []).map((l) => ({
      ...(l as Omit<PublicLocationRow, 'profile'>),
      profile: pmap.get((l as { user_id: string }).user_id) ?? null,
    })) as PublicLocationRow[];
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_data',
    { action: 'public_locations_list', limit: opts?.limit ?? 200 },
    headers,
  );
  const res = unwrapFunctionData<{ items: PublicLocationRow[] }>(data, error);
  return res.items;
}

export type AdminCircleRow = {
  id: string;
  name: string;
  emoji: string | null;
  invite_code: string;
  created_by: string;
  created_at: string;
  member_count: number;
};

export type AdminCircleMemberRow = {
  circle_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  profile: { id: string; name: string | null; student_id: string | null; university_id: string | null; avatar_url?: string | null } | null;
};

export async function listCircles(opts?: { query?: string; limit?: number }) {
  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_data',
    { action: 'circles_list', query: opts?.query ?? '', limit: opts?.limit ?? 200 },
    headers,
  );
  const res = unwrapFunctionData<{ items: AdminCircleRow[] }>(data, error);
  return res.items;
}

export async function listCircleMembers(opts: { circleId: string; limit?: number }) {
  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_data',
    { action: 'circle_members_list', circleId: opts.circleId, limit: opts.limit ?? 500 },
    headers,
  );
  const res = unwrapFunctionData<{ items: AdminCircleMemberRow[] }>(data, error);
  return res.items;
}

export async function updateCircle(opts: { id: string; name: string; emoji?: string }) {
  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_data',
    { action: 'circle_update', id: opts.id, name: opts.name, emoji: opts.emoji ?? '' },
    headers,
  );
  const res = unwrapFunctionData<{ row: AdminCircleRow }>(data, error);
  return res.row;
}

export async function removeCircleMember(opts: { circleId: string; userId: string }) {
  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_data',
    { action: 'circle_member_remove', circleId: opts.circleId, userId: opts.userId },
    headers,
  );
  unwrapFunctionData<{ ok: boolean }>(data, error);
}

export async function deleteCircleAdmin(opts: { id: string }) {
  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_data', { action: 'circle_delete', id: opts.id }, headers);
  unwrapFunctionData<{ ok: boolean }>(data, error);
}

export async function deleteTimetableEntry(id: string, userId: string) {
  if (await hasSessionJwt()) {
    const { error } = await supabase.from('timetable_entries').delete().eq('id', id).eq('user_id', userId);
    if (!error) return;
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_data', { action: 'timetable_delete', id, userId }, headers);
  unwrapFunctionData<{ ok: boolean }>(data, error);
}

export async function insertTimetableEntry(opts: {
  userId: string;
  id?: string;
  day: string;
  subject_code: string;
  subject_name: string;
  lecturer: string;
  start_time: string;
  end_time: string;
  location: string;
  group_name?: string | null;
  semester_label?: string | null;
  display_name?: string | null;
  slot_color?: string | null;
}): Promise<TimetableEntryRow> {
  const id = (opts.id ?? crypto.randomUUID()).trim();
  const row = {
    id,
    user_id: opts.userId,
    day: opts.day.trim(),
    subject_code: opts.subject_code.trim(),
    subject_name: opts.subject_name.trim(),
    lecturer: (opts.lecturer || '-').trim() || '-',
    start_time: opts.start_time.trim(),
    end_time: opts.end_time.trim(),
    location: (opts.location || '-').trim() || '-',
    group_name: opts.group_name != null && String(opts.group_name).trim() !== '' ? String(opts.group_name).trim() : null,
    semester_label:
      opts.semester_label != null && String(opts.semester_label).trim() !== ''
        ? String(opts.semester_label).trim()
        : null,
    display_name:
      opts.display_name != null && String(opts.display_name).trim() !== '' ? String(opts.display_name).trim() : null,
    slot_color: opts.slot_color != null && String(opts.slot_color).trim() !== '' ? String(opts.slot_color).trim() : null,
  };

  if (await hasSessionJwt()) {
    const { data, error } = await supabase.from('timetable_entries').insert(row).select(TIMETABLE_ENTRY_SELECT).single();
    if (error) throw toError(error);
    return data as TimetableEntryRow;
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_data',
    {
      action: 'timetable_insert',
      userId: opts.userId,
      id,
      day: row.day,
      subject_code: row.subject_code,
      subject_name: row.subject_name,
      lecturer: row.lecturer,
      start_time: row.start_time,
      end_time: row.end_time,
      location: row.location,
      group_name: row.group_name,
      semester_label: row.semester_label,
      display_name: row.display_name,
      slot_color: row.slot_color,
    },
    headers,
  );
  const res = unwrapFunctionData<{ row: Record<string, unknown> }>(data, error);
  return res.row as TimetableEntryRow;
}

export async function updateTimetableEntry(
  userId: string,
  entryId: string,
  patch: Partial<{
    day: string;
    subject_code: string;
    subject_name: string;
    lecturer: string;
    start_time: string;
    end_time: string;
    location: string;
    group_name: string | null;
    semester_label: string | null;
    display_name: string | null;
    slot_color: string | null;
  }>,
): Promise<TimetableEntryRow> {
  if (await hasSessionJwt()) {
    const row = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ) as Record<string, unknown>;
    if (Object.keys(row).length === 0) throw new Error('No fields to update');
    const { data, error } = await supabase
      .from('timetable_entries')
      .update(row)
      .eq('id', entryId)
      .eq('user_id', userId)
      .select(TIMETABLE_ENTRY_SELECT)
      .single();
    if (error) throw toError(error);
    return data as TimetableEntryRow;
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_data',
    { action: 'timetable_update', userId, id: entryId, patch },
    headers,
  );
  const res = unwrapFunctionData<{ row: Record<string, unknown> }>(data, error);
  return res.row as TimetableEntryRow;
}

export type AdminCalendarOfferRow = {
  id: string;
  university_id: string;
  semester_label: string;
  start_date: string;
  end_date: string;
  total_weeks: number;
  break_start_date: string | null;
  break_end_date: string | null;
  periods_json: unknown | null;
  official_url: string | null;
  reference_pdf_url: string | null;
  admin_note: string | null;
  created_at: string;
  created_by: string | null;
};

export type AdminCalendarOfferInsert = {
  university_id: string;
  semester_label: string;
  start_date: string;
  end_date: string;
  total_weeks: number;
  break_start_date?: string | null;
  break_end_date?: string | null;
  periods_json?: unknown | null;
  official_url?: string | null;
  reference_pdf_url?: string | null;
  admin_note?: string | null;
  created_by?: string | null;
};

export async function listUniversityCalendarOffers(opts?: { universityId?: string; limit?: number }) {
  const lim = Math.max(1, Math.min(300, opts?.limit ?? 120));
  if (await hasSessionJwt()) {
    let q = supabase
      .from('university_calendar_offers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(lim);
    const u = (opts?.universityId ?? '').trim();
    if (u) q = q.eq('university_id', u);
    const { data, error } = await q;
    if (error) throw toError(error);
    return (data ?? []) as AdminCalendarOfferRow[];
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_data',
    { action: 'calendar_offers_list', universityId: opts?.universityId ?? '', limit: lim },
    headers,
  );
  const res = unwrapFunctionData<{ items: AdminCalendarOfferRow[] }>(data, error);
  return res.items;
}

export async function insertUniversityCalendarOffers(rows: AdminCalendarOfferInsert[]): Promise<AdminCalendarOfferRow[]> {
  if (!rows.length) return [];
  if (await hasSessionJwt()) {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    const withCreator = rows.map((r) => ({ ...r, created_by: uid ?? r.created_by ?? null }));
    const { data, error } = await supabase.from('university_calendar_offers').insert(withCreator).select();
    if (error) throw toError(error);
    return (data ?? []) as AdminCalendarOfferRow[];
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_data', { action: 'calendar_offers_insert', rows }, headers);
  const res = unwrapFunctionData<{ items: AdminCalendarOfferRow[] }>(data, error);
  return res.items;
}

export async function deleteUniversityCalendarOffer(id: string): Promise<void> {
  const offerId = String(id || '').trim();
  if (!offerId) throw new Error('Missing offer id');
  if (await hasSessionJwt()) {
    const { error } = await supabase.from('university_calendar_offers').delete().eq('id', offerId);
    if (error) throw toError(error);
    return;
  }
  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_data', { action: 'calendar_offer_delete', id: offerId }, headers);
  unwrapFunctionData<{ ok: true }>(data, error);
}

export type ExtractedCalendarData = {
  official_url_title?: string;
  candidates?: Array<{
    program_level?: string;
    semester_label?: string;
    start_date?: string;
    end_date?: string;
    total_weeks?: number;
    break_start_date?: string | null;
    break_end_date?: string | null;
    periods?: Array<{ type: string; label: string; startDate: string; endDate: string }>;
  }>;
};

export type BroadcastAudience = 'all' | 'user_ids' | 'university';
export type BroadcastCategory = 'reaction' | 'shared_task' | 'circle' | 'friend';

export type BroadcastPreviewArgs = {
  audience: BroadcastAudience;
  userIds?: string[];
  universityId?: string;
};

export async function previewBroadcast(opts: BroadcastPreviewArgs): Promise<{ count: number }> {
  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_community_push',
    { action: 'preview', ...opts },
    headers,
  );
  return unwrapFunctionData<{ count: number }>(data, error);
}

export type SendBroadcastArgs = BroadcastPreviewArgs & {
  title: string;
  body: string;
  category?: BroadcastCategory;
  route?: string;
  params?: Record<string, string>;
  collapseKey?: string;
};

export type SendBroadcastResult = {
  sent?: number;
  batches?: number;
  results?: unknown;
  reason?: string;
};

export async function sendBroadcast(opts: SendBroadcastArgs): Promise<SendBroadcastResult> {
  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_community_push',
    { action: 'send', ...opts },
    headers,
  );
  return unwrapFunctionData<SendBroadcastResult>(data, error);
}

export async function extractCalendarFromUrl(extractUrl: string): Promise<{
  extracted: ExtractedCalendarData;
  source_url: string;
  text_preview: string;
}> {
  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction(
    'admin_data',
    { action: 'extract_calendar_from_url', extractUrl },
    headers,
  );
  return unwrapFunctionData<{ extracted: ExtractedCalendarData; source_url: string; text_preview: string }>(data, error);
}
