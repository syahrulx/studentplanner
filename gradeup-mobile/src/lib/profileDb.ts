import { supabase } from './supabase';
import type { AcademicLevel } from '../types';

const TABLE = 'profiles';

export interface ProfileRow {
  id: string;
  name: string | null;
  university: string | null;
  academic_level: string | null;
  updated_at: string;
}

export async function getProfile(userId: string): Promise<{
  name: string;
  university?: string;
  academicLevel?: AcademicLevel;
} | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('name, university, academic_level')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  const row = data as { name: string | null; university: string | null; academic_level: string | null };
  const level = row.academic_level as AcademicLevel | undefined;
  return {
    name: row.name ?? '',
    university: row.university ?? undefined,
    academicLevel: level && ['Diploma', 'Bachelor', 'Master', 'PhD', 'Foundation', 'Other'].includes(level) ? level : undefined,
  };
}

export async function updateProfile(
  userId: string,
  updates: { name?: string; university?: string; academicLevel?: AcademicLevel }
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.university !== undefined) payload.university = updates.university;
  if (updates.academicLevel !== undefined) payload.academic_level = updates.academicLevel;
  if (Object.keys(payload).length === 0) return;
  await supabase.from(TABLE).update(payload).eq('id', userId);
}
