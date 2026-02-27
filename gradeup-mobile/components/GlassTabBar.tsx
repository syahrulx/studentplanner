import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { useTabBarAddMenu } from '@/contexts/TabBarContext';

let BlurView: React.ComponentType<any> | null = null;
try {
  BlurView = require('expo-blur').BlurView;
} catch {
  BlurView = null;
}

const BAR_H = 64;
const BAR_RADIUS = 28;

export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const openAddMenu = useTabBarAddMenu();

  const hasBlur = BlurView && Platform.OS !== 'web';
  const barBg = hasBlur ? 'rgba(255, 255, 255, 0.94)' : '#ffffff';
  const barBorderColor = 'rgba(12, 74, 110, 0.06)';
  const activeColor = theme.primary;
  const inactiveColor = '#94a3b8';
  const addBtnBg = theme.primary;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <View style={[styles.barOuter, styles.barShadow]}>
        {hasBlur && (
          <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
        )}
        <View style={[StyleSheet.absoluteFill, styles.barFill, { backgroundColor: barBg }]} />
        <View style={[StyleSheet.absoluteFill, styles.barBorder, { borderColor: barBorderColor }]} />

        {state.routes.map((route, idx) => {
          const { options } = descriptors[route.key];
          const focused = state.index === idx;
          const isAdd = route.name === 'two';
          const color = focused ? activeColor : inactiveColor;

          const onPress = () => {
            if (isAdd && openAddMenu) { openAddMenu(); return; }
            const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !ev.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          if (isAdd) {
            return (
              <Pressable
                key={route.key}
                style={({ pressed }) => [styles.addTab, pressed && styles.pressed]}
                onPress={onPress}
                accessibilityLabel="Add"
              >
                <View style={[styles.addBtn, { backgroundColor: addBtnBg }]}>
                  <ThemeIcon name="add" size={24} color="#fff" />
                </View>
              </Pressable>
            );
          }

          return (
            <Pressable
              key={route.key}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
              onPress={onPress}
            >
              <View style={styles.tabIconWrap}>
                {options.tabBarIcon?.({ focused, color, size: 24 })}
              </View>
              <Text
                style={[styles.label, { color }]}
                numberOfLines={1}
              >
                {(options.tabBarLabel as string) ?? options.title ?? route.name}
              </Text>
              {focused && <View style={[styles.indicator, { backgroundColor: activeColor }]} />}
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
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  barOuter: {
    width: '100%',
    maxWidth: 400,
    height: BAR_H,
    borderRadius: BAR_RADIUS,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  barFill: {
    borderRadius: BAR_RADIUS,
  },
  barShadow: {
    shadowColor: '#0c4a6e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
    elevation: 6,
  },
  barBorder: {
    borderRadius: BAR_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    pointerEvents: 'none',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: BAR_H,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 4,
  },
  tabIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  indicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  addTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: BAR_H,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
    ...Platform.select({
      ios: {
        shadowColor: '#0c4a6e',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  pressed: {
    opacity: 0.7,
  },
});
