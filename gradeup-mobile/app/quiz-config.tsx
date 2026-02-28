import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';

const PAD = 20;
const SECTION = 24;
const RADIUS = 20;
const RADIUS_SM = 14;
const QUESTION_OPTS = [5, 10, 15];

export default function QuizConfig() {
  const { flashcardFolders, flashcards } = useApp();
  const theme = useTheme();
  const [folderId, setFolderId] = useState<string>(''); // '' = all
  const [totalQuestions, setTotalQuestions] = useState(5);

  const pool = folderId ? flashcards.filter((c) => c.folderId === folderId) : flashcards;
  const maxAvailable = pool.length;
  const effectiveTotal = Math.min(totalQuestions, Math.max(1, maxAvailable));

  const handleStart = () => {
    router.push({
      pathname: '/quiz-mode-selection',
      params: { folderId: folderId || '_all', total: String(effectiveTotal) },
    } as any);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Configure practice quiz</Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>TOPIC</Text>
        <Pressable
          style={({ pressed }) => [
            styles.subjectCard,
            { backgroundColor: theme.card, borderColor: theme.border },
            !folderId && { borderColor: theme.primary, backgroundColor: theme.primary + '12' },
            pressed && styles.pressed,
          ]}
          onPress={() => setFolderId('')}
        >
          <View style={[styles.subjectIconWrap, { backgroundColor: theme.primary + '18' }]}>
            <ThemeIcon name="layers" size={20} color={theme.primary} />
          </View>
          <View style={styles.subjectBody}>
            <Text style={[styles.subjectCode, { color: theme.text }, !folderId && { color: theme.primary }]}>All folders</Text>
            <Text style={[styles.subjectName, { color: theme.textSecondary }]}>{flashcards.length} cards</Text>
          </View>
          {!folderId && <ThemeIcon name="checkCircle" size={18} color={theme.primary} />}
        </Pressable>
        {flashcardFolders.map((f) => {
          const count = flashcards.filter((c) => c.folderId === f.id).length;
          const isSelected = folderId === f.id;
          return (
            <Pressable
              key={f.id}
              style={({ pressed }) => [
                styles.subjectCard,
                { backgroundColor: theme.card, borderColor: theme.border },
                isSelected && { borderColor: theme.primary, backgroundColor: theme.primary + '12' },
                pressed && styles.pressed,
              ]}
              onPress={() => setFolderId(f.id)}
            >
              <View style={[styles.subjectIconWrap, { backgroundColor: theme.primary + '18' }]}>
                <ThemeIcon name="bookOpen" size={20} color={theme.primary} />
              </View>
              <View style={styles.subjectBody}>
                <Text style={[styles.subjectCode, { color: theme.text }, isSelected && { color: theme.primary }]} numberOfLines={1}>{f.name}</Text>
                <Text style={[styles.subjectName, { color: theme.textSecondary }]}>{count} cards</Text>
              </View>
              {isSelected && <ThemeIcon name="checkCircle" size={18} color={theme.primary} />}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>NUMBER OF QUESTIONS</Text>
        <View style={styles.row}>
          {QUESTION_OPTS.map((n) => {
            const disabled = n > maxAvailable;
            const isSelected = totalQuestions === n;
            return (
              <Pressable
                key={n}
                style={({ pressed }) => [
                  styles.numBtn,
                  { backgroundColor: theme.card, borderColor: theme.border },
                  isSelected && { borderColor: theme.primary, backgroundColor: theme.primary + '15' },
                  disabled && styles.numBtnDisabled,
                  pressed && !disabled && styles.pressed,
                ]}
                onPress={() => !disabled && setTotalQuestions(n)}
                disabled={disabled}
              >
                <Text style={[styles.numBtnText, { color: theme.text }, isSelected && { color: theme.primary, fontWeight: '800' }, disabled && { color: theme.textSecondary, opacity: 0.6 }]}>
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>{maxAvailable} cards in pool</Text>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.ctaCard,
          { backgroundColor: theme.primary },
          (maxAvailable < 1 || pressed) && styles.pressed,
        ]}
        onPress={handleStart}
        disabled={maxAvailable < 1}
      >
        <ThemeIcon name="target" size={20} color="#fff" />
        <Text style={styles.ctaBtnText}>Start practice quiz</Text>
      </Pressable>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: PAD, paddingTop: 56, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: SECTION },
  backBtn: { width: 44, height: 44, borderRadius: RADIUS_SM, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1 },
  title: { fontSize: 22, fontWeight: '800', flex: 1 },
  section: { marginBottom: SECTION },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 14 },
  subjectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: RADIUS_SM,
    borderWidth: 1,
    marginBottom: 12,
  },
  subjectIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  subjectBody: { flex: 1, minWidth: 0 },
  subjectCode: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  subjectName: { fontSize: 13, fontWeight: '500' },
  pressed: { opacity: 0.96 },
  row: { flexDirection: 'row', gap: 12 },
  numBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: RADIUS_SM,
    borderWidth: 1,
    alignItems: 'center',
  },
  numBtnDisabled: { opacity: 0.6 },
  numBtnText: { fontSize: 18, fontWeight: '700' },
  hint: { fontSize: 12, marginTop: 10 },
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: RADIUS,
  },
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
