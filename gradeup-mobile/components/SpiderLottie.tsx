/**
 * The spider animations, rendered natively.
 *
 * Same change as CatLottie, and the same reasons: each of these was a WebView
 * fetching lottie.min.js from cdnjs before it could draw, so with no network
 * the animation never appeared at all — including the loading spinner, which
 * is needed most precisely when the connection is poor.
 *
 * One thing is deliberately not carried over. The old HTML could render with
 * `canvas` instead of `svg` for the loader, because its JSON is 399 KB and
 * canvas was lighter in a browser. The native renderer has no such split, and
 * the choice does not apply to it.
 *
 * The `multiply` blend option is gone too: every caller passed false, so it
 * never did anything.
 */
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';

type SpiderLottieProps = {
  style?: StyleProp<ViewStyle>;
  variant?: 'badge' | 'loading' | 'net' | 'communityLine';
};

const SOURCES = {
  badge: require('../assets/spider.json'),
  loading: require('../assets/spider-loader.json'),
  net: require('../assets/spider-net.json'),
  communityLine: require('../assets/spider-community-line.json'),
} as const;

/** The same values the old HTML passed to anim.setSpeed(). */
const SPEEDS: Record<NonNullable<SpiderLottieProps['variant']>, number> = {
  badge: 0.88,
  loading: 0.9,
  net: 0.4,
  communityLine: 0.55,
};

export function SpiderLottie({ style, variant = 'badge' }: SpiderLottieProps) {
  return (
    <View
      style={[styles.wrap, variant === 'net' && styles.netWrap, style]}
      pointerEvents="none"
    >
      <LottieView
        source={SOURCES[variant]}
        autoPlay
        loop
        speed={SPEEDS[variant]}
        style={styles.anim}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 88,
    height: 72,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  netWrap: {
    width: '100%',
    height: '100%',
  },
  anim: { flex: 1, backgroundColor: 'transparent' },
});
