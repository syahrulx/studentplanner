import { supabase } from './supabase';
import type { AcademicCalendar } from '../types';

const TABLE = 'academic_calendar';

function rowToCalendar(row: Record<string, unknown>): AcademicCalendar {
  const start = row.start_date != null ? String(row.start_date).slice(0, 10) : '';
  const end = row.end_date != null ? String(row.end_date).slice(0, 10) : '';
  const breakStart = row.break_start_date != null ? String(row.break_start_date).slice(0, 10) : undefined;
  const breakEnd = row.break_end_date != null ? String(row.break_end_date).slice(0, 10) : undefined;
  return {
    id: String(row.id),
    userId: row.user_id != null ? String(row.user_id) : undefined,
    semesterLabel: String(row.semester_label ?? ''),
    startDate: start,
    endDate: end,
    totalWeeks: Number(row.total_weeks) || 14,
    breakStartDate: breakStart || undefined,
    breakEndDate: breakEnd || undefined,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at != null ? String(row.created_at) : undefined,
  };
}

export async function getActiveCalendar(userId: string): Promise<AcademicCalendar | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  return rowToCalendar(data as Record<string, unknown>);
}

export async function upsertCalendar(userId: string, calendar: Omit<AcademicCalendar, 'id' | 'userId' | 'createdAt'>): Promise<AcademicCalendar> {
  const row = {
    user_id: userId,
    semester_label: calendar.semesterLabel,
    start_date: calendar.startDate,
    end_date: calendar.endDate,
    total_weeks: calendar.totalWeeks,
    break_start_date: calendar.breakStartDate ?? null,
    break_end_date: calendar.breakEndDate ?? null,
    is_active: calendar.isActive ?? true,
  };
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error || !data) return rowToCalendar(row as Record<string, unknown>);
  return rowToCalendar(data as Record<string, unknown>);
}
