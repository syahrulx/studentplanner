import { Redirect, Stack, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/lib/supabase';

// Must match app/(tabs)/_layout.tsx — a user who chose "Skip for now" is not
// re-trapped in profile setup on the next cold start.
const PROFILE_SETUP_SKIPPED_KEY_PREFIX = 'profile_setup_skipped_v1:';

export default function AuthLayout() {
  const segments = useSegments();
  const [gate, setGate] = useState<'loading' | 'signed-out' | 'needs-profile' | 'ready'>('loading');

  useEffect(() => {
    let alive = true;

    const resolveGate = async (uid?: string | null) => {
      if (!alive) return;
      if (!uid) {
        setGate('signed-out');
        return;
      }
      try {
        const skipped = await AsyncStorage.getItem(PROFILE_SETUP_SKIPPED_KEY_PREFIX + uid);
        if (!alive) return;
        if (skipped) {
          setGate('ready');
          return;
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('university')
          .eq('id', uid)
          .maybeSingle();
        if (!alive) return;

        // Only a SUCCESSFUL query that genuinely returns no university means
        // the profile is incomplete. If the request failed (offline, captive
        // portal, server error) we must not conclude "no profile" — that used
        // to dump fully-onboarded users into the full-screen "Complete Your
        // Profile" wall every time they opened the app without a connection,
        // where saving then also failed. Fail open into the app instead; the
        // (tabs) layout runs its own gate once data loads.
        if (error) {
          setGate('ready');
          return;
        }
        setGate(profile?.university ? 'ready' : 'needs-profile');
      } catch {
        if (!alive) return;
        setGate('ready');
      }
    };

    void supabase.auth.getSession().then(({ data }) => {
      void resolveGate(data.session?.user?.id ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      void resolveGate(session?.user?.id ?? null);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  // While restoring from AsyncStorage, avoid flashing login on cold start / resume.
  if (gate === 'loading') return null;
  if (gate === 'signed-out') return <Stack screenOptions={{ headerShown: false }} />;

  // Keep incomplete profiles trapped in the profile setup flow.
  if (gate === 'needs-profile') {
    if (segments[1] === 'profile-setup') return <Stack screenOptions={{ headerShown: false }} />;
    return <Redirect href="/(auth)/profile-setup" />;
  }

  // Complete profiles should never stay in auth screens.
  if (gate === 'ready') return <Redirect href="/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
