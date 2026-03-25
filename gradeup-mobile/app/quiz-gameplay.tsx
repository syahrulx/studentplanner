import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Animated } from 'react-native';
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
    opponentProgress, submitAnswer, finishQuiz,
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

  const scoreRef = useRef(0);
  scoreRef.current = score;
  const startTimeRef = useRef(Date.now());

  // Load session from DB if not in context
  useEffect(() => {
    if (currentSession) {
      setSession(currentSession);
      return;
    }
    if (sessionId) {
      quizApi.getSession(sessionId).then((s) => { if (s) setSession(s); });
    }
  }, [sessionId, currentSession]);

  const questions: GeneratedQuizQuestion[] = useMemo(() => {
    return (session?.questions as GeneratedQuizQuestion[]) || [];
  }, [session]);

  const timerSeconds = TIMER_MAP[session?.difficulty || 'medium'] || 15;
  const [timeLeft, setTimeLeft] = useState(timerSeconds);
  const isMultiplayer = session?.mode === 'multiplayer';

  const current = questions[qIndex];
  const isLast = qIndex >= questions.length - 1;
  const isShortAnswer = current?.options?.length === 0;

  // Timer
  useEffect(() => {
    if (!current) return;
    startTimeRef.current = Date.now();
    setTimeLeft(timerSeconds);
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleTimerExpired();
          return timerSeconds;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [qIndex, timerSeconds, current]);

  // Monitor opponent progress for flashes
  useEffect(() => {
    const entries = Array.from(opponentProgress.values());
    const latest = entries.sort((a, b) => b.questionIndex - a.questionIndex)[0];
    if (latest && latest.questionIndex >= 0) {
      setOpponentFlash(latest.correct ? 'correct' : 'wrong');
      setTimeout(() => setOpponentFlash(''), 1500);
    }
  }, [opponentProgress]);

  const handleTimerExpired = useCallback(() => {
    const timeMs = timerSeconds * 1000;
    if (myParticipantId) {
      submitAnswer(qIndex, -1, false, timeMs);
    }
    setStreak(0);
    if (isLast) {
      navigateToResults();
    } else {
      setQIndex((i) => i + 1);
      setSelectedIdx(null);
      setShortAnswer('');
    }
  }, [qIndex, isLast, myParticipantId, timerSeconds]);

  const navigateToResults = useCallback(async () => {
    try {
      await finishQuiz();
    } catch {}
    router.replace({
      pathname: '/results-page',
      params: {
        sessionId: session?.id || '',
        score: String(scoreRef.current),
        total: String(questions.length),
      },
    } as any);
  }, [session, questions, finishQuiz]);

  const handleOption = async (idx: number) => {
    if (selectedIdx !== null) return;
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
      await submitAnswer(qIndex, idx, correct, timeMs);
    }

    if (isLast) {
      setScore(newScore);
      setTimeout(() => navigateToResults(), 1000);
    } else {
      setTimeout(() => {
        setQIndex((i) => i + 1);
        setSelectedIdx(null);
        setShortAnswer('');
        setScore(newScore);
      }, 800);
    }
  };

  const handleShortAnswerSubmit = async () => {
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
      await submitAnswer(qIndex, -1, correct, timeMs);
    }

    if (isLast) {
      setScore(newScore);
      setTimeout(() => navigateToResults(), 1000);
    } else {
      setTimeout(() => {
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
            onSubmitEditing={handleShortAnswerSubmit}
            autoFocus
          />
          <Pressable
            style={[s.submitBtn, { backgroundColor: shortAnswer.trim() ? theme.primary : '#94a3b8' }]}
            onPress={handleShortAnswerSubmit}
            disabled={selectedIdx !== null || !shortAnswer.trim()}
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
                key={idx}
                style={[s.optBtn, optStyle]}
                onPress={() => handleOption(idx)}
                disabled={selectedIdx !== null}
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
