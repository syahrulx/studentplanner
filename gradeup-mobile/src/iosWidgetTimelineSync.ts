import { requireOptionalNativeModule } from 'expo-modules-core';
import type { HomeWidgetProps } from './lib/homeWidgetProps';

/**
 * Host-side widget timeline updates without importing `expo-widgets` JS (that package eagerly
 * calls `requireNativeModule('ExpoWidgets')` and crashes when the native module is missing,
 * e.g. Expo Go or a build without the widget extension linked).
 */
type TimelineEntry = { timestamp: number; props: HomeWidgetProps };

type WidgetHandle = {
  updateTimeline: (entries: TimelineEntry[]) => void;
};

type NativeExpoWidgets = {
  Widget: new (
    name: string,
    layout: (props: HomeWidgetProps, env: unknown) => unknown,
  ) => {
    updateTimeline: (entries: TimelineEntry[]) => void;
  };
};

function hostTimelineLayoutPlaceholder(_props: HomeWidgetProps, _env: unknown) {
  'widget';
  return null;
}

const cachedWidgets = new Map<string, WidgetHandle>();

function getWidgetModule(name: string): { default?: WidgetHandle } | null {
  try {
    if (name === 'GradeUpToday') return require('../widgets/GradeUpTodayWidget') as { default?: WidgetHandle };
    if (name === 'GradeUpTasks') return require('../widgets/GradeUpTasksWidget') as { default?: WidgetHandle };
    if (name === 'GradeUpTimetable') return require('../widgets/GradeUpTimetableWidget') as { default?: WidgetHandle };
  } catch (e) {
    if (__DEV__) console.warn('[Rencana] iOS widget module import failed', { name, e });
  }
  return null;
}

function getNativeWidgetHandle(name: string): WidgetHandle | null {
  const existing = cachedWidgets.get(name);
  if (existing) return existing;

  // Prefer the actual widget instance so timeline updates target the exact same widget identity/layout.
  const widgetMod = getWidgetModule(name);
  const widget = widgetMod?.default;
  if (widget && typeof widget.updateTimeline === 'function') {
    if (__DEV__) console.log('[Rencana] iOS widget handle resolved via module', { name });
    cachedWidgets.set(name, widget);
    return widget;
  }

  // Fallback path for environments where widget modules cannot be imported.
  const mod = requireOptionalNativeModule<NativeExpoWidgets>('ExpoWidgets');
  if (!mod?.Widget) return null;
  if (__DEV__) console.log('[Rencana] iOS widget handle resolved via native fallback', { name });
  const nativeWidget = new mod.Widget(name, hostTimelineLayoutPlaceholder);
  cachedWidgets.set(name, nativeWidget);
  return nativeWidget;
}

export function updateGradeUpTodayTimelineFromHost(props: HomeWidgetProps): void {
  try {
    const names = ['GradeUpToday', 'GradeUpTasks', 'GradeUpTimetable'];
    for (const name of names) {
      const w = getNativeWidgetHandle(name);
      if (!w) {
        if (__DEV__) console.log('[Rencana] iOS widget handle missing', { name });
        continue;
      }
      w.updateTimeline([{ timestamp: Date.now(), props }]);
      if (__DEV__) {
        console.log('[Rencana] iOS widget timeline updated', {
          name,
          dateISO: props.dateISO,
          signedIn: props.signedIn,
          tasks: props.tasks.length,
          classes: props.classes.length,
        });
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[Rencana] iOS widget timeline sync failed', e);
  }
}
