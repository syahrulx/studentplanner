import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Pressable, TextInput, StyleSheet, Alert, ActivityIndicator, ScrollView, AppState,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useQuiz } from '@/src/context/QuizContext';
import type { FinishParticipantResult } from '@/src/lib/quizApi';
import type { GeneratedQuizQuestion } from '@/src/lib/studyApi';
import { gradeShortAnswer, pointsForAnswer, computeLocalScore } from '@/src/lib/quizGrading';
import { recordQuizAttempts, type QuizAttemptRow } from '@/src/lib/quizAttempts';

const TIMER_MAP: Record<string, number> = { easy: 20, medium: 15, hard: 10 };
/** Multiplayer keeps pace: the feedback panel auto-advances after this long. */
const MULTI_AUTO_ADVANCE_S = 8;
/** Ghost-tap guard after a question renders. */
const INPUT_GATE_MS = 220;

type Feedback = {
  correct: boolean;
  selectedIndex: number;
  typedAnswer: string | null;
  timedOut: boolean;
};

function isShortAnswerQuestion(q: GeneratedQuizQuestion | undefined): boolean {
  if (!q) return false;
  return q.kind === 'short_answer' || !q.options || q.options.length === 0;
}

function correctAnswerText(q: GeneratedQuizQuestion | undefined): string {
  if (!q) return '';
  if (isShortAnswerQuestion(q)) return (q.expectedAnswer || '').trim() || '—';
  const opt = q.options?.[q.correctIndex];
  return opt ? `${String.fromCharCode(65 + q.correctIndex)}. ${opt}` : '—';
}

