import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import type { ThemePalette } from '@/constants/Themes';
import {
  getSavedQuizzes,
  deleteSavedQuiz,
  type SavedQuizItem,
} from '@/src/lib/studyApi';

export default function QuizLibraryScreen() {
  const theme = useTheme();
  const s = useMemo(() => styles(theme), [theme]);
  const [items, setItems] = useState<SavedQuizItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getSavedQuizzes();
    setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePlay = async (item: SavedQuizItem) => {
    router.push({
      pathname: '/quiz-review',
      params: {
        quizId: item.id,
      },
    } as any);
  };

  const handleDelete = (item: SavedQuizItem) => {
    Alert.alert('Delete quiz', `Remove "${item.title}" from revision quizzes?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSavedQuiz(item.id);
          await load();
        },
      },
    ]);
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="chevron-left" size={24} color={theme.primary} />
          <Text style={s.backText}>Study</Text>
        </Pressable>
        <Text style={s.title}>Revision Quiz</Text>
      </View>

      <Text style={s.subtitle}>Saved quizzes to retake without using new AI tokens.</Text>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={items.length === 0 ? s.emptyList : s.list}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Feather name="bookmark" size={32} color={theme.textSecondary} />
            <Text style={s.emptyTitle}>{loading ? 'Loading...' : 'No saved quizzes yet'}</Text>
            <Text style={s.emptySub}>After finishing a quiz, tap "Save for Revision" on results page.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={s.cardSub}>
                {item.questionCount} questions • {item.quizType || 'mixed'} • {item.difficulty || 'medium'}
              </Text>
            </View>
            <Pressable style={s.iconBtn} onPress={() => handlePlay(item)}>
              <Feather name="play" size={16} color={theme.primary} />
            </Pressable>
            <Pressable style={s.iconBtn} onPress={() => handleDelete(item)}>
              <Feather name="trash-2" size={16} color="#ef4444" />
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = (theme: ThemePalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background, paddingTop: 56 },
    header: { paddingHorizontal: 16, marginBottom: 8 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
    backText: { color: theme.primary, fontSize: 16, fontWeight: '500' },
    title: { color: theme.text, fontSize: 28, fontWeight: '800', marginLeft: 4 },
    subtitle: { color: theme.textSecondary, fontSize: 13, paddingHorizontal: 20, marginBottom: 14 },
    list: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
    card: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      paddingVertical: 12,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
    cardSub: { color: theme.textSecondary, fontSize: 12, marginTop: 2 },
    iconBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
    emptyWrap: { alignItems: 'center', gap: 8 },
    emptyTitle: { color: theme.text, fontSize: 17, fontWeight: '700' },
    emptySub: { color: theme.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  });
