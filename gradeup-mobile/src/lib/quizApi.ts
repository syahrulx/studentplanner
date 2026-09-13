/**
 * Quiz API – Supabase interactions for quiz sessions, participants, scores, and leaderboard.
 */
import { supabase } from './supabase';
import type { GeneratedQuizQuestion } from './studyApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionMode = 'solo' | 'multiplayer';
export type MatchType = 'friend' | 'circle' | 'random';
export type SourceType = 'flashcards' | 'notes';
export type QuizSessionStatus = 'waiting' | 'in_progress' | 'finished';

export interface QuizSession {
  id: string;
  host_id: string;
  mode: SessionMode;
  match_type: MatchType;
  source_type: SourceType;
  source_id: string | null;
  quiz_type: string;
  difficulty: string;
  question_count: number;
  questions: GeneratedQuizQuestion[];
  status: QuizSessionStatus;
  invite_code: string | null;
  circle_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface QuizParticipant {
  id: string;
  session_id: string;
  user_id: string;
  score: number;
  answers: ParticipantAnswer[];
  finished: boolean;
  joined_at: string;
  profile?: { name: string; avatar_url?: string };
}

export interface ParticipantAnswer {
  questionIndex: number;
  /** Option index; -1 when nothing was selected (timeout) or for short answers. */
  selectedIndex: number;
  /** Free-text response for short-answer questions. */
  typedAnswer?: string | null;
  /**
   * Local grading result. Used for instant UI feedback / opponent broadcast
   * only; the value stored in the DB comes from `finish_quiz_participant`.
   */
  correct: boolean;
  timeMs: number;
}

/** Raw answer as submitted to the `finish_quiz_participant` RPC. */
export interface RawQuizAnswer {
  questionIndex: number;
  selectedIndex: number | null;
  typedAnswer: string | null;
  timeMs: number;
}

/** Parsed return value of `finish_quiz_participant`. */
export interface FinishParticipantResult {
  score: number;
  correct_count: number;
  total_questions: number;
  xp_earned: number;
  is_winner: boolean;
  answers: ParticipantAnswer[];
}

export interface QuizScore {
  id: string;
  user_id: string;
  session_id: string;
  score: number;
  correct_count: number;
  total_questions: number;
  xp_earned: number;
  created_at: string;
}

export interface LeaderboardEntry {
  user_id: string;
  name: string;
  avatar_url?: string;
  total_xp: number;
  games_played: number;
  // True global rank (1-based). Set for the current user so their own card can be
  // shown even when they're outside the displayed top-N. Undefined for list rows.
  rank?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_CODE_PATTERN = new RegExp(`^[${INVITE_CODE_CHARS}]{6}$`);

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  }
  return code;
}

function normalizeQuizTableError(error: any): never {
  const message = String(error?.message || '');
  const details = String(error?.details || '');
  const hint = String(error?.hint || '');
  const code = String(error?.code || '');

  const combined = `${message} ${details} ${hint}`.toLowerCase();
  const isExactMissingTable =
    /could not find the table 'public\.(quiz_sessions|quiz_participants|quiz_scores)'/i.test(combined) ||
    (code === 'PGRST205' && /quiz_sessions|quiz_participants|quiz_scores/.test(combined));

  if (isExactMissingTable) {
    throw new Error(
      'Quiz database tables are missing. Run Supabase migration 004_quiz_system.sql, then restart the app.',
    );
  }

  // Surface real backend error to UI for faster diagnosis.
  const fallback = message || details || hint;
  if (fallback) throw new Error(fallback);
  throw error;
}

async function getCurrentUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  return session.user.id;
}

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

export interface CreateSessionParams {
  mode: SessionMode;
  matchType: MatchType;
  sourceType: SourceType;
  sourceId?: string;
  quizType: string;
  difficulty: string;
  questionCount: number;
  questions: GeneratedQuizQuestion[];
  circleId?: string;
}

