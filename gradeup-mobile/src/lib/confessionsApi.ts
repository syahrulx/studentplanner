import { supabase } from './supabase';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Confession {
  id: string;
  content: string;
  /** Campus name where this confession was posted, mirrors profiles.campus. Null for single-campus unis. */
  campus: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  is_mine: boolean;
}

export interface ConfessionComment {
  id: string;
  content: string;
  created_at: string;
  alias: string;
  is_mine: boolean;
}

export type ConfessionReportReason =
  | 'inappropriate'
  | 'spam'
  | 'harassment'
  | 'misleading'
  | 'other';

const DEFAULT_PAGE_SIZE = 20;

function toErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: string }).message);
  }
  return 'Something went wrong. Please try again.';
}

// ─── Feed ───────────────────────────────────────────────────────────────────

export async function fetchConfessions(options?: {
  before?: string | null;
  limit?: number;
  /** Campus name to filter by. Null/undefined = show all campuses. */
  campus?: string | null;
}): Promise<Confession[]> {
  const { before = null, limit = DEFAULT_PAGE_SIZE, campus = null } = options ?? {};
  const { data, error } = await supabase.rpc('get_confessions', {
    p_before: before,
    p_limit: limit,
    p_campus: campus,
  });
  if (error) throw new Error(toErrorMessage(error));
  return (data ?? []) as Confession[];
}

export async function fetchConfession(confessionId: string): Promise<Confession | null> {
  const { data, error } = await supabase.rpc('get_confession', {
    p_id: confessionId,
  });
  if (error) throw new Error(toErrorMessage(error));
  const rows = (data ?? []) as Confession[];
  return rows[0] ?? null;
}

export async function createConfession(content: string): Promise<Confession> {
  const trimmed = content.trim();
  const { data, error } = await supabase.rpc('create_confession', {
    p_content: trimmed,
  });
  if (error) throw new Error(toErrorMessage(error));
  const rows = (data ?? []) as Confession[];
  if (!rows[0]) throw new Error('Failed to create confession.');
  return rows[0];
}

// ─── Likes ──────────────────────────────────────────────────────────────────

/** Returns true if the confession is now liked. */
export async function toggleConfessionLike(confessionId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_confession_like', {
    p_confession_id: confessionId,
  });
  if (error) throw new Error(toErrorMessage(error));
  return Boolean(data);
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function fetchConfessionComments(
  confessionId: string,
): Promise<ConfessionComment[]> {
  const { data, error } = await supabase.rpc('get_confession_comments', {
    p_confession_id: confessionId,
  });
  if (error) throw new Error(toErrorMessage(error));
  return (data ?? []) as ConfessionComment[];
}

export async function addConfessionComment(
  confessionId: string,
  content: string,
): Promise<ConfessionComment> {
  const trimmed = content.trim();
  const { data, error } = await supabase.rpc('add_confession_comment', {
    p_confession_id: confessionId,
    p_content: trimmed,
  });
  if (error) throw new Error(toErrorMessage(error));
  const rows = (data ?? []) as ConfessionComment[];
  if (!rows[0]) throw new Error('Failed to post comment.');
  return rows[0];
}

export async function deleteConfessionComment(commentId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_confession_comment', {
    p_id: commentId,
  });
  if (error) throw new Error(toErrorMessage(error));
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteConfession(confessionId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_confession', {
    p_id: confessionId,
  });
  if (error) throw new Error(toErrorMessage(error));
}

// ─── Reports (Apple UGC compliance) ─────────────────────────────────────────

export async function reportConfession(
  confessionId: string,
  reason: ConfessionReportReason = 'inappropriate',
  commentId?: string | null,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const row: Record<string, string> = {
    confession_id: confessionId,
    reporter_id: user.id,
    reason,
  };
  if (commentId) row.comment_id = commentId;

  const { error } = await supabase.from('confession_reports').insert(row);
  if (error) {
    // Duplicate report — treat as success
    if (error.code === '23505') return;
    throw new Error(toErrorMessage(error));
  }
}
