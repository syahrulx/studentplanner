/**
 * Reads one student's profile-card settings: the banner they picked, and the
 * detail rows they keep private.
 *
 * Fetched here, per person, rather than selected alongside every friend in the
 * community list. Putting these two columns into the shared friend query made
 * the whole friends list come back empty against a database where the
 * migration had not been applied yet — and an app release and a migration
 * never land in the same minute. One small query, in one place, that is
 * allowed to fail cannot take a screen down with it: no banner simply means
 * the theme colour, which is what every card had before any of this existed.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/src/lib/supabase';

export interface ProfileCardSettings {
  banner: string | null;
  hidden: string[] | null;
}

export function useProfileCard(userId: string | null | undefined): ProfileCardSettings | null {
  const [settings, setSettings] = useState<ProfileCardSettings | null>(null);
  const [tick, setTick] = useState(0);

  /**
   * Re-read whenever the screen comes back into focus.
   *
   * Without this a screen fetched its banner once, on mount, and kept it for
   * the life of the app: change your banner on the customise screen, go back
   * to your profile, and your profile still showed the old one. Two screens
   * were showing the same student two different banners at the same moment.
   */
  useFocusEffect(
    useCallback(() => {
      setTick((n) => n + 1);
    }, []),
  );

  /**
   * Clear only when the person changes, never on a refresh.
   *
   * Clearing before every fetch meant the banner dropped back to the theme
   * colour and then snapped to the real one each time a screen regained
   * focus — a visible flash on a screen that had not changed at all.
   */
  useEffect(() => {
    setSettings(null);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('profile_banner, profile_hidden_fields')
        .eq('id', userId)
        .maybeSingle();
      if (!alive || error || !data) return;
      setSettings({
        banner: (data as any).profile_banner ?? null,
        hidden: ((data as any).profile_hidden_fields as string[] | null) ?? null,
      });
    })();
    return () => {
      alive = false;
    };
  }, [userId, tick]);

  return settings;
}
