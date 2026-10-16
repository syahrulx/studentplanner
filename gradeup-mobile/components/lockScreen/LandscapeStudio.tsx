import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View, type LayoutChangeEvent } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Animated from 'react-native-reanimated';

import SegmentedControl, { type SegmentedOption } from '@/components/SegmentedControl';
import type { ThemePalette } from '@/constants/Themes';
import { contrastText } from '@/src/lib/contrast';
import { lockChromeAccent } from '@/src/lib/lockScreen/lockScreenPalette';
import type { TranslationKey } from '@/src/i18n';
import {
  DEFAULT_LANDSCAPE_OPTIONS,
  sanitizeLandscapeOptions,
  type LandscapeLayout,
  type LandscapeOptions,
  type LandscapeTemplate,
  type LockShape,
} from '@/src/lib/lockScreen/lockLandscape';
import type { LockScreenConfig, LockScreenDayModel } from '@/src/lib/lockScreen/types';

import LockCanvas from './LockCanvas';
import { trayRowEntering } from './StudioTabs';

/**
 * The Studio's tablet and laptop mode (see lockLandscape.ts): the screen
 * picker, the two trays that change in landscape, and a plain scaled preview.
 * The phone's own controls and preview are untouched.
 */

type T_ = (key: TranslationKey) => string;

const STORE_KEY = 'lock_landscape_v1';
/** Same off track as the Show tab's switches. */
const TRACK_OFF = 'rgba(255,255,255,0.16)';

