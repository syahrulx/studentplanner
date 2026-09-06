import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Flashcard, Note, Task } from '../types';
import * as studyDb from './studyDb';
import * as taskDb from './taskDb';
import { deleteHandwritingRemote } from './handwritingDb';
import * as recommendationDb from './recommendationDb';
import type { RecommendationFeedback } from './recommendationDb';
import type { ReviewLogRow } from './fsrs';

const OUTBOX_KEY = 'rencana.offline-sync.outbox.v1';
const TASK_CACHE_PREFIX = 'rencana.offline-sync.tasks.v1';
const NOTE_CACHE_PREFIX = 'rencana.offline-sync.notes.v1';
const COMPLETION_CACHE_PREFIX = 'rencana.offline-sync.completions.v1';
const RECOMMENDATION_CACHE_PREFIX = 'rencana.offline-sync.recommendations.v1';
const FLASHCARD_CACHE_PREFIX = 'rencana.offline-sync.flashcards.v1';

type OfflineOperation =
  | 'task_upsert'
  | 'task_delete'
  | 'task_completion_set'
  | 'breakdown_completion_set'
  | 'note_upsert'
  | 'note_delete'
  | 'recommendation_feedback_upsert'
  | 'flashcard_upsert'
  | 'flashcard_delete'
  | 'flashcard_review_log';

