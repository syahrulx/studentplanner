import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemePalette } from '@/constants/Themes';
import type { TranslationKey } from '@/src/i18n';
import { fmtGhostDate } from '@/src/lib/lockScreen/lockScreenFormat';
import { lockScreenA11ySummary } from '@/src/lib/lockScreen/lockScreenModel';
import type { LockScreenConfig, LockScreenDayModel, LockSize } from '@/src/lib/lockScreen/types';
import { getTodayISO } from '@/src/utils/date';

import LockCanvas from './LockCanvas';
import LockGhostOverlay from './LockGhostOverlay';
import {
  LockDragGuides,
  lockHaptic,
  lockSizeLabel,
  useLockPanelDrag,
  useLockReduceMotion,
} from './LockPreview';

/**
 * "Try it": the picture at its real size over the whole screen, with the
 * ghost clock and buttons, so the student can judge it as it will look when
 * the phone is locked. The card drags here too, 1:1, with the same guides,
 * magnet, limits, size step-down and double-tap reset as the Studio preview.
 *
 * Usage (Studio):
 *   <LockFullPreview
 *     visible={fullOpen}
 *     onClose={() => setFullOpen(false)}
 *     model={selectedModel} rangeModels={dayModels}
 *     config={config} W={W} H={H} s={s}
 *     theme={theme} darkMinimal={darkMinimal} T={T}
 *     onCommitTopFrac={(topFrac) => updateConfig({ topFrac })}
 *     onSizeStepDown={(size) => updateConfig({ size })}
 *   />
 *
 * The Studio's caption is hidden behind the modal, so this shows lsTooTall
 * itself after a step-down (the Studio can still show its own; it is only
 * seen once the modal closes).
 */

export interface LockFullPreviewProps {
  visible: boolean;
  /** Done button and Android back. */
  onClose: () => void;
  /** The selected day's model, or the fallback model for the Backup chip. */
  model: LockScreenDayModel;
  /** The 7 day models (today..+6) the drag keeps room for; defaults to [model]. */
  rangeModels?: readonly LockScreenDayModel[];
  config: LockScreenConfig;
  /** Canvas size from getLockCanvasSize(); the modal fills the screen, so this is 1:1. */
  W: number;
  H: number;
  s: number;
  theme: ThemePalette;
  darkMinimal: boolean;
  T: (key: TranslationKey) => string;
  /** Ghost clock date. Defaults to model.dateISO, or today for the Backup picture. */
  dateISO?: string | null;
  onCommitTopFrac: (frac: number | null) => void;
  onSizeStepDown?: (size: LockSize) => void;
}

const ENTRY_SPRING = { damping: 20, stiffness: 180, mass: 1 } as const;
const ENTRY_SCALE = 0.92;
/** Corner radius while the canvas grows in, like a phone's display corners. */
const ENTRY_RADIUS = 44;
const REDUCED_FADE_MS = 150;
const DRAG_HINT_MS = 3000;
const TOO_TALL_MS = 2500;

export function LockFullPreview(props: LockFullPreviewProps) {
  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      onRequestClose={props.onClose}
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={['portrait']}
    >
      {/* A modal is its own native root; gestures inside need their own handler root. */}
      <GestureHandlerRootView style={styles.root}>
        <FullPreviewBody {...props} />
      </GestureHandlerRootView>
    </Modal>
  );
}

export default LockFullPreview;

type Hint = { kind: 'drag' | 'tooTall'; text: string; id: number };

