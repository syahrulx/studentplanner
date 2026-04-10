import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestBody {
  /** 'text' = generate from raw note content, 'pdf_storage' = download from Storage first */
  source: 'text' | 'pdf_storage';
  /** Raw note content (for source=text) or fallback text */
  content?: string;
  /** Supabase Storage path (for source=pdf_storage) */
  storage_path?: string;
  /** Storage bucket name (default: note-attachments) */
  bucket?: string;
  /** Max flashcards to return */
  count?: number;
  /** Note ID for cache key (optional) */
  note_id?: string;
}

interface GeneratedCard {
  front: string;
  back: string;
}

// ---------------------------------------------------------------------------
// CORS & Response helpers
// ---------------------------------------------------------------------------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorJson(message: string, code = 'ERROR', status = 200) {
  return json({ error: { message, code } }, status);
}

// ---------------------------------------------------------------------------
// Rate limiting — operation-level (1 per user tap, not per chunk)
// ---------------------------------------------------------------------------

const DAILY_LIMIT_FREE = 20;
const DAILY_LIMIT_PLUS = 100;
const DAILY_LIMIT_PRO = 500;

async function checkRateLimit(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  plan: string,
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Only count generation calls (flashcard + quiz), not PDF text extraction
  const { count, error } = await supabaseAdmin
    .from('ai_token_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('kind', 'pdf_text_extraction')
    .gte('created_at', todayStart.toISOString());

  const used = error ? 0 : (count ?? 0);
  const limit =
    plan === 'pro'
      ? DAILY_LIMIT_PRO
      : plan === 'plus'
        ? DAILY_LIMIT_PLUS
        : DAILY_LIMIT_FREE;

  return { allowed: used < limit, used, limit };
}



// ---------------------------------------------------------------------------
// Flashcard prompt
// ---------------------------------------------------------------------------

function buildFlashcardPrompt(content: string, count: number): { system: string; user: string } {
  return {
    system: `You are an expert university-level study assistant creating flashcards for exam preparation.

Generate exactly ${count} flashcards from the provided content.

Rules:
- Target university/college students — assume the reader is studying for exams
- Focus on definitions, key concepts, formulas, important distinctions, and exam-likely content
- Each card tests ONE specific concept — no compound questions
- "front" = a clear, specific question or prompt (not vague like "What is Chapter 1 about?")
- "back" MUST read like a real flashcard answer — ultra short:
  - Exactly ONE short sentence OR at most TWO micro-bullets (each bullet ≤ 8 words)
  - No semicolons joining two full ideas (use two cards instead)
  - No long paragraphs; no "first X, then Y" chains in one back
  - Hard limits: ~15 words AND ≤120 characters (including spaces)
- Distribute cards evenly across ALL sections of the content
- Skip trivial facts (page numbers, author bios, table of contents)

Good example:
{"front":"Ethics vs morals?","back":"Ethics: society’s rules. Morals: your own."}

Another good example (single sentence):
{"front":"What is a smart device?","back":"A device that senses, processes data, and can act or adapt."}

Bad example (too vague):
{"front":"What is the introduction about?","back":"It introduces the topic."}

Return ONLY a JSON array: [{"front":"...","back":"..."}]
No markdown, no explanation, ONLY the JSON array.`,
    user: `Study material:\n\n${content}`,
  };
}

function compactText(s: string): string {
  return String(s || '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const BACK_MAX_CHARS = 120;
const BACK_MAX_WORDS = 15;

function truncateWords(s: string, maxWords: number): string {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return words.slice(0, maxWords).join(' ') + '…';
}

function clampBack(back: string): string {
  let s = compactText(back);
  if (!s) return s;

  // Bullets: keep at most 2 short lines
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  const bulletLines = lines.filter((l) => /^[-*•]/.test(l));
  if (bulletLines.length) {
    const kept = bulletLines
      .slice(0, 2)
      .map((l) => {
        const body = l.replace(/^[-*•]\s*/, '').trim();
        return `- ${truncateWords(body, 10)}`;
      })
      .join('\n');
    s = kept.length > BACK_MAX_CHARS ? kept.split('\n')[0] ?? kept : kept;
    if (s.length > BACK_MAX_CHARS) s = s.slice(0, BACK_MAX_CHARS - 1).trimEnd() + '…';
  } else {
    // Prefer first clause before semicolon if the line is long (compound “flashcard paragraph”)
    if (s.includes(';') && s.length > BACK_MAX_CHARS) {
      const first = s.split(';')[0]?.trim() ?? s;
      if (first.length >= 20) s = first;
    }
    // First sentence only
    const sentences = s.split(/(?<=[.!?])\s+/).filter(Boolean);
    s = sentences[0]?.trim() ?? s;
  }

  s = truncateWords(s, BACK_MAX_WORDS);
  if (s.length > BACK_MAX_CHARS) {
    s = s.slice(0, BACK_MAX_CHARS - 1).trimEnd() + '…';
  }
  return s;
}

function sanitizeCards(cards: GeneratedCard[]): GeneratedCard[] {
  return cards
    .map((c) => ({
      front: compactText(c.front).slice(0, 180),
      back: clampBack(c.back),
    }))
    .filter((c) => c.front.length >= 6 && c.back.length >= 6);
}

// ---------------------------------------------------------------------------
// OpenAI call with retry
// ---------------------------------------------------------------------------

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  attempt = 1,
  timeoutMs = 45_000,
): Promise<{ cards: GeneratedCard[]; usage: Record<string, number> | null; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.35,
        max_tokens: maxTokens,
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      let errMsg = `OpenAI error (${res.status}).`;
      try {
        const parsed = JSON.parse(errText);
        const inner = parsed?.error?.message ? String(parsed.error.message) : '';
        if (inner) errMsg = `OpenAI error (${res.status}): ${inner}`;
      } catch {
        errMsg = `OpenAI error (${res.status}): ${errText.slice(0, 220)}`;
      }

      // Retry on rate limit (429) only once with short backoff.
      if (res.status === 429 && attempt < 2) {
        const secMatch = errMsg.match(/try again in\s*([0-9.]+)s/i);
        const hintedMs = secMatch ? Math.ceil(Number(secMatch[1]) * 1000) : null;
        const backoffMs = hintedMs != null ? Math.min(4000, hintedMs + 250) : 1200;
        await new Promise((r) => setTimeout(r, backoffMs));
        return callOpenAI(apiKey, systemPrompt, userPrompt, maxTokens, attempt + 1, timeoutMs);
      }

      return { cards: [], usage: null, error: errMsg };
    }

    const data = await res.json();
    const content = (data?.choices?.[0]?.message?.content ?? '').trim();
    const usage = data?.usage ?? null;

    // Parse cards
    const cleaned = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { cards: [], usage, error: 'AI returned invalid JSON for this chunk.' };
    }

    if (!Array.isArray(parsed)) {
      return { cards: [], usage, error: 'AI returned unexpected format.' };
    }

    const cards: GeneratedCard[] = parsed
      .filter((c: any) => c?.front?.trim() && c?.back?.trim())
      .map((c: any) => ({ front: String(c.front).trim(), back: String(c.back).trim() }));

    return { cards, usage };
  } catch (err: any) {
    clearTimeout(timeout);
    if (err?.name === 'AbortError') {
      return { cards: [], usage: null, error: 'AI generation timed out. Please try again.' };
    }
    return { cards: [], usage: null, error: err?.message || 'OpenAI request failed' };
  }
}

