import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { useTabBarAddMenu } from '@/contexts/TabBarContext';

let BlurView: React.ComponentType<any> | null = null;
try {
  BlurView = require('expo-blur').BlurView;
} catch {
  BlurView = null;
}

const TAB_COUNT = 5;
const BAR_H = 62;
const PILL_INSET = 4;
const PILL_H = BAR_H - PILL_INSET * 2;

const ACTIVE_COLOR = '#ca8a04';
const INACTIVE_COLOR = '#ffffff';

const springCfg = { damping: 18, stiffness: 180, mass: 0.8 };

export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const openAddMenu = useTabBarAddMenu();
  const [barW, setBarW] = useState(0);

  const segW = barW / TAB_COUNT;
  const pillW = segW - 6;

  const tx = useSharedValue(0);

  useEffect(() => {
    if (segW > 0) {
      tx.value = withSpring(state.index * segW + 3, springCfg);
    }
  }, [state.index, segW]);

  const animPill = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
    width: pillW > 0 ? pillW : 0,
  }));

  const hasBlur = BlurView && Platform.OS !== 'web';
  const barBg = hasBlur ? 'rgba(12, 12, 12, 0.75)' : 'rgba(12, 12, 12, 0.92)';
  const barBorderColor = 'rgba(255, 255, 255, 0.1)';
  const pillBg = 'rgba(255, 255, 255, 0.1)';

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]} pointerEvents="box-none">
      <View style={styles.barOuter} onLayout={(e) => setBarW(e.nativeEvent.layout.width)}>
        {/* Blur layer */}
        {hasBlur && (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        {/* Tint overlay */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: barBg, borderRadius: BAR_H / 2 }]} />
        {/* Border */}
        <View style={[styles.barBorder, { borderColor: barBorderColor }]} />

        {/* Pill */}
        {barW > 0 && <Animated.View style={[styles.pill, { backgroundColor: pillBg }, animPill]} />}

        {/* Tabs */}
        {state.routes.map((route, idx) => {
          const { options } = descriptors[route.key];
          const focused = state.index === idx;
          const isAdd = route.name === 'two';
          const color = focused ? ACTIVE_COLOR : INACTIVE_COLOR;

          const onPress = () => {
            if (isAdd && openAddMenu) { openAddMenu(); return; }
            const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !ev.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          if (isAdd) {
            return (
              <Pressable key={route.key} style={styles.tab} onPress={onPress} accessibilityLabel="Add">
                <View style={[styles.addBtn, { backgroundColor: '#14532d' }]}>
                  <ThemeIcon name="add" size={22} color="#fff" />
                </View>
              </Pressable>
            );
          }

          return (
            <Pressable key={route.key} style={styles.tab} onPress={onPress}>
              {options.tabBarIcon?.({ focused, color, size: 22 })}
              <Text style={[styles.label, { color }]} numberOfLines={1}>
                {(options.tabBarLabel as string) ?? options.title ?? route.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 4,
  },
  barOuter: {
    width: '100%',
    maxWidth: 360,
    height: BAR_H,
    borderRadius: BAR_H / 2,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  barBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BAR_H / 2,
    borderWidth: 1,
  },
  pill: {
    position: 'absolute',
    top: PILL_INSET,
    height: PILL_H,
    borderRadius: PILL_H / 2,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: BAR_H,
    zIndex: 2,
    gap: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