function FullPreviewBody({
  onClose,
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
  onCommitTopFrac,
  onSizeStepDown,
}: LockFullPreviewProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useLockReduceMotion();
  // The ghost is an iPhone lock screen; an iPad's has neither its layout nor its buttons.
  const hasGhost = Platform.OS === 'ios' && !Platform.isPad;

  const [hint, setHint] = useState<Hint | null>(() => ({ kind: 'drag', text: T('lsDragHint'), id: 0 }));
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showHint = useCallback((next: Hint | null, ms: number) => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = null;
    setHint(next);
    if (next) {
      hintTimer.current = setTimeout(() => {
        hintTimer.current = null;
        setHint((h) => (h && h.id === next.id ? null : h));
      }, ms);
    }
  }, []);

  const live = useRef({ T, onSizeStepDown });
  live.current = { T, onSizeStepDown };

  const handleStepDown = useCallback(
    (size: LockSize) => {
      const t = live.current.T;
      const text = t('lsTooTall').replace('{size}', lockSizeLabel(size, t));
      showHint({ kind: 'tooTall', text, id: Date.now() }, TOO_TALL_MS);
      AccessibilityInfo.announceForAccessibility(text);
      live.current.onSizeStepDown?.(size);
    },
    [showHint],
  );

  // Once they're dragging, "drag the card" has done its job.
  const handleDragState = useCallback((dragging: boolean) => {
    if (dragging) setHint((h) => (h && h.kind === 'drag' ? null : h));
  }, []);

  const drag = useLockPanelDrag({
    model,
    rangeModels,
    config,
    W,
    H,
    s,
    k: 1,
    T,
    reduceMotion,
    onCommitTopFrac,
    onSizeStepDown: handleStepDown,
    onDragStateChange: handleDragState,
  });

  const enter = useSharedValue(0);
  const reduceAtOpen = useRef(reduceMotion);
  useEffect(() => {
    lockHaptic('light');
    enter.value = reduceAtOpen.current
      ? withTiming(1, { duration: REDUCED_FADE_MS, reduceMotion: ReduceMotion.Never })
      : withSpring(1, ENTRY_SPRING);
    hintTimer.current = setTimeout(() => {
      hintTimer.current = null;
      setHint((h) => (h && h.kind === 'drag' ? null : h));
    }, DRAG_HINT_MS);
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, [enter]);

  const reduced = reduceAtOpen.current;
  const backdropStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, enter.value) }));
  const canvasStyle = useAnimatedStyle(() => {
    const p = enter.value;
    if (reduced) return { opacity: Math.min(1, p) };
    return {
      opacity: Math.min(1, p),
      borderRadius: Math.max(0, (1 - p) * ENTRY_RADIUS),
      transform: [{ scale: ENTRY_SCALE + (1 - ENTRY_SCALE) * p }],
    };
  });

  const ghostDate = dateISO || model.dateISO || getTodayISO();
  const dateLabel = model.kind === 'fallback' ? T('lsDayBackup') : fmtGhostDate(ghostDate);
  const previewLabel = T('lsA11yPreview')
    .replace('{date}', dateLabel)
    .replace('{summary}', lockScreenA11ySummary(model, T));

  const hintMaxW = W - 2 * (46 + 25 + 8) * s;

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />

      <Animated.View style={[styles.canvas, { width: W, height: H }, canvasStyle]}>
        <View
          style={StyleSheet.absoluteFill}
          accessible
          accessibilityRole="image"
          accessibilityLabel={previewLabel}
        />
        <LockCanvas
          model={model}
          config={config}
          W={W}
          H={H}
          s={s}
          theme={theme}
          darkMinimal={darkMinimal}
          T={T}
          panelTopSV={drag.topSV}
          panelScaleSV={drag.scaleSV}
          panelWrapper={drag.panelWrapper}
        />
        {hasGhost ? (
          <LockGhostOverlay W={W} H={H} s={s} top={config.top} dateISO={ghostDate} uses24h={model.uses24h} />
        ) : null}
        <LockDragGuides
          width={W}
          height={H}
          clockBottom={drag.clockBottom}
          buttonsTop={drag.buttonsTop}
          progress={drag.activeSV}
          T={T}
        />
      </Animated.View>

      {hint ? (
        <Animated.View
          key={hint.id}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          entering={FadeIn.duration(200).reduceMotion(ReduceMotion.Never)}
          exiting={FadeOut.duration(200).reduceMotion(ReduceMotion.Never)}
          // Where iOS itself writes "Swipe up to open": between the flashlight and camera.
          style={[styles.hintRow, { top: 0.912 * H - 22, width: W, height: 44 }]}
        >
          <View style={[styles.hintPill, { maxWidth: hintMaxW }]}>
            <Text allowFontScaling={false} numberOfLines={2} style={styles.hintText}>
              {hint.text}
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {/* Aligned to the canvas rather than the window, so it sits on the picture whatever the host. */}
      <View pointerEvents="box-none" style={[styles.doneRow, { top: insets.top + 8, width: W }]}>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={T('lsFullClose')}
          style={({ pressed }) => [styles.done, pressed && styles.donePressed]}
        >
          <Text allowFontScaling={false} style={styles.doneText}>
            {T('lsFullClose')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: '#000000',
  },
  canvas: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
  },
  hintRow: {
    position: 'absolute',
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintPill: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  hintText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  doneRow: {
    position: 'absolute',
    left: 0,
    paddingRight: 16,
    alignItems: 'flex-end',
  },
  done: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  donePressed: {
    opacity: 0.7,
  },
  doneText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