// ---------------------------------------------------------------------------
// PDF text extraction (signed URL → Gemini File API)
// ---------------------------------------------------------------------------

/** Models that support generateContent for this API key (avoids hardcoding deprecated IDs). */
async function listAvailableGeminiModels(geminiKey: string): Promise<string[] | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = await res.json();
    const models = Array.isArray(json?.models) ? json.models : [];
    const names = models
      .map((m: any) => ({ name: String(m?.name || ''), methods: m?.supportedGenerationMethods }))
      .filter((m: any) => m.name && Array.isArray(m.methods) && m.methods.includes('generateContent'))
      .map((m: any) => m.name.replace(/^models\//, ''));
    return names.length ? names : null;
  } catch {
    clearTimeout(t);
    return null;
  }
}

const GEMINI_PREFERRED_MODELS = [
  'gemini-3.1-flash',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
];

/** Large PDFs: stay under Edge gateway timeouts (avoid HTTP 504). */
const LARGE_PDF_HEADER_BYTES = 8 * 1024 * 1024;
const LARGE_PDF_BODY_BYTES = 6 * 1024 * 1024;
const LARGE_PDF_MAX_PAGES = 12;
/** One long attempt fits Edge wall-clock better than two sequential long attempts. */
const LARGE_GEMINI_TIMEOUT_MS = 78_000;
const LARGE_GEMINI_MAX_OUTPUT = 4096;
const LARGE_GEMINI_MAX_MODELS = 1;
const LARGE_GEMINI_MAX_ATTEMPTS = 1;
/** If ListModels fails, try 2 IDs with shorter per-call timeouts (404 fallback without blowing wall-clock). */
const LARGE_GEMINI_FALLBACK_MODELS = 2;
const LARGE_GEMINI_FALLBACK_TIMEOUT_MS = 38_000;

