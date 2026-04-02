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

export type AdminUserRow = {
  id: string;
  name: string | null;
  student_id: string | null;
  university_id: string | null;
  status: 'active' | 'disabled' | 'banned';
  created_at: string;
  updated_at?: string | null;
};

export async function listUsers(opts: { query?: string; universityId?: string; limit?: number; offset?: number }) {
  if (await hasSessionJwt()) {
    const limit = Math.max(1, Math.min(200, Number(opts.limit ?? 50)));
    const offset = Math.max(0, Number(opts.offset ?? 0));
    let query = supabase
      .from('profiles')
      .select('id,name,student_id,university_id,created_at,status,updated_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    const q = (opts.query ?? '').trim();
    const universityId = (opts.universityId ?? '').trim();
    if (universityId) query = query.eq('university_id', universityId);
    if (q) query = query.or(`name.ilike.%${q}%,student_id.ilike.%${q}%`);
    const { data, error, count } = await query;
    if (error) throw toError(error);
    return {
      items: (data ?? []) as AdminUserRow[],
      count: count ?? 0,
      offset,
      limit,
    };
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_users', { action: 'list', ...opts }, headers);
  return unwrapFunctionData<{ items: AdminUserRow[]; count: number; offset: number; limit: number }>(data, error);
}

export async function setUserStatus(userId: string, status: AdminUserRow['status']) {
  if (await hasSessionJwt()) {
    const { error } = await supabase.from('profiles').update({ status }).eq('id', userId);
    if (error) throw toError(error);
    await supabase.from('admin_logs').insert({
      type: 'api_request',
      status: 'success',
      meta: { action: 'set_status', userId, status },
    });
    return { ok: true as const };
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_users', { action: 'set_status', userId, status }, headers);
  return unwrapFunctionData<{ ok: boolean }>(data, error);
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
  created_at?: string;
};

export async function listTimetableEntries(opts: { userId?: string; universityId?: string; limit?: number }) {
  if (await hasSessionJwt()) {
    const lim = Math.max(1, Math.min(500, Number(opts.limit ?? 200)));
    const userId = opts.userId?.trim() || '';
    const universityId = opts.universityId?.trim() || '';
    let q = supabase
      .from('timetable_entries')
      .select('id,user_id,day,subject_code,subject_name,lecturer,start_time,end_time,location');
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

export async function deleteTimetableEntry(id: string, userId: string) {
  if (await hasSessionJwt()) {
    const { error } = await supabase.from('timetable_entries').delete().eq('id', id).eq('user_id', userId);
    if (!error) return;
  }

  const headers = await adminInvokeHeaders();
  const { data, error } = await invokeEdgeFunction('admin_data', { action: 'timetable_delete', id, userId }, headers);
  unwrapFunctionData<{ ok: boolean }>(data, error);
}
