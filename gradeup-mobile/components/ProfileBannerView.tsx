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

// ── Nebula: a pixel galaxy. One account only, see OWNER_USER_ID. ───────────

/** One blocky star that blinks. */
function PixelStar({
  left, top, size, dur, delay, tone,
}: { left: string; top: number; size: number; dur: number; delay: number; tone: string }) {
  const t = useLoop(dur, delay);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: left as any,
        top,
        width: size,
        height: size,
        backgroundColor: tone,
        // Stepped, not a smooth fade. A star that eases in and out reads as a
        // soft glow; one that snaps between two values reads as a pixel.
        opacity: t.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [0.25, 0.25, 1, 1] }),
      }}
    />
  );
}

function Nebula({ height }: { height: number }) {
  // One cell. Everything is a whole number of these, which is what keeps the
  // scene on a grid at any banner size instead of landing on half pixels.
  // Rounded up, not down. At 62pt a rounded-down cell came out at 2px and the
  // scene turned to confetti; 3px keeps the blocks readable as blocks.
  const px = Math.max(2, Math.ceil(height / 27));

  /**
   * Three clusters, not eight scattered blocks.
   *
   * Spread out and fairly opaque, they read as rectangles someone has left on
   * the sky. Overlapped at low opacity they stack: the middle of a cluster
   * ends up denser than its edges, which is what makes a cloud a cloud rather
   * than a shape. Every block is still whole cells, so nothing goes soft.
   */
  const clouds = useMemo(
    () => [
      // left
      { left: '3%', top: 4, w: 9, h: 5, tone: 'rgba(59,130,246,0.13)' },
      { left: '6%', top: 2, w: 7, h: 6, tone: 'rgba(96,165,250,0.12)' },
      { left: '8%', top: 6, w: 10, h: 4, tone: 'rgba(34,211,238,0.10)' },
      { left: '11%', top: 5, w: 5, h: 4, tone: 'rgba(59,130,246,0.14)' },
      // centre, lower
      { left: '42%', top: 12, w: 12, h: 6, tone: 'rgba(34,211,238,0.11)' },
      { left: '46%', top: 10, w: 9, h: 7, tone: 'rgba(59,130,246,0.12)' },
      { left: '49%', top: 14, w: 11, h: 5, tone: 'rgba(37,99,235,0.13)' },
      { left: '53%', top: 13, w: 6, h: 4, tone: 'rgba(125,211,252,0.10)' },
      // right, upper
      { left: '72%', top: 3, w: 10, h: 6, tone: 'rgba(96,165,250,0.12)' },
      { left: '76%', top: 5, w: 8, h: 5, tone: 'rgba(34,211,238,0.11)' },
      { left: '79%', top: 2, w: 6, h: 5, tone: 'rgba(37,99,235,0.14)' },
    ],
    [],
  );

  const stars = useMemo(
    () => [
      { left: '8%', top: 2, size: 1, dur: 3100, delay: 0, tone: '#ffffff' },
      { left: '19%', top: 4, size: 2, dur: 2300, delay: 600, tone: '#ffffff' },
      { left: '31%', top: 6, size: 1, dur: 4200, delay: 1400, tone: '#bae6fd' },
      { left: '43%', top: 20, size: 1, dur: 2800, delay: 300, tone: '#ffffff' },
      { left: '56%', top: 10, size: 1, dur: 3600, delay: 1900, tone: '#bae6fd' },
      { left: '68%', top: 17, size: 1, dur: 2600, delay: 900, tone: '#ffffff' },
      { left: '79%', top: 21, size: 1, dur: 3900, delay: 2300, tone: '#ffffff' },
      { left: '86%', top: 6, size: 2, dur: 3300, delay: 1100, tone: '#ffffff' },
      { left: '96%', top: 3, size: 1, dur: 2100, delay: 1700, tone: '#bae6fd' },
    ],
    [],
  );

  // Steady ones, so the sky is not all blinking at once.
  const still = useMemo(
    () => [
      { left: '14%', top: 9, size: 1, o: 0.7, tone: '#bae6fd' },
      { left: '24%', top: 15, size: 1, o: 0.55, tone: '#ffffff' },
      { left: '37%', top: 2, size: 1, o: 0.8, tone: '#ffffff' },
      { left: '49%', top: 5, size: 2, o: 0.9, tone: '#ffffff' },
      { left: '62%', top: 3, size: 1, o: 0.6, tone: '#ffffff' },
      { left: '73%', top: 11, size: 1, o: 0.75, tone: '#bae6fd' },
      { left: '92%', top: 13, size: 1, o: 0.65, tone: '#ffffff' },
    ],
    [],
  );

  const drift = useLoop(30000);
  const shoot = useLoop(7000);
  const ring = useLoop(5000);

  return (
    <>
      <LinearGradient
        colors={['#010615', '#06183a', '#0b2f62', '#15528c']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* The nebula drifts as one piece, exactly 24 cells, so the loop point
          lands back on the grid and the jump is invisible. */}
      <Animated.View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFillObject,
          transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -24 * px] }) }],
        }}
      >
        {clouds.map((c, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: c.left as any,
              top: c.top * px,
              width: c.w * px,
              height: c.h * px,
              backgroundColor: c.tone,
            }}
          />
        ))}
      </Animated.View>

      {still.map((s, i) => (
        <View
          key={`st${i}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: s.left as any,
            top: s.top * px,
            width: s.size * px,
            height: s.size * px,
            backgroundColor: s.tone,
            opacity: s.o,
          }}
        />
      ))}

      {stars.map((s, i) => (
        <PixelStar key={`tw${i}`} {...s} top={s.top * px} size={s.size * px} />
      ))}

      {/* Shooting star: visible for a quarter of the loop, then nothing. The
          pause is what makes it an event rather than traffic. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: '11%',
          top: 2 * px,
          width: 8 * px,
          height: px,
          backgroundColor: '#e0f2fe',
          opacity: shoot.interpolate({ inputRange: [0, 0.04, 0.22, 0.26, 1], outputRange: [0, 1, 1, 0, 0] }),
          transform: [
            { translateX: shoot.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0, 46 * px, 46 * px] }) },
            { translateY: shoot.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0, 22 * px, 22 * px] }) },
          ],
        }}
      />

      {/* A small ringed planet, built from whole cells. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 4 * px,
          bottom: 2 * px,
          width: 7 * px,
          height: px,
          backgroundColor: '#7dd3fc',
          opacity: ring.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 0.45, 0.8] }),
        }}
      />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', right: 5 * px, bottom: 3 * px, width: 5 * px, height: 4 * px, backgroundColor: '#38bdf8' }}
      />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', right: 6 * px, bottom: 5 * px, width: 3 * px, height: px, backgroundColor: '#e0f2fe' }}
      />
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
          {banner.design === 'nebula' && <Nebula height={height} />}
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
