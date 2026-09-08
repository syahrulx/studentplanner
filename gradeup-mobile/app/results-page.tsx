import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { useTranslations } from '@/src/i18n';
import { useQuiz } from '@/src/context/QuizContext';
import * as quizApi from '@/src/lib/quizApi';
import type { QuizParticipant, QuizSession, ParticipantAnswer } from '@/src/lib/quizApi';
import { saveQuizToLibrary, type GeneratedQuizQuestion } from '@/src/lib/studyApi';
import { shareQuizResultsPdf } from '@/src/lib/quizResultsPdf';
import { computeLocalScore } from '@/src/lib/quizGrading';

const PAD = 20;
const RADIUS = 20;
const RADIUS_SM = 14;

function isShortAnswer(q: GeneratedQuizQuestion): boolean {
  return q.kind === 'short_answer' || !q.options || q.options.length === 0;
}

function correctAnswerLabel(q: GeneratedQuizQuestion): string {
  if (isShortAnswer(q)) return (q.expectedAnswer || '').trim() || '—';
  const opt = q.options?.[q.correctIndex];
  return opt ? `${String.fromCharCode(65 + q.correctIndex)}. ${opt}` : '—';
}

function yourAnswerLabel(q: GeneratedQuizQuestion, a: ParticipantAnswer | undefined): string {
  if (!a) return 'Not answered';
  if (isShortAnswer(q)) return (a.typedAnswer || '').trim() || 'No answer (time ran out)';
  if (a.selectedIndex < 0) return 'No answer (time ran out)';
  const opt = q.options?.[a.selectedIndex];
  return opt ? `${String.fromCharCode(65 + a.selectedIndex)}. ${opt}` : '—';
}

/** Note id a missed question should be turned into a flashcard under, or null. */
function flashcardNoteIdFor(q: GeneratedQuizQuestion, session: QuizSession | null): string | null {
  if (q.sourceNoteId) return q.sourceNoteId;
  if (
    session?.source_type === 'flashcards' &&
    session.source_id &&
    session.source_id !== '_all' &&
    session.source_id !== '_saved'
  ) {
    return session.source_id;
  }
  return null;
}

