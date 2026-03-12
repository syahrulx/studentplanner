import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';
import { useAppContext } from '../src/context/AppContext';

const QUIZ_TYPES = ['Mixed', 'MCQ', 'True-False'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

export default function QuizConfigScreen() {
  const router = useRouter();
  const { courses, notes, selectedSubjectId, setSelectedSubjectId } = useAppContext();
  const [subject, setSubject] = useState(selectedSubjectId || courses[0]?.id || '');
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [quizType, setQuizType] = useState('Mixed');
  const [difficulty, setDifficulty] = useState('Easy');

  const subjectNotes = notes.filter((n) => n.subjectId === subject);

  const toggleNote = (id: string) => {
    setSelectedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePrepare = () => {
    router.push('/quiz-mode-selection');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={COLORS.navy} />
        </Pressable>
        <Text style={styles.title}>AI Quiz Builder</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Feather name="zap" size={28} color={COLORS.gold} />
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle}>Custom Synthesis</Text>
            <Text style={styles.heroDesc}>
              Select subjects and notes to generate a personalized AI quiz challenge.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Subject</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRow}
        >
          {courses.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.pill, subject === c.id && styles.pillActive]}
              onPress={() => setSubject(c.id)}
            >
              <Text style={[styles.pillText, subject === c.id && styles.pillTextActive]}>
                {c.id}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.sectionLabel}>Topics (from notes)</Text>
        <View style={styles.topicList}>
          {subjectNotes.map((n) => (
            <Pressable
              key={n.id}
              style={[styles.topicItem, selectedNotes.has(n.id) && styles.topicItemActive]}
              onPress={() => toggleNote(n.id)}
            >
              <Feather
                name={selectedNotes.has(n.id) ? 'check-square' : 'square'}
                size={24}
                color={selectedNotes.has(n.id) ? COLORS.gold : COLORS.textSecondary}
              />
              <Text style={styles.topicTitle} numberOfLines={1}>{n.title}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.gridRow}>
          <View style={styles.selectWrap}>
            <Text style={styles.selectLabel}>Type</Text>
            <View style={styles.selectOptions}>
              {QUIZ_TYPES.map((t) => (
                <Pressable
                  key={t}
                  style={[styles.option, quizType === t && styles.optionActive]}
                  onPress={() => setQuizType(t)}
                >
                  <Text style={[styles.optionText, quizType === t && styles.optionTextActive]}>
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.selectWrap}>
            <Text style={styles.selectLabel}>Difficulty</Text>
            <View style={styles.selectOptions}>
              {DIFFICULTIES.map((d) => (
                <Pressable
                  key={d}
                  style={[styles.option, difficulty === d && styles.optionActive]}
                  onPress={() => setDifficulty(d)}
                >
                  <Text style={[styles.optionText, difficulty === d && styles.optionTextActive]}>
                    {d}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.spacer} />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.prepareBtn} onPress={handlePrepare}>
          <Text style={styles.prepareBtnText}>Prepare AI Challenge</Text>
          <Feather name="arrow-right" size={20} color={COLORS.white} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 8, marginRight: 8 },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.navy,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 120 },
  heroCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.navy,
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    gap: 16,
  },
  heroTextWrap: { flex: 1 },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 6,
  },
  heroDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pillRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  pill: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  pillTextActive: {
    color: COLORS.white,
  },
  topicList: { marginBottom: 24 },
  topicItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  topicItemActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  topicTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 16,
  },
  selectWrap: { flex: 1 },
  selectLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  selectOptions: { gap: 8 },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  optionActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  optionTextActive: {
    color: COLORS.white,
  },
  spacer: { height: 24 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 34,
    backgroundColor: COLORS.bg,
  },
  prepareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.navy,
    borderRadius: 24,
    paddingVertical: 18,
    gap: 10,
  },
  prepareBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.white,
  },
});