/**
 * Clear this player's abandoned lobbies and unresolved matches.
 *
 * Leaving a lobby never deleted its session row, and a match where someone quit
 * mid-game could never satisfy the "everyone finished" check that closes it and
 * awards the winner bonus. Reaping on the way into a new session means each
 * player tidies up their own trail as they keep playing, with no scheduler to
 * maintain.
 *
 * Never throws: failing to tidy up must not stop a student starting a quiz.
 */
export async function resolveStaleSessions(): Promise<void> {
  try {
    const { error } = await supabase.rpc('resolve_stale_quiz_sessions', {
      p_waiting_minutes: 30,
      p_active_minutes: 30,
    });
    if (error && __DEV__) console.warn('[Quiz] stale session cleanup failed:', error.message);
  } catch (e) {
    if (__DEV__) console.warn('[Quiz] stale session cleanup failed:', e);
  }
}

export async function createSession(params: CreateSessionParams): Promise<QuizSession> {
  const userId = await getCurrentUserId();
  // Tidy up before adding another session, so a player's abandoned rows never
  // accumulate and a match they walked away from still resolves.
  await resolveStaleSessions();
  const invite_code = params.mode === 'multiplayer' ? generateInviteCode() : null;

  // Trim question content BEFORE inserting to prevent JSONB bloat and ensure
  // the in-game experience uses the same bounded content from the start.
  const safeQuestions = (params.questions || []).map((q) => ({
    ...q,
    question: (q.question || '').slice(0, 500),
    options: (q.options || []).map((o) => String(o ?? '').slice(0, 250)),
    expectedAnswer: q.expectedAnswer ? q.expectedAnswer.slice(0, 250) : undefined,
    acceptedAnswers: Array.isArray(q.acceptedAnswers)
      ? q.acceptedAnswers.map((a) => String(a ?? '').slice(0, 250)).slice(0, 10)
      : undefined,
    explanation: q.explanation ? q.explanation.slice(0, 1000) : undefined,
    proof: q.proof ? q.proof.slice(0, 300) : undefined,
  }));

  const { data, error } = await supabase
    .from('quiz_sessions')
    .insert({
      host_id: userId,
      mode: params.mode,
      match_type: params.matchType,
      source_type: params.sourceType,
      source_id: params.sourceId || null,
      quiz_type: params.quizType,
      difficulty: params.difficulty,
      question_count: params.questionCount,
      questions: safeQuestions,
      status: params.mode === 'solo' ? 'in_progress' : 'waiting',
      invite_code,
      circle_id: params.circleId || null,
      started_at: params.mode === 'solo' ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) normalizeQuizTableError(error);

  // Auto-join the host as a participant
  await joinSession(data.id);

  return data as QuizSession;
}

/** True for a Postgres unique-violation (23505) surfaced by PostgREST. */
export function isUniqueViolation(error: unknown): boolean {
  const code = String((error as any)?.code || '');
  const message = String((error as any)?.message || '').toLowerCase();
  return code === '23505' || /duplicate key value|unique constraint/.test(message);
}

export async function joinSession(sessionId: string): Promise<QuizParticipant> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('quiz_participants')
    .upsert(
      { session_id: sessionId, user_id: userId },
      { onConflict: 'session_id,user_id' },
    )
    .select()
    .single();

  if (error) normalizeQuizTableError(error);
  return data as QuizParticipant;
}

/**
 * Random matchmaking: find an open session and join it. If the join races
 * with another player (unique violation / session no longer waiting) the
 * lookup is retried once, excluding the session that failed. Returns null
 * when no open session is available so the caller can host a new one.
 */
export async function findAndJoinRandomSession(
  sourceType: SourceType,
  quizType: string,
): Promise<{ session: QuizSession; participant: QuizParticipant } | null> {
  let excludeSessionId: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await findRandomSession(sourceType, quizType, excludeSessionId);
    if (!session) return null;
    try {
      const participant = await joinSession(session.id);
      return { session, participant };
    } catch (e) {
      if (attempt === 0 && isUniqueViolation(e)) {
        excludeSessionId = session.id;
        continue;
      }
      throw e;
    }
  }
  return null;
}

