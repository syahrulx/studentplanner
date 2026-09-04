import { supabase } from './supabase';
import type { AcademicCalendar } from '../types';
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
 * All published admin calendars for a university (newest first), deduped by label + term dates.
 * Used so students only see program/term options that actually exist for their chosen university.
 */
export async function fetchAllCalendarOffersForUniversity(
  universityId: string,
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
  return prepareCalendarOffers(rows, getTodayISO());
}

export function offerToCalendarPatch(offer: UniversityCalendarOffer): Omit<AcademicCalendar, 'id' | 'userId' | 'createdAt'> {
  return {
    semesterLabel: offer.semesterLabel,
    startDate: offer.startDate,
    endDate: offer.endDate,
    totalWeeks: offer.totalWeeks,
    breakStartDate: offer.breakStartDate,
    breakEndDate: offer.breakEndDate,
    periods: offer.periods,
    isActive: true,
  };
}
