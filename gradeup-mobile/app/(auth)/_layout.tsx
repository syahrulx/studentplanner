import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/src/lib/supabase';

export default function AuthLayout() {
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setHasSession(Boolean(data.session?.user?.id));
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setHasSession(Boolean(session?.user?.id));
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  // While restoring from AsyncStorage, avoid flashing login on cold start / resume.
  if (hasSession === null) return null;
  if (hasSession) return <Redirect href="/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
