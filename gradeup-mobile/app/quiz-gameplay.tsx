import { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';

const TOTAL_QUESTIONS = 5;

export default function QuizGameplay() {
  const { flashcards } = useApp();
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(15);

  const questions = useMemo(() => {
    const list: { q: string; opts: string[]; correct: number }[] = [];
    const shuffled = [...flashcards].sort(() => Math.random() - 0.5).slice(0, TOTAL_QUESTIONS);
    for (const card of shuffled) {
      const front = card?.front ?? (card as any)?.question ?? 'No question';
      const back = card?.back ?? (card as any)?.answer ?? 'Answer';
      const wrongs = flashcards.filter((c) => c.id !== card.id).map((c) => c?.back ?? (c as any)?.answer ?? 'Option');
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
  }, [flashcards]);

  const current = questions[qIndex];
  const isLast = qIndex >= questions.length - 1;

  useEffect(() => {
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (!isLast) {
            setQIndex((i) => i + 1);
            setSelectedIdx(null);
            return 15;
          }
          router.replace({ pathname: '/results-page' as any, params: { score: String(score) } });
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [qIndex, isLast]);

  const handleOption = (idx: number) => {
    if (selectedIdx !== null) return;
    setSelectedIdx(idx);
    const correct = idx === current.correct;
    const newScore = score + (correct ? 10 : 0);
    if (isLast) {
      setTimeout(() => router.replace({ pathname: '/results-page' as any, params: { score: String(newScore) } }), 800);
    } else {
      setTimeout(() => {
        setQIndex((i) => i + 1);
        setSelectedIdx(null);
        setScore(newScore);
        setTimeLeft(15);
      }, 800);
    }
  };

  if (!current) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>No questions.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Q {qIndex + 1}/{questions.length}</Text>
        </View>
        <View style={styles.scoreRow}>
          <Icons.Sparkles size={16} color={COLORS.gold} />
          <Text style={styles.scoreText}>Score: {score}</Text>
        </View>
      </View>

      <View style={styles.timerBg}>
        <View style={[styles.timerFill, { width: `${(timeLeft / 15) * 100}%` }]} />
      </View>

      <View style={styles.card}>
        <Text style={styles.question}>{current.q}</Text>
      </View>

      <View style={styles.opts}>
        {current.opts.map((opt, idx) => (
          <Pressable
            key={idx}
            style={[
              styles.optBtn,
              selectedIdx === idx && idx === current.correct && styles.optCorrect,
              selectedIdx === idx && idx !== current.correct && styles.optWrong,
            ]}
            onPress={() => handleOption(idx)}
            disabled={selectedIdx !== null}
          >
            <Text style={styles.optText}>{opt}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.card, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  badge: { backgroundColor: 'rgba(26,60,42,0.3)', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 14 },
  badgeText: { fontSize: 10, fontWeight: '800', color: COLORS.text, letterSpacing: 0.5 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreText: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  timerBg: { height: 10, backgroundColor: COLORS.bg, borderRadius: 5, overflow: 'hidden', marginBottom: 32 },
  timerFill: { height: '100%', backgroundColor: COLORS.gold, borderRadius: 5 },
  card: { backgroundColor: COLORS.navy, borderRadius: 32, padding: 32, marginBottom: 28 },
  question: { fontSize: 20, fontWeight: '700', color: COLORS.white, textAlign: 'center', lineHeight: 28 },
  opts: { gap: 14 },
  optBtn: { backgroundColor: COLORS.bg, padding: 22, borderRadius: 22, borderWidth: 2, borderColor: COLORS.border },
  optCorrect: { backgroundColor: 'rgba(5,150,105,0.15)', borderColor: '#059669' },
  optWrong: { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: '#ef4444' },
  optText: { fontSize: 16, fontWeight: '700', color: COLORS.text, lineHeight: 22 },
  empty: { fontSize: 16, color: COLORS.gray, textAlign: 'center', marginTop: 48 },
  backBtn: { marginTop: 28, alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 28, backgroundColor: COLORS.navy, borderRadius: 16 },
  backBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
});