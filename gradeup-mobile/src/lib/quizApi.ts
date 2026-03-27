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
      questions: params.questions,
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
  const { data, error } = await supabase
    .from('quiz_participants')
    .select('*')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true });

  if (error) return [];

  // Fetch profiles
  const userIds = (data as QuizParticipant[]).map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', userIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  return (data as QuizParticipant[]).map((p) => ({
    ...p,
    profile: profileMap.get(p.user_id) || { name: 'Player' },
  }));
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

export async function submitAnswer(
  participantId: string,
  questionIndex: number,
  selectedIndex: number,
  correct: boolean,
  timeMs: number,
): Promise<void> {
  const { data: current } = await supabase
    .from('quiz_participants')
    .select('answers, score')
    .eq('id', participantId)
    .single();

  const answers: ParticipantAnswer[] = (current?.answers as ParticipantAnswer[] | null) || [];
  answers.push({ questionIndex, selectedIndex, correct, timeMs });

  const basePoints = correct ? 10 : 0;
  const speedBonus = correct && timeMs < 5000 ? 5 : 0;
  const newScore = (current?.score || 0) + basePoints + speedBonus;

  const { error } = await supabase
    .from('quiz_participants')
    .update({ answers, score: newScore })
    .eq('id', participantId);

  if (error) normalizeQuizTableError(error);
}

export async function finishParticipant(
  participantId: string,
  sessionId: string,
  isWinner: boolean,
  isMultiplayer: boolean,
): Promise<QuizScore> {
  const userId = await getCurrentUserId();

  // Mark participant as finished
  const { data: participant } = await supabase
    .from('quiz_participants')
    .update({ finished: true })
    .eq('id', participantId)
    .select()
    .single();

  if (!participant) throw new Error('Participant not found');

  const answers: ParticipantAnswer[] = (participant.answers as ParticipantAnswer[] | null) || [];
  const correctCount = answers.filter((a) => a.correct).length;
  const totalQuestions = answers.length;

  // XP: 10 per correct + 5 speed bonus (already in score) + 20 win bonus
  let xpEarned = participant.score as number;
  if (isMultiplayer && isWinner) xpEarned += 20;

  const { data: score, error } = await supabase
    .from('quiz_scores')
    .insert({
      user_id: userId,
      session_id: sessionId,
      score: participant.score,
      correct_count: correctCount,
      total_questions: totalQuestions,
      xp_earned: xpEarned,
    })
    .select()
    .single();

  if (error) normalizeQuizTableError(error);
  return score as QuizScore;
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
  let query = supabase
    .from('quiz_scores')
    .select('user_id, score, xp_earned, created_at');

  if (scope === 'friends') {
    const ids = [...friendIds, userId];
    query = query.in('user_id', ids);
  }

  if (timeFilter === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    query = query.gte('created_at', weekAgo.toISOString());
  } else if (timeFilter === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    query = query.gte('created_at', today.toISOString());
  }

  const { data: scores, error } = await query;
  if (error || !scores) return [];

  // Aggregate by user
  const userMap = new Map<string, { total_xp: number; games_played: number }>();
  for (const s of scores) {
    const existing = userMap.get(s.user_id) || { total_xp: 0, games_played: 0 };
    existing.total_xp += s.xp_earned;
    existing.games_played += 1;
    userMap.set(s.user_id, existing);
  }

  // Fetch profiles
  const userIds = Array.from(userMap.keys());
  if (userIds.length === 0) return [];

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

  if (scope === 'global') return entries.slice(0, 50);
  return entries;
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
