import type {
  GradeAssessment,
  GradingScheme,
  SubjectGradeConfig,
} from '../types';

export function gradeConfigLocalKey(userId: string, subjectId: string): string {
  return `gradeConfig_v2_${userId}_${subjectId}`;
}

export function gradeConfigToRow(userId: string, config: SubjectGradeConfig) {
  return {
    user_id: userId,
    subject_id: config.subjectId,
    client_updated_at: config.updatedAt ?? null,
    grading_scheme: config.gradingScheme,
    custom_grade_rows: config.customGradeRows ?? [],
    has_final_exam: config.hasFinalExam,
    carry_weight: config.carryWeight,
    final_weight: config.finalWeight,
    assessments: config.assessments,
    final_exam_scored: config.finalExamScored,
    final_exam_max_score: config.finalExamMaxScore,
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
