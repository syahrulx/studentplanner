/**
 * InfiniteMarquee.tsx
 * A seamless, infinite scrolling marquee component.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type TextStyle, StyleProp } from 'react-native';

interface Props {
  text: string;
  textStyle?: StyleProp<TextStyle>;
  speed?: number; // pixels per second, default 40
}

export default function InfiniteMarquee({ text, textStyle, speed = 40 }: Props) {
  const [contentWidth, setContentWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  const GAP = 50; // Space between loops

  useEffect(() => {
    // Reset position when text or dimensions change
    translateX.setValue(0);
    if (animationRef.current) {
      animationRef.current.stop();
    }

    if (contentWidth > 0 && containerWidth > 0 && contentWidth > containerWidth) {
      const stride = contentWidth + GAP;
      const duration = (stride / speed) * 1000;

      animationRef.current = Animated.loop(
        Animated.timing(translateX, {
          toValue: -stride,
          duration: duration,
          easing: Easing.linear,
          useNativeDriver: true, // Use native driver for performance on regular screens
        })
      );
      animationRef.current.start();
    }

    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, [contentWidth, containerWidth, text, speed]);

  const shouldAnimate = contentWidth > containerWidth && containerWidth > 0;

  return (
    <View
      style={styles.container}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.animatedRow,
          { transform: [{ translateX }] }
        ]}
      >
        <Text
          style={[textStyle, styles.text]}
          onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}
          numberOfLines={1}
        >
          {text}
        </Text>
        
        {shouldAnimate && (
          <>
            <View style={{ width: GAP }} />
            <Text style={[textStyle, styles.text]} numberOfLines={1}>
              {text}
            </Text>
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    width: '100%',
  },
  animatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    // Ensure text doesn't wrap during measurement
    flexWrap: 'nowrap',
  },
});
