import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { router, usePathname } from 'expo-router';
import { useTheme, useThemeId } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';
import { ThemeIcon } from '@/components/ThemeIcon';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import { useCommunity } from '@/src/context/CommunityContext';

type NavItem = {
  /** Pathname under (tabs) this item maps to. */
  path: string;
  label: string;
  render: (color: string, focused: boolean) => React.ReactNode;
  badge?: number;
};

/**
 * Left navigation rail for wide web viewports (replaces the bottom GlassTabBar).
 * Driven by expo-router (router + usePathname) so it stays decoupled from the
 * bottom-tab navigator's props.
 */
export function WebSidebar() {
  const theme = useTheme();
  const themeId = useThemeId();
  const isDark = isDarkTheme(themeId);
  const { language } = useApp();
  const T = useTranslations(language);
  const { communityBadgeCount } = useCommunity();
  const pathname = usePathname();

  const items: NavItem[] = [
    { path: '/', label: T('home'), render: (c, f) => <ThemeIcon name="home" size={f ? 24 : 22} color={c} /> },
    { path: '/planner', label: T('tasks'), render: (c) => <ThemeIcon name="tasks" size={22} color={c} /> },
    { path: '/notes', label: (T as any)('studyTitle') || 'Study', render: (c) => <Feather name="book-open" size={22} color={c} /> },
    { path: '/timetable', label: (T as any)('timetable') || 'Timetable', render: (c) => <ThemeIcon name="calendar" size={22} color={c} /> },
    { path: '/community', label: T('community'), render: (c) => <Feather name="map-pin" size={22} color={c} />, badge: communityBadgeCount },
  ];

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/' || pathname === '/index';
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.card, borderRightColor: theme.border },
      ]}
    >
      <Text style={[styles.brand, { color: theme.primary }]} numberOfLines={1}>
        Rencana
      </Text>

      <View style={styles.items}>
        {items.map((item) => {
          const focused = isActive(item.path);
          const color = focused ? theme.primary : theme.tabIconDefault;
          return (
            <Pressable
              key={item.path}
              onPress={() => router.navigate(item.path as any)}
              style={({ pressed }) => [
                styles.item,
                focused && { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : `${theme.primary}14` },
                pressed && { opacity: 0.75 },
              ]}
            >
              <View style={styles.iconWrap}>
                {item.render(color, focused)}
                {item.badge && item.badge > 0 ? (
                  <View style={[styles.badge, { borderColor: theme.card }]}>
                    <Text style={styles.badgeText} numberOfLines={1}>
                      {item.badge > 99 ? '99+' : String(item.badge)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, { color: focused ? theme.primary : theme.text }]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => router.push('/settings' as any)}
        style={({ pressed }) => [styles.item, pressed && { opacity: 0.75 }]}
      >
        <View style={styles.iconWrap}>
          <Feather name="settings" size={22} color={theme.tabIconDefault} />
        </View>
        <Text style={[styles.label, { color: theme.text }]} numberOfLines={1}>
          {(T as any)('settings') || 'Settings'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 240,
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 14,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  brand: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  items: {
    flex: 1,
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  iconWrap: {
    width: 26,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
  badge: {
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
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },
});
