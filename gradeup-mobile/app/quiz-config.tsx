import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { useTranslations } from '@/src/i18n';

const PAD = 20;
const SECTION = 24;
const RADIUS = 20;
const RADIUS_SM = 14;
const QUESTION_OPTS = [5, 10, 15, 20];

export default function QuizConfig() {
  const { notes, flashcards, language } = useApp();
  const T = useTranslations(language);
  const theme = useTheme();
  const [noteId, setNoteId] = useState<string>('');
  const [totalQuestions, setTotalQuestions] = useState(5);

  const pool = noteId ? flashcards.filter((c) => c.noteId === noteId) : flashcards;
  const maxAvailable = pool.length;
  const effectiveTotal = Math.min(totalQuestions, Math.max(1, maxAvailable));

  const handleStart = () => {
    router.push({
      pathname: '/quiz-mode-selection',
      params: {
        noteId: noteId || '_all',
        total: String(effectiveTotal),
        sourceType: 'flashcards',
        sourceId: noteId || '_all',
        quizType: 'mcq',
        difficulty: 'medium',
      },
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
        <Text style={[styles.title, { color: theme.text }]}>{T('configurePracticeQuiz')}</Text>
      </View>

      {/* Folder Selection */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{T('topic')}</Text>

        {/* All Folders card */}
        <Pressable
          style={[
            styles.folderCard,
            { backgroundColor: theme.card, borderColor: !noteId ? theme.primary : theme.border },
            !noteId && { backgroundColor: theme.primary + '08' },
          ]}
          onPress={() => setNoteId('')}
        >
          <View style={[styles.folderIcon, { backgroundColor: theme.primary + '15' }]}>
            <ThemeIcon name="layers" size={20} color={theme.primary} />
          </View>
          <View style={styles.folderBody}>
            <Text style={[styles.folderName, { color: !noteId ? theme.primary : theme.text }]}>All Notes</Text>
            <Text style={[styles.folderCount, { color: theme.textSecondary }]}>{flashcards.length} {T('cardsUnit')}</Text>
          </View>
          {!noteId && (
            <View style={[styles.checkBadge, { backgroundColor: theme.primary }]}>
              <Feather name="check" size={12} color="#fff" />
            </View>
          )}
        </Pressable>

        {notes.map((n) => {
          const count = flashcards.filter((c) => c.noteId === n.id).length;
          if (count === 0) return null;
          const isSelected = noteId === n.id;
          return (
            <Pressable
              key={n.id}
              style={[
                styles.folderCard,
                { backgroundColor: theme.card, borderColor: isSelected ? theme.primary : theme.border },
                isSelected && { backgroundColor: theme.primary + '08' },
              ]}
              onPress={() => setNoteId(n.id)}
            >
              <View style={[styles.folderIcon, { backgroundColor: theme.primary + '15' }]}>
                <ThemeIcon name="bookOpen" size={20} color={theme.primary} />
              </View>
              <View style={styles.folderBody}>
                <Text style={[styles.folderName, { color: isSelected ? theme.primary : theme.text }]} numberOfLines={1}>{n.title}</Text>
                <Text style={[styles.folderCount, { color: theme.textSecondary }]}>{count} {T('cardsUnit')}</Text>
              </View>
              {count > 0 && (
                <View style={[styles.countBadge, { backgroundColor: theme.primary + '15' }]}>
                  <Text style={[styles.countBadgeText, { color: theme.primary }]}>{count}</Text>
                </View>
              )}
              {isSelected && (
                <View style={[styles.checkBadge, { backgroundColor: theme.primary }]}>
                  <Feather name="check" size={12} color="#fff" />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Question Count */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{T('numberOfQuestions')}</Text>
        <View style={styles.row}>
          {QUESTION_OPTS.map((n) => {
            const disabled = n > maxAvailable;
            const isSelected = totalQuestions === n;
            return (
              <Pressable
                key={n}
                style={[
                  styles.numBtn,
                  { backgroundColor: theme.card, borderColor: isSelected ? theme.primary : theme.border },
                  isSelected && { backgroundColor: theme.primary + '12' },
                  disabled && { opacity: 0.4 },
                ]}
                onPress={() => !disabled && setTotalQuestions(n)}
                disabled={disabled}
              >
                <Text style={[styles.numBtnText, { color: isSelected ? theme.primary : theme.text }, isSelected && { fontWeight: '800' }]}>
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>{maxAvailable} {T('cardsInPool')}</Text>
      </View>

      {/* Start Button */}
      <Pressable
        style={[styles.ctaCard, { backgroundColor: maxAvailable < 1 ? '#94a3b8' : theme.primary }]}
        onPress={handleStart}
        disabled={maxAvailable < 1}
      >
        <ThemeIcon name="target" size={20} color="#fff" />
        <Text style={styles.ctaBtnText}>{T('startPracticeQuiz')}</Text>
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
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: RADIUS_SM,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  folderIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  folderBody: { flex: 1, minWidth: 0 },
  folderName: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  folderCount: { fontSize: 13, fontWeight: '500' },
  countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginRight: 8 },
  countBadgeText: { fontSize: 12, fontWeight: '800' },
  checkBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  numBtn: { flex: 1, paddingVertical: 16, borderRadius: RADIUS_SM, borderWidth: 1.5, alignItems: 'center' },
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
