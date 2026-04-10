import { createClient } from 'npm:@supabase/supabase-js@2';

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

function errorJson(message: string, code = 'ERROR') {
  return json({ error: { message, code } });
}

// ---------------------------------------------------------------------------
// Gemini extraction via signed URL (edge function never holds PDF in memory)
// ---------------------------------------------------------------------------

async function extractViaGemini(
  signedUrl: string,
  geminiKey: string,
): Promise<{ text: string; usage?: any; error?: string }> {
  // Download PDF bytes from signed URL
  const pdfRes = await fetch(signedUrl);
  if (!pdfRes.ok) {
    return { text: '', error: `Could not access PDF (HTTP ${pdfRes.status}).` };
  }
  const pdfBytes = await pdfRes.arrayBuffer();
  if (pdfBytes.byteLength < 100) {
    return { text: '', error: 'File is too small to be a valid PDF.' };
  }

  // Upload to Gemini File API (simple media upload — single POST)
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
  const geminiFileUri = uploadJson?.file?.uri ?? '';
  const geminiFileName = uploadJson?.file?.name ?? '';

  if (!geminiFileUri) {
    return { text: '', error: 'Gemini upload returned no file URI.' };
  }

  // Brief wait for Gemini to process the file
  await new Promise((r) => setTimeout(r, 1000));

  // Step 2: Ask Gemini to extract text (with retry on 503/429)
  const maxAttempts = 3;
  let lastError = '';

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            signal: controller.signal,
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

        clearTimeout(timeout);

        if (!res.ok) {
          const errText = await res.text();
          lastError = `Gemini error (${res.status}): ${errText.slice(0, 400)}`;

          // Retry on 503 (overloaded) or 429 (rate limit)
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

        return {
          text: text.trim().slice(0, 120_000),
          usage: aiJson?.usageMetadata,
        };
      } catch (err: any) {
        clearTimeout(timeout);
        lastError = err?.name === 'AbortError' ? 'Gemini timed out.' : (err?.message || 'Gemini request failed.');
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 3000 * attempt));
          continue;
        }
      }
    }

    return { text: '', error: lastError || 'Gemini extraction failed after retries.' };
  } finally {
    // Clean up: delete file from Gemini (best-effort)
    if (geminiFileName) {
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/${geminiFileName}?key=${geminiKey}`,
        { method: 'DELETE' },
      ).catch(() => {});
    }
  }
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
    const geminiKey = (Deno.env.get('GEMINI_API_KEY') ?? '').trim();
    const authHeader = req.headers.get('Authorization') ?? '';

    if (!supabaseUrl || !supabaseAnon) {
      return errorJson('Missing Supabase config.', 'CONFIG');
    }
    if (!geminiKey || geminiKey.length < 10) {
      return errorJson('GEMINI_API_KEY not configured.', 'CONFIG');
    }

    // ── Auth ──
    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !authData.user) {
      return errorJson('Unauthorized. Please sign in again.', 'UNAUTHORIZED');
    }

    const userId = authData.user.id;

    // ── Admin client ──
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = serviceRole
      ? createClient(supabaseUrl, serviceRole, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : supabaseUser;

    // ── Parse body ──
    let body: { storage_path?: string; bucket?: string };
    try {
      body = await req.json();
    } catch {
      return errorJson('Invalid JSON body.', 'BAD_REQUEST');
    }

    const storagePath = (body.storage_path ?? '').trim();
    const bucket = (body.bucket ?? 'note-attachments').trim();

    if (!storagePath) {
      return errorJson('storage_path is required.', 'BAD_REQUEST');
    }

    if (!storagePath.startsWith(`${userId}/`)) {
      return errorJson('Invalid storage path for this user.', 'FORBIDDEN');
    }

    // ── Generate signed URL (no download, no memory) ──
    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(storagePath, 600); // 10 min expiry

    if (signedError || !signedData?.signedUrl) {
      return errorJson(
        signedError?.message || 'Could not generate signed URL for PDF.',
        'STORAGE',
      );
    }

    // ── Extract via Gemini (streams PDF directly, no memory buffering) ──
    const result = await extractViaGemini(signedData.signedUrl, geminiKey);

    if (result.error || !result.text) {
      return errorJson(result.error || 'Could not extract text from PDF.', 'EXTRACTION_FAILED');
    }

    // Log usage (best-effort)
    try {
      supabaseAdmin
        .from('ai_token_usage')
        .insert({
          user_id: userId,
          kind: 'pdf_text_extraction',
          model: 'gemini-3.1-flash-lite-preview',
          prompt_tokens: result.usage?.promptTokenCount ?? null,
          completion_tokens: result.usage?.candidatesTokenCount ?? null,
          total_tokens: result.usage?.totalTokenCount ?? null,
        })
        .then(() => {}, () => {});
    } catch {}

    return json({ text: result.text, stage: 'done' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return errorJson(message, 'INTERNAL');
  }
});
