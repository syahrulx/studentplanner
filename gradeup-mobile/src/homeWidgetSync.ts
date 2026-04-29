import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { updateAndroidHomeWidgetSnapshot } from 'home-widget-bridge';
import { buildHomeWidgetProps, type HomeWidgetProps } from './lib/homeWidgetProps';
import { updateGradeUpTodayTimelineFromHost } from './iosWidgetTimelineSync';
import type { Course, Task, TimetableEntry } from './types';
import type { ThemeId } from '@/constants/Themes';
import { getTodayISO } from './utils/date';

function iosWidgetSnapshotModulesAvailable(): boolean {
  const hasExpoUI = requireOptionalNativeModule('ExpoUI') != null;
  const hasExpoWidgets = requireOptionalNativeModule('ExpoWidgets') != null;
  // GradeUpTodayWidget imports @expo/ui (ExpoUI) and uses expo-widgets (ExpoWidgets). Loading that
  // module in Expo Go or other builds without those natives throws synchronously — guard here first.
  return hasExpoUI && hasExpoWidgets;
}

/** Inputs needed to build a widget snapshot for any given day. */
export interface WidgetSyncInputs {
  tasks: Task[];
  courses: Course[];
  timetable: TimetableEntry[];
  pinnedTaskIds: string[];
  userName: string;
  signedIn: boolean;
  themeId: ThemeId;
  maxTasks?: number;
}

/** Returns YYYY-MM-DD that's `n` days after the given ISO date (local time). */
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Date object representing the next local midnight (00:00 tomorrow). */
function nextLocalMidnight(): Date {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d;
}

/**
 * Pushes a 2-day snapshot pack (today + tomorrow) so the widget can roll over
 * automatically at midnight without requiring the app to be re-opened.
 *
 * - iOS: pushed as a multi-entry WidgetKit timeline `[now, tomorrowMidnight]`.
 *   WidgetKit displays the second entry once the date changes.
 * - Android: pushed as `{ today, tomorrow }` JSON; the native widget renderer
 *   picks the slot whose `dateISO` matches the device's current local date.
 */
export function syncHomeScreenWidget(input: WidgetSyncInputs): void {
  const todayISO = getTodayISO();
  const tomorrowISO = addDaysISO(todayISO, 1);

  const todayProps: HomeWidgetProps = buildHomeWidgetProps({ ...input, todayISO });
  const tomorrowProps: HomeWidgetProps = buildHomeWidgetProps({ ...input, todayISO: tomorrowISO });

  if (Platform.OS === 'android') {
    // Schema: { today: HomeWidgetProps, tomorrow: HomeWidgetProps }
    // (renderer back-compat: also accepts a flat HomeWidgetProps for older builds)
    updateAndroidHomeWidgetSnapshot(JSON.stringify({ today: todayProps, tomorrow: tomorrowProps }));
    return;
  }

  if (Platform.OS !== 'ios') return;
  if (!iosWidgetSnapshotModulesAvailable()) return;

  updateGradeUpTodayTimelineFromHost([
    { date: new Date(), props: todayProps },
    { date: nextLocalMidnight(), props: tomorrowProps },
  ]);
}
