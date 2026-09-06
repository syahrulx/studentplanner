import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CaptureSource } from './captureInboxStore';

const KEY_FIRST_SUCCESS = 'smart_capture_first_success';
const KEY_TIP_DISMISSED = 'smart_capture_tip_dismissed';

export interface FirstSuccess {
  at: number;
  source: CaptureSource;
}

export async function getFirstSuccess(): Promise<FirstSuccess | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_FIRST_SUCCESS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FirstSuccess>;
    if (typeof parsed?.at !== 'number' || typeof parsed?.source !== 'string') return null;
    return { at: parsed.at, source: parsed.source as CaptureSource };
  } catch {
    return null;
  }
}

/** Records the first successful capture per source, keeping the earliest overall. */
export async function markCaptureSuccess(source: CaptureSource): Promise<void> {
  try {
    const existing = await getFirstSuccess();
    // Keep the first ever, but upgrade to `back_tap` once the user proves the
    // Back Tap automation works — the setup screen waits for exactly that.
    if (existing && !(source === 'back_tap' && existing.source !== 'back_tap')) return;
    await AsyncStorage.setItem(KEY_FIRST_SUCCESS, JSON.stringify({ at: Date.now(), source }));
  } catch {
    /* non-critical */
  }
}

export async function isTipDismissed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY_TIP_DISMISSED)) === '1';
  } catch {
    return true;
  }
}

export async function dismissTip(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_TIP_DISMISSED, '1');
  } catch {
    /* non-critical */
  }
}
