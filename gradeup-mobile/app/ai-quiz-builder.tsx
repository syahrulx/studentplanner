import { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import {
  generateQuizFromNotes,
  setGeneratedQuizQuestions,
  getOpenAIKey,
  type QuizType,
  type QuizDifficulty,
} from '@/src/lib/studyApi';

const PAD = 20;
const SECTION = 24;
const RADIUS = 20;
const RADIUS_SM = 14;

const QUIZ_TYPES: { key: QuizType; label: string; icon: string }[] = [
  { key: 'mixed', label: 'Mixed', icon: 'shuffle' },
  { key: 'mcq', label: 'MCQ', icon: 'list' },
  { key: 'true_false', label: 'True / False', icon: 'check-circle' },
  { key: 'short_answer', label: 'Short Answer', icon: 'edit-3' },
];

const DIFFICULTIES: { key: QuizDifficulty; label: string; color: string }[] = [
  { key: 'easy', label: 'Easy', color: '#10b981' },
  { key: 'medium', label: 'Medium', color: '#f59e0b' },
  { key: 'hard', label: 'Hard', color: '#ef4444' },
];

const Q_COUNTS = [5, 10, 15, 20];

export default function AIQuizBuilder() {
  const { courses, notes } = useApp();
  const theme = useTheme();

  const [selectedSubject, setSelectedSubject] = useState<string>(courses[0]?.id ?? '');
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [quizType, setQuizType] = useState<QuizType>('mixed');
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('medium');
  const [questionCount, setQuestionCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  const topicsForSubject = useMemo(
    () => notes.filter((n) => n.subjectId === selectedSubject),
    [notes, selectedSubject],
  );

  const toggleTopic = (noteId: string) => {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedTopicIds.size === topicsForSubject.length) {
      setSelectedTopicIds(new Set());
    } else {
      setSelectedTopicIds(new Set(topicsForSubject.map((n) => n.id)));
    }
  };

  const hasTopics = selectedTopicIds.size > 0;

  const handleGenerate = async () => {
    if (!hasTopics) return;
    if (!getOpenAIKey()) {
      Alert.alert('API Key Missing', 'Add EXPO_PUBLIC_OPENAI_API_KEY to your .env file.');
      return;
    }

    const selectedNotes = topicsForSubject.filter((n) => selectedTopicIds.has(n.id));
    const contents = selectedNotes.map((n) => n.content).filter(Boolean);
    if (!contents.length) {
      Alert.alert('No Content', 'Selected notes have no text content to generate questions from.');
      return;
    }

    setLoading(true);
    setLoadingText('Analyzing your notes...');

    try {
      setTimeout(() => setLoadingText('Generating questions...'), 2000);
      setTimeout(() => setLoadingText('Almost ready...'), 5000);

      const questions = await generateQuizFromNotes(contents, questionCount, quizType, difficulty);

      if (!questions.length) {
        Alert.alert('Generation Failed', 'Could not generate questions. Try different notes or settings.');
        return;
      }

      setGeneratedQuizQuestions(questions);
      router.push({
        pathname: '/quiz-mode-selection',
        params: {
          fromBuilder: '1',
          useGenerated: '1',
          total: String(questions.length),
          quizType,
          difficulty,
          sourceType: 'notes',
          sourceId: selectedSubject,
        },
      } as any);
    } catch {
      Alert.alert('Error', 'Something went wrong generating the quiz.');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>AI Quiz Builder</Text>
      </View>

      {/* Hero banner */}
      <View style={[styles.hero, { backgroundColor: theme.primary }]}>
        <View style={styles.heroIcon}>
          <ThemeIcon name="sparkles" size={22} color="#fff" />
        </View>
        <View style={styles.heroBody}>
          <Text style={styles.heroTitle}>CUSTOM SYNTHESIS</Text>
          <Text style={styles.heroDesc}>
            Select notes and let AI generate a unique quiz tailored to your study material.
          </Text>
        </View>
      </View>

      {/* 1. Subject */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>SELECT SUBJECT</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {courses.map((course) => {
            const active = selectedSubject === course.id;
            return (
              <Pressable
                key={course.id}
                style={[
                  styles.chip,
                  active
                    ? { backgroundColor: theme.primary, borderColor: theme.primary }
                    : { backgroundColor: theme.card, borderColor: theme.border },
                ]}
                onPress={() => { setSelectedSubject(course.id); setSelectedTopicIds(new Set()); }}
              >
                <Text style={[styles.chipText, active ? { color: '#fff' } : { color: theme.text }]}>{course.id}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 2. Topics */}
      <View style={styles.section}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>CHOOSE TOPICS</Text>
          <Pressable onPress={selectAll}>
            <Text style={[styles.selectAll, { color: theme.primary }]}>
              {selectedTopicIds.size === topicsForSubject.length && topicsForSubject.length > 0 ? 'Deselect All' : 'Select All'}
            </Text>
          </Pressable>
        </View>
        {topicsForSubject.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Feather name="file-text" size={24} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No notes in this subject yet.</Text>
          </View>
        ) : (
          topicsForSubject.map((note) => {
            const selected = selectedTopicIds.has(note.id);
            return (
              <Pressable
                key={note.id}
                style={[
                  styles.topicRow,
                  { backgroundColor: theme.card, borderColor: selected ? theme.primary : theme.border },
                  selected && { backgroundColor: theme.primary + '08' },
                ]}
                onPress={() => toggleTopic(note.id)}
              >
                <View style={styles.topicBody}>
                  <Text style={[styles.topicTag, { color: theme.textSecondary }]}>{note.tag.toUpperCase()}</Text>
                  <Text style={[styles.topicTitle, { color: theme.text }]} numberOfLines={1}>{note.title}</Text>
                </View>
                <View style={[styles.checkbox, { borderColor: selected ? theme.primary : theme.border }]}>
                  {selected && <Feather name="check" size={14} color={theme.primary} />}
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      {/* 3. Quiz Type */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>QUIZ TYPE</Text>
        <View style={styles.chipRow}>
          {QUIZ_TYPES.map((qt) => {
            const active = quizType === qt.key;
            return (
              <Pressable
                key={qt.key}
                style={[
                  styles.typeChip,
                  active
                    ? { backgroundColor: theme.primary, borderColor: theme.primary }
                    : { backgroundColor: theme.card, borderColor: theme.border },
                ]}
                onPress={() => setQuizType(qt.key)}
              >
                <Feather name={qt.icon as any} size={14} color={active ? '#fff' : theme.textSecondary} />
                <Text style={[styles.typeChipText, active ? { color: '#fff' } : { color: theme.text }]}>{qt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 4. Difficulty */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>DIFFICULTY</Text>
        <View style={styles.chipRow}>
          {DIFFICULTIES.map((d) => {
            const active = difficulty === d.key;
            return (
              <Pressable
                key={d.key}
                style={[
                  styles.diffChip,
                  active
                    ? { backgroundColor: d.color, borderColor: d.color }
                    : { backgroundColor: theme.card, borderColor: theme.border },
                ]}
                onPress={() => setDifficulty(d.key)}
              >
                <Text style={[styles.diffChipText, active ? { color: '#fff' } : { color: theme.text }]}>{d.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 5. Question Count */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>QUESTIONS</Text>
        <View style={styles.chipRow}>
          {Q_COUNTS.map((n) => {
            const active = questionCount === n;
            return (
              <Pressable
                key={n}
                style={[
                  styles.countChip,
                  active
                    ? { backgroundColor: theme.primary, borderColor: theme.primary }
                    : { backgroundColor: theme.card, borderColor: theme.border },
                ]}
                onPress={() => setQuestionCount(n)}
              >
                <Text style={[styles.countText, active ? { color: '#fff', fontWeight: '800' } : { color: theme.text }]}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* CTA */}
      <Pressable
        style={[styles.cta, hasTopics && !loading ? { backgroundColor: theme.primary } : { backgroundColor: '#94a3b8' }]}
        onPress={handleGenerate}
        disabled={!hasTopics || loading}
      >
        {loading ? (
          <View style={styles.ctaLoading}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.ctaText}>{loadingText}</Text>
          </View>
        ) : (
          <>
            <ThemeIcon name="sparkles" size={18} color="#fff" />
            <Text style={styles.ctaText}>{hasTopics ? 'GENERATE QUIZ' : 'SELECT TOPICS TO BEGIN'}</Text>
          </>
        )}
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
  hero: { flexDirection: 'row', borderRadius: RADIUS, padding: 20, marginBottom: SECTION, alignItems: 'flex-start' },
  heroIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  heroBody: { flex: 1 },
  heroTitle: { fontSize: 12, fontWeight: '800', color: '#fff', letterSpacing: 1.2, marginBottom: 8 },
  heroDesc: { fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 20 },
  section: { marginBottom: SECTION },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  selectAll: { fontSize: 12, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: RADIUS_SM, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '800' },
  emptyCard: { padding: 24, borderRadius: RADIUS_SM, borderWidth: 1, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 13 },
  topicRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: RADIUS_SM, borderWidth: 1, marginBottom: 10 },
  topicBody: { flex: 1, minWidth: 0 },
  topicTag: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  topicTitle: { fontSize: 15, fontWeight: '800' },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS_SM, borderWidth: 1 },
  typeChipText: { fontSize: 13, fontWeight: '700' },
  diffChip: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: RADIUS_SM, borderWidth: 1 },
  diffChipText: { fontSize: 14, fontWeight: '800' },
  countChip: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: RADIUS_SM, borderWidth: 1 },
  countText: { fontSize: 18, fontWeight: '700' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, borderRadius: RADIUS },
  ctaLoading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.8 },
});
