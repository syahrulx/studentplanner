/**
 * Shared note-embedding pipeline.
 *
 * Used by `ai_embed` (explicit re-embed from the editor), `ai_pdf_extract` and
 * `generate_flashcards` (embed freshly extracted PDF text) so every path that
 * produces note text also refreshes the RAG index.
 *
 * Storage: `public.note_embeddings` (VECTOR(1536), cosine HNSW). Rows carry an
 * `embedding_model` tag so a future model swap can be detected and re-embedded
 * instead of mixing incompatible vector spaces.
 */
import { OPENAI_EMBEDDING_DIMENSIONS, OPENAI_EMBEDDING_MODEL } from './models.ts';
import { logTokenUsage } from './tokenLimit.ts';

const CHUNK_TARGET_CHARS = 1_000;
const CHUNK_OVERLAP_CHARS = 150;
const MAX_CHUNKS_PER_NOTE = 400;
const EMBED_BATCH_SIZE = 64;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = { from: (table: string) => any };

/** Paragraph-aware chunker with a small overlap so concepts split across a boundary still match. */
export function chunkForEmbedding(text: string): string[] {
  const clean = String(text ?? '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    if (p.length > CHUNK_TARGET_CHARS * 1.5) {
      if (current) { chunks.push(current); current = ''; }
      for (let i = 0; i < p.length; i += CHUNK_TARGET_CHARS - CHUNK_OVERLAP_CHARS) {
        chunks.push(p.slice(i, i + CHUNK_TARGET_CHARS));
        if (chunks.length >= MAX_CHUNKS_PER_NOTE) return chunks;
      }
      continue;
    }
    if (current.length + p.length + 2 > CHUNK_TARGET_CHARS && current) {
      chunks.push(current);
      const tail = current.slice(-CHUNK_OVERLAP_CHARS);
      current = tail.includes('\n') ? tail.slice(tail.lastIndexOf('\n') + 1) : '';
    }
    current = current ? `${current}\n\n${p}` : p;
    if (chunks.length >= MAX_CHUNKS_PER_NOTE) break;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.slice(0, MAX_CHUNKS_PER_NOTE);
}

export async function embedTexts(
  openAiKey: string,
  inputs: string[],
  signal?: AbortSignal,
): Promise<{ vectors: number[][]; totalTokens: number }> {
  const vectors: number[][] = [];
  let totalTokens = 0;
  for (let i = 0; i < inputs.length; i += EMBED_BATCH_SIZE) {
    const batch = inputs.slice(i, i + EMBED_BATCH_SIZE);
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: batch,
        model: OPENAI_EMBEDDING_MODEL,
        dimensions: OPENAI_EMBEDDING_DIMENSIONS,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Embedding API error (${res.status}): ${errText.slice(0, 300)}`);
    }
    const json = await res.json();
    const data = Array.isArray(json?.data) ? json.data : [];
    for (const item of data) vectors.push(item.embedding);
    totalTokens += Number(json?.usage?.total_tokens ?? json?.usage?.prompt_tokens ?? 0);
  }
  return { vectors, totalTokens };
}

export async function embedQuery(openAiKey: string, text: string, signal?: AbortSignal): Promise<number[] | null> {
  const { vectors } = await embedTexts(openAiKey, [text], signal);
  return vectors[0] ?? null;
}

/**
 * Re-index one note. Inserts the new generation first, then deletes the old
 * rows, so a failure mid-way never leaves the note with zero embeddings.
 */
export async function reindexNote(
  admin: SupabaseAdmin,
  openAiKey: string,
  params: { userId: string; noteId: string; subjectId: string; text: string },
): Promise<{ chunks: number; tokens: number }> {
  const chunks = chunkForEmbedding(params.text);
  if (chunks.length === 0) {
    await admin.from('note_embeddings').delete().eq('note_id', params.noteId).eq('user_id', params.userId);
    return { chunks: 0, tokens: 0 };
  }
  const { vectors, totalTokens } = await embedTexts(openAiKey, chunks);
  const generation = crypto.randomUUID();
  const rows = chunks.map((content, i) => ({
    note_id: params.noteId,
    user_id: params.userId,
    subject_id: params.subjectId,
    chunk_index: i,
    content,
    embedding: vectors[i],
    embedding_model: OPENAI_EMBEDDING_MODEL,
    generation,
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await admin.from('note_embeddings').insert(rows.slice(i, i + 100));
    if (error) throw new Error(`Embedding insert failed: ${error.message}`);
  }
  await admin
    .from('note_embeddings')
    .delete()
    .eq('note_id', params.noteId)
    .eq('user_id', params.userId)
    .or(`generation.is.null,generation.neq.${generation}`);

  await logTokenUsage(admin as any, {
    user_id: params.userId,
    kind: 'embedding',
    model: OPENAI_EMBEDDING_MODEL,
    prompt_tokens: totalTokens,
    completion_tokens: 0,
    total_tokens: totalTokens,
  });
  return { chunks: chunks.length, tokens: totalTokens };
}
