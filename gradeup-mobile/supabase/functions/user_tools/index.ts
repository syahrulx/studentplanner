// @ts-nocheck — Supabase Edge Function (Deno runtime).
// Authenticated, narrowly scoped user tools. This function never writes
// calendar/profile data and never exposes its service-role client.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { GEMINI_PREFERRED_MODELS, OPENAI_MODEL_FAST, samplingParams } from '../_shared/models.ts';
import {
  checkMonthlyTokenLimit,
  formatMonthlyLimitMessage,
  logTokenUsage,
  MONTHLY_LIMIT_ERROR_CODE,
} from '../_shared/tokenLimit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_FILE_BYTES / 3) * 4 + 16;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    if (!value || value.length > MAX_BASE64_LENGTH) return null;
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function imageMimeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 &&
    bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d &&
    bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (
    bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) return 'image/webp';
  if (bytes.length >= 6) {
    const header = String.fromCharCode(...bytes.slice(0, 6));
    if (header === 'GIF87a' || header === 'GIF89a') return 'image/gif';
  }
  return null;
}

async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    const { extractText, getDocumentProxy } = await import('npm:unpdf@0.12.1');
    const pdf = await getDocumentProxy(bytes, { verbosity: 0 });
    const { text } = await extractText(pdf, { mergePages: true });
    const cleaned = typeof text === 'string' ? text.trim() : '';
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}

async function extractScannedPdfText(
  bytes: Uint8Array,
  geminiKey: string,
): Promise<{ text: string | null; error?: string }> {
  if (!geminiKey) return { text: null, error: 'OCR is not configured.' };
  let fileName = '';
  try {
    const upload = await fetch(
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
    if (!upload.ok) return { text: null, error: `OCR upload failed (${upload.status}).` };
    const uploaded = await upload.json();
    const fileUri = String(uploaded?.file?.uri ?? '');
    fileName = String(uploaded?.file?.name ?? '');
    if (!fileUri) return { text: null, error: 'OCR upload returned no file.' };

    await new Promise((resolve) => setTimeout(resolve, 1200));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_PREFERRED_MODELS[0]}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { file_data: { mime_type: 'application/pdf', file_uri: fileUri } },
                { text: 'Extract all readable text from this academic calendar PDF. Return plain text only.' },
              ],
            }],
            generationConfig: { temperature: 0, maxOutputTokens: 8192 },
          }),
        },
      );
      if (!response.ok) return { text: null, error: `OCR failed (${response.status}).` };
      const body = await response.json();
      const parts = body?.candidates?.[0]?.content?.parts;
      const text = Array.isArray(parts)
        ? parts.map((part: any) => typeof part?.text === 'string' ? part.text : '').join('').trim()
        : '';
      return text ? { text } : { text: null, error: 'OCR found no readable text.' };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { text: null, error: message.includes('abort') ? 'OCR timed out.' : 'OCR failed unexpectedly.' };
  } finally {
    if (fileName) {
      fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${geminiKey}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
  }
}

/**
 * `test` and `special_break` used to be missing from this list, and a row the model has no type
 * for gets dropped rather than mapped to the nearest one: a UKM calendar lost its whole
 * "Peperiksaan Pertengahan Semester" week that way, leaving a hole students saw as a dead month.
 * Keep this list in sync with `AcademicPeriodType` in src/types.ts.
 */
const PERIOD_TYPES =
  'lecture|test|exam|revision|break|special_break|holiday|registration|orientation|industrial_training|other';

/**
 * Rules written against what the extracted text actually looks like. PDF text extraction flattens
 * these tables into one line per row: the row label, then one date+duration group per semester in
 * column order, with "-" for a semester the row does not apply to. The column headings are often
 * missing entirely or land far from the rows they describe, so which semester a date belongs to is
 * carried by position alone — and getting that wrong is what published a calendar whose semester
 * "started" on its own mid-semester break date.
 */
