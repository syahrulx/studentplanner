import { supabase } from './supabase';

export type RecommendationFeedbackStatus = 'dismissed' | 'accepted';

export interface RecommendationFeedback {
  recommendationKey: string;
  ruleId: string;
  relatedTaskId?: string;
  status: RecommendationFeedbackStatus;
  shownForDate: string;
  updatedAt: string;
}
function rowToFeedback(row: Record<string, unknown>): RecommendationFeedback {
  return {
    recommendationKey: String(row.recommendation_key ?? ''),
    ruleId: String(row.rule_id ?? ''),
    relatedTaskId: row.related_task_id != null ? String(row.related_task_id) : undefined,
    status: row.status === 'accepted' ? 'accepted' : 'dismissed',
    shownForDate: String(row.shown_for_date ?? '').slice(0, 10),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function getRecommendationFeedback(userId: string): Promise<RecommendationFeedback[]> {
  const { data, error } = await supabase
    .from('study_recommendation_feedback')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message || 'Failed to load recommendation feedback');
  return (data ?? []).map((row) => rowToFeedback(row as Record<string, unknown>));
}

export async function upsertRecommendationFeedback(
  userId: string,
  feedback: RecommendationFeedback,
): Promise<void> {
  const { error } = await supabase.from('study_recommendation_feedback').upsert({
    user_id: userId,
    recommendation_key: feedback.recommendationKey,
    rule_id: feedback.ruleId,
    related_task_id: feedback.relatedTaskId ?? null,
    status: feedback.status,
    shown_for_date: feedback.shownForDate,
    updated_at: feedback.updatedAt,
  }, { onConflict: 'user_id,recommendation_key' });
  if (error) throw new Error(error.message || 'Failed to save recommendation feedback');
}
