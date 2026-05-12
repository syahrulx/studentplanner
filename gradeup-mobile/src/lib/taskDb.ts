import { supabase } from './supabase';
import type { Task } from '../types';
import { getTodayISO } from '../utils/date';

const TASKS_TABLE = 'tasks';

function rowToTask(row: Record<string, unknown>): Task {
  const id = String(row.id);
  const needsDate = Boolean(row.needs_date);
  const dueDate = needsDate ? getTodayISO() : String(row.due_date ?? getTodayISO());
  const rawRepeat = row.repeat_days;
  const repeatDays = Array.isArray(rawRepeat)
    ? (rawRepeat as unknown[])
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [];
  return {
    id,
    title: String(row.title ?? ''),
    courseId: String(row.course_id ?? ''),
    type: row.type as Task['type'],
    dueDate,
    dueTime: String(row.due_time ?? ''),
    notes: String(row.notes ?? ''),
    isDone: Boolean(row.is_done),
    deadlineRisk:
      row.deadline_risk == null
        ? undefined
        : ((row.deadline_risk as Task['deadlineRisk']) ?? 'Medium'),
    suggestedWeek:
      row.suggested_week == null ? undefined : Number(row.suggested_week ?? 0) || 0,
    sourceMessage: row.source_message != null ? String(row.source_message) : undefined,
    needsDate,
    repeatDays: repeatDays.length > 0 ? repeatDays : undefined,
    repeatNotify: row.repeat_notify == null ? undefined : Boolean(row.repeat_notify),
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
  // Normalize / dedupe repeat days; empty array means "not recurring".
  const repeatDays = Array.isArray(task.repeatDays)
    ? Array.from(new Set(task.repeatDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort()
    : [];
  const { error } = await supabase.from(TASKS_TABLE).upsert(
    {
      id: task.id,
      user_id: userId,
      course_id: task.courseId,
      title: task.title,
      type: task.type,
      due_date: task.dueDate,
      needs_date: task.needsDate ?? false,
      due_time: task.dueTime,
      notes: task.notes,
      is_done: task.isDone,
      deadline_risk: task.deadlineRisk ?? null,
      suggested_week: task.suggestedWeek ?? null,
      source_message: task.sourceMessage ?? null,
      repeat_days: repeatDays,
      repeat_notify: repeatDays.length > 0 ? Boolean(task.repeatNotify) : false,
    },
    { onConflict: 'id,user_id' }
  );
  return { error: error ? { message: error.message, code: error.code } : null };
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  await supabase.from(TASKS_TABLE).delete().eq('user_id', userId).eq('id', taskId);
}

export async function deleteAllTasksForUser(userId: string): Promise<void> {
  const { error } = await supabase.from(TASKS_TABLE).delete().eq('user_id', userId);
  if (error) throw new Error(error.message || 'Failed to delete tasks');
}

// ── Per-occurrence completion (recurring tasks) ────────────────────────────

/** "<taskId>:<YYYY-MM-DD>" — used as a Set key in the app. */
export type TaskCompletionKey = string;

export function makeCompletionKey(taskId: string, occurrenceDateISO: string): TaskCompletionKey {
  return `${taskId}:${occurrenceDateISO}`;
}

/** Fetch every (taskId, date) the user has marked done across all recurring tasks. */
export async function getTaskCompletions(userId: string): Promise<TaskCompletionKey[]> {
  const { data, error } = await supabase
    .from('task_completions')
    .select('task_id, occurrence_date')
    .eq('user_id', userId);
  if (error || !data) return [];
  return data.map((r: { task_id: string; occurrence_date: string }) =>
    makeCompletionKey(String(r.task_id), String(r.occurrence_date)),
  );
}

export async function markTaskDoneOnDate(
  userId: string,
  taskId: string,
  occurrenceDateISO: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from('task_completions').upsert(
    {
      task_id: taskId,
      user_id: userId,
      occurrence_date: occurrenceDateISO,
    },
    { onConflict: 'task_id,user_id,occurrence_date' },
  );
  return { error: error ? { message: error.message } : null };
}

export async function unmarkTaskDoneOnDate(
  userId: string,
  taskId: string,
  occurrenceDateISO: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from('task_completions')
    .delete()
    .eq('task_id', taskId)
    .eq('user_id', userId)
    .eq('occurrence_date', occurrenceDateISO);
  return { error: error ? { message: error.message } : null };
}

