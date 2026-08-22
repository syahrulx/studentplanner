import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS } from '@/src/constants';
import { RecommendedTodayCard } from '@/src/components/RecommendedTodayCard';
import type { RecommendationFeedback } from '@/src/lib/recommendationDb';
import {
  getRecommendedToday,
  loadStudyRecommendationFeedback,
  recordStudyRecommendationFeedback,
} from '@/src/lib/studyRecommendations';
import { getTodayISO } from '@/src/utils/date';

export default function WeeklySummary() {
  const { user, tasks } = useApp();
  const mainTasks = tasks.filter((task) => !task.parentTaskId);
  const pending = mainTasks.filter((task) => !task.isDone);
  const completed = mainTasks.length - pending.length;
  const rate = mainTasks.length ? Math.round((completed / mainTasks.length) * 100) : 0;
  const today = getTodayISO();
  const inSevenDays = new Date(`${today}T12:00:00`);
  inSevenDays.setDate(inSevenDays.getDate() + 7);
  const weekEnd = `${inSevenDays.getFullYear()}-${String(inSevenDays.getMonth() + 1).padStart(2, '0')}-${String(inSevenDays.getDate()).padStart(2, '0')}`;
  const dueSoon = pending.filter((task) => !task.needsDate && task.dueDate >= today && task.dueDate <= weekEnd).length;
  const overdue = pending.filter((task) => !task.needsDate && task.dueDate < today).length;
  const [feedback, setFeedback] = useState<RecommendationFeedback[]>([]);

  useEffect(() => {
    let active = true;
    if (user.id) void loadStudyRecommendationFeedback(user.id).then((items) => active && setFeedback(items));
    return () => { active = false; };
  }, [user.id]);

  const recommendation = useMemo(
    () => getRecommendedToday({ tasks, feedback, today }),
    [tasks, feedback, today],
  );

  const dismiss = () => {
    if (!recommendation || !user.id) return;
    const item: RecommendationFeedback = {
      recommendationKey: recommendation.key,
      ruleId: recommendation.ruleId,
      relatedTaskId: recommendation.taskId,
      status: 'dismissed',
      shownForDate: recommendation.shownForDate,
      updatedAt: new Date().toISOString(),
    };
    setFeedback((current) => [item, ...current.filter((entry) => entry.recommendationKey !== item.recommendationKey)]);
    void recordStudyRecommendationFeedback({
      userId: user.id,
      recommendationKey: recommendation.key,
      ruleId: recommendation.ruleId,
      relatedTaskId: recommendation.taskId,
      status: 'dismissed',
      shownForDate: recommendation.shownForDate,
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Weekly Summary</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Completion</Text>
        <Text style={styles.cardValue}>{rate}%</Text>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${rate}%` }]} />
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>NEXT 7 DAYS</Text>
        <Text style={styles.cardValue}>{dueSoon}</Text>
        <Text style={styles.summaryText}>{overdue > 0 ? `${overdue} overdue task${overdue === 1 ? '' : 's'} also need attention.` : 'No overdue tasks.'}</Text>
      </View>
      {recommendation ? (
        <RecommendedTodayCard
          recommendation={recommendation}
          onBreakdown={() => router.push({
            pathname: '/task-breakdown',
            params: {
              taskId: recommendation.taskId,
              suggestedCount: String(recommendation.suggestedStepCount),
              recommendationKey: recommendation.key,
              ruleId: recommendation.ruleId,
              shownForDate: recommendation.shownForDate,
            },
          } as any)}
          onDismiss={dismiss}
        />
      ) : (
        <View style={styles.card}>
          <Text style={styles.summaryText}>No urgent recommendation today. Rencana will suggest one when your task dates and workload make it useful.</Text>
        </View>
      )}
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
  backBtn: { marginRight: 18 },
  backText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  card: { backgroundColor: COLORS.card, borderRadius: 24, padding: 26, marginBottom: 18, borderWidth: 1, borderColor: COLORS.border },
  cardLabel: { fontSize: 12, color: COLORS.gray, fontWeight: '800', marginBottom: 8, letterSpacing: 1 },
  cardValue: { fontSize: 32, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  barBg: { height: 10, backgroundColor: COLORS.bg, borderRadius: 5, marginTop: 16, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: COLORS.navy, borderRadius: 5 },
  summaryText: { fontSize: 13, color: COLORS.gray, lineHeight: 22 },
});
