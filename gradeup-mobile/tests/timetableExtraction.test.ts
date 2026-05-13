/**
 * Run: npx --yes tsx tests/timetableExtraction.test.ts
 */
import assert from 'node:assert/strict';
import {
  normalizeExtractedDay,
  normalizeExtractedTime,
  apiSlotsToTimetableEntries,
  mergeConsecutiveTimetableEntries,
  parseExtractTimetableResponse,
} from '../src/lib/timetableExtraction';
import type { TimetableEntry } from '../src/types';

assert.equal(normalizeExtractedDay('monday'), 'Monday');
assert.equal(normalizeExtractedDay('MONDAY'), 'Monday');
assert.equal(normalizeExtractedDay('ISNIN'), 'Monday');
assert.equal(normalizeExtractedDay('SELASA'), 'Tuesday');
assert.equal(normalizeExtractedDay('RABU'), 'Wednesday');
assert.equal(normalizeExtractedDay('KHAMIS'), 'Thursday');
assert.equal(normalizeExtractedDay('JUMAAT'), 'Friday');
assert.equal(normalizeExtractedDay('bad_day'), null);

assert.equal(normalizeExtractedTime('9:30'), '09:30');
assert.equal(normalizeExtractedTime('09:30'), '09:30');
assert.equal(normalizeExtractedTime('930'), '09:30');
assert.equal(normalizeExtractedTime('14:5'), '14:05');
assert.equal(normalizeExtractedTime(''), null);

const parsed = parseExtractTimetableResponse({
  slots: [
    {
      day: 'Monday',
      start_time: '08:00',
      end_time: '10:00',
      subject_code: 'TST101',
      subject_name: 'Test Course',
      lecturer: 'Dr A',
      location: 'A1',
      group: 'G1',
    },
  ],
});
assert.equal(parsed.length, 1);
const entries = apiSlotsToTimetableEntries(parsed);
assert.equal(entries.length, 1);
assert.equal(entries[0].day, 'Monday');
assert.equal(entries[0].startTime, '08:00');
assert.equal(entries[0].endTime, '10:00');
assert.equal(entries[0].subjectCode, 'TST101');
assert.equal(entries[0].lecturer, 'Dr A');
assert.equal(entries[0].group, 'G1');

// Merging contiguous periods: 3x BM slots -> 1 block
const bmRaw: TimetableEntry[] = [
  { id: 'a', day: 'Monday', subjectCode: 'BM', subjectName: 'Bahasa Melayu', lecturer: '-', location: '-', startTime: '08:20', endTime: '09:00' },
  { id: 'b', day: 'Monday', subjectCode: 'BM', subjectName: 'Bahasa Melayu', lecturer: '-', location: '-', startTime: '09:00', endTime: '09:40' },
  { id: 'c', day: 'Monday', subjectCode: 'BM', subjectName: 'Bahasa Melayu', lecturer: '-', location: '-', startTime: '09:40', endTime: '10:20' },
];
const bmMerged = mergeConsecutiveTimetableEntries(bmRaw);
assert.equal(bmMerged.length, 1, 'BM should merge to one block');
assert.equal(bmMerged[0].startTime, '08:20');
assert.equal(bmMerged[0].endTime, '10:20');

// Different subject between two same-subject blocks should NOT merge across them
const mixed: TimetableEntry[] = [
  { id: '1', day: 'Tuesday', subjectCode: 'GEO', subjectName: 'Geo', lecturer: '-', location: '-', startTime: '11:20', endTime: '12:00' },
  { id: '2', day: 'Tuesday', subjectCode: 'SV',  subjectName: 'SV',  lecturer: '-', location: '-', startTime: '12:00', endTime: '12:40' },
  { id: '3', day: 'Tuesday', subjectCode: 'SV',  subjectName: 'SV',  lecturer: '-', location: '-', startTime: '12:40', endTime: '13:20' },
];
const mixedMerged = mergeConsecutiveTimetableEntries(mixed);
assert.equal(mixedMerged.length, 2, 'GEO and SV stay separate, SV merges');
const sv = mixedMerged.find((e) => e.subjectCode === 'SV');
assert.equal(sv?.startTime, '12:00');
assert.equal(sv?.endTime, '13:20');

// Non-contiguous same subject (real break) should stay separate
const broken: TimetableEntry[] = [
  { id: '1', day: 'Wednesday', subjectCode: 'PA', subjectName: 'Pengajian Am', lecturer: '-', location: '-', startTime: '08:00', endTime: '08:40' },
  { id: '2', day: 'Wednesday', subjectCode: 'PA', subjectName: 'Pengajian Am', lecturer: '-', location: '-', startTime: '10:00', endTime: '10:40' },
];
const brokenMerged = mergeConsecutiveTimetableEntries(broken);
assert.equal(brokenMerged.length, 2, 'Non-contiguous PA stays as two blocks');

console.log('timetableExtraction tests OK');
