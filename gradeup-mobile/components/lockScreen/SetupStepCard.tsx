import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  LinearTransition,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';

/**
 * The lock screen setup sheet's building blocks (app/lock-screen-setup.tsx):
 * the numbered step card and the controls every step shares, plus the motion
 * and haptic helpers they use.
 *
 * The sheet is always dark, like the Studio, so nothing here reads the app
 * theme; the accent comes in as a prop.
 *
 * Every animation has a Reduce Motion variant (spec §6): scales, slides,
 * bursts and shakes become a 150 ms opacity fade and pulses hold still.
 */

export const SETUP_GREEN = '#30D158';
export const SETUP_AMBER = '#FF9F0A';

export type SetupSymbolName = Extract<SymbolViewProps['name'], string>;
export type SetupFeatherName = ComponentProps<typeof Feather>['name'];

/** An SF Symbol on iOS, with the Feather glyph wherever SF Symbols don't exist. */
export interface SetupIcon {
  sf: SetupSymbolName;
  feather: SetupFeatherName;
}

// ─── Haptics and motion ──────────────────────────────────────────────────────

export function setupHaptic(kind: 'light' | 'success' | 'warn' | 'selection'): void {
  if (kind === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  else if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else if (kind === 'warn') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  else Haptics.selectionAsync().catch(() => {});
}

/**
 * The fade that stands in for motion under Reduce Motion. Marked Never so
 * Reanimated's own system check doesn't skip the fade as well.
 */
export const REDUCED_FADE = { duration: 150, reduceMotion: ReduceMotion.Never } as const;
const BACK_OUT = Easing.out(Easing.back(1.5));

/** Follows the system setting live, so flipping it mid-setup takes effect at once. */
export function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setEnabled(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setEnabled);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}

/** Entering animation for content that appears inside a card. */
export function setupEntering(reduceMotion: boolean) {
  return reduceMotion ? FadeIn.duration(150).reduceMotion(ReduceMotion.Never) : FadeInDown.duration(220);
}

/** Opacity breathing between `min` and 1, one full cycle per `periodMs`. Static when off or under Reduce Motion. */
export function usePulse(active: boolean, periodMs: number, min: number, reduceMotion: boolean) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!active || reduceMotion) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(min, { duration: periodMs / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: periodMs / 2, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    return () => cancelAnimation(opacity);
  }, [active, periodMs, min, reduceMotion, opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

/**
 * ±6 pt × 3 over 300 ms (spec §6 "Errors"). Returns the style for the view to
 * shake and the trigger. Put it on a view without an entering animation: both
 * would write the transform.
 */
export function useShake(reduceMotion: boolean): [AnimatedStyle<ViewStyle>, () => void] {
  const x = useSharedValue(0);
  const opacity = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateX: x.value }] }));
  const shake = useCallback(() => {
    if (reduceMotion) {
      opacity.value = withSequence(withTiming(0.35, { duration: 0 }), withTiming(1, REDUCED_FADE));
      return;
    }
    const leg = { duration: 50 };
    x.value = withSequence(
      withTiming(-6, leg),
      withTiming(6, leg),
      withTiming(-6, leg),
      withTiming(6, leg),
      withTiming(-6, leg),
      withTiming(0, leg),
    );
  }, [reduceMotion, x, opacity]);
  return [style, shake];
}

// ─── Icon ────────────────────────────────────────────────────────────────────

export function SetupSymbol({ sf, feather, size, color }: SetupIcon & { size: number; color: string }) {
  const fallback = <Feather name={feather} size={size} color={color} />;
  if (Platform.OS !== 'ios') return fallback;
  return (
    <SymbolView name={sf} tintColor={color} size={size} style={{ width: size, height: size }} fallback={fallback} />
  );
}

// ─── Check burst ─────────────────────────────────────────────────────────────

/**
 * A green check that springs in with a ring bursting out behind it: the
 * "it worked" moment of step 2, a confirmed automation and the all-set state.
 * Plays once on mount.
 */
