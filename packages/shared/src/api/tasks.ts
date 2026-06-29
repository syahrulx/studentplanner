import type { SupabaseClient } from '@supabase/supabase-js';
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
    excludeFromFocus: Boolean(row.hide_from_focus),
    excludeFromPulse: Boolean(row.hide_from_pulse),
  };
}

export async function getTasks(supabase: SupabaseClient, userId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from(TASKS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('due_date', { ascending: true })
    .order('due_time', { ascending: true });

  if (error) return [];
  return (data ?? []).map((row) => rowToTask(row as Record<string, unknown>));
}

export async function upsertTask(
  supabase: SupabaseClient,
  userId: string,
  task: Task,
): Promise<{ error: { message: string; code?: string } | null }> {
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
      hide_from_focus: Boolean(task.excludeFromFocus),
      hide_from_pulse: Boolean(task.excludeFromPulse),
    },
    { onConflict: 'id,user_id' },
  );
  return { error: error ? { message: error.message, code: error.code } : null };
}

export async function deleteTask(supabase: SupabaseClient, userId: string, taskId: string): Promise<void> {
  await supabase.from(TASKS_TABLE).delete().eq('user_id', userId).eq('id', taskId);
}

export function createTaskId(): string {
  return `t${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
