import { createClient } from 'npm:@supabase/supabase-js@2';

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
- "back" = a concise but complete answer (2-3 sentences max)
- Distribute cards evenly across ALL sections of the content
- Skip trivial facts (page numbers, author bios, table of contents)

Good example:
{"front":"What is the difference between ethics and morals?","back":"Ethics are external rules provided by society or institutions, while morals are an individual's own principles of right and wrong."}

Bad example (too vague):
{"front":"What is the introduction about?","back":"It introduces the topic."}

Return ONLY a JSON array: [{"front":"...","back":"..."}]
No markdown, no explanation, ONLY the JSON array.`,
    user: `Study material:\n\n${content}`,
  };
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
): Promise<{ cards: GeneratedCard[]; usage: Record<string, number> | null; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

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
        temperature: 0.7,
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
        return callOpenAI(apiKey, systemPrompt, userPrompt, maxTokens, attempt + 1);
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
// PDF text extraction (signed URL → stream to Gemini File API, no memory)
// ---------------------------------------------------------------------------

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
    // Download PDF bytes from signed URL
    const pdfRes = await fetch(signedUrl);
    if (!pdfRes.ok) {
      return { text: '', error: `Could not access PDF (HTTP ${pdfRes.status}).` };
    }
    const pdfBytes = await pdfRes.arrayBuffer();
    if (pdfBytes.byteLength < 100) {
      return { text: '', error: 'File is too small to be a valid PDF.' };
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
          'Content-Length': String(pdfBytes.byteLength),
        },
        body: pdfBytes,
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

    await new Promise((r) => setTimeout(r, 1000));

    // Step 2: Extract text with retry on 503/429
    const maxAttempts = 3;
    let lastError = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { file_data: { mime_type: 'application/pdf', file_uri: geminiFileUri } },
                  { text: 'Extract all readable educational text from this PDF document. Return plain text only. Preserve headings and structure. Ignore file metadata, page numbers, and formatting artifacts.' },
                ],
              }],
              generationConfig: { temperature: 0, maxOutputTokens: 8192 },
            }),
          },
        );

        if (!res.ok) {
          const errText = await res.text();
          lastError = `Gemini extraction failed (${res.status}): ${errText.slice(0, 300)}`;
          if ((res.status === 503 || res.status === 429) && attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 3000 * attempt));
            continue;
          }
          return { text: '', error: lastError };
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
        if (!text) return { text: '', error: 'Could not extract text from PDF. It may be image-only or corrupted.' };

        return { text };
      } catch (err: any) {
        lastError = err?.message || 'Gemini request failed.';
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 3000 * attempt));
          continue;
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

    const maxCards = Math.min(Math.max(1, body.count ?? 12), 20);

    // ── Generate (Single Call to leverage gpt-4o-mini 128k context) ──
    const prompts = buildFlashcardPrompt(textContent, maxCards);
    const result = await callOpenAI(openAiKey, prompts.system, prompts.user, 1800);

    let allCards: GeneratedCard[] = [];
    const errors: string[] = [];

    if (result.error) {
      errors.push(result.error);
    } else {
      allCards = result.cards;
    }

    const totalPromptTokens = result.usage?.prompt_tokens ?? 0;
    const totalCompletionTokens = result.usage?.completion_tokens ?? 0;

    // Deduplicate and cap
    allCards = deduplicateCards(allCards).slice(0, maxCards);

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
