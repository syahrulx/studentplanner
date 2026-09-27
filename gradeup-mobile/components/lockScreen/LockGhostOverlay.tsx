import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { SymbolView } from 'expo-symbols';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { fmtGhostDate } from '@/src/lib/lockScreen/lockScreenFormat';
import type { LockTopPreset } from '@/src/lib/lockScreen/types';

/**
 * A faint stand-in for what iOS itself draws over the wallpaper: the date,
 * the clock, a widget row, the flashlight and camera buttons and the home
 * bar. It lets the student see whether their card collides with any of it.
 *
 * Preview only. It is never inside a captured view, because the real lock
 * screen draws all of this on top of the picture by itself.
 *
 * Laid out in canvas points (the same W × H as LockCanvas) so it can sit in
 * the preview's scaled layer and line up with the card at any preview size.
 *
 * Usage:
 *   <LockGhostOverlay W={W} H={H} s={s} top={config.top} dateISO={day} uses24h={model.uses24h} visible={ghostOn} />
 */

export interface LockGhostOverlayProps {
  /** Canvas size in pt and s = W / 393, from getLockCanvasSize(). */
  W: number;
  H: number;
  s: number;
  /** Which clock layout to imitate (the Layout tab's "top of your lock screen"). */
  top: LockTopPreset;
  /** Local 'YYYY-MM-DD' shown in the date line: the selected day, or today for the Backup picture. */
  dateISO: string;
  /** iOS writes "09:41" in 24-hour mode and "9:41" otherwise. */
  uses24h: boolean;
  /** Fades the whole ghost in and out (the preview's eye toggle). Default true. */
  visible?: boolean;
}

const INK = 'rgba(255,255,255,0.92)';
const FILL = 'rgba(255,255,255,0.14)';
const BUTTON_FILL = 'rgba(255,255,255,0.16)';
const ICON_TINT = 'rgba(255,255,255,0.85)';
const FADE_MS = 200;

/**
 * SF Pro's line box without a lineHeight is 1.193 em tall with the baseline
 * 0.952 em from its top, and digits are 0.705 em tall. So the box's centre
 * sits within 0.003 em of the digits' centre, which is why the clock is
 * centred as a plain box rather than with lineHeight = fontSize: iOS keeps the
 * descent when a lineHeight is smaller than the font's, which would lift the
 * digits by about 0.09 em. The baseline is 0.3555 em below the box's centre.
 */
const BASELINE_BELOW_CENTRE_EM = 0.3555;
/** "9:41" in SF Pro with the clock's −0.02 em tracking, before it is measured. */
const CLOCK_WIDTH_EM = 2.13;

interface GhostClockProps {
  text: string;
  fontSize: number;
  weight: '600' | '700';
  centreY: number;
  maxWidth: number;
  W: number;
  s: number;
}

/**
 * The time, squeezed horizontally when it would be wider than the screen.
 * That is what iOS 26 does to its stretched clock: taller, not wider.
 */