const TIMELINE_RULES = [
  'The table arrives flattened: each row is a label followed by one date+duration group per semester, in column order (Semester 1, then Semester 2, then Semester 3).',
  'A "-" or an empty group still occupies a column position — count it, do not skip it, or every later date shifts into the wrong semester.',
  'Column headings ("Semester 1", "Semester 2") are often missing from the text or appear far away from the rows. Rely on the order of the groups within each row, and emit one candidate per semester.',
  'The same date is frequently repeated in Malay and again in English ("14 - 27 Sept. 2026 14th - 27th Sept. 2026"). That is one period, not two.',
  'Rows are not in chronological order, and unrelated content (public holidays, the document title) may be interleaved after the table. Sort periods by date yourself.',
  'Every dated row of the table must become its own period — never merge two rows into one span, and never skip a row because its type is unclear (use "other").',
  'Mid-semester tests ("Peperiksaan Pertengahan Semester", "Mid Semester Examination") are type "test", not "exam" and not part of the lecture block around them.',
  'The periods must run continuously from the first to the last: apart from short weekend-sized joins, there must be no unexplained gap. A gap of a week or more means a row was missed — re-read the table and add it.',
  'Source documents contain typos, usually a year that contradicts its neighbours (a revision week dated 2025 between periods in 2026). Prefer the value consistent with the surrounding sequence.',
].join(' ');

const calendarPromptMY = `You extract academic calendars for Malaysian universities and polytechnics.
Return valid JSON only in this shape:
{"official_url_title":"string","candidates":[{"program_level":"string","campus_group":"string or null","campus_group_description":"string or null","semester_label":"string","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","total_weeks":14,"break_start_date":"YYYY-MM-DD or null","break_end_date":"YYYY-MM-DD or null","periods":[{"type":"${PERIOD_TYPES}","label":"string","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}]}]}
Return separate candidates for every program level, institute/campus group, and semester/session shown. Convert Malaysian date formats to YYYY-MM-DD. total_weeks counts teaching weeks only. ${TIMELINE_RULES} Capture the full timeline in periods, including named public holidays that fall within the semester (type "holiday", e.g. "Deepavali", "Hari Raya") — do not fold them into "break" or "other". Do not invent or infer dates that are not present. Use null for missing optional values.`;

const calendarPromptIntl = `You extract academic calendars for universities worldwide.
Return valid JSON only in this shape:
{"official_url_title":"string","candidates":[{"program_level":"string","campus_group":"string or null","campus_group_description":"string or null","semester_label":"string","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","total_weeks":14,"break_start_date":"YYYY-MM-DD or null","break_end_date":"YYYY-MM-DD or null","periods":[{"type":"${PERIOD_TYPES}","label":"string","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}]}]}
Return separate candidates for every program level, institute/campus group, and semester/session shown. Convert dates in whatever format they appear to YYYY-MM-DD. total_weeks counts teaching weeks only. ${TIMELINE_RULES} Capture the full timeline in periods, including named public/institutional holidays that fall within the semester (type "holiday") — do not fold them into "break" or "other". Do not invent or infer dates that are not present. Use null for missing optional values.`;

function calendarPromptForCountry(country: unknown): string {
  return String(country ?? 'MY').trim().toUpperCase() === 'MY' ? calendarPromptMY : calendarPromptIntl;
}

