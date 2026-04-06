import { supabase } from './supabase';
import type { AcademicCalendar } from '../types';

const OFFERS = 'university_calendar_offers';
const RESPONSES = 'user_calendar_offer_responses';

export type UniversityCalendarOffer = {
  id: string;
  universityId: string;
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
  createdAt: string;
};

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
  const uni = (universityId ?? '').trim();
  if (!uni || uni === 'uitm') return null;

  const { data, error } = await supabase
    .from(OFFERS)
    .select('*')
    .eq('university_id', uni)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return rowToOffer(data as Record<string, unknown>);
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
