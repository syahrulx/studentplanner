import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { TranslationKey } from '@/src/i18n';
import { lockScreenUses24h, fmtWhen } from '@/src/lib/lockScreen/lockScreenFormat';
import type { LockRenderState, LockScreenHealth, LockScreenSetupState } from '@/src/lib/lockScreen/types';

/**
 * The Studio's status pill (spec §3.2): a dot and one line saying whether the
 * lock screen is keeping itself fresh, with a progress hairline under it while
 * pictures are drawn.
 *
 * Props:
 * - `health`, `setup`, `renderState`: straight from useLockScreenHealth().
 * - `loaded`: pass useLockScreenHealth().loaded; until then the pill keeps its
 *   slot but shows nothing, rather than flashing "off" or "setup".
 * - `accent`: the progress fill. Use the dark-glass accent lifted for the
 *   dark Studio (lockChromeAccent), so a dark theme colour stays visible.
 * - `running`: a manual Update now is in flight → spinner + "Updating…".
 * - `configEditedAt`: set to Date.now() on every design edit. While healthy or
 *   pending, the pill then says for 3 s that changes show on the next update
 *   (or when Rencana closes, once that automation is confirmed). The notice
 *   waits for the redraw the edit triggers, since "Preparing" outranks it.
 * - `successAt`: set to Date.now() when Update now returns ok. The dot morphs
 *   into a check for a moment and the pill plays the Success haptic.
 * - `onPress`: opens the Studio's action sheet.
 *
 * Haptics owned here, so the caller must not repeat them: Success with the
 * check morph, and Warning the first time per app session the pill turns stale.
 *
 * Unsupported devices: Android and iPad render nothing (return null); a build
 * without the App Group shows the lsUnavailable caption in the pill's slot.
 *
 * lockHealthPill() gives the pill's resting text and colour for a health
 * value, for the action sheet title and the Smart automations card.
 */

export const LOCK_PILL_COLORS = {
  off: '#8E8E93',
  setup: '#FF9F0A',
  pending: '#0A84FF',
  healthy: '#30D158',
  stale: '#FF9F0A',
} as const;

const PREPARING_COLOR = '#0A84FF';
const CHECK_COLOR = '#30D158';

export interface LockHealthPill {
  text: string;
  color: string;
  /** The dot breathes while we're waiting on something outside the app. */
  pulse: boolean;
}

export interface LockHealthPillOptions {
  now: number;
  uses24h: boolean;
  /** setup.completedAt: "since" for a stale lock screen that was never served. */
  setupCompletedAt?: number | null;
}

/** The pill's resting state for a health value, or null when there is no pill (unsupported). */
export function lockHealthPill(
  health: LockScreenHealth,
  T: (key: TranslationKey) => string,
  { now, uses24h, setupCompletedAt }: LockHealthPillOptions,
): LockHealthPill | null {
  switch (health.kind) {
    case 'unsupported':
      return null;
    case 'off':
      return { text: T('lsPillOff'), color: LOCK_PILL_COLORS.off, pulse: false };
    case 'setup':
      return { text: T('lsPillSetup'), color: LOCK_PILL_COLORS.setup, pulse: false };
    case 'pending':
      return { text: T('lsPillPending'), color: LOCK_PILL_COLORS.pending, pulse: true };
    case 'healthy':
      return {
        text: T('lsPillUpdated').replace('{when}', fmtWhen(health.lastServedAt, now, T, uses24h)),
        color: LOCK_PILL_COLORS.healthy,
        pulse: false,
      };
    case 'stale': {
      const since = health.lastServedAt ?? setupCompletedAt ?? null;
      // Never served and no setup time to quote: "waiting" is the honest line.
      const text =
        since == null
          ? T('lsPillPending')
          : T('lsPillStale').replace('{when}', fmtWhen(since, now, T, uses24h));
      return { text, color: LOCK_PILL_COLORS.stale, pulse: false };
    }
  }
}

