import React, { forwardRef, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { ThemePalette } from '@/constants/Themes';
import type { TranslationKey } from '@/src/i18n';
import { LOCK_METRICS, fitModel } from '@/src/lib/lockScreen/lockScreenGeometry';
import { resolveLockInk, type LockInk } from '@/src/lib/lockScreen/lockScreenPalette';
import type { LockScreenConfig, LockScreenDayModel } from '@/src/lib/lockScreen/types';

import LockBackground from './LockBackground';
import TimetableTemplate from './templates/TimetableTemplate';
import GridTemplate from './templates/GridTemplate';
import TodayTemplate from './templates/TodayTemplate';
import WeekTemplate, { type LockTemplateProps } from './templates/WeekTemplate';

/**
 * The one surface that draws a lock screen picture. The render host captures
 * it offscreen, and the Studio preview, the template cards, Save to Photos
 * and the full-size preview all show this same component, so what the student
 * designs is exactly what the automation sets.
 *
 * The canvas is laid out at the screen's size in points (W × H); a capture
 * comes out at points × scale, the wallpaper's pixel size. Previews scale the
 * whole canvas with a transform instead of passing a smaller W, so text never
 * reflows between the preview and the picture.
 *
 * Nothing in here is blurred: an offscreen view has nothing behind it to blur.
 * The glass is a translucent fill, a hairline edge brighter along the top, a
 * faint sheen and a soft shadow that stays outside the card.
 */

export interface LockCanvasProps {
  /** Already built; the canvas fits it itself. */
  model: LockScreenDayModel;
  config: LockScreenConfig;
  /** From getLockCanvasSize(). */
  W: number;
  H: number;
  s: number;
  theme: ThemePalette;
  /** Mono and Spider packs (useDarkMinimalThemePack()). */
  darkMinimal: boolean;
  T: (key: TranslationKey) => string;
  /** Panel top in canvas pt; rows are fitted to it. Default: fitModel's position. */
  topPx?: number;
  /** Preview drag: the panel's top follows this. */
  panelTopSV?: SharedValue<number>;
  /** Preview drag lift. */
  panelScaleSV?: SharedValue<number>;
  /**
   * Wraps the panel, e.g. in a GestureDetector. The panel forwards its ref and
   * any View props added with cloneElement (collapsable, accessibility, …).
   */
  panelWrapper?: (panel: React.ReactElement) => React.ReactElement;
  /** Fired once: the background is drawn (photo decoded, or gradient mounted) and two frames have passed. */
  onReady?: () => void;
  /** Offscreen capture: no animated styles, no touches. */
  forCapture?: boolean;
  showBackground?: boolean;
}

interface PanelFrame {
  left: number;
  width: number;
  radius: number;
  padTop: number;
  padBottom: number;
  padX: number;
}

/** The card every template draws in. */
function panelFrame(W: number, s: number): PanelFrame {
  const p = LOCK_METRICS.panel;
  return {
    left: p.insetX * s,
    width: W - 2 * p.insetX * s,
    radius: p.radius * s,
    padTop: p.padTop * s,
    padBottom: p.padBottom * s,
    padX: p.padX * s,
  };
}

interface PanelProps extends ViewProps {
  frame: PanelFrame;
  top: number;
  height: number;
  ink: LockInk;
  sheen: boolean;
  s: number;
}

interface AnimatedPanelProps extends PanelProps {
  topSV?: SharedValue<number>;
  scaleSV?: SharedValue<number>;
}

/** Top of dark glass catches a little light, like the system's own materials. */
const SHEEN_COLORS = ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)'] as const;
const SHEEN_START = { x: 0.5, y: 0 };
const SHEEN_END = { x: 0.5, y: 0.6 };

function panelBoxStyle(frame: PanelFrame, height: number, ink: LockInk, s: number): ViewStyle {
  const p = LOCK_METRICS.panel;
  return {
    position: 'absolute',
    left: frame.left,
    width: frame.width,
    height,
    borderRadius: frame.radius,
    backgroundColor: ink.panelFill,
    // boxShadow, not shadow*: the outset shadow is masked out under the card,
    // so it can't darken the translucent glass from behind. Blur is twice the
    // design's iOS shadowRadius, which is how RN maps the two.
    boxShadow: [
      {
        offsetX: 0,
        offsetY: p.shadowOffsetY * s,
        blurRadius: p.shadowRadius * 2 * s,
        color: `rgba(0,0,0,${ink.shadowOpacity})`,
      },
    ],
  };
}

