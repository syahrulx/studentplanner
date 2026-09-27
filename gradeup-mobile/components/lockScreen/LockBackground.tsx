import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import type { ThemePalette } from '@/constants/Themes';
import { lockScreenPhotoExists } from '@/src/lib/lockScreen/lockScreenConfig';
import {
  GRADIENT_DIM_ALPHA,
  LOCK_GRADIENTS,
  PHOTO_DIM_ALPHA,
  lockGradientLayers,
  themeGradient,
  type LockGradientColors,
} from '@/src/lib/lockScreen/lockScreenPalette';
import type { LockBackgroundId, LockScreenConfig } from '@/src/lib/lockScreen/types';

/**
 * The picture's backdrop: one of the gradients, the theme gradient, or the
 * student's photo, each under its dim wash.
 *
 * The render host captures right after onReady, so "ready" has to mean the
 * pixels are really there: a photo counts only once expo-image has put the
 * decoded bitmap on its view, never on a timer. A photo that is gone or can't
 * be decoded falls back to Dusk (the config default) and still reports ready,
 * so one broken file can't stall a whole render pass.
 */

export interface LockBackgroundProps {
  /** Reads background, photoPath and dim. */
  config: Pick<LockScreenConfig, 'background' | 'photoPath' | 'dim'>;
  theme: ThemePalette;
  W: number;
  H: number;
  /** Fired once, when the backdrop is on screen. */
  onReady?: () => void;
  forCapture?: boolean;
}

// onLoad fires as the bitmap arrives and onDisplay once it is set on the view.
// If a build never sends onDisplay, the capture still goes ahead this long
// after onLoad instead of waiting for the host's 3 s timeout.
const DISPLAY_GRACE_MS = 250;

/** Shown for the instant a photo takes to decode (preview only; capture waits). */
const PHOTO_BASE = '#0B0C0E';

/** The four gradient colours for a background id; Dusk for 'photo' (its fallback). */
export function lockBackgroundGradient(
  background: LockBackgroundId,
  theme: ThemePalette,
): LockGradientColors {
  if (background === 'theme') return themeGradient(theme);
  if (background !== 'photo' && LOCK_GRADIENTS[background]) return LOCK_GRADIENTS[background].c;
  return LOCK_GRADIENTS.dusk.c;
}

export function LockBackground({
  config,
  theme,
  W,
  H,
  onReady,
  forCapture = false,
}: LockBackgroundProps) {
  const { background, photoPath, dim } = config;

  // Checked up front so a deleted photo draws Dusk straight away rather than a
  // blank frame until expo-image reports the error.
  const photoOnDisk = useMemo(
    () => background === 'photo' && lockScreenPhotoExists(photoPath),
    [background, photoPath],
  );
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const showPhoto = photoOnDisk && failedPhoto !== photoPath;

  const gradientColors = useMemo(
    () => lockBackgroundGradient(showPhoto ? 'photo' : background, theme),
    [showPhoto, background, theme],
  );
  const layers = useMemo(() => lockGradientLayers(gradientColors), [gradientColors]);
  const photoSource = useMemo(() => (photoPath ? { uri: photoPath } : null), [photoPath]);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const reported = useRef(false);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const report = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    onReadyRef.current?.();
  }, []);

  useEffect(
    () => () => {
      if (graceTimer.current) clearTimeout(graceTimer.current);
    },
    [],
  );

  // A gradient is drawn as soon as it mounts.
  useEffect(() => {
    if (!showPhoto) report();
  }, [showPhoto, report]);

  const handleLoad = useCallback(() => {
    if (reported.current || graceTimer.current) return;
    graceTimer.current = setTimeout(report, DISPLAY_GRACE_MS);
  }, [report]);

  const handleError = useCallback(() => {
    if (__DEV__) console.warn('[lockScreen] background photo failed to load; using Dusk');
    setFailedPhoto(photoPath);
  }, [photoPath]);

  const dimAlpha = showPhoto ? (PHOTO_DIM_ALPHA[dim] ?? PHOTO_DIM_ALPHA[1]) : GRADIENT_DIM_ALPHA;

  return (
    <View
      style={[styles.root, { width: W, height: H }, showPhoto && styles.photoBase]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {showPhoto && photoSource ? (
        <Image
          source={photoSource}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          // A fade would be captured half-way through.
          transition={null}
          // Every capture remounts the canvas; memory keeps repeat decodes instant.
          cachePolicy="memory"
          priority={forCapture ? 'high' : 'normal'}
          onLoad={handleLoad}
          onDisplay={report}
          onError={handleError}
          accessible={false}
        />
      ) : (
        layers.map((layer, i) => (
          <LinearGradient
            key={i}
            colors={layer.colors}
            start={layer.start}
            end={layer.end}
            style={StyleSheet.absoluteFill}
          />
        ))
      )}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dimAlpha})` }]} />
    </View>
  );
}

export default LockBackground;

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
  },
  photoBase: {
    backgroundColor: PHOTO_BASE,
  },
});