export async function joinByInviteCode(inviteCode: string): Promise<{ session: QuizSession; participant: QuizParticipant }> {
  const normalizedCode = inviteCode.trim().toUpperCase();
  if (!normalizedCode) throw new Error('Invite code is required');
  // The code goes into an ilike pattern below, where `%` and `_` would match
  // any waiting lobby. Every generated code is six characters of a fixed
  // alphabet, so anything else cannot be a real code anyway.
  if (!INVITE_CODE_PATTERN.test(normalizedCode)) {
    throw new Error('Invite code is invalid or the match already started');
  }
  const { data: session, error } = await supabase
    .from('quiz_sessions')
    .select('*')
    // Codes are generated uppercase, but ilike also accepts codes copied from
    // a message or older clients that stored lowercase values.
    .ilike('invite_code', normalizedCode)
    .eq('status', 'waiting')
    .limit(1)
    .maybeSingle();

  if (error) normalizeQuizTableError(error);
  if (!session) throw new Error('Invite code is invalid or the match already started');

  const participant = await joinSession(session.id);
  return { session: session as QuizSession, participant };
}

export async function getSession(sessionId: string): Promise<QuizSession | null> {
  const { data, error } = await supabase
    .from('quiz_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) return null;
  return data as QuizSession;
}

export async function getSessionParticipants(sessionId: string): Promise<QuizParticipant[]> {
  // Fix 5: Single query via view — eliminates the N+1 participants+profiles double-fetch
  const { data, error } = await supabase
    .from('quiz_participants_with_profile')
    .select('*')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true });

  if (error) {
    // View might not exist yet (migration not run) — fall back to double-fetch
    const { data: fallback, error: fbErr } = await supabase
      .from('quiz_participants')
      .select('*')
      .eq('session_id', sessionId)
      .order('joined_at', { ascending: true });
    if (fbErr || !fallback) return [];
    const userIds = (fallback as QuizParticipant[]).map((p) => p.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, avatar_url')
      .in('id', userIds);
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
    return (fallback as QuizParticipant[]).map((p) => ({
      ...p,
      profile: profileMap.get(p.user_id) || { name: 'Player' },
    }));
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    session_id: row.session_id,
    user_id: row.user_id,
    score: row.score,
    answers: row.answers,
    finished: row.finished,
    joined_at: row.joined_at,
    profile: {
      name: row.profile_name || 'Player',
      avatar_url: row.profile_avatar_url,
    },
  })) as QuizParticipant[];
}

export async function startSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('quiz_sessions')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) normalizeQuizTableError(error);
}

/**
 * Fallback only: `finish_quiz_participant` closes the session itself. Only the
 * host may update `quiz_sessions` under the current RLS policy.
 */
export async function finishSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('quiz_sessions')
    .update({ status: 'finished', finished_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) normalizeQuizTableError(error);
}

// ---------------------------------------------------------------------------
// Answers & Scoring
// ---------------------------------------------------------------------------

// Incremental submitAnswer was removed to prevent db congestion.

export interface FinishParticipantParams {
  sessionId: string;
  answers: RawQuizAnswer[];
}

function toRawAnswer(a: RawQuizAnswer): RawQuizAnswer {
  const selected = a.selectedIndex;
  return {
    questionIndex: Math.max(0, Math.trunc(Number(a.questionIndex) || 0)),
    selectedIndex: typeof selected === 'number' && Number.isFinite(selected) ? Math.trunc(selected) : null,
    typedAnswer: a.typedAnswer == null ? null : String(a.typedAnswer).slice(0, 250),
    timeMs: Math.max(0, Math.round(Number(a.timeMs) || 0)),
  };
}

