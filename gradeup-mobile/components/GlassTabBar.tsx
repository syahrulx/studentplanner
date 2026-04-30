import React from 'react';
import Feather from '@expo/vector-icons/Feather';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme, useThemeId, useThemePack } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';
import { useCommunity } from '@/src/context/CommunityContext';

let BlurView: React.ComponentType<any> | null = null;
try {
  BlurView = require('expo-blur').BlurView;
} catch {
  BlurView = null;
}

const BAR_H = 64;
const BAR_RADIUS = 32;

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
  const themePack = useThemePack();
  const isCatTheme = themePack === 'cat';
  const isMonoTheme = themePack === 'mono';
  const isDark = isDarkTheme(themeId);
  const insets = useSafeAreaInsets();
  const { communityBadgeCount } = useCommunity();

  const hasBlur = BlurView && Platform.OS !== 'web';
  // Use completely transparent background when blur is active, letting the native OS handle the material
  const barBg = hasBlur ? 'transparent' : isDark ? hexToRgba(theme.card, 0.96) : hexToRgba(theme.card, 0.95);
      
  const topEdgeColor = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.50)';
  const outlineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
  const activeColor = isCatTheme ? '#8d5a3b' : theme.primary;
  const inactiveColor = theme.tabIconDefault;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <View
        style={[
          styles.barOuter,
          styles.barShadow,
          { shadowColor: isDark ? '#000000' : `${theme.primary}33` },
        ]}
      >
        {hasBlur && (() => {
          const BV = BlurView as React.ComponentType<any>;
          return (
            <BV
              intensity={100}
              tint="default"
              style={[StyleSheet.absoluteFill, styles.barBlur]}
            />
          );
        })()}
        <View style={[StyleSheet.absoluteFill, styles.barFill, { backgroundColor: barBg }]} />
        <View style={[StyleSheet.absoluteFill, styles.barBorder, { borderColor: outlineColor }]} />
        <View style={[StyleSheet.absoluteFill, styles.barTopHighlight, { borderTopColor: topEdgeColor, borderLeftColor: topEdgeColor, borderRightColor: topEdgeColor }]} />

        {state.routes.map((route, idx) => {
          const { options } = descriptors[route.key];
          
          // Hide tabs with href: null (the legacy "two" tab)
          if (route.name === 'two' || (options as any).href === null) return null;

          const focused = state.index === idx;
          const isHome = route.name === 'index';
          const color = focused ? activeColor : inactiveColor;

          const onPress = () => {
            const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !ev.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          if (isHome) {
            return (
              <Pressable
                key={route.key}
                style={({ pressed }) => [styles.tab, { paddingTop: 0, paddingBottom: 8 }, pressed && styles.pressed]}
                onPress={onPress}
              >
                <View style={{
                  width: 50,
                  height: 50,
                  borderRadius: 25,
                  backgroundColor: focused ? activeColor : theme.card,
                  borderColor: focused ? activeColor : theme.border,
                  borderWidth: focused ? 0 : 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: -20, // breaks out cleanly
                  marginBottom: 4,
                  shadowColor: focused ? activeColor : '#000000',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: focused ? 0.3 : 0.08,
                  shadowRadius: 10,
                  elevation: 6,
                }}>
                  {options.tabBarIcon?.({
                    focused,
                    color: focused ? (isMonoTheme ? '#000000' : theme.textInverse) : inactiveColor,
                    size: 24,
                  })}
                  {focused && isCatTheme ? (
                    <Feather name="heart" size={10} color={focused ? (isMonoTheme ? '#000000' : theme.textInverse) : inactiveColor} style={styles.catHomeAccent} />
                  ) : null}
                </View>
                <Text style={[styles.label, { color }]} numberOfLines={1}>
                  {(options.tabBarLabel as string) ?? options.title ?? route.name}
                </Text>
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
                {route.name === 'community' && communityBadgeCount > 0 ? (
                  <View style={[styles.communityBadge, { borderColor: theme.card }]}>
                    <Text style={styles.communityBadgeText} numberOfLines={1}>
                      {communityBadgeCount > 99 ? '99+' : String(communityBadgeCount)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[styles.label, { color }]}
                numberOfLines={1}
              >
                {(options.tabBarLabel as string) ?? options.title ?? route.name}
              </Text>
              {focused && (
                <View
                  style={[
                    styles.indicator,
                    isCatTheme ? styles.indicatorCat : null,
                    { backgroundColor: activeColor },
                  ]}
                />
              )}
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
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  barOuter: {
    width: '100%',
    maxWidth: 420,
    height: BAR_H,
    borderRadius: BAR_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  barBlur: {
    borderRadius: BAR_RADIUS,
    overflow: 'hidden',
  },
  barFill: {
    borderRadius: BAR_RADIUS,
    overflow: 'hidden',
  },
  barBorder: {
    borderRadius: BAR_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    pointerEvents: 'none',
  },
  barTopHighlight: {
    borderRadius: BAR_RADIUS,
    borderTopWidth: 1.5,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderBottomWidth: 0,
    pointerEvents: 'none',
  },
  barShadow: {
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 36,
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
    gap: 3,
    paddingHorizontal: 2,
  },
  tabIconWrap: {
    width: 28,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  communityBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  communityBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  indicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
  },
  indicatorCat: {
    width: 9,
    height: 4,
    borderRadius: 999,
  },
  catHomeAccent: {
    position: 'absolute',
    right: -1,
    top: -2,
    opacity: 0.95,
  },
  pressed: {
    opacity: 0.7,
  },
});
