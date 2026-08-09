import { supabase } from './supabase';
import type { AcademicCalendar } from '../types';

const TABLE = 'uitm_calendar_contributions';

export type UitmCalendarContribution = {
  id: string;
  groupCode: 'A' | 'B';
  calendarVariant: 'standard' | 'kkt';
  termCode?: string;
  semesterLabel: string;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  breakStartDate?: string;
  breakEndDate?: string;
  periods?: AcademicCalendar['periods'];
  sourceUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};

function rowToContribution(row: Record<string, unknown>): UitmCalendarContribution {
  const periodsRaw = row.periods_json;
  const periods = Array.isArray(periodsRaw)
    ? periodsRaw.filter(Boolean).map((p: any) => ({
        type: String(p?.type ?? 'other') as any,
        label: String(p?.label ?? ''),
        startDate: String(p?.startDate ?? '').slice(0, 10),
        endDate: String(p?.endDate ?? '').slice(0, 10),
      }))
    : undefined;
  return {
    id: String(row.id),
    groupCode: row.group_code === 'A' ? 'A' : 'B',
    calendarVariant: row.calendar_variant === 'kkt' ? 'kkt' : 'standard',
    termCode: row.term_code ? String(row.term_code) : undefined,
    semesterLabel: String(row.semester_label ?? ''),
    startDate: String(row.start_date ?? '').slice(0, 10),
    endDate: String(row.end_date ?? '').slice(0, 10),
    totalWeeks: Number(row.total_weeks) || 14,
    breakStartDate: row.break_start_date ? String(row.break_start_date).slice(0, 10) : undefined,
    breakEndDate: row.break_end_date ? String(row.break_end_date).slice(0, 10) : undefined,
    periods: periods && periods.length > 0 ? periods : undefined,
    sourceUrl: row.source_url ? String(row.source_url).trim() || undefined : undefined,
    status: row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending',
    createdAt: String(row.created_at ?? ''),
  };
}

export async function submitUitmCalendarContribution(input: {
  userId: string;
  groupCode: 'A' | 'B';
  calendarVariant?: 'standard' | 'kkt';
  termCode?: string;
  semesterLabel: string;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  breakStartDate?: string;
  breakEndDate?: string;
  periods?: AcademicCalendar['periods'];
  sourceUrl?: string;
}): Promise<void> {
  const start = input.startDate.trim().slice(0, 10);
  const end = input.endDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    throw new Error('Enter a valid start and end date.');
  }

  const { error } = await supabase.from(TABLE).insert({
    created_by: input.userId,
    group_code: input.groupCode,
    calendar_variant: input.calendarVariant === 'kkt' ? 'kkt' : 'standard',
    term_code: input.termCode?.trim() || null,
    semester_label: input.semesterLabel.trim(),
    start_date: start,
    end_date: end,
    total_weeks: Math.max(1, Math.min(52, Math.trunc(input.totalWeeks) || 14)),
    break_start_date: input.breakStartDate?.trim() || null,
    break_end_date: input.breakEndDate?.trim() || null,
    periods_json: input.periods && input.periods.length > 0 ? input.periods : null,
    source_url: input.sourceUrl?.trim() || null,
    status: 'pending',
  });
  if (error) throw new Error(error.message || 'Could not submit calendar for review');
}

export async function fetchApprovedUitmCalendarContributions(groupCode: 'A' | 'B'): Promise<UitmCalendarContribution[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id,group_code,calendar_variant,term_code,semester_label,start_date,end_date,total_weeks,break_start_date,break_end_date,periods_json,source_url,status,created_at')
    .eq('status', 'approved')
    .eq('group_code', groupCode)
    .order('start_date', { ascending: false })
    .limit(50);
  if (error) {
    console.warn('[uitmCalendarContributionsDb] fetchApprovedUitmCalendarContributions error:', error);
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.map((row) => rowToContribution(row as Record<string, unknown>));
}

export function contributionToCalendarPatch(contribution: UitmCalendarContribution): Omit<AcademicCalendar, 'id' | 'userId' | 'createdAt'> {
  return {
    semesterLabel: `UiTM Community Verified — ${contribution.semesterLabel}`,
    startDate: contribution.startDate,
    endDate: contribution.endDate,
    totalWeeks: contribution.totalWeeks,
    breakStartDate: contribution.breakStartDate,
    breakEndDate: contribution.breakEndDate,
    periods: contribution.periods,
    isActive: true,
  };
}
