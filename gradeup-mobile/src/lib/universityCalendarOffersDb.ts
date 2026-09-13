import { supabase } from './supabase';
import type { AcademicCalendar } from '../types';
import { normalizeAcademicLevel } from './academicLevel';
import {
  prepareCalendarOffers,
  type UniversityCalendarOffer,
} from './calendarOfferUtils';
import { getTodayISO } from '../utils/date';

export type { UniversityCalendarOffer } from './calendarOfferUtils';

const OFFERS = 'university_calendar_offers';
const RESPONSES = 'user_calendar_offer_responses';

function rowToOffer(row: Record<string, unknown>): UniversityCalendarOffer {
  const periodsRaw = (row.periods_json as unknown) ?? undefined;
  const periods =
    Array.isArray(periodsRaw)
      ? (periodsRaw as any[]).filter(Boolean).map((p) => ({
          type: String((p as any)?.type ?? 'other'),
          label: String((p as any)?.label ?? ''),
          startDate: String((p as any)?.startDate ?? '').slice(0, 10),
          endDate: String((p as any)?.endDate ?? '').slice(0, 10),
        }))
      : undefined;
  const bs = row.break_start_date != null ? String(row.break_start_date).slice(0, 10) : '';
  const be = row.break_end_date != null ? String(row.break_end_date).slice(0, 10) : '';
  return {
    id: String(row.id),
    universityId: String(row.university_id ?? ''),
    campusId: row.campus_id != null ? String(row.campus_id).trim() || null : null,
    semesterLabel: String(row.semester_label ?? ''),
    startDate: String(row.start_date ?? '').slice(0, 10),
    endDate: String(row.end_date ?? '').slice(0, 10),
    totalWeeks: Number(row.total_weeks) || 14,
    breakStartDate: bs || undefined,
    breakEndDate: be || undefined,
    periods: periods && periods.length > 0 ? (periods as any) : undefined,
    // Extractions write free text here ("Bachelor Programme", "Asasi"), so it goes through the
    // same normaliser as `profiles.academic_level` — the picker compares the two.
    programLevel: normalizeAcademicLevel(row.program_level),
    officialUrl: row.official_url != null ? String(row.official_url).trim() || undefined : undefined,
    referencePdfUrl: row.reference_pdf_url != null ? String(row.reference_pdf_url).trim() || undefined : undefined,
    adminNote: row.admin_note != null ? String(row.admin_note).trim() || undefined : undefined,
    source: row.source != null ? String(row.source) : 'admin',
    createdAt: row.created_at != null ? String(row.created_at) : '',
  };
}

/**
 * Latest admin offer for the user's university that they have not accepted or dismissed.
 * UiTM and missing university are excluded (UiTM keeps portal-based calendar).
 */
export async function fetchPendingCalendarOffer(params: {
  userId: string;
  universityId: string | null | undefined;
}): Promise<UniversityCalendarOffer | null> {
  const uni = (params.universityId ?? '').trim();
  if (!uni || uni === 'uitm') return null;

  const { data: latest, error: le } = await supabase
    .from(OFFERS)
    .select('*')
    .eq('university_id', uni)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (le || !latest) return null;

  const { data: resp, error: re } = await supabase
    .from(RESPONSES)
    .select('status')
    .eq('offer_id', (latest as { id: string }).id)
    .eq('user_id', params.userId)
    .maybeSingle();

  if (re || resp) return null;
  return rowToOffer(latest as Record<string, unknown>);
}

export async function recordCalendarOfferResponse(params: {
  userId: string;
  offerId: string;
  status: 'accepted' | 'dismissed';
}): Promise<void> {
  const { error } = await supabase.from(RESPONSES).insert({
    offer_id: params.offerId,
    user_id: params.userId,
    status: params.status,
  });
  if (error) throw new Error(error.message || 'Failed to save response');
}

/**
 * Fetch the latest admin calendar offer for a university (no accept/dismiss gating).
 * Used for silent auto-load: if admin published a calendar for a uni, students get it automatically.
 */
