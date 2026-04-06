import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { updateAndroidHomeWidgetSnapshot } from 'home-widget-bridge';
import type { HomeWidgetProps } from './lib/homeWidgetProps';

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
    return;
  }

  if (Platform.OS !== 'ios') return;
  if (!iosWidgetSnapshotModulesAvailable()) return;

  void import('../widgets/GradeUpTodayWidget')
    .then((m) => {
      try {
        m.default.updateSnapshot(props);
      } catch (e) {
        if (__DEV__) console.warn('[GradeUp] home widget sync failed', e);
      }
    })
    .catch((e) => {
      if (__DEV__) console.warn('[GradeUp] home widget module load failed', e);
    });
}
