import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

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
    const openAiKey = (Deno.env.get('OPENAI_API_KEY') ?? '').trim();
    const authHeader = req.headers.get('Authorization') ?? '';

    if (!supabaseUrl || !supabaseAnon) {
      return errorJson('Missing Supabase config.', 'CONFIG');
    }
    if (!openAiKey || openAiKey.length < 20) {
      return errorJson('OPENAI_API_KEY not configured in Edge Function secrets.', 'CONFIG');
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

    // Security: ensure the path belongs to this user
    if (!storagePath.startsWith(`${userId}/`)) {
      return errorJson('Invalid storage path for this user.', 'FORBIDDEN');
    }

    // ── Download PDF from Storage ──
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = serviceRole
      ? createClient(supabaseUrl, serviceRole, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : supabaseUser;

    const { data: fileData, error: dlError } = await supabaseAdmin.storage
      .from(bucket)
      .download(storagePath);

    if (dlError || !fileData) {
      return errorJson(
        dlError?.message || 'Could not download file from storage.',
        'STORAGE',
      );
    }

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    if (bytes.length < 100) {
      return errorJson('File is too small to be a valid PDF.', 'BAD_REQUEST');
    }

    // ── Upload to OpenAI Files API ──
    const b64 = encodeBase64(bytes);
    const fileName = storagePath.split('/').pop() || 'document.pdf';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          store: false,
          temperature: 0,
          instructions: 'You extract educational text from PDF documents. Return plain text only.',
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_file',
                  filename: fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
                  file_data: `data:application/pdf;base64,${b64}`,
                },
                {
                  type: 'input_text',
                  text: 'Extract all readable educational text from this PDF document. Return plain text only. Preserve headings and structure. Ignore file metadata, page numbers, and formatting artifacts.',
                },
              ],
            },
          ],
        }),
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        return errorJson(`OpenAI error (${res.status}): ${errText.slice(0, 400)}`, 'OPENAI');
      }

      const aiJson = await res.json();
      // Extract text from Responses API output
      const output = aiJson?.output;
      let text = '';
      if (Array.isArray(output)) {
        for (const item of output) {
          if (item?.type !== 'message' || !Array.isArray(item?.content)) continue;
          for (const part of item.content) {
            if (part?.type === 'output_text' && typeof part?.text === 'string') {
              text += part.text;
            }
          }
        }
      }

      text = text.trim().slice(0, 120_000);

      // Log token usage (best-effort)
      try {
        const usage = aiJson?.usage;
        supabaseAdmin
          .from('ai_token_usage')
          .insert({
            user_id: userId,
            kind: 'pdf_text_extraction',
            model: 'gpt-4o-mini',
            prompt_tokens: usage?.input_tokens ?? null,
            completion_tokens: usage?.output_tokens ?? null,
            total_tokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0) || null,
          })
          .then(() => {}, () => {});
      } catch {}

      if (!text) {
        return errorJson('Could not extract text from this PDF. It may be image-only or corrupted.', 'EMPTY');
      }

      return json({ text, stage: 'done' });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err?.name === 'AbortError') {
        return errorJson('PDF extraction timed out. Try a smaller file.', 'TIMEOUT');
      }
      throw err;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return errorJson(message, 'INTERNAL');
  }
});
