import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { setHasSeenTutorial } from '@/src/storage';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import type { ThemeIconKey } from '@/constants/ThemeIcons';

const PAD = 20;
const SECTION = 24;
const RADIUS = 20;
const RADIUS_SM = 14;

export default function Profile() {
  const { user, tasks } = useApp();
  const theme = useTheme();
  const pending = tasks.filter((t) => !t.isDone);
  const completed = tasks.length - pending.length;
  const rate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  const resetTutorial = async () => {
    await setHasSeenTutorial(false);
    router.replace('/(auth)/onboarding');
  };

  const menuItems: { icon: ThemeIconKey; label: string; onPress: () => void }[] = [
    { icon: 'settings', label: 'Subject colours', onPress: () => router.push('/subject-colors' as any) },
    { icon: 'stressMap', label: 'Stress Map', onPress: () => router.push('/stress-map' as any) },
    { icon: 'weeklySummary', label: 'Weekly Summary', onPress: () => router.push('/weekly-summary' as any) },
    { icon: 'leaderboard', label: 'Leaderboard', onPress: () => router.push('/leaderboard' as any) },
    { icon: 'helpCircle', label: 'Reset tutorial', onPress: resetTutorial },
  ];

  const menuIconColor = [theme.accent2, theme.primary, theme.secondary, theme.accent3, theme.textSecondary];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: theme.primary }]}>
        <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <Text style={styles.avatarText}>
            {user.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <View style={[styles.badgeDot, { backgroundColor: theme.focusCardText }]} />
          <Text style={styles.badgeText}>Active</Text>
        </View>
        <Text style={styles.heroName}>{user.name}</Text>
        <Text style={styles.heroMeta}>{user.studentId}</Text>
        <Text style={styles.heroMeta}>{user.program}</Text>
      </View>

      {/* Progress */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.progressRow}>
          <ThemeIcon name="star" size={18} color={theme.accent3} />
          <Text style={[styles.progressLabel, { color: theme.text }]}>Scholar Level</Text>
        </View>
        <View style={[styles.barBg, { backgroundColor: theme.border }]}>
          <View style={[styles.barFill, { width: `${rate}%`, backgroundColor: theme.primary }]} />
        </View>
        <Text style={[styles.progressPct, { color: theme.textSecondary }]}>{rate}% complete</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.statIconWrap, { backgroundColor: theme.primary + '18' }]}>
            <ThemeIcon name="clock" size={22} color={theme.primary} />
          </View>
          <Text style={[styles.statValue, { color: theme.text }]}>{pending.length}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Pending</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.statIconWrap, { backgroundColor: theme.success + '22' }]}>
            <ThemeIcon name="pieChart" size={22} color={theme.success} />
          </View>
          <Text style={[styles.statValue, { color: theme.text }]}>{rate}%</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Done</Text>
        </View>
      </View>

      {/* Menu */}
      <View style={styles.menuSection}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>SETTINGS & TOOLS</Text>
        <View style={[styles.menuCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {menuItems.map((item, i) => (
            <Pressable
              key={item.label}
              style={({ pressed }) => [
                styles.menuRow,
                i < menuItems.length - 1 && styles.menuRowBorder,
                { borderBottomColor: theme.border },
                pressed && styles.pressed,
              ]}
              onPress={item.onPress}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: theme.backgroundSecondary }]}>
                <ThemeIcon name={item.icon} size={20} color={menuIconColor[i] ?? theme.textSecondary} />
              </View>
              <Text style={[styles.menuLabel, { color: theme.text }]}>{item.label}</Text>
              <ThemeIcon name="arrowRight" size={18} color={theme.textSecondary} />
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: PAD, paddingTop: 56, paddingBottom: 24 },
  hero: {
    borderRadius: RADIUS,
    padding: 24,
    marginBottom: SECTION,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  heroName: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 6, letterSpacing: -0.3 },
  heroMeta: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 2 },
  card: {
    borderRadius: RADIUS_SM,
    padding: 18,
    marginBottom: SECTION,
    borderWidth: 1,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  progressLabel: { fontSize: 15, fontWeight: '800' },
  barBg: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  barFill: { height: '100%', borderRadius: 4 },
  progressPct: { fontSize: 12, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: SECTION },
  statCard: {
    flex: 1,
    borderRadius: RADIUS_SM,
    padding: 18,
    borderWidth: 1,
    alignItems: 'center',
  },
  statIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  menuSection: { marginBottom: SECTION },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12 },
  menuCard: { borderRadius: RADIUS_SM, borderWidth: 1, overflow: 'hidden' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuLabel: { flex: 1, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
