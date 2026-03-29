import { supabase } from './supabase';
import type { Task } from '../types';

const TASKS_TABLE = 'tasks';

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    courseId: String(row.course_id ?? ''),
    type: row.type as Task['type'],
    dueDate: String(row.due_date ?? ''),
    dueTime: String(row.due_time ?? ''),
    priority: row.priority as Task['priority'],
    effort: Number(row.effort_hours ?? 0) || 0,
    notes: String(row.notes ?? ''),
    isDone: Boolean(row.is_done),
    deadlineRisk: (row.deadline_risk as Task['deadlineRisk']) ?? 'Medium',
    suggestedWeek: Number(row.suggested_week ?? 0) || 0,
    sourceMessage: row.source_message != null ? String(row.source_message) : undefined,
  };
}

export async function getTasks(userId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from(TASKS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('due_date', { ascending: true })
    .order('due_time', { ascending: true });

  if (error) {
    return [];
  }

  return (data ?? []).map(rowToTask);
}

export async function upsertTask(
  userId: string,
  task: Task
): Promise<{ error: { message: string; code?: string } | null }> {
  const { error } = await supabase.from(TASKS_TABLE).upsert(
    {
      id: task.id,
      user_id: userId,
      course_id: task.courseId,
      title: task.title,
      type: task.type,
      due_date: task.dueDate,
      due_time: task.dueTime,
      priority: task.priority,
      effort_hours: task.effort,
      notes: task.notes,
      is_done: task.isDone,
      deadline_risk: task.deadlineRisk,
      suggested_week: task.suggestedWeek,
      source_message: task.sourceMessage ?? null,
    },
    { onConflict: 'id,user_id' }
  );
  return { error: error ? { message: error.message, code: error.code } : null };
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  await supabase.from(TASKS_TABLE).delete().eq('user_id', userId).eq('id', taskId);
}


