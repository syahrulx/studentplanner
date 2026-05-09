import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, Alert, ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { getPuzzle, type ConnectionsGroup } from '@/src/data/connectionsPuzzles';
import { calculateScore, saveResult } from '@/src/lib/connectionsStorage';

const COLOR_MAP = {
  yellow: { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' },
  green:  { bg: '#d1fae5', text: '#065f46', border: '#34d399' },
  blue:   { bg: '#dbeafe', text: '#1e40af', border: '#60a5fa' },
  purple: { bg: '#ede9fe', text: '#5b21b6', border: '#a78bfa' },
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ConnectionsGame() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const puzzleId = parseInt(id || '1', 10);
  const puzzle = getPuzzle(puzzleId);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [selected, setSelected] = useState<string[]>([]);
  const [solved, setSolved] = useState<ConnectionsGroup[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [words, setWords] = useState<string[]>([]);
  const [shakeAnim] = useState(new Animated.Value(0));
  const [gameOver, setGameOver] = useState(false);
  const [startTime] = useState(Date.now());
  const [finalScore, setFinalScore] = useState(0);

  useEffect(() => {
    if (!puzzle) return;
    const allWords = puzzle.groups.flatMap((g) => g.words);
    setWords(shuffle(allWords));
  }, [puzzleId]);

  const remainingGroups = useMemo(() => {
    if (!puzzle) return [];
    const solvedLabels = new Set(solved.map((g) => g.label));
    return puzzle.groups.filter((g) => !solvedLabels.has(g.label));
  }, [puzzle, solved]);

  const toggleWord = (word: string) => {
    if (gameOver) return;
    if (solved.some((g) => g.words.includes(word))) return;
    setSelected((prev) => {
      if (prev.includes(word)) return prev.filter((w) => w !== word);
      if (prev.length >= 4) return prev;
      return [...prev, word];
    });
  };

  const shakeSelected = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleSubmit = () => {
    if (selected.length !== 4 || !puzzle) return;

    const match = remainingGroups.find(
      (g) => g.words.every((w) => selected.includes(w))
    );

    if (match) {
      setSolved((prev) => [...prev, match]);
      setSelected([]);
      setWords((prev) => prev.filter((w) => !match.words.includes(w)));

      // Check if all solved
      if (solved.length + 1 === 4) {
        const timeMs = Date.now() - startTime;
        const score = calculateScore(mistakes, timeMs);
        setFinalScore(score);
        setGameOver(true);
        saveResult({
          puzzleId,
          score,
          mistakes,
          timeMs,
          completedAt: new Date().toISOString(),
        });
      }
    } else {
      setMistakes((prev) => prev + 1);
      shakeSelected();

      // Check if "one away" from any group
      for (const g of remainingGroups) {
        const overlap = selected.filter((w) => g.words.includes(w));
        if (overlap.length === 3) {
          Alert.alert('So close!', 'One away from a correct group.');
          return;
        }
      }

      if (mistakes + 1 >= 4) {
        // Auto-solve remaining
        const timeMs = Date.now() - startTime;
        const score = calculateScore(4, timeMs);
        setFinalScore(score);
        setGameOver(true);
        setSolved(puzzle.groups);
        setWords([]);
        setSelected([]);
        saveResult({
          puzzleId,
          score,
          mistakes: 4,
          timeMs,
          completedAt: new Date().toISOString(),
        });
      }
    }
  };

  const handleShuffle = () => {
    setWords((prev) => shuffle(prev));
  };

  if (!puzzle) {
    return (
      <View style={[s.root, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <Text style={[s.errorText, { color: theme.text }]}>Puzzle not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: theme.primary, marginTop: 16, fontSize: 16 }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const mistakeDots = Array.from({ length: 4 }, (_, i) => i < mistakes);

  return (
    <View style={[s.root, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={[s.headerTitle, { color: theme.text }]}>Puzzle #{puzzleId}</Text>
          <Text style={[s.headerSub, { color: theme.textSecondary }]}>Find 4 groups of 4 words</Text>
        </View>
        <Pressable onPress={handleShuffle} style={[s.shuffleBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="shuffle" size={18} color={theme.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Solved groups */}
        {solved.map((group) => {
          const c = COLOR_MAP[group.color];
          return (
            <View key={group.label} style={[s.solvedCard, { backgroundColor: c.bg, borderColor: c.border }]}>
              <Text style={[s.solvedLabel, { color: c.text }]}>{group.label}</Text>
              <Text style={[s.solvedWords, { color: c.text }]}>{group.words.join(', ')}</Text>
            </View>
          );
        })}

        {/* Word grid */}
        {!gameOver && (
          <Animated.View style={[s.grid, { transform: [{ translateX: shakeAnim }] }]}>
            {words.map((word) => {
              const isSelected = selected.includes(word);
              return (
                <Pressable
                  key={word}
                  onPress={() => toggleWord(word)}
                  style={[
                    s.tile,
                    {
                      backgroundColor: isSelected ? theme.primary : theme.card,
                      borderColor: isSelected ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text style={[s.tileText, { color: isSelected ? '#fff' : theme.text }]}>
                    {word}
                  </Text>
                </Pressable>
              );
            })}
          </Animated.View>
        )}

        {/* Mistakes */}
        <View style={s.mistakesRow}>
          <Text style={[s.mistakesLabel, { color: theme.textSecondary }]}>Mistakes:</Text>
          {mistakeDots.map((filled, i) => (
            <View key={i} style={[s.dot, { backgroundColor: filled ? '#ef4444' : theme.border }]} />
          ))}
        </View>

        {/* Submit / Game Over */}
        {!gameOver ? (
          <Pressable
            onPress={handleSubmit}
            disabled={selected.length !== 4}
            style={[
              s.submitBtn,
              {
                backgroundColor: selected.length === 4 ? theme.primary : theme.backgroundSecondary,
                borderColor: selected.length === 4 ? theme.primary : theme.border,
              },
            ]}
          >
            <Text style={[s.submitText, { color: selected.length === 4 ? '#fff' : theme.textSecondary }]}>
              Submit ({selected.length}/4)
            </Text>
          </Pressable>
        ) : (
          <View style={[s.resultCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Feather name="award" size={36} color="#f59e0b" />
            <Text style={[s.resultTitle, { color: theme.text }]}>
              {mistakes === 0 ? 'Perfect! 🎉' : mistakes <= 2 ? 'Great job! 💪' : 'Completed! ✅'}
            </Text>
            <Text style={[s.resultScore, { color: theme.primary }]}>{finalScore} pts</Text>
            <Text style={[s.resultDetail, { color: theme.textSecondary }]}>
              {mistakes} mistake{mistakes !== 1 ? 's' : ''} · {Math.floor((Date.now() - startTime) / 1000)}s
            </Text>
            <View style={s.resultActions}>
              <Pressable
                onPress={() => router.back()}
                style={[s.resultBtn, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
              >
                <Text style={[s.resultBtnText, { color: theme.text }]}>Back</Text>
              </Pressable>
              {puzzleId < 20 && (
                <Pressable
                  onPress={() => router.replace({ pathname: '/connections-game', params: { id: String(puzzleId + 1) } } as any)}
                  style={[s.resultBtn, { backgroundColor: theme.primary }]}
                >
                  <Text style={[s.resultBtnText, { color: '#fff' }]}>Next Puzzle →</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  errorText: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  shuffleBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  solvedCard: { borderRadius: 14, borderWidth: 1.5, padding: 14, alignItems: 'center' },
  solvedLabel: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  solvedWords: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  tile: {
    width: '23%', aspectRatio: 1.6, borderRadius: 12, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', padding: 4,
  },
  tileText: { fontSize: 11, fontWeight: '800', textAlign: 'center' },
  mistakesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  mistakesLabel: { fontSize: 13, fontWeight: '600', marginRight: 4 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  submitBtn: { height: 50, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitText: { fontSize: 16, fontWeight: '800' },
  resultCard: { borderRadius: 20, borderWidth: 1.5, padding: 28, alignItems: 'center', marginTop: 8, gap: 8 },
  resultTitle: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  resultScore: { fontSize: 32, fontWeight: '900' },
  resultDetail: { fontSize: 14, fontWeight: '500' },
  resultActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  resultBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: 'transparent' },
  resultBtnText: { fontSize: 15, fontWeight: '700' },
});
