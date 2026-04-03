import { Priority, TaskType, type Task, type UserProfile } from '../types';
import type { TaskExtractionDTO } from './taskExtraction';
import { getTodayISO, isTaskPastDueNow } from '../utils/date';

type DeadlineRisk = Task['deadlineRisk'];
type FocusReason = 'dueToday' | 'overdue' | 'pinned' | 'tomorrow' | 'upcoming';

function parseISODateStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

function diffDays(fromISO: string, toISO: string): number {
  const from = parseISODateStart(fromISO);
  const to = parseISODateStart(toISO);
  return Math.floor((to.getTime() - from.getTime()) / 864e5);
}

function normalizeTime(value: string | undefined): string {
  if (!value) return '23:59';
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '23:59';
  const hour = Math.min(23, Math.max(0, Number(match[1]) || 0));
  const minute = Math.min(59, Math.max(0, Number(match[2]) || 0));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function createTaskId(): string {
  return `t${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getDeadlineRiskFromDueDate(
  dueDateISO: string,
  todayISO: string = getTodayISO()
): DeadlineRisk {
  const daysUntilDue = diffDays(todayISO, dueDateISO);
  if (daysUntilDue <= 2) return 'High';
  if (daysUntilDue <= 7) return 'Medium';
  return 'Low';
}

export function getPriorityFromDeadlineRisk(risk: DeadlineRisk): Priority {
  if (risk === 'High') return Priority.High;
  if (risk === 'Low') return Priority.Low;
  return Priority.Medium;
}

export function getSuggestedWeekForDueDate(
  dueDateISO: string,
  user: Pick<UserProfile, 'currentWeek' | 'startDate'> | null | undefined,
  /** Prefer academic calendar start when set — same anchor as Semester Pulse / stress map. */
  calendarStart?: string | null,
): number {
  const start = (calendarStart?.trim() || user?.startDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return Math.max(1, user?.currentWeek ?? 1);
  const weekFromStart = Math.ceil((diffDays(start, dueDateISO) + 1) / 7);
  return Math.max(user?.currentWeek ?? 1, weekFromStart || 1);
}

export function normalizeTaskType(rawType: string | undefined): TaskType {
  switch ((rawType ?? '').trim().toLowerCase()) {
    case 'quiz':
      return TaskType.Quiz;
    case 'project':
      return TaskType.Project;
    case 'lab':
      return TaskType.Lab;
    case 'test':
      return TaskType.Test;
    default:
      return TaskType.Assignment;
  }
}

export function normalizeTaskPriority(rawPriority: string | undefined): Priority | null {
  switch ((rawPriority ?? '').trim().toLowerCase()) {
    case 'high':
      return Priority.High;
    case 'medium':
      return Priority.Medium;
    case 'low':
      return Priority.Low;
    default:
      return null;
  }
}

function clampEffort(hours: number | undefined): number {
  if (!Number.isFinite(hours)) return 2;
  return Math.min(20, Math.max(1, Math.round(hours ?? 2)));
}

export function compareTasksByDueDate(a: Task, b: Task): number {
  const dateCompare = a.dueDate.localeCompare(b.dueDate);
  if (dateCompare !== 0) return dateCompare;

  const timeCompare = normalizeTime(a.dueTime).localeCompare(normalizeTime(b.dueTime));
  if (timeCompare !== 0) return timeCompare;

  return a.title.localeCompare(b.title);
}

export function getDaysUntilTaskDue(task: Pick<Task, 'dueDate'>, todayISO: string = getTodayISO()): number {
  return diffDays(todayISO, task.dueDate);
}

export function selectTodaysFocusTask(
  tasks: Task[],
  pinnedTaskIds: string[],
  todayISO: string = getTodayISO()
): { task: Task; reason: FocusReason; daysUntilDue: number } | null {
  const pending = tasks.filter((task) => !task.isDone);
  if (pending.length === 0) return null;

  const pinnedSet = new Set(pinnedTaskIds);

  const bucketFor = (task: Task, daysUntilDue: number): number => {
    if (!task.needsDate && isTaskPastDueNow(task)) return 1;
    if (daysUntilDue === 0) return 0;
    if (daysUntilDue < 0) return 1;
    if (pinnedSet.has(task.id)) return 2;
    if (daysUntilDue === 1) return 3;
    return 4;
  };

  const sorted = [...pending].sort((a, b) => {
    const daysA = getDaysUntilTaskDue(a, todayISO);
    const daysB = getDaysUntilTaskDue(b, todayISO);
    const bucketDelta = bucketFor(a, daysA) - bucketFor(b, daysB);
    if (bucketDelta !== 0) return bucketDelta;

    if (daysA < 0 && daysB < 0 && daysA !== daysB) {
      return daysB - daysA;
    }

    return compareTasksByDueDate(a, b);
  });

  const task = sorted[0];
  const daysUntilDue = getDaysUntilTaskDue(task, todayISO);

  if (!task.needsDate && isTaskPastDueNow(task)) {
    return { task, reason: 'overdue', daysUntilDue };
  }
  if (daysUntilDue === 0) return { task, reason: 'dueToday', daysUntilDue };
  if (daysUntilDue < 0) return { task, reason: 'overdue', daysUntilDue };
  if (pinnedSet.has(task.id)) return { task, reason: 'pinned', daysUntilDue };
  if (daysUntilDue === 1) return { task, reason: 'tomorrow', daysUntilDue };
  return { task, reason: 'upcoming', daysUntilDue };
}

export function buildTaskFromExtraction(
  extracted: TaskExtractionDTO,
  options: {
    fallbackCourseId: string;
    user: Pick<UserProfile, 'currentWeek' | 'startDate'> | null | undefined;
    calendarStart?: string | null;
    sourceMessage?: string;
  }
): Task {
  const dueDate = extracted.due_date || getTodayISO();
  const deadlineRisk =
    extracted.deadline_risk === 'High' || extracted.deadline_risk === 'Medium' || extracted.deadline_risk === 'Low'
      ? extracted.deadline_risk
      : getDeadlineRiskFromDueDate(dueDate);
  const suggestedWeek =
    typeof extracted.suggested_week === 'number' && extracted.suggested_week > 0
      ? extracted.suggested_week
      : getSuggestedWeekForDueDate(dueDate, options.user, options.calendarStart);

  return {
    id: createTaskId(),
    title: extracted.title.trim() || 'Task',
    courseId: extracted.course_id || options.fallbackCourseId,
    type: normalizeTaskType(extracted.type),
    dueDate,
    dueTime: normalizeTime(extracted.due_time),
    notes: extracted.notes ?? '',
    isDone: false,
    deadlineRisk,
    suggestedWeek,
    sourceMessage: options.sourceMessage,
    needsDate: extracted.needs_date || extracted.is_inferred_date || false,
  };
}