export interface LockStatusPillProps {
  health: LockScreenHealth;
  setup: LockScreenSetupState;
  renderState: LockRenderState;
  T: (key: TranslationKey) => string;
  accent: string;
  reduceMotion: boolean;
  loaded?: boolean;
  running?: boolean;
  configEditedAt?: number | null;
  successAt?: number | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

type DotMode = 'dot' | 'spinner' | 'check';

const PILL_H = 26;
const HAIRLINE_W = 80;
const CHANGES_NOTICE_MS = 3000;
/** The render host waits 400 ms after an edit; give it that long to start drawing. */
const CHANGES_SETTLE_MS = 700;
const CHECK_HOLD_MS = 2400;
/** "just now" turns into a time after a minute, so the text has to tick. */
const WHEN_TICK_MS = 30_000;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Once per app session, however many times the Studio is opened. */
let staleWarningPlayed = false;

export function LockStatusPill({
  health,
  setup,
  renderState,
  T,
  accent,
  reduceMotion,
  loaded = true,
  running = false,
  configEditedAt = null,
  successAt = null,
  onPress,
  style,
}: LockStatusPillProps) {
  const uses24h = useMemo(() => lockScreenUses24h(), []);
  const now = useTicker(health.kind === 'healthy' || health.kind === 'stale');
  const rendering = renderState.phase === 'rendering';
  const changesEligible = health.kind === 'healthy' || health.kind === 'pending';
  const changesNotice = useChangesNotice(configEditedAt, running || rendering);
  const checkVisible = useCheckMorph(successAt);
  const pressed = useSharedValue(1);
  const pressedStyle = useAnimatedStyle(() => ({ opacity: pressed.value }));

  useEffect(() => {
    if (!loaded || health.kind !== 'stale' || staleWarningPlayed) return;
    staleWarningPlayed = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [loaded, health.kind]);

  if (health.kind === 'unsupported') {
    if (health.reason !== 'noAppGroup') return null;
    return (
      <View style={[styles.slot, style]}>
        <Text style={styles.unavailable} numberOfLines={2} maxFontSizeMultiplier={1.2}>
          {T('lsUnavailable')}
        </Text>
      </View>
    );
  }

  const base = lockHealthPill(health, T, { now, uses24h, setupCompletedAt: setup.completedAt });
  if (!loaded || !base) return <View style={[styles.slot, style]} />;

  // Transient overrides, highest first (spec §3.2).
  let text = base.text;
  let color = base.color;
  let pulse = base.pulse;
  let mode: DotMode = 'dot';
  if (running) {
    text = T('lsPillUpdating');
    color = LOCK_PILL_COLORS.pending;
    mode = 'spinner';
  } else if (rendering) {
    const total = Math.max(renderState.total, 1);
    text = T('lsPillPreparing')
      .replace('{n}', String(Math.min(renderState.done + 1, total)))
      .replace('{total}', String(total));
    color = PREPARING_COLOR;
    pulse = true;
  } else if (changesNotice && changesEligible) {
    text = T(setup.closeAutomationConfirmedAt ? 'lsPillChangesOnClose' : 'lsPillChanges');
  }
  if (!running && checkVisible) mode = 'check';

  const progress = rendering && renderState.total > 0 ? renderState.done / renderState.total : null;

  return (
    <View style={[styles.slot, style]}>
      {/* The pill itself carries the layout transition: its parent never moves, so a
          width change grows it from the centre instead of from its left edge. */}
      <AnimatedPressable
        entering={FadeIn.duration(200)}
        layout={reduceMotion ? undefined : LinearTransition.springify().damping(20).stiffness(220).mass(1)}
        onPress={onPress}
        onPressIn={() => {
          pressed.value = withTiming(0.7, { duration: 90 });
        }}
        onPressOut={() => {
          pressed.value = withTiming(1, { duration: 150 });
        }}
        disabled={!onPress}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityHint={onPress ? T('lsA11yMore') : undefined}
        style={[styles.pill, pressedStyle]}
      >
        <StatusDot mode={mode} color={color} pulse={pulse} reduceMotion={reduceMotion} />
        <Animated.Text
          key={text}
          entering={FadeIn.duration(180)}
          style={styles.text}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
        >
          {text}
        </Animated.Text>
      </AnimatedPressable>
      {progress != null ? <ProgressHairline progress={progress} accent={accent} /> : null}
    </View>
  );
}

export default LockStatusPill;

/** Date.now(), refreshed on an interval while the text contains a relative time. */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), WHEN_TICK_MS);
    return () => clearInterval(id);
  }, [active]);
  return active ? now : Date.now();
}

/**
 * True for 3 s after an edit, but only once nothing outranks it: an edit
 * starts a redraw ("Preparing" wins), and the notice matters most after that
 * redraw is done. If a redraw starts while it shows, it steps aside and comes
 * back for a full 3 s when the redraw ends.
 */
