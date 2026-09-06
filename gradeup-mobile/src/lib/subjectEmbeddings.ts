/**
 * Keeps the per-subject RAG index (note_embeddings) in sync with the user's notes.
 *
 * - `ensureSubjectEmbeddings(subjectId, notes)` is fire-and-forget from the
 *   AI Subject Tutor on mount: it asks the server which notes are already
 *   indexed (and with which model), then re-embeds any that are missing or
 *   stale. Throttled per subject so opening the chat repeatedly is cheap.
 * - `embedNoteIfNeeded(note)` is a convenience for other callers (e.g. after
 *   saving a note) that want the same "skip tiny notes" gate.
 *
 * Nothing in here ever throws — embedding is best-effort.
 */
import { supabase } from './supabase';
import { invokeAiEmbed } from './invokeAiGenerate';
import type { Note } from '../types';

export const EMBEDDING_MODEL = 'text-embedding-3-large';

/** Minimum note text length (content + extractedText) worth indexing. */
const MIN_EMBED_CHARS = 50;
/** Max notes (re)embedded per `ensureSubjectEmbeddings` call. */
const MAX_NOTES_PER_RUN = 10;
/** Skip a subject if we ran for it less than this long ago. */
const THROTTLE_MS = 10 * 60 * 1000;

const lastRunAt = new Map<string, number>();

type EmbeddedNoteRow = {
  note_id: string;
  chunk_count: number;
  embedding_model: string | null;
};

function noteText(note: Note): string {
  return [note.content, note.extractedText]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
}

function log(...args: unknown[]) {
  if (__DEV__) console.log('[subjectEmbeddings]', ...args);
}

/**
 * Embed a single note if it has enough text. Never throws.
 * Returns true when an embed request was sent and succeeded.
 */
export async function embedNoteIfNeeded(note: Note): Promise<boolean> {
  try {
    const content = noteText(note);
    if (content.length <= MIN_EMBED_CHARS) return false;
    const res = await invokeAiEmbed({ noteId: note.id, subjectId: note.subjectId, content });
    if (!res.success) {
      log(`embed failed for note ${note.id}:`, res.error);
      return false;
    }
    return true;
  } catch (e) {
    log('embedNoteIfNeeded threw:', e);
    return false;
  }
}

/**
 * Make sure every substantive note in `subjectId` is indexed with the current
 * embedding model. Sequential, capped at MAX_NOTES_PER_RUN, throttled per
 * subject. Never throws.
 */
export async function ensureSubjectEmbeddings(subjectId: string, notes: Note[]): Promise<void> {
  try {
    if (!subjectId) return;

    const now = Date.now();
    const last = lastRunAt.get(subjectId);
    if (last != null && now - last < THROTTLE_MS) return;
    lastRunAt.set(subjectId, now);

    const candidates = notes.filter(
      (n) => n.subjectId === subjectId && noteText(n).length > MIN_EMBED_CHARS,
    );
    if (candidates.length === 0) return;

    const { data, error } = await supabase.rpc('get_embedded_note_ids', { p_subject_id: subjectId });
    if (error) {
      // RPC missing (migration not applied yet) or transient failure: allow a retry sooner.
      lastRunAt.delete(subjectId);
      log('get_embedded_note_ids failed:', error.message);
      return;
    }

    const indexed = new Map<string, EmbeddedNoteRow>();
    for (const row of (data ?? []) as EmbeddedNoteRow[]) {
      if (row && typeof row.note_id === 'string') indexed.set(row.note_id, row);
    }

    const stale = candidates.filter((n) => {
      const row = indexed.get(n.id);
      if (!row) return true;
      if ((row.chunk_count ?? 0) <= 0) return true;
      return row.embedding_model !== EMBEDDING_MODEL;
    });
    if (stale.length === 0) return;

    const batch = stale.slice(0, MAX_NOTES_PER_RUN);
    log(`re-embedding ${batch.length}/${stale.length} notes for subject ${subjectId}`);
    for (const note of batch) {
      await embedNoteIfNeeded(note);
    }
  } catch (e) {
    log('ensureSubjectEmbeddings threw:', e);
  }
}
