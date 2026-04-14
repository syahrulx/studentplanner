import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { getAndroidHomeWidgetDebugSnapshot, updateAndroidHomeWidgetSnapshot } from 'home-widget-bridge';
import type { HomeWidgetProps } from './lib/homeWidgetProps';
import { updateGradeUpTodayTimelineFromHost } from './iosWidgetTimelineSync';

function iosWidgetSnapshotModulesAvailable(): boolean {
  // GradeUpTodayWidget imports @expo/ui (ExpoUI) and uses expo-widgets (ExpoWidgets). Loading that
  // module in Expo Go or other builds without those natives throws synchronously — guard here first.
  return (
    requireOptionalNativeModule('ExpoUI') != null &&
    requireOptionalNativeModule('ExpoWidgets') != null
  );
}

/**
 * Pushes snapshot props to the iOS WidgetKit extension (expo-widgets) and the Android App Widget
 * (home-widget-bridge). No-op on web and other platforms.
 */
export function syncHomeScreenWidget(props: HomeWidgetProps): void {
  const json = JSON.stringify(props);

  if (Platform.OS === 'android') {
    updateAndroidHomeWidgetSnapshot(json);
    if (__DEV__) {
      const debug = getAndroidHomeWidgetDebugSnapshot();
      if (debug) console.log('[Rencana] Android widget debug:', debug);
    }
    return;
  }

  if (Platform.OS !== 'ios') return;
  if (!iosWidgetSnapshotModulesAvailable()) return;

  // Uses requireOptionalNativeModule('ExpoWidgets') — no crash when Expo Go / build has no widget native code.
  updateGradeUpTodayTimelineFromHost(props);
}
