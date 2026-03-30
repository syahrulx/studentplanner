import { supabase } from './supabase';
import { SOW_FILES_BUCKET } from './sowStorage';
import * as timetableDb from './timetableDb';
import * as coursesDb from './coursesDb';
import * as taskDb from './taskDb';
import * as academicCalendarDb from './academicCalendarDb';
import * as studyTimeDb from './studyTimeDb';

/** Collect storage object paths under `userId/…` (recursive). */
async function collectSowStoragePaths(userId: string): Promise<string[]> {
  const bucket = SOW_FILES_BUCKET;
  const out: string[] = [];

  async function walk(prefix: string): Promise<void> {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error || !data?.length) return;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.metadata != null) {
        out.push(path);
      } else {
        await walk(path);
      }
    }
  }

  await walk(userId);
  return out;
}

async function removeSowStorageForUser(userId: string): Promise<void> {
  const paths = await collectSowStoragePaths(userId);
  const chunk = 100;
  for (let i = 0; i < paths.length; i += chunk) {
    const slice = paths.slice(i, i + chunk);
    const { error } = await supabase.storage.from(SOW_FILES_BUCKET).remove(slice);
    if (error && __DEV__) console.warn('[GradeUp] SOW storage remove:', error.message);
  }
}

/**
 * Deletes semester-scoped planner data for the user in Supabase + SOW storage.
 * Does not remove auth, profile name, or university link.
 */
export async function clearSemesterDataFromDatabase(userId: string): Promise<void> {
  await timetableDb.deleteTimetable(userId);
  await coursesDb.deleteAllCoursesForUser(userId);
  await taskDb.deleteAllTasksForUser(userId);
  await academicCalendarDb.deleteAllCalendarsForUser(userId);
  await studyTimeDb.deleteAllStudyTimesForUser(userId);

  const { error: sowErr } = await supabase.from('sow_imports').delete().eq('user_id', userId);
  if (sowErr) throw new Error(sowErr.message || 'Failed to delete SOW imports');

  await removeSowStorageForUser(userId);
}
