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

let cachedWidget: InstanceType<NativeExpoWidgets['Widget']> | null = null;

function getNativeWidgetHandle(): InstanceType<NativeExpoWidgets['Widget']> | null {
  const mod = requireOptionalNativeModule<NativeExpoWidgets>('ExpoWidgets');
  if (!mod?.Widget) return null;
  if (!cachedWidget) {
    cachedWidget = new mod.Widget('GradeUpToday', hostTimelineLayoutPlaceholder);
  }
  return cachedWidget;
}

export function updateGradeUpTodayTimelineFromHost(props: HomeWidgetProps): void {
  try {
    const w = getNativeWidgetHandle();
    if (!w) return;
    w.updateTimeline([{ timestamp: Date.now(), props }]);
  } catch (e) {
    if (__DEV__) console.warn('[Rencana] iOS widget timeline sync failed', e);
  }
}
