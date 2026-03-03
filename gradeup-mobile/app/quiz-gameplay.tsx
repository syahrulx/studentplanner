import { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Icons } from '@/src/constants';
import { getGeneratedQuizQuestions } from '@/src/lib/studyApi';

const TIMER_SECONDS = 15;

export default function QuizGameplay() {
  const { folderId, total, useGenerated } = useLocalSearchParams<{ folderId?: string; total?: string; useGenerated?: string }>();
  const { flashcards } = useApp();
  const theme = useTheme();
  const totalNum = Math.max(1, Math.min(20, parseInt(total || '5', 10) || 5));

  const pool = useMemo(() => {
    if (folderId && folderId !== '_all') return flashcards.filter((c) => c.folderId === folderId);
    return flashcards;
  }, [flashcards, folderId]);

  const questions = useMemo(() => {
    if (useGenerated === '1') {
      const generated = getGeneratedQuizQuestions();
      if (generated.length > 0) {
        return generated.map((g) => ({
          q: g.question,
          opts: g.options,
          correct: g.correctIndex,
        }));
      }
      return [{ q: 'No questions generated. Add OpenAI API and implement generateQuizFromNotes.', opts: ['OK'], correct: 0 }];
    }
    const list: { q: string; opts: string[]; correct: number }[] = [];
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, totalNum);
    for (const card of shuffled) {
      const front = card?.front ?? (card as any)?.question ?? 'No question';
      const back = card?.back ?? (card as any)?.answer ?? 'Answer';
      const wrongs = pool.filter((c) => c.id !== card.id).map((c) => c?.back ?? (c as any)?.answer ?? 'Option');
      const opts = [back];
      for (let i = 0; opts.length < 4 && i < wrongs.length; i++) {
        if (!opts.includes(wrongs[i])) opts.push(wrongs[i]);
      }
      while (opts.length < 4) opts.push(`Option ${opts.length + 1}`);
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
      }
      const correct = opts.indexOf(back);
      if (correct >= 0) list.push({ q: front, opts, correct });
    }
    return list.length ? list : [{ q: 'No questions available', opts: ['True', 'False'], correct: 0 }];
  }, [pool, totalNum, useGenerated]);

  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const scoreRef = useRef(0);
  scoreRef.current = score;

  const current = questions[qIndex];
  const isLast = qIndex >= questions.length - 1;

  useEffect(() => {
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (!isLast) {
            setQIndex((i) => i + 1);
            setSelectedIdx(null);
            return TIMER_SECONDS;
          }
          const finalScore = scoreRef.current;
          router.replace({
            pathname: '/results-page',
            params: { score: String(finalScore), total: String(questions.length) },
          } as any);
          return TIMER_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [qIndex, isLast, questions.length]);

  const handleOption = (idx: number) => {
    if (selectedIdx !== null) return;
    setSelectedIdx(idx);
    const correct = idx === current.correct;
    const points = correct ? 10 : 0;
    const newScore = score + points;
    if (isLast) {
      setTimeout(() => {
        router.replace({
          pathname: '/results-page',
          params: { score: String(newScore), total: String(questions.length) },
        } as any);
      }, 800);
    } else {
      setTimeout(() => {
        setQIndex((i) => i + 1);
        setSelectedIdx(null);
        setScore(newScore);
        setTimeLeft(TIMER_SECONDS);
      }, 800);
    }
  };

  if (!current) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.empty, { color: theme.textSecondary }]}>No questions.</Text>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: theme.primary + '25' }]}>
          <Text style={[styles.badgeText, { color: theme.text }]}>Q {qIndex + 1}/{questions.length}</Text>
        </View>
        <View style={styles.scoreRow}>
          <Icons.Sparkles size={16} color={theme.accent || '#ca8a04'} />
          <Text style={[styles.scoreText, { color: theme.text }]}>Score: {score}</Text>
        </View>
      </View>

      <View style={[styles.timerBg, { backgroundColor: theme.backgroundSecondary }]}>
        <View style={[styles.timerFill, { width: `${(timeLeft / TIMER_SECONDS) * 100}%`, backgroundColor: theme.primary }]} />
      </View>

      <View style={[styles.card, { backgroundColor: theme.primary }]}>
        <Text style={styles.question}>{current.q}</Text>
      </View>

      <View style={styles.opts}>
        {current.opts.map((opt, idx) => (
          <Pressable
            key={idx}
            style={[
              styles.optBtn,
              { backgroundColor: theme.card, borderColor: theme.border },
              selectedIdx === idx && idx === current.correct && styles.optCorrect,
              selectedIdx === idx && idx !== current.correct && styles.optWrong,
            ]}
            onPress={() => handleOption(idx)}
            disabled={selectedIdx !== null}
          >
            <Text style={[styles.optText, { color: theme.text }]}>{opt}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const PAD = 20;

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: PAD, paddingTop: 56, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  badge: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 14 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreText: { fontSize: 15, fontWeight: '800' },
  timerBg: { height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 32 },
  timerFill: { height: '100%', borderRadius: 5 },
  card: { borderRadius: 32, padding: 32, marginBottom: 28 },
  question: { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 28 },
  opts: { gap: 14 },
  optBtn: { padding: 22, borderRadius: 22, borderWidth: 2 },
  optCorrect: { backgroundColor: 'rgba(5,150,105,0.15)', borderColor: '#059669' },
  optWrong: { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: '#ef4444' },
  optText: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  empty: { fontSize: 16, textAlign: 'center', marginTop: 48 },
  backBtn: { marginTop: 28, alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 16 },
  backBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
