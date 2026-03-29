import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';

interface MarqueeTextProps {
  text: string;
  style?: any;
  duration?: number;
  useNativeDriver?: boolean;
}

export default function MarqueeText({ text, style, duration = 5000, useNativeDriver = true }: MarqueeTextProps) {
  const [singleTextWidth, setSingleTextWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  // To make a seamless loop, we render the text twice with a gap gap of spaces.
  const gapString = '        '; 
  const displayString = `${text}${gapString}${text}${gapString}${text}`;

  useEffect(() => {
    // We want to translate exactly the width of "text + gap".
    // Since we can't easily measure just the gap, we approximate or just measure the single text.
    if (singleTextWidth > 0 && containerWidth > 0 && singleTextWidth > containerWidth) {
      // Approximate gap width (~24px for 8 spaces, depends on font but close enough)
      const gapWidth = 32; 
      const distance = singleTextWidth + gapWidth;

      // Reset value and start loop
      translateX.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.timing(translateX, {
            toValue: -distance,
            duration: (distance / 50) * 1000, // speed based on distance (50px per second)
            easing: Easing.linear,
            useNativeDriver,
          }),
          // Instant jump back
          Animated.timing(translateX, {
            toValue: 0,
            duration: 0,
            useNativeDriver,
          })
        ])
      ).start();
    } else {
      translateX.setValue(0);
      translateX.stopAnimation();
    }
  }, [singleTextWidth, containerWidth, text]);

  return (
    <View
      style={styles.container}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
      >
        {/* Invisible single text to measure exactly one instance */}
        <Text 
          style={[style, { opacity: 0 }]} 
          onLayout={(e) => setSingleTextWidth(e.nativeEvent.layout.width)}
          numberOfLines={1}
        >
          {text}
        </Text>

        <Animated.Text
          style={[style, { position: 'absolute', transform: [{ translateX }] }]}
          numberOfLines={1}
        >
          {singleTextWidth > containerWidth ? displayString : text}
        </Animated.Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    width: '100%',
  },
});
