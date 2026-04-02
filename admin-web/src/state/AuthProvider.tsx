import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getMyAdminProfile, type AdminProfile } from '../lib/api';

type AuthState = {
  user: User | null;
  admin: AdminProfile | null;
  loading: boolean;
  refreshAdmin: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAdmin = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setAdmin(null);
      return;
    }
    const profile = await getMyAdminProfile();
    setAdmin(profile);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sync = async (session: Session | null) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      if (!session?.user) {
        setAdmin(null);
        setLoading(false);
        return;
      }
      try {
        await refreshAdmin();
      } catch {
        setAdmin(null);
      } finally {
        setLoading(false);
      }
    };

    void supabase.auth.getSession().then(({ data }) => sync(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      void sync(session);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [refreshAdmin]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(() => ({ user, admin, loading, refreshAdmin, logout }), [user, admin, loading, refreshAdmin, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}