function useChangesNotice(editedAt: number | null, busy: boolean): boolean {
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const [shownAt, setShownAt] = useState<number | null>(null);
  const lastEdit = useRef(editedAt);

  useEffect(() => {
    if (editedAt == null || editedAt === lastEdit.current) return;
    lastEdit.current = editedAt;
    setArmedAt(editedAt);
  }, [editedAt]);

  useEffect(() => {
    if (armedAt == null || busy) return;
    const id = setTimeout(() => {
      setArmedAt(null);
      setShownAt(Date.now());
    }, CHANGES_SETTLE_MS);
    return () => clearTimeout(id);
  }, [armedAt, busy]);

  useEffect(() => {
    if (shownAt == null) return;
    if (busy) {
      setShownAt(null);
      setArmedAt(shownAt);
      return;
    }
    const id = setTimeout(() => setShownAt(null), CHANGES_NOTICE_MS);
    return () => clearTimeout(id);
  }, [shownAt, busy]);

  return shownAt != null;
}

/** True for a moment after each new `successAt`; plays the Success haptic as it starts. */
function useCheckMorph(successAt: number | null): boolean {
  const [visible, setVisible] = useState(false);
  const lastSuccess = useRef(successAt);

  useEffect(() => {
    if (successAt == null || successAt === lastSuccess.current) return;
    lastSuccess.current = successAt;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setVisible(true);
    const id = setTimeout(() => setVisible(false), CHECK_HOLD_MS);
    return () => clearTimeout(id);
  }, [successAt]);

  return visible;
}

function StatusDot({
  mode,
  color,
  pulse,
  reduceMotion,
}: {
  mode: DotMode;
  color: string;
  pulse: boolean;
  reduceMotion: boolean;
}) {
  if (mode === 'spinner') return <SpinnerDot color={color} />;
  if (mode === 'check') return <CheckDot reduceMotion={reduceMotion} />;
  return <PulseDot color={color} pulse={pulse && !reduceMotion} />;
}

function PulseDot({ color, pulse }: { color: string; pulse: boolean }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!pulse) {
      cancelAnimation(opacity);
      opacity.value = withTiming(1, { duration: 150 });
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
    return () => cancelAnimation(opacity);
  }, [pulse, opacity]);

  // Separate styles: the pulse runs every frame, the colour only moves when it changes.
  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const colorStyle = useAnimatedStyle(() => ({ backgroundColor: withTiming(color, { duration: 250 }) }));

  return (
    <Animated.View style={pulseStyle}>
      <Animated.View style={[styles.dot, colorStyle]} />
    </Animated.View>
  );
}

/** A 6-pt dot can't hold a system spinner, so the dot becomes a turning ring of the same size. */
function SpinnerDot({ color }: { color: string }) {
  const turn = useSharedValue(0);

  useEffect(() => {
    turn.value = withRepeat(withTiming(360, { duration: 800, easing: Easing.linear }), -1);
    return () => cancelAnimation(turn);
  }, [turn]);

  const animated = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      style={[styles.spinner, { borderColor: color, borderTopColor: 'transparent' }, animated]}
    />
  );
}

function CheckDot({ reduceMotion }: { reduceMotion: boolean }) {
  const scale = useSharedValue(reduceMotion ? 1 : 0.6);
  const opacity = useSharedValue(reduceMotion ? 0 : 1);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = withTiming(1, { duration: 150 });
    } else {
      scale.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.back(1.5)) });
    }
  }, [reduceMotion, scale, opacity]);

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View exiting={FadeOut.duration(150)} style={[styles.check, animated]}>
      <Feather name="check" size={8} color="#FFFFFF" />
    </Animated.View>
  );
}

function ProgressHairline({ progress, accent }: { progress: number; accent: string }) {
  const fill = useSharedValue(progress);

  useEffect(() => {
    fill.value = withTiming(progress, { duration: 250, easing: Easing.out(Easing.quad) });
  }, [progress, fill]);

  const animated = useAnimatedStyle(() => ({ width: HAIRLINE_W * Math.min(Math.max(fill.value, 0), 1) }));

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(200)}
      style={styles.hairline}
      pointerEvents="none"
    >
      <Animated.View style={[styles.hairlineFill, { backgroundColor: accent }, animated]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: {
    height: PILL_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    height: PILL_H,
    borderRadius: PILL_H / 2,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  text: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '700',
  },
  unavailable: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  spinner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    marginHorizontal: -1,
  },
  check: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: CHECK_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    // Grows past the 6-pt dot without pushing the text.
    marginHorizontal: -3,
  },
  hairline: {
    position: 'absolute',
    top: PILL_H + 4,
    width: HAIRLINE_W,
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  hairlineFill: {
    height: 2,
    borderRadius: 1,
  },
});
