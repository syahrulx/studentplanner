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
  selectedIndex: number;
  correct: boolean;
  timeMs: number;
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
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

export async function createSession(params: CreateSessionParams): Promise<QuizSession> {
  const userId = await getCurrentUserId();
  const invite_code = params.mode === 'multiplayer' ? generateInviteCode() : null;

  // Trim question content BEFORE inserting to prevent JSONB bloat and ensure
  // the in-game experience uses the same bounded content from the start.
  const safeQuestions = (params.questions || []).map((q) => ({
    ...q,
    question: (q.question || '').slice(0, 500),
    options: q.options?.map((o) => o.slice(0, 250)),
    expectedAnswer: q.expectedAnswer ? q.expectedAnswer.slice(0, 250) : undefined,
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

export async function joinByInviteCode(inviteCode: string): Promise<{ session: QuizSession; participant: QuizParticipant }> {
  const { data: session, error } = await supabase
    .from('quiz_sessions')
    .select('*')
    .eq('invite_code', inviteCode.toUpperCase())
    .eq('status', 'waiting')
    .single();

  if (error) normalizeQuizTableError(error);
  if (!session) throw new Error('Session not found or already started');

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
  participantId: string;
  sessionId: string;
  answers: ParticipantAnswer[];
  score: number;
  isWinner: boolean;
  isMultiplayer: boolean;
}

export async function finishParticipant({
  participantId,
  sessionId,
  answers,
  score,
  isWinner,
  isMultiplayer,
}: FinishParticipantParams): Promise<QuizScore> {
  const userId = await getCurrentUserId();

  // Batch update all answers, score, and set as finished
  const { data: participant, error: updateError } = await supabase
    .from('quiz_participants')
    .update({ answers, score, finished: true })
    .eq('id', participantId)
    .select()
    .single();

  if (updateError) normalizeQuizTableError(updateError);
  if (!participant) throw new Error('Participant not found');

  const correctCount = answers.filter((a) => a.correct).length;
  const totalQuestions = answers.length;

  let xpEarned = score as number;
  if (isMultiplayer && isWinner) xpEarned += 20;

  const { data: scoreResponse, error } = await supabase
    .from('quiz_scores')
    .upsert(
      {
        user_id: userId,
        session_id: sessionId,
        score,
        correct_count: correctCount,
        total_questions: totalQuestions,
        xp_earned: xpEarned,
      },
      { onConflict: 'user_id,session_id', ignoreDuplicates: false },
    )
    .select()
    .single();

  if (error) normalizeQuizTableError(error);
  return scoreResponse as QuizScore;
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
): Promise<QuizSession | null> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('quiz_sessions')
    .select('*')
    .eq('status', 'waiting')
    .eq('mode', 'multiplayer')
    .eq('match_type', 'random')
    .eq('source_type', sourceType)
    .eq('quiz_type', quizType)
    .neq('host_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data as QuizSession | null;
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

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

  // Fetch scores with a server-side filter — aggregate in JS only over the relevant subset
  let query = supabase
    .from('quiz_scores')
    .select('user_id, xp_earned')
    .order('created_at', { ascending: false })
    .limit(5000); // reasonable upper bound

  if (scope === 'friends') {
    query = query.in('user_id', [...friendIds, userId]);
  }
  if (since) {
    query = query.gte('created_at', since);
  }

  const { data: scores, error } = await query;
  if (error || !scores) return [];

  // Aggregate by user (in JS over the already-filtered, small set)
  const userMap = new Map<string, { total_xp: number; games_played: number }>();
  for (const s of scores) {
    const existing = userMap.get(s.user_id) || { total_xp: 0, games_played: 0 };
    existing.total_xp += s.xp_earned;
    existing.games_played += 1;
    userMap.set(s.user_id, existing);
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
  return scope === 'global' ? entries.slice(0, 50) : entries;
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
