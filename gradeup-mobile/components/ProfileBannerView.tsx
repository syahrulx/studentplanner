/**
 * Paints a profile card's banner.
 *
 * Kept apart from the card itself so the card never has to know whether a
 * banner is a flat colour or a scene with things moving in it.
 *
 * ── How the designs are built ──
 * Everything is drawn with plain Views and React Native's Animated API. No
 * image files, no Lottie, no new dependency — nothing to license, nothing
 * added to the bundle, and a design that is sharp at any size, because the
 * picker draws these at 54pt and the card at 108pt from the same code.
 *
 * Every animation drives only `transform` and `opacity` so it can run with
 * `useNativeDriver`. That matters more than it looks: these appear fifteen at
 * a time in the picker, and on the JS driver fifteen looping animations would
 * be fighting the same thread that handles the scrolling.
 */
import { useEffect, useMemo, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ProfileBanner } from '@/src/lib/profileBanners';

interface Props {
  banner: ProfileBanner;
  /** Used when the banner is the free "theme colour" one. */
  themeColor: string;
  height: number;
  style?: ViewStyle;
}

/**
 * One looping 0 → 1 value.
 *
 * `delay` staggers copies of the same thing — petals, clouds, stars — so a
 * handful of them do not all cross the banner in lockstep, which is what makes
 * a drawn scene read as a pattern rather than as weather.
 */
function useLoop(durationMs: number, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration: durationMs,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      v.setValue(0);
    };
  }, [v, durationMs, delay]);
  return v;
}

// ── Sakura: petals falling through a warm sky ──────────────────────────────

function SakuraPetal({
  left, size, dur, delay, drift, height,
}: { left: string; size: number; dur: number; delay: number; drift: number; height: number }) {
  const t = useLoop(dur, delay);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: left as any,
        top: 0,
        width: size,
        height: size,
        // Not a circle. One corner is squared off, and that lopsided radius is
        // the whole difference between "petal" and "dot" at seven pixels wide.
        borderRadius: size,
        borderTopLeftRadius: size / 3,
        backgroundColor: '#f7a8c0',
        opacity: t.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 0.9, 0.9, 0] }),
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-size, height + size] }) },
          { translateX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, drift, 0] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '320deg'] }) },
        ],
      }}
    />
  );
}

function Sakura({ height }: { height: number }) {
  // Positions are fractions of the width, so the scene fills a 54pt tile and a
  // 108pt banner the same way.
  const petals = useMemo(
    () => [
      { left: '8%', size: 7, dur: 5200, delay: 0, drift: 14 },
      { left: '24%', size: 5, dur: 6400, delay: 900, drift: -10 },
      { left: '41%', size: 8, dur: 4800, delay: 1800, drift: 18 },
      { left: '58%', size: 6, dur: 7000, delay: 600, drift: -14 },
      { left: '73%', size: 7, dur: 5600, delay: 2400, drift: 12 },
      { left: '89%', size: 5, dur: 6200, delay: 1400, drift: -8 },
    ],
    [],
  );
  return (
    <>
      <LinearGradient
        colors={['#ffd9e2', '#ffeef2', '#fff6ea']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {petals.map((p, i) => <SakuraPetal key={i} {...p} height={height} />)}
    </>
  );
}

// ── Lofi: a dusk sky with slow drifting light ──────────────────────────────

function LofiOrb({
  size, top, dur, delay, color, height,
}: { size: number; top: number; dur: number; delay: number; color: string; height: number }) {
  const t = useLoop(dur, delay);
  const d = height * size;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: height * top - d / 2,
        left: -d,
        width: d,
        height: d,
        borderRadius: d / 2,
        backgroundColor: color,
        // Over-travels on purpose, so the orb is fully off both edges rather
        // than popping in and out at the sides.
        transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, d * 2 + 420] }) }],
      }}
    />
  );
}

function LofiStar({
  left, top, dur, delay, height,
}: { left: string; top: number; dur: number; delay: number; height: number }) {
  const t = useLoop(dur, delay);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: left as any,
        top: height * top,
        width: 2,
        height: 2,
        borderRadius: 1,
        backgroundColor: '#fff',
        opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.15, 0.95, 0.15] }),
      }}
    />
  );
}

