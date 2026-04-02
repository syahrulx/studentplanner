import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme, useThemeId } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';
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

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return `rgba(0,0,0,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const themeId = useThemeId();
  const isDark = isDarkTheme(themeId);
  const insets = useSafeAreaInsets();
  const openAddMenu = useTabBarAddMenu();

  const hasBlur = BlurView && Platform.OS !== 'web';
  const barBg = isDark
    ? hasBlur
      ? hexToRgba(theme.card, 0.72)
      : hexToRgba(theme.card, 0.96)
    : hasBlur
      ? hexToRgba(theme.card, 0.14)
      : hexToRgba(theme.card, 0.92);
  const activeColor = theme.primary;
  const inactiveColor = theme.tabIconDefault;
  const addBtnBg = theme.primary;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <View
        style={[
          styles.barOuter,
          styles.barShadow,
          { shadowColor: isDark ? theme.primary : `${theme.text}33` },
        ]}
      >
        {hasBlur && (
          <BlurView
            intensity={isDark ? 48 : 140}
            tint={isDark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, styles.barBlur]}
          />
        )}
        <View style={[StyleSheet.absoluteFill, styles.barFill, { backgroundColor: barBg }]} />
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
                <View
                  style={[
                    styles.addBtn,
                    { backgroundColor: addBtnBg },
                    Platform.OS === 'ios' && { shadowColor: theme.primary },
                  ]}
                >
                  <ThemeIcon name="add" size={24} color={theme.textInverse} />
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
    /** Equal-width slots (flex:1 on children). Avoid space-around — it skews outer tabs vs center Add. */
    justifyContent: 'flex-start',
  },
  barBlur: {
    borderRadius: BAR_RADIUS,
  },
  barFill: {
    borderRadius: BAR_RADIUS,
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
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 20,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    height: BAR_H,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 4,
    paddingHorizontal: 2,
  },
  /** Same box for every tab icon so Feather vs ThemeIcon optical center matches. */
  tabIconWrap: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  indicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  addTab: {
    flex: 1,
    minWidth: 0,
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
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  pressed: {
    opacity: 0.7,
  },
});
