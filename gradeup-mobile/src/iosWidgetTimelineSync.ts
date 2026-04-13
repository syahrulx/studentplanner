import React from 'react';
import { View } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { HomeWidgetProps } from './lib/homeWidgetProps';

/**
 * Host-side widget timeline updates without importing `expo-widgets` JS (that package eagerly
 * calls `requireNativeModule('ExpoWidgets')` and crashes when the native module is missing,
 * e.g. Expo Go or a build without the widget extension linked).
 */
type NativeExpoWidgets = {
  Widget: new (
    name: string,
    layout: (props: HomeWidgetProps, env: unknown) => React.ReactNode,
  ) => {
    updateTimeline: (entries: Array<{ timestamp: number; props: HomeWidgetProps }>) => void;
  };
};

function hostTimelineLayoutPlaceholder(_props: HomeWidgetProps, _env: unknown) {
  'widget';
  return React.createElement(View, { collapsable: false, style: { width: 1, height: 1 } });
}

const cachedWidgets = new Map<string, InstanceType<NativeExpoWidgets['Widget']>>();

function getNativeWidgetHandle(name: string): InstanceType<NativeExpoWidgets['Widget']> | null {
  const mod = requireOptionalNativeModule<NativeExpoWidgets>('ExpoWidgets');
  if (!mod?.Widget) return null;
  const existing = cachedWidgets.get(name);
  if (existing) return existing;
  const created = new mod.Widget(name, hostTimelineLayoutPlaceholder);
  cachedWidgets.set(name, created);
  return created;
}

export function updateGradeUpTodayTimelineFromHost(props: HomeWidgetProps): void {
  try {
    const names = ['GradeUpToday', 'GradeUpTasks', 'GradeUpTimetable'];
    for (const name of names) {
      const w = getNativeWidgetHandle(name);
      if (!w) continue;
      w.updateTimeline([{ timestamp: Date.now(), props }]);
    }
  } catch (e) {
    if (__DEV__) console.warn('[Rencana] iOS widget timeline sync failed', e);
  }
}
