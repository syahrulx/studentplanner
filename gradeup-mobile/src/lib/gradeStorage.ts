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
import type { SubjectGradeConfig, GradingScheme, GradeAssessment } from '../types';

const TABLE = 'subject_grade_configs';
const LOCAL_KEY = (subjectId: string) => `gradeConfig_v1_${subjectId}`;

// ─── Serialise / Deserialise ───────────────────────────────────────────────────

function configToRow(userId: string, c: SubjectGradeConfig) {
  return {
    user_id:              userId,
    subject_id:           c.subjectId,
    grading_scheme:       c.gradingScheme,
    has_final_exam:       c.hasFinalExam,
    carry_weight:         c.carryWeight,
    final_weight:         c.finalWeight,
    assessments:          c.assessments,
    final_exam_scored:    c.finalExamScored,
    final_exam_max_score: c.finalExamMaxScore,
  };
}

function rowToConfig(row: Record<string, unknown>): SubjectGradeConfig {
  return {
    subjectId:        String(row.subject_id ?? ''),
    gradingScheme:    (row.grading_scheme as GradingScheme) ?? 'uitm',
    hasFinalExam:     Boolean(row.has_final_exam ?? true),
    carryWeight:      Number(row.carry_weight ?? 40),
    finalWeight:      Number(row.final_weight ?? 60),
    assessments:      Array.isArray(row.assessments)
      ? (row.assessments as GradeAssessment[])
      : [],
    finalExamScored:    row.final_exam_scored != null ? Number(row.final_exam_scored) : null,
    finalExamMaxScore:  Number(row.final_exam_max_score ?? 100),
  };
}

// ─── Local cache helpers ───────────────────────────────────────────────────────

async function saveLocal(config: SubjectGradeConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCAL_KEY(config.subjectId), JSON.stringify(config));
  } catch {}
}

async function loadLocal(subjectId: string): Promise<SubjectGradeConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY(subjectId));
    if (!raw) return null;
    return JSON.parse(raw) as SubjectGradeConfig;
  } catch {
    return null;
  }
}

async function deleteLocal(subjectId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(LOCAL_KEY(subjectId));
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
  // 1. Try Supabase
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('subject_id', subjectId)
      .maybeSingle();

    if (!error && data) {
      const config = rowToConfig(data as Record<string, unknown>);
      void saveLocal(config); // keep cache warm
      return config;
    }
  } catch {}

  // 2. Fall back to local
  return loadLocal(subjectId);
}

/**
 * Upsert (save or update) a grade config.
 * Writes to Supabase and mirrors to AsyncStorage.
 */
export async function saveSubjectGradeConfig(
  userId: string,
  config: SubjectGradeConfig,
): Promise<{ error: string | null }> {
  // Always save locally first for instant UI feedback
  await saveLocal(config);

  try {
    const { error } = await supabase
      .from(TABLE)
      .upsert(configToRow(userId, config), { onConflict: 'user_id,subject_id' });

    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e?.message ?? 'Unknown error' };
  }
}

/**
 * Delete grade config for a subject (e.g. when subject is deleted).
 */
export async function deleteSubjectGradeConfig(
  userId: string,
  subjectId: string,
): Promise<void> {
  await deleteLocal(subjectId);
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
      return (data as Record<string, unknown>[]).map(rowToConfig);
    }
  } catch {}
  return [];
}
