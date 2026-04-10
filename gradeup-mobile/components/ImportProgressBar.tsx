import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import type { ThemePalette } from '@/constants/Themes';

type Props = {
  /** 0–100 */
  progress: number;
  theme: ThemePalette;
  label?: string;
};

export function ImportProgressBar({ progress, theme, label }: Props) {
  const p = Math.min(100, Math.max(0, progress));
  const anim = useRef(new Animated.Value(p)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: p,
      duration: 320,
      useNativeDriver: false,
    }).start();
  }, [p, anim]);

  const widthInterpolated = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, { color: theme.text }]} numberOfLines={2}>
          {label}
        </Text>
      ) : null}
      <View style={[styles.track, { backgroundColor: theme.border }]}>
        <Animated.View
          style={[
            styles.fill,
            {
              width: widthInterpolated,
              backgroundColor: theme.primary,
            },
          ]}
        />
      </View>
      <Text style={[styles.pct, { color: theme.textSecondary }]}>{Math.round(p)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 10 },
  label: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  track: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  pct: { fontSize: 13, fontWeight: '800', textAlign: 'right' },
});
