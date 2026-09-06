import { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import { useCommunity } from '@/src/context/CommunityContext';
import { useQuiz } from '@/src/context/QuizContext';
import {
  getGeneratedQuizStash,
  clearGeneratedQuizQuestions,
  type GeneratedQuizQuestion,
} from '@/src/lib/studyApi';
import * as quizApi from '@/src/lib/quizApi';
import type { SourceType, MatchType } from '@/src/lib/quizApi';
import type { Flashcard } from '@/src/types';

const PAD = 20;
const SECTION = 24;
const RADIUS = 20;
const RADIUS_SM = 14;
const DEFAULT_TIMER_SECONDS = 30;

/** `timer` param: 'off' → 0, any non-negative number → that many seconds, else default. */
function parseTimerParam(raw: string | undefined): number {
  if (raw === 'off') return 0;
  const n = Number(raw);
  if (raw !== undefined && Number.isFinite(n) && n >= 0) return n;
  return DEFAULT_TIMER_SECONDS;
}

function cardFront(card: Flashcard): string {
  return (card?.front ?? card?.question ?? '').trim() || 'No question';
}
function cardBack(card: Flashcard): string {
  return (card?.back ?? card?.answer ?? '').trim() || 'Answer';
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Build a question from one flashcard. With enough distinct distractors this
 * is a 4-option MCQ; with fewer we either shrink to the available options
 * (min 2) or fall back to a True/False statement. Never pads with literal
 * "Option N" strings.
 */
function questionFromFlashcard(card: Flashcard, pool: Flashcard[]): GeneratedQuizQuestion {
  const front = cardFront(card);
  const back = cardBack(card);
  const backKey = back.toLowerCase();
  const distractors: string[] = [];
  const seen = new Set<string>([backKey]);
  for (const other of shuffleInPlace(pool.filter((c) => c.id !== card.id))) {
    const candidate = cardBack(other);
    const key = candidate.toLowerCase();
    if (!candidate || seen.has(key)) continue;
    seen.add(key);
    distractors.push(candidate);
    if (distractors.length >= 3) break;
  }

  const explanation = `The answer to "${front}" is "${back}".`;
  const base = { proof: back, explanation, sourceNoteId: card.noteId ?? null };

  // Not enough material for a fair MCQ: 50% chance of a True/False statement.
  if (distractors.length < 3 && (distractors.length === 0 || Math.random() < 0.5)) {
    const useFalse = distractors.length > 0 && Math.random() < 0.5;
    const statement = useFalse ? distractors[0] : back;
    return {
      ...base,
      question: `Is the answer to "${front}" "${statement}"?`,
      options: ['True', 'False'],
      correctIndex: useFalse ? 1 : 0,
      kind: 'true_false',
      explanation: useFalse
        ? `False. The answer to "${front}" is "${back}", not "${statement}".`
        : `True. The answer to "${front}" is "${back}".`,
    };
  }

  const opts = shuffleInPlace([back, ...distractors]);
  return {
    ...base,
    question: front,
    options: opts,
    correctIndex: opts.indexOf(back),
    kind: 'mcq',
  };
}

export default function QuizModeSelection() {
  const { language, flashcards } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const { friendsWithStatus, circles, sendReaction } = useCommunity();
  const { createQuiz, joinQuiz } = useQuiz();

  const {
    noteId, total, useGenerated,
    quizType: paramQuizType, difficulty: paramDifficulty,
    sourceType: paramSourceType, sourceId: paramSourceId, timer: paramTimer,
  } = useLocalSearchParams<{
    noteId?: string; total?: string; fromBuilder?: string; useGenerated?: string;
    quizType?: string; difficulty?: string; sourceType?: string; sourceId?: string;
    timer?: string;
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
  const selectedTimerSeconds = parseTimerParam(paramTimer);

  const buildQuestions = useCallback(async (): Promise<GeneratedQuizQuestion[]> => {
    if (useGenerated === '1') {
      const { questions, sourceNoteIds } = await getGeneratedQuizStash();
      // Make sure every question carries its resolved note id so it survives
      // inside the session JSON (quiz_attempts.source_note_id depends on it).
      return questions.map((q) => {
        if (q.sourceNoteId) return q;
        const idx = typeof q.sourceIndex === 'number' ? q.sourceIndex : -1;
        const resolved = idx >= 0 && idx < sourceNoteIds.length ? sourceNoteIds[idx] : null;
        return resolved ? { ...q, sourceNoteId: resolved } : q;
      });
    }
    // Build from flashcards
    const pool = noteId && noteId !== '_all'
      ? flashcards.filter((c) => c.noteId === noteId)
      : flashcards;
    // Partial Fisher-Yates — O(k) where k=totalNum, not O(n log n)
    const pool2 = [...pool];
    const count = Math.min(totalNum, pool2.length);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (pool2.length - i));
      [pool2[i], pool2[j]] = [pool2[j], pool2[i]];
    }
    return pool2.slice(0, count).map((card) => questionFromFlashcard(card, pool));
  }, [useGenerated, noteId, flashcards, totalNum]);

  /**
   * The timer is a session-level setting. `quiz_sessions` has no column for it
   * so it is written ONCE on `questions[0].__timerSeconds`; gameplay reads it
   * from there.
   */
  const applyTimerToQuestions = useCallback(
    (questions: GeneratedQuizQuestion[]): GeneratedQuizQuestion[] => {
      if (questions.length === 0) return questions;
      return questions.map((q, index) => {
        const { __timerSeconds: _ignored, ...rest } = q;
        return index === 0 ? { ...rest, __timerSeconds: selectedTimerSeconds } : rest;
      });
    },
    [selectedTimerSeconds],
  );

  const handleSolo = async () => {
    setLoading(true);
    try {
      const rawQuestions = await buildQuestions();
      const questions = applyTimerToQuestions(rawQuestions);
      if (questions.length === 0) {
        Alert.alert('No questions', 'There are no questions to play. Generate a quiz or add flashcards first.');
        return;
      }
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
    if (matchType === 'friend' && !selectedFriend) {
      Alert.alert('Select friend', 'Pick one friend first, then tap the arrow button to send challenge invite.');
      return;
    }
    setLoading(true);
    try {
      // For random: try to find and join an existing session first. The helper
      // retries the lookup once if the join races with another player.
      if (matchType === 'random') {
        const existing = await quizApi.findAndJoinRandomSession(sourceType, quizType);
        if (existing) {
          const session = await joinQuiz(existing.session.id);
          // Clear cached questions even when joining (not creating) a session
          if (useGenerated === '1') await clearGeneratedQuizQuestions();
          router.replace({ pathname: '/match-lobby', params: { sessionId: session.id } } as any);
          return;
        }
      }

      const rawQuestions = await buildQuestions();
      const questions = applyTimerToQuestions(rawQuestions);
      if (questions.length === 0) {
        Alert.alert('No questions', 'There are no questions to play. Generate a quiz or add flashcards first.');
        return;
      }
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
      if (matchType === 'friend' && selectedFriend && session.invite_code) {
        // Best-effort notification ping to selected friend via existing community push pipeline.
        await sendReaction(
          selectedFriend,
          '🎮',
          `Quiz challenge from friend! Join with code: ${session.invite_code}. If your AI limit is reached, you can still join this invite because questions are already generated.`,
        ).catch(() => {});
      }
      // Clear cached questions — they've been committed to the session
      if (useGenerated === '1') await clearGeneratedQuizQuestions();
      router.replace({ pathname: '/match-lobby', params: { sessionId: session.id } } as any);
    } catch (e: any) {
      Alert.alert('Could not create match', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /** Host-only: create multiplayer lobby so invite code is generated (shown in match lobby). */
  const handleHostWithInviteCode = async () => {
    setLoading(true);
    try {
      const rawQuestions = await buildQuestions();
      const questions = applyTimerToQuestions(rawQuestions);
      if (questions.length === 0) {
        Alert.alert('No questions', 'There are no questions to play. Generate a quiz or add flashcards first.');
        return;
      }
      const session = await createQuiz({
        mode: 'multiplayer',
        matchType: 'friend',
        sourceType,
        sourceId,
        quizType,
        difficulty,
        questionCount: questions.length || totalNum,
        questions,
      });
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
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {total} {T('questionsReady')} · {selectedTimerSeconds > 0 ? `${selectedTimerSeconds}s per question` : 'no timer'}
        </Text>
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
          <View style={[styles.arrowBtn, { backgroundColor: theme.primary }]}>
            <Feather name="arrow-right" size={16} color="#fff" />
          </View>
        </Pressable>

        {/* Multiplayer */}
        <Pressable
          style={[styles.modeCard, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1.5 }]}
          onPress={() => setMultiOpen(!multiOpen)}
          disabled={loading}
        >
          <View style={[styles.iconWrap, { backgroundColor: theme.primary + '20' }]}>
            <Feather name="zap" size={22} color={theme.primary} />
          </View>
          <View style={styles.modeBody}>
            <Text style={[styles.modeTitle, { color: theme.text }]}>{T('multiplayerVs')}</Text>
            <Text style={[styles.modeDesc, { color: theme.textSecondary }]}>{T('multiplayerDesc')}</Text>
          </View>
          <View style={[styles.arrowBtn, { backgroundColor: theme.primary }]}>
            <Feather name={multiOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#fff" />
          </View>
        </Pressable>

        {/* Multiplayer sub-options */}
        {multiOpen && (
          <View style={styles.subOptions}>
            <View style={[styles.joinCodeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.joinCodeTitle, { color: theme.text }]}>Invite with a code</Text>
              <Text style={[styles.joinCodeDesc, { color: theme.textSecondary }]}>
                Create a lobby; you'll get a code to share. Friends enter it from Join with invite code (e.g. AI Quiz
                Builder) without building a quiz first.
              </Text>
              <Pressable
                style={[styles.hostCodeBtn, { backgroundColor: theme.primary }]}
                onPress={handleHostWithInviteCode}
                disabled={loading}
              >
                <Feather name="hash" size={18} color="#fff" />
                <Text style={styles.hostCodeBtnText}>Create lobby & get code</Text>
              </Pressable>
            </View>

            {/* Challenge Friend */}
            <View style={[styles.subCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.subCardHeader}>
                <Feather name="user-plus" size={18} color={theme.primary} />
                <Text style={[styles.subTitle, { color: theme.text, flex: 1 }]}>Challenge Friend</Text>
                <Pressable
                  style={[styles.arrowBtn, { backgroundColor: theme.primary }]}
                  onPress={() => handleMultiplayer('friend')}
                  disabled={loading}
                >
                  <Feather name="arrow-right" size={16} color="#fff" />
                </Pressable>
              </View>
              {friendsWithStatus.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendRow}>
                  {friendsWithStatus.slice(0, 8).map((f) => {
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
              <View style={[styles.arrowBtn, { backgroundColor: theme.primary }]}>
                <Feather name="arrow-right" size={16} color="#fff" />
              </View>
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
              <View style={[styles.arrowBtn, { backgroundColor: theme.primary }]}>
                <Feather name="arrow-right" size={16} color="#fff" />
              </View>
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
  joinCodeCard: { borderRadius: RADIUS_SM, borderWidth: 1, padding: 14 },
  joinCodeTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  joinCodeDesc: { fontSize: 12, lineHeight: 17, marginBottom: 14 },
  hostCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  hostCodeBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  arrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendRow: { paddingHorizontal: 16, paddingBottom: 14, gap: 14 },
  friendChip: { alignItems: 'center', width: 56 },
  friendAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  friendInitial: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  friendName: { fontSize: 11, fontWeight: '500', textAlign: 'center' },
});
