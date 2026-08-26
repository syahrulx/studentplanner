// @ts-nocheck — Deno edge function; runs on Supabase Deno runtime, not the RN TS compiler.
// Admin CRUD + reads that normally require RLS (universities, logs, timetables, public locations, test fetch).
// Auth: JWT (admin_users row) OR Bearer ADMIN_WEB_DEV_SECRET (set on the function; never use service role in the browser).
// Deploy: npx supabase functions deploy admin_data
// Secrets: supabase secrets set ADMIN_WEB_DEV_SECRET="$(openssl rand -hex 32)"   # optional; local dev bypass

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { authorizeAdminRequest } from '../_shared/adminAuth.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

type Json = Record<string, unknown>;

type PdfCandidate = { url: string; context?: string };

function looksLikePdfUrl(url: URL): boolean {
  const full = `${url.pathname}${url.search}${url.hash}`.toLowerCase();
  return /\.pdf($|[?#&/])/i.test(full) || full.includes('.pdf');
}

/** Whether a university's ISO 3166-1 alpha-2 country code is Malaysia (or unset, matching every pre-existing university row). */
function isMalaysiaCountry(country: unknown): boolean {
  return String(country ?? 'MY').trim().toUpperCase() === 'MY';
}

function jsonResp(status: number, body: unknown, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

async function extractPdfTextWithUnpdf(bytes: Uint8Array): Promise<string | null> {
  try {
    const { extractText, getDocumentProxy } = await import('npm:unpdf@0.12.1');
    const pdf = await getDocumentProxy(bytes, { verbosity: 0 });
    const { text } = await extractText(pdf, { mergePages: true });
    const s = typeof text === 'string' ? text.trim() : '';
    return s.length > 0 ? s : null;
  } catch {
    return null;
  }
}

async function extractPdfTextWithGemini(
  bytes: Uint8Array,
  geminiKey: string,
): Promise<{ text: string | null; error?: string }> {
  if (!geminiKey || geminiKey.length < 10) {
    return { text: null, error: 'GEMINI_API_KEY is missing in admin_data function secrets.' };
  }
  if (bytes.byteLength < 100 || bytes.byteLength > 25 * 1024 * 1024) {
    return { text: null, error: 'PDF size is outside supported OCR range (100B to 25MB).' };
  }
  try {
    const uploadRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`,
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'raw',
          'X-Goog-Upload-Header-Content-Type': 'application/pdf',
          'Content-Type': 'application/pdf',
          'Content-Length': String(bytes.byteLength),
        },
        body: bytes,
      },
    );
    if (!uploadRes.ok) return { text: null, error: `Gemini upload failed (HTTP ${uploadRes.status}).` };
    const uploadJson = await uploadRes.json();
    const geminiFileUri = String(uploadJson?.file?.uri ?? '');
    const geminiFileName = String(uploadJson?.file?.name ?? '');
    if (!geminiFileUri) return { text: null, error: 'Gemini upload returned no file URI.' };

    await new Promise((r) => setTimeout(r, 1200));
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    let out = '';
    let lastErr = '';
    for (const model of models) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45_000);
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              signal: controller.signal,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { file_data: { mime_type: 'application/pdf', file_uri: geminiFileUri } },
                    { text: 'Extract all readable text from this PDF. Return plain text only.' },
                  ],
                }],
                generationConfig: { temperature: 0, maxOutputTokens: 8192 },
              }),
            },
          );
          clearTimeout(timeout);
          if (!res.ok) {
            lastErr = `Gemini extract failed (model ${model}, HTTP ${res.status}).`;
            if ((res.status === 503 || res.status === 429) && attempt < 3) {
              await new Promise((r) => setTimeout(r, 2000 * attempt));
              continue;
            }
            break;
          }
          const aiJson = await res.json();
          let text = '';
          const candidates = aiJson?.candidates;
          if (Array.isArray(candidates)) {
            for (const c of candidates) {
              const parts = c?.content?.parts;
              if (Array.isArray(parts)) {
                for (const p of parts) {
                  if (typeof p?.text === 'string') text += p.text;
                }
              }
            }
          }
          out = text.trim();
          if (out.length > 0) break;
          lastErr = `Gemini returned empty text (model ${model}).`;
        } catch {
          clearTimeout(timeout);
          lastErr = `Gemini request failed (model ${model}).`;
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 2000 * attempt));
            continue;
          }
        }
      }
      if (out.length > 0) break;
    }
    if (geminiFileName) {
      fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiFileName}?key=${geminiKey}`, { method: 'DELETE' })
        .catch(() => {});
    }
    return out.length > 0 ? { text: out } : { text: null, error: lastErr || 'Gemini returned empty text.' };
  } catch {
    return { text: null, error: 'Gemini OCR request failed unexpectedly.' };
  }
}

function extractPdfLinksFromHtml(html: string, base: URL): PdfCandidate[] {
  const out: PdfCandidate[] = [];
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html))) {
    const raw = String(m[1] || '').trim();
    if (!raw) continue;
    if (!/\.pdf(\?|#|$)/i.test(raw)) continue;
    try {
      const u = new URL(raw, base).toString();
      // capture a bit of surrounding text to help AI infer program level
      const start = Math.max(0, m.index - 120);
      const end = Math.min(html.length, m.index + 220);
      const ctx = html.slice(start, end).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      out.push({ url: u, context: ctx });
    } catch {
      // ignore bad URLs
    }
  }
  // de-dupe
  const seen = new Set<string>();
  const deduped: PdfCandidate[] = [];
  for (const it of out) {
    if (seen.has(it.url)) continue;
    seen.add(it.url);
    deduped.push(it);
  }
  return deduped.slice(0, 6);
}

function extractPdfLikeUrlsFromHtml(html: string, base: URL): PdfCandidate[] {
  const out: PdfCandidate[] = [];

  // 1) Common embed attributes: iframe/src, embed/src, object/data, source/src
  const attrRe = /\b(?:src|data)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(html))) {
    const raw = String(m[1] || '').trim();
    if (!raw) continue;
    if (!/\.pdf(\?|#|$)/i.test(raw)) continue;
    try {
      out.push({ url: new URL(raw, base).toString(), context: 'embed_attr' });
    } catch {}
  }

  // 2) Any literal URL containing ".pdf" inside scripts or JSON blobs
  const litRe = /https?:\/\/[^\s"'<>]+?\.pdf[^\s"'<>]*/gi;
  const hits = html.match(litRe) ?? [];
  for (const h of hits) {
    try {
      out.push({ url: new URL(h, base).toString(), context: 'literal_url' });
    } catch {}
  }

  // 3) Relative URLs containing ".pdf"
  const relRe = /["'](\/[^"'<>]+?\.pdf[^"'<>]*)["']/gi;
  while ((m = relRe.exec(html))) {
    const raw = String(m[1] || '').trim();
    if (!raw) continue;
    try {
      out.push({ url: new URL(raw, base).toString(), context: 'relative_url' });
    } catch {}
  }

  // De-dupe + cap
  const seen = new Set<string>();
  const deduped: PdfCandidate[] = [];
  for (const it of out) {
    if (seen.has(it.url)) continue;
    seen.add(it.url);
    deduped.push(it);
  }
  return deduped.slice(0, 10);
}

async function fetchPdfBytes(url: string, timeoutMs = 30_000): Promise<Uint8Array | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GradeUpAdmin/1.0)',
        'Accept': 'application/pdf,*/*',
      },
    });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // basic magic: %PDF-
    if (bytes.length < 5) return null;
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d)) {
      return null;
    }
    // cap size to 10MB
    if (bytes.byteLength > 10 * 1024 * 1024) return null;
    return bytes;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (status: number, body: unknown) => jsonResp(status, body, corsHeaders);
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

    const auth = await authorizeAdminRequest(req);
    if ('error' in auth) return json(auth.status, { error: auth.error });
    const { admin, adminUserId } = auth;

    const payload = (await req.json().catch(() => ({}))) as Json;
    const action = String(payload.action || '');

    if (action === 'attendance_user_summary') {
      const lim = Math.max(1, Math.min(500, Number(payload.limit || 200)));
      const sinceDays = Math.max(1, Math.min(90, Number(payload.sinceDays || 14)));
      const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

      const { data: events, error: e } = await admin
        .from('class_attendance_events')
        .select('user_id,status,scheduled_start_at')
        .order('scheduled_start_at', { ascending: false })
        .limit(200_000);
      if (e) return json(400, { error: e.message });

      const totals = new Map<string, { total: number; present: number; absent: number; cancelled: number; last_total: number; last_present: number }>();
      for (const r of (events ?? []) as Array<{ user_id: string; status: string; scheduled_start_at: string }>) {
        const uid = String(r.user_id || '');
        if (!uid) continue;
        const cur = totals.get(uid) ?? { total: 0, present: 0, absent: 0, cancelled: 0, last_total: 0, last_present: 0 };
        cur.total += 1;
        if (r.status === 'present') cur.present += 1;
        else if (r.status === 'absent') cur.absent += 1;
        else if (r.status === 'cancelled') cur.cancelled += 1;

        if (String(r.scheduled_start_at || '') >= sinceIso) {
          cur.last_total += 1;
          if (r.status === 'present') cur.last_present += 1;
        }
        totals.set(uid, cur);
      }

      const ranked = Array.from(totals.entries())
        .map(([user_id, t]) => ({ user_id, ...t }))
        .sort((a, b) => b.total - a.total)
        .slice(0, lim);

      const sliceIds = ranked.map((r) => r.user_id);
      const { data: profs, error: pe } = sliceIds.length
        ? await admin.from('profiles').select('id,name,student_id,university_id').in('id', sliceIds)
        : { data: [], error: null };
      if (pe) return json(400, { error: pe.message });

      const pmap = new Map((profs ?? []).map((p: { id: string }) => [p.id, p]));
      const items = ranked.map((r) => {
        const present_rate = r.total > 0 ? r.present / r.total : 0;
        const last_present_rate = r.last_total > 0 ? r.last_present / r.last_total : 0;
        return {
          user_id: r.user_id,
          total: r.total,
          present: r.present,
          absent: r.absent,
          cancelled: r.cancelled,
          present_rate,
          last_days: sinceDays,
          last_present_rate,
          profile: pmap.get(r.user_id) ?? null,
        };
      });

      return json(200, { items });
    }

    if (action === 'attendance_user_events') {
      const userId = String(payload.userId || '').trim();
      if (!userId) return json(400, { error: 'missing_userId' });
      const lim = Math.max(1, Math.min(500, Number(payload.limit || 200)));
      const from = payload.from ? String(payload.from).trim() : '';
      const to = payload.to ? String(payload.to).trim() : '';

      let q = admin
        .from('class_attendance_events')
        .select('id,user_id,timetable_entry_id,scheduled_start_at,status,recorded_at,source,subject_code,subject_name')
        .eq('user_id', userId)
        .order('scheduled_start_at', { ascending: false })
        .limit(lim);
      if (from) q = q.gte('scheduled_start_at', from);
      if (to) q = q.lte('scheduled_start_at', to);
      const { data, error: e } = await q;
      if (e) return json(400, { error: e.message });
      return json(200, { items: data ?? [] });
    }

    if (action === 'universities_list') {
      const { data, error: e } = await admin
        .from('universities')
        .select('id,name,country,api_endpoint,login_method,request_method,required_params,response_sample')
        .order('name', { ascending: true });
      if (e) return json(400, { error: e.message });
      return json(200, { items: data ?? [] });
    }

    if (action === 'university_upsert') {
      const row = payload.row as Record<string, unknown> | undefined;
      if (!row || typeof row !== 'object') return json(400, { error: 'missing_row' });
      const { data, error: e } = await admin.from('universities').upsert(row).select().single();
      if (e) return json(400, { error: e.message });
      return json(200, { row: data });
    }

    if (action === 'university_delete') {
      const id = String(payload.id || '').trim();
      if (!id) return json(400, { error: 'missing_id' });
      const { error: e } = await admin.from('universities').delete().eq('id', id);
      if (e) return json(400, { error: e.message });
      return json(200, { ok: true });
    }

    if (action === 'mapping_get') {
      const universityId = String(payload.universityId || '').trim();
      if (!universityId) return json(400, { error: 'missing_universityId' });
      const { data, error: e } = await admin
        .from('university_mappings')
        .select('university_id,timetable_mapping')
        .eq('university_id', universityId)
        .maybeSingle();
      if (e) return json(400, { error: e.message });
      return json(200, { mapping: data });
    }

    if (action === 'mapping_save') {
      const universityId = String(payload.universityId || '').trim();
      const timetable_mapping = payload.timetable_mapping;
      if (!universityId) return json(400, { error: 'missing_universityId' });
      const { data, error: e } = await admin
        .from('university_mappings')
        .upsert({ university_id: universityId, timetable_mapping })
        .select()
        .single();
      if (e) return json(400, { error: e.message });
      return json(200, { mapping: data });
    }

    if (action === 'logs_list') {
      const type = String(payload.type || 'all');
      const status = String(payload.status || 'all');
      const lim = Math.max(1, Math.min(500, Number(payload.limit || 200)));
      let q = admin.from('admin_logs').select('id,type,status,meta,created_at').order('created_at', { ascending: false }).limit(lim);
      if (type !== 'all') q = q.eq('type', type);
      if (status !== 'all') q = q.eq('status', status);
      const { data, error: e } = await q;
      if (e) return json(400, { error: e.message });
      return json(200, { items: data ?? [] });
    }

    if (action === 'timetables_list') {
      const userId = String(payload.userId || '').trim();
      const universityId = String(payload.universityId || '').trim();
      const lim = Math.max(1, Math.min(500, Number(payload.limit || 200)));
      let q = admin
        .from('timetable_entries')
        .select(
          'id,user_id,day,subject_code,subject_name,lecturer,start_time,end_time,location,display_name,slot_color,group_name,semester_label',
        );
      if (userId) q = q.eq('user_id', userId);
      const { data, error: e } = await q.limit(lim);
      if (e) return json(400, { error: e.message });
      let items = data ?? [];
      if (universityId) {
        const ids = Array.from(new Set(items.map((x: { user_id: string }) => x.user_id)));
        if (ids.length) {
          const map = new Map<string, string | null>();
          const pinChunk = 100;
          for (let i = 0; i < ids.length; i += pinChunk) {
            const slice = ids.slice(i, i + pinChunk);
            const { data: profs, error: pe } = await admin.from('profiles').select('id,university_id').in('id', slice);
            if (pe) return json(400, { error: pe.message });
            for (const p of profs ?? []) {
              const row = p as { id: string; university_id: string | null };
              map.set(row.id, row.university_id);
            }
          }
          items = items.filter((t: { user_id: string }) => map.get(t.user_id) === universityId);
        }
      }
      return json(200, { items });
    }

    if (action === 'timetables_users_summary') {
      const counts = new Map<string, number>();
      const batch = 4000;
      let offset = 0;
      for (;;) {
        const { data, error: e } = await admin
          .from('timetable_entries')
          .select('user_id')
          .range(offset, offset + batch - 1);
        if (e) return json(400, { error: e.message });
        const chunk = data ?? [];
        for (const r of chunk) {
          const u = String((r as { user_id: string }).user_id || '');
          if (!u) continue;
          counts.set(u, (counts.get(u) || 0) + 1);
        }
        if (chunk.length < batch) break;
        offset += batch;
        if (offset > 120_000) break;
      }
      const userIds = Array.from(counts.keys());
      if (!userIds.length) return json(200, { users: [] });
      // Chunk `.in()` — PostgREST returns 400 when the filter exceeds URL/query limits.
      const pmap = new Map<string, { id: string; name: string | null; student_id: string | null; university_id: string | null }>();
      const chunkSize = 100;
      for (let i = 0; i < userIds.length; i += chunkSize) {
        const chunk = userIds.slice(i, i + chunkSize);
        const { data: profs, error: pe } = await admin
          .from('profiles')
          .select('id,name,student_id,university_id')
          .in('id', chunk);
        if (pe) return json(400, { error: pe.message });
        for (const p of profs ?? []) pmap.set((p as { id: string }).id, p as { id: string; name: string | null; student_id: string | null; university_id: string | null });
      }
      const users = userIds.map((id) => ({
        user_id: id,
        entry_count: counts.get(id) ?? 0,
        profile: pmap.get(id) ?? null,
      }));
      users.sort((a, b) => b.entry_count - a.entry_count);
      return json(200, { users });
    }

    if (action === 'public_locations_list') {
      const lim = Math.max(1, Math.min(500, Number(payload.limit || 200)));
      const { data: locs, error: le } = await admin
        .from('user_locations')
        .select('user_id,latitude,longitude,place_name,visibility,updated_at')
        .eq('visibility', 'public')
        .order('updated_at', { ascending: false })
        .limit(lim);
      if (le) return json(400, { error: le.message });
      const ids = Array.from(new Set((locs ?? []).map((l: { user_id: string }) => l.user_id)));
      if (!ids.length) return json(200, { items: [] });
      const { data: profs, error: pe } = await admin
        .from('profiles')
        .select('id,name,student_id,university_id')
        .in('id', ids);
      if (pe) return json(400, { error: pe.message });
      const pmap = new Map((profs ?? []).map((p: { id: string }) => [p.id, p]));
      const items = (locs ?? []).map((l: Record<string, unknown>) => ({
        ...l,
        profile: pmap.get(l.user_id as string) ?? null,
      }));
      return json(200, { items });
    }

    if (action === 'circles_list') {
      const lim = Math.max(1, Math.min(500, Number(payload.limit || 200)));
      const q = String(payload.query || '').trim().toLowerCase();
      let cq = admin
        .from('circles')
        .select('id,name,emoji,invite_code,created_by,created_at')
        .order('created_at', { ascending: false })
        .limit(lim);
      if (q) cq = cq.ilike('name', `%${q}%`);
      const { data: circles, error: ce } = await cq;
      if (ce) return json(400, { error: ce.message });
      const ids = Array.from(new Set((circles ?? []).map((c: { id: string }) => c.id)));
      if (!ids.length) return json(200, { items: [] });
      const { data: members, error: me } = await admin.from('circle_members').select('circle_id').in('circle_id', ids);
      if (me) return json(400, { error: me.message });
      const countMap = new Map<string, number>();
      for (const m of members ?? []) {
        const cid = (m as { circle_id: string }).circle_id;
        countMap.set(cid, (countMap.get(cid) || 0) + 1);
      }
      const items = (circles ?? []).map((c: Record<string, unknown>) => ({
        ...c,
        member_count: countMap.get(c.id as string) ?? 0,
      }));
      return json(200, { items });
    }

    if (action === 'circle_members_list') {
      const circleId = String(payload.circleId || '').trim();
      const lim = Math.max(1, Math.min(500, Number(payload.limit || 200)));
      if (!circleId) return json(400, { error: 'missing_circleId' });
      const { data: mem, error: me } = await admin
        .from('circle_members')
        .select('circle_id,user_id,role,joined_at')
        .eq('circle_id', circleId)
        .order('joined_at', { ascending: true })
        .limit(lim);
      if (me) return json(400, { error: me.message });
      const userIds = Array.from(new Set((mem ?? []).map((m: { user_id: string }) => m.user_id)));
      const { data: profs, error: pe } = userIds.length
        ? await admin.from('profiles').select('id,name,student_id,university_id,avatar_url').in('id', userIds)
        : { data: [], error: null };
      if (pe) return json(400, { error: pe.message });
      const pmap = new Map((profs ?? []).map((p: { id: string }) => [p.id, p]));
      const items = (mem ?? []).map((m: Record<string, unknown>) => ({
        ...m,
        profile: pmap.get(m.user_id as string) ?? null,
      }));
      return json(200, { items });
    }

    if (action === 'circle_update') {
      const id = String(payload.id || '').trim();
      const name = String(payload.name || '').trim();
      const emoji = String(payload.emoji || '').trim();
      if (!id) return json(400, { error: 'missing_id' });
      if (!name) return json(400, { error: 'missing_name' });
      const patch: Record<string, unknown> = { name };
      if (emoji) patch.emoji = emoji;
      const { data, error: e } = await admin.from('circles').update(patch).eq('id', id).select().single();
      if (e) return json(400, { error: e.message });
      return json(200, { row: data });
    }

    if (action === 'circle_member_remove') {
      const circleId = String(payload.circleId || '').trim();
      const userId = String(payload.userId || '').trim();
      if (!circleId || !userId) return json(400, { error: 'missing_circleId_or_userId' });
      const { error: e } = await admin.from('circle_members').delete().eq('circle_id', circleId).eq('user_id', userId);
      if (e) return json(400, { error: e.message });
      return json(200, { ok: true });
    }

    if (action === 'circle_delete') {
      const id = String(payload.id || '').trim();
      if (!id) return json(400, { error: 'missing_id' });
      const { error: e } = await admin.from('circles').delete().eq('id', id);
      if (e) return json(400, { error: e.message });
      return json(200, { ok: true });
    }

    if (action === 'timetable_delete') {
      const id = String(payload.id || '').trim();
      const user_id = String(payload.userId || '').trim();
      if (!id || !user_id) return json(400, { error: 'missing_id_or_userId' });
      const { error: e } = await admin.from('timetable_entries').delete().eq('id', id).eq('user_id', user_id);
      if (e) return json(400, { error: e.message });
      return json(200, { ok: true });
    }

    if (action === 'timetable_insert') {
      const user_id = String(payload.userId || '').trim();
      if (!user_id) return json(400, { error: 'missing_userId' });
      const id = String(payload.id || '').trim() || crypto.randomUUID();
      const day = String(payload.day || '').trim();
      const start_time = String(payload.start_time || '').trim();
      const end_time = String(payload.end_time || '').trim();
      if (!day || !start_time || !end_time) return json(400, { error: 'missing_day_or_times' });
      const row = {
        id,
        user_id,
        day,
        subject_code: String(payload.subject_code ?? '').trim(),
        subject_name: String(payload.subject_name ?? '').trim(),
        lecturer: String(payload.lecturer ?? '').trim() || '-',
        start_time,
        end_time,
        location: String(payload.location ?? '').trim() || '-',
        group_name: payload.group_name != null && String(payload.group_name).trim() !== ''
          ? String(payload.group_name).trim()
          : null,
        semester_label: payload.semester_label != null && String(payload.semester_label).trim() !== ''
          ? String(payload.semester_label).trim()
          : null,
        display_name: payload.display_name != null && String(payload.display_name).trim() !== ''
          ? String(payload.display_name).trim()
          : null,
        slot_color: payload.slot_color != null && String(payload.slot_color).trim() !== ''
          ? String(payload.slot_color).trim()
          : null,
      };
      const { data, error: e } = await admin.from('timetable_entries').insert(row).select('*').single();
      if (e) return json(400, { error: e.message });
      return json(200, { row: data });
    }

    if (action === 'timetable_update') {
      const user_id = String(payload.userId || '').trim();
      const id = String(payload.id || '').trim();
      if (!id || !user_id) return json(400, { error: 'missing_id_or_userId' });
      const patch = (payload.patch || {}) as Record<string, unknown>;
      const row: Record<string, unknown> = {};
      const str = (k: string) => (patch[k] != null ? String(patch[k]).trim() : undefined);
      if ('day' in patch) row.day = str('day') ?? '';
      if ('subject_code' in patch) row.subject_code = str('subject_code') ?? '';
      if ('subject_name' in patch) row.subject_name = str('subject_name') ?? '';
      if ('lecturer' in patch) row.lecturer = str('lecturer') || '-';
      if ('start_time' in patch) row.start_time = str('start_time') ?? '';
      if ('end_time' in patch) row.end_time = str('end_time') ?? '';
      if ('location' in patch) row.location = str('location') || '-';
      if ('group_name' in patch) {
        const g = str('group_name');
        row.group_name = g && g.length > 0 ? g : null;
      }
      if ('semester_label' in patch) {
        const s = str('semester_label');
        row.semester_label = s && s.length > 0 ? s : null;
      }
      if ('display_name' in patch) {
        const d = str('display_name');
        row.display_name = d && d.length > 0 ? d : null;
      }
      if ('slot_color' in patch) {
        const c = str('slot_color');
        row.slot_color = c && c.length > 0 ? c : null;
      }
      if (Object.keys(row).length === 0) return json(400, { error: 'empty_patch' });
      const { data, error: e } = await admin
        .from('timetable_entries')
        .update(row)
        .eq('id', id)
        .eq('user_id', user_id)
        .select('*')
        .single();
      if (e) return json(400, { error: e.message });
      return json(200, { row: data });
    }

    if (action === 'test_fetch') {
      const universityId = String(payload.universityId || '');
      const params = (payload.params || {}) as Json;
      if (!universityId) return json(400, { error: 'missing_universityId' });

      const { data: uni, error: uniErr } = await admin
        .from('universities')
        .select('id,name,api_endpoint,request_method,required_params')
        .eq('id', universityId)
        .maybeSingle();
      if (uniErr || !uni) return json(404, { error: 'university_not_found' });
      if (!uni.api_endpoint) return json(400, { error: 'missing_api_endpoint' });

      const timeoutMs = 12_000;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      const method = String(uni.request_method || 'GET').toUpperCase();
      const url = new URL(uni.api_endpoint);
      const init: RequestInit = { method, signal: controller.signal, headers: { accept: 'application/json' } };

      if (method === 'GET') {
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
      } else {
        init.headers = { ...init.headers, 'content-type': 'application/json' };
        init.body = JSON.stringify(params);
      }

      const startedAt = Date.now();
      let httpStatus = 0;
      let bodyText = '';
      let ok = false;
      try {
        const resp = await fetch(url.toString(), init);
        httpStatus = resp.status;
        ok = resp.ok;
        bodyText = await resp.text();
      } finally {
        clearTimeout(t);
      }

      const elapsedMs = Date.now() - startedAt;
      const parsed = (() => {
        try {
          return JSON.parse(bodyText);
        } catch {
          return { raw: bodyText.slice(0, 5000) };
        }
      })();

      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: ok ? 'success' : 'failed',
        meta: { universityId, url: url.toString(), method, httpStatus, elapsedMs },
      });

      return json(200, { ok, httpStatus, elapsedMs, data: parsed });
    }

    if (action === 'subscription_plan_features_list') {
      const { data, error: e } = await admin
        .from('subscription_plan_features')
        .select('id,tier,label,enabled,sort_order')
        .order('tier', { ascending: true })
        .order('sort_order', { ascending: true });
      if (e) return json(400, { error: e.message });
      return json(200, { items: data ?? [] });
    }

    if (action === 'calendar_offers_list') {
      const universityId = String(payload.universityId || '').trim();
      const lim = Math.max(1, Math.min(300, Number(payload.limit || 120)));
      const orderBy = payload.orderBy === 'end_date' ? 'end_date' : 'created_at';
      const ascending = payload.ascending === true;
      let q = admin
        .from('university_calendar_offers')
        .select('*')
        .order(orderBy, { ascending })
        .limit(lim);
      if (universityId) q = q.eq('university_id', universityId);
      const { data, error: e } = await q;
      if (e) return json(400, { error: e.message });
      return json(200, { items: data ?? [] });
    }

    if (action === 'crowdsourced_calendars_list') {
      const { data: offers, error: e } = await admin
        .from('university_calendar_offers')
        .select('*')
        .eq('source', 'crowdsourced')
        .order('created_at', { ascending: false });
      if (e) return json(400, { error: e.message });

      const items = await Promise.all((offers ?? []).map(async (item) => {
        let userProfile = null;
        if (item.created_by) {
          try {
            const { data: userData, error: userErr } = await admin.auth.admin.getUserById(item.created_by);
            if (!userErr && userData?.user) {
              const u = userData.user;
              userProfile = {
                id: u.id,
                full_name: String(u.user_metadata?.full_name || u.user_metadata?.name || '').trim() || null,
                email: u.email ?? null,
                phone_number: u.phone ?? null,
                created_at: u.created_at,
              };
            }
          } catch (err) {
            console.error(`Failed to get auth user ${item.created_by}:`, err);
          }
        }
        return {
          ...item,
          user_profile: userProfile,
        };
      }));

      return json(200, { items });
    }

    if (action === 'uitm_calendar_contributions_list') {
      const { data: rows, error: e } = await admin
        .from('uitm_calendar_contributions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (e) return json(400, { error: e.message });

      const items = await Promise.all((rows ?? []).map(async (item) => {
        let user_profile = null;
        try {
          const { data: userData, error: userErr } = await admin.auth.admin.getUserById(item.created_by);
          if (!userErr && userData?.user) {
            const u = userData.user;
            user_profile = {
              id: u.id,
              full_name: String(u.user_metadata?.full_name || u.user_metadata?.name || '').trim() || null,
              email: u.email ?? null,
            };
          }
        } catch {
          // A deleted auth user is permitted by the migration's foreign key; keep the submission visible to admins.
        }
        return { ...item, user_profile };
      }));
      return json(200, { items });
    }

    if (action === 'uitm_calendar_contribution_review') {
      const id = String(payload.id || '').trim();
      const status = String(payload.status || '').trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return json(400, { error: 'invalid_id' });
      }
      if (status !== 'approved' && status !== 'rejected') return json(400, { error: 'invalid_status' });
      const { error: e } = await admin
        .from('uitm_calendar_contributions')
        .update({ status, reviewed_by: auth.adminUserId, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (e) return json(400, { error: e.message });
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, id, reviewStatus: status },
      });
      return json(200, { ok: true });
    }

    if (action === 'social_share_claims_list') {
      const status = String(payload.status || '').trim();
      let query = admin
        .from('social_share_claims')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (status === 'pending' || status === 'approved' || status === 'rejected') {
        query = query.eq('status', status);
      }
      const { data: rows, error: e } = await query;
      if (e) return json(400, { error: e.message });

      const claims = (rows ?? []).sort((a, b) =>
        a.status === b.status ? 0 : a.status === 'pending' ? -1 : b.status === 'pending' ? 1 : 0);

      const paths = claims.map((c) => String(c.screenshot_path || '')).filter(Boolean);
      const signedByPath: Record<string, string> = {};
      if (paths.length > 0) {
        try {
          const { data: signed } = await admin.storage.from('share-proof').createSignedUrls(paths, 3600);
          for (const s of signed ?? []) {
            if (s?.path && s?.signedUrl && !s.error) signedByPath[s.path] = s.signedUrl;
          }
        } catch (err) {
          console.error('share-proof signed URLs failed:', err);
        }
      }

      // Promo days start counting the moment they are granted, so awarding them
      // to someone who already has paid access burns the reward on days they
      // would have had anyway. Surface their current access so the reviewer can
      // decide (there is no banking of days).
      const userIds = [...new Set(claims.map((c) => String(c.user_id)))];
      const accessByUser: Record<string, {
        current_plan: string;
        current_store: string | null;
        current_expires_at: string | null;
        has_non_promo_access: boolean;
      }> = {};
      if (userIds.length > 0) {
        const [profilesRes, entitlementsRes] = await Promise.all([
          admin
            .from('profiles')
            .select('id, subscription_plan, subscription_store, subscription_expires_at')
            .in('id', userIds),
          admin
            .from('subscription_entitlements')
            .select('user_id, provider, plan, status, expires_at')
            .in('user_id', userIds)
            .neq('provider', 'promo'),
        ]);
        for (const p of profilesRes.data ?? []) {
          accessByUser[String(p.id)] = {
            current_plan: String(p.subscription_plan ?? 'free'),
            current_store: p.subscription_store ?? null,
            current_expires_at: p.subscription_expires_at ?? null,
            has_non_promo_access: false,
          };
        }
        const LIVE_STATUSES = new Set([
          'trial', 'introductory', 'active', 'promotional', 'prepaid',
          'cancelled', 'billing_issue', 'temporary',
        ]);
        for (const ent of entitlementsRes.data ?? []) {
          const key = String(ent.user_id);
          const live =
            (ent.plan === 'plus' || ent.plan === 'pro') &&
            LIVE_STATUSES.has(String(ent.status)) &&
            (!ent.expires_at || new Date(ent.expires_at).getTime() > Date.now());
          if (live && accessByUser[key]) accessByUser[key].has_non_promo_access = true;
        }
      }

      const items = await Promise.all(claims.map(async (item) => {
        let user_email = null;
        try {
          const { data: userData, error: userErr } = await admin.auth.admin.getUserById(item.user_id);
          if (!userErr && userData?.user) user_email = userData.user.email ?? null;
        } catch {
          // A deleted auth user should not hide the claim from admins.
        }
        const access = accessByUser[String(item.user_id)];
        return {
          ...item,
          user_email,
          screenshot_signed_url: signedByPath[String(item.screenshot_path || '')] ?? null,
          current_plan: access?.current_plan ?? 'free',
          current_store: access?.current_store ?? null,
          current_expires_at: access?.current_expires_at ?? null,
          has_non_promo_access: access?.has_non_promo_access ?? false,
        };
      }));
      return json(200, { items });
    }

    if (action === 'social_share_claim_review') {
      const id = String(payload.id || '').trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return json(400, { error: 'invalid_id' });
      }
      const approve = payload.approve === true;
      const approvedLikes = Number.isInteger(payload.approvedLikes) && payload.approvedLikes >= 0
        ? payload.approvedLikes : null;
      const awardedDays = Number.isInteger(payload.awardedDays) ? payload.awardedDays : null;
      const note = String(payload.note || '').trim();
      if (approve && (awardedDays == null || awardedDays < 1 || awardedDays > 180)) {
        return json(400, { error: 'invalid_days' });
      }
      if (!approve && note.length < 3) {
        return json(400, { error: 'note_required' });
      }

      const { data, error: e } = await admin.rpc('review_social_share_claim', {
        p_claim_id: id,
        p_reviewer: auth.adminUserId ?? null,
        p_approve: approve,
        p_approved_likes: approve ? approvedLikes : null,
        p_awarded_days: approve ? awardedDays : null,
        p_note: note || null,
      });
      if (e) return json(400, { error: e.message });
      if (!data?.ok) return json(400, data ?? { error: 'review_failed' });

      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, id, approve, awardedDays, approvedLikes, actor: auth.adminUserId ?? null },
      });
      return json(200, data);
    }

    if (action === 'calendar_offers_insert') {
      const raw = payload.rows;
      if (!Array.isArray(raw) || raw.length === 0) return json(400, { error: 'missing_rows' });
      const cleaned: Record<string, unknown>[] = [];
      for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const university_id = String(o.university_id || '').trim();
        if (!university_id || university_id === 'uitm') continue;
        const semester_label = String(o.semester_label || '').trim();
        const start_date = String(o.start_date || '').trim().slice(0, 10);
        const end_date = String(o.end_date || '').trim().slice(0, 10);
        const total_weeks = Math.max(1, Math.min(52, Number(o.total_weeks) || 14));
        if (!semester_label || !/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
          continue;
        }
        const bs = o.break_start_date != null ? String(o.break_start_date).trim().slice(0, 10) : '';
        const be = o.break_end_date != null ? String(o.break_end_date).trim().slice(0, 10) : '';
        cleaned.push({
          university_id,
          semester_label,
          start_date,
          end_date,
          total_weeks,
          break_start_date: /^\d{4}-\d{2}-\d{2}$/.test(bs) ? bs : null,
          break_end_date: /^\d{4}-\d{2}-\d{2}$/.test(be) ? be : null,
          periods_json: o.periods_json ?? null,
          official_url: o.official_url ? String(o.official_url).trim() || null : null,
          reference_pdf_url: o.reference_pdf_url ? String(o.reference_pdf_url).trim() || null : null,
          admin_note: o.admin_note ? String(o.admin_note).trim() || null : null,
          created_by: o.created_by ? String(o.created_by) : null,
        });
      }
      if (!cleaned.length) return json(400, { error: 'invalid_rows' });
      const { data, error: e } = await admin.from('university_calendar_offers').insert(cleaned).select();
      if (e) return json(400, { error: e.message });
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, count: cleaned.length },
      });
      return json(200, { items: data ?? [] });
    }

    if (action === 'calendar_offer_delete') {
      const id = String(payload.id || '').trim();
      const reason = String(payload.reason || '').trim().slice(0, 500);
      if (!id) return json(400, { error: 'missing_id' });
      const { error: e } = await admin.from('university_calendar_offers').delete().eq('id', id);
      if (e) return json(400, { error: e.message });
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, id, reason: reason || null, actor: adminUserId ?? null },
      });
      return json(200, { ok: true });
    }

    if (action === 'crowdsourced_calendars_delete_expired') {
      const reason = String(payload.reason || '').trim().slice(0, 500);
      const rawIds = Array.isArray(payload.ids) ? payload.ids : [];
      const ids = Array.from(new Set(rawIds
        .map((id) => String(id || '').trim())
        .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))))
        .slice(0, 500);
      if (!ids.length) return json(400, { error: 'missing_valid_ids' });

      // `end_date` is a DATE column. Comparing its ISO form keeps today's
      // calendar intact; only calendars that ended before today are eligible.
      const today = new Date().toISOString().slice(0, 10);
      const { data: deleted, error: e } = await admin
        .from('university_calendar_offers')
        .delete()
        .in('id', ids)
        .eq('source', 'crowdsourced')
        .lt('end_date', today)
        .select('id');
      if (e) return json(400, { error: e.message });

      const deletedCount = (deleted ?? []).length;
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, requestedCount: ids.length, deletedCount, beforeDate: today, reason: reason || null, actor: adminUserId ?? null },
      });
      return json(200, { deletedCount });
    }

    if (action === 'calendar_offers_delete_expired_admin') {
      const reason = String(payload.reason || '').trim().slice(0, 500);
      const rawIds = Array.isArray(payload.ids) ? payload.ids : [];
      const deleteAllExpired = payload.deleteAllExpired === true;
      const ids = Array.from(new Set(rawIds
        .map((id) => String(id || '').trim())
        .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))))
        .slice(0, 500);
      if (!ids.length && !deleteAllExpired) return json(400, { error: 'missing_valid_ids' });

      // An old admin offer must have both dates before today. Crowdsourced
      // calendars deliberately remain in their separate moderation workflow.
      const today = new Date().toISOString().slice(0, 10);
      let query = admin
        .from('university_calendar_offers')
        .delete()
        .eq('source', 'admin')
        .lt('start_date', today)
        .lt('end_date', today);
      if (!deleteAllExpired) query = query.in('id', ids);
      const { data: deleted, error: e } = await query.select('id');
      if (e) return json(400, { error: e.message });

      const deletedCount = (deleted ?? []).length;
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, deleteAllExpired, requestedCount: ids.length, deletedCount, beforeDate: today, reason: reason || null, actor: adminUserId ?? null },
      });
      return json(200, { deletedCount });
    }

    if (action === 'subscription_plan_features_save') {
      const tier = String(payload.tier || '').trim();
      if (!['free', 'plus', 'pro'].includes(tier)) return json(400, { error: 'invalid_tier' });
      const raw = payload.items;
      if (!Array.isArray(raw)) return json(400, { error: 'invalid_items' });

      const rows: Array<{ id: string; tier: string; label: string; enabled: boolean; sort_order: number }> = [];
      let i = 0;
      for (const it of raw as unknown[]) {
        if (!it || typeof it !== 'object') continue;
        const o = it as Record<string, unknown>;
        const id = String(o.id || '').trim();
        const label = String(o.label ?? '').trim().slice(0, 2000);
        if (!label) continue;
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const rowId = uuidRe.test(id) ? id : crypto.randomUUID();
        rows.push({
          id: rowId,
          tier,
          label,
          enabled: Boolean(o.enabled),
          sort_order: i++,
        });
      }

      const { data: existing, error: exErr } = await admin.from('subscription_plan_features').select('id').eq('tier', tier);
      if (exErr) return json(400, { error: exErr.message });
      const keep = new Set(rows.map((r) => r.id));
      const toDelete = ((existing ?? []) as Array<{ id: string }>).map((r) => r.id).filter((id) => !keep.has(id));
      if (toDelete.length) {
        const { error: delErr } = await admin.from('subscription_plan_features').delete().in('id', toDelete);
        if (delErr) return json(400, { error: delErr.message });
      }
      if (rows.length) {
        const { error: upErr } = await admin.from('subscription_plan_features').upsert(rows, { onConflict: 'id' });
        if (upErr) return json(400, { error: upErr.message });
      }
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, tier, count: rows.length },
      });
      return json(200, { ok: true });
    }

    if (action === 'extract_calendar_from_url') {
      const extractUrl = String(payload.extractUrl || '').trim();
      if (!extractUrl) return json(400, { error: 'missing_extractUrl' });
      const geminiKey = (Deno.env.get('GEMINI_API_KEY') ?? '').trim();

      // Validate URL format
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(extractUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          return json(400, { error: 'URL must start with http:// or https://' });
        }
      } catch {
        return json(400, { error: 'invalid_url' });
      }

      // Fetch the URL content (HTML or direct PDF).
      // Some hosts serve PDFs with generic content-type headers, so try URL-based
      // PDF detection first and validate bytes via PDF magic.
      const fetchController = new AbortController();
      const fetchTimeout = setTimeout(() => fetchController.abort(), 30_000);
      let htmlText = '';
      let directPdfBytes: Uint8Array | null = null;
      try {
        if (looksLikePdfUrl(parsedUrl)) {
          const bytes = await fetchPdfBytes(parsedUrl.toString());
          if (bytes) {
            directPdfBytes = bytes;
          }
        }

        if (!directPdfBytes) {
        const resp = await fetch(parsedUrl.toString(), {
          signal: fetchController.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; GradeUpAdmin/1.0)',
            'Accept': 'application/pdf,text/html,application/xhtml+xml,*/*',
            'Accept-Language': 'en-US,en;q=0.9,ms;q=0.8',
          },
        });
        if (!resp.ok) {
          return json(400, { error: `Website returned HTTP ${resp.status}. The URL may be incorrect or the server is blocking requests.` });
        }
        const ctype = String(resp.headers.get('content-type') || '').toLowerCase();
        const disposition = String(resp.headers.get('content-disposition') || '').toLowerCase();
        if (ctype.includes('application/pdf') || disposition.includes('.pdf')) {
          const buf = await resp.arrayBuffer();
          const bytes = new Uint8Array(buf);
          // basic magic: %PDF-
          if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
            directPdfBytes = bytes;
          } else {
            return json(400, { error: 'URL responded with PDF content-type but did not look like a PDF file.' });
          }
        } else {
          htmlText = await resp.text();
        }
        }
      } catch (fetchErr: unknown) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        if (msg.includes('abort') || msg.includes('Abort')) {
          return json(400, { error: 'Website took too long to respond (30s timeout). Try a different URL.' });
        }
        return json(400, { error: `Could not fetch website: ${msg}` });
      } finally {
        clearTimeout(fetchTimeout);
      }

      if (!directPdfBytes && (!htmlText || htmlText.length < 50)) {
        return json(400, { error: 'Website returned very little content. It may require JavaScript to load.' });
      }

      let cleanText = '';
      let pdfTexts: Array<{ url: string; context?: string; text: string }> = [];

      if (directPdfBytes) {
        const nativeText = await extractPdfTextWithUnpdf(directPdfBytes);
        const geminiResult = nativeText ? { text: null as string | null } : await extractPdfTextWithGemini(directPdfBytes, geminiKey);
        const text = nativeText ?? geminiResult.text ?? '';
        if (text.trim().length < 200) {
          return json(400, {
            error:
              `Could not extract readable text from the PDF. ${
                geminiResult.error
                  ? `OCR fallback detail: ${geminiResult.error}`
                  : 'This file may be scanned/image-only (no selectable text).'
              }`,
          });
        }
        pdfTexts = [{ url: extractUrl, context: 'direct_pdf', text: text.trim().slice(0, 18000) }];
        cleanText = '[PDF content extracted; using PDF as primary source]';
      } else {
        // Strip HTML to readable text (remove scripts, styles, tags)
        cleanText = htmlText
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[\s\S]*?<\/nav>/gi, '')
          .replace(/<footer[\s\S]*?<\/footer>/gi, '')
          .replace(/<header[\s\S]*?<\/header>/gi, '')
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&quot;/gi, '"')
          .replace(/&#\d+;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      // Truncate to save tokens (15k chars ≈ 4k tokens)
      cleanText = cleanText.slice(0, 15000);

      if (cleanText.length < 30) {
        return json(400, { error: 'Could not extract readable text from the website. The page may be dynamically rendered (JavaScript-only).' });
      }

      // If HTML page links PDFs (e.g. UM academic calendar), fetch and extract PDF text to improve accuracy.
      // Many university pages only list PDF links; the actual calendar detail is inside the PDF.
      if (!directPdfBytes) {
        const pdfLinks = [
          ...extractPdfLikeUrlsFromHtml(htmlText, parsedUrl),
          ...extractPdfLinksFromHtml(htmlText, parsedUrl),
        ];
        for (const p of pdfLinks) {
          const bytes = await fetchPdfBytes(p.url);
          if (!bytes) continue;
          const nativeText = await extractPdfTextWithUnpdf(bytes);
          const geminiResult = nativeText ? { text: null as string | null } : await extractPdfTextWithGemini(bytes, geminiKey);
          const text = nativeText ?? geminiResult.text ?? '';
          if (text.trim().length < 200) continue;
          pdfTexts.push({ url: p.url, context: p.context, text: text.trim().slice(0, 18000) });
          if (pdfTexts.length >= 3) break;
        }
      }

      // Call OpenAI to extract calendar data
      const openAiKey = (Deno.env.get('OPENAI_API_KEY') ?? '').trim();
      if (!openAiKey || openAiKey.length < 20) {
        return json(400, { error: 'OPENAI_API_KEY is not set in Edge Function secrets.' });
      }

      const isMY = isMalaysiaCountry(payload.country);
      const systemPrompt = `You are an academic calendar data extractor for ${isMY ? 'Malaysian universities' : 'universities worldwide'}.
Given the text content from a university's academic calendar webpage, extract structured semester/session information.

IMPORTANT:
Some pages list MULTIPLE calendars by program level (e.g. "Bachelor Programme", "Master and Doctorate Programme").
In that case, return MULTIPLE candidates so the admin can choose which program level to publish.

Return VALID JSON ONLY with this exact shape:
{
  "official_url_title": "string (page title or heading)",
  "candidates": [
    {
      "program_level": "string (e.g. 'Bachelor', 'Master/Doctorate', 'Diploma', 'Foundation', 'Special')",
      "semester_label": "string (e.g. 'Semester 1 2025/2026')",
      "start_date": "YYYY-MM-DD (first day of teaching/lectures)",
      "end_date": "YYYY-MM-DD (last day of the semester, after final exams)",
      "total_weeks": number (total teaching weeks, typically 14-16),
      "break_start_date": "YYYY-MM-DD or null (mid-semester break start)",
      "break_end_date": "YYYY-MM-DD or null (mid-semester break end)",
      "periods": [
        {
          "type": "lecture" | "exam" | "break" | "revision" | "registration" | "orientation",
          "label": "string (e.g. 'Lectures Week 1-7')",
          "startDate": "YYYY-MM-DD",
          "endDate": "YYYY-MM-DD"
        }
      ]
    }
  ]
}

Rules:
- If there is only ONE program level/calendar, still return a single-item candidates array.
- Dates must be in YYYY-MM-DD format. Convert whatever date format appears in the source (e.g. "24 Mei 2026", "24/05/2026", "May 24, 2026").
- total_weeks should count teaching/lecture weeks only (exclude exam, break, registration weeks).
- The "periods" array should capture the full semester timeline: registration, orientation, lecture blocks, mid-sem break, revision week, exam period, etc.
- For lecture periods, split them if there is a break in between (e.g. "Lectures Week 1-7" then break then "Lectures Week 8-14").
- If information is unclear or missing, use null for optional fields.
- Do NOT invent or guess dates. Only extract what is explicitly stated.
- Return JSON only. No markdown, no explanation, no code fences.`;

      const pdfBlock =
        pdfTexts.length > 0
          ? `\n\nPDF_TEXT_SOURCES (preferred if present):\n${pdfTexts
              .map((p, i) => {
                const ctx = (p.context || '').slice(0, 220);
                return `\n[PDF ${i + 1}] URL: ${p.url}\nContext: ${ctx}\n---\n${p.text}\n---\n`;
              })
              .join('\n')}\n`
          : '';
      const userPrompt = `Extract academic calendar information from this university webpage.\n\nWEBPAGE_TEXT:\n${cleanText}\n${pdfBlock}`;

      const aiController = new AbortController();
      const aiTimeout = setTimeout(() => aiController.abort(), 30_000);
      let aiContent = '';
      try {
        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: aiController.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0,
            max_tokens: 2000,
          }),
        });

        if (!aiRes.ok) {
          const errText = await aiRes.text();
          return json(400, { error: `OpenAI error (${aiRes.status}): ${errText.slice(0, 300)}` });
        }

        const aiJson = await aiRes.json();
        aiContent = String(aiJson?.choices?.[0]?.message?.content ?? '').trim();
      } catch (aiErr: unknown) {
        const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
        if (msg.includes('abort') || msg.includes('Abort')) {
          return json(400, { error: 'AI extraction timed out (30s). Try a simpler page.' });
        }
        return json(400, { error: `AI request failed: ${msg}` });
      } finally {
        clearTimeout(aiTimeout);
      }

      // Parse AI response
      const cleaned = aiContent
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(cleaned) as Record<string, unknown>;
      } catch {
        return json(400, { error: 'AI returned invalid JSON. The website content may be too complex. Try a different URL or enter details manually.' });
      }

      // Backward-compat: if the model returns the legacy single-calendar shape, wrap it into candidates[0]
      // so the admin UI can always render a consistent selector.
      const hasCandidates = Array.isArray((parsed as any)?.candidates);
      const hasLegacy =
        typeof (parsed as any)?.semester_label === 'string' ||
        typeof (parsed as any)?.start_date === 'string' ||
        typeof (parsed as any)?.end_date === 'string' ||
        typeof (parsed as any)?.total_weeks === 'number' ||
        Array.isArray((parsed as any)?.periods);
      if (!hasCandidates && hasLegacy) {
        (parsed as any).candidates = [
          {
            program_level: (parsed as any)?.program_level ?? 'General',
            semester_label: (parsed as any)?.semester_label,
            start_date: (parsed as any)?.start_date,
            end_date: (parsed as any)?.end_date,
            total_weeks: (parsed as any)?.total_weeks,
            break_start_date: (parsed as any)?.break_start_date ?? null,
            break_end_date: (parsed as any)?.break_end_date ?? null,
            periods: Array.isArray((parsed as any)?.periods) ? (parsed as any)?.periods : [],
          },
        ];
      }

      // Log the extraction
      const extractedLabel =
        (parsed as any)?.semester_label ??
        (Array.isArray((parsed as any)?.candidates) ? String((parsed as any)?.candidates?.[0]?.semester_label ?? '') : '') ??
        null;
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, url: extractUrl, extractedLabel },
      });

      const previewSource = pdfTexts.length > 0 ? pdfTexts[0].text : cleanText;
      return json(200, { extracted: parsed, source_url: extractUrl, text_preview: previewSource.slice(0, 500) });
    }

    // ── Extract calendar from uploaded PDF (base64) ──────────────────────────
    if (action === 'extract_calendar_from_pdf') {
      const pdfBase64 = String(payload.pdfBase64 || '').trim();
      if (!pdfBase64 || pdfBase64.length < 100) {
        return json(400, { error: 'Missing or empty PDF data.' });
      }

      const geminiKey = (Deno.env.get('GEMINI_API_KEY') ?? '').trim();
      const openAiKey = (Deno.env.get('OPENAI_API_KEY') ?? '').trim();
      if (!openAiKey || openAiKey.length < 20) {
        return json(400, { error: 'OPENAI_API_KEY is not set in Edge Function secrets.' });
      }

      // Decode base64 to bytes
      let pdfBytes: Uint8Array;
      try {
        // Handle data URL prefix if present
        const raw = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
        const binary = atob(raw);
        pdfBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          pdfBytes[i] = binary.charCodeAt(i);
        }
      } catch {
        return json(400, { error: 'Invalid base64 data. Could not decode PDF.' });
      }

      // Validate PDF magic bytes
      if (pdfBytes.length < 5 || !(pdfBytes[0] === 0x25 && pdfBytes[1] === 0x50 && pdfBytes[2] === 0x44 && pdfBytes[3] === 0x46 && pdfBytes[4] === 0x2d)) {
        return json(400, { error: 'File does not appear to be a valid PDF (missing %PDF- header).' });
      }

      if (pdfBytes.byteLength > 10 * 1024 * 1024) {
        return json(400, { error: 'PDF is too large (max 10 MB).' });
      }

      // Extract text from PDF
      const nativeText = await extractPdfTextWithUnpdf(pdfBytes);
      const geminiResult = nativeText ? { text: null as string | null } : await extractPdfTextWithGemini(pdfBytes, geminiKey);
      const pdfText = nativeText ?? geminiResult.text ?? '';

      if (pdfText.trim().length < 200) {
        return json(400, {
          error: `Could not extract readable text from the PDF. ${
            geminiResult.error
              ? `OCR fallback detail: ${geminiResult.error}`
              : 'This file may be scanned/image-only (no selectable text).'
          }`,
        });
      }

      const truncatedText = pdfText.trim().slice(0, 18000);

      // Call OpenAI to extract calendar data (same prompt as URL extraction)
      const isMY = isMalaysiaCountry(payload.country);
      const systemPrompt = `You are an academic calendar data extractor for ${isMY ? 'Malaysian universities and polytechnics' : 'universities worldwide'}.
Given the text content from a university's academic calendar PDF, extract structured semester/session information.

CRITICAL RULES:
1. Some PDFs list MULTIPLE calendars by program level (e.g. "Bachelor Programme", "Master and Doctorate Programme").
   In that case, return MULTIPLE candidates so the admin can choose which program level to publish.

2. VERY IMPORTANT: Some calendars (especially Politeknik & Kolej Komuniti) have DIFFERENT date ranges for different institutes/campus groups.
   For example: "INSTITUSI A - Kedah, Kelantan dan Terengganu" vs "INSTITUSI B - Perlis, Pulau Pinang, Perak, Selangor..."
   In this case, you MUST return SEPARATE candidates for EACH institute group, each with their own dates.
   Use the "campus_group" field to identify which institute/group it belongs to (e.g. "Institusi A", "Institusi B").
   Also include "campus_group_description" with the list of states/campuses in that group.

3. If there are MULTIPLE sessions/semesters (e.g. "SESI I: 2026/2027" and "SESI II: 2026/2027"), return separate candidates for EACH session, for EACH institute group.

Return VALID JSON ONLY with this exact shape:
{
  "official_url_title": "string (document title or heading)",
  "candidates": [
    {
      "program_level": "string (e.g. 'Diploma', 'Bachelor', 'Master/Doctorate', 'Foundation', 'Sijil')",
      "campus_group": "string or null (e.g. 'Institusi A', 'Institusi B', null if not applicable)",
      "campus_group_description": "string or null (e.g. 'Kedah, Kelantan dan Terengganu')",
      "semester_label": "string (e.g. 'Sesi 1 2026/2027')",
      "start_date": "YYYY-MM-DD (first day of teaching/lectures)",
      "end_date": "YYYY-MM-DD (last day of the semester, after final exams)",
      "total_weeks": number (total teaching weeks, typically 14-16),
      "break_start_date": "YYYY-MM-DD or null (mid-semester break start)",
      "break_end_date": "YYYY-MM-DD or null (mid-semester break end)",
      "periods": [
        {
          "type": "lecture" | "test" | "exam" | "revision" | "break" | "special_break" | "holiday" | "registration" | "orientation" | "industrial_training" | "other",
          "label": "string (e.g. 'Lectures Week 1-7')",
          "startDate": "YYYY-MM-DD",
          "endDate": "YYYY-MM-DD"
        }
      ]
    }
  ]
}

Rules:
- Dates must be in YYYY-MM-DD format. Convert whatever date format appears in the source (e.g. "24 Mei 2026", "24/05/2026", "May 24, 2026").
- total_weeks should count teaching/lecture weeks only (exclude exam, break, registration weeks).
- The "periods" array should capture the full semester timeline: registration, orientation, lecture blocks, mid-sem break, revision week, exam period, etc.
- For lecture periods, split them if there is a break in between (e.g. "Lectures Week 1-7" then break then "Lectures Week 8-14").
- Every dated row of the table must become its own period. Never merge two rows into one span, and never skip a row because its type is unclear — use "other" rather than dropping it.
- A mid-semester test ("Peperiksaan Pertengahan Semester", "Mid Semester Examination") is type "test". It is a separate row: do not absorb it into the lecture block or the break next to it.
- The periods must run continuously from first to last. Apart from short weekend-sized joins there must be no unexplained gap — a gap of a week or more means a row was missed, so re-read the table and add it.
- PDF_TEXT is a flattened table: each row is a label followed by one date+duration group per semester, in column order (Semester 1, then Semester 2, then Semester 3). Emit one candidate per semester.
- A "-" or an empty group still occupies a column position. Count it, do not skip it, or every later date shifts into the wrong semester.
- Column headings ("Semester 1", "Semester 2") are often missing from the extracted text or appear far away from the rows they label. Rely on the order of the groups within each row.
- The same date is frequently repeated in Malay and again in English ("14 - 27 Sept. 2026 14th - 27th Sept. 2026"). That is one period, not two.
- Rows are not in chronological order, and unrelated content (public holidays, the document title) may be interleaved after the table. Sort the periods by date yourself.
- Source documents contain typos, usually a year that contradicts its neighbours (a revision week dated 2025 between periods in 2026). Prefer the value consistent with the surrounding sequence.
- If information is unclear or missing, use null for optional fields.
- Do NOT invent or guess dates. Only extract what is explicitly stated.
- Return JSON only. No markdown, no explanation, no code fences.`;

      const userPrompt = `Extract academic calendar information from this university PDF document.\n\nPDF_TEXT:\n${truncatedText}`;

      const aiController = new AbortController();
      const aiTimeout = setTimeout(() => aiController.abort(), 30_000);
      let aiContent = '';
      try {
        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: aiController.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0,
            max_tokens: 4000,
          }),
        });

        if (!aiRes.ok) {
          const errText = await aiRes.text();
          return json(400, { error: `OpenAI error (${aiRes.status}): ${errText.slice(0, 300)}` });
        }

        const aiJson = await aiRes.json();
        aiContent = String(aiJson?.choices?.[0]?.message?.content ?? '').trim();
      } catch (aiErr: unknown) {
        const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
        if (msg.includes('abort') || msg.includes('Abort')) {
          return json(400, { error: 'AI extraction timed out (30s). Try a simpler PDF.' });
        }
        return json(400, { error: `AI request failed: ${msg}` });
      } finally {
        clearTimeout(aiTimeout);
      }

      // Parse AI response
      const cleaned = aiContent
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(cleaned) as Record<string, unknown>;
      } catch {
        return json(400, { error: 'AI returned invalid JSON. The PDF content may be too complex. Try entering details manually.' });
      }

      // Backward-compat: wrap single calendar into candidates array
      const hasCandidates = Array.isArray((parsed as any)?.candidates);
      const hasLegacy =
        typeof (parsed as any)?.semester_label === 'string' ||
        typeof (parsed as any)?.start_date === 'string' ||
        typeof (parsed as any)?.end_date === 'string' ||
        typeof (parsed as any)?.total_weeks === 'number' ||
        Array.isArray((parsed as any)?.periods);
      if (!hasCandidates && hasLegacy) {
        (parsed as any).candidates = [
          {
            program_level: (parsed as any)?.program_level ?? 'General',
            semester_label: (parsed as any)?.semester_label,
            start_date: (parsed as any)?.start_date,
            end_date: (parsed as any)?.end_date,
            total_weeks: (parsed as any)?.total_weeks,
            break_start_date: (parsed as any)?.break_start_date ?? null,
            break_end_date: (parsed as any)?.break_end_date ?? null,
            periods: Array.isArray((parsed as any)?.periods) ? (parsed as any)?.periods : [],
          },
        ];
      }

      // Log the extraction
      const extractedLabel =
        (parsed as any)?.semester_label ??
        (Array.isArray((parsed as any)?.candidates) ? String((parsed as any)?.candidates?.[0]?.semester_label ?? '') : '') ??
        null;
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, fileName: String(payload.fileName || ''), extractedLabel },
      });

      return json(200, { extracted: parsed, text_preview: truncatedText.slice(0, 500) });
    }

    // ── Extract calendar from uploaded Image (base64) ────────────────────────
    if (action === 'extract_calendar_from_image') {
      const imageBase64 = String(payload.imageBase64 || '').trim();
      if (!imageBase64 || imageBase64.length < 100) {
        return json(400, { error: 'Missing or empty image data.' });
      }

      const openAiKey = (Deno.env.get('OPENAI_API_KEY') ?? '').trim();
      if (!openAiKey || openAiKey.length < 20) {
        return json(400, { error: 'OPENAI_API_KEY is not set in Edge Function secrets.' });
      }

      // Strip data-URL prefix if present and detect MIME type
      let rawBase64 = imageBase64;
      let detectedMime = 'image/png';
      const dataUrlMatch = imageBase64.match(/^data:(image\/[a-z+]+);base64,/i);
      if (dataUrlMatch) {
        detectedMime = dataUrlMatch[1].toLowerCase();
        rawBase64 = imageBase64.slice(dataUrlMatch[0].length);
      } else {
        try {
          const first4 = atob(rawBase64.slice(0, 8));
          if (first4.charCodeAt(0) === 0xFF && first4.charCodeAt(1) === 0xD8) {
            detectedMime = 'image/jpeg';
          } else if (first4.slice(1, 4) === 'PNG') {
            detectedMime = 'image/png';
          } else if (first4.slice(0, 4) === 'RIFF') {
            detectedMime = 'image/webp';
          }
        } catch {
          // ignore decode errors, default to png
        }
      }

      const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
      if (!allowedMimes.includes(detectedMime)) {
        return json(400, { error: `Unsupported image format: ${detectedMime}. Use PNG, JPEG, or WebP.` });
      }

      const estimatedBytes = Math.ceil(rawBase64.length * 3 / 4);
      if (estimatedBytes > 10 * 1024 * 1024) {
        return json(400, { error: 'Image is too large (max 10 MB).' });
      }

      const imageDataUrl = `data:${detectedMime};base64,${rawBase64}`;

      const isMY = isMalaysiaCountry(payload.country);
      const imgSystemPrompt = `You are an academic calendar data extractor for ${isMY ? 'Malaysian universities and polytechnics' : 'universities worldwide'}.
Given an image of a university's academic calendar (screenshot, photo, or scan), extract structured semester/session information.

CRITICAL RULES:
1. Some calendars list MULTIPLE calendars by program level (e.g. "Bachelor Programme", "Master and Doctorate Programme").
   In that case, return MULTIPLE candidates so the admin can choose which program level to publish.

2. VERY IMPORTANT: Some calendars (especially Politeknik & Kolej Komuniti) have DIFFERENT date ranges for different institutes/campus groups.
   For example: "INSTITUSI A - Kedah, Kelantan dan Terengganu" vs "INSTITUSI B - Perlis, Pulau Pinang, Perak, Selangor..."
   In this case, you MUST return SEPARATE candidates for EACH institute group, each with their own dates.
   Use the "campus_group" field to identify which institute/group it belongs to (e.g. "Institusi A", "Institusi B").
   Also include "campus_group_description" with the list of states/campuses in that group.

3. If there are MULTIPLE sessions/semesters (e.g. "SESI I: 2026/2027" and "SESI II: 2026/2027"), return separate candidates for EACH session, for EACH institute group.
   For example: Institusi A Session 1, Institusi A Session 2, Institusi B Session 1, Institusi B Session 2 = 4 candidates.

Return VALID JSON ONLY with this exact shape:
{
  "official_url_title": "string (document title or heading visible in the image)",
  "candidates": [
    {
      "program_level": "string (e.g. 'Diploma', 'Bachelor', 'Master/Doctorate', 'Foundation', 'Sijil')",
      "campus_group": "string or null (e.g. 'Institusi A', 'Institusi B', null if not applicable)",
      "campus_group_description": "string or null (e.g. 'Kedah, Kelantan dan Terengganu')",
      "semester_label": "string (e.g. 'Sesi 1 2026/2027')",
      "start_date": "YYYY-MM-DD (first day of the semester, usually registration or first lecture day)",
      "end_date": "YYYY-MM-DD (last day of the semester, end of final exam or last break day)",
      "total_weeks": number,
      "break_start_date": "YYYY-MM-DD or null (mid-semester break)",
      "break_end_date": "YYYY-MM-DD or null",
      "periods": [{ "type": "lecture|exam|break|revision|registration|orientation|industrial_training", "label": "string", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }]
    }
  ]
}
Rules: Dates must be YYYY-MM-DD. Do NOT invent dates — only use dates visible in the image. Return JSON only, no markdown.`;

      const aiController = new AbortController();
      const aiTimeout = setTimeout(() => aiController.abort(), 45_000);
      let aiContent = '';
      try {
        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: aiController.signal,
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: imgSystemPrompt },
              { role: 'user', content: [
                { type: 'text', text: 'Extract academic calendar information from this image.' },
                { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
              ]},
            ],
            temperature: 0,
            max_tokens: 4000,
          }),
        });
        if (!aiRes.ok) {
          const errText = await aiRes.text();
          return json(400, { error: `OpenAI error (${aiRes.status}): ${errText.slice(0, 300)}` });
        }
        const aiJson = await aiRes.json();
        aiContent = String(aiJson?.choices?.[0]?.message?.content ?? '').trim();
      } catch (aiErr: unknown) {
        const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
        if (msg.includes('abort') || msg.includes('Abort')) {
          return json(400, { error: 'AI extraction timed out (45s). Try a clearer image.' });
        }
        return json(400, { error: `AI request failed: ${msg}` });
      } finally {
        clearTimeout(aiTimeout);
      }

      const cleanedImg = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      let parsedImg: Record<string, unknown>;
      try {
        parsedImg = JSON.parse(cleanedImg) as Record<string, unknown>;
      } catch {
        return json(400, { error: 'AI returned invalid JSON. The image may be too blurry or complex. Try a clearer image or enter details manually.' });
      }

      // Backward-compat: wrap single calendar into candidates array
      const hasCandidatesImg = Array.isArray((parsedImg as any)?.candidates);
      const hasLegacyImg =
        typeof (parsedImg as any)?.semester_label === 'string' ||
        typeof (parsedImg as any)?.start_date === 'string' ||
        Array.isArray((parsedImg as any)?.periods);
      if (!hasCandidatesImg && hasLegacyImg) {
        (parsedImg as any).candidates = [{
          program_level: (parsedImg as any)?.program_level ?? 'General',
          semester_label: (parsedImg as any)?.semester_label,
          start_date: (parsedImg as any)?.start_date,
          end_date: (parsedImg as any)?.end_date,
          total_weeks: (parsedImg as any)?.total_weeks,
          break_start_date: (parsedImg as any)?.break_start_date ?? null,
          break_end_date: (parsedImg as any)?.break_end_date ?? null,
          periods: Array.isArray((parsedImg as any)?.periods) ? (parsedImg as any)?.periods : [],
        }];
      }

      const extractedLabelImg =
        (parsedImg as any)?.semester_label ??
        (Array.isArray((parsedImg as any)?.candidates) ? String((parsedImg as any)?.candidates?.[0]?.semester_label ?? '') : '') ??
        null;
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, fileName: String(payload.fileName || ''), extractedLabel: extractedLabelImg },
      });

      return json(200, { extracted: parsedImg, text_preview: `[Image: ${String(payload.fileName || 'upload')}]` });
    }

    if (action === 'operational_dashboard') {
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const supportTarget = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const inThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const today = now.toISOString().slice(0, 10);
      const alerts: Array<Record<string, unknown>> = [];
      const addCount = (key: string, title: string, severity: string, detail: string, route: string, result: { count: number | null; error: { message: string } | null }) => {
        alerts.push({ key, title, severity, detail, route, count: result.count ?? 0, available: !result.error, error: result.error?.message ?? null });
      };

      const [paidFree, premiumInvalid, webhookFailures, backendErrors, pdfFailures, pushFailures, calendarsExpiring, supportOverdue] = await Promise.all([
        admin.from('profiles').select('id', { count: 'exact', head: true }).eq('subscription_plan', 'free').in('subscription_status', ['trial', 'introductory', 'active', 'promotional', 'prepaid', 'cancelled', 'billing_issue', 'temporary']),
        admin.from('profiles').select('id', { count: 'exact', head: true }).in('subscription_plan', ['plus', 'pro']).in('subscription_status', ['free', 'expired', 'refunded', 'unknown']),
        admin.from('revenuecat_webhook_events').select('event_id', { count: 'exact', head: true }).in('processing_status', ['unmatched', 'conflict', 'rejected']),
        admin.from('admin_logs').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', dayAgo),
        admin.from('notes').select('id', { count: 'exact', head: true }).not('extraction_error', 'is', null),
        admin.from('admin_logs').select('id', { count: 'exact', head: true }).eq('status', 'failed').contains('meta', { action: 'community_broadcast' }).gte('created_at', dayAgo),
        admin.from('university_calendar_offers').select('id', { count: 'exact', head: true }).gte('end_date', today).lte('end_date', inThirtyDays),
        admin.from('support_reports').select('id', { count: 'exact', head: true }).is('first_admin_response_at', null).lt('created_at', supportTarget).in('status', ['open', 'in_progress']),
      ]);

      addCount('paid_showing_free', 'Paid access showing Free', 'critical', 'Profile billing state indicates access, but the effective plan is Free.', '/users', paidFree);
      addCount('premium_without_valid_state', 'Premium plan with invalid billing state', 'critical', 'Plus/Pro profiles marked expired, refunded, Free or unknown.', '/subscriptions', premiumInvalid);
      addCount('payment_webhook_failures', 'Payment webhook failures', 'critical', 'RevenueCat events that are unmatched, conflicting or rejected.', '/subscriptions', webhookFailures);
      addCount('backend_failures', 'Backend failures (24h)', 'warning', 'Failed backend/admin operations recorded in the last 24 hours.', '/logs', backendErrors);
      addCount('pdf_extraction_failures', 'PDF/note extraction failures', 'warning', 'Notes currently carrying an extraction error.', '/logs', pdfFailures);
      addCount('push_failures', 'Push notification failures (24h)', 'warning', 'Failed community broadcast push operations.', '/logs', pushFailures);
      addCount('calendars_expiring', 'Calendars ending within 30 days', 'warning', 'Published academic calendars approaching their end date.', '/academic-calendars', calendarsExpiring);
      addCount('support_response_overdue', 'Support first response overdue', 'critical', 'Open reports older than 24 hours without an admin response.', '/user-reports', supportOverdue);
      alerts.push({ key: 'unsynced_client_changes', title: 'Unsynced client changes', severity: 'info', detail: 'Client outbox telemetry is not collected server-side yet.', route: '/dashboard', count: null, available: false, error: null });
      return json(200, { generatedAt: now.toISOString(), alerts });
    }

    // ── Support reports (Settings -> Report a Problem) ───────────────────────
    // Mobile users insert their own rows under RLS into public.support_reports;
    // admins use these actions (service-role) to list + manage them from the
    // admin web app. Distinct from public.user_reports (App Store UGC).
    if (action === 'support_admins_list') {
      const { data, error: e } = await admin
        .from('admin_users')
        .select('user_id,email')
        .eq('disabled', false)
        .order('email', { ascending: true });
      if (e) return json(400, { error: e.message });
      return json(200, { items: data ?? [] });
    }

    if (action === 'list_support_reports') {
      const statusFilter = String(payload.status || 'all');
      const kindFilter = String(payload.kind || 'all');
      const queryStr = String(payload.query || '').trim();
      const lim = Math.max(1, Math.min(500, Number(payload.limit || 200)));
      const offset = Math.max(0, Number(payload.offset || 0));
      const workflowState = String(payload.workflowState || 'all');
      const assignedAdminId = String(payload.assignedAdminId || 'all');
      const dateFrom = String(payload.dateFrom || '').trim();
      const dateTo = String(payload.dateTo || '').trim();
      const sort = String(payload.sort || 'newest');

      let q = admin
        .from('support_reports')
        .select('*', { count: 'exact' })
        .order(sort === 'last_user_reply' ? 'last_user_reply_at' : 'created_at', {
          ascending: sort === 'oldest',
          nullsFirst: false,
        })
        .range(offset, offset + lim - 1);

      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (kindFilter !== 'all') q = q.eq('kind', kindFilter);
      if (workflowState !== 'all') q = q.eq('workflow_state', workflowState);
      if (assignedAdminId === 'unassigned') q = q.is('assigned_admin_id', null);
      else if (assignedAdminId !== 'all') q = q.eq('assigned_admin_id', assignedAdminId);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) q = q.gte('created_at', `${dateFrom}T00:00:00.000Z`);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) q = q.lte('created_at', `${dateTo}T23:59:59.999Z`);
      if (queryStr.length > 0) {
        // Match against subject / message / reporter snapshot fields.
        const like = `%${queryStr.replace(/[%_]/g, '\\$&')}%`;
        q = q.or(
          [
            ...(/^[0-9a-f-]{36}$/i.test(queryStr) ? [`id.eq.${queryStr}`, `reporter_id.eq.${queryStr}`] : []),
            `subject.ilike.${like}`,
            `message.ilike.${like}`,
            `reporter_name_snapshot.ilike.${like}`,
            `reporter_email_snapshot.ilike.${like}`,
            `target_user_handle.ilike.${like}`,
          ].join(','),
        );
      }

      const { data, error: e, count } = await q;
      if (e) return json(400, { error: e.message });
      return json(200, { items: data ?? [], count: count ?? 0, offset, limit: lim });
    }

    if (action === 'update_support_report_workflow') {
      const id = String(payload.id || '').trim();
      if (!id) return json(400, { error: 'missing_id' });
      const patch: Record<string, unknown> = {};
      if (payload.workflowState !== undefined) {
        const state = String(payload.workflowState);
        if (!['new', 'assigned', 'in_progress', 'waiting_user', 'waiting_engineering', 'resolved', 'closed'].includes(state)) {
          return json(400, { error: 'invalid_workflow_state' });
        }
        patch.workflow_state = state;
      }
      if (payload.assignedAdminId !== undefined) {
        const assigned = payload.assignedAdminId == null ? null : String(payload.assignedAdminId).trim() || null;
        if (assigned) {
          const { data: adminRow } = await admin.from('admin_users').select('user_id').eq('user_id', assigned).eq('disabled', false).maybeSingle();
          if (!adminRow) return json(400, { error: 'invalid_assigned_admin' });
        }
        patch.assigned_admin_id = assigned;
      }
      if (payload.internalTags !== undefined) {
        if (!Array.isArray(payload.internalTags)) return json(400, { error: 'invalid_internal_tags' });
        patch.internal_tags = [...new Set(payload.internalTags.map((tag: unknown) => String(tag).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
      }
      if (payload.escalationLevel !== undefined) {
        const level = String(payload.escalationLevel);
        if (!['none', 'normal', 'urgent'].includes(level)) return json(400, { error: 'invalid_escalation_level' });
        patch.escalation_level = level;
        patch.escalated_at = level === 'none' ? null : new Date().toISOString();
      }
      if (payload.escalationReason !== undefined) {
        patch.escalation_reason = payload.escalationReason == null
          ? null
          : String(payload.escalationReason).trim().slice(0, 1000) || null;
      }
      if (Object.keys(patch).length === 0) return json(400, { error: 'empty_patch' });
      const { data, error: e } = await admin.from('support_reports').update(patch).eq('id', id).select().single();
      if (e) return json(400, { error: e.message });
      await admin.from('admin_logs').insert({
        type: 'api_request', status: 'success',
        meta: { action, id, actor: adminUserId ?? null, fields: Object.keys(patch) },
      });
      return json(200, { row: data });
    }

    if (action === 'update_support_report_status') {
      const id = String(payload.id || '').trim();
      const newStatus = String(payload.status || '').trim();
      const notes = payload.admin_notes === null || payload.admin_notes === undefined
        ? undefined
        : String(payload.admin_notes);
      if (!id) return json(400, { error: 'missing_id' });
      if (!['open', 'in_progress', 'resolved', 'dismissed'].includes(newStatus)) {
        return json(400, { error: 'invalid_status' });
      }
      const patch: Record<string, unknown> = { status: newStatus };
      if (notes !== undefined) patch.admin_notes = notes.length > 0 ? notes : null;
      if (newStatus === 'resolved' || newStatus === 'dismissed') {
        patch.resolved_at = new Date().toISOString();
      } else {
        patch.resolved_at = null;
      }
      const { data, error: e } = await admin
        .from('support_reports')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (e) return json(400, { error: e.message });
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, id, new_status: newStatus },
      });
      return json(200, { row: data });
    }

    if (action === 'list_support_report_messages') {
      const id = String(payload.id || '').trim();
      if (!id) return json(400, { error: 'missing_id' });
      const { data, error: e } = await admin
        .from('support_report_messages')
        .select('id,report_id,author_id,author_role,body,created_at')
        .eq('report_id', id)
        .order('created_at', { ascending: true })
        .limit(200);
      if (e) return json(400, { error: e.message });
      return json(200, { items: data ?? [] });
    }

    if (action === 'reply_support_report') {
      const id = String(payload.id || '').trim();
      const body = String(payload.body || '').trim();
      const nextStatus = String(payload.status || 'in_progress').trim();
      if (!id || !body) return json(400, { error: 'missing_id_or_message' });
      if (body.length > 4000) return json(400, { error: 'message_too_long' });
      if (!['open', 'in_progress', 'resolved', 'dismissed'].includes(nextStatus)) {
        return json(400, { error: 'invalid_status' });
      }
      const { data: report, error: reportError } = await admin
        .from('support_reports')
        .select('id,reporter_id,subject')
        .eq('id', id)
        .single();
      if (reportError || !report?.reporter_id) return json(404, { error: 'report_not_found' });
      const { data: message, error: messageError } = await admin
        .from('support_report_messages')
        .insert({ report_id: id, author_id: adminUserId, author_role: 'admin', body })
        .select('id,report_id,author_id,author_role,body,created_at')
        .single();
      if (messageError) return json(400, { error: messageError.message });
      const patch: Record<string, unknown> = { status: nextStatus };
      patch.resolved_at = nextStatus === 'resolved' || nextStatus === 'dismissed'
        ? new Date().toISOString()
        : null;
      const { data: updated, error: updateError } = await admin
        .from('support_reports')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (updateError) return json(400, { error: updateError.message });
      await admin.from('in_app_notifications').insert({
        user_id: report.reporter_id,
        title: 'Reply to your support report',
        body: body.slice(0, 500),
        category: 'support',
        data: { type: 'support_reply', route: '/support-ticket', params: { reportId: id } },
      });
      await admin.from('admin_logs').insert({
        type: 'api_request', status: 'success',
        meta: { action, id, status: nextStatus, message_id: message?.id },
      });
      return json(200, { row: updated, message });
    }

    if (action === 'delete_support_report') {
      const id = String(payload.id || '').trim();
      const reason = String(payload.reason || '').trim().slice(0, 500);
      if (!id) return json(400, { error: 'missing_id' });
      if (reason.length < 5) return json(400, { error: 'reason_required' });
      const { error: e } = await admin.from('support_reports').delete().eq('id', id);
      if (e) return json(400, { error: e.message });
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, id, reason, actor: adminUserId ?? null },
      });
      return json(200, { ok: true });
    }

    // ── Crossword puzzles (admin-authored levels, id >= 31) ──────────────────
    // The mobile app reads published rows directly under RLS; every write goes
    // through here with the service role, and every write is fully
    // re-validated server-side (grid bounds, letter conflicts, and clue
    // numbering are all recomputed from scratch — never trust a client-sent
    // grid/number as authoritative for something that ships to every player).
    if (action === 'crossword_puzzles_list') {
      const { data, error: e } = await admin
        .from('crossword_puzzles')
        .select('id,title,size,solution,clues,bonus_word,bonus_hint,is_published,created_at,updated_at')
        .order('id', { ascending: true });
      if (e) return json(400, { error: e.message });
      return json(200, { items: data ?? [] });
    }

    if (action === 'crossword_puzzle_upsert') {
      const id = payload.id != null ? Number(payload.id) : null;
      const title = String(payload.title || '').trim().slice(0, 100);
      const bonusWord = String(payload.bonusWord || '').trim();
      const bonusHint = String(payload.bonusHint || '').trim();
      const isPublished = payload.isPublished === undefined ? true : !!payload.isPublished;
      const size = Math.max(5, Math.min(15, Math.trunc(Number(payload.size)) || 7));
      const words = Array.isArray(payload.words) ? payload.words : [];

      if (!title) return json(400, { error: 'Title is required.' });
      if (!bonusWord) return json(400, { error: 'Bonus word is required.' });
      if (!bonusHint) return json(400, { error: 'Bonus hint is required.' });
      if (words.length === 0) return json(400, { error: 'At least one word is required.' });
      if (id != null && (!Number.isInteger(id) || id < 31)) {
        return json(400, { error: 'Invalid puzzle id.' });
      }

      // Build the solution grid from the raw word list, checking bounds and
      // letter conflicts at every intersection.
      const solution: (string | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
      type WordInput = { answer: string; clue: string; direction: 'across' | 'down'; row: number; col: number };
      const parsedWords: WordInput[] = [];
      for (const w of words) {
        const raw = w as Record<string, unknown>;
        const answer = String(raw?.answer || '').toUpperCase().replace(/[^A-Z]/g, '');
        const clue = String(raw?.clue || '').trim();
        const direction = raw?.direction === 'down' ? 'down' : 'across';
        const row = Math.trunc(Number(raw?.row));
        const col = Math.trunc(Number(raw?.col));
        if (!answer || answer.length < 2) {
          return json(400, { error: `Word "${String(raw?.answer ?? '')}" must be at least 2 letters.` });
        }
        if (!clue) return json(400, { error: `Clue text is required for "${answer}".` });
        if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0) {
          return json(400, { error: `Invalid grid position for "${answer}".` });
        }
        const [dr, dc] = direction === 'across' ? [0, 1] : [1, 0];
        const endRow = row + dr * (answer.length - 1);
        const endCol = col + dc * (answer.length - 1);
        if (endRow >= size || endCol >= size) {
          return json(400, { error: `"${answer}" runs off the ${size}×${size} grid.` });
        }
        for (let i = 0; i < answer.length; i++) {
          const r = row + dr * i;
          const c = col + dc * i;
          const ch = answer[i];
          const existing = solution[r][c];
          if (existing != null && existing !== ch) {
            return json(400, {
              error: `"${answer}" conflicts with another word at row ${r + 1}, col ${c + 1} (${existing} vs ${ch}).`,
            });
          }
          solution[r][c] = ch;
        }
        parsedWords.push({ answer, clue, direction, row, col });
      }

      // Standard crossword numbering, recomputed from the merged grid — a
      // cell gets a number iff it starts an across run and/or a down run of
      // 2+ letters. Numbered in reading order, top-to-bottom / left-to-right.
      const startsAcross = (r: number, c: number) =>
        solution[r][c] != null && (c === 0 || solution[r][c - 1] == null) &&
        c + 1 < size && solution[r][c + 1] != null;
      const startsDown = (r: number, c: number) =>
        solution[r][c] != null && (r === 0 || solution[r - 1][c] == null) &&
        r + 1 < size && solution[r + 1][c] != null;

      const numberAt = new Map<string, number>();
      let nextNumber = 1;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (startsAcross(r, c) || startsDown(r, c)) numberAt.set(`${r},${c}`, nextNumber++);
        }
      }

      const clues: Array<{ number: number; direction: string; clue: string; answer: string; row: number; col: number }> = [];
      for (const w of parsedWords) {
        const num = numberAt.get(`${w.row},${w.col}`);
        if (num == null) {
          return json(400, {
            error: `"${w.answer}" doesn't start a numbered cell — it likely runs straight into another word with no gap. Check its position.`,
          });
        }
        clues.push({ number: num, direction: w.direction, clue: w.clue, answer: w.answer, row: w.row, col: w.col });
      }

      const row: Record<string, unknown> = {
        title, size, solution, clues,
        bonus_word: bonusWord, bonus_hint: bonusHint,
        is_published: isPublished,
        updated_at: new Date().toISOString(),
      };

      let result;
      if (id != null) {
        const { data, error: e } = await admin.from('crossword_puzzles').update(row).eq('id', id).select().single();
        if (e) return json(400, { error: e.message });
        result = data;
      } else {
        row.created_by = adminUserId;
        const { data, error: e } = await admin.from('crossword_puzzles').insert(row).select().single();
        if (e) return json(400, { error: e.message });
        result = data;
      }

      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, id: result?.id },
      });
      return json(200, { row: result });
    }

    if (action === 'crossword_puzzle_delete') {
      const id = Number(payload.id);
      if (!Number.isInteger(id) || id < 31) return json(400, { error: 'Invalid puzzle id.' });
      const { error: e } = await admin.from('crossword_puzzles').delete().eq('id', id);
      if (e) return json(400, { error: e.message });
      await admin.from('admin_logs').insert({
        type: 'api_request',
        status: 'success',
        meta: { action, id },
      });
      return json(200, { ok: true });
    }

    return json(400, { error: 'unknown_action' });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : 'unknown_error' });
  }
});
