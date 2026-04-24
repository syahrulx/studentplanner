// Shared CORS helper for admin-surface edge functions.
//
// Behaviour:
//   - The env var `ADMIN_WEB_ALLOWED_ORIGINS` holds a comma-separated allowlist
//     (e.g. "https://admin.rencana.app,http://localhost:5173"). If the incoming
//     Origin matches, we echo it back. Otherwise we fall back to the first
//     entry in the list so browsers outside the allowlist get a fixed,
//     non-matching origin and the preflight fails cleanly.
//   - If the env var is missing, we default to `*` so deploys don't break, but
//     log a warning so you know to configure it.
//
// Deploy:
//   supabase secrets set ADMIN_WEB_ALLOWED_ORIGINS="https://admin.rencana.app,http://localhost:5173"

const DEFAULT_FALLBACK = 'https://admin.rencana.app';

function parseAllowlist(): string[] {
  const raw = (Deno.env.get('ADMIN_WEB_ALLOWED_ORIGINS') ?? '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  const allowlist = parseAllowlist();
  const reqOrigin = req.headers.get('origin') ?? '';

  let allowOrigin: string;
  if (allowlist.length === 0) {
    // Missing configuration — keep permissive for backward compatibility but
    // never in combination with credentials. The internal admin check still
    // enforces authorization.
    allowOrigin = '*';
  } else if (allowlist.includes(reqOrigin)) {
    allowOrigin = reqOrigin;
  } else {
    allowOrigin = allowlist[0] ?? DEFAULT_FALLBACK;
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
  };
}
