import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, PixelRatio, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { PET_GRID, avatarBounds, avatarRuns, lookIsAnimated, petRuns, type PixelRun } from '@/src/lib/rentamanAvatar';
import type { AvatarLook } from '@/src/vendor/rentaman/avatar';

/** Grid pixel size so the avatar's figure is `height` points tall, snapped to device pixels. */
function pixelFor(look: AvatarLook, height: number, maxWidth: number): number {
  const b = avatarBounds(look);
  const raw = Math.min(height / b.h, maxWidth / b.w);
  const scale = PixelRatio.get();
  return Math.max(1, Math.floor(raw * scale)) / scale;
}

/**
 * The avatar's drawn box for a given target height: what a layout needs to
 * place it. Same maths as the view, so the two cannot disagree.
 */
export function rentamanBox(look: AvatarLook, height: number, maxWidth = height): { w: number; h: number; px: number } {
  const px = pixelFor(look, height, maxWidth);
  const b = avatarBounds(look);
  return { w: b.w * px, h: b.h * px, px };
}

/**
 * A RenTaman avatar drawn with plain Views: the website's pixel grid, joined
 * into bars of one colour (see avatarRuns), cropped to the figure and scaled
 * so every avatar stands the same height whatever it wears.
 *
 * Kept light, because it can sit on a screen for a long time:
 * - The breathing is a transform on the native driver: no JS per frame.
 * - Blinks swap between two precomputed drawings every few seconds.
 * - Outfits with moving parts (swaying, glowing, a pet) redraw at the game's
 *   own ~260 ms rhythm, about 4 times a second; still outfits never redraw.
 * - Everything stops while the screen is out of view or the app is in the
 *   background (a profile stays mounted under every screen opened from it).
 * - Pixels snap to whole device pixels, so edges stay crisp with no seams.
 */
export function RentamanAvatarView({
  look,
  height,
  maxWidth,
  animated = true,
  showPet = true,
}: {
  look: AvatarLook;
  /** How tall the figure is drawn, in points. */
  height: number;
  /** Widest the figure may be; defaults to `height`. */
  maxWidth?: number;
  animated?: boolean;
  showPet?: boolean;
}) {
  const bounds = useMemo(() => avatarBounds(look), [look]);
  const px = useMemo(() => pixelFor(look, height, maxWidth ?? height), [look, height, maxWidth]);

  // Only run while this screen is in view and the app is in front.
  const [focused, setFocused] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setForeground(st === 'active'));
    return () => sub.remove();
  }, []);
  const live = animated && focused && foreground;
  const moving = live && lookIsAnimated(look);

  const [t, setT] = useState(0);
  const [blink, setBlink] = useState(false);
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!live) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const blinkTimer = setInterval(() => {
      setBlink(true);
      closeTimer = setTimeout(() => setBlink(false), 150);
    }, 3200 + Math.round(Math.random() * 800));
    const frameTimer = moving ? setInterval(() => setT((v) => v + 260), 260) : undefined;
    return () => {
      loop.stop();
      clearInterval(blinkTimer);
      if (frameTimer) clearInterval(frameTimer);
      if (closeTimer) clearTimeout(closeTimer);
    };
  }, [live, moving, bob]);

  const runs = useMemo(() => avatarRuns(look, blink, t), [look, blink, t]);
  const pet = useMemo(() => (showPet ? petRuns(look, t) : []), [look, t, showPet]);

  const w = bounds.w * px;
  const h = bounds.h * px;
  const lift = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -px] });
  const shadowScale = bob.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] });
  const petW = PET_GRID.w * px;

  return (
    <View style={{ width: w, height: h }} pointerEvents="none">
      <Animated.View
        style={[
          s.shadow,
          { width: w * 0.6, height: px * 2.2, left: w * 0.2, bottom: -px * 0.6, borderRadius: w, transform: [{ scaleX: shadowScale }] },
        ]}
      />
      {pet.length > 0 ? (
        <View style={{ position: 'absolute', left: -petW * 0.62, bottom: -px, width: petW, height: PET_GRID.h * px }}>
          <Runs runs={pet} px={px} dx={0} dy={0} />
        </View>
      ) : null}
      <Animated.View style={{ width: w, height: h, transform: [{ translateY: lift }] }}>
        <Runs runs={runs} px={px} dx={bounds.x} dy={bounds.y} />
      </Animated.View>
    </View>
  );
}

const Runs = React.memo(function Runs({ runs, px, dx, dy }: { runs: PixelRun[]; px: number; dx: number; dy: number }) {
  return (
    <>
      {runs.map((r, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: (r.x - dx) * px,
            top: (r.y - dy) * px,
            width: r.w * px,
            height: px,
            backgroundColor: r.color,
          }}
        />
      ))}
    </>
  );
});

const s = StyleSheet.create({
  shadow: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.2)' },
});