function Lofi({ height }: { height: number }) {
  const orbs = useMemo(
    () => [
      { size: 1.5, top: 0.12, dur: 14000, delay: 0, color: 'rgba(255,214,170,0.30)' },
      { size: 1.1, top: 0.55, dur: 18000, delay: 3000, color: 'rgba(170,190,255,0.26)' },
      { size: 0.8, top: 0.3, dur: 11000, delay: 6000, color: 'rgba(255,170,210,0.22)' },
    ],
    [],
  );
  const stars = useMemo(
    () => [
      { left: '14%', top: 0.2, dur: 2600, delay: 0 },
      { left: '31%', top: 0.45, dur: 3400, delay: 700 },
      { left: '62%', top: 0.18, dur: 3000, delay: 1500 },
      { left: '79%', top: 0.6, dur: 2800, delay: 400 },
      { left: '92%', top: 0.33, dur: 3600, delay: 1900 },
    ],
    [],
  );
  return (
    <>
      <LinearGradient
        colors={['#2b2350', '#53386b', '#9a5c76']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {stars.map((s, i) => <LofiStar key={`s${i}`} {...s} height={height} />)}
      {orbs.map((o, i) => <LofiOrb key={`o${i}`} {...o} height={height} />)}
    </>
  );
}

// ── Grid: a plane of lines sliding under you ───────────────────────────────

function Grid({ height }: { height: number }) {
  const t = useLoop(5200);
  const STEP = 22;
  const rows = Math.ceil(height / STEP) + 2;
  return (
    <>
      <LinearGradient
        colors={['#16202b', '#1d3144', '#23506b']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* The verticals slide exactly one cell and loop. Because every cell is
          identical, the jump back to the start is invisible — the motion reads
          as continuous without anything ever having to be reset. */}
      <Animated.View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFillObject,
          transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, -STEP] }) }],
        }}
      >
        {Array.from({ length: 22 }).map((_, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: i * STEP,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundColor: 'rgba(130,200,255,0.16)',
            }}
          />
        ))}
      </Animated.View>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: i * STEP,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: 'rgba(130,200,255,0.10)',
          }}
        />
      ))}
    </>
  );
}

// ── Arcade: a pixel sky with blocky clouds ─────────────────────────────────

/** One cloud, built from whole blocks so it keeps its pixel edges. */
function PixelCloud({
  px, top, dur, delay, tone,
}: { px: number; top: number; dur: number; delay: number; tone: string }) {
  const t = useLoop(dur, delay);
  // Offsets are in cells, not points, so the shape stays on the pixel grid
  // whatever size the banner is drawn at.
  const blocks = [[0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 1]];
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top,
        left: 0,
        width: px * 4,
        height: px * 2,
        transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-px * 5, 520] }) }],
      }}
    >
      {blocks.map(([x, y], i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: x * px,
            top: y * px,
            width: px,
            height: px,
            backgroundColor: tone,
          }}
        />
      ))}
    </Animated.View>
  );
}

function Arcade({ height }: { height: number }) {
  const px = Math.max(3, Math.round(height / 14));
  return (
    <>
      <LinearGradient
        colors={['#2d6ea8', '#58a6d6', '#a8dcef']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Ground: whole blocks along the bottom. The one fixed thing in the
          scene, so the clouds have something to move against. */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: px * 2, flexDirection: 'row' }}>
        {/* Enough blocks for any banner we draw. A fixed count of 40 left a
            bare strip at the right of the small picker tiles, where the blocks
            are only 4pt wide and 40 of them do not reach the edge. Overshoot
            is free: the banner clips what it does not need. */}
        {Array.from({ length: Math.ceil(520 / px) }).map((_, i) => (
          <View
            key={i}
            style={{ width: px, height: px * 2, backgroundColor: i % 2 === 0 ? '#5d9c4a' : '#6cae57' }}
          />
        ))}
      </View>
      <PixelCloud px={px} top={px} dur={9000} delay={0} tone="rgba(255,255,255,0.92)" />
      <PixelCloud px={px * 0.75} top={px * 4} dur={13000} delay={2500} tone="rgba(255,255,255,0.7)" />
    </>
  );
}

// ── The banner itself ──────────────────────────────────────────────────────

export function ProfileBannerView({ banner, themeColor, height, style }: Props) {
  const flat = banner.kind === 'color' && banner.color ? banner.color : themeColor;
  return (
    <View style={[{ height, overflow: 'hidden' }, style]}>
      {banner.kind === 'design' ? (
        <>
          {banner.design === 'sakura' && <Sakura height={height} />}
          {banner.design === 'lofi' && <Lofi height={height} />}
          {banner.design === 'grid' && <Grid height={height} />}
          {banner.design === 'arcade' && <Arcade height={height} />}
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: flat }]} />
      )}

      {/* A fade at the foot of the banner. Without it a banner met the card's
          flat background on a hard line, and the avatar's white ring sat half
          on a strong colour and half on white, which made it look like two
          different rings. It is a share of the height, not a fixed 48pt — the
          picker draws these 54pt tall, where a fixed scrim covered almost the
          whole tile and every swatch looked muddier than what it stood for. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.14)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.round(height * 0.45) }}
      />
    </View>
  );
}