/** Per device: which screen the Studio is designing for. Never part of the phone's config. */
export function useLandscapeOptions(): [LandscapeOptions, (patch: Partial<LandscapeOptions>) => void] {
  const [opts, setOpts] = useState<LandscapeOptions>(DEFAULT_LANDSCAPE_OPTIONS);
  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => {
        if (raw) setOpts(sanitizeLandscapeOptions(JSON.parse(raw)));
      })
      .catch(() => {});
  }, []);
  const update = useCallback((patch: Partial<LandscapeOptions>) => {
    setOpts((prev) => {
      const next = sanitizeLandscapeOptions({ ...prev, ...patch });
      AsyncStorage.setItem(STORE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  return [opts, update];
}

export function ScreenShapeRow({
  opts,
  onChange,
  T,
  reduceMotion,
  row = 0,
}: {
  opts: LandscapeOptions;
  onChange: (patch: Partial<LandscapeOptions>) => void;
  T: T_;
  reduceMotion: boolean;
  row?: number;
}) {
  const options: SegmentedOption<LockShape>[] = [
    { value: 'phone', label: T('lsShapePhone') },
    { value: 'tablet', label: T('lsShapeTablet') },
    { value: 'laptop', label: T('lsShapeLaptop') },
  ];
  return (
    <Animated.View entering={trayRowEntering(row, reduceMotion)} style={styles.block}>
      <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {T('lsScreen')}
      </Text>
      <SegmentedControl
        options={options}
        value={opts.shape}
        onChange={(shape) => onChange({ shape })}
        reduceMotion={reduceMotion}
        accessibilityLabel={T('lsScreen')}
      />
    </Animated.View>
  );
}

/** Layout tray in landscape: the screen, and on a tablet room for its widget column. */
export function LandscapeLayoutPanel({
  opts,
  onChange,
  T,
  reduceMotion,
  accent,
}: {
  opts: LandscapeOptions;
  onChange: (patch: Partial<LandscapeOptions>) => void;
  T: T_;
  reduceMotion: boolean;
  /** The dark-glass accent (ink.accent); lifted for the track like the Show tab does. */
  accent: string;
}) {
  const trackOn = contrastText(accent) === '#ffffff' ? lockChromeAccent(accent) : '#8E8E93';
  const toggleWidgets = (widgetsLeft: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    onChange({ widgetsLeft });
  };
  return (
    <View style={styles.root}>
      <ScreenShapeRow opts={opts} onChange={onChange} T={T} reduceMotion={reduceMotion} row={0} />
      {opts.shape === 'tablet' ? (
        <Animated.View entering={trayRowEntering(1, reduceMotion)} style={styles.block}>
          <Pressable
            style={styles.switchRow}
            onPress={() => toggleWidgets(!opts.widgetsLeft)}
            accessibilityRole="switch"
            accessibilityState={{ checked: opts.widgetsLeft }}
            accessibilityLabel={T('lsWidgetsLeft')}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {T('lsWidgetsLeft')}
              </Text>
              <Text style={styles.hint} numberOfLines={2} maxFontSizeMultiplier={1.2}>
                {T('lsWidgetsLeftSub')}
              </Text>
            </View>
            <Switch
              value={opts.widgetsLeft}
              onValueChange={toggleWidgets}
              trackColor={{ false: TRACK_OFF, true: trackOn }}
              ios_backgroundColor={TRACK_OFF}
              importantForAccessibility="no"
            />
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View entering={trayRowEntering(1, reduceMotion)} style={styles.block}>
          <Text style={styles.hint} numberOfLines={2} maxFontSizeMultiplier={1.2}>
            {T('lsLaptopHint')}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

/** Template tray in landscape: only the two pictures that never go out of date. */
export function LandscapeTemplatePanel({
  opts,
  onChange,
  T,
  reduceMotion,
}: {
  opts: LandscapeOptions;
  onChange: (patch: Partial<LandscapeOptions>) => void;
  T: T_;
  reduceMotion: boolean;
}) {
  const options: SegmentedOption<LandscapeTemplate>[] = [
    { value: 'timetable', label: T('lsTplTimetable') },
    { value: 'grid', label: T('lsTplGrid') },
  ];
  return (
    <View style={styles.root}>
      <Animated.View entering={trayRowEntering(0, reduceMotion)} style={styles.block}>
        <SegmentedControl
          options={options}
          value={opts.template}
          onChange={(template) => onChange({ template })}
          reduceMotion={reduceMotion}
          accessibilityLabel={T('lsTabTemplate')}
        />
      </Animated.View>
      <Animated.View entering={trayRowEntering(1, reduceMotion)} style={styles.block}>
        <Text style={styles.hint} numberOfLines={3} maxFontSizeMultiplier={1.2}>
          {opts.template === 'grid' ? T('lsTplGridSub') : T('lsLandTimetableSub')}
          {'  ·  '}
          {T('lsLandOnlyUndated')}
        </Text>
      </Animated.View>
    </View>
  );
}

/**
 * The landscape picture scaled to the space, with a faint stand-in for where
 * the clock goes. No drag: the card's place is fixed by the screen's layout.
 */
export function LandscapePreview({
  layout,
  model,
  config,
  theme,
  darkMinimal,
  T,
  shape,
  widgetsLeft,
}: {
  layout: LandscapeLayout;
  model: LockScreenDayModel;
  config: LockScreenConfig;
  theme: ThemePalette;
  darkMinimal: boolean;
  T: T_;
  shape: LockShape;
  widgetsLeft: boolean;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b.w === width && b.h === height ? b : { w: width, h: height }));
  }, []);
  const { W, H, s } = layout;
  const k = useMemo(() => (box.w && box.h ? Math.min((box.w - 32) / W, box.h / H) : 0), [box, W, H]);
  const clockTop = H * (shape === 'laptop' ? 0.08 : 0.07);

  return (
    <View style={styles.previewBox} onLayout={onLayout}>
      {k > 0 ? (
        <View
          style={[styles.frame, { width: W * k, height: H * k, borderRadius: (shape === 'laptop' ? 10 : 18) * s * k }]}
          accessibilityRole="image"
          accessibilityLabel={T('lsA11yLandPreview')}
        >
          <View style={[styles.canvasLayer, { width: W, height: H, transform: [{ scale: k }] }]}>
            <LockCanvas
              model={model}
              config={config}
              W={W}
              H={H}
              s={s}
              theme={theme}
              darkMinimal={darkMinimal}
              T={T}
              landscape={layout}
            />
            {/* Where the system draws the time; not part of the saved picture. */}
            <View pointerEvents="none" style={[styles.ghostClock, { top: clockTop }]}>
              <Text allowFontScaling={false} style={[styles.ghostTime, { fontSize: 96 * s, lineHeight: 104 * s }]}>
                9:41
              </Text>
            </View>
            {shape === 'tablet' && widgetsLeft ? (
              <View
                pointerEvents="none"
                style={[styles.ghostWidgets, { left: W * 0.05, top: H * 0.34, width: W * 0.22, height: H * 0.5, borderRadius: 20 * s }]}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center' },
  block: { marginBottom: 10 },
  label: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: '700' },
  hint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  previewBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  canvasLayer: { position: 'absolute', left: 0, top: 0, transformOrigin: 'top left' },
  frame: { overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  ghostClock: { position: 'absolute', left: 0, right: 0, alignItems: 'center', opacity: Platform.OS === 'web' ? 0.5 : 0.55 },
  ghostTime: { color: '#fff', fontWeight: '600' },
  ghostWidgets: { position: 'absolute', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.45)' },
});
