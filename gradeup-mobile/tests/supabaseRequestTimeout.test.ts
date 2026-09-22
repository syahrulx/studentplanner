/**
 * Run: npx --yes tsx tests/supabaseRequestTimeout.test.ts
 *
 * Guards the classification that decides which Supabase requests get aborted.
 * Both directions are expensive to get wrong: leaving PostgREST and GoTrue
 * uncapped brings back the blank-screen hang (a layout gate waiting forever on
 * a request that never settles), while capping Storage or Edge Functions cuts
 * off PDF uploads and AI calls that are behaving exactly as designed.
 */
import assert from 'node:assert/strict';
import {
  FAST_PATH_TIMEOUT_MS,
  requestUrl,
  timeoutForUrl,
} from '../src/lib/supabaseRequestTimeout';

const PROJECT = 'https://ujxrtuogdialsrzxkcey.supabase.co';

// ── Capped: the paths every screen gate waits on ────────────────────────────

// PostgREST — the nine boot queries and the two profiles writes.
assert.equal(timeoutForUrl(`${PROJECT}/rest/v1/profiles?id=eq.abc`), FAST_PATH_TIMEOUT_MS);
assert.equal(timeoutForUrl(`${PROJECT}/rest/v1/tasks?select=*`), FAST_PATH_TIMEOUT_MS);

// GoTrue — the /token refresh that returned 500 through the incident.
assert.equal(timeoutForUrl(`${PROJECT}/auth/v1/token?grant_type=refresh_token`), FAST_PATH_TIMEOUT_MS);
assert.equal(timeoutForUrl(`${PROJECT}/auth/v1/user`), FAST_PATH_TIMEOUT_MS);

// An unrecognised path is capped rather than left to hang.
assert.equal(timeoutForUrl(`${PROJECT}/something/else`), FAST_PATH_TIMEOUT_MS);
assert.equal(timeoutForUrl(''), FAST_PATH_TIMEOUT_MS);

// ── Uncapped: slow on purpose ──────────────────────────────────────────────

// Storage — SOW PDFs, timetable screenshots, snap and post images.
assert.equal(timeoutForUrl(`${PROJECT}/storage/v1/object/sow-files/a.pdf`), null);
assert.equal(timeoutForUrl(`${PROJECT}/storage/v1/object/public/campus-directories/x.png`), null);

// Edge Functions — ai_generate, extract_timetable, ai_pdf_extract all run LLM
// calls well past 15s.
assert.equal(timeoutForUrl(`${PROJECT}/functions/v1/ai_generate`), null);
assert.equal(timeoutForUrl(`${PROJECT}/functions/v1/extract_timetable`), null);
assert.equal(timeoutForUrl(`${PROJECT}/functions/v1/ai_pdf_extract`), null);

// A query string must not smuggle a slow path past the cap, nor a fast one
// under it — matching is on the path segment, which appears before any '?'.
assert.equal(timeoutForUrl(`${PROJECT}/functions/v1/ai_generate?stream=1`), null);
assert.equal(timeoutForUrl(`${PROJECT}/rest/v1/notes?body=storage`), FAST_PATH_TIMEOUT_MS);

// ── URL normalisation ──────────────────────────────────────────────────────

assert.equal(requestUrl(`${PROJECT}/rest/v1/profiles`), `${PROJECT}/rest/v1/profiles`);
assert.equal(requestUrl(new URL(`${PROJECT}/functions/v1/ai_generate`)), `${PROJECT}/functions/v1/ai_generate`);
// supabase-js passes a Request on some platforms; a shape we cannot read must
// fall back to the capped default rather than throwing during a fetch.
assert.equal(requestUrl({ url: `${PROJECT}/storage/v1/object/x` } as Request), `${PROJECT}/storage/v1/object/x`);
assert.equal(requestUrl(undefined as unknown as RequestInfo), '');
assert.equal(timeoutForUrl(requestUrl(undefined as unknown as RequestInfo)), FAST_PATH_TIMEOUT_MS);

// A URL object routed through the real code path still classifies correctly.
assert.equal(timeoutForUrl(requestUrl(new URL(`${PROJECT}/storage/v1/object/sow-files/a.pdf`))), null);

console.log('supabaseRequestTimeout: all assertions passed');
