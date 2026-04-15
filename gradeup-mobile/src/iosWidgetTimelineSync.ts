import { requireOptionalNativeModule } from 'expo-modules-core';
import type { HomeWidgetProps } from './lib/homeWidgetProps';

/**
 * Host-side widget timeline updates without importing `expo-widgets` JS (that package eagerly
 * calls `requireNativeModule('ExpoWidgets')` and crashes when the native module is missing,
 * e.g. Expo Go or a build without the widget extension linked).
 */
type NativeTimelineEntry = { timestamp: number; props: HomeWidgetProps };
type JsTimelineEntry = { date: Date; props: HomeWidgetProps };
type ResolvedWidgetHandle =
  | { source: 'module'; handle: { updateTimeline: (entries: JsTimelineEntry[]) => void } }
  | { source: 'native'; handle: { updateTimeline: (entries: NativeTimelineEntry[]) => void } };

type NativeExpoWidgets = {
  Widget: new (
    name: string,
    layout: (props: HomeWidgetProps, env: unknown) => unknown,
  ) => {
    updateTimeline: (entries: NativeTimelineEntry[]) => void;
  };
};

function hostTimelineLayoutPlaceholder(_props: HomeWidgetProps, _env: unknown) {
  'widget';
  return null;
}

const cachedWidgets = new Map<string, ResolvedWidgetHandle>();

function getWidgetModule(name: string): { default?: { updateTimeline: (entries: JsTimelineEntry[]) => void } } | null {
  try {
    if (name === 'GradeUpToday') {
      return require('../widgets/GradeUpTodayWidget') as { default?: { updateTimeline: (entries: JsTimelineEntry[]) => void } };
    }
    if (name === 'GradeUpTasks') {
      return require('../widgets/GradeUpTasksWidget') as { default?: { updateTimeline: (entries: JsTimelineEntry[]) => void } };
    }
    if (name === 'GradeUpTimetable') {
      return require('../widgets/GradeUpTimetableWidget') as { default?: { updateTimeline: (entries: JsTimelineEntry[]) => void } };
    }
  } catch (e) {
    void e;
  }
  return null;
}

function getNativeWidgetHandle(name: string): ResolvedWidgetHandle | null {
  const existing = cachedWidgets.get(name);
  if (existing) return existing;

  // Prefer the actual widget instance so timeline updates target the exact same widget identity/layout.
  const widgetMod = getWidgetModule(name);
  const widget = widgetMod?.default;
  if (widget && typeof widget.updateTimeline === 'function') {
    const resolved = { source: 'module', handle: widget } as const;
    cachedWidgets.set(name, resolved);
    return resolved;
  }

  // Fallback path for environments where widget modules cannot be imported.
  const mod = requireOptionalNativeModule<NativeExpoWidgets>('ExpoWidgets');
  if (!mod?.Widget) return null;
  const nativeWidget = new mod.Widget(name, hostTimelineLayoutPlaceholder);
  const resolved = { source: 'native', handle: nativeWidget } as const;
  cachedWidgets.set(name, resolved);
  return resolved;
}

export function updateGradeUpTodayTimelineFromHost(props: HomeWidgetProps): void {
  try {
    const names = ['GradeUpToday', 'GradeUpTasks', 'GradeUpTimetable'];
    for (const name of names) {
      const resolved = getNativeWidgetHandle(name);
      if (!resolved) continue;
      if (resolved.source === 'module') {
        resolved.handle.updateTimeline([{ date: new Date(), props }]);
      } else {
        resolved.handle.updateTimeline([{ timestamp: Date.now(), props }]);
      }
    }
  } catch (e) {
    void e;
  }
}
