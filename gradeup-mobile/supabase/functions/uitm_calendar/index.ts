// @ts-nocheck — Deno edge function; runs on Supabase Deno runtime, not the RN TS compiler.
//
// UiTM official academic calendar for the app.
//
// The app used to download UiTM's 1.1 MB HEA page and parse it on the phone,
// which took ~11 s even on a simulator; students left before it finished and
// 593 of them stayed on the "Pending auto-sync" placeholder (Oct 2026). Here
// the server downloads and parses it, and the phone gets a few KB of JSON.
//
// The page is kept for 6 hours per instance and each answer for the rest of
// that window, so HEA is fetched a few times a day, not once per student.
//
// Reads ONE fixed public URL. Takes no URL from the caller, stores nothing,
// sends no student data anywhere. Inputs are checked against short allowlists
// so callers can't grow the cache.
//
// Same parser as the app: _shared/uitmHeaParser.ts is generated from
// src/lib/uitmHeaParser.ts by scripts/sync-uitm-hea-parser.js.
//
// Deploy: npx supabase functions deploy uitm_calendar

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  HEA_CALENDAR_URL,
  parseUitmAcademicCalendar,
  parseUitmTermCodes,
} from '../_shared/uitmHeaParser.ts';

const CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_BYTES = 5 * 1024 * 1024;

// Read-only public data, no cookies: any origin may ask (the student web app too).
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

let page: { html: string; fetchedAt: number } | null = null;
let pageLoading: Promise<string> | null = null;
const answers = new Map<string, unknown>();

async function heaPage(): Promise<string> {
  if (page && Date.now() - page.fetchedAt < CACHE_MS) return page.html;
  if (pageLoading) return pageLoading;
  pageLoading = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(HEA_CALENDAR_URL, {
        signal: controller.signal,
        headers: { accept: 'text/html', 'user-agent': 'Rencana/1.0 (academic calendar)' },
      });
      if (!res.ok) throw new Error(`hea_http_${res.status}`);
      const html = await res.text();
      if (html.length > MAX_BYTES) throw new Error('hea_page_too_large');
      page = { html, fetchedAt: Date.now() };
      answers.clear(); // new page, new answers
      return html;
    } catch (err) {
      // A stale page beats no page: UiTM's site goes down now and then.
      if (page) return page.html;
      throw err;
    } finally {
      clearTimeout(timer);
      pageLoading = null;
    }
  })();
  return pageLoading;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const VARIANTS = new Set(['auto', 'standard', 'kkt']);
const TERM_KINDS = new Set(['auto', 'normal', 'short']);

function cleanOptions(raw: unknown) {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  if (typeof o.targetDateISO === 'string' && ISO.test(o.targetDateISO)) out.targetDateISO = o.targetDateISO;
  if (typeof o.preferredTermCode === 'string' && /^\d{5}$/.test(o.preferredTermCode.trim())) {
    out.preferredTermCode = o.preferredTermCode.trim();
  }
  if (typeof o.variant === 'string' && VARIANTS.has(o.variant)) out.variant = o.variant;
  if (typeof o.termKind === 'string' && TERM_KINDS.has(o.termKind)) out.termKind = o.termKind;
  return out;
}

serve(async (req: Request) => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json; charset=utf-8' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: 'bad_json' });
  }

  const group = payload.group;
  if (group !== 'A' && group !== 'B') return json(400, { error: 'bad_group' });
  const action = payload.action;
  if (action !== 'calendar' && action !== 'termCodes') return json(400, { error: 'bad_action' });

  const options = action === 'calendar' ? cleanOptions(payload.options) : {};
  const key = `${action}|${group}|${JSON.stringify(options)}`;

  try {
    const html = await heaPage();
    if (!answers.has(key)) {
      // A few real keys a day; a hard cap keeps odd inputs from piling up.
      if (answers.size >= 500) answers.clear();
      answers.set(
        key,
        action === 'calendar' ? parseUitmAcademicCalendar(html, group, options) : parseUitmTermCodes(html, group),
      );
    }
    return json(200, { result: answers.get(key) ?? null, fetched_at: new Date(page!.fetchedAt).toISOString() });
  } catch (err) {
    // The app falls back to reading HEA itself when this fails.
    return json(502, { error: `hea_unreachable: ${(err as Error).message}` });
  }
});
