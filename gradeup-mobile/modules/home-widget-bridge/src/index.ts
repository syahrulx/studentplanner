import { Platform } from 'react-native';

/**
 * Writes the home-widget JSON snapshot and refreshes Android App Widgets. No-op off Android.
 */
export function updateAndroidHomeWidgetSnapshot(json: string): void {
  if (Platform.OS !== 'android') return;
  try {
    const { requireNativeModule } = require('expo-modules-core') as typeof import('expo-modules-core');
    requireNativeModule<{ updateSnapshot: (j: string) => void }>('HomeWidgetBridge').updateSnapshot(json);
  } catch {
    /* native module missing in old builds */
  }
}