async function callOpenAI(
  openAiKey: string,
  messages: unknown[],
  model: string,
  timeoutMs: number,
): Promise<{ parsed?: Record<string, unknown>; usage?: any; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({ model, messages, ...samplingParams(model, { temperature: 0, reasoning: 'none' }), max_completion_tokens: 4000 }),
    });
    if (!response.ok) return { error: `Calendar extraction failed (${response.status}).` };
    const result = await response.json();
    const content = String(result?.choices?.[0]?.message?.content ?? '')
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim();
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (!Array.isArray((parsed as any).candidates)) {
        const legacy = parsed as any;
        if (legacy.semester_label || legacy.start_date || legacy.end_date) {
          legacy.candidates = [{
            program_level: legacy.program_level ?? 'General',
            semester_label: legacy.semester_label,
            start_date: legacy.start_date,
            end_date: legacy.end_date,
            total_weeks: legacy.total_weeks,
            break_start_date: legacy.break_start_date ?? null,
            break_end_date: legacy.break_end_date ?? null,
            periods: Array.isArray(legacy.periods) ? legacy.periods : [],
          }];
        }
      }
      if (!Array.isArray((parsed as any).candidates)) {
        return { error: 'No calendar dates were found. Please enter them manually.' };
      }
      // Prevent an unexpectedly large model response from reaching the client.
      (parsed as any).candidates = (parsed as any).candidates.slice(0, 30);
      return { parsed, usage: result?.usage };
    } catch {
      return { error: 'The calendar could not be read reliably. Please enter it manually.' };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message.includes('abort') ? 'Calendar extraction timed out.' : 'Calendar extraction request failed.' };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const openAiKey = (Deno.env.get('OPENAI_API_KEY') ?? '').trim();
    const geminiKey = (Deno.env.get('GEMINI_API_KEY') ?? '').trim();
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!supabaseUrl || !anonKey || !serviceRole || !openAiKey) {
      return json(500, { error: 'Calendar extraction is not configured.' });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json(401, { error: 'Please sign in again.' });
    const userId = authData.user.id;

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const quota = await checkMonthlyTokenLimit(admin, userId);
    if (!quota.allowed) {
      return json(429, {
        error: formatMonthlyLimitMessage(quota),
        code: MONTHLY_LIMIT_ERROR_CODE,
      });
    }

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return json(400, { error: 'Invalid request.' });
    }
    const action = String(payload.action ?? '');
    const calendarPrompt = calendarPromptForCountry(payload.country);
    let result: { parsed?: Record<string, unknown>; usage?: any; error?: string };

    if (action === 'extract_calendar_from_pdf') {
      const encoded = String(payload.pdfBase64 ?? '')
        .replace(/^data:application\/pdf;base64,/i, '')
        .trim();
      if (encoded.length < 100) return json(400, { error: 'The PDF is empty.' });
      if (encoded.length > MAX_BASE64_LENGTH) return json(413, { error: 'PDF is too large (max 10 MB).' });
      const bytes = decodeBase64(encoded);
      if (!bytes || bytes.byteLength > MAX_FILE_BYTES) return json(400, { error: 'The PDF could not be decoded.' });
      if (
        bytes.byteLength < 5 || bytes[0] !== 0x25 || bytes[1] !== 0x50 ||
        bytes[2] !== 0x44 || bytes[3] !== 0x46 || bytes[4] !== 0x2d
      ) {
        return json(400, { error: 'The selected file is not a valid PDF.' });
      }
      const nativeText = await extractPdfText(bytes);
      const ocr = nativeText ? { text: null } : await extractScannedPdfText(bytes, geminiKey);
      const text = nativeText ?? ocr.text ?? '';
      if (text.trim().length < 100) {
        return json(400, { error: ocr.error ?? 'No readable calendar text was found in this PDF.' });
      }
      result = await callOpenAI(openAiKey, [
        { role: 'system', content: calendarPrompt },
        { role: 'user', content: `Extract the calendar from this PDF text:\n\n${text.trim().slice(0, 18000)}` },
      ], OPENAI_MODEL_FAST, 30_000);
    } else if (action === 'extract_calendar_from_image') {
      const image = String(payload.imageBase64 ?? '').trim();
      const match = image.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i);
      if (!match) return json(400, { error: 'Use a PNG, JPEG, WebP, or GIF image.' });
      const raw = match[2].replace(/\s/g, '');
      if (raw.length > MAX_BASE64_LENGTH) return json(413, { error: 'Image is too large (max 10 MB).' });
      const bytes = decodeBase64(raw);
      if (!bytes || bytes.byteLength < 20 || bytes.byteLength > MAX_FILE_BYTES) {
        return json(400, { error: 'The image could not be decoded.' });
      }
      const actualMime = imageMimeFromBytes(bytes);
      if (!actualMime) return json(400, { error: 'The selected file is not a valid image.' });
      const claimedMime = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
      if (claimedMime !== actualMime) return json(400, { error: 'The image type does not match its contents.' });
      const dataUrl = `data:${actualMime};base64,${raw}`;
      result = await callOpenAI(openAiKey, [
        { role: 'system', content: calendarPrompt },
        { role: 'user', content: [
          { type: 'text', text: 'Extract the academic calendar from this image.' },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ] },
      ], OPENAI_MODEL_FAST, 45_000);
    } else {
      return json(400, { error: 'Unsupported action.' });
    }

    if (result.error || !result.parsed) return json(400, { error: result.error ?? 'Extraction failed.' });
    await logTokenUsage(admin, {
      user_id: userId,
      kind: action === 'extract_calendar_from_pdf' ? 'calendar_pdf_extraction' : 'calendar_image_extraction',
      model: OPENAI_MODEL_FAST,
      prompt_tokens: result.usage?.prompt_tokens ?? null,
      completion_tokens: result.usage?.completion_tokens ?? null,
      total_tokens: result.usage?.total_tokens ?? null,
    });
    return json(200, { extracted: result.parsed });
  } catch {
    return json(500, { error: 'Calendar extraction failed unexpectedly. No calendar data was changed.' });
  }
});
