/**
 * Run: npx --yes tsx tests/timetableExtraction.test.ts
 */
import assert from 'node:assert/strict';
import {
  normalizeExtractedDay,
  normalizeExtractedTime,
  apiSlotsToTimetableEntries,
  parseExtractTimetableResponse,
} from '../src/lib/timetableExtraction';

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

console.log('timetableExtraction tests OK');