export default function QuizGameplay() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const { user } = useApp();
  const theme = useTheme();
  const {
    currentSession, participants, myParticipantId, myAnswers,
    opponentProgress, submitAnswer, finishQuiz, joinQuiz, abandonQuiz,
  } = useQuiz();

  const [session, setSession] = useState(currentSession);
  const [loadingSession, setLoadingSession] = useState(!currentSession);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [shortAnswer, setShortAnswer] = useState('');
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [autoAdvanceLeft, setAutoAdvanceLeft] = useState<number | null>(null);
  const [opponentFlash, setOpponentFlash] = useState('');
  const [waitingForOpponents, setWaitingForOpponents] = useState(false);
  const [showSkipBtn, setShowSkipBtn] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [inputEnabled, setInputEnabled] = useState(false);
  const hasRestoredProgressRef = useRef(false);

  const scoreRef = useRef(0);
  scoreRef.current = score;
  /** Wall-clock start of the current question; remaining time is derived from it. */
  const questionStartedAtRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qIndexRef = useRef(qIndex);
  qIndexRef.current = qIndex;
  const feedbackRef = useRef<Feedback | null>(null);
  feedbackRef.current = feedback;
  const submitLockRef = useRef(false);
  const handledQuestionRef = useRef<number | null>(null);
  const nextLockRef = useRef(false);
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAdvanceTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputGateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armedTapRef = useRef<{ qIndex: number; optionIdx: number } | null>(null);
  const hasLocalSubmitRef = useRef(false);
  /** Set once the finish flow starts so the unmount cleanup does not abandon the session. */
  const finishingRef = useRef(false);
  const finishResultRef = useRef<FinishParticipantResult | null>(null);
  // Track last opponent questionIndex seen to suppress spurious flashes on initial join
  const lastOpponentQRef = useRef<Map<string, number>>(new Map());

  // Managed registry for short-lived UI timeouts so nothing fires setState
  // after the screen unmounts (e.g. user navigates to results).
  const flashTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const scheduleFlash = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      flashTimeoutsRef.current.delete(id);
      fn();
    }, ms);
    flashTimeoutsRef.current.add(id);
    return id;
  }, []);

  // Load session from DB if not in context. `joinQuiz` throws when the session
  // no longer exists — surface that instead of crashing on a null deref.
  useEffect(() => {
    // Context session matches the route (or no route id): use it directly. A
    // stale context session from a previous match falls through to a re-join.
    if (currentSession && (!sessionId || currentSession.id === sessionId)) {
      setSession(currentSession);
      setLoadingSession(false);
      return;
    }
    if (!sessionId) {
      setLoadingSession(false);
      return;
    }
    let cancelled = false;
    setLoadingSession(true);
    joinQuiz(sessionId)
      .then((s) => { if (!cancelled) setSession(s); })
      .catch(() => {
        if (cancelled) return;
        setSessionUnavailable(true);
        Alert.alert('Match unavailable', 'This match is no longer available.', [
          { text: 'OK', onPress: () => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/notes' as any); } },
        ]);
      })
      .finally(() => { if (!cancelled) setLoadingSession(false); });
    return () => { cancelled = true; };
  }, [sessionId, currentSession, joinQuiz]);

  // Reset one-time restore guard whenever session changes.
  useEffect(() => {
    hasRestoredProgressRef.current = false;
    hasLocalSubmitRef.current = false;
  }, [session?.id]);

  const questions: GeneratedQuizQuestion[] = useMemo(() => {
    return (session?.questions as GeneratedQuizQuestion[]) || [];
  }, [session]);

  // Timer is a session-level setting stored once on questions[0].
  const timerFromQuestion = Number(questions?.[0]?.__timerSeconds);
  const timerSeconds =
    Number.isFinite(timerFromQuestion) && timerFromQuestion >= 0
      ? timerFromQuestion
      : (TIMER_MAP[session?.difficulty || 'medium'] || 15);
  const [timeLeft, setTimeLeft] = useState(timerSeconds);
  const isMultiplayer = session?.mode === 'multiplayer';

  const current = questions[qIndex];
  const hasQuestion = !!current;
  const isLast = questions.length > 0 && qIndex >= questions.length - 1;
  const isLastRef = useRef(isLast);
  isLastRef.current = isLast;
  const isShortAnswer = isShortAnswerQuestion(current);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const questionsRef = useRef(questions);
  questionsRef.current = questions;

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearAdvanceTimers = useCallback(() => {
    if (advanceTimeoutRef.current) {
      clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = null;
    }
    if (autoAdvanceTickRef.current) {
      clearInterval(autoAdvanceTickRef.current);
      autoAdvanceTickRef.current = null;
    }
    setAutoAdvanceLeft(null);
  }, []);

  const remainingSeconds = useCallback(() => {
    if (timerSeconds <= 0) return 0;
    const elapsedMs = Date.now() - questionStartedAtRef.current;
    return Math.max(0, Math.ceil((timerSeconds * 1000 - elapsedMs) / 1000));
  }, [timerSeconds]);

  const forceNavigateToResults = useCallback(() => {
    const result = finishResultRef.current;
    const total = questionsRef.current.length;
    router.replace({
      pathname: '/results-page',
      params: {
        sessionId: sessionRef.current?.id || '',
        score: String(result ? result.score : scoreRef.current),
        total: String(result?.total_questions || total),
        xp: result ? String(result.xp_earned) : '',
        correct: result ? String(result.correct_count) : '',
        winner: result?.is_winner ? '1' : '0',
        graded: result ? '1' : '0',
      },
    } as any);
  }, []);

  /** Best-effort: persist every graded question for the wrong-answer bank / mastery. */
  const recordAttempts = useCallback(async (result: FinishParticipantResult) => {
    const s = sessionRef.current;
    const qs = questionsRef.current;
    if (!s || !user?.id || result.answers.length === 0) return;
    const fallbackNoteId =
      s.source_type === 'flashcards' && s.source_id && s.source_id !== '_all' && s.source_id !== '_saved'
        ? s.source_id
        : null;
    const rows: QuizAttemptRow[] = [];
    for (const a of result.answers) {
      const q = qs[a.questionIndex];
      if (!q) continue;
      rows.push({
        user_id: user.id,
        session_id: s.id,
        question_index: a.questionIndex,
        question: q.question,
        options: q.options || [],
        correct_index: q.correctIndex,
        expected_answer: q.expectedAnswer ?? null,
        explanation: q.explanation ?? null,
        selected_index: a.selectedIndex >= 0 ? a.selectedIndex : null,
        typed_answer: a.typedAnswer ?? null,
        correct: a.correct,
        time_ms: a.timeMs,
        source_type: s.source_type,
        source_id: s.source_id,
        source_note_id: q.sourceNoteId ?? fallbackNoteId,
        difficulty: s.difficulty,
      });
    }
    try {
      await recordQuizAttempts(rows);
    } catch (err) {
      if (__DEV__) console.warn('[quiz] recordQuizAttempts failed', err);
    }
  }, [user?.id]);

  const saveResultsAndWait = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    stopTimer();
    clearAdvanceTimers();

    // The RPC grades and saves — retry once so XP is not silently lost.
    let result: FinishParticipantResult | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await finishQuiz();
        break;
      } catch (err) {
        if (attempt === 1) {
          Alert.alert(
            'Save Failed',
            'Your score could not be saved. Please check your connection.',
            [{ text: 'OK' }],
          );
        }
      }
    }
    finishResultRef.current = result;
    if (result) {
      scoreRef.current = result.score;
      setScore(result.score);
      void recordAttempts(result);
    }
    setFinishing(false);

    if (isMultiplayer) {
      setWaitingForOpponents(true);
      // Show skip button after 5 seconds to prevent being stuck if someone drops
      scheduleFlash(() => setShowSkipBtn(true), 5000);
    } else {
      forceNavigateToResults();
    }
  }, [finishQuiz, isMultiplayer, forceNavigateToResults, scheduleFlash, stopTimer, clearAdvanceTimers, recordAttempts]);

  // Reconnect / recovery fast-forward — restore qIndex and score from existing
  // answers (DB or local mirror). Runs once after join/reconnect, and only once
  // the questions have loaded so we can resolve the correct position.
  useEffect(() => {
    if (hasRestoredProgressRef.current) return;
    if (hasLocalSubmitRef.current) return;
    if (!myAnswers || myAnswers.length === 0) return;
    if (qIndex !== 0) return;
    const total = questions.length;
    if (total === 0) return; // wait until the session's questions have loaded

    hasRestoredProgressRef.current = true;
    const sum = computeLocalScore(myAnswers);
    scoreRef.current = sum;
    setScore(sum);

    if (myAnswers.length >= total) {
      // Every question was already answered but results were never saved
      // (e.g. the app was killed right after the last answer). Finalize now
      // instead of landing on an out-of-range, blank question.
      void saveResultsAndWait();
    } else {
      setQIndex(myAnswers.length);
    }
  }, [myAnswers, qIndex, questions.length, saveResultsAndWait]);

  /** Move to the next question, or finish after the last one. */
  const handleNext = useCallback(() => {
    if (nextLockRef.current || finishingRef.current) return;
    nextLockRef.current = true;
    clearAdvanceTimers();
    if (isLastRef.current) {
      void saveResultsAndWait();
      return;
    }
    // Reset the feedback synchronously with the index change so the next
    // question never renders with the previous panel still visible.
    setFeedback(null);
    setSelectedIdx(null);
    setShortAnswer('');
    setQIndex((i) => i + 1);
  }, [clearAdvanceTimers, saveResultsAndWait]);
  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;

  /** Show the feedback panel; in multiplayer also arm the auto-advance. */
  const showFeedback = useCallback((fb: Feedback) => {
    stopTimer();
    setFeedback(fb);
    if (isMultiplayer) {
      clearAdvanceTimers();
      setAutoAdvanceLeft(MULTI_AUTO_ADVANCE_S);
      const deadline = Date.now() + MULTI_AUTO_ADVANCE_S * 1000;
      autoAdvanceTickRef.current = setInterval(() => {
        setAutoAdvanceLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
      }, 250);
      advanceTimeoutRef.current = setTimeout(() => {
        advanceTimeoutRef.current = null;
        handleNextRef.current();
      }, MULTI_AUTO_ADVANCE_S * 1000);
    }
  }, [isMultiplayer, stopTimer, clearAdvanceTimers]);

  const handleTimerExpired = useCallback(async () => {
    const qi = qIndexRef.current;
    if (submitLockRef.current || handledQuestionRef.current === qi || feedbackRef.current) return;
    submitLockRef.current = true;
    handledQuestionRef.current = qi;
    hasLocalSubmitRef.current = true;
    const timeMs = timerSeconds * 1000;
    setStreak(0);
    setShortAnswer('');
    showFeedback({ correct: false, selectedIndex: -1, typedAnswer: null, timedOut: true });
    if (myParticipantId) {
      await submitAnswer(qi, -1, false, timeMs, null);
    }
  }, [myParticipantId, timerSeconds, submitAnswer, showFeedback]);
  const handleTimerExpiredRef = useRef(handleTimerExpired);
  handleTimerExpiredRef.current = handleTimerExpired;

  // Per-question setup: reset guards, start the wall-clock timer.
  useEffect(() => {
    if (!hasQuestion) return;
    clearAdvanceTimers();
    if (inputGateTimeoutRef.current) {
      clearTimeout(inputGateTimeoutRef.current);
      inputGateTimeoutRef.current = null;
    }
    submitLockRef.current = false;
    handledQuestionRef.current = null;
    nextLockRef.current = false;
    armedTapRef.current = null;
    setInputEnabled(false);
    setFeedback(null);
    setSelectedIdx(null);
    questionStartedAtRef.current = Date.now();
    setTimeLeft(timerSeconds);
    // Prevent ghost taps from previous question from auto-selecting next question.
    inputGateTimeoutRef.current = setTimeout(() => setInputEnabled(true), INPUT_GATE_MS);

    stopTimer();
    if (timerSeconds <= 0) return;
    timerRef.current = setInterval(() => {
      if (feedbackRef.current) return;
      const remaining = remainingSeconds();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        stopTimer();
        void handleTimerExpiredRef.current();
      }
    }, 250);
    return () => stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIndex, timerSeconds, hasQuestion]);

  // App foreground: recompute from the wall clock and expire if the deadline passed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (timerSeconds <= 0 || feedbackRef.current || finishingRef.current) return;
      if (!questionsRef.current[qIndexRef.current]) return;
      const remaining = remainingSeconds();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        stopTimer();
        void handleTimerExpiredRef.current();
      }
    });
    return () => sub.remove();
  }, [timerSeconds, remainingSeconds, stopTimer]);

  // Unmount: clear every pending timer; if the player backed out mid-game,
  // tear down the realtime channel so it does not stay alive.
  const abandonRef = useRef(abandonQuiz);
  abandonRef.current = abandonQuiz;
  useEffect(() => {
    const flashTimeouts = flashTimeoutsRef.current;
    return () => {
      if (advanceTimeoutRef.current) clearTimeout(advanceTimeoutRef.current);
      if (autoAdvanceTickRef.current) clearInterval(autoAdvanceTickRef.current);
      if (inputGateTimeoutRef.current) clearTimeout(inputGateTimeoutRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      flashTimeouts.forEach((id) => clearTimeout(id));
      flashTimeouts.clear();
      if (!finishingRef.current) abandonRef.current();
    };
  }, []);

  // Monitor opponent progress for flashes and check if all finished / left
  const opponentEntries = useMemo(() => Array.from(opponentProgress.values()), [opponentProgress]);
  const totalOpponents = Math.max(1, (participants.length || 2) - 1);
  const finishedOpponents = opponentEntries.filter((o) => o.finished).length;
  const disconnectedOpponents = opponentEntries.filter((o) => o.disconnected && !o.finished).length;
  const everyoneAccountedFor = finishedOpponents + disconnectedOpponents >= totalOpponents;
  const opponentLeft = disconnectedOpponents > 0;

  useEffect(() => {
    // Check if waiting for opponents to finish
    if (waitingForOpponents && isMultiplayer && finishedOpponents >= totalOpponents) {
      forceNavigateToResults();
      return;
    }

    const latest = [...opponentEntries].sort((a, b) => b.questionIndex - a.questionIndex)[0];
    if (!latest || latest.disconnected) return;
    const prevIndex = lastOpponentQRef.current.get(latest.userId) ?? -1;
    if (latest.questionIndex > prevIndex) {
      lastOpponentQRef.current.set(latest.userId, latest.questionIndex);
      setOpponentFlash(latest.correct ? 'correct' : 'wrong');
      scheduleFlash(() => setOpponentFlash(''), 1500);
    }
  }, [opponentEntries, waitingForOpponents, isMultiplayer, finishedOpponents, totalOpponents, forceNavigateToResults, scheduleFlash]);

  const applyLocalResult = (correct: boolean, timeMs: number) => {
    const newScore = scoreRef.current + pointsForAnswer(correct, timeMs);
    scoreRef.current = newScore;
    setScore(newScore);
    setStreak((s) => (correct ? s + 1 : 0));
  };

  const handleOption = async (idx: number) => {
    const qi = qIndexRef.current;
    if (!inputEnabled || selectedIdx !== null || submitLockRef.current || handledQuestionRef.current === qi || feedbackRef.current) return;
    if (!armedTapRef.current || armedTapRef.current.qIndex !== qi || armedTapRef.current.optionIdx !== idx) return;
    if (!current) return;
    armedTapRef.current = null;
    submitLockRef.current = true;
    handledQuestionRef.current = qi;
    hasLocalSubmitRef.current = true;
    const timeMs = Math.max(0, Date.now() - questionStartedAtRef.current);
    const correct = idx === current.correctIndex;

    setSelectedIdx(idx);
    applyLocalResult(correct, timeMs);
    showFeedback({ correct, selectedIndex: idx, typedAnswer: null, timedOut: false });

    if (myParticipantId) {
      await submitAnswer(qi, idx, correct, timeMs, null);
    }
  };

  const handleShortAnswerSubmit = async () => {
    const qi = qIndexRef.current;
    const typed = shortAnswer.trim();
    if (!inputEnabled || selectedIdx !== null || submitLockRef.current || !typed || handledQuestionRef.current === qi || feedbackRef.current) return;
    if (!current) return;
    submitLockRef.current = true;
    handledQuestionRef.current = qi;
    hasLocalSubmitRef.current = true;
    const timeMs = Math.max(0, Date.now() - questionStartedAtRef.current);
    // Instant local feedback mirrors the DB grader; the RPC result is authoritative.
    const correct = gradeShortAnswer(typed, current.expectedAnswer, current.acceptedAnswers);

    setSelectedIdx(0);
    applyLocalResult(correct, timeMs);
    showFeedback({ correct, selectedIndex: -1, typedAnswer: typed, timedOut: false });

    if (myParticipantId) {
      await submitAnswer(qi, -1, correct, timeMs, typed);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loadingSession || finishing) {
    return (
      <View style={[s.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[s.empty, { color: theme.textSecondary, marginTop: 16 }]}>
          {finishing ? 'Saving your results…' : 'Loading match…'}
        </Text>
      </View>
    );
  }

  if (sessionUnavailable) {
    return (
      <View style={[s.container, { backgroundColor: theme.background }]}>
        <Text style={[s.empty, { color: theme.textSecondary }]}>This match is no longer available.</Text>
        <Pressable
          style={[s.backBtn, { backgroundColor: theme.primary }]}
          onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/notes' as any); }}
        >
          <Text style={s.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (waitingForOpponents) {
    return (
      <View style={[s.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        {opponentLeft && everyoneAccountedFor ? (
          <Feather name="user-x" size={40} color={theme.textSecondary} style={{ marginBottom: 20 }} />
        ) : (
          <ActivityIndicator size="large" color={theme.primary} style={{ marginBottom: 20 }} />
        )}
        <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text, marginBottom: 8 }}>
          {opponentLeft && everyoneAccountedFor ? 'Opponent left' : 'Waiting for opponents...'}
        </Text>
        <Text style={{ fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginBottom: 30, paddingHorizontal: 20 }}>
          {opponentLeft && everyoneAccountedFor
            ? 'Your opponent disconnected before finishing. Your score has been saved.'
            : opponentLeft
              ? 'An opponent disconnected. Your score has been saved; results will show once everyone else finishes.'
              : 'Your score has been saved. The final results will be shown once everyone finishes.'}
        </Text>
        {(showSkipBtn || (opponentLeft && everyoneAccountedFor)) && (
          <Pressable
            style={({ pressed }) => [s.backBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.8 }]}
            onPress={forceNavigateToResults}
          >
            <Text style={s.backBtnText}>{opponentLeft && everyoneAccountedFor ? 'View Results' : 'Skip Waiting'}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (!current) {
    return (
      <View style={[s.container, { backgroundColor: theme.background }]}>
        <Text style={[s.empty, { color: theme.textSecondary }]}>No questions available.</Text>
        <Pressable style={[s.backBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={s.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  // Opponent progress bar (multiplayer)
  const opponentMaxQ = opponentEntries.length > 0
    ? Math.max(...opponentEntries.map((o) => o.questionIndex + 1))
    : 0;

  const options = current.options || [];
  const showResult = feedback !== null;
  const explanation = (current.explanation || '').trim();
  const proof = (current.proof || '').trim();

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      {/* Multiplayer opponent bar */}
      {isMultiplayer && (
        <View style={s.opponentBar}>
          <Feather name="users" size={14} color={theme.textSecondary} />
          <View style={[s.opponentTrack, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={[s.opponentFill, { width: `${Math.min(100, (opponentMaxQ / Math.max(1, questions.length)) * 100)}%`, backgroundColor: '#ef4444' }]} />
          </View>
          <Text style={[s.opponentLabel, { color: theme.textSecondary }]}>{opponentMaxQ}/{questions.length}</Text>
          {opponentLeft && <Feather name="user-x" size={14} color="#ef4444" />}
          {opponentFlash !== '' && (
            <View style={[s.opponentFlash, { backgroundColor: opponentFlash === 'correct' ? '#10b981' : '#ef4444' }]} />
          )}
        </View>
      )}

      {/* Header */}
      <View style={s.header}>
        <View style={[s.badge, { backgroundColor: theme.primary + '20' }]}>
          <Text style={[s.badgeText, { color: theme.text }]}>Q {qIndex + 1}/{questions.length}</Text>
        </View>
        {streak > 1 && (
          <View style={[s.streakBadge, { backgroundColor: '#f59e0b20' }]}>
            <Feather name="zap" size={12} color="#f59e0b" />
            <Text style={s.streakText}>{streak}x</Text>
          </View>
        )}
        <View style={s.scoreRow}>
          <Feather name="star" size={16} color="#f59e0b" />
          <Text style={[s.scoreText, { color: theme.text }]}>{score}</Text>
        </View>
      </View>

      {/* Timer */}
      {timerSeconds > 0 ? (
        <View style={s.timerRow}>
          <View style={[s.timerBg, { backgroundColor: theme.backgroundSecondary }]}>
            <View
              style={[
                s.timerFill,
                {
                  width: `${Math.min(100, (timeLeft / timerSeconds) * 100)}%`,
                  backgroundColor: timeLeft <= 5 ? '#ef4444' : theme.primary,
                },
              ]}
            />
          </View>
          <Text style={[s.timerText, { color: timeLeft <= 5 ? '#ef4444' : theme.textSecondary }]}>{timeLeft}s</Text>
        </View>
      ) : (
        <View style={s.timerOffRow}>
          <Feather name="clock" size={14} color={theme.textSecondary} />
          <Text style={[s.timerOffText, { color: theme.textSecondary }]}>No timer mode</Text>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Question card */}
        <View style={[
          s.card,
          { backgroundColor: theme.primary },
          showResult && feedback?.correct && { backgroundColor: '#10b981' },
          showResult && !feedback?.correct && { backgroundColor: '#ef4444' },
        ]}>
          <Text style={s.question}>{current.question}</Text>
        </View>

        {/* Answer area */}
        {isShortAnswer ? (
          <View style={s.shortAnswerWrap}>
            <TextInput
              style={[s.shortInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
              placeholder="Type your answer..."
              placeholderTextColor={theme.textSecondary}
              value={shortAnswer}
              onChangeText={setShortAnswer}
              editable={!showResult}
              onSubmitEditing={() => { void handleShortAnswerSubmit(); }}
              autoFocus
              returnKeyType="send"
            />
            {!showResult && (
              <Pressable
                style={[s.submitBtn, { backgroundColor: shortAnswer.trim() ? theme.primary : '#94a3b8' }]}
                onPress={() => { void handleShortAnswerSubmit(); }}
                disabled={!inputEnabled || !shortAnswer.trim()}
              >
                <Feather name="send" size={18} color="#fff" />
                <Text style={s.submitBtnText}>Submit</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={s.opts}>
            {options.map((opt, idx) => {
              const isSelected = selectedIdx === idx;
              const isCorrect = idx === current.correctIndex;

              let optStyle = { backgroundColor: theme.card, borderColor: theme.border };
              if (showResult && isCorrect) {
                optStyle = { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: '#10b981' };
              } else if (showResult && isSelected && !isCorrect) {
                optStyle = { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: '#ef4444' };
              }

              const label = String.fromCharCode(65 + idx);

              return (
                <Pressable
                  key={`${qIndex}-${idx}`}
                  style={[s.optBtn, optStyle]}
                  onPress={() => handleOption(idx)}
                  onPressIn={() => {
                    const qi = qIndexRef.current;
                    const elapsed = Date.now() - questionStartedAtRef.current;
                    if (inputEnabled && elapsed >= INPUT_GATE_MS) {
                      armedTapRef.current = { qIndex: qi, optionIdx: idx };
                    }
                  }}
                  disabled={!inputEnabled || showResult}
                >
                  <View style={[s.optLabel, { backgroundColor: isSelected ? (isCorrect ? '#10b981' : '#ef4444') : theme.primary + '15' }]}>
                    <Text style={[s.optLabelText, { color: isSelected ? '#fff' : theme.primary }]}>{label}</Text>
                  </View>
                  <Text style={[s.optText, { color: theme.text }]} numberOfLines={3}>{opt}</Text>
                  {showResult && isCorrect && <Feather name="check-circle" size={18} color="#10b981" />}
                  {showResult && isSelected && !isCorrect && <Feather name="x-circle" size={18} color="#ef4444" />}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Feedback panel — shown after every answer, before advancing */}
        {feedback && (
          <View style={[s.feedbackCard, { backgroundColor: theme.card, borderColor: feedback.correct ? '#10b981' : '#ef4444' }]}>
            <View style={s.feedbackHeader}>
              <View style={[s.feedbackBadge, { backgroundColor: feedback.correct ? '#10b981' : '#ef4444' }]}>
                <Feather name={feedback.correct ? 'check' : feedback.timedOut ? 'clock' : 'x'} size={14} color="#fff" />
                <Text style={s.feedbackBadgeText}>
                  {feedback.timedOut ? "Time's up" : feedback.correct ? 'Correct' : 'Incorrect'}
                </Text>
              </View>
            </View>

            {isShortAnswer && feedback.typedAnswer ? (
              <Text style={[s.feedbackMeta, { color: theme.textSecondary }]}>
                Your answer: <Text style={{ color: theme.text, fontWeight: '700' }}>{feedback.typedAnswer}</Text>
              </Text>
            ) : null}

            <Text style={[s.feedbackLabel, { color: theme.textSecondary }]}>Correct answer</Text>
            <Text style={[s.feedbackAnswer, { color: theme.text }]}>{correctAnswerText(current)}</Text>

            {explanation ? (
              <Text style={[s.feedbackExplanation, { color: theme.text }]}>{explanation}</Text>
            ) : null}
            {proof ? (
              <View style={[s.proofBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Feather name="file-text" size={12} color={theme.primary} />
                <Text style={[s.proofText, { color: theme.textSecondary }]}>{proof}</Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [s.nextBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.85 }]}
              onPress={handleNext}
            >
              <Text style={s.nextBtnText}>
                {isLast ? 'See results' : 'Next'}
                {isMultiplayer && autoAdvanceLeft !== null ? ` (${autoAdvanceLeft}s)` : ''}
              </Text>
              <Feather name={isLast ? 'flag' : 'arrow-right'} size={18} color="#fff" />
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const PAD = 20;

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: PAD, paddingTop: 56, paddingBottom: 24 },

  opponentBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  opponentTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  opponentFill: { height: '100%', borderRadius: 3 },
  opponentLabel: { fontSize: 11, fontWeight: '700' },
  opponentFlash: { width: 12, height: 12, borderRadius: 6 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  badge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginLeft: 8 },
  streakText: { fontSize: 12, fontWeight: '800', color: '#f59e0b' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  scoreText: { fontSize: 16, fontWeight: '800' },

  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  timerBg: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  timerFill: { height: '100%', borderRadius: 4 },
  timerText: { fontSize: 13, fontWeight: '800', width: 34 },
  timerOffRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  timerOffText: { fontSize: 13, fontWeight: '700' },

  card: { borderRadius: 24, padding: 28, marginBottom: 20, minHeight: 120, justifyContent: 'center' },
  question: { fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 26 },

  opts: { gap: 12 },
  optBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 2, gap: 12 },
  optLabel: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  optLabelText: { fontSize: 14, fontWeight: '800' },
  optText: { fontSize: 15, fontWeight: '600', flex: 1, lineHeight: 20 },

  shortAnswerWrap: { gap: 12 },
  shortInput: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16, fontSize: 16, fontWeight: '600' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  feedbackCard: { marginTop: 16, borderRadius: 18, borderWidth: 1.5, padding: 16, gap: 8 },
  feedbackHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feedbackBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  feedbackBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  feedbackMeta: { fontSize: 13, fontWeight: '500' },
  feedbackLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 },
  feedbackAnswer: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  feedbackExplanation: { fontSize: 14, lineHeight: 20, fontWeight: '500', marginTop: 4 },
  proofBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, marginTop: 2 },
  proofText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '500' },
  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 6 },
  nextBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  empty: { fontSize: 16, textAlign: 'center', marginTop: 48 },
  backBtn: { marginTop: 28, alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 16 },
  backBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
