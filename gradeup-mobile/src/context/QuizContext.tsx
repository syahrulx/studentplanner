import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import * as quizApi from '../lib/quizApi';
import { computeLocalScore } from '../lib/quizGrading';
import { saveQuizProgress, getQuizProgress, clearQuizProgress } from '../storage';
import type {
  QuizSession,
  QuizParticipant,
  ParticipantAnswer,
  CreateSessionParams,
  FinishParticipantResult,
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
  /** Presence `leave` seen for this player and no re-join since. */
  disconnected?: boolean;
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
  /**
   * Record an answer locally (and broadcast to opponents). `correct` is the
   * client-side grading used only for instant feedback; the DB re-grades at
   * finish.
   */
  submitAnswer: (
    questionIndex: number,
    selectedIndex: number,
    correct: boolean,
    timeMs: number,
    typedAnswer?: string | null,
  ) => Promise<void>;
  /**
   * Submit all raw answers to `finish_quiz_participant`. Resolves with the
   * server-graded result (score, xp, winner flag, graded answers) or null when
   * there is no active session/participant.
   */
  finishQuiz: () => Promise<FinishParticipantResult | null>;
  /** Full reset after a quiz is over (also clears the local progress mirror). */
  leaveQuiz: () => void;
  /**
   * Tear down the realtime channel and in-memory state when the player backs
   * out mid-game. Keeps the local progress mirror so the session can still be
   * resumed via its id.
   */
  abandonQuiz: () => void;
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
  const currentSessionRef = useRef<QuizSession | null>(null);
  useEffect(() => { currentSessionRef.current = currentSession; }, [currentSession]);

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

      // Anyone present again is no longer disconnected (re-join after a drop).
      setOpponentProgress((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const id of presentIds) {
          const existing = next.get(id);
          if (existing?.disconnected) {
            next.set(id, { ...existing, disconnected: false });
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });

    // Presence: opponent left (app killed, back gesture, network drop)
    channel.on('presence', { event: 'leave' }, ({ key }: any) => {
      const leftId = String(key || '');
      if (!leftId || leftId === myUserId) return;
      setOpponentProgress((prev) => {
        const next = new Map(prev);
        const existing = next.get(leftId);
        next.set(leftId, {
          ...(existing || { userId: leftId, questionIndex: 0, correct: false, score: 0, finished: false }),
          disconnected: true,
        });
        return next;
      });
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
          disconnected: false,
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
          disconnected: false,
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
  }, [cleanupChannel, startCountdown]);

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
    currentSessionRef.current = session;
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
      // Look the session up BEFORE joining so a deleted/expired id fails with a
      // clear error instead of a null deref.
      const found = await quizApi.getSession(sessionIdOrCode);
      if (!found) throw new Error('This match is no longer available.');
      await quizApi.joinSession(found.id);
      session = found;
    }

    setCurrentSession(session);
    currentSessionRef.current = session;
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
    typedAnswer: string | null = null,
  ) => {
    // Append locally for instant tracking. Guard against duplicate submissions
    // for the same question index (e.g. a tap racing the timer expiry) so a
    // recovered session can't accumulate phantom extra answers.
    const answer: ParticipantAnswer = { questionIndex, selectedIndex, typedAnswer, correct, timeMs };
    const alreadyAnswered = myAnswersRef.current.some((a) => a.questionIndex === questionIndex);
    const updatedAnswers = alreadyAnswered
      ? myAnswersRef.current
      : [...myAnswersRef.current, answer];
    myAnswersRef.current = updatedAnswers;
    setMyAnswers(updatedAnswers);

    // Database write removed to prevent realtime congestion. Answers are held in
    // `myAnswersRef`, written as a batch when the quiz finishes, and mirrored to
    // local storage on every answer so progress survives a mid-game app restart.
    const session = currentSessionRef.current;
    if (session?.id && !alreadyAnswered) {
      void saveQuizProgress(session.id, updatedAnswers);
    }

    // Broadcast to opponents — use cached userId ref to avoid auth roundtrip per answer.
    // Score uses the same formula as the DB (10 per correct + 5 speed bonus per
    // fast correct answer, accumulated over every answer so far).
    if (channelRef.current && session?.mode === 'multiplayer' && myUserIdRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'answer_submitted',
        payload: {
          userId: myUserIdRef.current,
          questionIndex,
          correct,
          score: computeLocalScore(updatedAnswers),
        },
      });
    }
  }, []);

  const finishQuizAction = useCallback(async (): Promise<FinishParticipantResult | null> => {
    const session = currentSessionRef.current;
    if (!myParticipantId || !session) return null;

    // Use ref to read latest answers — avoids stale closure (the XP=0 bug)
    const latestAnswers = myAnswersRef.current;
    const isMultiplayer = session.mode === 'multiplayer';

    // The database grades, scores, awards the winner bonus and closes the
    // session. Nothing about score / XP / winner is decided on the client.
    const result = await quizApi.finishParticipant({
      sessionId: session.id,
      answers: latestAnswers.map((a) => ({
        questionIndex: a.questionIndex,
        selectedIndex: a.selectedIndex,
        typedAnswer: a.typedAnswer ?? null,
        timeMs: a.timeMs,
      })),
    });

    // Replace local grading with the authoritative graded answers.
    if (result.answers.length > 0) {
      const gradedByIndex = new Map(result.answers.map((a) => [a.questionIndex, a]));
      const merged = latestAnswers.map((a) => {
        const graded = gradedByIndex.get(a.questionIndex);
        return graded ? { ...a, correct: graded.correct, timeMs: graded.timeMs } : a;
      });
      myAnswersRef.current = merged;
      setMyAnswers(merged);
    }

    // Broadcast finish — use cached userId ref
    if (channelRef.current && isMultiplayer && myUserIdRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'player_finished',
        payload: {
          userId: myUserIdRef.current,
          score: result.score,
        },
      });
    }

    // Progress is now durably saved in the DB — drop the local recovery mirror.
    void clearQuizProgress(session.id);
    return result;
  }, [myParticipantId]);


  const broadcastGameStart = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'game_start',
        payload: {},
      });
    }
  }, []);

  const resetState = useCallback(() => {
    cleanupChannel();
    setCurrentSession(null);
    currentSessionRef.current = null;
    setParticipants([]);
    setMyParticipantId(null);
    setMyAnswers([]);
    myAnswersRef.current = [];
    myUserIdRef.current = null;
    setOpponentProgress(new Map());
    setCountdown(null);
    setIsReady(false);
    setAllReady(false);
  }, [cleanupChannel]);

  const leaveQuiz = useCallback(() => {
    const leavingSessionId = currentSessionRef.current?.id;
    if (leavingSessionId) void clearQuizProgress(leavingSessionId);
    resetState();
  }, [resetState]);

  const abandonQuiz = useCallback(() => {
    resetState();
  }, [resetState]);

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
      abandonQuiz,
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
      abandonQuiz,
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
