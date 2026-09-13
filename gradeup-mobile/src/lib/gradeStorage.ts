/**
 * Grade config persistence layer.
 *
 * Strategy:
 *   1. Read/write to Supabase (`subject_grade_configs` table) as source of truth.
 *   2. Mirror to AsyncStorage as local cache (offline support).
 *   3. On load: try Supabase first, fall back to AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { SubjectGradeConfig } from '../types';
import { captureError, isTransientNetworkError } from './monitoring';
import {
  gradeConfigLocalKey,
  gradeConfigToRow,
  gradeRowToConfig,
} from './gradeConfigCodec';

const TABLE = 'subject_grade_configs';
// ─── Local cache helpers ───────────────────────────────────────────────────────

export async function cacheSubjectGradeConfig(
  userId: string,
  config: SubjectGradeConfig,
): Promise<void> {
  try {
    await AsyncStorage.setItem(gradeConfigLocalKey(userId, config.subjectId), JSON.stringify(config));
  } catch (error) {
    captureError(error, { operation: 'grade_config_cache_write' });
  }
}

async function loadLocal(userId: string, subjectId: string): Promise<SubjectGradeConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(gradeConfigLocalKey(userId, subjectId));
    if (!raw) return null;
    return JSON.parse(raw) as SubjectGradeConfig;
  } catch {
    return null;
  }
}

async function deleteLocal(userId: string, subjectId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(gradeConfigLocalKey(userId, subjectId));
  } catch {}
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load grade config for a subject.
 * Tries Supabase first; falls back to local cache on network error.
 */
export async function getSubjectGradeConfig(
  userId: string,
  subjectId: string,
): Promise<SubjectGradeConfig | null> {
  const local = await loadLocal(userId, subjectId);

  // Compare the cloud copy with the durable local copy. A newer offline edit
  // must win after restart and will be retried in the background.
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('subject_id', subjectId)
      .maybeSingle();

    if (!error) {
      if (data) {
        const config = gradeRowToConfig(data as Record<string, unknown>);
        const localEdited = Date.parse(local?.updatedAt ?? '') || 0;
        const remoteEdited = Date.parse(config.updatedAt ?? '') || 0;
        if (local && localEdited > remoteEdited) {
          await saveSubjectGradeConfig(userId, local);
          return local;
        }
        void cacheSubjectGradeConfig(userId, config); // keep cache warm
        return config;
      }

      // A successful online lookup with no row means this configuration only
      // exists in the durable offline cache. Upload it now instead of waiting
      // for another edit that may never happen.
      if (local) await saveSubjectGradeConfig(userId, local);
    }
  } catch {}

  return local;
}

/**
 * Upsert (save or update) a grade config.
 * Writes to Supabase and mirrors to AsyncStorage.
 */
/**
 * `permanent` means the server answered and rejected the row (bad payload, RLS,
 * a constraint). Resending identical bytes cannot succeed, so callers must stop
 * retrying and surface the failure instead of looping.
 */
export async function saveSubjectGradeConfig(
  userId: string,
  config: SubjectGradeConfig,
): Promise<{ error: string | null; permanent: boolean }> {
  // Always save locally first for instant UI feedback
  await cacheSubjectGradeConfig(userId, config);

  try {
    const { error } = await supabase
      .from(TABLE)
      .upsert(gradeConfigToRow(userId, config), { onConflict: 'user_id,subject_id' });

    if (error) {
      // The edit is already durable in AsyncStorage and the caller retries the
      // network mirror (on reconnect and on a timer), so a dropped request is
      // an expected state, not something to page anyone about.
      const transient = isTransientNetworkError(error);
      if (!transient) {
        captureError(error, { operation: 'grade_config_remote_write' });
      }
      return { error: error.message, permanent: !transient };
    }
    return { error: null, permanent: false };
  } catch (e: any) {
    const transient = isTransientNetworkError(e);
    if (!transient) {
      captureError(e, { operation: 'grade_config_remote_write' });
    }
    return { error: e?.message ?? 'Unknown error', permanent: !transient };
  }
}

/**
 * Delete grade config for a subject (e.g. when subject is deleted).
 */
export async function deleteSubjectGradeConfig(
  userId: string,
  subjectId: string,
): Promise<void> {
  await deleteLocal(userId, subjectId);
  try {
    await supabase
      .from(TABLE)
      .delete()
      .eq('user_id', userId)
      .eq('subject_id', subjectId);
  } catch {}
}

/**
 * Load grade configs for all subjects in a single call (for a potential GPA summary).
 */
export async function getAllSubjectGradeConfigs(
  userId: string,
): Promise<SubjectGradeConfig[]> {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId);

    if (!error && data) {
      return (data as Record<string, unknown>[]).map(gradeRowToConfig);
    }
  } catch {}
  return [];
}
