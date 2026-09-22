import { Redirect, Stack, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/lib/supabase';
import { ConnectionRetry } from '@/src/components/ConnectionRetry';

// Must match app/(tabs)/_layout.tsx — a user who chose "Skip for now" is not
// re-trapped in profile setup on the next cold start.
const PROFILE_SETUP_SKIPPED_KEY_PREFIX = 'profile_setup_skipped_v1:';

// Must match app/(tabs)/_layout.tsx. Only these carry an identity change; on
// TOKEN_REFRESHED the user is the one we already resolved.
const GATE_AUTH_EVENTS = new Set(['SIGNED_IN', 'SIGNED_OUT', 'INITIAL_SESSION']);

// Sits just above the 15s Supabase request timeout so the real error path wins.
const GATE_WATCHDOG_MS = 18_000;

export default function AuthLayout() {
  const pathname = usePathname();
  const [gate, setGate] = useState<'loading' | 'signed-out' | 'needs-profile' | 'ready' | 'error'>(
    'loading',
  );
  const [gateAttempt, setGateAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    let resolvedForUid: string | null = null;

    const resolveGate = async (uid?: string | null) => {
      if (!alive) return;
      if (!uid) {
        resolvedForUid = null;
        setGate('signed-out');
        return;
      }
      if (resolvedForUid === uid) return;
      resolvedForUid = uid;
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
          resolvedForUid = null;
          setGate('ready');
          return;
        }
        setGate(profile?.university ? 'ready' : 'needs-profile');
      } catch {
        if (!alive) return;
        resolvedForUid = null;
        setGate('ready');
      }
    };

    void supabase.auth
      .getSession()
      .then(({ data }) => resolveGate(data.session?.user?.id ?? null))
      .catch(() => {
        // Identity unknown. Showing the login screen would be a guess, and a
        // blank screen leaves the user nothing to act on — offer the retry.
        if (alive) setGate('error');
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (!GATE_AUTH_EVENTS.has(event)) return;
      void resolveGate(session?.user?.id ?? null);
    });

    const watchdog = setTimeout(() => {
      if (!alive) return;
      setGate((current) => (current === 'loading' ? 'error' : current));
    }, GATE_WATCHDOG_MS);

    return () => {
      alive = false;
      clearTimeout(watchdog);
      subscription.unsubscribe();
    };
  }, [gateAttempt]);

  if (gate === 'error') {
    return (
      <ConnectionRetry
        onRetry={() => {
          setGate('loading');
          setGateAttempt((n) => n + 1);
        }}
      />
    );
  }

  // While restoring from AsyncStorage, avoid flashing login on cold start / resume.
  if (gate === 'loading') return null;
  if (gate === 'signed-out') return <Stack screenOptions={{ headerShown: false }} />;

  // Keep incomplete profiles trapped in the profile setup flow.
  if (gate === 'needs-profile') {
    if (pathname.endsWith('/profile-setup')) return <Stack screenOptions={{ headerShown: false }} />;
    return <Redirect href="/(auth)/profile-setup" />;
  }

  // Complete profiles should never stay in auth screens — except mid password
  // reset: the recovery deep link (app/_layout.tsx) establishes a real
  // session before navigating here, which would otherwise make this gate
  // race that navigation and bounce an existing user straight to (tabs)
  // before they ever see the "set a new password" screen.
  if (gate === 'ready') {
    if (pathname.endsWith('/reset-password')) return <Stack screenOptions={{ headerShown: false }} />;
    return <Redirect href="/(tabs)" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
