import { requireOptionalNativeModule } from 'expo-modules-core';
import { File, Paths } from 'expo-file-system';
import { Image as RNImage, Platform } from 'react-native';
import { updateAndroidHomeWidgetSnapshot } from 'home-widget-bridge';
import { buildHomeWidgetProps, type HomeWidgetProps } from './lib/homeWidgetProps';
import { updateGradeUpTodayTimelineFromHost } from './iosWidgetTimelineSync';
import type { Course, Task, TimetableEntry } from './types';
import type { ThemeId } from '@/constants/Themes';
import type { CustomThemeColors } from './storage';
import { getTodayISO } from './utils/date';
import { captureError } from './lib/monitoring';

const IOS_WIDGET_APP_GROUP_ID = 'group.com.aizztech.rencana';
const SPIDER_WEB_FILENAME = 'spider-widget-web.png';

function iosWidgetSnapshotModulesAvailable(): boolean {
  const hasExpoWidgets = requireOptionalNativeModule('ExpoWidgets') != null;
  // Timeline storage belongs to ExpoWidgets. Requiring ExpoUI here caused a
  // false negative in development clients where SwiftUI views are available
  // to the extension but ExpoUI is not exposed as a host-app native module.
  // Widget-module import failures are already caught by iosWidgetTimelineSync,
  // which can fall back to the ExpoWidgets host handle.
  return hasExpoWidgets;
}

function ensureSpiderWebImageUri(): string | undefined {
  if (Platform.OS !== 'ios') return undefined;
  try {
    const shared = Paths.appleSharedContainers?.[IOS_WIDGET_APP_GROUP_ID];
    if (!shared) return undefined;

    const dest = new File(shared, SPIDER_WEB_FILENAME);
    const source = RNImage.resolveAssetSource(require('../assets/spider-widget-web.png'));
    const srcUri = typeof source?.uri === 'string' ? source.uri : '';
    if (!srcUri.startsWith('file://')) return undefined;

    const src = new File(srcUri);
    if (!src.exists || src.size <= 0) return undefined;
    // Always replace to avoid stale cached image in widget shared container.
    if (dest.exists) dest.delete();
    src.copy(dest);
    return dest.uri;
  } catch {
    return undefined;
  }
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
  themePack?: string;
  customThemeColors?: CustomThemeColors | null;
  spiderBlueAccents?: boolean;
  maxTasks?: number;
  /** Omit to suppress the widget's recommendation — see buildHomeWidgetProps. */
  recommendationFeedback?: import('./lib/recommendationDb').RecommendationFeedback[];
}

/** Returns YYYY-MM-DD that's `n` days after the given ISO date (local time). */
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * How many days of snapshots to pack into one sync.
 *
 * This used to be 2 (today + tomorrow), which only rolls the widget over once.
 * WidgetKit's reload policy is `.atEnd`, so when the last entry's date passes
 * it does ask for a fresh timeline — but the provider just re-reads the same
 * array the app wrote to the shared container, and nothing outside the app can
 * regenerate it. So once both entries were in the past the widget froze on
 * tomorrow's snapshot and never advanced again. That is invisible on a phone,
 * which gets opened daily, and obvious on a Mac or iPad that goes days between
 * launches. Two weeks of entries costs a few tens of KB and covers that gap.
 */
const WIDGET_TIMELINE_DAYS = 14;

/** Date object for local 00:00 `n` days from today (n = 0 → this morning). */
function localMidnightInDays(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Pushes a multi-day snapshot pack so the widget rolls over at every local
 * midnight without the app being re-opened — see WIDGET_TIMELINE_DAYS.
 *
 * - iOS: pushed as a WidgetKit timeline `[now, +1d 00:00, +2d 00:00, …]`.
 *   WidgetKit shows each entry once its date arrives.
 * - Android: pushed as `{ days: [...], today, tomorrow }` JSON; the native
 *   renderer picks the slot whose `dateISO` matches the device's local date.
 *   `today`/`tomorrow` stay in the payload so a widget still running an older
 *   native renderer keeps working as it did before.
 */
export function syncHomeScreenWidget(input: WidgetSyncInputs): void {
  const todayISO = getTodayISO();
  const spiderWebImageUri = ensureSpiderWebImageUri();

  const days: HomeWidgetProps[] = Array.from({ length: WIDGET_TIMELINE_DAYS }, (_, i) =>
    buildHomeWidgetProps({ ...input, todayISO: addDaysISO(todayISO, i), spiderWebImageUri }),
  );

  if (Platform.OS === 'android') {
    const ok = updateAndroidHomeWidgetSnapshot(
      JSON.stringify({ days, today: days[0], tomorrow: days[1] }),
    );
    if (!ok) captureError(new Error('Android home widget bridge unavailable'), { operation: 'home_widget_refresh', platform: 'android' });
    return;
  }

  if (Platform.OS !== 'ios') return;
  if (!iosWidgetSnapshotModulesAvailable()) return;

  // The first entry is dated `now`, not this morning's midnight: WidgetKit
  // needs an entry that is already current when the timeline lands.
  const ok = updateGradeUpTodayTimelineFromHost(
    days.map((props, i) => ({ date: i === 0 ? new Date() : localMidnightInDays(i), props })),
  );
  if (!ok) captureError(new Error('iOS home widget timeline unavailable'), { operation: 'home_widget_refresh', platform: 'ios' });
}