/**
 * Submit the participant's raw answers. The database grades them against the
 * session's stored questions, computes score + speed bonus, writes
 * quiz_participants / quiz_scores, awards the multiplayer winner bonus and
 * closes the session. The client no longer computes score / XP / winner.
 */
export async function finishParticipant({
  sessionId,
  answers,
}: FinishParticipantParams): Promise<FinishParticipantResult> {
  const payload = (answers || []).map(toRawAnswer);

  const { data, error } = await supabase.rpc('finish_quiz_participant', {
    p_session_id: sessionId,
    p_answers: payload,
  });

  if (error) normalizeQuizTableError(error);

  const raw = (typeof data === 'string' ? JSON.parse(data) : data) as Record<string, any> | null;
  if (!raw || typeof raw !== 'object') {
    throw new Error('Quiz results could not be saved. Please try again.');
  }

  const graded: ParticipantAnswer[] = Array.isArray(raw.answers)
    ? raw.answers.map((a: any) => ({
        questionIndex: Number(a?.questionIndex) || 0,
        selectedIndex: a?.selectedIndex == null ? -1 : Number(a.selectedIndex),
        typedAnswer: a?.typedAnswer ?? null,
        correct: Boolean(a?.correct),
        timeMs: Number(a?.timeMs) || 0,
      }))
    : [];

  return {
    score: Number(raw.score) || 0,
    correct_count: Number(raw.correct_count) || 0,
    total_questions: Number(raw.total_questions) || 0,
    xp_earned: Number(raw.xp_earned) || 0,
    is_winner: Boolean(raw.is_winner),
    answers: graded,
  };
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export async function getSessionResults(sessionId: string): Promise<QuizParticipant[]> {
  return getSessionParticipants(sessionId);
}

// ---------------------------------------------------------------------------
// Random Matchmaking
// ---------------------------------------------------------------------------

export async function findRandomSession(
  sourceType: SourceType,
  quizType: string,
  excludeSessionId?: string,
): Promise<QuizSession | null> {
  const userId = await getCurrentUserId();

  let query = supabase
    .from('quiz_sessions')
    .select('*')
    .eq('status', 'waiting')
    .eq('mode', 'multiplayer')
    .eq('match_type', 'random')
    .eq('source_type', sourceType)
    .eq('quiz_type', quizType)
    .neq('host_id', userId);
  if (excludeSessionId) query = query.neq('id', excludeSessionId);

  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data as QuizSession | null;
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

const GLOBAL_LEADERBOARD_LIMIT = 50;

// Fully paginate a quiz_scores query and aggregate per user. Used as a fallback
// when the server-side RPC isn't available. Unlike the old limit(5000) approach
// this reads ALL matching rows, so global totals are complete (not truncated)
// and therefore consistent with the friends scope.
async function aggregateQuizClientSide(
  scope: 'friends' | 'global',
  userId: string,
  friendIds: string[],
  since: string | null,
): Promise<Map<string, { total_xp: number; games_played: number }>> {
  const userMap = new Map<string, { total_xp: number; games_played: number }>();
  const pageSize = 1000;
  const HARD_CAP = 50000; // safety bound to avoid runaway loops
  let from = 0;

  while (from < HARD_CAP) {
    let query = supabase
      .from('quiz_scores')
      .select('user_id, xp_earned')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (scope === 'friends') query = query.in('user_id', [...friendIds, userId]);
    if (since) query = query.gte('created_at', since);

    const { data, error } = await query;
    if (error || !data || data.length === 0) break;

    for (const s of data) {
      const existing = userMap.get(s.user_id) || { total_xp: 0, games_played: 0 };
      existing.total_xp += s.xp_earned;
      existing.games_played += 1;
      userMap.set(s.user_id, existing);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return userMap;
}

export async function getLeaderboard(
  scope: 'friends' | 'global',
  userId: string,
  friendIds: string[] = [],
  timeFilter: 'all' | 'week' | 'today' = 'all',
): Promise<LeaderboardEntry[]> {
  // Build time filter bound
  let since: string | null = null;
  if (timeFilter === 'week') {
    const d = new Date(); d.setDate(d.getDate() - 7);
    since = d.toISOString();
  } else if (timeFilter === 'today') {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    since = d.toISOString();
  }

  const userMap = new Map<string, { total_xp: number; games_played: number }>();

  // Preferred path: server-side SUM(...) GROUP BY user_id (complete + cheap).
  let agg: any[] | null = null;
  try {
    const { data, error } = await supabase.rpc('get_quiz_leaderboard', {
      p_user_ids: scope === 'friends' ? [...friendIds, userId] : null,
      p_since: since,
      p_limit: scope === 'global' ? GLOBAL_LEADERBOARD_LIMIT : null,
    });
    if (!error && Array.isArray(data)) agg = data;
  } catch {
    agg = null;
  }

  if (agg) {
    for (const r of agg) {
      userMap.set(r.user_id, {
        total_xp: Number(r.total_xp) || 0,
        games_played: Number(r.games_played) || 0,
      });
    }
  } else {
    // Fallback for envs where the RPC migration hasn't been applied yet.
    const fallback = await aggregateQuizClientSide(scope, userId, friendIds, since);
    for (const [uid, stats] of fallback) userMap.set(uid, stats);
  }

  const userIds = Array.from(userMap.keys());
  if (userIds.length === 0) return [];

  // Fetch profiles in one query
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', userIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  const entries: LeaderboardEntry[] = userIds.map((uid) => {
    const stats = userMap.get(uid)!;
    const profile = profileMap.get(uid);
    return {
      user_id: uid,
      name: profile?.name || 'Player',
      avatar_url: profile?.avatar_url,
      total_xp: stats.total_xp,
      games_played: stats.games_played,
    };
  });

  entries.sort((a, b) => b.total_xp - a.total_xp);

  if (scope !== 'global') return entries;

  const top = entries.slice(0, GLOBAL_LEADERBOARD_LIMIT);
  // If the current user isn't in the displayed top-N, append their own entry with
  // their true global rank so the "my rank" card still shows on the global tab.
  if (!top.some((e) => e.user_id === userId)) {
    const self = await getQuizUserRank(userId, since);
    if (self && self.total_xp > 0) {
      const profile = profileMap.get(userId);
      top.push({
        user_id: userId,
        name: profile?.name || 'You',
        avatar_url: profile?.avatar_url,
        total_xp: self.total_xp,
        games_played: self.games_played,
        rank: self.rank,
      });
    }
  }
  return top;
}

// Returns the current user's global total + true rank. Uses the RPC when available,
// otherwise falls back to a full client-side aggregation.
async function getQuizUserRank(
  userId: string,
  since: string | null,
): Promise<{ total_xp: number; games_played: number; rank: number } | null> {
  try {
    const { data, error } = await supabase.rpc('get_quiz_user_rank', {
      p_user_id: userId,
      p_since: since,
    });
    if (!error && Array.isArray(data) && data[0]) {
      const r = data[0] as any;
      return {
        total_xp: Number(r.total_xp) || 0,
        games_played: Number(r.games_played) || 0,
        rank: Number(r.rank) || 0,
      };
    }
  } catch {
    // fall through to client-side fallback
  }

  // Fallback: aggregate everyone, then derive the user's total and rank.
  const map = await aggregateQuizClientSide('global', userId, [], since);
  const sorted = Array.from(map.entries()).sort((a, b) => b[1].total_xp - a[1].total_xp);
  const idx = sorted.findIndex(([uid]) => uid === userId);
  if (idx === -1) return null;
  const stats = sorted[idx][1];
  return { total_xp: stats.total_xp, games_played: stats.games_played, rank: idx + 1 };
}

export async function getMyQuizHistory(userId: string): Promise<QuizScore[]> {
  const { data, error } = await supabase
    .from('quiz_scores')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return [];
  return (data || []) as QuizScore[];
}
