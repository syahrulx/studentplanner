import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * iOS-style segmented control with a thumb that springs between segments.
 *
 * Usage:
 *   <SegmentedControl
 *     options={[{ value: 'dark', label: T('lsPanelDark') }, { value: 'light', label: T('lsPanelLight') }]}
 *     value={config.panel}
 *     onChange={(panel) => update({ panel })}
 *   />
 *
 * Props:
 * - `options`   segments, left to right. Values may be strings or numbers.
 * - `value`     the selected segment's value. A value not in `options` shows no thumb.
 * - `onChange`  called with the new value; never for a tap on the current segment.
 * - `variant`   'dark' (default: the lock screen Studio's dark glass) or 'light'
 *               (UIKit's light appearance: white thumb on a grey track).
 * - `height`    default 32.
 * - `disabled`  dims the control and ignores taps.
 * - `haptics`   selection tick on change, default true.
 * - `reduceMotion` pass the screen's Reduce Motion state; when omitted, the
 *               system setting read at launch is used. With it on, the thumb
 *               jumps and fades in instead of sliding.
 *
 * The labels brighten and the separators hide as the thumb passes over them,
 * driven from the thumb's own position, so both follow the spring exactly
 * rather than snapping at the start or end of the slide.
 */

export type SegmentedValue = string | number;

export interface SegmentedOption<V extends SegmentedValue> {
  value: V;
  label: string;
  /** Defaults to `label`. */
  accessibilityLabel?: string;
}

export type SegmentedVariant = 'dark' | 'light';

export interface SegmentedControlProps<V extends SegmentedValue> {
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  variant?: SegmentedVariant;
  height?: number;
  disabled?: boolean;
  haptics?: boolean;
  reduceMotion?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

interface VariantInk {
  track: string;
  thumb: string;
  thumbShadow: ViewStyle['boxShadow'];
  label: string;
  /** Label opacity away from the thumb. */
  idleOpacity: number;
  separator: string;
}

const INK: Record<SegmentedVariant, VariantInk> = {
  dark: {
    track: 'rgba(118,118,128,0.24)',
    thumb: 'rgba(255,255,255,0.22)',
    thumbShadow: undefined,
    label: '#FFFFFF',
    idleOpacity: 0.7,
    separator: 'rgba(255,255,255,0.14)',
  },
  light: {
    track: 'rgba(118,118,128,0.12)',
    thumb: '#FFFFFF',
    // UIKit's thumb: a tight contact shadow plus a soft one.
    thumbShadow: [
      { offsetX: 0, offsetY: 3, blurRadius: 8, color: 'rgba(0,0,0,0.12)' },
      { offsetX: 0, offsetY: 3, blurRadius: 1, color: 'rgba(0,0,0,0.04)' },
    ],
    label: '#000000',
    idleOpacity: 0.72,
    separator: 'rgba(60,60,67,0.2)',
  },
};

const PAD = 2;
const TRACK_RADIUS = 10;
const THUMB_RADIUS = 8;
// mass must be explicit: Reanimated 4's default spring has mass 4, which turns
// damping 18 / stiffness 240 into a slow, seconds-long wobble.
const SPRING = { damping: 18, stiffness: 240, mass: 1 };
const PRESSED_THUMB_SCALE = 0.95;

export function SegmentedControl<V extends SegmentedValue>({
  options,
  value,
  onChange,
  variant = 'dark',
  height = 32,
  disabled = false,
  haptics = true,
  reduceMotion,
  accessibilityLabel,
  style,
}: SegmentedControlProps<V>) {
  const systemReduceMotion = useReducedMotion();
  const reduced = reduceMotion ?? systemReduceMotion;
  const ink = INK[variant];

  const [trackWidth, setTrackWidth] = useState(0);
  const count = Math.max(options.length, 1);
  const cellW = trackWidth > 0 ? (trackWidth - PAD * 2) / count : 0;
  const index = options.findIndex((o) => o.value === value);

  const thumbX = useSharedValue(PAD);
  const thumbOpacity = useSharedValue(0);
  const thumbScale = useSharedValue(1);
  /** Where the thumb was last sent; null before the first layout or while hidden. */
  const lastTarget = useRef<number | null>(null);

  useEffect(() => {
    if (cellW <= 0) return;
    if (index < 0) {
      lastTarget.current = null;
      thumbOpacity.value = withTiming(0, { duration: 150 });
      return;
    }
    const target = PAD + index * cellW;
    if (lastTarget.current == null) {
      // First layout: appear in place, don't fly in from the left edge.
      thumbX.value = target;
      thumbOpacity.value = 1;
    } else if (target !== lastTarget.current) {
      if (reduced) {
        thumbX.value = target;
        thumbOpacity.value = withSequence(withTiming(0.35, { duration: 0 }), withTiming(1, { duration: 150 }));
      } else {
        thumbX.value = withSpring(target, SPRING);
      }
    }
    lastTarget.current = target;
  }, [index, cellW, reduced, thumbX, thumbOpacity]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const thumbStyle = useAnimatedStyle(() => ({
    opacity: thumbOpacity.value,
    transform: [{ translateX: thumbX.value }, { scale: thumbScale.value }],
  }));

  const select = useCallback(
    (i: number) => {
      const option = options[i];
      if (!option || disabled || i === index) return;
      if (haptics) Haptics.selectionAsync().catch(() => {});
      onChange(option.value);
    },
    [options, disabled, index, haptics, onChange],
  );

  // UIKit squeezes the thumb while the selected segment is held.
  const pressIn = useCallback(
    (i: number) => {
      if (i !== index || reduced) return;
      thumbScale.value = withTiming(PRESSED_THUMB_SCALE, { duration: 120 });
    },
    [index, reduced, thumbScale],
  );
  const pressOut = useCallback(() => {
    thumbScale.value = withSpring(1, SPRING);
  }, [thumbScale]);

  return (
    <View
      onLayout={onLayout}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        { height, backgroundColor: ink.track, opacity: disabled ? 0.4 : 1 },
        style,
      ]}
    >
      {cellW > 0 ? (
        <>
          {options.slice(1).map((option, i) => (
            <Separator
              key={`sep-${String(option.value)}`}
              x={PAD + (i + 1) * cellW}
              cellW={cellW}
              thumbX={thumbX}
              color={ink.separator}
              height={height}
            />
          ))}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                width: cellW,
                top: PAD,
                bottom: PAD,
                backgroundColor: ink.thumb,
                boxShadow: ink.thumbShadow,
              },
              thumbStyle,
            ]}
          />
        </>
      ) : null}
      {options.map((option, i) => (
        <Pressable
          key={String(option.value)}
          onPress={() => select(i)}
          onPressIn={() => pressIn(i)}
          onPressOut={pressOut}
          disabled={disabled}
          style={styles.cell}
          accessibilityRole="button"
          accessibilityLabel={option.accessibilityLabel ?? option.label}
          accessibilityState={{ selected: i === index, disabled }}
        >
          <SegmentLabel
            label={option.label}
            color={ink.label}
            cellX={PAD + i * cellW}
            cellW={cellW}
            idleOpacity={ink.idleOpacity}
            selected={i === index}
            thumbX={thumbX}
          />
        </Pressable>
      ))}
    </View>
  );
}

