import { supabase } from './supabase';
import type { TimetableEntry, UniversityConnection } from '../types';

function timetableMergeKey(e: {
  day: string;
  subjectCode: string;
  startTime: string;
  endTime: string;
  group?: string;
}): string {
  return [e.day, e.subjectCode, e.startTime, e.endTime, e.group ?? ''].join('|');
}

/* ── University Connection ──────────────────────────────── */

export async function saveUniversityConnection(
  userId: string,
  conn: UniversityConnection,
): Promise<void> {
  const { error } = await supabase.from('university_connections').upsert(
    {
      user_id: userId,
      university_id: conn.universityId,
      student_id: conn.studentId,
      connected_at: conn.connectedAt,
      last_sync: conn.lastSync ?? null,
      terms_accepted_at: conn.connectedAt,
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(error.message || 'Failed to save university connection');
}

export async function getUniversityConnection(
  userId: string,
): Promise<UniversityConnection | null> {
  const { data, error } = await supabase
    .from('university_connections')
    .select('university_id, student_id, connected_at, last_sync')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    universityId: String(data.university_id),
    studentId: String(data.student_id ?? ''),
    connectedAt: String(data.connected_at),
    lastSync: data.last_sync ? String(data.last_sync) : undefined,
  };
}

export async function deleteUniversityConnection(userId: string): Promise<void> {
  await supabase.from('university_connections').delete().eq('user_id', userId);
}

/* ── Timetable Entries ──────────────────────────────────── */

export async function saveTimetable(
  userId: string,
  entries: TimetableEntry[],
  semesterLabel?: string,
): Promise<void> {
  const { data: prevRows, error: prevErr } = await supabase
    .from('timetable_entries')
    .select('day, subject_code, start_time, end_time, group_name, display_name, slot_color')
    .eq('user_id', userId);
  if (prevErr) throw new Error(prevErr.message || 'Failed to read existing timetable');

  const customByKey = new Map<
    string,
    { display_name: string | null; slot_color: string | null }
  >();
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

export async function getTimetable(userId: string): Promise<TimetableEntry[]> {
  const { data, error } = await supabase
    .from('timetable_entries')
    .select('*')
    .eq('user_id', userId)
    .order('day')
    .order('start_time');
  if (error || !data) return [];
  return (data as any[]).map((r) => ({
    id: String(r.id),
    day: r.day,
    subjectCode: r.subject_code ?? '',
    subjectName: r.subject_name ?? '',
    displayName: r.display_name ? String(r.display_name) : undefined,
    slotColor: r.slot_color ? String(r.slot_color) : undefined,
    lecturer: r.lecturer ?? '',
    startTime: r.start_time,
    endTime: r.end_time,
    location: r.location ?? '',
    group: r.group_name ?? undefined,
  }));
}

export async function updateTimetableEntry(
  userId: string,
  entryId: string,
  patch: Partial<
    Pick<
      TimetableEntry,
      | 'displayName'
      | 'slotColor'
      | 'lecturer'
      | 'location'
      | 'day'
      | 'startTime'
      | 'endTime'
      | 'subjectCode'
      | 'subjectName'
      | 'group'
    >
  >,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if ('displayName' in patch) {
    const v = patch.displayName;
    row.display_name = v != null && v.trim() !== '' ? v.trim() : null;
  }
  if ('slotColor' in patch) {
    const v = patch.slotColor;
    row.slot_color = v != null && v.trim() !== '' ? v.trim() : null;
  }
  if ('lecturer' in patch && patch.lecturer !== undefined) {
    row.lecturer = patch.lecturer;
  }
  if ('location' in patch && patch.location !== undefined) {
    row.location = patch.location;
  }
  if ('day' in patch && patch.day !== undefined) {
    row.day = patch.day;
  }
  if ('startTime' in patch && patch.startTime !== undefined) {
    row.start_time = patch.startTime.trim();
  }
  if ('endTime' in patch && patch.endTime !== undefined) {
    row.end_time = patch.endTime.trim();
  }
  if ('subjectCode' in patch && patch.subjectCode !== undefined) {
    row.subject_code = patch.subjectCode.trim();
  }
  if ('subjectName' in patch && patch.subjectName !== undefined) {
    row.subject_name = patch.subjectName.trim();
  }
  if ('group' in patch && patch.group !== undefined) {
    const g = patch.group.trim();
    row.group_name = g.length > 0 ? g : null;
  }
  if (Object.keys(row).length === 0) return;
  await supabase
    .from('timetable_entries')
    .update(row)
    .eq('user_id', userId)
    .eq('id', entryId);
}

export async function deleteTimetable(userId: string): Promise<void> {
  await supabase.from('timetable_entries').delete().eq('user_id', userId);
}

export async function updateLastSync(userId: string): Promise<void> {
  await supabase
    .from('university_connections')
    .update({ last_sync: new Date().toISOString() })
    .eq('user_id', userId);
}
