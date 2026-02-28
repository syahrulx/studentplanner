import { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { COLORS, Icons } from '@/src/constants';

export default function FlashcardReview() {
  const { folderId } = useLocalSearchParams<{ folderId?: string }>();
  const { flashcards } = useApp();
  const theme = useTheme();
  const list = useMemo(() => {
    if (folderId) return flashcards.filter((c) => c.folderId === folderId);
    return flashcards;
  }, [flashcards, folderId]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const card = list[index];
  const hasNext = index < list.length - 1;
  const hasPrev = index > 0;

  if (list.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.empty, { color: theme.textSecondary }]}>No flashcards in this folder. Add some first.</Text>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const front = card?.front ?? (card as any).question;
  const back = card?.back ?? (card as any).answer;

  const isQuestion = !flipped;
  const cardBg = isQuestion ? theme.primary : (theme.accent || '#ca8a04');
  const cardLabel = isQuestion ? 'QUESTION / TERM' : 'ANSWER';
  const cardLabelColor = isQuestion ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)';
  const cardTextColor = isQuestion ? '#fff' : '#1c1917';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Icons.ArrowRight size={20} color={theme.text} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <Text style={[styles.count, { color: theme.text }]}>{index + 1} / {list.length}</Text>
      </View>
      <Pressable style={[styles.card, { backgroundColor: cardBg }]} onPress={() => setFlipped((f) => !f)}>
        <Text style={[styles.cardLabel, { color: cardLabelColor }]}>{cardLabel}</Text>
        <Text style={[styles.cardText, { color: cardTextColor }]}>{flipped ? back : front}</Text>
      </Pressable>
      <View style={styles.actions}>
        <Pressable style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.card }, !hasPrev && styles.navDisabled]} onPress={() => { setIndex((i) => i - 1); setFlipped(false); }} disabled={!hasPrev}>
          <Text style={[styles.navBtnText, { color: theme.text }]}>Prev</Text>
        </Pressable>
        <Pressable style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.card }, !hasNext && styles.navDisabled]} onPress={() => { setIndex((i) => i + 1); setFlipped(false); }} disabled={!hasNext}>
          <Text style={[styles.navBtnText, { color: theme.text }]}>Next</Text>
        </Pressable>
      </View>
      <View style={{ height: 48 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 24, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  count: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: COLORS.gray },
  card: { flex: 1, borderRadius: 24, padding: 32, justifyContent: 'center', alignItems: 'center', minHeight: 280 },
  cardLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12, textTransform: 'uppercase' },
  cardText: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  navBtn: { flex: 1, backgroundColor: COLORS.card, paddingVertical: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  navDisabled: { opacity: 0.5 },
  navBtnText: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  empty: { fontSize: 16, color: COLORS.gray, textAlign: 'center', marginTop: 48 },
  backBtn: { marginTop: 24, alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 24, backgroundColor: COLORS.navy, borderRadius: 12 },
  backBtnText: { color: COLORS.white, fontWeight: '700' },
});
