/**
 * UiTM official academic calendar (HEA), for the app.
 *
 * Asks the uitm_calendar Edge Function first: the server downloads the 1.1 MB
 * HEA page and parses it once every few hours, and the phone gets a few KB of
 * JSON back. Parsing on the phone took ~11 s on a simulator and much longer on
 * real phones, so students left before it finished and stayed on the
 * "Pending auto-sync" placeholder (593 of them by Oct 2026).
 *
 * If the server can't be reached (offline, function not deployed, timeout),
 * it falls back to downloading and parsing here, exactly as before.
 * Identical calls made close together share one request: two auto-sync paths
 * run on every launch.
 */
import { supabase } from './supabase';
import {
  HEA_CALENDAR_URL,
  parseUitmAcademicCalendar,
  parseUitmTermCodes,
  type UitmCalendarFetchResult,
  type UitmCalendarOptions,
} from './uitmHeaParser';

export type {
  UitmCalendarFetchResult,
  UitmCalendarOptions,
  UitmCalendarVariant,
  UitmTermKind,
} from './uitmHeaParser';

const SERVER_TIMEOUT_MS = 15_000;
/** How long an identical in-flight or just-finished request is shared. */
const SHARE_MS = 60_000;

const shared = new Map<string, { at: number; promise: Promise<unknown> }>();

function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = shared.get(key);
  if (hit && Date.now() - hit.at < SHARE_MS) return hit.promise as Promise<T>;
  const promise = run().catch((e) => {
    shared.delete(key);
    throw e;
  });
  shared.set(key, { at: Date.now(), promise });
  return promise;
}

type ServerReply = { ok: true; result: unknown } | { ok: false };

/** The server's answer, or { ok: false } when it could not give one. */
async function askServer(body: Record<string, unknown>): Promise<ServerReply> {
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), SERVER_TIMEOUT_MS),
    );
    const call = supabase.functions.invoke('uitm_calendar', { body });
    const { data, error } = (await Promise.race([call, timeout])) as Awaited<typeof call>;
    if (error || !data || typeof data !== 'object' || !('result' in data)) return { ok: false };
    return { ok: true, result: (data as { result: unknown }).result };
  } catch {
    return { ok: false };
  }
}

async function downloadHeaPage(): Promise<string | null> {
  const res = await fetch(HEA_CALENDAR_URL);
  if (!res.ok) return null;
  return res.text();
}

export function fetchUitmAcademicCalendar(
  group: 'A' | 'B',
  options?: UitmCalendarOptions,
): Promise<UitmCalendarFetchResult | null> {
  const key = `cal|${group}|${JSON.stringify(options ?? {})}`;
  return once(key, async () => {
    const server = await askServer({ action: 'calendar', group, options: options ?? {} });
    if (server.ok) return (server.result as UitmCalendarFetchResult | null) ?? null;
    const html = await downloadHeaPage();
    return html ? parseUitmAcademicCalendar(html, group, options) : null;
  });
}

export function fetchUitmAcademicCalendarTermCodes(group: 'A' | 'B'): Promise<string[]> {
  return once(`codes|${group}`, async () => {
    const server = await askServer({ action: 'termCodes', group });
    if (server.ok && Array.isArray(server.result)) return server.result as string[];
    const html = await downloadHeaPage();
    return html ? parseUitmTermCodes(html, group) : [];
  });
}
