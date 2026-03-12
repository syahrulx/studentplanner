import { supabase } from './supabase';
import type { RevisionSettings } from '../storage';

const STUDY_TABLE = 'study_times';

function rowToRevisionSettings(row: Record<string, unknown>): RevisionSettings {
  const timeRaw = String(row.time_24h ?? '20:00:00');
  const hhmm = timeRaw.slice(0, 5); // HH:MM from HH:MM:SS
  return {
    id: row.id != null ? String(row.id) : undefined,
    enabled: Boolean(row.enabled),
    time: hhmm,
    subjectId: String(row.subject_id ?? ''),
    day: row.day as RevisionSettings['day'],
    durationMinutes: Number(row.duration_minutes ?? 60) || 60,
    topic: String(row.topic ?? ''),
    repeat: (row.repeat as RevisionSettings['repeat']) ?? 'repeated',
    singleDate: row.single_date != null ? String(row.single_date) : undefined,
  };
}

export async function getStudySettings(userId: string): Promise<RevisionSettings | null> {
  const list = await getAllStudySettings(userId);
  return list.length > 0 ? list[0] : null;
}

/** All study time rows for the user (newest first). Used to display all saved study times in the app. */
export async function getAllStudySettings(userId: string): Promise<RevisionSettings[]> {
  const { data, error } = await supabase
    .from(STUDY_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row) => rowToRevisionSettings(row as Record<string, unknown>));
}

export async function upsertStudySettings(userId: string, settings: RevisionSettings): Promise<void> {
  const [hourStr, minuteStr] = settings.time.split(':');
  const hh = hourStr.padStart(2, '0');
  const mm = (minuteStr ?? '00').padStart(2, '0');
  const time24 = `${hh}:${mm}:00`;

  await supabase.from(STUDY_TABLE).insert(
    {
      user_id: userId,
      enabled: settings.enabled,
      time_24h: time24,
      subject_id: settings.subjectId,
      day: settings.day,
      duration_minutes: settings.durationMinutes,
      topic: settings.topic,
      repeat: settings.repeat,
      single_date: settings.singleDate ?? null,
    }
  );
}

export async function deleteStudySetting(userId: string, id: string): Promise<void> {
  await supabase
    .from(STUDY_TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('id', id);
}

