import type { Task } from '../types';
import type { RecommendationFeedback } from './recommendationDb';
import * as recommendationDb from './recommendationDb';
import * as offlineSync from './offlineSync';

export type StudyRecommendationRule = 'deadline_cluster' | 'large_task_breakdown';

export interface StudyRecommendation {
  key: string;
  ruleId: StudyRecommendationRule;
  title: string;
  summary: string;
  why: string[];
  affectedTaskIds: string[];
  affectedTaskTitles: string[];
  taskId: string;
  estimatedMinutes: number;
  suggestedStepCount: number;
  score: number;
  shownForDate: string;
}

const TYPE_MINUTES: Record<string, number> = {
  assignment: 180,
  project: 300,
  lab: 120,
  quiz: 60,
  test: 150,
  exam: 240,
  presentation: 180,
};

function localDateISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T12:00:00`);
  const to = new Date(`${toISO}T12:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 999;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function estimateTaskMinutes(task: Task): number {
  if (Number.isFinite(task.estimatedMinutes) && Number(task.estimatedMinutes) >= 5) {
    return Math.min(1440, Math.round(Number(task.estimatedMinutes)));
  }
  const base = TYPE_MINUTES[String(task.type || '').toLowerCase()] ?? 120;
  const notesAdjustment = task.notes?.trim().length > 300 ? 30 : 0;
  return base + notesAdjustment;
}

function suggestedSteps(minutes: number): number {
  if (minutes <= 90) return 2;
  if (minutes <= 180) return 3;
  if (minutes <= 300) return 4;
  return 5;
}

function urgencyScore(days: number): number {
  if (days < 0) return 100;
  if (days <= 1) return 95;
  if (days <= 3) return 82;
  if (days <= 6) return 68;
  if (days <= 10) return 48;
  return 25;
}

function effortLabel(minutes: number): string {
  const low = Math.max(30, Math.round((minutes * 0.75) / 15) * 15);
  const high = Math.max(low, Math.round((minutes * 1.25) / 15) * 15);
  const format = (value: number) => value < 60 ? `${value} min` : `${Number((value / 60).toFixed(1))} hr`;
  return `${format(low)}–${format(high)}`;
}

export function getRecommendedToday(input: {
  tasks: Task[];
  feedback: RecommendationFeedback[];
  today?: string;
}): StudyRecommendation | null {
  const today = input.today ?? localDateISO(new Date());
  // Keep the feature calm: after one accepted or dismissed suggestion, do not
  // immediately replace it with another recommendation on the same day.
  if (input.feedback.some((item) => item.shownForDate === today)) return null;
  const feedbackKeys = new Set(input.feedback.map((item) => item.recommendationKey));
  const mainTasks = input.tasks.filter((task) => (
    !task.parentTaskId &&
    !task.isDone &&
    !task.needsDate &&
    !(task.repeatDays?.length) &&
    !task.excludeFromFocus
  ));
  const existingParentIds = new Set(input.tasks.filter((task) => task.parentTaskId).map((task) => task.parentTaskId));
  const upcoming = mainTasks.filter((task) => {
    const days = daysBetween(today, task.dueDate.slice(0, 10));
    return days >= -7 && days <= 14;
  });

  let best: StudyRecommendation | null = null;
  for (const task of upcoming) {
    if (existingParentIds.has(task.id)) continue;
    const days = daysBetween(today, task.dueDate.slice(0, 10));
    const nearby = mainTasks.filter((candidate) => {
      const candidateDays = daysBetween(today, candidate.dueDate.slice(0, 10));
      return candidateDays >= 0 && candidateDays <= 6;
    });
    const estimate = estimateTaskMinutes(task);
    const affectedTasks = [task, ...nearby.filter((candidate) => candidate.id !== task.id)];
    const collisionScore = Math.min(100, Math.max(0, affectedTasks.length - 1) * 34);
    const sizeScore = Math.min(100, (estimate / 300) * 100);
    const score = Math.round(urgencyScore(days) * 0.58 + collisionScore * 0.27 + sizeScore * 0.15);
    const ruleId: StudyRecommendationRule = affectedTasks.length >= 3 ? 'deadline_cluster' : 'large_task_breakdown';
    const key = `${today}:${ruleId}:${task.id}:${task.dueDate.slice(0, 10)}`;
    if (feedbackKeys.has(key)) continue;
    const stepCount = suggestedSteps(estimate);
    const duePhrase = days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue` : days === 0 ? 'due today' : `due in ${days} day${days === 1 ? '' : 's'}`;
    const summary = affectedTasks.length >= 3
      ? `You have ${affectedTasks.length} deadlines within six days. Break ${task.title} into ${stepCount} manageable steps.`
      : `${task.title} is ${duePhrase}. Breaking it into ${stepCount} steps can make the next action clearer.`;
    const why = [
      `${task.title} is ${duePhrase}.`,
      ...(affectedTasks.length >= 2 ? [`${affectedTasks.length - 1} other deadline${affectedTasks.length - 1 === 1 ? '' : 's'} also fall within six days.`] : []),
      ...(affectedTasks.length > 1 ? [
        `Related deadlines: ${affectedTasks.slice(1, 4).map((item) => `${item.title} (${item.dueDate.slice(0, 10)})`).join(', ')}${affectedTasks.length > 4 ? ` and ${affectedTasks.length - 4} more` : ''}.`,
      ] : []),
      `Planning estimate: ${effortLabel(estimate)} based on the task type, not measured study time.`,
    ];
    const candidate: StudyRecommendation = {
      key,
      ruleId,
      title: affectedTasks.length >= 3 ? 'Reduce the deadline pile-up' : 'Make the next step smaller',
      summary,
      why,
      affectedTaskIds: affectedTasks.map((item) => item.id),
      affectedTaskTitles: affectedTasks.map((item) => item.title),
      taskId: task.id,
      estimatedMinutes: estimate,
      suggestedStepCount: stepCount,
      score,
      shownForDate: today,
    };
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

export async function loadStudyRecommendationFeedback(userId: string): Promise<RecommendationFeedback[]> {
  const cached = await offlineSync.loadCachedRecommendationFeedback(userId);
  try {
    await offlineSync.flushOfflineSync(userId);
    const remote = await recommendationDb.getRecommendationFeedback(userId);
    const merged = await offlineSync.mergePendingRecommendationFeedback(userId, remote);
    await offlineSync.cacheRecommendationFeedback(userId, merged);
    return merged;
  } catch {
    return cached;
  }
}

export async function recordStudyRecommendationFeedback(input: {
  userId: string;
  recommendationKey: string;
  ruleId: string;
  relatedTaskId?: string;
  status: RecommendationFeedback['status'];
  shownForDate: string;
}): Promise<RecommendationFeedback> {
  const feedback: RecommendationFeedback = {
    recommendationKey: input.recommendationKey,
    ruleId: input.ruleId,
    relatedTaskId: input.relatedTaskId,
    status: input.status,
    shownForDate: input.shownForDate,
    updatedAt: new Date().toISOString(),
  };
  const cached = await offlineSync.loadCachedRecommendationFeedback(input.userId);
  const next = [feedback, ...cached.filter((item) => item.recommendationKey !== feedback.recommendationKey)];
  await offlineSync.cacheRecommendationFeedback(input.userId, next);
  await offlineSync.queueRecommendationFeedback(input.userId, feedback);
  void offlineSync.flushOfflineSync(input.userId).catch(() => {});
  return feedback;
}
