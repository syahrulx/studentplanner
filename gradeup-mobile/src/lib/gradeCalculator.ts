/**
 * Grade Calculator Engine
 *
 * Supports multiple grading schemes:
 *   - 'uitm'      : UiTM Malaysia official 13-grade table
 *   - 'generic_4' : Common 4.0 GPA scale (many international universities)
 *   - 'generic_5' : Generic 5.0 GPA scale
 *
 * All calculations are pure functions — no side effects, fully testable.
 */

import type {
  GradeAssessment,
  GradeRow,
  GradeResult,
  GradingScheme,
  SubjectGradeConfig,
} from '../types';

// ─── Grade Tables ──────────────────────────────────────────────────────────────

/** UiTM Malaysia official grading table (Academic Regulations 2019). */
export const UITM_GRADE_TABLE: GradeRow[] = [
  { letter: 'A+',  minPercent: 90, maxPercent: 100, point: 4.00 },
  { letter: 'A',   minPercent: 80, maxPercent: 89,  point: 4.00 },
  { letter: 'A-',  minPercent: 75, maxPercent: 79,  point: 3.67 },
  { letter: 'B+',  minPercent: 70, maxPercent: 74,  point: 3.33 },
  { letter: 'B',   minPercent: 65, maxPercent: 69,  point: 3.00 },
  { letter: 'B-',  minPercent: 60, maxPercent: 64,  point: 2.67 },
  { letter: 'C+',  minPercent: 55, maxPercent: 59,  point: 2.33 },
  { letter: 'C',   minPercent: 50, maxPercent: 54,  point: 2.00 },
  { letter: 'C-',  minPercent: 47, maxPercent: 49,  point: 1.67 },
  { letter: 'D+',  minPercent: 44, maxPercent: 46,  point: 1.33 },
  { letter: 'D',   minPercent: 40, maxPercent: 43,  point: 1.00 },
  { letter: 'E',   minPercent: 30, maxPercent: 39,  point: 0.67 },
  { letter: 'F',   minPercent: 0,  maxPercent: 29,  point: 0.00 },
];

/** Generic 4.0 GPA scale used by many universities worldwide. */
export const GENERIC_4_GRADE_TABLE: GradeRow[] = [
  { letter: 'A',  minPercent: 90, maxPercent: 100, point: 4.00 },
  { letter: 'A-', minPercent: 85, maxPercent: 89,  point: 3.70 },
  { letter: 'B+', minPercent: 80, maxPercent: 84,  point: 3.30 },
  { letter: 'B',  minPercent: 75, maxPercent: 79,  point: 3.00 },
  { letter: 'B-', minPercent: 70, maxPercent: 74,  point: 2.70 },
  { letter: 'C+', minPercent: 65, maxPercent: 69,  point: 2.30 },
  { letter: 'C',  minPercent: 60, maxPercent: 64,  point: 2.00 },
  { letter: 'C-', minPercent: 55, maxPercent: 59,  point: 1.70 },
  { letter: 'D',  minPercent: 50, maxPercent: 54,  point: 1.00 },
  { letter: 'F',  minPercent: 0,  maxPercent: 49,  point: 0.00 },
];

/** Generic 5.0 GPA scale. */
export const GENERIC_5_GRADE_TABLE: GradeRow[] = [
  { letter: 'A',  minPercent: 90, maxPercent: 100, point: 5.00 },
  { letter: 'A-', minPercent: 85, maxPercent: 89,  point: 4.67 },
  { letter: 'B+', minPercent: 80, maxPercent: 84,  point: 4.33 },
  { letter: 'B',  minPercent: 75, maxPercent: 79,  point: 4.00 },
  { letter: 'B-', minPercent: 70, maxPercent: 74,  point: 3.67 },
  { letter: 'C+', minPercent: 65, maxPercent: 69,  point: 3.33 },
  { letter: 'C',  minPercent: 60, maxPercent: 64,  point: 3.00 },
  { letter: 'C-', minPercent: 55, maxPercent: 59,  point: 2.67 },
  { letter: 'D',  minPercent: 50, maxPercent: 54,  point: 2.00 },
  { letter: 'F',  minPercent: 0,  maxPercent: 49,  point: 0.00 },
];

export function getGradeTable(scheme: GradingScheme): GradeRow[] {
  if (scheme === 'generic_4') return GENERIC_4_GRADE_TABLE;
  if (scheme === 'generic_5') return GENERIC_5_GRADE_TABLE;
  return UITM_GRADE_TABLE; // 'uitm' is default
}

// ─── Core Helpers ──────────────────────────────────────────────────────────────

/**
 * Convert a raw percentage to the matching GradeRow.
 * Clamps input to [0, 100].
 */