export function SetupCheckBurst({ size, reduceMotion }: { size: number; reduceMotion: boolean }) {
  const scale = useSharedValue(reduceMotion ? 1 : 0);
  const ring = useSharedValue(0);
  const fade = useSharedValue(reduceMotion ? 0 : 1);

  useEffect(() => {
    if (reduceMotion) {
      fade.value = withTiming(1, REDUCED_FADE);
      return;
    }
    scale.value = withTiming(1, { duration: 420, easing: BACK_OUT });
    ring.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
    // Plays once; later Reduce Motion flips don't replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkStyle = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : (1 - ring.value) * 0.9,
    transform: [{ scale: 0.8 + 0.8 * ring.value }],
  }));

  return (
    <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: size / 2, borderWidth: Math.max(2, size / 22), borderColor: SETUP_GREEN },
          ringStyle,
        ]}
      />
      <Animated.View style={[styles.center, StyleSheet.absoluteFill, checkStyle]}>
        <SetupSymbol sf="checkmark.circle.fill" feather="check-circle" size={size} color={SETUP_GREEN} />
      </Animated.View>
    </View>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

export interface SetupButtonProps {
  label: string;
  onPress: () => void;
  accent: string;
  onAccent: string;
  reduceMotion: boolean;
  icon?: SetupIcon;
  /** 'tonal' is the glass variant for the second-most-important action. */
  variant?: 'primary' | 'tonal';
  disabled?: boolean;
  /** 'spinner' while something is being prepared, 'pulse' while waiting on Shortcuts. */
  busy?: 'spinner' | 'pulse' | null;
  accessibilityHint?: string;
}

/** Height 50, radius 16, 16/800 label, press scale 0.97 over 90 ms (spec §3.7, §6). */
export function SetupButton({
  label,
  onPress,
  accent,
  onAccent,
  reduceMotion,
  icon,
  variant = 'primary',
  disabled = false,
  busy = null,
  accessibilityHint,
}: SetupButtonProps) {
  const pressed = useSharedValue(0);
  const pulse = usePulse(busy === 'pulse', 900, 0.4, reduceMotion);
  const pressStyle = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: 1 - 0.15 * pressed.value }
      : { transform: [{ scale: 1 - 0.03 * pressed.value }] },
  );

  const primary = variant === 'primary';
  const fg = primary ? onAccent : '#FFFFFF';
  const inactive = disabled || busy != null;

  let leading: ReactNode = null;
  if (busy === 'spinner') leading = <ActivityIndicator size="small" color={fg} />;
  else if (busy === 'pulse') leading = <Animated.View style={[styles.pulseDot, { backgroundColor: fg }, pulse]} />;
  else if (icon) leading = <SetupSymbol {...icon} size={18} color={fg} />;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 90 });
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: 90 });
      }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: busy != null }}
    >
      <Animated.View
        style={[
          styles.button,
          { backgroundColor: primary ? accent : 'rgba(255,255,255,0.10)' },
          inactive && (busy ? styles.buttonBusy : styles.buttonDisabled),
          pressStyle,
        ]}
      >
        {leading}
        <Text style={[styles.buttonText, { color: fg }]} numberOfLines={2}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/** Secondary text action: 14/700 white at 0.8. */
export function SetupLink({
  label,
  onPress,
  color = 'rgba(255,255,255,0.8)',
  trailingChevron = false,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  trailingChevron?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
    >
      <Text style={[styles.linkText, { color }]}>{label}</Text>
      {trailingChevron ? <Feather name="chevron-right" size={15} color={color} /> : null}
    </Pressable>
  );
}

// ─── Step card ───────────────────────────────────────────────────────────────

