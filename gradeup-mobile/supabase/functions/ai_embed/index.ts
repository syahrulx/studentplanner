// @ts-nocheck — Deno edge function; runs on Supabase Deno runtime, not the RN TS compiler.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const openAiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openAiKey) throw new Error('Missing OPENAI_API_KEY');

    // Create a Supabase client with the Auth context of the logged in user.
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnon,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) throw new Error('Unauthorized')

    const { noteId, subjectId, content } = await req.json()

    if (!noteId || !subjectId || !content) {
      throw new Error('Missing required parameters: noteId, subjectId, content');
    }

    // Basic chunking: split by paragraphs, then group up to ~1000 characters
    const paragraphs = content.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const p of paragraphs) {
      if (currentChunk.length + p.length > 1000 && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      currentChunk += p + '\n\n';
    }
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    if (chunks.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No content to embed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 1. Generate Embeddings using OpenAI
    const openAiRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: chunks,
        model: 'text-embedding-3-small'
      })
    });

    if (!openAiRes.ok) {
      const errTxt = await openAiRes.text();
      throw new Error(`OpenAI API Error: ${errTxt}`);
    }

    const embeddingData = await openAiRes.json();
    const embeddings = embeddingData.data; // Array of objects containing .embedding

    // 2. Clear old embeddings for this note
    await supabaseClient
      .from('note_embeddings')
      .delete()
      .eq('note_id', noteId)
      .eq('user_id', user.id);

    // 3. Insert new embeddings
    const rowsToInsert = chunks.map((chunkText, i) => ({
      note_id: noteId,
      user_id: user.id,
      subject_id: subjectId,
      chunk_index: i,
      content: chunkText,
      embedding: embeddings[i].embedding
    }));

    const { error: insertError } = await supabaseClient
      .from('note_embeddings')
      .insert(rowsToInsert);

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, chunksProcessed: chunks.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
