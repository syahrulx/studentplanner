import { Platform } from 'react-native';

/**
 * Writes the home-widget JSON snapshot and refreshes Android App Widgets. No-op off Android.
 */
export function updateAndroidHomeWidgetSnapshot(json: string): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    const { requireNativeModule } = require('expo-modules-core') as typeof import('expo-modules-core');
    requireNativeModule<{ updateSnapshot: (j: string) => void }>('HomeWidgetBridge').updateSnapshot(json);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns latest Android widget debug snapshot JSON when available.
 */
export function getAndroidHomeWidgetDebugSnapshot(): string | null {
  if (Platform.OS !== 'android') return null;
  try {
    const { requireNativeModule } = require('expo-modules-core') as typeof import('expo-modules-core');
    return requireNativeModule<{ getDebugSnapshot: () => string | null }>('HomeWidgetBridge').getDebugSnapshot();
  } catch {
    return null;
  }
}
