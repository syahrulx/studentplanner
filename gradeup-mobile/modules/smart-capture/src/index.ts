import { Platform } from 'react-native';
import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

/**
 * Smart Capture native bridge: on-device OCR (Vision on iOS, ML Kit on Android)
 * plus the iOS Back Tap inbox written by the "Plan from screenshot" App Intent.
 *
 * Every export degrades gracefully when the native module is missing (web, or a
 * build made before this module existed), mirroring src/iosWidgetTimelineSync.ts.
 */

export interface OcrResult {
  text: string;
  lines: string[];
  width: number;
  height: number;
}

export interface PendingCapture {
  uri: string;
  createdAt: number;
  source: 'back_tap';
}

interface SmartCaptureNativeModule {
  recognizeText(uri: string): Promise<OcrResult>;
  peekPendingCapture(): PendingCapture | null;
  consumePendingCapture(): Promise<PendingCapture | null>;
  importCaptureFile(uri: string): Promise<string>;
  sweepStaleCaptures(): Promise<void>;
  addListener(
    event: 'onPendingCapture',
    listener: (capture: PendingCapture) => void,
  ): EventSubscription;
}

const nativeModule =
  Platform.OS === 'web' ? null : requireOptionalNativeModule<SmartCaptureNativeModule>('SmartCapture');

export function isSmartCaptureAvailable(): boolean {
  return nativeModule != null;
}

/** Reads text from a local image. Rejects when the module is unavailable. */
export async function recognizeText(uri: string): Promise<OcrResult> {
  if (!nativeModule) throw new Error('SmartCapture native module is unavailable');
  return nativeModule.recognizeText(uri);
}

/** iOS only — a screenshot waiting from a Back Tap shortcut, without clearing it. */
export function peekPendingCapture(): PendingCapture | null {
  if (Platform.OS !== 'ios' || !nativeModule) return null;
  try {
    return nativeModule.peekPendingCapture();
  } catch {
    return null;
  }
}

/** iOS only — moves the pending screenshot into app storage and clears the marker. */
export async function consumePendingCapture(): Promise<PendingCapture | null> {
  if (Platform.OS !== 'ios' || !nativeModule) return null;
  try {
    return await nativeModule.consumePendingCapture();
  } catch {
    return null;
  }
}

/**
 * Copies a file we do not own (share-extension output, a content:// URI) into
 * app storage so it stays readable and OCR can open it.
 */
export async function importCaptureFile(uri: string): Promise<string> {
  if (!nativeModule) return uri;
  try {
    return await nativeModule.importCaptureFile(uri);
  } catch {
    return uri;
  }
}

/** Deletes capture leftovers older than a day. Safe to call on every launch. */
export async function sweepStaleCaptures(): Promise<void> {
  if (!nativeModule) return;
  try {
    await nativeModule.sweepStaleCaptures();
  } catch {
    /* housekeeping only */
  }
}

const NOOP_SUBSCRIPTION: EventSubscription = { remove() {} };

/** iOS only — fires when a Back Tap capture arrives while the app is running. */
export function addPendingCaptureListener(
  listener: (capture: PendingCapture) => void,
): EventSubscription {
  if (Platform.OS !== 'ios' || !nativeModule) return NOOP_SUBSCRIPTION;
  try {
    return nativeModule.addListener('onPendingCapture', listener);
  } catch {
    return NOOP_SUBSCRIPTION;
  }
}
