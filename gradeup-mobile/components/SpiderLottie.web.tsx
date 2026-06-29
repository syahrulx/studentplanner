import React, { useEffect, useRef } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';

/**
 * Web fallback for {@link SpiderLottie} using `lottie-react` (lottie-web) instead
 * of the native WebView + bodymovin CDN pipeline.
 */
type SpiderLottieProps = {
  style?: StyleProp<ViewStyle>;
  variant?: 'badge' | 'loading' | 'net' | 'communityLine';
};

const SPIDER_JSON = require('../assets/spider.json');
const SPIDER_LOADER_JSON = require('../assets/spider-loader.json');
const SPIDER_NET_JSON = require('../assets/spider-net.json');
const SPIDER_COMMUNITY_LINE_JSON = require('../assets/spider-community-line.json');

export function SpiderLottie({ style, variant = 'badge' }: SpiderLottieProps) {
  const lottieRef = useRef<LottieRefCurrentProps>(null);

  const { data, speed } =
    variant === 'loading'
      ? { data: SPIDER_LOADER_JSON, speed: 0.9 }
      : variant === 'net'
      ? { data: SPIDER_NET_JSON, speed: 0.4 }
      : variant === 'communityLine'
      ? { data: SPIDER_COMMUNITY_LINE_JSON, speed: 0.55 }
      : { data: SPIDER_JSON, speed: 0.88 };

  useEffect(() => {
    lottieRef.current?.setSpeed(speed);
  }, [speed]);

  return (
    <View style={[styles.wrap, variant === 'net' && styles.netWrap, style]} pointerEvents="none">
      <Lottie
        lottieRef={lottieRef}
        animationData={data}
        loop
        autoplay
        style={{ width: '100%', height: '100%' }}
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
});
