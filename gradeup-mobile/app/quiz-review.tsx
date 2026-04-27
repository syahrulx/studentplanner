import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import type { ThemePalette } from '@/constants/Themes';
import { getSavedQuizzes, setGeneratedQuizQuestions, type SavedQuizItem } from '@/src/lib/studyApi';

export default function QuizReviewScreen() {
  const theme = useTheme();
  const s = useMemo(() => styles(theme), [theme]);
  const { quizId } = useLocalSearchParams<{ quizId?: string }>();
  const [quiz, setQuiz] = useState<SavedQuizItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSavedQuizzes().then((all) => {
      if (cancelled) return;
      setQuiz(all.find((q) => q.id === quizId) || null);
    });
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  if (!quiz) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Feather name="chevron-left" size={24} color={theme.primary} />
            <Text style={s.backText}>Revision Quiz</Text>
          </Pressable>
        </View>
        <View style={s.emptyWrap}>
          <Text style={s.emptyTitle}>Quiz not found</Text>
          <Text style={s.emptySub}>This saved quiz may have been deleted.</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="chevron-left" size={24} color={theme.primary} />
          <Text style={s.backText}>Revision Quiz</Text>
        </Pressable>
        <Text style={s.title}>{quiz.title}</Text>
        <Text style={s.subtitle}>{quiz.questionCount} questions • answer key</Text>
      </View>

      {quiz.questions.map((q, index) => {
        const isShort = !q.options || q.options.length === 0;
        return (
          <View key={`${quiz.id}-${index}`} style={s.card}>
            <Text style={s.qLabel}>Q{index + 1}</Text>
            <Text style={s.qText}>{q.question}</Text>

            {isShort ? (
              <View style={s.answerBox}>
                <Text style={s.answerLabel}>Answer</Text>
                <Text style={s.answerText}>{q.expectedAnswer || '-'}</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {q.options.map((opt, i) => (
                  <View
                    key={`${quiz.id}-${index}-${i}`}
                    style={[
                      s.option,
                      i === q.correctIndex && s.optionCorrect,
                    ]}
                  >
                    <Text style={s.optionText}>{opt}</Text>
                    {i === q.correctIndex ? <Feather name="check-circle" size={16} color="#10b981" /> : null}
                  </View>
                ))}
              </View>
            )}

            <View style={s.proofBox}>
              <View style={s.proofHeader}>
                <Feather name="file-text" size={13} color={theme.primary} />
                <Text style={s.proofTitle}>Reference / Proof</Text>
              </View>
              <Text style={s.proofText}>
                {q.proof?.trim() || 'Reference snippet is not available for this older saved quiz.'}
              </Text>
            </View>
          </View>
        );
      })}

      <Pressable
        style={s.practiceBtn}
        onPress={async () => {
          await setGeneratedQuizQuestions(quiz.questions);
          router.push({
            pathname: '/quiz-mode-selection',
            params: {
              useGenerated: '1',
              total: String(quiz.questionCount || quiz.questions.length || 5),
              quizType: quiz.quizType || 'mixed',
              difficulty: quiz.difficulty || 'medium',
              sourceType: quiz.sourceType || 'notes',
              sourceId: quiz.sourceId || '_saved',
            },
          } as any);
        }}
      >
        <Feather name="play-circle" size={18} color="#fff" />
        <Text style={s.practiceBtnText}>Practice This Quiz</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = (theme: ThemePalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background, paddingTop: 56 },
    content: { paddingHorizontal: 18, paddingBottom: 30 },
    header: { marginBottom: 10 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
    backText: { color: theme.primary, fontSize: 16, fontWeight: '500' },
    title: { color: theme.text, fontSize: 22, fontWeight: '800', marginLeft: 4 },
    subtitle: { color: theme.textSecondary, fontSize: 12, marginLeft: 4, marginTop: 2 },
    card: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      padding: 14,
      marginTop: 10,
    },
    qLabel: { color: theme.primary, fontSize: 12, fontWeight: '800', marginBottom: 6 },
    qText: { color: theme.text, fontSize: 15, fontWeight: '700', lineHeight: 21, marginBottom: 10 },
    option: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      paddingHorizontal: 10,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    optionCorrect: {
      borderColor: '#10b981',
      backgroundColor: 'rgba(16,185,129,0.08)',
    },
    optionText: { color: theme.text, fontSize: 14, fontWeight: '500', flex: 1 },
    answerBox: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#10b981',
      backgroundColor: 'rgba(16,185,129,0.08)',
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    answerLabel: { color: '#10b981', fontSize: 11, fontWeight: '800', marginBottom: 4 },
    answerText: { color: theme.text, fontSize: 14, fontWeight: '600' },
    proofBox: {
      marginTop: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    proofHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    proofTitle: { color: theme.primary, fontSize: 11, fontWeight: '800' },
    proofText: { color: theme.textSecondary, fontSize: 12, lineHeight: 17, fontWeight: '500' },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    emptyTitle: { color: theme.text, fontSize: 18, fontWeight: '700' },
    emptySub: { color: theme.textSecondary, fontSize: 13, marginTop: 4, textAlign: 'center' },
    practiceBtn: {
      marginTop: 16,
      marginBottom: 8,
      borderRadius: 12,
      backgroundColor: theme.primary,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    practiceBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  });
