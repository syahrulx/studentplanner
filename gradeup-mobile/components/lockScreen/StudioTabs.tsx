import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import type { TranslationKey } from '@/src/i18n';
import type { LockScreenConfig } from '@/src/lib/lockScreen/types';

/**
 * The Studio's tab strip and the tray it switches (spec §3.2 "Tab strip",
 * §3.3), plus what every tray panel shares.
 *
 * Composition in app/lock-wallpaper.tsx:
 *
 *   const reduceMotion = useReduceMotion();
 *   const [tab, setTab] = useState<StudioTabId>('template');
 *   <StudioTabs value={tab} onChange={setTab} T={T} reduceMotion={reduceMotion}
 *               style={{ marginTop: 12, marginHorizontal: 16 }} />
 *   <StudioTray tab={tab} reduceMotion={reduceMotion} style={{ marginTop: 12 }}>
 *     {tab === 'template' ? <TemplatePicker … /> : tab === 'background' ? <BackgroundPicker … /> : …}
 *   </StudioTray>
 *
 * StudioTabs props: `value`, `onChange(tab)` (called only on a real change,
 * after the selection haptic), `T`, `reduceMotion`, `style` (margins are the
 * caller's: the spec puts 12 above and 16 on each side).
 *
 * StudioTray props: `tab` (the content is re-keyed on it, so the old panel
 * fades out while the new one fades in, 180 ms), `children`, `reduceMotion`,
 * `style`. It is the fixed 156-pt tray with the spec's 16-pt side padding
 * built in, so give it the full screen width (no horizontal margin); panels
 * that scroll sideways bleed through that padding using STUDIO_TRAY_PAD_X.
 *
 * Every tray panel takes StudioPanelProps: the config, the update callback
 * (pass the Studio's own wrapper if it records edits for the pill's "changes
 * show on next update" notice), T and Reduce Motion.
 */

export type StudioTabId = 'template' | 'background' | 'layout' | 'show';

export const STUDIO_TABS: readonly StudioTabId[] = ['template', 'background', 'layout', 'show'];

const TAB_LABEL: Record<StudioTabId, TranslationKey> = {
  template: 'lsTabTemplate',
  background: 'lsTabBackground',
  layout: 'lsTabLayout',
  show: 'lsTabShow',
};

export const STUDIO_TRAY_HEIGHT = 156;

/**
 * The tray height each tab needs.
 *
 * Background carries three rows — swatches, Dim and Card — which measure about
 * 198pt together, so at 156 the Card row sat outside the box with no way to
 * reach it. A student reported exactly that: "saya tak dapat tengok features
 * yang lain kat bawah tu".
 *
 * Only Background is made taller. Raising the shared height would take the
 * same space from the preview on every tab, and on a short phone — where the
 * preview is already down to its 160pt floor — that could push the Save button
 * off the bottom instead.
 */
export const STUDIO_TRAY_HEIGHT_FOR: Record<StudioTabId, number> = {
  template: STUDIO_TRAY_HEIGHT,
  background: 210,
  layout: STUDIO_TRAY_HEIGHT,
  show: STUDIO_TRAY_HEIGHT,
};
export const STUDIO_TRAY_PAD_X = 16;

/** Applies a config patch; the Studio passes the hook's update, or its wrapper around it. */
export type LockConfigUpdate = (patch: Partial<LockScreenConfig>) => unknown;

export interface StudioPanelProps {
  config: LockScreenConfig;
  update: LockConfigUpdate;
  T: (key: TranslationKey) => string;
  /** From useReduceMotion(): slides and pops become short fades. */
  reduceMotion: boolean;
}

/**
 * Reduce Motion, live. Reanimated's useReducedMotion() only reads the setting
 * at launch; spec §6 wants the Studio to follow a change made mid-session.
 */
export function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setEnabled(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setEnabled);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return enabled;
}

/**
 * Entering animation for the i-th row of a tray panel: rows settle in one
 * after another (40 ms apart) on Studio entry and on every tab switch.
 * Stock presets only: a customised one (withInitialValues, Keyframe) becomes a
 * custom keyframe on web, whose cleanup pins the row with position: absolute.
 */
export function trayRowEntering(index: number, reduceMotion: boolean) {
  if (reduceMotion) return FadeIn.duration(150);
  return FadeInDown.delay(index * 40).duration(200);
}

