/**
 * Edge-case audit for grade calculator stability.
 * Run: npx --yes tsx scratch/grade_audit.ts
 */
import { calculateGrade, calcCarryRatio, percentToGrade, validateAssessmentWeights } from '../src/lib/gradeCalculator';
import type { SubjectGradeConfig, GradeAssessment } from '../src/types';

function makeConfig(overrides: Partial<SubjectGradeConfig> = {}): SubjectGradeConfig {
  return {
    subjectId: 'test',
    gradingScheme: 'uitm',
    hasFinalExam: true,
    carryWeight: 40,
    finalWeight: 60,
    assessments: [],
    finalExamScored: null,
    finalExamMaxScore: 100,
    ...overrides,
  };
}

function testCase(label: string, config: SubjectGradeConfig) {
  try {
    const result = calculateGrade(config);
    const issues: string[] = [];
    
    if (isNaN(result.totalScore)) issues.push('totalScore is NaN');
    if (!isFinite(result.totalScore)) issues.push('totalScore is Infinity');
    if (isNaN(result.carryEarned)) issues.push('carryEarned is NaN');
    if (!isFinite(result.carryEarned)) issues.push('carryEarned is Infinity');
    if (result.currentStandingScore !== undefined && isNaN(result.currentStandingScore)) issues.push('currentStandingScore is NaN');
    if (result.currentStandingScore !== undefined && !isFinite(result.currentStandingScore)) issues.push('currentStandingScore is Infinity');
    if (!result.grade) issues.push('grade is undefined/null');
    if (!result.currentStandingGrade) issues.push('currentStandingGrade is undefined/null');
    
    for (const r of result.requiredForGrades) {
      if (isNaN(r.required)) { issues.push(`required for ${r.grade} is NaN`); break; }
      if (!isFinite(r.required)) { issues.push(`required for ${r.grade} is Infinity`); break; }
    }

    if (issues.length > 0) {
      console.log(`❌ ${label}`);
      issues.forEach(i => console.log(`   → ${i}`));
      console.log(`   result:`, JSON.stringify({
        totalScore: result.totalScore,
        carryEarned: result.carryEarned,
        currentStandingScore: result.currentStandingScore,
        grade: result.grade?.letter,
        currentStandingGrade: result.currentStandingGrade?.letter,
      }));
    } else {
      console.log(`✅ ${label} — total=${result.totalScore.toFixed(2)}, standing=${result.currentStandingScore?.toFixed(2)}, grade=${result.grade.letter}, standGrade=${result.currentStandingGrade?.letter}`);
    }
  } catch (e) {
    console.log(`💥 ${label} — THREW: ${e}`);
  }
}

console.log('\n=== Edge Case Audit ===\n');

// 1. Empty config (no assessments, no final)
testCase('Empty config', makeConfig());

// 2. Assessment with maxScore=0 (division by zero)
testCase('maxScore=0', makeConfig({
  assessments: [{ id: '1', name: 'Test', weight: 20, scored: 50, maxScore: 0 }],
}));

// 3. Assessment with scored > maxScore
testCase('scored > maxScore', makeConfig({
  assessments: [{ id: '1', name: 'Test', weight: 20, scored: 150, maxScore: 100 }],
}));

// 4. Assessment with negative scored
testCase('negative scored', makeConfig({
  assessments: [{ id: '1', name: 'Test', weight: 20, scored: -10, maxScore: 100 }],
}));

// 5. Assessment with negative maxScore
testCase('negative maxScore', makeConfig({
  assessments: [{ id: '1', name: 'Test', weight: 20, scored: 50, maxScore: -100 }],
}));

// 6. Assessment with weight=0
testCase('weight=0', makeConfig({
  assessments: [{ id: '1', name: 'Test', weight: 0, scored: 50, maxScore: 100 }],
}));

// 7. Carry weight = 0, final weight = 100
testCase('carryWeight=0', makeConfig({
  carryWeight: 0, finalWeight: 100, finalExamScored: 80,
}));

// 8. Final exam maxScore = 0
testCase('finalMaxScore=0', makeConfig({
  finalExamScored: 80, finalExamMaxScore: 0,
}));

// 9. Final exam scored > maxScore
testCase('finalScored > finalMax', makeConfig({
  finalExamScored: 150, finalExamMaxScore: 100,
}));

// 10. Both carry and final = 0 (divide by zero in standing)
testCase('carryWeight=0 finalWeight=0', makeConfig({
  carryWeight: 0, finalWeight: 0,
  assessments: [{ id: '1', name: 'Test', weight: 0, scored: 50, maxScore: 100 }],
}));

// 11. NaN inputs
testCase('NaN scored', makeConfig({
  assessments: [{ id: '1', name: 'Test', weight: 20, scored: NaN, maxScore: 100 }],
}));

// 12. Weights that exceed carry weight (e.g. two 30% components in a 40% carry)
testCase('Weights exceed carry', makeConfig({
  assessments: [
    { id: '1', name: 'A', weight: 30, scored: 90, maxScore: 100 },
    { id: '2', name: 'B', weight: 30, scored: 80, maxScore: 100 },
  ],
}));

// 13. hasFinalExam=false but finalWeight > 0
testCase('No final but finalWeight>0', makeConfig({
  hasFinalExam: false, carryWeight: 60, finalWeight: 40,
  assessments: [{ id: '1', name: 'Test', weight: 60, scored: 75, maxScore: 100 }],
}));

// 14. Very small decimal values
testCase('Small decimals', makeConfig({
  assessments: [{ id: '1', name: 'Test', weight: 0.5, scored: 0.1, maxScore: 0.2 }],
}));

// 15. finalWeight=0 with hasFinalExam=true (division by zero in required calc)
testCase('finalWeight=0 with hasFinalExam', makeConfig({
  hasFinalExam: true, carryWeight: 100, finalWeight: 0,
  assessments: [{ id: '1', name: 'Test', weight: 50, scored: 80, maxScore: 100 }],
}));

// 16. All assessments scored null (no data entered)
testCase('All null scores', makeConfig({
  assessments: [
    { id: '1', name: 'A', weight: 20, scored: null, maxScore: 100 },
    { id: '2', name: 'B', weight: 20, scored: null, maxScore: 100 },
  ],
}));

// 17. Negative weight
testCase('Negative weight', makeConfig({
  assessments: [{ id: '1', name: 'Test', weight: -10, scored: 50, maxScore: 100 }],
}));

// 18. Infinity scored
testCase('Infinity scored', makeConfig({
  assessments: [{ id: '1', name: 'Test', weight: 20, scored: Infinity, maxScore: 100 }],
}));

console.log('\n=== Audit Complete ===\n');
