import { Platform } from 'react-native';
import { updateAndroidHomeWidgetSnapshot } from 'home-widget-bridge';
import type { HomeWidgetProps } from './lib/homeWidgetProps';

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
