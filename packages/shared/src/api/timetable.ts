import type { SupabaseClient } from '@supabase/supabase-js';
import type { DayOfWeek, TimetableEntry } from '../types';

function timetableMergeKey(e: {
  day: string;
  subjectCode: string;
  startTime: string;
  endTime: string;
  group?: string;
}): string {
  return [e.day, e.subjectCode, e.startTime, e.endTime, e.group ?? ''].join('|');
}

export async function saveTimetable(
  supabase: SupabaseClient,
  userId: string,
  entries: TimetableEntry[],
  semesterLabel?: string,
): Promise<void> {
  const { data: prevRows, error: prevErr } = await supabase
    .from('timetable_entries')
    .select('day, subject_code, start_time, end_time, group_name, display_name, slot_color')
    .eq('user_id', userId);
  if (prevErr) throw new Error(prevErr.message || 'Failed to read existing timetable');

  const customByKey = new Map<string, { display_name: string | null; slot_color: string | null }>();
  for (const r of prevRows || []) {
    const key = timetableMergeKey({
      day: String(r.day),
      subjectCode: String(r.subject_code ?? ''),
      startTime: String(r.start_time ?? ''),
      endTime: String(r.end_time ?? ''),
      group: r.group_name ? String(r.group_name) : '',
    });
    customByKey.set(key, {
      display_name: r.display_name != null ? String(r.display_name) : null,
      slot_color: r.slot_color != null ? String(r.slot_color) : null,
    });
  }

  const { error: delErr } = await supabase.from('timetable_entries').delete().eq('user_id', userId);
  if (delErr) throw new Error(delErr.message || 'Failed to clear timetable');
  if (entries.length === 0) return;

  const rows = entries.map((e) => {
    const key = timetableMergeKey(e);
    const kept = customByKey.get(key);
    return {
      id: e.id,
      user_id: userId,
      day: e.day,
      subject_code: e.subjectCode,
      subject_name: e.subjectName,
      lecturer: e.lecturer,
      start_time: e.startTime,
      end_time: e.endTime,
      location: e.location,
      group_name: e.group ?? null,
      semester_label: semesterLabel ?? null,
      display_name:
        e.displayName != null && e.displayName.trim() !== ''
          ? e.displayName.trim()
          : kept?.display_name && kept.display_name.trim() !== ''
            ? kept.display_name
            : null,
      slot_color:
        e.slotColor != null && e.slotColor.trim() !== ''
          ? e.slotColor.trim()
          : kept?.slot_color && kept.slot_color.trim() !== ''
            ? kept.slot_color
            : null,
    };
  });
  const { error: insErr } = await supabase.from('timetable_entries').insert(rows);
  if (insErr) throw new Error(insErr.message || 'Failed to save timetable');
}

export async function getTimetable(supabase: SupabaseClient, userId: string): Promise<TimetableEntry[]> {
  const { data, error } = await supabase
    .from('timetable_entries')
    .select('*')
    .eq('user_id', userId)
    .order('day')
    .order('start_time');
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    day: r.day as DayOfWeek,
    subjectCode: String(r.subject_code ?? ''),
    subjectName: String(r.subject_name ?? ''),
    displayName: r.display_name ? String(r.display_name) : undefined,
    slotColor: r.slot_color ? String(r.slot_color) : undefined,
    lecturer: String(r.lecturer ?? ''),
    startTime: String(r.start_time),
    endTime: String(r.end_time),
    location: String(r.location ?? ''),
    group: r.group_name ? String(r.group_name) : undefined,
  }));
}

export function entryDisplayTitle(e: TimetableEntry): string {
  const d = e.displayName?.trim();
  return d || e.subjectName || e.subjectCode;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export const DAYS_MON_FIRST: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const TIMETABLE_START_HOUR = 7;
export const TIMETABLE_END_HOUR = 23;