async function extractPdfText(
  supabaseAdmin: ReturnType<typeof createClient>,
  storagePath: string,
  bucket: string,
  geminiKey: string,
): Promise<{ text: string; error?: string }> {
  // Generate signed URL — edge function never downloads the PDF
  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(storagePath, 600);

  if (signedError || !signedData?.signedUrl) {
    return { text: '', error: signedError?.message || 'Could not generate signed URL.' };
  }

  const signedUrl = signedData.signedUrl;
  let geminiFileUri = '';
  let geminiFileName = '';

  try {
    // Overlap model discovery with PDF download to save wall-clock time (504 on big files).
    const modelsListPromise = listAvailableGeminiModels(geminiKey);

    const pdfRes = await fetch(signedUrl);
    if (!pdfRes.ok) {
      return { text: '', error: `Could not access PDF (HTTP ${pdfRes.status}).` };
    }
    const contentLengthHeader = pdfRes.headers.get('content-length');
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
    let isLikelyLargePdf = Number.isFinite(contentLength) && contentLength > LARGE_PDF_HEADER_BYTES;
    // Guardrail: extremely large PDFs can crash Edge memory limits.
    // If we know it's huge, fail with a clearer message.
    if (Number.isFinite(contentLength) && contentLength > 25 * 1024 * 1024) {
      return {
        text: '',
        error:
          `PDF is too large to process right now (${Math.round(contentLength / (1024 * 1024))}MB). ` +
          `Try compressing/splitting the PDF, or export only the pages you need.`,
      };
    }

    // For reliability, buffer PDFs into memory for upload.
    const pdfBytes = await pdfRes.arrayBuffer();
    if (pdfBytes.byteLength < 100) {
      return { text: '', error: 'File is too small to be a valid PDF.' };
    }

    if (!isLikelyLargePdf && pdfBytes.byteLength > LARGE_PDF_BODY_BYTES) {
      isLikelyLargePdf = true;
    }

    // For very long/large PDFs, OCR + upload + Gemini can exceed Edge limits. Trim to first N pages.
    let uploadU8: Uint8Array = new Uint8Array(pdfBytes);
    if (isLikelyLargePdf) {
      try {
        const src = await PDFDocument.load(uploadU8);
        const total = src.getPageCount();
        const take = Math.min(LARGE_PDF_MAX_PAGES, total);
        if (total > take) {
          const out = await PDFDocument.create();
          const pages = await out.copyPages(src, Array.from({ length: take }, (_, i) => i));
          for (const p of pages) out.addPage(p);
          // IMPORTANT: use the exact Uint8Array bytes, not .buffer (can include extra unused bytes)
          uploadU8 = await out.save();
        }
      } catch {
        uploadU8 = new Uint8Array(pdfBytes);
      }
    }

    // Upload to Gemini File API (simple raw upload — single POST)
    const uploadRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`,
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'raw',
          'X-Goog-Upload-Header-Content-Type': 'application/pdf',
          'Content-Type': 'application/pdf',
          'Content-Length': String(uploadU8.byteLength),
        },
        body: uploadU8,
      },
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return { text: '', error: `Gemini upload failed (${uploadRes.status}): ${errText.slice(0, 200)}` };
    }

    const uploadJson = await uploadRes.json();
    geminiFileUri = uploadJson?.file?.uri ?? '';
    geminiFileName = uploadJson?.file?.name ?? '';
    if (!geminiFileUri) return { text: '', error: 'Gemini upload returned no URI.' };

    await new Promise((r) => setTimeout(r, isLikelyLargePdf ? 500 : 1000));

    const available = await modelsListPromise;
    let modelsToTryFull = available
      ? GEMINI_PREFERRED_MODELS.filter((m) => available.includes(m))
      : GEMINI_PREFERRED_MODELS;
    if (available?.length && modelsToTryFull.length === 0) {
      modelsToTryFull = available.slice(0, 8);
    }
    const largeModelCount = available ? LARGE_GEMINI_MAX_MODELS : LARGE_GEMINI_FALLBACK_MODELS;
    const modelsToTry = isLikelyLargePdf
      ? modelsToTryFull.slice(0, largeModelCount)
      : modelsToTryFull;
    const maxAttempts = isLikelyLargePdf ? LARGE_GEMINI_MAX_ATTEMPTS : 3;
    let lastError = '';

    for (const modelName of modelsToTry) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          // Big/long PDFs can time out if we try to OCR "everything".
          // We only need enough high-signal text to generate flashcards.
          const boundedExtract =
            'Extract educational text needed for flashcards. Return plain text only (no markdown). ' +
            'Preserve headings and structure. Prioritize definitions, key concepts, formulas, and bullet points. ' +
            'Skip indices, page numbers, repeated headers/footers, and long boilerplate.';

          const firstPagesOnly =
            isLikelyLargePdf
              ? `IMPORTANT: This is a long PDF; only the first ~${LARGE_PDF_MAX_PAGES} pages are attached. Extract key study text from those pages only. `
              : '';

          const ocrInstruction =
            'If the PDF pages are images/scans, perform OCR to read the text. ';

          const prompt =
            attempt === 1
              ? (firstPagesOnly + ocrInstruction + boundedExtract)
              : (firstPagesOnly + 'This PDF may be scanned/image-based. Perform OCR. ' + boundedExtract);

          const controller = new AbortController();
          const timeoutMs = isLikelyLargePdf
            ? (available ? LARGE_GEMINI_TIMEOUT_MS : LARGE_GEMINI_FALLBACK_TIMEOUT_MS)
            : 120_000;
          const t = setTimeout(() => controller.abort(), timeoutMs);

          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { file_data: { mime_type: 'application/pdf', file_uri: geminiFileUri } },
                    { text: prompt },
                  ],
                }],
                generationConfig: {
                  temperature: 0,
                  maxOutputTokens: isLikelyLargePdf ? LARGE_GEMINI_MAX_OUTPUT : 8192,
                },
              }),
            },
          );
          clearTimeout(t);

          if (!res.ok) {
            const errText = await res.text();
            lastError = `Gemini extraction failed (${modelName}, HTTP ${res.status}): ${errText.slice(0, 300)}`;
            if ((res.status === 503 || res.status === 429) && attempt < maxAttempts) {
              await new Promise((r) => setTimeout(r, 3000 * attempt));
              continue;
            }
            break; // try next model
          }

          const aiJson = await res.json();
          let text = '';
          const candidates = aiJson?.candidates;
          if (Array.isArray(candidates)) {
            for (const candidate of candidates) {
              const parts = candidate?.content?.parts;
              if (Array.isArray(parts)) {
                for (const part of parts) {
                  if (typeof part?.text === 'string') text += part.text;
                }
              }
            }
          }

          text = text.trim().slice(0, 120_000);
          if (!text) {
            lastError = `No text extracted (${modelName}).`;
            if (attempt < maxAttempts) {
              await new Promise((r) => setTimeout(r, 1500 * attempt));
              continue;
            }
            break;
          }

          return { text };
        } catch (err: any) {
          lastError = err?.name === 'AbortError'
            ? `PDF extraction timed out (${modelName}).`
            : (err?.message || `Gemini request failed (${modelName}).`);
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 3000 * attempt));
            continue;
          }
        }
      }
    }

    return { text: '', error: lastError || 'PDF extraction failed after retries.' };
  } catch (err: any) {
    return { text: '', error: err?.message || 'PDF extraction failed.' };
  } finally {
    if (geminiFileName) {
      fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiFileName}?key=${geminiKey}`, { method: 'DELETE' }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function deduplicateCards(cards: GeneratedCard[]): GeneratedCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = card.front.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Config ──
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const openAiKey = (Deno.env.get('OPENAI_API_KEY') ?? '').trim();
    const geminiKey = (Deno.env.get('GEMINI_API_KEY') ?? '').trim();
    const authHeader = req.headers.get('Authorization') ?? '';

    if (!supabaseUrl || !supabaseAnon) {
      return errorJson('Missing Supabase config in Edge Function environment.', 'CONFIG');
    }
    if (!openAiKey || openAiKey.length < 20) {
      return errorJson(
        'OPENAI_API_KEY is not set in Edge Function secrets.',
        'CONFIG',
      );
    }

    // ── Auth ──
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!bearer) {
      return errorJson('Unauthorized: missing bearer token.', 'UNAUTHORIZED', 401);
    }

    const authClient = serviceRole
      ? createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
      : createClient(supabaseUrl, supabaseAnon, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

    const { data: authData, error: authError } = serviceRole
      ? await authClient.auth.getUser(bearer)
      : await authClient.auth.getUser();

    if (authError || !authData.user) {
      return errorJson(
        `Unauthorized: ${authError?.message ?? 'token rejected'}`,
        'UNAUTHORIZED',
        401,
      );
    }

    const userId = authData.user.id;

    // ── Parse body ──
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return errorJson('Invalid JSON body.', 'BAD_REQUEST');
    }

    const source = body.source;
    if (!source || !['text', 'pdf_storage'].includes(source)) {
      return errorJson('Invalid "source". Must be: text or pdf_storage.', 'BAD_REQUEST');
    }

    // ── Rate limit ──
    const supabaseAdmin = serviceRole
      ? createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
      : authClient;

    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('subscription_plan')
      .eq('id', userId)
      .maybeSingle();

    const plan = profileData?.subscription_plan ?? 'free';
    const rateCheck = await checkRateLimit(supabaseAdmin, userId, plan);
    if (!rateCheck.allowed) {
      return errorJson(
        `Daily AI limit reached (${rateCheck.used}/${rateCheck.limit}). Upgrade your plan or try again tomorrow.`,
        'RATE_LIMIT',
      );
    }

    // ── Resolve content ──
    let textContent = '';

    if (source === 'pdf_storage') {
      const storagePath = (body.storage_path ?? '').trim();
      const bucket = (body.bucket ?? 'note-attachments').trim();

      if (!storagePath) {
        return errorJson('storage_path is required for pdf_storage source.', 'BAD_REQUEST');
      }
      if (!storagePath.startsWith(`${userId}/`)) {
        return errorJson('Invalid storage path for this user.', 'FORBIDDEN');
      }

      // Check DB cache first — avoid redundant OpenAI call
      if (body.note_id) {
        const { data: cachedNote } = await supabaseAdmin
          .from('notes')
          .select('extracted_text')
          .eq('id', body.note_id)
          .eq('user_id', userId)
          .maybeSingle();
        if (cachedNote?.extracted_text?.trim()) {
          textContent = cachedNote.extracted_text.trim();
        }
      }

      if (!textContent) {
        if (!geminiKey) {
          return errorJson('GEMINI_API_KEY is not set. Required for PDF extraction.', 'CONFIG');
        }
        const extraction = await extractPdfText(supabaseAdmin, storagePath, bucket, geminiKey);
        if (extraction.error || !extraction.text.trim()) {
          return errorJson(
            extraction.error || 'Could not extract text from PDF.',
            'PDF_EXTRACT_FAILED',
          );
        }
        textContent = extraction.text;
        // Cache for next flashcard run (skips slow PDF/Gemini path; helps after transient 504s).
        if (body.note_id) {
          void supabaseAdmin
            .from('notes')
            .update({ extracted_text: extraction.text.trim() })
            .eq('id', body.note_id)
            .eq('user_id', userId);
        }
      }
    } else {
      textContent = (body.content ?? '').trim();
    }

    if (!textContent || textContent.length < 20) {
      return errorJson('Content is too short for flashcard generation.', 'BAD_REQUEST');
    }

    // Cap content
    const MAX_CONTENT = 12_000;
    textContent = textContent.slice(0, MAX_CONTENT);

    const planMax =
      plan === 'pro'
        ? 35
        : plan === 'plus'
          ? 20
          : 10;
    const defaultCount = plan === 'pro' ? 25 : plan === 'plus' ? 15 : 8;
    const maxCards = Math.min(Math.max(1, body.count ?? defaultCount), planMax);

    // ── Generate (Single Call to leverage gpt-4o-mini 128k context) ──
    const prompts = buildFlashcardPrompt(textContent, maxCards);
    const openAiTimeoutMs = source === 'pdf_storage' ? 32_000 : 45_000;
    const result = await callOpenAI(openAiKey, prompts.system, prompts.user, 1800, 1, openAiTimeoutMs);

    let allCards: GeneratedCard[] = [];
    const errors: string[] = [];

    if (result.error) {
      errors.push(result.error);
    } else {
      allCards = result.cards;
    }

    const totalPromptTokens = result.usage?.prompt_tokens ?? 0;
    const totalCompletionTokens = result.usage?.completion_tokens ?? 0;

    // Normalize, deduplicate and cap
    allCards = deduplicateCards(sanitizeCards(allCards)).slice(0, maxCards);

    // ── Log usage ──
    supabaseAdmin
      .from('ai_token_usage')
      .insert({
        user_id: userId,
        kind: 'flashcard_generation',
        model: 'gpt-4o-mini',
        prompt_tokens: totalPromptTokens || null,
        completion_tokens: totalCompletionTokens || null,
        total_tokens: (totalPromptTokens + totalCompletionTokens) || null,
      })
      .then(() => {}, () => {});

    // ── Return ──
    if (allCards.length === 0 && errors.length > 0) {
      return errorJson(
        `Failed to generate flashcards: ${errors[0]}`,
        'GENERATION_FAILED',
      );
    }

    return json({
      cards: allCards,
      usage: {
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        total_tokens: totalPromptTokens + totalCompletionTokens,
        chunks_processed: 1,
      },
      ...(errors.length > 0 ? { warnings: errors.slice(0, 3) } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return errorJson(message, 'INTERNAL');
  }
});
