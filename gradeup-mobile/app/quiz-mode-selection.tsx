import { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { useTranslations } from '@/src/i18n';
import { useCommunity } from '@/src/context/CommunityContext';
import { useQuiz } from '@/src/context/QuizContext';
import { getGeneratedQuizQuestions, clearGeneratedQuizQuestions } from '@/src/lib/studyApi';
import * as quizApi from '@/src/lib/quizApi';
import type { SourceType, MatchType } from '@/src/lib/quizApi';

const PAD = 20;
const SECTION = 24;
const RADIUS = 20;
const RADIUS_SM = 14;

export default function QuizModeSelection() {
  const { language, flashcards } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const { filteredFriends, circles } = useCommunity();
  const { createQuiz, joinQuiz } = useQuiz();

  const {
    noteId, total, fromBuilder, useGenerated,
    quizType: paramQuizType, difficulty: paramDifficulty,
    sourceType: paramSourceType, sourceId: paramSourceId,
  } = useLocalSearchParams<{
    noteId?: string; total?: string; fromBuilder?: string; useGenerated?: string;
    quizType?: string; difficulty?: string; sourceType?: string; sourceId?: string;
  }>();

  const totalNum = parseInt(total || '5', 10);
  const sourceType: SourceType = (paramSourceType as SourceType) || 'flashcards';
  const quizType = paramQuizType || 'mcq';
  const difficulty = paramDifficulty || 'medium';
  const sourceId = paramSourceId || noteId || '_all';

  const [multiOpen, setMultiOpen] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
  const [selectedCircle, setSelectedCircle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const buildQuestions = useCallback(async () => {
    if (useGenerated === '1') {
      return await getGeneratedQuizQuestions();
    }
    // Build from flashcards
    const pool = noteId && noteId !== '_all'
      ? flashcards.filter((c) => c.noteId === noteId)
      : flashcards;
    // Fix 6: Partial Fisher-Yates — O(k) where k=totalNum, not O(n log n)
    // Also avoids the known JS sort-comparator random bias
    const pool2 = [...pool];
    const count = Math.min(totalNum, pool2.length);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (pool2.length - i));
      [pool2[i], pool2[j]] = [pool2[j], pool2[i]];
    }
    const selected = pool2.slice(0, count);
    return selected.map((card) => {
      const front = card?.front ?? (card as any)?.question ?? 'No question';
      const back = card?.back ?? (card as any)?.answer ?? 'Answer';
      const wrongs = pool.filter((c) => c.id !== card.id).map((c) => c?.back ?? (c as any)?.answer ?? 'Option');
      const opts = [back];
      for (let i = 0; opts.length < 4 && i < wrongs.length; i++) {
        if (!opts.includes(wrongs[i])) opts.push(wrongs[i]);
      }
      while (opts.length < 4) opts.push(`Option ${opts.length + 1}`);
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
      }
      return { question: front, options: opts, correctIndex: opts.indexOf(back) };
    });
  }, [useGenerated, noteId, flashcards, totalNum]);

  const handleSolo = async () => {
    setLoading(true);
    try {
      const questions = await buildQuestions();
      const session = await createQuiz({
        mode: 'solo',
        matchType: 'friend',
        sourceType,
        sourceId,
        quizType,
        difficulty,
        questionCount: questions.length || totalNum,
        questions,
      });
      // Clear cached questions — they've been committed to the session
      if (useGenerated === '1') await clearGeneratedQuizQuestions();
      router.replace({ pathname: '/quiz-gameplay', params: { sessionId: session.id } } as any);
    } catch (e: any) {
      Alert.alert('Could not start quiz', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMultiplayer = async (matchType: MatchType) => {
    setLoading(true);
    try {
      // For random: try to find existing session first
      if (matchType === 'random') {
        const existing = await quizApi.findRandomSession(sourceType, quizType);
        if (existing) {
          const session = await joinQuiz(existing.id);
          // Clear cached questions even when joining (not creating) a session
          if (useGenerated === '1') await clearGeneratedQuizQuestions();
          router.replace({ pathname: '/match-lobby', params: { sessionId: session.id } } as any);
          return;
        }
      }

      const questions = await buildQuestions();
      const session = await createQuiz({
        mode: 'multiplayer',
        matchType,
        sourceType,
        sourceId,
        quizType,
        difficulty,
        questionCount: questions.length || totalNum,
        questions,
        circleId: matchType === 'circle' ? (selectedCircle || undefined) : undefined,
      });
      // Clear cached questions — they've been committed to the session
      if (useGenerated === '1') await clearGeneratedQuizQuestions();
      router.replace({ pathname: '/match-lobby', params: { sessionId: session.id } } as any);
    } catch (e: any) {
      Alert.alert('Could not create match', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
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
        <Text style={[styles.title, { color: theme.text }]}>{T('chooseMode')}</Text>
      </View>

      {total && (
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{total} {T('questionsReady')}</Text>
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Setting up...</Text>
        </View>
      )}

      <View style={styles.cards}>
        {/* Solo Practice */}
        <Pressable
          style={[styles.modeCard, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1.5 }]}
          onPress={handleSolo}
          disabled={loading}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#f1f5f9' }]}>
            <Feather name="user" size={24} color="#64748b" />
          </View>
          <View style={styles.modeBody}>
            <Text style={[styles.modeTitle, { color: theme.text }]}>{T('soloPractice')}</Text>
            <Text style={[styles.modeDesc, { color: theme.textSecondary }]}>{T('soloPracticeDesc')}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>

        {/* Multiplayer */}
        <Pressable
          style={[styles.modeCard, { backgroundColor: '#003366' }]}
          onPress={() => setMultiOpen(!multiOpen)}
          disabled={loading}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#f59e0b' }]}>
            <Feather name="zap" size={22} color="#fff" />
          </View>
          <View style={styles.modeBody}>
            <Text style={[styles.modeTitle, { color: '#fff' }]}>{T('multiplayerVs')}</Text>
            <Text style={[styles.modeDesc, { color: 'rgba(255,255,255,0.7)' }]}>{T('multiplayerDesc')}</Text>
          </View>
          <Feather name={multiOpen ? 'chevron-up' : 'chevron-down'} size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>

        {/* Multiplayer sub-options */}
        {multiOpen && (
          <View style={styles.subOptions}>
            {/* Challenge Friend */}
            <View style={[styles.subCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Pressable
                style={styles.subCardHeader}
                onPress={() => handleMultiplayer('friend')}
                disabled={loading}
              >
                <Feather name="user-plus" size={18} color={theme.primary} />
                <Text style={[styles.subTitle, { color: theme.text }]}>Challenge Friend</Text>
                <Feather name="arrow-right" size={16} color={theme.textSecondary} />
              </Pressable>
              {filteredFriends.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendRow}>
                  {filteredFriends.slice(0, 8).map((f) => {
                    const active = selectedFriend === f.id;
                    const initials = (f.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                    return (
                      <Pressable key={f.id} onPress={() => setSelectedFriend(active ? null : f.id)} style={styles.friendChip}>
                        <View style={[styles.friendAvatar, active && { borderColor: theme.primary, borderWidth: 2 }]}>
                          <Text style={styles.friendInitial}>{initials}</Text>
                        </View>
                        <Text style={[styles.friendName, { color: theme.textSecondary }]} numberOfLines={1}>{f.name?.split(' ')[0]}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* Circle Match */}
            <Pressable
              style={[styles.subCard, styles.subCardRow, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => handleMultiplayer('circle')}
              disabled={loading}
            >
              <Feather name="users" size={18} color="#8b5cf6" />
              <Text style={[styles.subTitle, { color: theme.text, flex: 1 }]}>Circle Match</Text>
              {circles.length > 0 && (
                <Text style={[styles.subHint, { color: theme.textSecondary }]}>{circles.length} circles</Text>
              )}
              <Feather name="arrow-right" size={16} color={theme.textSecondary} />
            </Pressable>

            {/* Random Match */}
            <Pressable
              style={[styles.subCard, styles.subCardRow, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => handleMultiplayer('random')}
              disabled={loading}
            >
              <Feather name="globe" size={18} color="#f59e0b" />
              <Text style={[styles.subTitle, { color: theme.text, flex: 1 }]}>Random Match</Text>
              <Text style={[styles.subHint, { color: theme.textSecondary }]}>instant queue</Text>
              <Feather name="arrow-right" size={16} color={theme.textSecondary} />
            </Pressable>
          </View>
        )}
      </View>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: PAD, paddingTop: 56, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: RADIUS_SM, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1 },
  title: { fontSize: 22, fontWeight: '800', flex: 1 },
  subtitle: { fontSize: 13, fontWeight: '600', marginBottom: SECTION },
  loadingOverlay: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  loadingText: { fontSize: 13, fontWeight: '600' },
  cards: { gap: 14 },
  modeCard: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: RADIUS, gap: 14 },
  iconWrap: { width: 52, height: 52, borderRadius: RADIUS_SM, alignItems: 'center', justifyContent: 'center' },
  modeBody: { flex: 1, minWidth: 0 },
  modeTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  modeDesc: { fontSize: 13, lineHeight: 18 },
  subOptions: { gap: 10, marginLeft: 8 },
  subCard: { borderRadius: RADIUS_SM, borderWidth: 1, overflow: 'hidden' },
  subCardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  subCardRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  subTitle: { fontSize: 15, fontWeight: '700' },
  subHint: { fontSize: 12, fontWeight: '500' },
  friendRow: { paddingHorizontal: 16, paddingBottom: 14, gap: 14 },
  friendChip: { alignItems: 'center', width: 56 },
  friendAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  friendInitial: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  friendName: { fontSize: 11, fontWeight: '500', textAlign: 'center' },
});
