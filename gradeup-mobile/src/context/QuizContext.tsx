import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import * as quizApi from '../lib/quizApi';
import { saveQuizProgress, getQuizProgress, clearQuizProgress } from '../storage';
import type {
  QuizSession,
  QuizParticipant,
  ParticipantAnswer,
  CreateSessionParams,
} from '../lib/quizApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpponentProgress {
  userId: string;
  questionIndex: number;
  correct: boolean;
  score: number;
  finished: boolean;
}

interface QuizState {
  currentSession: QuizSession | null;
  participants: QuizParticipant[];
  myParticipantId: string | null;
  myAnswers: ParticipantAnswer[];
  opponentProgress: Map<string, OpponentProgress>;
  countdown: number | null;
  isReady: boolean;
  allReady: boolean;

  createQuiz: (params: CreateSessionParams) => Promise<QuizSession>;
  joinQuiz: (sessionIdOrCode: string, isCode?: boolean) => Promise<QuizSession>;
  setReady: () => void;
  broadcastGameStart: () => void;
  submitAnswer: (questionIndex: number, selectedIndex: number, correct: boolean, timeMs: number) => Promise<void>;
  finishQuiz: () => Promise<void>;
  leaveQuiz: () => void;
  refreshParticipants: () => Promise<void>;
}