export async function fetchLatestCalendarForUniversity(
  universityId: string,
): Promise<UniversityCalendarOffer | null> {
  const offers = await fetchAllCalendarOffersForUniversity(universityId);
  return offers[0] ?? null;
}

/**
 * Two offers are the same calendar when they cover the same campus, programme, dates, and timeline —
 * the label is ignored on purpose, because crowdsourced submissions of one calendar arrive
 * spelled every possible way ("s1 26/27", "Sem 1 26/27") and would otherwise all be listed.
 */
function calendarKey(offer: UniversityCalendarOffer): string {
  const timeline = (offer.periods ?? [])
    .map((p) => `${p.type}:${p.startDate}:${p.endDate}`)
    .sort()
    .join(',');
  return [
    offer.campusId ?? '',
    offer.programLevel ?? '',
    offer.startDate,
    offer.endDate,
    timeline,
  ].join('|');
}

function dedupeOffersByCalendarKey(offers: UniversityCalendarOffer[]): UniversityCalendarOffer[] {
  const seen = new Set<string>();
  const out: UniversityCalendarOffer[] = [];
  for (const o of offers) {
    const k = calendarKey(o);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  return out;
}

/** Grace period after a semester ends before its calendar drops off the picker. */
const EXPIRED_OFFER_GRACE_DAYS = 30;

function isOfferExpired(offer: UniversityCalendarOffer, todayISO: string): boolean {
  const end = String(offer.endDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  const endDate = new Date(`${end}T00:00:00`);
  const today = new Date(`${todayISO}T00:00:00`);
  if (Number.isNaN(endDate.getTime()) || Number.isNaN(today.getTime())) return false;
  return (today.getTime() - endDate.getTime()) / 864e5 > EXPIRED_OFFER_GRACE_DAYS;
}

/**
 * Calendars a student can pick for their university (newest first): deduped by term dates +
 * timeline, and without sessions that ended over a month ago. Both filters exist because the
 * table accumulates crowdsourced submissions — without them a UKM student was offered fourteen
 * options, most of them past semesters or re-spellings of the same calendar.
 *
 * Pass `includeExpired` to list everything (e.g. an admin view that must show history).
 */
export async function fetchAllCalendarOffersForUniversity(
  universityId: string,
  options?: { includeExpired?: boolean; todayISO?: string },
): Promise<UniversityCalendarOffer[]> {
  const uni = (universityId ?? '').trim();
  if (!uni) return [];

  const { data, error } = await supabase
    .from(OFFERS)
    .select('*')
    .eq('university_id', uni)
    .order('created_at', { ascending: false });

  if (error || !data || !Array.isArray(data)) return [];
  const rows = data.map((row) => rowToOffer(row as Record<string, unknown>));
  const today = options?.todayISO ?? getTodayISO();
  const current = options?.includeExpired ? rows : rows.filter((o) => !isOfferExpired(o, today));
  // Never leave the picker empty: if every calendar on file has expired, show them all rather
  // than telling the student their university has no calendar at all.
  return dedupeOffersByCalendarKey(
    prepareCalendarOffers(current.length > 0 ? current : rows, today),
  );
}

/**
 * Picking an offer **replaces** the student's calendar, so every optional field is written
 * explicitly. `upsertCalendar` keeps existing values for `undefined` fields (so a label-only
 * patch cannot wipe periods), which would otherwise leave the previous calendar's timeline and
 * break dates on screen when the newly chosen offer has none of its own.
 */
export function offerToCalendarPatch(offer: UniversityCalendarOffer): Omit<AcademicCalendar, 'id' | 'userId' | 'createdAt'> {
  return {
    semesterLabel: offer.semesterLabel,
    startDate: offer.startDate,
    endDate: offer.endDate,
    totalWeeks: offer.totalWeeks,
    breakStartDate: offer.breakStartDate ?? '',
    breakEndDate: offer.breakEndDate ?? '',
    periods: offer.periods ?? [],
    isActive: true,
  };
}
