import { Platform } from 'react-native';
import { updateAndroidHomeWidgetSnapshot } from 'home-widget-bridge';
import type { HomeWidgetProps } from './lib/homeWidgetProps';
import { updateGradeUpTodayTimelineFromHost } from './iosWidgetTimelineSync';

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

  // Uses requireOptionalNativeModule('ExpoWidgets') — no crash when Expo Go / build has no widget native code.
  updateGradeUpTodayTimelineFromHost(props);
}
