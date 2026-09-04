import assert from 'node:assert/strict';
import { calculateGrade } from '../src/lib/gradeCalculator';
import {
  gradeConfigLocalKey,
  gradeConfigToRow,
  gradeRowToConfig,
} from '../src/lib/gradeConfigCodec';
import type { SubjectGradeConfig } from '../src/types';

const config: SubjectGradeConfig = {
  subjectId: 'CSC101',
  updatedAt: '2026-09-05T00:00:00.000Z',
  gradingScheme: 'generic_4',
  customGradeRows: [
    { letter: 'HD', minPercent: 85, maxPercent: 100, point: 4 },
    { letter: 'P', minPercent: 50, maxPercent: 84.99, point: 2 },
    { letter: 'N', minPercent: 0, maxPercent: 49.99, point: 0 },
  ],
  hasFinalExam: false,
  carryWeight: 100,
  finalWeight: 0,
  assessments: [
    { id: 'assignment', name: 'Assignment', weight: 100, scored: 88, maxScore: 100 },
  ],
  finalExamScored: null,
  finalExamMaxScore: 100,
};

const databaseRoundTrip = gradeRowToConfig(
  JSON.parse(JSON.stringify(gradeConfigToRow('user-a', config))) as Record<string, unknown>,
);
assert.deepEqual(databaseRoundTrip.customGradeRows, config.customGradeRows);
assert.equal(databaseRoundTrip.updatedAt, config.updatedAt);
assert.equal(calculateGrade(databaseRoundTrip).grade.letter, 'HD');

const offlineRoundTrip = JSON.parse(JSON.stringify(config)) as SubjectGradeConfig;
assert.deepEqual(offlineRoundTrip.customGradeRows, config.customGradeRows);
assert.equal(calculateGrade(offlineRoundTrip).currentStandingGrade.letter, 'HD');

assert.notEqual(
  gradeConfigLocalKey('user-a', config.subjectId),
  gradeConfigLocalKey('user-b', config.subjectId),
  'offline grade settings must be isolated per user and subject',
);

console.log('grade persistence tests passed');
