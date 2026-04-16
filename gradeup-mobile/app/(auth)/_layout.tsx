import { Redirect, Stack, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/src/lib/supabase';

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
        const { data: profile } = await supabase
          .from('profiles')
          .select('university')
          .eq('id', uid)
          .maybeSingle();
        if (!alive) return;
        setGate(profile?.university ? 'ready' : 'needs-profile');
      } catch {
        if (!alive) return;
        setGate('needs-profile');
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