function StepDot({
  index,
  done,
  active,
  accent,
  onAccent,
  reduceMotion,
}: {
  index: number;
  done: boolean;
  active: boolean;
  accent: string;
  onAccent: string;
  reduceMotion: boolean;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const wasDone = useRef(done);

  useEffect(() => {
    // Only a step finishing while the sheet is open pops; one done before it opened just shows.
    if (done && !wasDone.current) {
      if (reduceMotion) {
        opacity.value = withSequence(withTiming(0.3, { duration: 0 }), withTiming(1, REDUCED_FADE));
      } else {
        scale.value = withSequence(withTiming(0.6, { duration: 0 }), withTiming(1, { duration: 320, easing: BACK_OUT }));
      }
    }
    wasDone.current = done;
  }, [done, reduceMotion, scale, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[
        styles.dot,
        done ? { backgroundColor: SETUP_GREEN } : active ? { backgroundColor: accent } : styles.dotUpcoming,
        style,
      ]}
    >
      {done ? (
        <Feather name="check" size={15} color="#FFFFFF" />
      ) : (
        <Text style={[styles.dotText, { color: active ? onAccent : 'rgba(255,255,255,0.6)' }]}>{index}</Text>
      )}
    </Animated.View>
  );
}

export interface SetupStepCardProps {
  index: 1 | 2 | 3;
  title: string;
  /** "Step 1 of 3", read by VoiceOver before the title. */
  stepLabel: string;
  done: boolean;
  /** Only the step being worked on is expanded. */
  expanded: boolean;
  /** Shown under the title while the card is collapsed and done ("Added", "Worked at 7:02 AM"). */
  doneSubtitle?: string | null;
  /** Tapping a collapsed card opens it. */
  onPressHeader: () => void;
  accent: string;
  onAccent: string;
  reduceMotion: boolean;
  children?: ReactNode;
}

/** One numbered step of the setup sheet (spec §3.7 "Step cards"). */
export default function SetupStepCard({
  index,
  title,
  stepLabel,
  done,
  expanded,
  doneSubtitle,
  onPressHeader,
  accent,
  onAccent,
  reduceMotion,
  children,
}: SetupStepCardProps) {
  const showSubtitle = !expanded && done && !!doneSubtitle;
  const header = (
    <View style={styles.header}>
      <StepDot index={index} done={done} active={expanded} accent={accent} onAccent={onAccent} reduceMotion={reduceMotion} />
      <View style={styles.headerText}>
        <Text style={[styles.title, !done && !expanded && styles.titleUpcoming]} numberOfLines={2}>
          {title}
        </Text>
        {showSubtitle ? (
          <Text style={styles.doneSubtitle} numberOfLines={1}>
            {doneSubtitle}
          </Text>
        ) : null}
      </View>
      {expanded ? null : <Feather name="chevron-down" size={18} color="rgba(255,255,255,0.4)" />}
    </View>
  );

  const a11yLabel = [stepLabel, title, showSubtitle ? doneSubtitle : null].filter(Boolean).join(', ');

  return (
    <Animated.View
      layout={reduceMotion ? undefined : LinearTransition.springify()}
      style={[styles.card, expanded && styles.cardExpanded]}
    >
      {expanded ? (
        <View accessible accessibilityRole="header" accessibilityLabel={a11yLabel}>
          {header}
        </View>
      ) : (
        <Pressable
          onPress={onPressHeader}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          accessibilityState={{ expanded: false }}
          style={({ pressed }) => pressed && styles.headerPressed}
        >
          {header}
        </Pressable>
      )}
      {expanded ? (
        <Animated.View entering={setupEntering(reduceMotion)} style={styles.body}>
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/**
 * The short thread between two step cards, lined up with the step dots. It
 * fills green over 250 ms once the step above it is done.
 */
export function SetupStepConnector({ filled, reduceMotion }: { filled: boolean; reduceMotion: boolean }) {
  const progress = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(filled ? 1 : 0, reduceMotion ? REDUCED_FADE : { duration: 250 });
  }, [filled, reduceMotion, progress]);
  const fillStyle = useAnimatedStyle(() =>
    reduceMotion ? { opacity: progress.value } : { transform: [{ scaleY: progress.value }] },
  );
  return (
    <Animated.View
      layout={reduceMotion ? undefined : LinearTransition.springify()}
      style={styles.connector}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.connectorTrack}>
        <Animated.View style={[styles.connectorFill, fillStyle]} />
      </View>
    </Animated.View>
  );
}

/** A tinted notice row: icon, then text. Used for notes, errors and tips inside the steps. */
export function SetupNote({
  icon,
  iconColor = 'rgba(255,255,255,0.6)',
  children,
  style,
}: {
  icon: SetupFeatherName;
  iconColor?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.note, style]}>
      <Feather name={icon} size={14} color={iconColor} style={styles.noteIcon} />
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

/** Dot centre from the card edge: border 1 + padding 18 + half the 28 pt dot. */
const DOT_CENTER_X = 1 + 18 + 14;

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonBusy: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 1,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  link: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  linkPressed: {
    opacity: 0.55,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  card: {
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
  },
  cardExpanded: {
    backgroundColor: 'rgba(255,255,255,0.075)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerPressed: {
    opacity: 0.7,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  titleUpcoming: {
    color: 'rgba(255,255,255,0.72)',
  },
  doneSubtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    marginTop: 14,
    gap: 12,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotUpcoming: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  dotText: {
    fontSize: 13,
    fontWeight: '900',
  },
  connector: {
    height: 12,
  },
  connectorTrack: {
    position: 'absolute',
    left: DOT_CENTER_X - 1,
    top: 0,
    bottom: 0,
    width: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  connectorFill: {
    flex: 1,
    backgroundColor: SETUP_GREEN,
    transformOrigin: 'top',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noteIcon: {
    marginTop: 2,
  },
  noteText: {
    flex: 1,
    color: 'rgba(255,255,255,0.62)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
