import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';

export default function FlashcardReview() {
  const { flashcards } = useApp();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const card = flashcards[index];
  const hasNext = index < flashcards.length - 1;
  const hasPrev = index > 0;

  if (flashcards.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>No flashcards yet. Generate from a note.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const front = card?.front ?? (card as any).question;
  const back = card?.back ?? (card as any).answer;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Icons.ArrowRight size={20} color={COLORS.gray} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <Text style={styles.count}>{index + 1} / {flashcards.length}</Text>
      </View>
      <Pressable style={styles.card} onPress={() => setFlipped((f) => !f)}>
        <Text style={styles.cardText}>{flipped ? back : front}</Text>
      </Pressable>
      <View style={styles.actions}>
        <Pressable style={[styles.navBtn, !hasPrev && styles.navDisabled]} onPress={() => { setIndex((i) => i - 1); setFlipped(false); }} disabled={!hasPrev}>
          <Text style={styles.navBtnText}>Prev</Text>
        </Pressable>
        <Pressable style={[styles.navBtn, !hasNext && styles.navDisabled]} onPress={() => { setIndex((i) => i + 1); setFlipped(false); }} disabled={!hasNext}>
          <Text style={styles.navBtnText}>Next</Text>
        </Pressable>
      </View>
      <View style={{ height: 48 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 24, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  count: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: COLORS.gray },
  card: { flex: 1, backgroundColor: COLORS.navy, borderRadius: 24, padding: 32, justifyContent: 'center', alignItems: 'center', minHeight: 280 },
  cardText: { fontSize: 18, fontWeight: '700', color: COLORS.white, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  navBtn: { flex: 1, backgroundColor: COLORS.white, paddingVertical: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  navDisabled: { opacity: 0.5 },
  navBtnText: { fontSize: 16, fontWeight: '800', color: COLORS.navy },
  empty: { fontSize: 16, color: COLORS.gray, textAlign: 'center', marginTop: 48 },
  backBtn: { marginTop: 24, alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 24, backgroundColor: COLORS.navy, borderRadius: 12 },
  backBtnText: { color: COLORS.white, fontWeight: '700' },
});