const QuizContext = createContext<QuizState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function QuizProvider({ children }: { children: React.ReactNode }) {
  const [currentSession, setCurrentSession] = useState<QuizSession | null>(null);
  const [participants, setParticipants] = useState<QuizParticipant[]>([]);
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);
  const [myAnswers, setMyAnswers] = useState<ParticipantAnswer[]>([]);
  const [opponentProgress, setOpponentProgress] = useState<Map<string, OpponentProgress>>(new Map());
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [allReady, setAllReady] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Session id the current channel is bound to. Used so joining a *different*
  // session tears down the old channel instead of silently reusing it (which
  // left players on a previous match's channel — wrong opponent/ready/countdown).
  const channelSessionIdRef = useRef<string | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref always mirrors myAnswers so closures never get stale answers
  const myAnswersRef = useRef<ParticipantAnswer[]>([]);
  useEffect(() => { myAnswersRef.current = myAnswers; }, [myAnswers]);
  // Cached auth userId — avoids calling auth.getSession() on every answer broadcast
  const myUserIdRef = useRef<string | null>(null);

  // Clean up channel on unmount or session change
  const cleanupChannel = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    channelSessionIdRef.current = null;
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => cleanupChannel();
  }, [cleanupChannel]);

  // Setup realtime channel for a session
  const setupChannel = useCallback(async (sessionId: string) => {
    cleanupChannel();

    const { data: { session: authSession } } = await supabase.auth.getSession();
    const myUserId = authSession?.user?.id;
    if (!myUserId) return;

    const channel = supabase.channel(`quiz:${sessionId}`, {
      config: { presence: { key: myUserId } },
    });

    // Presence: track who's in the lobby
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const presentIds = Object.keys(state);
      // Check if all participants are ready
      const allPresent = presentIds.length >= 2;
      const readyStates = presentIds.map((id) => {
        const presences = state[id] as any[];
        return presences?.some((p: any) => p.ready);
      });
      setAllReady(allPresent && readyStates.every(Boolean));
    });

    // Broadcast: answer_submitted
    channel.on('broadcast', { event: 'answer_submitted' }, ({ payload }: any) => {
      if (payload.userId === myUserId) return;
      setOpponentProgress((prev) => {
        const next = new Map(prev);
        next.set(payload.userId, {
          userId: payload.userId,
          questionIndex: payload.questionIndex,
          correct: payload.correct,
          score: payload.score,
          finished: false,
        });
        return next;
      });
    });

    // Broadcast: player_finished
    channel.on('broadcast', { event: 'player_finished' }, ({ payload }: any) => {
      if (payload.userId === myUserId) return;
      setOpponentProgress((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.userId);
        next.set(payload.userId, {
          ...(existing || { userId: payload.userId, questionIndex: 0, correct: false }),
          score: payload.score,
          finished: true,
        });
        return next;
      });
    });

    // Broadcast: game_start (countdown)
    channel.on('broadcast', { event: 'game_start' }, () => {
      startCountdown();
    });

    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ ready: false, joinedAt: Date.now() });
      }
    });

    channelRef.current = channel;
    channelSessionIdRef.current = sessionId;
  }, [cleanupChannel]);

  const startCountdown = useCallback(() => {
    // Clear any in-flight countdown first so a duplicate `game_start` broadcast
    // can't stack multiple intervals (which made the countdown jump erratically
    // and could keep ticking after unmount).
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(3);
    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Refresh participants from DB
  const refreshParticipants = useCallback(async () => {
    if (!currentSession) return;
    const parts = await quizApi.getSessionParticipants(currentSession.id);
    setParticipants(parts);
  }, [currentSession]);

  // Actions
  const createQuiz = useCallback(async (params: CreateSessionParams): Promise<QuizSession> => {
    const session = await quizApi.createSession(params);
    setCurrentSession(session);
    setMyAnswers([]);
    myAnswersRef.current = [];
    setOpponentProgress(new Map());
    setCountdown(null);
    setIsReady(false);
    setAllReady(false);

    // Get my participant id
    const parts = await quizApi.getSessionParticipants(session.id);
    setParticipants(parts);
    const { data: { session: authSession } } = await supabase.auth.getSession();
    myUserIdRef.current = authSession?.user?.id || null;
    const myPart = parts.find((p) => p.user_id === authSession?.user?.id);
    setMyParticipantId(myPart?.id || null);

    if (session.mode === 'multiplayer') {
      await setupChannel(session.id);
    }

    return session;
  }, [setupChannel]);

  const joinQuiz = useCallback(async (sessionIdOrCode: string, isCode = false): Promise<QuizSession> => {
    let session: QuizSession;
    if (isCode) {
      const result = await quizApi.joinByInviteCode(sessionIdOrCode);
      session = result.session;
      setMyParticipantId(result.participant.id);
    } else {
      await quizApi.joinSession(sessionIdOrCode);
      session = (await quizApi.getSession(sessionIdOrCode))!;
    }

    setCurrentSession(session);
    setOpponentProgress(new Map());
    setCountdown(null);
    setIsReady(false);
    setAllReady(false);

    const parts = await quizApi.getSessionParticipants(session.id);
    setParticipants(parts);

    const { data: { session: authSession } } = await supabase.auth.getSession();
    myUserIdRef.current = authSession?.user?.id || null;
    const myPart = parts.find((p) => p.user_id === authSession?.user?.id);
    
    if (myPart) {
      setMyParticipantId(myPart.id);
      const dbAnswers = (myPart.answers as ParticipantAnswer[]) || [];
      // Live answers are only batch-written to the DB at finish, so a remount
      // with no in-memory session (e.g. app was killed mid-game) would reload
      // empty/stale DB answers. Recover from the local mirror and keep whichever
      // source has more progress so we never replay already-answered questions.
      let restored = dbAnswers;
      try {
        const localAnswers = await getQuizProgress(session.id);
        if (localAnswers && localAnswers.length > dbAnswers.length) {
          restored = localAnswers;
        }
      } catch {}
      setMyAnswers(restored);
      myAnswersRef.current = restored;
    } else {
      setMyAnswers([]);
      myAnswersRef.current = [];
    }

    // Set up the channel when joining multiplayer. Reuse the existing channel
    // ONLY if it's already bound to this same session (prevents a mid-game
    // reset on remount/reconnect). If it's bound to a different session — e.g.
    // the user starts a new match without explicitly leaving the previous one —
    // tear it down and rebuild so we don't stay on the stale session's channel.
    if (session.mode === 'multiplayer') {
      const boundToThisSession =
        channelRef.current && channelSessionIdRef.current === session.id;
      if (!boundToThisSession) {
        await setupChannel(session.id);
      }
    }

    return session;
  }, [setupChannel]);

  const setReadyAction = useCallback(() => {
    setIsReady(true);
    if (channelRef.current) {
      channelRef.current.track({ ready: true, joinedAt: Date.now() });
    }
  }, []);

  const submitAnswerAction = useCallback(async (
    questionIndex: number,
    selectedIndex: number,
    correct: boolean,
    timeMs: number,
  ) => {
    // Append locally for instant tracking. Guard against duplicate submissions
    // for the same question index (e.g. a tap racing the timer expiry) so a
    // recovered session can't accumulate phantom extra answers.
    const answer: ParticipantAnswer = { questionIndex, selectedIndex, correct, timeMs };
    const alreadyAnswered = myAnswersRef.current.some((a) => a.questionIndex === questionIndex);
    const updatedAnswers = alreadyAnswered
      ? myAnswersRef.current
      : [...myAnswersRef.current, answer];
    myAnswersRef.current = updatedAnswers;
    setMyAnswers(updatedAnswers);

    // Database write removed to prevent realtime congestion. Answers are held in
    // `myAnswersRef`, written as a batch when the quiz finishes, and mirrored to
    // local storage on every answer so progress survives a mid-game app restart.
    if (currentSession?.id && !alreadyAnswered) {
      void saveQuizProgress(currentSession.id, updatedAnswers);
    }

    // Broadcast to opponents — use cached userId ref to avoid auth roundtrip per answer
    if (channelRef.current && currentSession?.mode === 'multiplayer' && myUserIdRef.current) {
      const currentScore = updatedAnswers.filter((a) => a.correct).length * 10 + (correct && timeMs < 5000 ? 5 : 0);
      channelRef.current.send({
        type: 'broadcast',
        event: 'answer_submitted',
        payload: {
          userId: myUserIdRef.current,
          questionIndex,
          correct,
          score: currentScore,
        },
      });
    }
  }, [currentSession]);

  const finishQuizAction = useCallback(async () => {
    if (!myParticipantId || !currentSession) return;

    // Use ref to read latest answers — avoids stale closure (the XP=0 bug)
    const latestAnswers = myAnswersRef.current;

    // Determine if winner (only for multiplayer)
    const isMultiplayer = currentSession.mode === 'multiplayer';
    // Score = base (10 per correct) + speed bonus (5 if < 5000ms)
    const myScore = latestAnswers.reduce(
      (sum, a) => sum + (a.correct ? 10 : 0) + (a.correct && a.timeMs < 5000 ? 5 : 0),
      0,
    );

    let isWinner = false;
    if (isMultiplayer) {
      const opScores = Array.from(opponentProgress.values()).map((o) => o.score);
      // Empty array: `[].every(...)` is true — without opponent signals, never claim win.
      if (opScores.length > 0) {
        const bestOpponent = Math.max(...opScores);
        isWinner = myScore > bestOpponent;
      }
    }

    await quizApi.finishParticipant({
      participantId: myParticipantId,
      sessionId: currentSession.id,
      answers: latestAnswers,
      score: myScore,
      isWinner,
      isMultiplayer,
    });

    // Broadcast finish — use cached userId ref
    if (channelRef.current && isMultiplayer && myUserIdRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'player_finished',
        payload: {
          userId: myUserIdRef.current,
          score: myScore,
        },
      });
    }

    // Close the session:
    // - Solo: always finish immediately (only one participant, no race possible)
    // - Multiplayer: check if all players finished; finishSession is idempotent so
    //   double-calling by simultaneous finishers is harmless (UPDATE is a no-op once done)
    if (!isMultiplayer) {
      await quizApi.finishSession(currentSession.id);
    } else {
      const parts = await quizApi.getSessionParticipants(currentSession.id);
      if (parts.every((p) => p.finished)) {
        await quizApi.finishSession(currentSession.id);
      }
    }

    // Progress is now durably saved in the DB — drop the local recovery mirror.
    void clearQuizProgress(currentSession.id);
  }, [myParticipantId, currentSession, opponentProgress]);


  const broadcastGameStart = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'game_start',
        payload: {},
      });
    }
  }, []);

  const leaveQuiz = useCallback(() => {
    cleanupChannel();
    const leavingSessionId = currentSession?.id;
    if (leavingSessionId) void clearQuizProgress(leavingSessionId);
    setCurrentSession(null);
    setParticipants([]);
    setMyParticipantId(null);
    setMyAnswers([]);
    myAnswersRef.current = [];
    myUserIdRef.current = null;
    setOpponentProgress(new Map());
    setCountdown(null);
    setIsReady(false);
    setAllReady(false);
  }, [cleanupChannel, currentSession]);

  const value = useMemo<QuizState>(
    () => ({
      currentSession,
      participants,
      myParticipantId,
      myAnswers,
      opponentProgress,
      countdown,
      isReady,
      allReady,
      createQuiz,
      joinQuiz,
      setReady: setReadyAction,
      broadcastGameStart,
      submitAnswer: submitAnswerAction,
      finishQuiz: finishQuizAction,
      leaveQuiz,
      refreshParticipants,
    }),
    [
      currentSession,
      participants,
      myParticipantId,
      myAnswers,
      opponentProgress,
      countdown,
      isReady,
      allReady,
      createQuiz,
      joinQuiz,
      setReadyAction,
      broadcastGameStart,
      submitAnswerAction,
      finishQuizAction,
      leaveQuiz,
      refreshParticipants,
    ],
  );

  return <QuizContext.Provider value={value}>{children}</QuizContext.Provider>;
}

export function useQuiz() {
  const ctx = useContext(QuizContext);
  if (!ctx) throw new Error('useQuiz must be used within QuizProvider');
  return ctx;
}
