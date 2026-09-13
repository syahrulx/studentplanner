import type {
  GradeAssessment,
  GradingScheme,
  SubjectGradeConfig,
} from '../types';

export function gradeConfigLocalKey(userId: string, subjectId: string): string {
  return `gradeConfig_v2_${userId}_${subjectId}`;
}

/**
 * Storage limits from `subject_grade_configs`:
 *   final_exam_scored    numeric(7,2)  -- nullable
 *   final_exam_max_score numeric(7,2)  -- not null default 100
 *   carry_weight         numeric(5,2)  -- not null, documented as a 0-100 split
 *   final_weight         numeric(5,2)  -- not null, documented as a 0-100 split
 *
 * Postgres rejects anything wider with "numeric field overflow", which PostgREST
 * returns as a 400. That matters more than a normal validation slip: the edit is
 * already committed to the local cache, so the pending-write retry loop resends
 * the same unstorable row every few seconds — forever, across restarts, since the
 * cached copy is re-uploaded on load. Clamping here (the single chokepoint into
 * the table) also un-sticks anyone already stuck in that loop.
 */
const MAX_SCORE = 99999.99;

function clampScore(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(MAX_SCORE, Math.max(-MAX_SCORE, value));
}

function clampWeight(value: number | null | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, value));
}

export function gradeConfigToRow(userId: string, config: SubjectGradeConfig) {
  return {
    user_id: userId,
    subject_id: config.subjectId,
    client_updated_at: config.updatedAt ?? null,
    grading_scheme: config.gradingScheme,
    custom_grade_rows: config.customGradeRows ?? [],
    has_final_exam: config.hasFinalExam,
    carry_weight: clampWeight(config.carryWeight, 40),
    final_weight: clampWeight(config.finalWeight, 60),
    assessments: config.assessments,
    final_exam_scored: clampScore(config.finalExamScored),
    // NOT NULL: a non-finite value must fall back, not become null.
    final_exam_max_score: clampScore(config.finalExamMaxScore) ?? 100,
  };
}

export function gradeRowToConfig(row: Record<string, unknown>): SubjectGradeConfig {
  return {
    subjectId: String(row.subject_id ?? ''),
    updatedAt:
      row.client_updated_at != null ? String(row.client_updated_at) : undefined,
    gradingScheme: (row.grading_scheme as GradingScheme) ?? 'uitm',
    customGradeRows: Array.isArray(row.custom_grade_rows)
      ? (row.custom_grade_rows as SubjectGradeConfig['customGradeRows'])
      : [],
    hasFinalExam: Boolean(row.has_final_exam ?? true),
    carryWeight: Number(row.carry_weight ?? 40),
    finalWeight: Number(row.final_weight ?? 60),
    assessments: Array.isArray(row.assessments)
      ? (row.assessments as GradeAssessment[])
      : [],
    finalExamScored:
      row.final_exam_scored != null ? Number(row.final_exam_scored) : null,
    finalExamMaxScore: Number(row.final_exam_max_score ?? 100),
  };
}