export default function ResultsPage() {
  const { language, user, courses, addFlashcards } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const T = useTranslations(language);
  const { currentSession, myAnswers: contextAnswers, leaveQuiz } = useQuiz();

  const {
    sessionId, score: paramScore, total: paramTotal, xp: paramXp, correct: paramCorrect, winner: paramWinner,
  } = useLocalSearchParams<{
    sessionId?: string; score?: string; total?: string; xp?: string; correct?: string; winner?: string; graded?: string;
  }>();

  const [participants, setParticipants] = useState<QuizParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [resolvedSession, setResolvedSession] = useState<QuizSession | null>(currentSession);
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [flashcardsMade, setFlashcardsMade] = useState(false);

  // Load the session (for the per-question breakdown) when it is not in context,
  // e.g. after a deep link or app restart.
  useEffect(() => {
    if (currentSession) {
      setResolvedSession(currentSession);
      return;
    }
    const sid = sessionId;
    if (!sid) return;
    let cancelled = false;
    quizApi.getSession(sid).then((s) => { if (!cancelled && s) setResolvedSession(s); });
    return () => { cancelled = true; };
  }, [currentSession, sessionId]);

  const questions: GeneratedQuizQuestion[] = useMemo(
    () => (resolvedSession?.questions as GeneratedQuizQuestion[]) || [],
    [resolvedSession],
  );

  // Graded answers: context first (replaced with the RPC grading at finish),
  // otherwise my participant row from the DB.
  const myAnswers: ParticipantAnswer[] = useMemo(() => {
    if (contextAnswers.length > 0) return contextAnswers;
    const me = participants.find((p) => p.user_id === user.id);
    return Array.isArray(me?.answers) ? (me!.answers as ParticipantAnswer[]) : [];
  }, [contextAnswers, participants, user.id]);

  const answersByIndex = useMemo(() => {
    const map = new Map<number, ParticipantAnswer>();
    for (const a of myAnswers) map.set(a.questionIndex, a);
    return map;
  }, [myAnswers]);

  const scoreNum = parseInt(paramScore ?? '0', 10) || 0;
  const totalNum = Math.max(1, parseInt(paramTotal ?? '', 10) || questions.length || 5);
  const paramCorrectNum = paramCorrect ? parseInt(paramCorrect, 10) : NaN;
  // Prefer the server-graded correct count; fall back to the graded answers.
  const correctCount = Number.isFinite(paramCorrectNum)
    ? paramCorrectNum
    : myAnswers.length > 0
      ? myAnswers.filter((a) => a.correct).length
      : null;
  const accuracy = correctCount !== null ? Math.round((correctCount / totalNum) * 100) : null;
  const isMultiplayer = resolvedSession?.mode === 'multiplayer';

  // XP comes from the RPC (`xp_earned`, includes the winner bonus). Fallback:
  // recompute with the same formula from the graded answers.
  const paramXpNum = paramXp ? parseInt(paramXp, 10) : NaN;
  const xpEarned = Number.isFinite(paramXpNum)
    ? paramXpNum
    : myAnswers.length > 0
      ? computeLocalScore(myAnswers)
      : scoreNum;
  const totalAnswerTime = myAnswers.reduce((sum, a) => sum + a.timeMs, 0);
  const avgTimeMs = myAnswers.length > 0 ? totalAnswerTime / myAnswers.length : 0;

  const missed = useMemo(
    () => questions
      .map((q, idx) => ({ q, idx, a: answersByIndex.get(idx) }))
      .filter(({ a }) => !a || !a.correct),
    [questions, answersByIndex],
  );
  const missedWithNote = useMemo(
    () => missed.filter(({ q }) => flashcardNoteIdFor(q, resolvedSession) !== null),
    [missed, resolvedSession],
  );

  /** Refetch until every participant has finished so scores aren't stale. The pending timeout is cleared on unmount. */
  useEffect(() => {
    const sid = sessionId || currentSession?.id;
    if (!sid) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let attempt = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;

    const loadResults = async () => {
      try {
        const parts = await quizApi.getSessionParticipants(sid);
        if (cancelled) return;
        const sorted = [...parts].sort((a, b) => (b.score || 0) - (a.score || 0));
        setParticipants(sorted);

        const multi = currentSession?.mode === 'multiplayer';
        const everyoneDone = parts.length < 2 || parts.every((p) => p.finished);
        attempt += 1;
        if (multi && !everyoneDone && attempt < 30) {
          pending = setTimeout(loadResults, 400);
        } else {
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    loadResults();
    return () => {
      cancelled = true;
      if (pending) clearTimeout(pending);
    };
  }, [sessionId, currentSession?.id, currentSession?.mode]);

  const maxParticipantScore = useMemo(() => {
    if (participants.length === 0) return 0;
    return Math.max(...participants.map((p) => p.score ?? 0));
  }, [participants]);

  const numAtTopScore = useMemo(
    () => participants.filter((p) => (p.score ?? 0) === maxParticipantScore).length,
    [participants, maxParticipantScore],
  );

  const myParticipantScore = useMemo(() => {
    const me = participants.find((p) => p.user_id === user.id);
    return me?.score ?? 0;
  }, [participants, user.id]);

  const resultsReady =
    !isMultiplayer ||
    participants.length < 2 ||
    participants.every((p) => p.finished);

  const isTie =
    isMultiplayer &&
    resultsReady &&
    participants.length >= 2 &&
    numAtTopScore > 1 &&
    myParticipantScore === maxParticipantScore;

  // The RPC flags the winner when the last participant finishes; earlier
  // finishers derive it from the final standings once everyone is done.
  const isWinner =
    isMultiplayer &&
    (paramWinner === '1' ||
      (resultsReady &&
        !loading &&
        participants.length >= 2 &&
        myParticipantScore === maxParticipantScore &&
        numAtTopScore === 1));

  const handlePlayAgain = () => {
    leaveQuiz();
    // Route back to the quiz builder so the user can tweak settings and replay
    if (resolvedSession?.source_type === 'notes' && resolvedSession?.source_id) {
      router.replace({ pathname: '/ai-quiz-builder' } as any);
    } else {
      router.replace({ pathname: '/quiz-mode-selection', params: {
        sourceType: resolvedSession?.source_type || 'flashcards',
        sourceId: resolvedSession?.source_id || '_all',
        quizType: resolvedSession?.quiz_type || 'mcq',
        difficulty: resolvedSession?.difficulty || 'medium',
        total: String(totalNum),
      } } as any);
    }
  };

  const handleShare = async () => {
    const sid = sessionId || currentSession?.id;
    let session = resolvedSession;
    if ((!session?.questions?.length) && sid) {
      session = (await quizApi.getSession(sid)) ?? session;
    }
    if (!session?.questions?.length) {
      Alert.alert('Nothing to share', 'Quiz questions are not available for this session.');
      return;
    }

    const sourceLabel =
      session.source_type === 'notes'
        ? (courses.find((c) => c.id === session!.source_id)?.name || session.source_id || 'Notes')
        : 'Flashcards';
    const quizTypeLabel = (session.quiz_type || 'mixed')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase());
    const difficultyLabel = (session.difficulty || 'medium')
      .replace(/\b\w/g, (m) => m.toUpperCase());

    setSharingPdf(true);
    try {
      await shareQuizResultsPdf({
        questions: session.questions,
        myAnswers,
        summary: {
          correctCount: correctCount ?? 0,
          totalQuestions: totalNum,
          accuracyPct: accuracy,
          points: scoreNum,
          xp: xpEarned,
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
      const session = resolvedSession || (sid ? await quizApi.getSession(sid) : null);
      if (!session?.questions?.length) {
        Alert.alert('Nothing to save', 'This quiz does not contain questions to save.');
        return;
      }
      const sourceLabel = session.source_type === 'notes'
        ? (courses.find((c) => c.id === session.source_id)?.id || 'Notes')
        : 'Flashcards';
      const quizTypeLabel = (session.quiz_type || 'mixed')
        .replace('_', ' ')
        .replace(/\b\w/g, (m) => m.toUpperCase());
      const difficultyLabel = (session.difficulty || 'medium')
        .replace(/\b\w/g, (m) => m.toUpperCase());
      await saveQuizToLibrary({
        title: `${sourceLabel} • ${quizTypeLabel} • ${difficultyLabel}`,
        sourceType: session.source_type,
        sourceId: session.source_id || undefined,
        quizType: session.quiz_type as any,
        difficulty: session.difficulty as any,
        questions: session.questions,
      });
      Alert.alert('Saved', 'Quiz saved to Revision Quiz in Study.');
    } catch {
      Alert.alert('Save failed', 'Could not save this quiz right now. Please try again.');
    }
  };

  const handleMissedToFlashcards = async () => {
    if (flashcardsMade) return;
    if (missed.length === 0) {
      Alert.alert('Nothing to add', 'You answered every question correctly.');
      return;
    }
    if (missedWithNote.length === 0) {
      Alert.alert(
        'No note to attach to',
        'These questions are not linked to a specific note, so flashcards cannot be created automatically. Save the quiz for revision instead.',
      );
      return;
    }
    // Group by note so each deck gets one batch write.
    const byNote = new Map<string, { front: string; back: string; cardType: 'basic'; sourceExcerpt?: string }[]>();
    for (const { q } of missedWithNote) {
      const noteId = flashcardNoteIdFor(q, resolvedSession);
      if (!noteId) continue;
      const answer = correctAnswerLabel(q);
      const explanation = (q.explanation || '').trim();
      const back = explanation ? `${answer}\n\n${explanation}` : answer;
      const list = byNote.get(noteId) ?? [];
      list.push({ front: q.question, back, cardType: 'basic', sourceExcerpt: q.proof || undefined });
      byNote.set(noteId, list);
    }
    let created = 0;
    let failed = 0;
    for (const [noteId, cards] of byNote) {
      try {
        await addFlashcards(noteId, cards);
        created += cards.length;
      } catch {
        failed += cards.length;
      }
    }
    if (created > 0) setFlashcardsMade(true);
    const skipped = missed.length - created - failed;
    if (created === 0) {
      Alert.alert('Could not create flashcards', 'The cards could not be saved right now. Please try again.');
      return;
    }
    Alert.alert(
      'Flashcards created',
      `${created} flashcard${created === 1 ? '' : 's'} added from your missed questions.${
        skipped > 0 ? ` ${skipped} question${skipped === 1 ? ' was' : 's were'} skipped because no note could be linked.` : ''
      }${failed > 0 ? ` ${failed} could not be saved.` : ''}`,
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        styles.content,
        // A fixed 56 sits under the Dynamic Island, whose inset is larger.
        { paddingTop: Platform.OS === 'ios' ? insets.top + 4 : 40 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Result Header */}
      <View
        style={[
          styles.heroCard,
          {
            backgroundColor:
              loading && isMultiplayer
                ? theme.primary
                : isWinner
                  ? '#f59e0b'
                  : isTie
                    ? '#6366f1'
                    : theme.primary,
          },
        ]}
      >
        {loading && isMultiplayer ? (
          <ActivityIndicator size="large" color="#fff" style={{ marginBottom: 12 }} />
        ) : (
          <>
            {isWinner && <Feather name="award" size={48} color="#fff" style={{ marginBottom: 12 }} />}
            {isTie && !isWinner && (
              <Feather name="shuffle" size={48} color="#fff" style={{ marginBottom: 12 }} />
            )}
            {!isWinner && !isTie && <ThemeIcon name="checkCircle" size={48} color="#fff" />}
          </>
        )}

        <Text style={styles.heroTitle}>
          {loading && isMultiplayer
            ? 'Finalizing results…'
            : isMultiplayer
              ? isWinner
                ? 'You Won!'
                : isTie
                  ? "It's a tie!"
                  : 'Game Over'
              : T('quizComplete')}
        </Text>
        <Text style={styles.heroScore}>{correctCount ?? '--'} / {totalNum}</Text>
        <Text style={styles.heroSub}>{accuracy !== null ? `${accuracy}% accuracy • ` : ''}{scoreNum} points</Text>

        {/* XP badge */}
        <View style={styles.xpBadge}>
          <Feather name="zap" size={16} color="#f59e0b" />
          <Text style={styles.xpText}>+{xpEarned} XP</Text>
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
              const pTotal = resolvedSession?.question_count || totalNum;
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

      {/* Missed → flashcards */}
      {questions.length > 0 && missed.length > 0 && (
        <Pressable
          style={[
            styles.ctaBtn,
            { backgroundColor: flashcardsMade ? theme.card : '#10b981', borderWidth: flashcardsMade ? 1 : 0, borderColor: theme.border, marginBottom: 20 },
          ]}
          onPress={handleMissedToFlashcards}
          disabled={flashcardsMade}
        >
          <Feather name={flashcardsMade ? 'check' : 'layers'} size={20} color={flashcardsMade ? theme.textSecondary : '#fff'} />
          <Text style={[styles.ctaBtnText, flashcardsMade && { color: theme.textSecondary }]}>
            {flashcardsMade
              ? 'Flashcards added'
              : `Turn missed questions into flashcards (${missedWithNote.length > 0 ? missedWithNote.length : missed.length})`}
          </Text>
        </Pressable>
      )}

      {/* Per-question breakdown */}
      {questions.length > 0 && (
        <View style={styles.section}>
          <Pressable style={styles.sectionHeaderRow} onPress={() => setShowBreakdown((v) => !v)}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginBottom: 0 }]}>QUESTION BREAKDOWN</Text>
            <Feather name={showBreakdown ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
          </Pressable>
          {showBreakdown && questions.map((q, idx) => {
            const a = answersByIndex.get(idx);
            const correct = !!a?.correct;
            const explanation = (q.explanation || '').trim();
            return (
              <View
                key={`${idx}-${q.question.slice(0, 24)}`}
                style={[styles.qCard, { backgroundColor: theme.card, borderColor: correct ? '#10b981' : '#ef4444' }]}
              >
                <View style={styles.qHeader}>
                  <View style={[styles.qBadge, { backgroundColor: correct ? '#10b981' : '#ef4444' }]}>
                    <Feather name={correct ? 'check' : 'x'} size={12} color="#fff" />
                    <Text style={styles.qBadgeText}>Q{idx + 1}</Text>
                  </View>
                  {a ? (
                    <Text style={[styles.qTime, { color: theme.textSecondary }]}>{(a.timeMs / 1000).toFixed(1)}s</Text>
                  ) : null}
                </View>
                <Text style={[styles.qText, { color: theme.text }]}>{q.question}</Text>
                <View style={styles.qRow}>
                  <Text style={[styles.qRowLabel, { color: theme.textSecondary }]}>Your answer</Text>
                  <Text style={[styles.qRowValue, { color: correct ? '#10b981' : '#ef4444' }]}>{yourAnswerLabel(q, a)}</Text>
                </View>
                {!correct && (
                  <View style={styles.qRow}>
                    <Text style={[styles.qRowLabel, { color: theme.textSecondary }]}>Correct answer</Text>
                    <Text style={[styles.qRowValue, { color: theme.text }]}>{correctAnswerLabel(q)}</Text>
                  </View>
                )}
                {explanation ? (
                  <Text style={[styles.qExplanation, { color: theme.textSecondary }]}>{explanation}</Text>
                ) : null}
              </View>
            );
          })}
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
  content: { paddingHorizontal: PAD, paddingBottom: 24 },

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
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },

  playerRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: RADIUS_SM, borderWidth: 1.5, marginBottom: 8 },
  rankCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rankNum: { fontSize: 14, fontWeight: '800', color: '#64748b' },
  playerBody: { flex: 1 },
  playerName: { fontSize: 15, fontWeight: '700' },
  playerSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  playerScore: { fontSize: 16, fontWeight: '800' },

  qCard: { borderRadius: RADIUS_SM, borderWidth: 1, borderLeftWidth: 4, padding: 14, marginBottom: 10, gap: 6 },
  qHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  qBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  qTime: { fontSize: 12, fontWeight: '600' },
  qText: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  qRow: { gap: 2 },
  qRowLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  qRowValue: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  qExplanation: { fontSize: 13, lineHeight: 18, fontWeight: '500', marginTop: 2 },

  actions: { gap: 12 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, borderRadius: RADIUS },
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: RADIUS_SM, borderWidth: 1 },
  secondaryBtnText: { fontSize: 14, fontWeight: '700' },
});
