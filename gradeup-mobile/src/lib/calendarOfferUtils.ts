import type { AcademicCalendar } from '../types';

export type UniversityCalendarOffer = {
  id: string;
  universityId: string;
  /** Null means the offer applies to every campus in the university. */
  campusId?: string | null;
  semesterLabel: string;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  breakStartDate?: string;
  breakEndDate?: string;
  periods?: AcademicCalendar['periods'];
  officialUrl?: string;
  referencePdfUrl?: string;
  adminNote?: string;
  source: string;
  createdAt: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function normaliseIdentity(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function isUsableCalendarOffer(offer: UniversityCalendarOffer): boolean {
  return Boolean(
    offer.id.trim() &&
      offer.universityId.trim() &&
      offer.semesterLabel.trim() &&
      ISO_DATE.test(offer.startDate) &&
      ISO_DATE.test(offer.endDate) &&
      offer.startDate <= offer.endDate &&
      Number.isInteger(offer.totalWeeks) &&
      offer.totalWeeks > 0 &&
      offer.totalWeeks <= 52,
  );
}

function dateBucket(offer: UniversityCalendarOffer, todayISO: string): number {
  if (offer.startDate <= todayISO && todayISO <= offer.endDate) return 0;
  if (offer.startDate > todayISO) return 1;
  return 2;
}

/**
 * Removes malformed/redundant offers and puts the useful choices first:
 * running today, nearest upcoming, then most recently completed.
 */
export function prepareCalendarOffers(
  offers: UniversityCalendarOffer[],
  todayISO: string,
): UniversityCalendarOffer[] {
  const today = ISO_DATE.test(todayISO) ? todayISO : new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  const unique = offers.filter((offer) => {
    if (!isUsableCalendarOffer(offer)) return false;
    const key = [
      offer.universityId.trim().toLocaleLowerCase(),
      (offer.campusId ?? '').trim().toLocaleLowerCase(),
      normaliseIdentity(offer.semesterLabel),
      offer.startDate,
      offer.endDate,
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.sort((a, b) => {
    const bucketDiff = dateBucket(a, today) - dateBucket(b, today);
    if (bucketDiff !== 0) return bucketDiff;
    const bucket = dateBucket(a, today);
    if (bucket === 0) {
      return a.endDate.localeCompare(b.endDate) || b.createdAt.localeCompare(a.createdAt);
    }
    if (bucket === 1) {
      return a.startDate.localeCompare(b.startDate) || b.createdAt.localeCompare(a.createdAt);
    }
    return b.endDate.localeCompare(a.endDate) || b.createdAt.localeCompare(a.createdAt);
  });
}
