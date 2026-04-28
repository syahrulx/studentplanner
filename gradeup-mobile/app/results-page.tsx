import { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { useTranslations } from '@/src/i18n';
import { useQuiz } from '@/src/context/QuizContext';
import * as quizApi from '@/src/lib/quizApi';
import type { QuizParticipant } from '@/src/lib/quizApi';
import { saveQuizToLibrary } from '@/src/lib/studyApi';
import { shareQuizResultsPdf } from '@/src/lib/quizResultsPdf';

const PAD = 20;
const RADIUS = 20;
const RADIUS_SM = 14;

export default function ResultsPage() {
  const { language, user, courses } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const { currentSession, myAnswers, opponentProgress, leaveQuiz } = useQuiz();

  const { sessionId, score: paramScore, total: paramTotal } = useLocalSearchParams<{
    sessionId?: string; score?: string; total?: string;
  }>();

  const [participants, setParticipants] = useState<QuizParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingPdf, setSharingPdf] = useState(false);

  const scoreNum = parseInt(paramScore ?? '0', 10);
  const totalNum = Math.max(1, parseInt(paramTotal ?? '5', 10));
  // Derive correctCount from answers when available; don't guess from score
  // (score includes speed bonuses so dividing by 10 overcounts)
  const correctCount = myAnswers.length > 0
    ? myAnswers.filter((a) => a.correct).length
    : null;
  const accuracy = correctCount !== null ? Math.round((correctCount / totalNum) * 100) : null;
  const isMultiplayer = currentSession?.mode === 'multiplayer';

  // Recalculate XP from full myAnswers (includes speed bonus) for display accuracy
  const baseXP = myAnswers.length > 0
    ? myAnswers.reduce((sum, a) => sum + (a.correct ? 10 : 0) + (a.correct && a.timeMs < 5000 ? 5 : 0), 0)
    : scoreNum;
  const totalAnswerTime = myAnswers.reduce((sum, a) => sum + a.timeMs, 0);
  const avgTimeMs = myAnswers.length > 0 ? totalAnswerTime / myAnswers.length : 0;

  useEffect(() => {
    const loadResults = async () => {
      const sid = sessionId || currentSession?.id;
      if (!sid) { setLoading(false); return; }
      try {
        const parts = await quizApi.getSessionParticipants(sid);
        setParticipants(parts.sort((a, b) => (b.score || 0) - (a.score || 0)));
      } catch {}
      setLoading(false);
    };
    loadResults();
  }, [sessionId, currentSession]);

  const myRank = useMemo(() => {
    if (!isMultiplayer || participants.length === 0) return 1;
    // Match by user_id for correctness — name matching is fragile
    const me = participants.find((p) => p.user_id === user.id);
    return me ? participants.indexOf(me) + 1 : 1;
  }, [participants, isMultiplayer, user.id]);

  const isWinner = isMultiplayer && myRank === 1;

  const handlePlayAgain = () => {
    leaveQuiz();
    // Route back to the quiz builder so the user can tweak settings and replay
    if (currentSession?.source_type === 'notes' && currentSession?.source_id) {
      router.replace({ pathname: '/ai-quiz-builder' } as any);
    } else {
      router.replace({ pathname: '/quiz-mode-selection', params: {
        sourceType: currentSession?.source_type || 'flashcards',
        sourceId: currentSession?.source_id || '_all',
        quizType: currentSession?.quiz_type || 'mcq',
        difficulty: currentSession?.difficulty || 'medium',
        total: String(totalNum),
      } } as any);
    }
  };

  const handleShare = async () => {
    const sid = sessionId || currentSession?.id;
    let resolvedSession = currentSession;
    if ((!resolvedSession?.questions?.length) && sid) {
      resolvedSession = (await quizApi.getSession(sid)) ?? resolvedSession;
    }
    if (!resolvedSession?.questions?.length) {
      Alert.alert('Nothing to share', 'Quiz questions are not available for this session.');
      return;
    }

    const sourceLabel =
      resolvedSession.source_type === 'notes'
        ? (courses.find((c) => c.id === resolvedSession.source_id)?.name || resolvedSession.source_id || 'Notes')
        : 'Flashcards';
    const quizTypeLabel = (resolvedSession.quiz_type || 'mixed')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase());
    const difficultyLabel = (resolvedSession.difficulty || 'medium')
      .replace(/\b\w/g, (m) => m.toUpperCase());

    setSharingPdf(true);
    try {
      await shareQuizResultsPdf({
        questions: resolvedSession.questions,
        myAnswers,
        summary: {
          correctCount: correctCount ?? 0,
          totalQuestions: totalNum,
          accuracyPct: accuracy,
          points: scoreNum,
          xp: baseXP,
          avgTimeSec: avgTimeMs > 0 ? avgTimeMs / 1000 : null,
          title: `${sourceLabel} · Quiz`,
        },
        meta: {
          quizType: quizTypeLabel,
          difficulty: difficultyLabel,
          sourceLabel,
        },
      });
    } catch {
      Alert.alert('Could not share', 'PDF export failed. Please try again.');
    } finally {
      setSharingPdf(false);
    }
  };

  const handleSaveForRevision = async () => {
    try {
      const sid = sessionId || currentSession?.id;
      const resolvedSession = currentSession || (sid ? await quizApi.getSession(sid) : null);
      if (!resolvedSession?.questions?.length) {
        Alert.alert('Nothing to save', 'This quiz does not contain questions to save.');
        return;
      }
      const sourceLabel = resolvedSession.source_type === 'notes'
        ? (courses.find((c) => c.id === resolvedSession.source_id)?.id || 'Notes')
        : 'Flashcards';
      const quizTypeLabel = (resolvedSession.quiz_type || 'mixed')
        .replace('_', ' ')
        .replace(/\b\w/g, (m) => m.toUpperCase());
      const difficultyLabel = (resolvedSession.difficulty || 'medium')
        .replace(/\b\w/g, (m) => m.toUpperCase());
      await saveQuizToLibrary({
        title: `${sourceLabel} • ${quizTypeLabel} • ${difficultyLabel}`,
        sourceType: resolvedSession.source_type,
        sourceId: resolvedSession.source_id || undefined,
        quizType: resolvedSession.quiz_type as any,
        difficulty: resolvedSession.difficulty as any,
        questions: resolvedSession.questions,
      });
      Alert.alert('Saved', 'Quiz saved to Revision Quiz in Study.');
    } catch {
      Alert.alert('Save failed', 'Could not save this quiz right now. Please try again.');
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Result Header */}
      <View style={[styles.heroCard, { backgroundColor: isWinner ? '#f59e0b' : theme.primary }]}>
        {isWinner && <Feather name="award" size={48} color="#fff" style={{ marginBottom: 12 }} />}
        {!isWinner && <ThemeIcon name="checkCircle" size={48} color="#fff" />}

        <Text style={styles.heroTitle}>
          {isMultiplayer ? (isWinner ? 'You Won!' : 'Game Over') : T('quizComplete')}
        </Text>
        <Text style={styles.heroScore}>{correctCount ?? '--'} / {totalNum}</Text>
        <Text style={styles.heroSub}>{accuracy !== null ? `${accuracy}% accuracy • ` : ''}{scoreNum} points</Text>

        {/* XP badge */}
        <View style={styles.xpBadge}>
          <Feather name="zap" size={16} color="#f59e0b" />
          <Text style={styles.xpText}>+{baseXP} XP</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="check-circle" size={18} color="#10b981" />
          <Text style={[styles.statValue, { color: theme.text }]}>{correctCount ?? '--'}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Correct</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="x-circle" size={18} color="#ef4444" />
          <Text style={[styles.statValue, { color: theme.text }]}>{correctCount !== null ? totalNum - correctCount : '--'}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Wrong</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="clock" size={18} color="#3b82f6" />
          <Text style={[styles.statValue, { color: theme.text }]}>{avgTimeMs > 0 ? (avgTimeMs / 1000).toFixed(1) + 's' : '-'}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Avg Time</Text>
        </View>
      </View>

      {/* Multiplayer comparison */}
      {isMultiplayer && participants.length > 1 && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>MATCH RESULTS</Text>
          {loading ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            participants.map((p, idx) => {
              const pCorrect = (p.answers || []).filter((a: any) => a.correct).length;
              const pTotal = currentSession?.question_count || totalNum;
              const isMe = p.user_id === user.id; // use user_id — name match is fragile
              return (
                <View
                  key={p.id}
                  style={[
                    styles.playerRow,
                    { backgroundColor: isMe ? theme.primary + '10' : theme.card, borderColor: isMe ? theme.primary : theme.border },
                  ]}
                >
                  <View style={[styles.rankCircle, { backgroundColor: idx === 0 ? '#f59e0b' : '#e2e8f0' }]}>
                    {idx === 0 ? (
                      <Feather name="award" size={14} color="#fff" />
                    ) : (
                      <Text style={styles.rankNum}>{idx + 1}</Text>
                    )}
                  </View>
                  <View style={styles.playerBody}>
                    <Text style={[styles.playerName, { color: theme.text }]}>
                      {isMe ? `${user.name} (You)` : p.profile?.name || 'Player'}
                    </Text>
                    <Text style={[styles.playerSub, { color: theme.textSecondary }]}>{pCorrect}/{pTotal} correct</Text>
                  </View>
                  <Text style={[styles.playerScore, { color: isMe ? theme.primary : theme.text }]}>{p.score} pts</Text>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={[styles.ctaBtn, { backgroundColor: theme.primary }]}
          onPress={() => { leaveQuiz(); router.replace('/leaderboard' as any); }}
        >
          <ThemeIcon name="leaderboard" size={20} color="#fff" />
          <Text style={styles.ctaBtnText}>{T('viewLeaderboard')}</Text>
        </Pressable>

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.secondaryBtn, { backgroundColor: theme.card, borderColor: theme.border, flex: 1 }]}
            onPress={handlePlayAgain}
          >
            <Feather name="rotate-ccw" size={18} color={theme.primary} />
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Play Again</Text>
          </Pressable>

          <Pressable
            style={[styles.secondaryBtn, { backgroundColor: theme.card, borderColor: theme.border, flex: 1, opacity: sharingPdf ? 0.65 : 1 }]}
            onPress={handleShare}
            disabled={sharingPdf}
          >
            {sharingPdf ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Feather name="share" size={18} color={theme.primary} />
            )}
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{sharingPdf ? 'Preparing PDF…' : 'Share PDF'}</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.secondaryBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={handleSaveForRevision}
        >
          <Feather name="bookmark" size={18} color={theme.primary} />
          <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Save for Revision</Text>
        </Pressable>

        <Pressable
          style={[styles.secondaryBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => { leaveQuiz(); router.replace('/(tabs)/notes' as any); }}
        >
          <ThemeIcon name="bookOpen" size={18} color={theme.primary} />
          <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{T('backToNotesQuiz')}</Text>
        </Pressable>
      </View>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: PAD, paddingTop: 56, paddingBottom: 24 },

  heroCard: { borderRadius: RADIUS, padding: 32, alignItems: 'center', marginBottom: 20 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff', marginTop: 12, marginBottom: 8 },
  heroScore: { fontSize: 48, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  xpBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  xpText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, alignItems: 'center', padding: 16, borderRadius: RADIUS_SM, borderWidth: 1, gap: 6 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12 },

  playerRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: RADIUS_SM, borderWidth: 1.5, marginBottom: 8 },
  rankCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rankNum: { fontSize: 14, fontWeight: '800', color: '#64748b' },
  playerBody: { flex: 1 },
  playerName: { fontSize: 15, fontWeight: '700' },
  playerSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  playerScore: { fontSize: 16, fontWeight: '800' },

  actions: { gap: 12 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, borderRadius: RADIUS },
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: RADIUS_SM, borderWidth: 1 },
  secondaryBtnText: { fontSize: 14, fontWeight: '700' },
});
