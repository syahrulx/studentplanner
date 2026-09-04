import assert from 'node:assert/strict';
import {
  prepareCalendarOffers,
  type UniversityCalendarOffer,
} from '../src/lib/calendarOfferUtils';

function offer(
  id: string,
  label: string,
  startDate: string,
  endDate: string,
  overrides: Partial<UniversityCalendarOffer> = {},
): UniversityCalendarOffer {
  return {
    id,
    universityId: 'ukm',
    semesterLabel: label,
    startDate,
    endDate,
    totalWeeks: 14,
    source: 'admin',
    createdAt: `2026-0${Math.min(Number(id.replace(/\D/g, '')) || 1, 9)}-01T00:00:00.000Z`,
    ...overrides,
  };
}

const prepared = prepareCalendarOffers([
  offer('past', 'Semester 2', '2025-09-01', '2026-01-31'),
  offer('future', 'Semester 2', '2026-10-01', '2027-01-31'),
  offer('current-full', 'Semester 1', '2026-08-01', '2026-12-20'),
  offer('current-short', 'Short Semester', '2026-08-20', '2026-10-10'),
  offer('current-break', 'Semester 1 (break schedule)', '2026-08-01', '2026-12-20', {
    breakStartDate: '2026-09-21',
    breakEndDate: '2026-09-27',
    periods: [{ type: 'break', label: 'Mid-semester break', startDate: '2026-09-21', endDate: '2026-09-27' }],
  }),
  offer('duplicate', '  semester   1 ', '2026-08-01', '2026-12-20'),
  offer('other-campus', 'Semester 1', '2026-08-01', '2026-12-20', { campusId: 'kl' }),
  offer('bad-dates', 'Broken', '2026-12-20', '2026-08-01'),
  offer('bad-weeks', 'Broken weeks', '2026-08-01', '2026-12-20', { totalWeeks: 0 }),
], '2026-09-05');

assert.deepEqual(
  prepared.slice(0, 4).map((item) => item.id),
  ['current-short', 'current-full', 'current-break', 'other-campus'],
  'running full, short, break, and campus-specific calendars should all be retained ahead of future/past terms',
);
assert.equal(prepared.length, 6, 'all valid current, future, past, and campus-specific choices should remain available');
assert.equal(prepared.some((item) => item.id === 'duplicate'), false, 'normalized duplicate should be hidden');
assert.equal(prepared.some((item) => item.id === 'other-campus'), true, 'same dates at a different campus are not duplicates');
assert.equal(prepared.some((item) => item.id === 'bad-dates' || item.id === 'bad-weeks'), false);
assert.deepEqual(prepared.slice(-2).map((item) => item.id), ['future', 'past']);

console.log('calendar offer ordering tests passed');
