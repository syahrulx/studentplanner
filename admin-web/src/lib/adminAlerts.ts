import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * What is waiting for an admin in each sidebar section, for the red badges.
 * One call to admin_sidebar_counts() (gradeup-mobile migration
 * 20261013000004_admin_sidebar_counts.sql). Re-checks every 30 seconds and
 * when the tab comes back into view. If the function isn't there yet, every
 * count is 0 and no badge shows.
 */
export type AdminAlertKey =
  | 'user_reports'
  | 'confessions'
  | 'share_rewards'
  | 'services'
  | 'events'
  | 'institutions'
  | 'calendars'
  | 'users';

export type AdminAlerts = Record<AdminAlertKey, number>;

export const ALERT_LABEL: Record<AdminAlertKey, string> = {
  user_reports: 'open reports',
  confessions: 'flagged or suspect confessions to review',
  share_rewards: 'share reward claims to check',
  services: 'reported services',
  events: 'flagged events or memos',
  institutions: 'authority requests to approve',
  calendars: 'calendar contributions to review',
  users: 'student verifications to approve',
};

const EMPTY: AdminAlerts = {
  user_reports: 0, confessions: 0, share_rewards: 0, services: 0,
  events: 0, institutions: 0, calendars: 0, users: 0,
};

let latest: AdminAlerts = EMPTY;
const listeners = new Set<(a: AdminAlerts) => void>();
let timer: ReturnType<typeof setInterval> | undefined;

/** Ask for fresh numbers now (e.g. after approving or dismissing something). */
export async function refreshAdminAlerts() {
  try {
    const { data, error } = await supabase.rpc('admin_sidebar_counts');
    if (error || !data) return;
    const raw = data as Partial<Record<AdminAlertKey, unknown>>;
    latest = Object.fromEntries(
      (Object.keys(EMPTY) as AdminAlertKey[]).map((k) => [k, Math.max(0, Number(raw[k] ?? 0) || 0)]),
    ) as AdminAlerts;
    listeners.forEach((fn) => fn(latest));
  } catch {
    // Offline: keep the last numbers.
  }
}

const onVisible = () => {
  if (document.visibilityState === 'visible') void refreshAdminAlerts();
};

export function useAdminAlerts(): AdminAlerts {
  const [alerts, setAlerts] = useState<AdminAlerts>(latest);
  useEffect(() => {
    listeners.add(setAlerts);
    if (listeners.size === 1) {
      void refreshAdminAlerts();
      timer = setInterval(() => void refreshAdminAlerts(), 30_000);
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

/** Bulk-delete UiTM community calendar submissions (admins only, logged). Returns how many were deleted. */
export async function deleteUitmContributions(ids: string[], reason: string): Promise<number> {
  const { data, error } = await supabase.rpc('admin_delete_uitm_calendar_contributions', { p_ids: ids, p_reason: reason });
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) {
      throw new Error('Bulk delete needs gradeup-mobile migration 20261013000005_admin_badges_and_uitm_bulk_delete.sql. Run it in the Supabase SQL Editor.');
    }
    throw new Error(error.message);
  }
  void refreshAdminAlerts();
  return Number(data ?? 0);
}
