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

const BAR_H = 68;
const BAR_RADIUS = 34;

export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const openAddMenu = useTabBarAddMenu();

  const hasBlur = BlurView && Platform.OS !== 'web';
  const barBg = hasBlur ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.88)';
  const activeColor = theme.primary;
  const inactiveColor = '#94a3b8';
  const addBtnBg = theme.primary;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <View style={[styles.barOuter, styles.barShadow]}>
        {hasBlur && (
          <BlurView
            intensity={140}
            tint="light"
            style={[StyleSheet.absoluteFill, styles.barBlur]}
          />
        )}
        <View style={[StyleSheet.absoluteFill, styles.barFill, { backgroundColor: barBg }]} />
        {/* Liquid glass: top highlight (main crest) */}
        <View style={styles.liquidCrest} />
        <View style={styles.liquidCrestSoft} />
        {/* Secondary highlight for curvature */}
        <View style={styles.liquidCrestInner} />
        {/* Bottom inner edge for glass thickness */}
        <View style={styles.liquidBottomEdge} />
        <View style={[StyleSheet.absoluteFill, styles.barBorder]} />
        <View style={[StyleSheet.absoluteFill, styles.barBorderInner]} />

        {state.routes.map((route, idx) => {
          const { options } = descriptors[route.key];
          
          // Expo Router's href: null doesn't reliably pass down to custom tab bars.
          // Explicitly hide the Study (notes) tab.
          if (route.name === 'notes' || (options as any).href === null) return null;

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
  barBlur: {
    borderRadius: BAR_RADIUS,
  },
  barFill: {
    borderRadius: BAR_RADIUS,
  },
  liquidCrest: {
    position: 'absolute',
    top: 0,
    left: '15%',
    right: '15%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    pointerEvents: 'none',
  },
  liquidCrestSoft: {
    position: 'absolute',
    top: 1,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    pointerEvents: 'none',
  },
  liquidCrestInner: {
    position: 'absolute',
    top: 4,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    pointerEvents: 'none',
  },
  liquidBottomEdge: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 16,
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
    pointerEvents: 'none',
  },
  barBorder: {
    borderRadius: BAR_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    pointerEvents: 'none',
  },
  barBorderInner: {
    borderRadius: BAR_RADIUS - 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    margin: 1,
    pointerEvents: 'none',
  },
  barShadow: {
    shadowColor: '#003366',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 20,
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
        shadowColor: '#003366',
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
