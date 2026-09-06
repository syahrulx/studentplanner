// @ts-nocheck — Deno edge function; runs on Supabase Deno runtime, not the RN TS compiler.
/**
 * ai_embed — (re)index one note for RAG.
 *
 * Body: { noteId: string; subjectId: string; content: string }
 * Returns: { success: true, chunksProcessed: number, tokens: number }
 *
 * Uses the shared pipeline in `_shared/embed.ts` (text-embedding-3-large,
 * 1536 dims, insert-then-delete so a note is never left unindexed).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { reindexNote } from '../_shared/embed.ts';

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

const MAX_EMBED_CHARS = 400_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const openAiKey = (Deno.env.get('OPENAI_API_KEY') ?? '').trim();
    if (!openAiKey) return json({ error: 'Missing OPENAI_API_KEY' }, 500);

    const authHeader = req.headers.get('Authorization') ?? '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!bearer) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceRole || supabaseAnon, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(serviceRole ? {} : { global: { headers: { Authorization: authHeader } } }),
    });
    const { data: authData, error: authError } = serviceRole
      ? await admin.auth.getUser(bearer)
      : await admin.auth.getUser();
    if (authError || !authData?.user) return json({ error: 'Unauthorized' }, 401);
    const userId = authData.user.id;

    let body: { noteId?: string; subjectId?: string; content?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    const noteId = String(body.noteId ?? '').trim();
    const subjectId = String(body.subjectId ?? '').trim();
    const content = String(body.content ?? '').slice(0, MAX_EMBED_CHARS);
    if (!noteId || !subjectId) return json({ error: 'Missing required parameters: noteId, subjectId' }, 400);

    // The note must belong to the caller (the FK on note_embeddings enforces
    // existence, but we want a clean error rather than a constraint failure).
    const { data: note } = await admin
      .from('notes')
      .select('id')
      .eq('id', noteId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!note) return json({ error: 'Note not found for this user' }, 404);

    const result = await reindexNote(admin, openAiKey, { userId, noteId, subjectId, text: content });
    return json({ success: true, chunksProcessed: result.chunks, tokens: result.tokens });
  } catch (error: any) {
    return json({ error: error?.message ?? String(error) }, 400);
  }
});
