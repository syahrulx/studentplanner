import React, { useEffect, useRef } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';

type PlaygroundCatLottieProps = {
  style?: StyleProp<ViewStyle>;
};

const CAT_PLAYGROUND_JSON = require('../assets/cat-playground.json');

export function PlaygroundCatLottie({ style }: PlaygroundCatLottieProps) {
  const lottieRef = useRef<LottieRefCurrentProps>(null);

  useEffect(() => {
    lottieRef.current?.setSpeed(0.95);
  }, []);

  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      <Lottie
        lottieRef={lottieRef}
        animationData={CAT_PLAYGROUND_JSON}
        loop
        autoplay
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 30,
    height: 30,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
});
