import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Things in Study World that need an admin: open reports, chat words waiting
 * for a safe/blocked decision, and current bans. Used for the badges in the
 * main sidebar and the Study World page. Re-checks every 30 seconds and when
 * the tab comes back into view. Missing tables just count as 0.
 */
export type WorldAlerts = { openReports: number; pendingWords: number; activeBans: number; loaded: boolean };

const EMPTY: WorldAlerts = { openReports: 0, pendingWords: 0, activeBans: 0, loaded: false };
const listeners = new Set<(a: WorldAlerts) => void>();
let latest: WorldAlerts = EMPTY;
let timer: ReturnType<typeof setInterval> | undefined;

async function fetchAlerts(): Promise<WorldAlerts> {
  const [overview, words] = await Promise.all([
    supabase.rpc('admin_study_world_overview'),
    supabase.from('study_world_chat_words').select('word', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  const o = (overview.data ?? {}) as { open_reports?: number; active_bans?: number };
  return {
    openReports: overview.error ? 0 : Number(o.open_reports ?? 0),
    activeBans: overview.error ? 0 : Number(o.active_bans ?? 0),
    pendingWords: words.error ? 0 : (words.count ?? 0),
    loaded: true,
  };
}

/** Ask for fresh numbers now (call after an admin action changes them). */
export async function refreshWorldAlerts() {
  try {
    latest = await fetchAlerts();
    listeners.forEach((fn) => fn(latest));
  } catch {
    // Offline: keep the last numbers.
  }
}

const onVisible = () => {
  if (document.visibilityState === 'visible') void refreshWorldAlerts();
};

export function useWorldAlerts(): WorldAlerts {
  const [alerts, setAlerts] = useState<WorldAlerts>(latest);
  useEffect(() => {
    listeners.add(setAlerts);
    if (listeners.size === 1) {
      void refreshWorldAlerts();
      timer = setInterval(() => void refreshWorldAlerts(), 30_000);
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      listeners.delete(setAlerts);
      if (listeners.size === 0) {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, []);
  return alerts;
}