// mass must be explicit: Reanimated 4's default spring has mass 4, which turns
// the spec's (mass 1) damping and stiffness into a slow, seconds-long wobble.
const INDICATOR_SPRING = { damping: 18, stiffness: 240, mass: 1 };
const STRIP_HEIGHT = 36;
const STRIP_PAD = 3;
const TRAY_FADE_MS = 180;

export interface StudioTabsProps {
  value: StudioTabId;
  onChange: (tab: StudioTabId) => void;
  T: (key: TranslationKey) => string;
  reduceMotion: boolean;
  style?: StyleProp<ViewStyle>;
}

export function StudioTabs({ value, onChange, T, reduceMotion, style }: StudioTabsProps) {
  const [width, setWidth] = useState(0);
  const tabW = width > 0 ? (width - STRIP_PAD * 2) / STUDIO_TABS.length : 0;
  const index = Math.max(0, STUDIO_TABS.indexOf(value));

  const indicatorX = useSharedValue(STRIP_PAD);
  const placed = useRef(false);

  useEffect(() => {
    if (tabW <= 0) return;
    const target = STRIP_PAD + index * tabW;
    if (!placed.current || reduceMotion) {
      placed.current = true;
      indicatorX.value = target;
    } else {
      indicatorX.value = withSpring(target, INDICATOR_SPRING);
    }
  }, [index, tabW, reduceMotion, indicatorX]);

  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  const select = useCallback(
    (tab: StudioTabId) => {
      if (tab === value) return;
      Haptics.selectionAsync().catch(() => {});
      onChange(tab);
    },
    [value, onChange],
  );

  return (
    <View style={[styles.strip, style]} onLayout={onLayout} accessibilityRole="tablist">
      {tabW > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.indicator, { width: tabW }, indicatorStyle]} />
      ) : null}
      {STUDIO_TABS.map((tab, i) => (
        <Pressable
          key={tab}
          onPress={() => select(tab)}
          style={styles.tab}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === value }}
          hitSlop={{ top: 6, bottom: 6 }}
        >
          <TabLabel
            label={T(TAB_LABEL[tab])}
            tabX={STRIP_PAD + i * tabW}
            tabW={tabW}
            selected={tab === value}
            indicatorX={indicatorX}
          />
        </Pressable>
      ))}
    </View>
  );
}

export default StudioTabs;

/** Brightens as the indicator arrives, so the label and the capsule move as one. */
function TabLabel({
  label,
  tabX,
  tabW,
  selected,
  indicatorX,
}: {
  label: string;
  tabX: number;
  tabW: number;
  selected: boolean;
  indicatorX: SharedValue<number>;
}) {
  const animated = useAnimatedStyle(() => {
    if (tabW <= 0) return { opacity: selected ? 1 : 0.6 };
    return {
      opacity: interpolate(Math.abs(indicatorX.value - tabX), [0, tabW], [1, 0.6], Extrapolation.CLAMP),
    };
  });
  return (
    <Animated.Text
      style={[styles.tabLabel, animated]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      maxFontSizeMultiplier={1.2}
    >
      {label}
    </Animated.Text>
  );
}

export interface StudioTrayProps {
  tab: StudioTabId;
  children: React.ReactNode;
  reduceMotion: boolean;
  style?: StyleProp<ViewStyle>;
}

export function StudioTray({ tab, children, reduceMotion, style }: StudioTrayProps) {
  const fade = reduceMotion ? 150 : TRAY_FADE_MS;
  return (
    <View style={[styles.tray, { height: STUDIO_TRAY_HEIGHT_FOR[tab] ?? STUDIO_TRAY_HEIGHT }, style]}>
      {/* Both panels are absolutely filled while the old one fades out, so they cross-fade in place. */}
      <Animated.View
        key={tab}
        entering={FadeIn.duration(fade)}
        exiting={FadeOut.duration(fade)}
        style={styles.trayPage}
      >
        {/* Scrollable as a backstop. The heights above are measured for normal
            text; a student on a large accessibility text size can still outgrow
            them, and scrolling to a row beats the row not existing. */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.trayScrollContent}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    height: STRIP_HEIGHT,
    borderRadius: STRIP_HEIGHT / 2,
    padding: STRIP_PAD,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: STRIP_PAD,
    bottom: STRIP_PAD,
    borderRadius: (STRIP_HEIGHT - STRIP_PAD * 2) / 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  tray: {
    // Height is set per tab at the call site; this is only the fallback.
    height: STUDIO_TRAY_HEIGHT,
  },
  trayScrollContent: {
    paddingBottom: 4,
  },
  trayPage: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: STUDIO_TRAY_PAD_X,
  },
});