export default SegmentedControl;

function SegmentLabel({
  label,
  color,
  cellX,
  cellW,
  idleOpacity,
  selected,
  thumbX,
}: {
  label: string;
  color: string;
  cellX: number;
  cellW: number;
  idleOpacity: number;
  selected: boolean;
  thumbX: SharedValue<number>;
}) {
  const animated = useAnimatedStyle(() => {
    // Before the first layout there is no thumb to follow.
    if (cellW <= 0) return { opacity: selected ? 1 : idleOpacity };
    return {
      opacity: interpolate(
        Math.abs(thumbX.value - cellX),
        [0, cellW],
        [1, idleOpacity],
        Extrapolation.CLAMP,
      ),
    };
  });
  return (
    <Animated.Text
      style={[styles.label, { color }, animated]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      maxFontSizeMultiplier={1.2}
    >
      {label}
    </Animated.Text>
  );
}

/** The hairline between two segments; hidden while the thumb touches either side. */
function Separator({
  x,
  cellW,
  thumbX,
  color,
  height,
}: {
  x: number;
  cellW: number;
  thumbX: SharedValue<number>;
  color: string;
  height: number;
}) {
  const animated = useAnimatedStyle(() => {
    const left = thumbX.value;
    const right = left + cellW;
    if (x >= left - 0.5 && x <= right + 0.5) return { opacity: 0 };
    const gap = Math.min(Math.abs(x - left), Math.abs(x - right));
    return { opacity: interpolate(gap, [0, cellW * 0.3], [0, 1], Extrapolation.CLAMP) };
  });
  const lineH = Math.round(height * 0.44);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.separator,
        { left: x - StyleSheet.hairlineWidth / 2, top: (height - lineH) / 2, height: lineH, backgroundColor: color },
        animated,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: TRACK_RADIUS,
    padding: PAD,
    overflow: 'hidden',
  },
  thumb: {
    position: 'absolute',
    left: 0,
    borderRadius: THUMB_RADIUS,
  },
  separator: {
    position: 'absolute',
    width: StyleSheet.hairlineWidth,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
});
