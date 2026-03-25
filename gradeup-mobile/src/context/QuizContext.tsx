import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import * as quizApi from '../lib/quizApi';
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
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up channel on unmount or session change
  const cleanupChannel = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
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
  }, [cleanupChannel]);

  const startCountdown = useCallback(() => {
    setCountdown(3);
    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
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
    setOpponentProgress(new Map());
    setCountdown(null);
    setIsReady(false);
    setAllReady(false);

    // Get my participant id
    const parts = await quizApi.getSessionParticipants(session.id);
    setParticipants(parts);
    const { data: { session: authSession } } = await supabase.auth.getSession();
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
    setMyAnswers([]);
    setOpponentProgress(new Map());
    setCountdown(null);
    setIsReady(false);
    setAllReady(false);

    const parts = await quizApi.getSessionParticipants(session.id);
    setParticipants(parts);

    if (!myParticipantId) {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const myPart = parts.find((p) => p.user_id === authSession?.user?.id);
      setMyParticipantId(myPart?.id || null);
    }

    if (session.mode === 'multiplayer') {
      await setupChannel(session.id);
    }

    return session;
  }, [setupChannel, myParticipantId]);

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
    const answer: ParticipantAnswer = { questionIndex, selectedIndex, correct, timeMs };
    setMyAnswers((prev) => [...prev, answer]);

    if (myParticipantId) {
      await quizApi.submitAnswer(myParticipantId, questionIndex, selectedIndex, correct, timeMs);
    }

    // Broadcast to opponents
    if (channelRef.current && currentSession?.mode === 'multiplayer') {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const currentAnswers = myAnswers.length + 1;
      const currentScore = myAnswers.filter((a) => a.correct).length * 10 + (correct ? 10 : 0);
      channelRef.current.send({
        type: 'broadcast',
        event: 'answer_submitted',
        payload: {
          userId: authSession?.user?.id,
          questionIndex,
          correct,
          score: currentScore,
        },
      });
    }
  }, [myParticipantId, currentSession, myAnswers]);

  const finishQuizAction = useCallback(async () => {
    if (!myParticipantId || !currentSession) return;

    // Determine if winner (only for multiplayer)
    const isMultiplayer = currentSession.mode === 'multiplayer';
    let isWinner = false;
    if (isMultiplayer) {
      const myScore = myAnswers.filter((a) => a.correct).length * 10;
      const opScores = Array.from(opponentProgress.values()).map((o) => o.score);
      isWinner = opScores.every((s) => myScore >= s);
    }

    await quizApi.finishParticipant(myParticipantId, currentSession.id, isWinner, isMultiplayer);

    // Broadcast finish
    if (channelRef.current && isMultiplayer) {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      channelRef.current.send({
        type: 'broadcast',
        event: 'player_finished',
        payload: {
          userId: authSession?.user?.id,
          score: myAnswers.filter((a) => a.correct).length * 10,
        },
      });
    }

    // If all players finished, close session
    if (currentSession) {
      const parts = await quizApi.getSessionParticipants(currentSession.id);
      if (parts.every((p) => p.finished)) {
        await quizApi.finishSession(currentSession.id);
      }
    }
  }, [myParticipantId, currentSession, myAnswers, opponentProgress]);

  const leaveQuiz = useCallback(() => {
    cleanupChannel();
    setCurrentSession(null);
    setParticipants([]);
    setMyParticipantId(null);
    setMyAnswers([]);
    setOpponentProgress(new Map());
    setCountdown(null);
    setIsReady(false);
    setAllReady(false);
  }, [cleanupChannel]);

  const value: QuizState = {
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
    submitAnswer: submitAnswerAction,
    finishQuiz: finishQuizAction,
    leaveQuiz,
    refreshParticipants,
  };

  return <QuizContext.Provider value={value}>{children}</QuizContext.Provider>;
}

export function useQuiz() {
  const ctx = useContext(QuizContext);
  if (!ctx) throw new Error('useQuiz must be used within QuizProvider');
  return ctx;
}
