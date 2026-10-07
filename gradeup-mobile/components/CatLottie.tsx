/**
 * The cat animations, rendered natively.
 *
 * ── What this replaced ──
 * A WebView per animation, each loading lottie.min.js **from cdnjs at
 * runtime** and carrying the whole animation JSON inlined into an HTML
 * string. Three things wrong with that, in order of how much they hurt:
 *
 *   1. It needed the network. With no signal, or with cdnjs blocked, the
 *      script never arrived and the animation simply never appeared — so a
 *      loading spinner was blank exactly when loading was slowest.
 *   2. It was a WebView: a whole browser engine, its own process on Android,
 *      for a spinner.
 *   3. Every start waited on a third-party request before drawing a frame.
 *
 * lottie-react-native plays the same JSON on the native Lottie renderer. The
 * files are bundled, so it works on a plane; the speeds below are the same
 * numbers the HTML passed to setSpeed, so nothing plays faster or slower than
 * it used to.
 */
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';

type CatLottieProps = {
  style?: StyleProp<ViewStyle>;
  variant?: 'badge' | 'loading' | 'task' | 'monoLoading';
};

const SOURCES = {
  badge: require('../assets/bad-cat.json'),
  loading: require('../assets/loading-cat.json'),
  task: require('../assets/task-cat.json'),
  monoLoading: require('../assets/mono-loader.json'),
} as const;

/** The same values the old HTML passed to anim.setSpeed(). */
const SPEEDS: Record<NonNullable<CatLottieProps['variant']>, number> = {
  badge: 0.65,
  loading: 1,
  task: 0.9,
  monoLoading: 1,
};

export function CatLottie({ style, variant = 'badge' }: CatLottieProps) {
  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      <LottieView
        source={SOURCES[variant]}
        autoPlay
        loop
        speed={SPEEDS[variant]}
        // Transparent on the style, not a prop — the native view takes its
        // background from here, and the WebView it replaces was transparent.
        style={styles.anim}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 72,
    height: 52,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  anim: { flex: 1, backgroundColor: 'transparent' },
});
