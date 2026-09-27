import React, { cloneElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { ThemePalette } from '@/constants/Themes';
import type { TranslationKey } from '@/src/i18n';
import { fmtGhostDate } from '@/src/lib/lockScreen/lockScreenFormat';
import {
  LOCK_METRICS,
  fitModel,
  lockSafeZone,
  maxPanelHeight,
  recommendedTopFrac,
} from '@/src/lib/lockScreen/lockScreenGeometry';
import { lockScreenA11ySummary } from '@/src/lib/lockScreen/lockScreenModel';
import type {
  LockScreenConfig,
  LockScreenDayModel,
  LockSize,
  LockTemplateId,
} from '@/src/lib/lockScreen/types';
import { getTodayISO } from '@/src/utils/date';

import LockCanvas from './LockCanvas';
import LockGhostOverlay from './LockGhostOverlay';

/**
 * The Studio's live preview: the real LockCanvas scaled into a phone frame,
 * with the ghost of the system clock and buttons over it, and the card
 * draggable into place.
 *
 * Usage (Studio):
 *   <LockPreview
 *     style={{ flex: 1, minHeight: 260, marginTop: 8 }}
 *     model={selectedModel}                 // selected day, or the fallback for Backup
 *     rangeModels={dayModels}               // today..today+6
 *     config={config} W={W} H={H} s={s}
 *     theme={theme} darkMinimal={darkMinimal} T={T}
 *     showCoach={!studioSeen}
 *     onCommitTopFrac={(topFrac) => updateConfig({ topFrac })}
 *     onSizeStepDown={(size) => { updateConfig({ size }); showTooTall(size); }}
 *     onExpand={() => setFullOpen(true)}
 *   />
 *
 * The preview measures its own box and fits the frame inside it (height
 * first, frameW = frameH × W/H). Everything the drag needs to feel right
 * (lift, guides, magnet, rubber band, release spring, haptics, double-tap
 * reset, VoiceOver adjust) lives in useLockPanelDrag, which LockFullPreview
 * reuses at 1:1.
 *
 * Drag contract: onSizeStepDown, when it fires, is called in the same JS tick
 * right before onCommitTopFrac, so both config writes land in one render.
 * onCommitTopFrac(null) means "back to the recommended spot".
 */

// ─── Tunables (canvas pt unless noted) ───────────────────────────────────────

const LIFT_SCALE = 1.02;
const LIFT_MS = 120;
const GUIDE_FADE_MS = 150;
// mass 1 spelled out: Reanimated 4 defaults to mass 4, which turns these
// numbers into a slow wobble.
const RELEASE_SPRING = { damping: 18, stiffness: 220, mass: 1 } as const;
const MAGNET_PT = 12;
const RUBBER_SLOPE = 0.35;
const RUBBER_MAX_PT = 24;
/**
 * Finger travel past the bottom limit, in screen pt, that asks for a smaller
 * card. Measured on the finger rather than the canvas so the push is equally
 * deliberate in the small preview (where 16 canvas pt is ~6 pt of finger) and
 * full size.
 */
const STEP_DOWN_FINGER_PT = 16;
/** A stored topFrac this close to the recommended one is saved as null. */
const RECOMMENDED_EPS = 0.004;
/** VoiceOver adjust step, as a fraction of H. */
const A11Y_STEP = 0.02;
const DOUBLE_TAP_MS = 260;
const COACH_MS = 4000;
/** The coach row fits a two-line bubble on a narrow preview; gap from the card. Screen pt. */
const COACH_ROW_H = 56;
const COACH_GAP = 8;
const LOOK_FADE_MS = 220;
const DAY_FADE_MS = 150;
const FRAME_SIDE_MARGIN = 16;

const SMALLER: Record<LockSize, LockSize | null> = { tall: 'medium', medium: 'short', short: null };
const ADJUST_ACTIONS: AccessibilityActionInfo[] = [{ name: 'increment' }, { name: 'decrement' }];
const ACTIVATE_ACTIONS: AccessibilityActionInfo[] = [{ name: 'activate' }];

/** Fades stay under Reduce Motion (only movement is dropped), so they opt out of Reanimated's skip. */
const GUIDE_FADE = { duration: GUIDE_FADE_MS, reduceMotion: ReduceMotion.Never } as const;

// ─── Shared helpers ──────────────────────────────────────────────────────────

export type LockHapticKind = 'selection' | 'light' | 'warn';

export function lockHaptic(kind: LockHapticKind): void {
  if (kind === 'selection') Haptics.selectionAsync().catch(() => {});
  else if (kind === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

/** 'Short' / 'Medium' / 'Tall', for lsTooTall's {size}. */
export function lockSizeLabel(size: LockSize, T: (key: TranslationKey) => string): string {
  return T(size === 'short' ? 'lsSizeShort' : size === 'tall' ? 'lsSizeTall' : 'lsSizeMedium');
}

/**
 * Reduce Motion, starting from Reanimated's synchronous read so the very
 * first animation already respects it, then following the system switch.
 */
export function useLockReduceMotion(): boolean {
  const initial = useReducedMotion();
  const [enabled, setEnabled] = useState(initial);
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
 * Past a limit the card follows at 0.35× and never strays more than 24 pt:
 * the exponential keeps the 0.35 slope at the edge and eases into the cap
 * instead of hitting a wall.
 */
function rubberBand(overshoot: number): number {
  'worklet';
  return RUBBER_MAX_PT * (1 - Math.exp((-RUBBER_SLOPE * overshoot) / RUBBER_MAX_PT));
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Where LockCanvas draws the card horizontally (mirrors its panelFrame). */
function panelGeometry(template: LockTemplateId, W: number, s: number) {
  const glance = template === 'glance';
  const inset = (glance ? LOCK_METRICS.glance.insetX : LOCK_METRICS.panel.insetX) * s;
  const radius = (glance ? LOCK_METRICS.glance.radius : LOCK_METRICS.panel.radius) * s;
  return { left: inset, width: W - 2 * inset, radius };
}

// ─── The drag ────────────────────────────────────────────────────────────────

export interface LockPanelDragOptions {
  model: LockScreenDayModel;
  /** Days whose tallest card the drag keeps room for (today..+6). `model` is always included. */
  rangeModels?: readonly LockScreenDayModel[];
  config: LockScreenConfig;
  W: number;
  H: number;
  s: number;
  /** Screen pt per canvas pt: frameW / W in the preview, 1 at full size. */
  k: number;
  T: (key: TranslationKey) => string;
  reduceMotion: boolean;
  onCommitTopFrac: (frac: number | null) => void;
  onSizeStepDown?: (size: LockSize) => void;
  onDragStateChange?: (dragging: boolean) => void;
}

export interface LockPanelDrag {
  /** The card's top in canvas pt; pass to LockCanvas as panelTopSV. */
  topSV: SharedValue<number>;
  /** The lift; pass to LockCanvas as panelScaleSV. */
  scaleSV: SharedValue<number>;
  /** 0 at rest, 1 while dragging: drives the guides and the lift shadow. */
  activeSV: SharedValue<number>;
  /** Bottom of the clock area and top of the flashlight/camera area, in canvas pt. */
  clockBottom: number;
  buttonsTop: number;
  /** Pass to LockCanvas as panelWrapper: adds the gestures, VoiceOver adjust and the lift shadow. */
  panelWrapper: (panel: React.ReactElement) => React.ReactElement;
  /** The card's gestures, for an outer tap to requireExternalGestureToFail(...) on. */
  panelGestures: GestureType[];
}

interface DragBounds {
  lo: number;
  hi: number;
  /** Magnet target: the recommended top, inside [lo, hi]. */
  rec: number;
  /** Where a null topFrac puts the card (double-tap target). */
  recTop: number;
  /** Lowest top once stepped down a size; −1 when there is no smaller size. */
  hiNext: number;
  k: number;
  reduceMotion: boolean;
}

export function useLockPanelDrag({
  model,
  rangeModels,
  config,
  W,
  H,
  s,
  k,
  T,
  reduceMotion,
  onCommitTopFrac,
  onSizeStepDown,
  onDragStateChange,
}: LockPanelDragOptions): LockPanelDrag {
  const fit = useMemo(() => fitModel(model, config, H, s), [model, config, H, s]);
  // Where the card sits now, exactly as the captured picture will place it.
  const restTop = fit.topPx;
  const recTop = useMemo(
    () => (config.topFrac == null ? restTop : fitModel(model, { ...config, topFrac: null }, H, s).topPx),
    [config, model, H, s, restTop],
  );

  const { minTop, maxBottom } = lockSafeZone(config.top);
  const clockBottom = minTop * H;
  const buttonsTop = maxBottom * H;

  const models = useMemo(() => {
    const list = rangeModels ? [...rangeModels] : [];
    if (!list.includes(model)) list.push(model);
    return list;
  }, [rangeModels, model]);
  const panelMaxH = useMemo(() => maxPanelHeight(models, config, s), [models, config, s]);
  const next = config.template === 'glance' ? null : SMALLER[config.size] ?? null;
  const nextPanelMaxH = useMemo(
    () => (next ? maxPanelHeight(models, { ...config, size: next }, s) : 0),
    [models, config, next, s],
  );

  // The clamp keeps room for the week's tallest card. It never excludes where
  // the card already is, though (a size or data change can leave it lower),
  // or the first touch would yank the card up.
  const lo = clockBottom;
  const hi = Math.max(lo, buttonsTop - panelMaxH, restTop);
  const rec = clamp(recTop, lo, hi);
  const hiNext = next ? Math.max(lo, buttonsTop - nextPanelMaxH) : -1;

  const topSV = useSharedValue(restTop);
  const scaleSV = useSharedValue(1);
  const activeSV = useSharedValue(0);
  const startSV = useSharedValue(0);
  const rawSV = useSharedValue(0);
  const draggingSV = useSharedValue(false);
  const snappedSV = useSharedValue(false);
  const warnedSV = useSharedValue(false);
  const boundsSV = useSharedValue<DragBounds>({ lo, hi, rec, recTop, hiNext, k, reduceMotion });

  // Kept in a shared value so the gestures are built once and never re-attached.
  useEffect(() => {
    boundsSV.value = { lo, hi, rec, recTop, hiNext, k, reduceMotion };
  }, [boundsSV, lo, hi, rec, recTop, hiNext, k, reduceMotion]);

  // The JS side of a gesture reads these at the moment it lands, not when the gestures were built.
  const live = { config, H, restTop, recTop, lo, hi, next, reduceMotion, onCommitTopFrac, onSizeStepDown, onDragStateChange };
  const latest = useRef(live);
  latest.current = live;

  // Follow the saved position (a commit, a preset change, Reset position, a
  // new day) unless the finger owns the card right now.
  const syncedTop = useRef(restTop);
  useEffect(() => {
    if (syncedTop.current === restTop) return;
    syncedTop.current = restTop;
    if (draggingSV.value) return;
    topSV.value = reduceMotion ? restTop : withSpring(restTop, RELEASE_SPRING);
  }, [restTop, reduceMotion, topSV, draggingSV]);

  const released = useCallback(
    (targetPx: number, stepped: boolean) => {
      const l = latest.current;
      if (stepped && l.next) {
        lockHaptic('light');
        l.onSizeStepDown?.(l.next);
      }
      const frac = Math.round((targetPx / l.H) * 1000) / 1000;
      const nearRecommended =
        Math.abs(frac - recommendedTopFrac(l.config.top)) < RECOMMENDED_EPS ||
        Math.abs(targetPx - l.recTop) < RECOMMENDED_EPS * l.H;
      const value = nearRecommended ? null : frac;
      if (value !== l.config.topFrac) {
        l.onCommitTopFrac(value);
      } else if (!stepped) {
        // Nothing to save, so no re-render will re-sync: settle on the saved spot exactly.
        topSV.value = l.reduceMotion ? l.restTop : withSpring(l.restTop, RELEASE_SPRING);
      }
    },
    [topSV],
  );

  const resetRequested = useCallback(() => {
    lockHaptic('light');
    const l = latest.current;
    if (l.config.topFrac !== null) l.onCommitTopFrac(null);
  }, []);

  const dragStateChanged = useCallback((dragging: boolean) => {
    latest.current.onDragStateChange?.(dragging);
  }, []);

  const gestures = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetY([-6, 6])
      .failOffsetX([-12, 12])
      .onStart(() => {
        const b = boundsSV.value;
        cancelAnimation(topSV);
        startSV.value = topSV.value;
        rawSV.value = topSV.value;
        draggingSV.value = true;
        // Starting on the recommended spot is not "entering" the magnet: no tick.
        snappedSV.value = b.hi > b.lo && Math.abs(topSV.value - b.rec) < MAGNET_PT;
        warnedSV.value = false;
        activeSV.value = withTiming(1, GUIDE_FADE);
        if (!b.reduceMotion) scaleSV.value = withTiming(LIFT_SCALE, { duration: LIFT_MS });
        runOnJS(dragStateChanged)(true);
      })
      .onUpdate((e) => {
        const b = boundsSV.value;
        const raw = startSV.value + e.translationY / b.k;
        rawSV.value = raw;
        if (raw < b.lo || raw > b.hi) {
          snappedSV.value = false;
          if (!warnedSV.value) {
            warnedSV.value = true;
            runOnJS(lockHaptic)('warn');
          }
          topSV.value = raw < b.lo ? b.lo - rubberBand(b.lo - raw) : b.hi + rubberBand(raw - b.hi);
          return;
        }
        if (b.hi > b.lo && Math.abs(raw - b.rec) < MAGNET_PT) {
          if (!snappedSV.value) {
            snappedSV.value = true;
            runOnJS(lockHaptic)('selection');
          }
          topSV.value = b.rec;
          return;
        }
        snappedSV.value = false;
        topSV.value = raw;
      })
      .onEnd(() => {
        const b = boundsSV.value;
        const raw = rawSV.value;
        let target = Math.min(b.hi, Math.max(b.lo, topSV.value));
        let stepped = false;
        if (b.hiNext >= 0 && (raw - b.hi) * b.k > STEP_DOWN_FINGER_PT) {
          // Land where the finger was heading, as far as the smaller card allows.
          stepped = true;
          target = Math.min(Math.max(b.hiNext, b.hi), Math.max(b.lo, raw));
        }
        topSV.value = b.reduceMotion ? target : withSpring(target, RELEASE_SPRING);
        runOnJS(released)(target, stepped);
      })
      .onFinalize(() => {
        if (!draggingSV.value) return;
        const b = boundsSV.value;
        draggingSV.value = false;
        activeSV.value = withTiming(0, GUIDE_FADE);
        scaleSV.value = b.reduceMotion ? 1 : withSpring(1, RELEASE_SPRING);
        runOnJS(dragStateChanged)(false);
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(DOUBLE_TAP_MS)
      .onEnd((_e, success) => {
        if (!success) return;
        const b = boundsSV.value;
        topSV.value = b.reduceMotion ? b.recTop : withSpring(b.recTop, RELEASE_SPRING);
        runOnJS(resetRequested)();
      });

    return { card: Gesture.Race(pan, doubleTap), all: [pan, doubleTap] as GestureType[] };
  }, [
    boundsSV,
    topSV,
    scaleSV,
    activeSV,
    startSV,
    rawSV,
    draggingSV,
    snappedSV,
    warnedSV,
    released,
    resetRequested,
    dragStateChanged,
  ]);

  // VoiceOver: swipe up moves the card up, like dragging it would.
  const onAccessibilityAction = useCallback(
    (e: AccessibilityActionEvent) => {
      const name = e.nativeEvent.actionName;
      const dir = name === 'increment' ? -1 : name === 'decrement' ? 1 : 0;
      if (dir === 0) return;
      const l = latest.current;
      const target = clamp(l.restTop + dir * A11Y_STEP * l.H, l.lo, l.hi);
      if (Math.abs(target - l.restTop) < 0.5) return;
      topSV.value = l.reduceMotion ? target : withSpring(target, RELEASE_SPRING);
      released(target, false);
    },
    [topSV, released],
  );

  const liftStyle = useAnimatedStyle(() => ({
    top: topSV.value,
    opacity: activeSV.value,
    transform: [{ scale: scaleSV.value }],
  }));

  const range = hi - lo;
  const a11yProps: ViewProps = {
    accessible: true,
    accessibilityRole: 'adjustable',
    accessibilityLabel: T('lsA11yMoveCard'),
    accessibilityHint: T('lsA11yMoveHint'),
    // Higher = nearer the top, so the number rises as VoiceOver swipes up.
    accessibilityValue:
      range > 1 ? { min: 0, max: 100, now: Math.round(((hi - restTop) / range) * 100) } : undefined,
    accessibilityActions: ADJUST_ACTIONS,
    onAccessibilityAction,
  };

  const geometry = panelGeometry(config.template, W, s);
  const liftBox: ViewStyle = {
    left: geometry.left,
    width: geometry.width,
    height: fit.panelH,
    borderRadius: geometry.radius,
    // Outset only (RN masks a box shadow out under its box), so the extra
    // depth never darkens the glass from behind.
    boxShadow: `0px ${16 * s}px ${44 * s}px rgba(0,0,0,0.38)`,
  };

  const panelWrapper = (panel: React.ReactElement) => (
    <>
      <Animated.View pointerEvents="none" style={[styles.lift, liftBox, liftStyle]} />
      <GestureDetector gesture={gestures.card}>
        {cloneElement(panel as React.ReactElement<ViewProps>, a11yProps)}
      </GestureDetector>
    </>
  );

  return {
    topSV,
    scaleSV,
    activeSV,
    clockBottom,
    buttonsTop,
    panelWrapper,
    panelGestures: gestures.all,
  };
}

// ─── Guides ──────────────────────────────────────────────────────────────────

export interface LockDragGuidesProps {
  /** Size of the surface the guides cover, in screen pt (frame size, or W × H at full size). */
  width: number;
  height: number;
  /** Bottom edge of the clock area and top edge of the buttons area, in the same screen pt. */
  clockBottom: number;
  buttonsTop: number;
  /** 0 hidden, 1 shown: the drag's activeSV. */
  progress: SharedValue<number>;
  T: (key: TranslationKey) => string;
}

const GUIDE_CHIP_GAP = 6;

function DashedLine({ y }: { y: number }) {
  // iOS only dashes a border drawn on all four sides, so a 1 pt clip shows just the top edge.
  return (
    <View style={[styles.dashClip, { top: y - 0.5 }]}>
      <View style={styles.dash} />
    </View>
  );
}

function GuideChip({ label }: { label: string }) {
  // The frame follows the preview's height, so on a 375-pt phone (and in
  // Malay nearly everywhere) the label is wider than the chip can grow.
  // Shrinking keeps it whole; the bottom band has no room for a second line.
  return (
    <View style={styles.guideChip}>
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={styles.guideChipText}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * The no-go bands above and below the card, drawn in screen coordinates (not
 * inside the scaled canvas) so their labels stay readable in a small preview.
 */
export function LockDragGuides({ width, height, clockBottom, buttonsTop, progress, T }: LockDragGuidesProps) {
  const fade = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.guides, { width, height }, fade]}
    >
      <View style={[styles.zone, { top: 0, height: clockBottom }]} />
      <View style={[styles.zone, { top: buttonsTop, height: Math.max(0, height - buttonsTop) }]} />
      <DashedLine y={clockBottom} />
      <DashedLine y={buttonsTop} />
      <View style={[styles.chipSlot, styles.chipSlotAbove, { height: Math.max(0, clockBottom - GUIDE_CHIP_GAP) }]}>
        <GuideChip label={T('lsGuideClock')} />
      </View>
      {/* An iPad has no flashlight and camera buttons to name; its band is only a margin. */}
      {Platform.OS === 'ios' && Platform.isPad ? null : (
        <View style={[styles.chipSlot, { top: buttonsTop + GUIDE_CHIP_GAP }]}>
          <GuideChip label={T('lsGuideBottom')} />
        </View>
      )}
    </Animated.View>
  );
}

// ─── Cross-fading canvas layers ──────────────────────────────────────────────

interface CanvasLayer {
  key: string;
  look: string;
  model: LockScreenDayModel;
  config: LockScreenConfig;
}

/** What makes the picture look different at a glance: these changes cross-fade. */
function lookKey(c: LockScreenConfig): string {
  return `${c.template}|${c.background}|${c.photoPath ?? ''}|${c.dim}|${c.panel}`;
}

/**
 * The picture shown a moment ago stays mounted on top and fades out over the
 * new one, so a template, background or day change cross-fades without
 * dipping through black. Keeping the same instance (same React key) means a
 * photo background doesn't have to decode again to fade.
 */
function useCanvasLayers(model: LockScreenDayModel, config: LockScreenConfig) {
  const look = lookKey(config);
  const key = `${look}#${model.dateISO ?? 'fallback'}`;
  const [outgoing, setOutgoing] = useState<(CanvasLayer & { ms: number }) | null>(null);
  const [trackedKey, setTrackedKey] = useState(key);
  // Last committed layer: what is on screen, and so what should fade out.
  const shown = useRef<CanvasLayer>({ key, look, model, config });

  // Decided during render (not in an effect) so the very commit that mounts
  // the new layer still contains the old one; a commit without it would
  // unmount it and lose its decoded photo.
  if (trackedKey !== key) {
    const prev = shown.current;
    setTrackedKey(key);
    setOutgoing({ ...prev, ms: prev.look !== look ? LOOK_FADE_MS : DAY_FADE_MS });
  }

  useLayoutEffect(() => {
    shown.current = { key, look, model, config };
  }, [key, look, model, config]);

  const onFaded = useCallback((faded: string) => {
    setOutgoing((o) => (o && o.key === faded ? null : o));
  }, []);

  return { key, outgoing: outgoing && outgoing.key !== key ? outgoing : null, onFaded };
}

function CanvasLayerView({
  layerKey,
  fadeOutMs,
  onFaded,
  W,
  H,
  children,
}: {
  layerKey: string;
  fadeOutMs?: number;
  onFaded: (key: string) => void;
  W: number;
  H: number;
  children: React.ReactNode;
}) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (fadeOutMs == null) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = withTiming(0, { duration: fadeOutMs, reduceMotion: ReduceMotion.Never }, (finished) => {
      if (finished) runOnJS(onFaded)(layerKey);
    });
  }, [fadeOutMs, layerKey, onFaded, opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      pointerEvents={fadeOutMs == null ? 'box-none' : 'none'}
      style={[styles.layer, { width: W, height: H }, fade]}
    >
      {children}
    </Animated.View>
  );
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export interface LockPreviewProps {
  /** The selected day's model, or the fallback model for the Backup chip. */
  model: LockScreenDayModel;
  /** The 7 day models (today..+6). The drag keeps room for the tallest; defaults to [model]. */
  rangeModels?: readonly LockScreenDayModel[];
  config: LockScreenConfig;
  /** Canvas size from getLockCanvasSize(). */
  W: number;
  H: number;
  s: number;
  theme: ThemePalette;
  /** Mono and Spider packs (useDarkMinimalThemePack()). */
  darkMinimal: boolean;
  T: (key: TranslationKey) => string;
  /** Ghost clock date. Defaults to model.dateISO, or today for the Backup picture. */
  dateISO?: string | null;
  /** First visit: show the lsCoach bubble for 4 s (hidden early by a drag). */
  showCoach?: boolean;
  /** Ghost visibility (eye toggle). Uncontrolled when omitted. */
  ghostVisible?: boolean;
  onGhostVisibleChange?: (visible: boolean) => void;
  /** A drag, double-tap or VoiceOver adjust settled. null = recommended spot. */
  onCommitTopFrac: (frac: number | null) => void;
  /** The card was pushed well past the bottom limit: save this smaller size and show lsTooTall. */
  onSizeStepDown?: (size: LockSize) => void;
  /** Tap on the preview (not a double-tap on the card): open LockFullPreview. */
  onExpand?: () => void;
  onDragStateChange?: (dragging: boolean) => void;
  /** The box the frame is fitted into, e.g. { flex: 1, minHeight: 260 }. */
  style?: StyleProp<ViewStyle>;
}

export function LockPreview(props: LockPreviewProps) {
  const { W, H, style } = props;
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  }, []);

  const frameH = box && W > 0 ? Math.max(0, Math.min(box.h, ((box.w - 2 * FRAME_SIDE_MARGIN) * H) / W)) : 0;
  const frameW = H > 0 ? (frameH * W) / H : 0;

  return (
    <View style={[styles.box, style]} onLayout={onLayout}>
      {frameW > 0 ? <PreviewFrame {...props} frameW={frameW} frameH={frameH} /> : null}
    </View>
  );
}

export default LockPreview;

function PreviewFrame({
  model,
  rangeModels,
  config,
  W,
  H,
  s,
  theme,
  darkMinimal,
  T,
  dateISO,
  showCoach = false,
  ghostVisible,
  onGhostVisibleChange,
  onCommitTopFrac,
  onSizeStepDown,
  onExpand,
  onDragStateChange,
  frameW,
  frameH,
}: LockPreviewProps & { frameW: number; frameH: number }) {
  const k = frameW / W;
  const reduceMotion = useLockReduceMotion();
  // The ghost is an iPhone lock screen; an iPad's has neither its layout nor its buttons.
  const hasGhost = Platform.OS === 'ios' && !Platform.isPad;

  const [coachOn, setCoachOn] = useState(showCoach);
  useEffect(() => {
    setCoachOn(showCoach);
    if (!showCoach) return;
    const timer = setTimeout(() => setCoachOn(false), COACH_MS);
    return () => clearTimeout(timer);
  }, [showCoach]);

  const dragChangeRef = useRef(onDragStateChange);
  dragChangeRef.current = onDragStateChange;
  const handleDragState = useCallback((dragging: boolean) => {
    if (dragging) setCoachOn(false);
    dragChangeRef.current?.(dragging);
  }, []);

  const drag = useLockPanelDrag({
    model,
    rangeModels,
    config,
    W,
    H,
    s,
    k,
    T,
    reduceMotion,
    onCommitTopFrac,
    onSizeStepDown,
    onDragStateChange: handleDragState,
  });

  // The coach sits beside the card, never on it: below when the card leaves
  // room above the flashlight row, otherwise above it (under the clock).
  const coachTop = useMemo(() => {
    const fit = fitModel(model, config, H, s);
    const below = (fit.topPx + fit.panelH) * k + COACH_GAP;
    if (below + COACH_ROW_H <= drag.buttonsTop * k) return below;
    return Math.max(0, fit.topPx * k - COACH_GAP - COACH_ROW_H);
  }, [model, config, H, s, k, drag.buttonsTop]);

  const [ownGhost, setOwnGhost] = useState(true);
  const ghostOn = ghostVisible ?? ownGhost;
  const toggleGhost = useCallback(() => {
    lockHaptic('selection');
    const nextVisible = !ghostOn;
    if (ghostVisible === undefined) setOwnGhost(nextVisible);
    onGhostVisibleChange?.(nextVisible);
  }, [ghostOn, ghostVisible, onGhostVisibleChange]);

  const expandRef = useRef(onExpand);
  expandRef.current = onExpand;
  const expand = useCallback(() => expandRef.current?.(), []);
  const canExpand = !!onExpand;
  const { panelGestures } = drag;
  const frameTap = useMemo(
    () =>
      Gesture.Tap()
        .enabled(canExpand)
        .maxDistance(10)
        // A tap on the card waits out a possible double-tap (reset) first.
        .requireExternalGestureToFail(...panelGestures)
        .onEnd((_e, success) => {
          if (success) runOnJS(expand)();
        }),
    [canExpand, panelGestures, expand],
  );

  const layers = useCanvasLayers(model, config);
  const ghostDate = dateISO || model.dateISO || getTodayISO();
  const dateLabel = model.kind === 'fallback' ? T('lsDayBackup') : fmtGhostDate(ghostDate);
  const previewLabel = T('lsA11yPreview')
    .replace('{date}', dateLabel)
    .replace('{summary}', lockScreenA11ySummary(model, T));

  const radius = 0.135 * frameW;
  const canvasProps = { W, H, s, theme, darkMinimal, T, panelTopSV: drag.topSV, panelScaleSV: drag.scaleSV };

  return (
    <View style={[styles.frameShadow, { width: frameW, height: frameH, borderRadius: radius }]}>
      <View style={[styles.frameClip, { borderRadius: radius }]}>
        <GestureDetector gesture={frameTap}>
          <View style={StyleSheet.absoluteFill} collapsable={false}>
            {/* Behind the canvas: VoiceOver reads the whole picture here, the card is its own element. */}
            <View
              style={StyleSheet.absoluteFill}
              accessible
              accessibilityRole={canExpand ? 'button' : 'image'}
              accessibilityLabel={previewLabel}
              accessibilityHint={canExpand ? T('lsA11yExpandHint') : undefined}
              accessibilityActions={canExpand ? ACTIVATE_ACTIONS : undefined}
              onAccessibilityAction={canExpand ? expand : undefined}
            />
            <View
              pointerEvents="box-none"
              style={[styles.canvasLayer, { width: W, height: H, transform: [{ scale: k }] }]}
            >
              <CanvasLayerView key={layers.key} layerKey={layers.key} onFaded={layers.onFaded} W={W} H={H}>
                <LockCanvas {...canvasProps} model={model} config={config} panelWrapper={drag.panelWrapper} />
              </CanvasLayerView>
              {layers.outgoing ? (
                <CanvasLayerView
                  key={layers.outgoing.key}
                  layerKey={layers.outgoing.key}
                  fadeOutMs={layers.outgoing.ms}
                  onFaded={layers.onFaded}
                  W={W}
                  H={H}
                >
                  <LockCanvas {...canvasProps} model={layers.outgoing.model} config={layers.outgoing.config} />
                </CanvasLayerView>
              ) : null}
              {hasGhost ? (
                <LockGhostOverlay
                  W={W}
                  H={H}
                  s={s}
                  top={config.top}
                  dateISO={ghostDate}
                  uses24h={model.uses24h}
                  visible={ghostOn}
                />
              ) : null}
            </View>
          </View>
        </GestureDetector>

        <LockDragGuides
          width={frameW}
          height={frameH}
          clockBottom={drag.clockBottom * k}
          buttonsTop={drag.buttonsTop * k}
          progress={drag.activeSV}
          T={T}
        />

        {coachOn ? (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            entering={FadeIn.duration(250).reduceMotion(ReduceMotion.Never)}
            exiting={FadeOut.duration(200).reduceMotion(ReduceMotion.Never)}
            style={[styles.coachRow, { top: coachTop }]}
          >
            <View style={[styles.coach, { maxWidth: frameW - 24 }]}>
              <Text allowFontScaling={false} style={styles.coachText}>
                {T('lsCoach')}
              </Text>
            </View>
          </Animated.View>
        ) : null}

        {hasGhost ? (
          <Pressable
            onPress={toggleGhost}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={T('lsGhostToggle')}
            accessibilityState={{ selected: ghostOn }}
            style={({ pressed }) => [styles.eye, pressed && styles.eyePressed]}
          >
            <Feather name={ghostOn ? 'eye' : 'eye-off'} size={14} color="#FFFFFF" />
          </Pressable>
        ) : null}

        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.frameBorder, { borderRadius: radius }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameShadow: {
    backgroundColor: '#000000',
    boxShadow: '0px 16px 60px rgba(0,0,0,0.5)',
  },
  frameClip: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  frameBorder: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  canvasLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: 'top left',
  },
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  lift: {
    position: 'absolute',
  },
  guides: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  zone: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,69,58,0.14)',
  },
  dashClip: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    overflow: 'hidden',
  },
  dash: {
    height: 3,
    marginHorizontal: -1,
    borderWidth: 1,
    borderRadius: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.6)',
  },
  chipSlot: {
    position: 'absolute',
    left: 8,
    right: 8,
    alignItems: 'flex-start',
  },
  chipSlotAbove: {
    top: 0,
    justifyContent: 'flex-end',
  },
  guideChip: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  guideChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  coachRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: COACH_ROW_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coach: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  coachText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  eye: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyePressed: {
    opacity: 0.7,
  },
});
