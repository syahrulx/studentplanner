/**
 * Run: npx --yes tsx tests/academicLevel.test.ts
 *
 * The lowercase inputs below are the values actually found in `profiles.academic_level`
 * (~5,200 rows), written by the onboarding chips before they were switched to canonical keys.
 */
import assert from 'node:assert/strict';
import { normalizeAcademicLevel } from '../src/lib/academicLevel';

// Legacy onboarding keys — these are what used to be dropped on read.
assert.equal(normalizeAcademicLevel('foundation'), 'Foundation');
assert.equal(normalizeAcademicLevel('diploma'), 'Diploma');
assert.equal(normalizeAcademicLevel('degree'), 'Bachelor');
assert.equal(normalizeAcademicLevel('masters'), 'Master');
assert.equal(normalizeAcademicLevel('phd'), 'PhD');

// Canonical values pass through untouched.
assert.equal(normalizeAcademicLevel('Foundation'), 'Foundation');
assert.equal(normalizeAcademicLevel('Diploma'), 'Diploma');
assert.equal(normalizeAcademicLevel('Bachelor'), 'Bachelor');
assert.equal(normalizeAcademicLevel('Master'), 'Master');
assert.equal(normalizeAcademicLevel('PhD'), 'PhD');
assert.equal(normalizeAcademicLevel('Other'), 'Other');

// Malaysian synonyms students and portals use.
assert.equal(normalizeAcademicLevel('asasi'), 'Foundation');
assert.equal(normalizeAcademicLevel('Matrikulasi'), 'Foundation');
assert.equal(normalizeAcademicLevel('STPM'), 'Foundation');
assert.equal(normalizeAcademicLevel('Sarjana Muda'), 'Bachelor');
assert.equal(normalizeAcademicLevel('  sarjana  '), 'Master');
assert.equal(normalizeAcademicLevel('Doktor  Falsafah'), 'PhD');

// Empty and unknown values stay undefined rather than being guessed at.
assert.equal(normalizeAcademicLevel(''), undefined);
assert.equal(normalizeAcademicLevel('   '), undefined);
assert.equal(normalizeAcademicLevel(null), undefined);
assert.equal(normalizeAcademicLevel(undefined), undefined);
assert.equal(normalizeAcademicLevel('postgrad diploma something'), undefined);

// The UiTM group rule that silently broke: `=== 'Foundation'` must now hold for legacy rows.
const uitmGroup = (level: unknown) => (normalizeAcademicLevel(level) === 'Foundation' ? 'A' : 'B');
assert.equal(uitmGroup('foundation'), 'A');
assert.equal(uitmGroup('degree'), 'B');
assert.equal(uitmGroup('diploma'), 'B');

console.log('academicLevel: all assertions passed');