function GhostClock({ text, fontSize, weight, centreY, maxWidth, W, s }: GhostClockProps) {
  const [width, setWidth] = useState(fontSize * CLOCK_WIDTH_EM);
  const scaleX = width > 0 ? Math.min(1, maxWidth / width) : 1;
  const boxH = fontSize * 1.4;
  const onLayout = (e: LayoutChangeEvent) => {
    const measured = e.nativeEvent.layout.width;
    if (measured > 0 && Math.abs(measured - width) > 0.5) setWidth(measured);
  };
  return (
    // Three screens wide so the text is measured at its natural width, not wrapped at W.
    <View style={[styles.centreRow, { left: -W, width: 3 * W, top: centreY - boxH / 2, height: boxH }]}>
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        onLayout={onLayout}
        style={[
          styles.ink,
          textShadow(s),
          {
            fontSize,
            fontWeight: weight,
            letterSpacing: -0.02 * fontSize,
            transform: [{ scaleX }],
          },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function textShadow(s: number) {
  return {
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowRadius: 8 * s,
    textShadowOffset: { width: 0, height: s },
  };
}

function GhostButton({ glyph, fallback, cx, cy, s }: {
  glyph: 'flashlight.off.fill' | 'camera.fill';
  fallback: 'zap' | 'camera';
  cx: number;
  cy: number;
  s: number;
}) {
  const d = 50 * s;
  const icon = 20 * s;
  return (
    <View
      style={[
        styles.button,
        { left: cx - d / 2, top: cy - d / 2, width: d, height: d, borderRadius: d / 2 },
      ]}
    >
      <SymbolView
        name={glyph}
        size={icon}
        tintColor={ICON_TINT}
        style={{ width: icon, height: icon }}
        fallback={<Feather name={fallback} size={icon} color={ICON_TINT} />}
      />
    </View>
  );
}

function LockGhostOverlayImpl({ W, H, s, top, dateISO, uses24h, visible = true }: LockGhostOverlayProps) {
  const opacity = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    // An opacity fade is fine under Reduce Motion, so it is never skipped.
    opacity.value = withTiming(visible ? 1 : 0, { duration: FADE_MS, reduceMotion: ReduceMotion.Never });
  }, [visible, opacity]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const clock = uses24h ? '09:41' : '9:41';
  const dateSize = 17 * s;
  const dateBoxH = dateSize * 1.6;
  const dateY = 0.105 * H;
  const compact = top === 'compact';
  const dateText = compact
    ? `${fmtGhostDate(dateISO, 'short')}  ${clock}`
    : fmtGhostDate(dateISO);

  const bigClock = top === 'bigClock';
  const clockSize = (bigClock ? 0.3 : 0.165) * H;
  // Standard: digits centred at 0.176 H. Big clock: digits standing on 0.38 H.
  const clockCentreY = bigClock ? 0.38 * H - BASELINE_BELOW_CENTRE_EM * clockSize : 0.176 * H;

  const widgetH = 68 * s;
  const buttonY = 0.912 * H;
  const homeW = 134 * s;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.root, { width: W, height: H }, fadeStyle]}
    >
      <View style={[styles.centreRow, { left: 0, width: W, top: dateY - dateBoxH / 2, height: dateBoxH }]}>
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.ink, textShadow(s), { fontSize: dateSize, fontWeight: '600' }]}
        >
          {dateText}
        </Text>
      </View>

      {compact ? null : (
        <GhostClock
          key={`${clock}|${clockSize}|${bigClock}`}
          text={clock}
          fontSize={clockSize}
          weight={bigClock ? '700' : '600'}
          centreY={clockCentreY}
          maxWidth={W - (bigClock ? 48 : 40) * s}
          W={W}
          s={s}
        />
      )}

      {top === 'widgets' ? (
        <View style={[styles.widgetRow, { top: 0.29 * H - widgetH / 2, height: widgetH, gap: 10 * s }]}>
          <View style={[styles.widget, { width: 158 * s, height: widgetH, borderRadius: 18 * s }]} />
          <View style={[styles.widget, { width: widgetH, height: widgetH, borderRadius: widgetH / 2 }]} />
          <View style={[styles.widget, { width: widgetH, height: widgetH, borderRadius: widgetH / 2 }]} />
        </View>
      ) : null}

      <GhostButton glyph="flashlight.off.fill" fallback="zap" cx={46 * s} cy={buttonY} s={s} />
      <GhostButton glyph="camera.fill" fallback="camera" cx={W - 46 * s} cy={buttonY} s={s} />

      <View
        style={[
          styles.homeBar,
          { left: (W - homeW) / 2, width: homeW, height: 5 * s, borderRadius: 2.5 * s, bottom: 8 * s },
        ]}
      />
    </Animated.View>
  );
}

export const LockGhostOverlay = memo(LockGhostOverlayImpl);
export default LockGhostOverlay;

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  centreRow: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ink: {
    color: INK,
    textAlign: 'center',
  },
  widgetRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  widget: {
    backgroundColor: FILL,
  },
  button: {
    position: 'absolute',
    backgroundColor: BUTTON_FILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBar: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
});