function PanelContents({
  frame,
  ink,
  sheen,
  children,
}: Pick<PanelProps, 'frame' | 'ink' | 'sheen' | 'children'>) {
  return (
    <>
      <View
        style={[
          styles.clip,
          {
            borderRadius: frame.radius,
            paddingTop: frame.padTop,
            paddingBottom: frame.padBottom,
            paddingHorizontal: frame.padX,
          },
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {sheen ? (
          <LinearGradient
            colors={SHEEN_COLORS}
            start={SHEEN_START}
            end={SHEEN_END}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        ) : null}
        {children}
      </View>
      {/* Drawn over the content as an overlay so the edge doesn't eat into the measured height. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.edge,
          { borderRadius: frame.radius, borderColor: ink.panelBorder, borderTopColor: ink.panelTopBorder },
        ]}
      />
    </>
  );
}

const StaticPanel = forwardRef<View, PanelProps>(function StaticPanel(
  { frame, top, height, ink, sheen, s, style, children, ...rest },
  ref,
) {
  return (
    <View ref={ref} collapsable={false} {...rest} style={[panelBoxStyle(frame, height, ink, s), { top }, style]}>
      <PanelContents frame={frame} ink={ink} sheen={sheen}>
        {children}
      </PanelContents>
    </View>
  );
});

const AnimatedPanel = forwardRef<View, AnimatedPanelProps>(function AnimatedPanel(
  { frame, top, height, ink, sheen, s, topSV, scaleSV, style, children, ...rest },
  ref,
) {
  const animated = useAnimatedStyle(() => ({
    top: topSV ? topSV.value : top,
    transform: [{ scale: scaleSV ? scaleSV.value : 1 }],
  }));
  return (
    <Animated.View
      ref={ref}
      collapsable={false}
      {...rest}
      style={[panelBoxStyle(frame, height, ink, s), animated, style]}
    >
      <PanelContents frame={frame} ink={ink} sheen={sheen}>
        {children}
      </PanelContents>
    </Animated.View>
  );
});

export function LockCanvas({
  model,
  config,
  W,
  H,
  s,
  theme,
  darkMinimal,
  T,
  topPx,
  panelTopSV,
  panelScaleSV,
  panelWrapper,
  onReady,
  forCapture = false,
  showBackground = true,
}: LockCanvasProps) {
  // With an explicit top, fit to that spot so the rows drawn are the rows that fit there.
  const fitConfig = useMemo(
    () => (topPx == null ? config : { ...config, topFrac: topPx / H }),
    [config, topPx, H],
  );
  const fit = useMemo(() => fitModel(model, fitConfig, H, s), [model, fitConfig, H, s]);
  const ink = useMemo(
    () => resolveLockInk(config.panel, theme, darkMinimal),
    [config.panel, theme, darkMinimal],
  );
  const frame = panelFrame(W, s);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const fired = useRef(false);
  const frameRequest = useRef<number | null>(null);

  // Two frames after the background is in: the first commits it, the second
  // has it on screen, which is what drawViewHierarchy snapshots.
  const handleBackgroundReady = useCallback(() => {
    if (fired.current) return;
    fired.current = true;
    frameRequest.current = requestAnimationFrame(() => {
      frameRequest.current = requestAnimationFrame(() => {
        frameRequest.current = null;
        onReadyRef.current?.();
      });
    });
  }, []);

  useEffect(
    () => () => {
      if (frameRequest.current != null) cancelAnimationFrame(frameRequest.current);
    },
    [],
  );

  useEffect(() => {
    if (!showBackground) handleBackgroundReady();
  }, [showBackground, handleBackgroundReady]);

  const templateProps: LockTemplateProps = { fit, source: model, config, ink, W, s, T };
  const body =
    config.template === 'week' ? (
      <WeekTemplate {...templateProps} />
    ) : config.template === 'timetable' ? (
      <TimetableTemplate {...templateProps} />
    ) : config.template === 'grid' ? (
      <GridTemplate {...templateProps} />
    ) : (
      <TodayTemplate {...templateProps} />
    );

  const panelProps: PanelProps = {
    frame,
    top: topPx ?? fit.topPx,
    height: fit.panelH,
    ink,
    sheen: config.panel !== 'light',
    s,
  };
  // Only a live drag needs Reanimated. A capture gets a plain View, so nothing
  // about the panel is left for the UI thread to apply after the snapshot.
  const panel =
    !forCapture && (panelTopSV || panelScaleSV) ? (
      <AnimatedPanel {...panelProps} topSV={panelTopSV} scaleSV={panelScaleSV}>
        {body}
      </AnimatedPanel>
    ) : (
      <StaticPanel {...panelProps}>{body}</StaticPanel>
    );

  return (
    <View
      style={[styles.root, { width: W, height: H }]}
      collapsable={false}
      pointerEvents={forCapture ? 'none' : 'box-none'}
    >
      {showBackground ? (
        <LockBackground
          config={config}
          theme={theme}
          W={W}
          H={H}
          onReady={handleBackgroundReady}
          forCapture={forCapture}
        />
      ) : null}
      {panelWrapper && !forCapture ? panelWrapper(panel) : panel}
    </View>
  );
}

export default LockCanvas;

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
  clip: {
    flex: 1,
    overflow: 'hidden',
  },
  edge: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
