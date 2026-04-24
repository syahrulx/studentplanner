import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';

import { supabase } from './supabase';

export type UpdateSeverity = 'none' | 'soft' | 'hard';

export interface AppConfig {
  minVersion: string;
  latestVersion: string;
  storeUrl: string;
  messageEn: string | null;
  messageMs: string | null;
}

export interface UpdateCheckResult {
  severity: UpdateSeverity;
  currentVersion: string;
  minVersion: string;
  latestVersion: string;
  storeUrl: string;
  messageEn: string | null;
  messageMs: string | null;
}

/** Returns the native bundle version (e.g. "1.0.0"). Falls back to expo config. */
export function getCurrentAppVersion(): string {
  const native = Application.nativeApplicationVersion;
  if (native && native.trim()) return native.trim();
  const fromConstants =
    (Constants.expoConfig?.version as string | undefined) ||
    // @ts-expect-error — manifest2 shape varies across SDKs.
    (Constants.manifest2?.extra?.expoClient?.version as string | undefined);
  return (fromConstants && fromConstants.trim()) || '0.0.0';
}

/**
 * Compare two dotted version strings (e.g. "1.2.3" vs "1.2.10").
 * Returns -1 if `a < b`, 0 if equal, 1 if `a > b`.
 * Non-numeric / missing parts are treated as 0 so "1.2" compares equal to "1.2.0".
 */
export function compareVersions(a: string, b: string): number {
  const pa = String(a ?? '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b ?? '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

/** Fetch the `default` row of `app_config` and return platform-specific fields. */
export async function fetchAppConfig(): Promise<AppConfig | null> {
  const { data, error } = await supabase
    .from('app_config')
    .select(
      'ios_min_version, android_min_version, ios_latest_version, android_latest_version, ios_store_url, android_store_url, message_en, message_ms',
    )
    .eq('id', 'default')
    .maybeSingle();

  if (error || !data) return null;

  const isIos = Platform.OS === 'ios';
  return {
    minVersion: isIos ? (data.ios_min_version ?? '0.0.0') : (data.android_min_version ?? '0.0.0'),
    latestVersion: isIos
      ? (data.ios_latest_version ?? '0.0.0')
      : (data.android_latest_version ?? '0.0.0'),
    storeUrl: isIos ? (data.ios_store_url ?? '') : (data.android_store_url ?? ''),
    messageEn: (data.message_en ?? null) || null,
    messageMs: (data.message_ms ?? null) || null,
  };
}

/**
 * Resolve whether the current build requires a hard / soft update, given a
 * server config (fetched via `fetchAppConfig`).
 */
export function evaluateUpdateSeverity(
  currentVersion: string,
  cfg: AppConfig,
): UpdateSeverity {
  if (!cfg.minVersion && !cfg.latestVersion) return 'none';
  if (cfg.minVersion && compareVersions(currentVersion, cfg.minVersion) < 0) return 'hard';
  if (cfg.latestVersion && compareVersions(currentVersion, cfg.latestVersion) < 0) return 'soft';
  return 'none';
}

/** One-shot launch check. Silent-fails (returns `none`) on network errors. */
export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentAppVersion();
  const cfg = await fetchAppConfig().catch(() => null);
  if (!cfg) {
    return {
      severity: 'none',
      currentVersion,
      minVersion: '0.0.0',
      latestVersion: '0.0.0',
      storeUrl: '',
      messageEn: null,
      messageMs: null,
    };
  }
  return {
    severity: evaluateUpdateSeverity(currentVersion, cfg),
    currentVersion,
    minVersion: cfg.minVersion,
    latestVersion: cfg.latestVersion,
    storeUrl: cfg.storeUrl,
    messageEn: cfg.messageEn,
    messageMs: cfg.messageMs,
  };
}