export function percentToGrade(percent: number, scheme: GradingScheme): GradeRow {
  const table = getGradeTable(scheme);
  const clamped = Math.max(0, Math.min(100, percent));
  for (const row of table) {
    if (clamped >= row.minPercent && clamped <= row.maxPercent) return row;
  }
  // Fallback to lowest grade (F)
  return table[table.length - 1];
}

/**
 * Calculate the total weighted carry mark as a percentage of the full carry portion.
 * e.g. If carry weight is 40%, and student earned 60% on carry → returns 0.60
 *
 * Returns [0, 1] — multiply by carryWeight to get final contribution.
 */
export function calcCarryRatio(assessments: GradeAssessment[]): {
  ratio: number;        // earned / possible (0–1) for entered assessments
  possibleWeight: number; // total weight% of entered assessments
  pendingWeight: number;  // total weight% of not-yet-entered assessments
} {
  let earnedWeighted = 0;
  let possibleWeight = 0;
  let pendingWeight = 0;

  for (const a of assessments) {
    if (a.scored !== null && a.maxScore > 0) {
      const fraction = Math.min(a.scored, a.maxScore) / a.maxScore;
      earnedWeighted += fraction * a.weight;
      possibleWeight += a.weight;
    } else {
      pendingWeight += a.weight;
    }
  }

  const ratio = possibleWeight > 0 ? earnedWeighted / possibleWeight : 0;
  return { ratio, possibleWeight, pendingWeight };
}

// ─── Main Calculation ──────────────────────────────────────────────────────────

export function calculateGrade(config: SubjectGradeConfig): GradeResult {
  const { carryWeight, finalWeight, hasFinalExam, assessments,
          finalExamScored, finalExamMaxScore, gradingScheme } = config;

  const { ratio: carryRatio, possibleWeight, pendingWeight } = calcCarryRatio(assessments);

  // Carry contribution = carryRatio * (possibleWeight/100) * carryWeight
  // This gives the actual marks contributed to the final total so far.
  const carryEarned   = carryRatio * (possibleWeight / 100) * carryWeight;
  const carryPossible = (possibleWeight / 100) * carryWeight;
  const carryPending  = (pendingWeight / 100) * carryWeight;

  // Final exam contribution
  let finalContribution = 0;
  if (hasFinalExam && finalExamScored !== null && finalExamMaxScore > 0) {
    const finalRatio = Math.min(finalExamScored, finalExamMaxScore) / finalExamMaxScore;
    finalContribution = finalRatio * finalWeight;
  }

  const totalScore = carryEarned + finalContribution;
  const grade = percentToGrade(totalScore, gradingScheme);

  // "What do I need in the final exam?" for each grade threshold
  const table = getGradeTable(gradingScheme);
  const uniqueThresholds = table.filter((g, i, arr) => i === 0 || g.minPercent !== arr[i - 1].minPercent);

  const requiredForGrades = uniqueThresholds.map((g) => {
    // Solve: carryEarned + (x/100 * finalWeight) = g.minPercent
    // x = (g.minPercent - carryEarned) / finalWeight * 100
    let required: number;
    let achievable: boolean;

    if (!hasFinalExam) {
      required = 0;
      achievable = totalScore >= g.minPercent;
    } else if (finalWeight <= 0) {
      required = 0;
      achievable = totalScore >= g.minPercent;
    } else {
      required = ((g.minPercent - carryEarned) / finalWeight) * 100;
      achievable = required <= 100;
    }

    return { grade: g.letter, point: g.point, required: Math.max(0, required), achievable };
  });

  const hasData = assessments.some(a => a.scored !== null) || (hasFinalExam && finalExamScored !== null);

  return {
    hasData,
    carryEarned,
    carryPossible,
    carryPending,
    finalContribution,
    totalScore,
    grade,
    requiredForGrades,
  };
}

/**
 * Validate that assessment weights sum to 100.
 * Returns the total and whether it is valid.
 */
export function validateAssessmentWeights(assessments: GradeAssessment[]): {
  total: number;
  valid: boolean;
  remaining: number;
} {
  const total = assessments.reduce((s, a) => s + (a.weight || 0), 0);
  return {
    total: Math.round(total * 100) / 100,
    valid: Math.abs(total - 100) < 0.01,
    remaining: Math.round((100 - total) * 100) / 100,
  };
}

/**
 * Get the grade colour tint for a letter grade (used in UI chips).
 */
export function gradeColor(letter: string): string {
  if (letter.startsWith('A')) return '#10b981'; // green
  if (letter.startsWith('B')) return '#3b82f6'; // blue
  if (letter.startsWith('C')) return '#f59e0b'; // amber
  if (letter.startsWith('D')) return '#f97316'; // orange
  return '#ef4444';                              // red (E, F)
}

export const SCHEME_LABELS: Record<GradingScheme, string> = {
  uitm: 'UiTM Malaysia',
  generic_4: 'Generic 4.0 GPA',
  generic_5: 'Generic 5.0 GPA',
};
