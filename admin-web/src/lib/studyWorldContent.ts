import { supabase } from './supabase';

/**
 * Study World Library items and notice-board Events. Admins read and edit both
 * tables directly (RLS: is_admin()). Reminder totals come from
 * admin_study_world_event_reminder_counts().
 *
 * Website migration 202610120005_study_world_library_events.sql (tables) and
 * gradeup-mobile migration 20261012000006_study_world_events_admin.sql (counts).
 * Library bodies are plain text: the website shows them as text, never HTML.
 */

export type ContentStatus = 'active' | 'hidden';

export type LibraryItem = {
  id: string;
  subject: string;
  title: string;
  body: string;
  source: string | null;
  status: ContentStatus;
  sort_order: number;
  updated_at: string;
};
export type LibraryInput = Omit<LibraryItem, 'id' | 'updated_at'>;

export const EVENT_MAPS = ['all', 'campus', 'classroom', 'cafe', 'library', 'garden'] as const;
export type EventMap = (typeof EVENT_MAPS)[number];
export const EVENT_MAP_LABEL: Record<EventMap, string> = {
  all: 'Every map', campus: 'Campus', classroom: 'Classroom', cafe: 'Café', library: 'Library', garden: 'Garden',
};

export type WorldEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  map_key: EventMap;
  place: string | null;
  status: ContentStatus;
  updated_at: string;
};
export type EventInput = Omit<WorldEvent, 'id' | 'updated_at'>;

function explain(error: { code?: string; message?: string } | null): Error | null {
  if (!error) return null;
  const msg = error.message ?? 'Request failed';
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(msg)) {
    return new Error('The Library and Events tables are not in the database yet. Run the website migration 202610120005_study_world_library_events.sql in the Supabase SQL Editor.');
  }
  return new Error(msg);
}

export async function listLibrary(): Promise<LibraryItem[]> {
  const { data, error } = await supabase
    .from('study_world_library')
    .select('id,subject,title,body,source,status,sort_order,updated_at')
    .order('subject')
    .order('sort_order')
    .order('title');
  const err = explain(error);
  if (err) throw err;
  return (data ?? []) as LibraryItem[];
}

export async function saveLibraryItem(id: string | null, input: LibraryInput): Promise<void> {
  const row = { ...input, subject: input.subject.trim(), title: input.title.trim(), source: input.source?.trim() || null };
  const { error } = id
    ? await supabase.from('study_world_library').update(row).eq('id', id)
    : await supabase.from('study_world_library').insert(row);
  const err = explain(error);
  if (err) throw err;
}

export async function deleteLibraryItem(id: string): Promise<void> {
  const { error } = await supabase.from('study_world_library').delete().eq('id', id);
  const err = explain(error);
  if (err) throw err;
}

export async function listEvents(): Promise<WorldEvent[]> {
  const { data, error } = await supabase
    .from('study_world_events')
    .select('id,title,description,starts_at,ends_at,map_key,place,status,updated_at')
    .order('starts_at', { ascending: false });
  const err = explain(error);
  if (err) throw err;
  return (data ?? []) as WorldEvent[];
}

/** Reminders per event. Null (not an error) if the counts SQL isn't run yet. */
export async function listReminderCounts(): Promise<Record<string, number> | null> {
  const { data, error } = await supabase.rpc('admin_study_world_event_reminder_counts');
  if (error) return null;
  return Object.fromEntries(((data ?? []) as { event_id: string; reminders: number }[]).map((r) => [r.event_id, Number(r.reminders)]));
}

export async function saveEvent(id: string | null, input: EventInput): Promise<void> {
  const row = { ...input, title: input.title.trim(), description: input.description?.trim() || null, place: input.place?.trim() || null };
  const { error } = id
    ? await supabase.from('study_world_events').update(row).eq('id', id)
    : await supabase.from('study_world_events').insert(row);
  const err = explain(error);
  if (err) throw err;
}

export async function setContentStatus(table: 'study_world_library' | 'study_world_events', id: string, status: ContentStatus): Promise<void> {
  const { error } = await supabase.from(table).update({ status }).eq('id', id);
  const err = explain(error);
  if (err) throw err;
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('study_world_events').delete().eq('id', id);
  const err = explain(error);
  if (err) throw err;
}