interface OfflineSyncItem {
  id: string;
  key: string;
  userId: string;
  operation: OfflineOperation;
  entityId: string;
  payload: unknown;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

export interface OfflineSyncStatus {
  userId: string | null;
  pendingCount: number;
  syncing: boolean;
  lastError: string | null;
  lastSyncedAt: string | null;
}

type StatusListener = (status: OfflineSyncStatus) => void;

const listeners = new Set<StatusListener>();
let storageQueue: Promise<void> = Promise.resolve();
let cacheWriteQueue: Promise<void> = Promise.resolve();
const activeFlushes = new Map<string, Promise<OfflineSyncStatus>>();
let currentStatus: OfflineSyncStatus = {
  userId: null,
  pendingCount: 0,
  syncing: false,
  lastError: null,
  lastSyncedAt: null,
};

function taskCacheKey(userId: string): string {
  return `${TASK_CACHE_PREFIX}:${userId}`;
}

function noteCacheKey(userId: string): string {
  return `${NOTE_CACHE_PREFIX}:${userId}`;
}

function completionCacheKey(userId: string): string {
  return `${COMPLETION_CACHE_PREFIX}:${userId}`;
}

function flashcardCacheKey(userId: string): string {
  return `${FLASHCARD_CACHE_PREFIX}:${userId}`;
}

function recommendationCacheKey(userId: string): string {
  return `${RECOMMENDATION_CACHE_PREFIX}:${userId}`;
}

function operationKey(operation: OfflineOperation, entityId: string): string {
  const domain = operation.startsWith('task_completion')
    ? 'task_completion'
    : operation.startsWith('breakdown_completion')
      ? 'breakdown_completion'
    : operation.startsWith('task_')
      ? 'task'
      : operation.startsWith('note_')
        ? 'note'
        : 'recommendation';
  return `${domain}:${entityId}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error || 'Sync failed');
}

async function readOutbox(): Promise<OfflineSyncItem[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is OfflineSyncItem => (
      item &&
      typeof item.id === 'string' &&
      typeof item.key === 'string' &&
      typeof item.userId === 'string' &&
      typeof item.operation === 'string' &&
      typeof item.entityId === 'string' &&
      typeof item.queuedAt === 'string'
    ));
  } catch {
    return [];
  }
}

async function writeOutbox(items: OfflineSyncItem[]): Promise<void> {
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

async function mutateOutbox(
  mutate: (items: OfflineSyncItem[]) => OfflineSyncItem[],
): Promise<OfflineSyncItem[]> {
  let result: OfflineSyncItem[] = [];
  storageQueue = storageQueue.catch(() => {}).then(async () => {
    result = mutate(await readOutbox());
    await writeOutbox(result);
  });
  await storageQueue;
  return result;
}

function emit(status: OfflineSyncStatus): OfflineSyncStatus {
  currentStatus = status;
  listeners.forEach((listener) => listener(status));
  return status;
}

async function statusForUser(
  userId: string,
  patch: Partial<OfflineSyncStatus> = {},
): Promise<OfflineSyncStatus> {
  const items = await readOutbox();
  return emit({
    ...currentStatus,
    userId,
    pendingCount: items.filter((item) => item.userId === userId).length,
    ...patch,
  });
}

async function enqueue(
  userId: string,
  operation: OfflineOperation,
  entityId: string,
  payload: unknown,
): Promise<void> {
  const key = operationKey(operation, entityId);
  const item: OfflineSyncItem = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    key,
    userId,
    operation,
    entityId,
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  const items = await mutateOutbox((current) => [
    ...current.filter((candidate) => !(candidate.userId === userId && candidate.key === key)),
    item,
  ]);
  emit({
    ...currentStatus,
    userId,
    pendingCount: items.filter((candidate) => candidate.userId === userId).length,
    lastError: null,
  });
}

async function readCache<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

async function writeCache<T>(key: string, rows: T[]): Promise<void> {
  cacheWriteQueue = cacheWriteQueue.catch(() => {}).then(() => (
    AsyncStorage.setItem(key, JSON.stringify(rows))
  ));
  await cacheWriteQueue;
}

export async function cacheTasks(userId: string, tasks: Task[]): Promise<void> {
  await writeCache(taskCacheKey(userId), tasks);
}

export async function loadCachedTasks(userId: string): Promise<Task[]> {
  return readCache<Task>(taskCacheKey(userId));
}

export async function cacheNotes(userId: string, notes: Note[]): Promise<void> {
  await writeCache(noteCacheKey(userId), notes);
}

export async function loadCachedNotes(userId: string): Promise<Note[]> {
  return readCache<Note>(noteCacheKey(userId));
}

export async function cacheTaskCompletions(userId: string, keys: string[]): Promise<void> {
  await writeCache(completionCacheKey(userId), keys);
}

export async function loadCachedTaskCompletions(userId: string): Promise<string[]> {
  return readCache<string>(completionCacheKey(userId));
}

export async function cacheRecommendationFeedback(userId: string, rows: RecommendationFeedback[]): Promise<void> {
  await writeCache(recommendationCacheKey(userId), rows);
}

export async function loadCachedRecommendationFeedback(userId: string): Promise<RecommendationFeedback[]> {
  return readCache<RecommendationFeedback>(recommendationCacheKey(userId));
}

export async function queueTaskUpsert(userId: string, task: Task): Promise<void> {
  await enqueue(userId, 'task_upsert', task.id, task);
}

export async function queueTaskDelete(userId: string, taskId: string): Promise<void> {
  await enqueue(userId, 'task_delete', taskId, { taskId });
}

export async function queueTaskCompletion(
  userId: string,
  taskId: string,
  occurrenceDate: string,
  done: boolean,
): Promise<void> {
  await enqueue(userId, 'task_completion_set', `${taskId}:${occurrenceDate}`, {
    taskId,
    occurrenceDate,
    done,
  });
}

export async function queueBreakdownCompletion(
  userId: string,
  taskId: string,
  done: boolean,
): Promise<void> {
  await enqueue(userId, 'breakdown_completion_set', taskId, { taskId, done });
}

export async function queueNoteUpsert(userId: string, note: Note): Promise<void> {
  await enqueue(userId, 'note_upsert', note.id, note);
}

export async function queueNoteDelete(userId: string, noteId: string): Promise<void> {
  await enqueue(userId, 'note_delete', noteId, { noteId });
}

/**
 * Flashcard reviews are the one study action that needs no server to be useful:
 * FSRS runs on the device, and only the result needs saving. Queuing them means
 * a session on a commute still counts once signal returns, instead of a banner
 * saying the rating was not recorded.
 */
export async function queueFlashcardUpsert(userId: string, card: Flashcard): Promise<void> {
  await enqueue(userId, 'flashcard_upsert', card.id, card);
}

export async function queueFlashcardDelete(userId: string, cardId: string): Promise<void> {
  await enqueue(userId, 'flashcard_delete', cardId, null);
}

/**
 * Keyed by the review's own id rather than the card's, because a card reviewed
 * three times offline produced three distinct log rows. Keying by card would
 * collapse them into one and lose the history.
 */
export async function queueFlashcardReviewLog(userId: string, row: ReviewLogRow): Promise<void> {
  await enqueue(userId, 'flashcard_review_log', `${row.card_id}:${row.review_at}`, row);
}

export async function cacheFlashcards(userId: string, cards: Flashcard[]): Promise<void> {
  await writeCache(flashcardCacheKey(userId), cards);
}

export async function loadCachedFlashcards(userId: string): Promise<Flashcard[]> {
  return readCache<Flashcard>(flashcardCacheKey(userId));
}

/** Apply queued card writes over the server copy, newest queued write winning. */
export async function mergePendingFlashcards(userId: string, remote: Flashcard[]): Promise<Flashcard[]> {
  const items = (await readOutbox())
    .filter((item) => item.userId === userId && (item.operation === 'flashcard_upsert' || item.operation === 'flashcard_delete'))
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  const merged = new Map(remote.map((card) => [card.id, card]));
  items.forEach((item) => {
    if (item.operation === 'flashcard_delete') merged.delete(item.entityId);
    else merged.set(item.entityId, item.payload as Flashcard);
  });
  return [...merged.values()];
}

export async function queueRecommendationFeedback(
  userId: string,
  feedback: RecommendationFeedback,
): Promise<void> {
  await enqueue(userId, 'recommendation_feedback_upsert', feedback.recommendationKey, feedback);
}

export async function mergePendingRecommendationFeedback(
  userId: string,
  remote: RecommendationFeedback[],
): Promise<RecommendationFeedback[]> {
  const items = (await readOutbox())
    .filter((item) => item.userId === userId && item.operation === 'recommendation_feedback_upsert')
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  const merged = new Map(remote.map((feedback) => [feedback.recommendationKey, feedback]));
  items.forEach((item) => merged.set(item.entityId, item.payload as RecommendationFeedback));
  return [...merged.values()];
}

export async function mergePendingTasks(userId: string, remote: Task[]): Promise<Task[]> {
  const items = (await readOutbox())
    .filter((item) => item.userId === userId && (
      item.operation === 'task_upsert' ||
      item.operation === 'task_delete' ||
      item.operation === 'breakdown_completion_set'
    ))
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  const merged = new Map(remote.map((task) => [task.id, task]));
  items.forEach((item) => {
    if (item.operation === 'task_delete') merged.delete(item.entityId);
    else if (item.operation === 'breakdown_completion_set') {
      const existing = merged.get(item.entityId);
      if (existing) {
        const payload = item.payload as { done?: boolean };
        merged.set(item.entityId, { ...existing, isDone: Boolean(payload.done) });
      }
    } else merged.set(item.entityId, item.payload as Task);
  });
  return [...merged.values()];
}

export async function mergePendingNotes(userId: string, remote: Note[]): Promise<Note[]> {
  const items = (await readOutbox())
    .filter((item) => item.userId === userId && (item.operation === 'note_upsert' || item.operation === 'note_delete'))
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  const merged = new Map(remote.map((note) => [note.id, note]));
  items.forEach((item) => {
    if (item.operation === 'note_delete') merged.delete(item.entityId);
    else merged.set(item.entityId, item.payload as Note);
  });
  return [...merged.values()];
}

export async function mergePendingTaskCompletions(userId: string, remote: string[]): Promise<string[]> {
  const items = (await readOutbox())
    .filter((item) => item.userId === userId && item.operation === 'task_completion_set')
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  const merged = new Set(remote);
  items.forEach((item) => {
    const payload = item.payload as { done?: boolean };
    if (payload.done) merged.add(item.entityId);
    else merged.delete(item.entityId);
  });
  return [...merged];
}

async function execute(item: OfflineSyncItem): Promise<void> {
  if (item.operation === 'task_upsert') {
    const { error } = await taskDb.upsertTask(item.userId, item.payload as Task);
    if (error) {
      const task = item.payload as Task;
      // Upgrade completion writes queued by older builds. Those builds used a
      // full-row upsert, so an unrelated stale assignee could permanently
      // block a completed breakdown step. Only recover already-completed
      // steps; other validation failures remain visible to the user.
      if (
        item.attempts > 0 &&
        task.parentTaskId &&
        task.isDone === true &&
        error.message.includes('Assignee is not an accepted member')
      ) {
        const completion = await taskDb.setBreakdownStepCompletion(task.id, true);
        if (!completion.error) return;
      }
      throw new Error(error.message);
    }
    return;
  }
  if (item.operation === 'task_delete') {
    await taskDb.deleteTask(item.userId, item.entityId);
    return;
  }
  if (item.operation === 'task_completion_set') {
    const payload = item.payload as { taskId: string; occurrenceDate: string; done: boolean };
    const { error } = payload.done
      ? await taskDb.markTaskDoneOnDate(item.userId, payload.taskId, payload.occurrenceDate)
      : await taskDb.unmarkTaskDoneOnDate(item.userId, payload.taskId, payload.occurrenceDate);
    if (error) throw new Error(error.message);
    return;
  }
  if (item.operation === 'breakdown_completion_set') {
    const payload = item.payload as { taskId: string; done: boolean };
    const { error } = await taskDb.setBreakdownStepCompletion(payload.taskId, payload.done);
    if (error) throw new Error(error.message);
    return;
  }
  if (item.operation === 'note_upsert') {
    await studyDb.upsertNote(item.userId, item.payload as Note);
    return;
  }
  if (item.operation === 'flashcard_upsert') {
    await studyDb.upsertFlashcard(item.userId, item.payload as Flashcard);
    return;
  }
  if (item.operation === 'flashcard_delete') {
    await studyDb.deleteFlashcard(item.userId, item.entityId);
    return;
  }
  if (item.operation === 'flashcard_review_log') {
    // The log feeds FSRS parameter tuning, not the schedule itself, so a lost
    // row costs accuracy later rather than correctness now. Never fail the
    // queue over one: the card write that matters already succeeded.
    try {
      await studyDb.insertFlashcardReview(item.userId, item.payload as ReviewLogRow);
    } catch (e) {
      if (__DEV__) console.warn('[OfflineSync] review log dropped:', e);
    }
    return;
  }
  if (item.operation === 'recommendation_feedback_upsert') {
    await recommendationDb.upsertRecommendationFeedback(item.userId, item.payload as RecommendationFeedback);
    return;
  }
  await studyDb.deleteNote(item.userId, item.entityId);
  await studyDb.deleteFlashcardsForNote(item.userId, item.entityId);
  await deleteHandwritingRemote(item.userId, item.entityId);
}

export async function flushOfflineSync(userId: string): Promise<OfflineSyncStatus> {
  const existing = activeFlushes.get(userId);
  if (existing) return existing;
  const flush = (async () => {
    await statusForUser(userId, { syncing: true, lastError: null });
    const snapshot = (await readOutbox())
      .filter((item) => item.userId === userId)
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
    let lastError: string | null = null;
    for (const item of snapshot) {
      try {
        await execute(item);
        await mutateOutbox((current) => current.filter((candidate) => candidate.id !== item.id));
      } catch (error) {
        lastError = errorMessage(error);
        await mutateOutbox((current) => current.map((candidate) => candidate.id === item.id ? {
          ...candidate,
          attempts: candidate.attempts + 1,
          lastError: lastError ?? undefined,
        } : candidate));
      }
    }
    return statusForUser(userId, {
      syncing: false,
      lastError,
      lastSyncedAt: lastError ? currentStatus.lastSyncedAt : new Date().toISOString(),
    });
  })();
  activeFlushes.set(userId, flush);
  try {
    return await flush;
  } finally {
    activeFlushes.delete(userId);
  }
}

export async function getOfflineSyncStatus(userId: string): Promise<OfflineSyncStatus> {
  return statusForUser(userId, { syncing: activeFlushes.has(userId) });
}

export function subscribeOfflineSync(listener: StatusListener): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}
