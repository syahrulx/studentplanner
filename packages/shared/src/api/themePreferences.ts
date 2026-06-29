import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseThemePreferences,
  type ThemePreferences,
} from '../utils/themePreferences';

export async function fetchThemePreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<ThemePreferences | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('theme_preferences')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return parseThemePreferences((data as { theme_preferences?: unknown }).theme_preferences);
}

export async function saveThemePreferences(
  supabase: SupabaseClient,
  userId: string,
  prefs: ThemePreferences,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ theme_preferences: prefs })
    .eq('id', userId);

  if (error) throw new Error(error.message || 'Failed to save theme preferences');
}
