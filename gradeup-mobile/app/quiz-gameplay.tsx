import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useQuiz } from '@/src/context/QuizContext';
import * as quizApi from '@/src/lib/quizApi';
import type { GeneratedQuizQuestion } from '@/src/lib/studyApi';

const TIMER_MAP: Record<string, number> = { easy: 20, medium: 15, hard: 10 };

export default function QuizGameplay() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const { language } = useApp();
  const theme = useTheme();
  const {
    currentSession, participants, myParticipantId, myAnswers,
    opponentProgress, submitAnswer, finishQuiz, joinQuiz,
  } = useQuiz();

  const [session, setSession] = useState(currentSession);
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [shortAnswer, setShortAnswer] = useState('');
  const [streak, setStreak] = useState(0);
  const [flashCorrect, setFlashCorrect] = useState(false);
  const [flashWrong, setFlashWrong] = useState(false);
  const [opponentFlash, setOpponentFlash] = useState('');
  const hasRestoredProgressRef = useRef(false);

  const scoreRef = useRef(0);
  scoreRef.current = score;
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiredRef = useRef(false);
  const qIndexRef = useRef(qIndex);
  qIndexRef.current = qIndex;
  const submitLockRef = useRef(false);
  const handledQuestionRef = useRef<number | null>(null);
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputGateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inputEnabled, setInputEnabled] = useState(false);
  const armedTapRef = useRef<{ qIndex: number; optionIdx: number } | null>(null);
  const hasLocalSubmitRef = useRef(false);
  // Track last opponent questionIndex seen to suppress spurious flashes on initial join
  const lastOpponentQRef = useRef<Map<string, number>>(new Map());

  // Load session from DB if not in context
  useEffect(() => {
    if (currentSession) {
      setSession(currentSession);
      return;
    }
    if (sessionId) {
      joinQuiz(sessionId).then((s: any) => setSession(s)).catch(() => {});
    }
  }, [sessionId, currentSession, joinQuiz]);

  // Reset one-time restore guard whenever session changes.
  useEffect(() => {
    hasRestoredProgressRef.current = false;
    hasLocalSubmitRef.current = false;
  }, [session?.id]);

  // Sync reconnected state fast-forward — restore qIndex and score from existing answers
  useEffect(() => {
    if (hasRestoredProgressRef.current) return;
    if (hasLocalSubmitRef.current) return;
    if (!myAnswers || myAnswers.length === 0) return;
    if (qIndex !== 0) return;

    // Run only once after initial join/reconnect.
    hasRestoredProgressRef.current = true;
    setQIndex(myAnswers.length);
    // Include speed bonus (same formula as submitAnswerAction and finishParticipant)
    const sum = myAnswers.reduce(
      (acc, ans) => acc + (ans.correct ? 10 : 0) + (ans.correct && ans.timeMs < 5000 ? 5 : 0),
      0,
    );
    setScore(sum);
  }, [myAnswers, qIndex]);

  const questions: GeneratedQuizQuestion[] = useMemo(() => {
    return (session?.questions as GeneratedQuizQuestion[]) || [];
  }, [session]);

  const timerFromQuestion = Number((questions?.[0] as any)?.__timerSeconds);
  const timerSeconds =
    Number.isFinite(timerFromQuestion) && timerFromQuestion >= 0
      ? timerFromQuestion
      : (TIMER_MAP[session?.difficulty || 'medium'] || 15);
  const [timeLeft, setTimeLeft] = useState(timerSeconds);
  const isMultiplayer = session?.mode === 'multiplayer';

  const current = questions[qIndex];
  const isLast = questions.length > 0 && qIndex >= questions.length - 1;
  const isLastRef = useRef(isLast);
  isLastRef.current = isLast;
  const isShortAnswer = current?.options?.length === 0;

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const questionsRef = useRef(questions);
  questionsRef.current = questions;

  const navigateToResults = useCallback(async () => {
    // Attempt to save results — retry once on failure so XP is not silently lost
    let saved = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await finishQuiz();
        saved = true;
        break;
      } catch (err) {
        if (attempt === 1) {
          // Last attempt failed — warn the user their score may not be saved
          Alert.alert(
            'Save Failed',
            'Your score could not be saved. Please check your connection.',
            [{ text: 'OK' }],
          );
        }
      }
    }
    router.replace({
      pathname: '/results-page',
      params: {
        sessionId: sessionRef.current?.id || '',
        score: String(scoreRef.current),
        total: String(questionsRef.current.length),
      },
    } as any);
  }, [finishQuiz]);

  const handleTimerExpired = useCallback(async () => {
    const qi = qIndexRef.current;
    if (submitLockRef.current || handledQuestionRef.current === qi) return;
    submitLockRef.current = true;
    handledQuestionRef.current = qi;
    hasLocalSubmitRef.current = true;
    const timeMs = timerSeconds * 1000;
    if (myParticipantId) {
      await submitAnswer(qi, -1, false, timeMs);
    }
    setStreak(0);
    setShortAnswer(''); // always clear short-answer input on expiry
    if (isLastRef.current) {
      navigateToResults();
    } else {
      setQIndex((i) => i + 1);
      setSelectedIdx(null);
    }
  }, [myParticipantId, timerSeconds, submitAnswer, navigateToResults]);

  // Timer — countdown only, NO side effects inside the updater
  useEffect(() => {
    if (!current) return;
    if (advanceTimeoutRef.current) {
      clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = null;
    }
    if (inputGateTimeoutRef.current) {
      clearTimeout(inputGateTimeoutRef.current);
      inputGateTimeoutRef.current = null;
    }
    submitLockRef.current = false;
    handledQuestionRef.current = null;
    armedTapRef.current = null;
    setInputEnabled(false);
    startTimeRef.current = Date.now();
    expiredRef.current = false;
    setTimeLeft(timerSeconds);
    // Prevent ghost taps from previous question from auto-selecting next question.
    inputGateTimeoutRef.current = setTimeout(() => setInputEnabled(true), 220);
    if (timerSeconds <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          expiredRef.current = true;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [qIndex, timerSeconds, current]);

  useEffect(() => {
    return () => {
      if (advanceTimeoutRef.current) clearTimeout(advanceTimeoutRef.current);
      if (inputGateTimeoutRef.current) clearTimeout(inputGateTimeoutRef.current);
    };
  }, []);

  // Handle timer expiry in a separate effect to avoid setState-during-render
  useEffect(() => {
    if (timeLeft === 0 && expiredRef.current) {
      expiredRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      handleTimerExpired();
    }
  }, [timeLeft, handleTimerExpired]);

  // Monitor opponent progress for flashes — only fire on a newly advanced question index
  useEffect(() => {
    const entries = Array.from(opponentProgress.values());
    const latest = entries.sort((a, b) => b.questionIndex - a.questionIndex)[0];
    if (!latest) return;
    const prevIndex = lastOpponentQRef.current.get(latest.userId) ?? -1;
    if (latest.questionIndex > prevIndex) {
      lastOpponentQRef.current.set(latest.userId, latest.questionIndex);
      setOpponentFlash(latest.correct ? 'correct' : 'wrong');
      setTimeout(() => setOpponentFlash(''), 1500);
    }
  }, [opponentProgress]);


  const handleOption = async (idx: number) => {
    const qi = qIndexRef.current;
    const elapsed = Date.now() - startTimeRef.current;
    if (elapsed < 550) return; // absorb ghost carry-over taps between question transitions
    if (!inputEnabled || selectedIdx !== null || submitLockRef.current || handledQuestionRef.current === qi) return;
    if (!armedTapRef.current || armedTapRef.current.qIndex !== qi || armedTapRef.current.optionIdx !== idx) return;
    armedTapRef.current = null;
    submitLockRef.current = true;
    handledQuestionRef.current = qi;
    hasLocalSubmitRef.current = true;
    setSelectedIdx(idx);
    const timeMs = Date.now() - startTimeRef.current;
    const correct = idx === current.correctIndex;
    const basePoints = correct ? 10 : 0;
    const speedBonus = correct && timeMs < 5000 ? 5 : 0;
    const newScore = score + basePoints + speedBonus;

    if (correct) {
      setFlashCorrect(true);
      setStreak((s) => s + 1);
      setTimeout(() => setFlashCorrect(false), 600);
    } else {
      setFlashWrong(true);
      setStreak(0);
      setTimeout(() => setFlashWrong(false), 600);
    }

    if (myParticipantId) {
      await submitAnswer(qi, idx, correct, timeMs);
    }

    if (isLast) {
      // Update ref immediately (don't wait for setState re-render) so
      // navigateToResults reads the correct final score
      scoreRef.current = newScore;
      setScore(newScore);
      advanceTimeoutRef.current = setTimeout(() => navigateToResults(), 1000);
    } else {
      advanceTimeoutRef.current = setTimeout(() => {
        setQIndex((i) => i + 1);
        setSelectedIdx(null);
        setShortAnswer('');
        setScore(newScore);
      }, 800);
    }
  };

  const handleShortAnswerSubmit = async () => {
    const qi = qIndexRef.current;
    const elapsed = Date.now() - startTimeRef.current;
    if (elapsed < 550) return; // absorb ghost carry-over taps between question transitions
    if (!inputEnabled || selectedIdx !== null || submitLockRef.current || !shortAnswer.trim() || handledQuestionRef.current === qi) return;
    submitLockRef.current = true;
    handledQuestionRef.current = qi;
    hasLocalSubmitRef.current = true;
    const timeMs = Date.now() - startTimeRef.current;
    const expected = (current.expectedAnswer || '').trim().toLowerCase();
    const given = shortAnswer.trim().toLowerCase();
    const correct = given.length > 0 && (
      given === expected ||
      expected.includes(given) ||
      given.includes(expected)
    );
    const basePoints = correct ? 10 : 0;
    const speedBonus = correct && timeMs < 5000 ? 5 : 0;
    const newScore = score + basePoints + speedBonus;

    if (correct) {
      setFlashCorrect(true);
      setStreak((s) => s + 1);
      setTimeout(() => setFlashCorrect(false), 600);
    } else {
      setFlashWrong(true);
      setStreak(0);
      setTimeout(() => setFlashWrong(false), 600);
    }

    setSelectedIdx(0);
    if (myParticipantId) {
      await submitAnswer(qi, -1, correct, timeMs);
    }

    if (isLast) {
      // Update ref immediately so navigateToResults has correct final score
      scoreRef.current = newScore;
      setScore(newScore);
      advanceTimeoutRef.current = setTimeout(() => navigateToResults(), 1000);
    } else {
      advanceTimeoutRef.current = setTimeout(() => {
        setQIndex((i) => i + 1);
        setSelectedIdx(null);
        setShortAnswer('');
        setScore(newScore);
      }, 800);
    }
  };

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
  const opponentEntries = Array.from(opponentProgress.values());
  const opponentMaxQ = opponentEntries.length > 0
    ? Math.max(...opponentEntries.map((o) => o.questionIndex + 1))
    : 0;

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      {/* Multiplayer opponent bar */}
      {isMultiplayer && (
        <View style={s.opponentBar}>
          <Feather name="users" size={14} color={theme.textSecondary} />
          <View style={[s.opponentTrack, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={[s.opponentFill, { width: `${(opponentMaxQ / questions.length) * 100}%`, backgroundColor: '#ef4444' }]} />
          </View>
          <Text style={[s.opponentLabel, { color: theme.textSecondary }]}>{opponentMaxQ}/{questions.length}</Text>
          {opponentFlash !== '' && (
            <View style={[s.opponentFlash, { backgroundColor: opponentFlash === 'correct' ? '#10b981' : '#ef4444' }]}>
              <Text style={s.opponentFlashText}>{opponentFlash === 'correct' ? '✓' : '✗'}</Text>
            </View>
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

      {/* Timer - circular ring */}
      {timerSeconds > 0 ? (
        <View style={s.timerRow}>
          <View style={[s.timerBg, { backgroundColor: theme.backgroundSecondary }]}>
            <View
              style={[
                s.timerFill,
                {
                  width: `${(timeLeft / timerSeconds) * 100}%`,
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

      {/* Question card */}
      <View style={[
        s.card,
        { backgroundColor: theme.primary },
        flashCorrect && { backgroundColor: '#10b981' },
        flashWrong && { backgroundColor: '#ef4444' },
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
            editable={selectedIdx === null}
            onSubmitEditing={() => { void handleShortAnswerSubmit(); }}
            autoFocus
          />
          <Pressable
            style={[s.submitBtn, { backgroundColor: shortAnswer.trim() ? theme.primary : '#94a3b8' }]}
            onPress={() => { void handleShortAnswerSubmit(); }}
            disabled={!inputEnabled || selectedIdx !== null || !shortAnswer.trim()}
          >
            <Feather name="send" size={18} color="#fff" />
            <Text style={s.submitBtnText}>Submit</Text>
          </Pressable>
          {selectedIdx !== null && current.expectedAnswer && (
            <Text style={[s.expectedAnswer, { color: theme.textSecondary }]}>
              Answer: {current.expectedAnswer}
            </Text>
          )}
        </View>
      ) : (
        <View style={s.opts}>
          {current.options.map((opt, idx) => {
            const isSelected = selectedIdx === idx;
            const isCorrect = idx === current.correctIndex;
            const showResult = selectedIdx !== null;

            let optStyle = { backgroundColor: theme.card, borderColor: theme.border };
            if (showResult && isCorrect) {
              optStyle = { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: '#10b981' };
            } else if (showResult && isSelected && !isCorrect) {
              optStyle = { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: '#ef4444' };
            }

            const labels = ['A', 'B', 'C', 'D'];

            return (
              <Pressable
                key={`${qIndex}-${idx}`}
                style={[s.optBtn, optStyle]}
                onPress={() => handleOption(idx)}
                onPressIn={() => {
                  const qi = qIndexRef.current;
                  const elapsed = Date.now() - startTimeRef.current;
                  if (inputEnabled && elapsed >= 220) {
                    armedTapRef.current = { qIndex: qi, optionIdx: idx };
                  }
                }}
                disabled={!inputEnabled || selectedIdx !== null}
              >
                <View style={[s.optLabel, { backgroundColor: isSelected ? (isCorrect ? '#10b981' : '#ef4444') : theme.primary + '15' }]}>
                  <Text style={[s.optLabelText, { color: isSelected ? '#fff' : theme.primary }]}>{labels[idx]}</Text>
                </View>
                <Text style={[s.optText, { color: theme.text }]} numberOfLines={3}>{opt}</Text>
                {showResult && isCorrect && <Feather name="check-circle" size={18} color="#10b981" />}
                {showResult && isSelected && !isCorrect && <Feather name="x-circle" size={18} color="#ef4444" />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const PAD = 20;

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: PAD, paddingTop: 56, paddingBottom: 40 },

  opponentBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  opponentTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  opponentFill: { height: '100%', borderRadius: 3 },
  opponentLabel: { fontSize: 11, fontWeight: '700' },
  opponentFlash: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  opponentFlashText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  badge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginLeft: 8 },
  streakText: { fontSize: 12, fontWeight: '800', color: '#f59e0b' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  scoreText: { fontSize: 16, fontWeight: '800' },

  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  timerBg: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  timerFill: { height: '100%', borderRadius: 4 },
  timerText: { fontSize: 13, fontWeight: '800', width: 30 },
  timerOffRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  timerOffText: { fontSize: 13, fontWeight: '700' },

  card: { borderRadius: 24, padding: 28, marginBottom: 24, minHeight: 120, justifyContent: 'center' },
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
  expectedAnswer: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 4 },

  empty: { fontSize: 16, textAlign: 'center', marginTop: 48 },
  backBtn: { marginTop: 28, alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 16 },
  backBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
