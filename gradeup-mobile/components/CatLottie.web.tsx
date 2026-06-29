import React, { useEffect, useRef } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';

type CatLottieProps = {
  style?: StyleProp<ViewStyle>;
  variant?: 'badge' | 'loading' | 'task' | 'monoLoading';
};

const BAD_CAT_JSON = require('../assets/bad-cat.json');
const LOADING_CAT_JSON = require('../assets/loading-cat.json');
const TASK_CAT_JSON = require('../assets/task-cat.json');
const MONO_LOADING_JSON = require('../assets/mono-loader.json');

export function CatLottie({ style, variant = 'badge' }: CatLottieProps) {
  const lottieRef = useRef<LottieRefCurrentProps>(null);

  const { data, speed } =
    variant === 'loading'
      ? { data: LOADING_CAT_JSON, speed: 1 }
      : variant === 'task'
      ? { data: TASK_CAT_JSON, speed: 0.9 }
      : variant === 'monoLoading'
      ? { data: MONO_LOADING_JSON, speed: 1 }
      : { data: BAD_CAT_JSON, speed: 0.65 };

  useEffect(() => {
    lottieRef.current?.setSpeed(speed);
  }, [speed]);

  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
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
    width: 72,
    height: 52,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
});
