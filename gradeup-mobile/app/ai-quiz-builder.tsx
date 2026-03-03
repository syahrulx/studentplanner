import { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { generateQuizFromNotes, setGeneratedQuizQuestions, getOpenAIKey } from '@/src/lib/studyApi';

const PAD = 20;
const SECTION = 24;
const RADIUS = 16;
const RADIUS_SM = 12;

const QUIZ_TYPES = ['Mixed', 'MCQ', 'True/False', 'Short Answer'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

export default function AIQuizBuilder() {
  const { courses, notes } = useApp();
  const theme = useTheme();
  const [selectedSubject, setSelectedSubject] = useState<string>(courses[0]?.id ?? '');
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [quizType, setQuizType] = useState(QUIZ_TYPES[0]);
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[1]);

  const topicsForSubject = useMemo(() => {
    return notes.filter((n) => n.subjectId === selectedSubject);
  }, [notes, selectedSubject]);

  const toggleTopic = (noteId: string) => {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  const [quizLoading, setQuizLoading] = useState(false);
  const hasTopicsSelected = selectedTopicIds.size > 0;

  const handleBegin = async () => {
    if (!hasTopicsSelected) return;
    const questionCount = Math.max(5, Math.min(15, selectedTopicIds.size * 3));
    const selectedNotes = topicsForSubject.filter((n) => selectedTopicIds.has(n.id));
    const contents = selectedNotes.map((n) => n.content).filter(Boolean);
    if (!contents.length) {
      Alert.alert('No content', 'Selected notes have no content to generate questions from.');
      return;
    }
    const hasKey = !!getOpenAIKey();
    if (!hasKey) {
      Alert.alert(
        'OpenAI API key needed',
        'Add EXPO_PUBLIC_OPENAI_API_KEY to .env or app.config.js, then implement generateQuizFromNotes in src/lib/studyApi.ts to generate quiz from notes.'
      );
      return;
    }
    setQuizLoading(true);
    try {
      const questions = await generateQuizFromNotes(contents, questionCount);
      setGeneratedQuizQuestions(questions);
      router.push({
        pathname: '/quiz-mode-selection',
        params: { fromBuilder: '1', useGenerated: '1', total: String(questions.length || questionCount) },
      } as any);
    } finally {
      setQuizLoading(false);
    }
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
        <Text style={[styles.title, { color: theme.text }]}>AI Quiz Builder</Text>
      </View>

      {/* Custom Synthesis block */}
      <View style={[styles.synthesisBlock, { backgroundColor: theme.primary }]}>
        <View style={styles.synthesisIconWrap}>
          <ThemeIcon name="sparkles" size={22} color="#fff" />
        </View>
        <View style={styles.synthesisBody}>
          <Text style={styles.synthesisTitle}>CUSTOM SYNTHESIS</Text>
          <Text style={styles.synthesisDesc}>
            Pick a subject and select specific notes. The AI will generate a unique assessment based on your chosen topics.
          </Text>
        </View>
      </View>

      {/* 1. SELECT SUBJECT */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>1. SELECT SUBJECT</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectChipsRow}>
          {courses.map((course) => {
            const isSelected = selectedSubject === course.id;
            return (
              <Pressable
                key={course.id}
                style={[
                  styles.subjectChip,
                  isSelected ? styles.subjectChipSelected : styles.subjectChipUnselected,
                  isSelected && { backgroundColor: theme.primary },
                  !isSelected && { backgroundColor: theme.card, borderColor: theme.border },
                ]}
                onPress={() => setSelectedSubject(course.id)}
              >
                <Text style={[styles.subjectChipText, isSelected ? styles.subjectChipTextSelected : { color: theme.text }]}>
                  {course.id}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 2. CHOOSE TOPICS */}
      <View style={styles.section}>
        <View style={styles.chooseTopicsHeader}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>2. CHOOSE TOPICS</Text>
          <Text style={[styles.selectedCount, { color: theme.textSecondary }]}>{selectedTopicIds.size} SELECTED</Text>
        </View>
        {topicsForSubject.length === 0 ? (
          <View style={[styles.topicEmpty, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.topicEmptyText, { color: theme.textSecondary }]}>No notes in this subject yet. Add notes to create topics.</Text>
          </View>
        ) : (
          topicsForSubject.map((note) => {
            const isSelected = selectedTopicIds.has(note.id);
            return (
              <Pressable
                key={note.id}
                style={[styles.topicRow, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => toggleTopic(note.id)}
              >
                <View style={styles.topicContent}>
                  <Text style={[styles.topicTag, { color: theme.textSecondary }]}>{note.tag.toUpperCase()}</Text>
                  <Text style={[styles.topicTitle, { color: theme.text }]}>{note.title}</Text>
                </View>
                <View style={[styles.radioOuter, { borderColor: theme.border }, isSelected && { borderColor: theme.primary }]}>
                  {isSelected && <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />}
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      {/* TYPE & DIFFICULTY */}
      <View style={styles.typeDifficultyRow}>
        <View style={styles.typeDifficultyCol}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>TYPE</Text>
          <View style={[styles.typeDifficultyValue, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.typeDifficultyText, { color: theme.text }]}>{quizType}</Text>
          </View>
        </View>
        <View style={styles.typeDifficultyCol}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>DIFFICULTY</Text>
          <View style={[styles.typeDifficultyValue, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.typeDifficultyText, { color: theme.text }]}>{difficulty}</Text>
          </View>
        </View>
      </View>

      {/* CTA */}
      <Pressable
        style={[
          styles.ctaBtn,
          hasTopicsSelected ? [styles.ctaBtnActive, { backgroundColor: theme.primary }] : styles.ctaBtnDisabled,
          (!hasTopicsSelected || quizLoading) && styles.ctaBtnDisabled,
        ]}
        onPress={handleBegin}
        disabled={!hasTopicsSelected || quizLoading}
      >
        {quizLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.ctaBtnText}>
            {hasTopicsSelected ? 'GENERATE QUIZ' : 'SELECT TOPICS TO BEGIN'}
          </Text>
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
  synthesisBlock: {
    flexDirection: 'row',
    borderRadius: RADIUS,
    padding: 20,
    marginBottom: SECTION,
    alignItems: 'flex-start',
  },
  synthesisIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  synthesisBody: { flex: 1 },
  synthesisTitle: { fontSize: 12, fontWeight: '800', color: '#fff', letterSpacing: 1.2, marginBottom: 8 },
  synthesisDesc: { fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 20 },
  section: { marginBottom: SECTION },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12 },
  subjectChipsRow: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  subjectChip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: RADIUS_SM,
    borderWidth: 1,
  },
  subjectChipSelected: {},
  subjectChipUnselected: {},
  subjectChipText: { fontSize: 14, fontWeight: '800' },
  subjectChipTextSelected: { color: '#fff' },
  chooseTopicsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  selectedCount: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  topicEmpty: { padding: 20, borderRadius: RADIUS_SM, borderWidth: 1 },
  topicEmptyText: { fontSize: 13 },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: RADIUS_SM,
    borderWidth: 1,
    marginBottom: 10,
  },
  topicContent: { flex: 1, minWidth: 0 },
  topicTag: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  topicTitle: { fontSize: 15, fontWeight: '800' },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  radioInner: { width: 12, height: 12, borderRadius: 6 },
  typeDifficultyRow: { flexDirection: 'row', gap: 14, marginBottom: SECTION },
  typeDifficultyCol: { flex: 1 },
  typeDifficultyValue: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: RADIUS_SM,
    borderWidth: 1,
    marginTop: 8,
  },
  typeDifficultyText: { fontSize: 15, fontWeight: '800' },
  ctaBtn: {
    paddingVertical: 18,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBtnActive: {},
  ctaBtnDisabled: { backgroundColor: '#94a3b8' },
  ctaBtnText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.8 },
});
