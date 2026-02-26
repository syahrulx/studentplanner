import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { setHasSeenTutorial } from '@/src/storage';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';

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

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={[styles.sectionBox, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <View style={[styles.hero, { backgroundColor: theme.primary }]}>
          <View style={[styles.avatar, { backgroundColor: theme.card }]}>
            <Text style={[styles.avatarText, { color: theme.primary }]}>
              {user.name.split(' ').map((n) => n[0]).join('')}
            </Text>
          </View>
          <View style={styles.badge}>
            <View style={[styles.dot, { backgroundColor: theme.success }]} />
            <Text style={[styles.badgeText, { color: theme.focusCardText }]}>Active</Text>
          </View>
          <Text style={[styles.name, { color: theme.textInverse }]}>{user.name}</Text>
          <Text style={[styles.meta, { color: theme.focusCardText, opacity: 0.9 }]}>{user.studentId}</Text>
          <Text style={[styles.meta, { color: theme.focusCardText, opacity: 0.9 }]}>{user.program}</Text>
        </View>
      </View>

      <View style={[styles.sectionBox, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <View style={[styles.progressCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.progressRow}>
            <ThemeIcon name="star" size={16} color={theme.accent3} />
            <Text style={[styles.progressLabel, { color: theme.text }]}>Scholar Level</Text>
          </View>
          <View style={[styles.barBg, { backgroundColor: theme.border }]}>
            <View style={[styles.barFill, { width: `${rate}%`, backgroundColor: theme.primary }]} />
          </View>
          <Text style={[styles.progressPct, { color: theme.textSecondary }]}>{rate}%</Text>
        </View>
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemeIcon name="clock" size={20} color={theme.accent2} />
            <Text style={[styles.statValue, { color: theme.text }]}>{pending.length}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Pending</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemeIcon name="pieChart" size={20} color={theme.primary} />
            <Text style={[styles.statValue, { color: theme.text }]}>{rate}%</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Done</Text>
          </View>
        </View>
      </View>

      <View style={[styles.sectionBox, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <Pressable style={({ pressed }) => [styles.menuBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]} onPress={() => router.push('/subject-colors' as any)}>
          <ThemeIcon name="settings" size={20} color={theme.accent2} />
          <Text style={[styles.menuBtnText, { color: theme.text }]}>Subject colours</Text>
          <ThemeIcon name="arrowRight" size={18} color={theme.textSecondary} />
        </Pressable>
        <Pressable style={({ pressed }) => [styles.menuBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]} onPress={() => router.push('/stress-map' as any)}>
        <ThemeIcon name="stressMap" size={20} color={theme.primary} />
        <Text style={[styles.menuBtnText, { color: theme.text }]}>Stress Map</Text>
        <ThemeIcon name="arrowRight" size={18} color={theme.textSecondary} />
      </Pressable>
      <Pressable style={({ pressed }) => [styles.menuBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]} onPress={() => router.push('/weekly-summary' as any)}>
        <ThemeIcon name="weeklySummary" size={20} color={theme.secondary} />
        <Text style={[styles.menuBtnText, { color: theme.text }]}>Weekly Summary</Text>
        <ThemeIcon name="arrowRight" size={18} color={theme.textSecondary} />
      </Pressable>
      <Pressable style={({ pressed }) => [styles.menuBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]} onPress={() => router.push('/leaderboard' as any)}>
        <ThemeIcon name="leaderboard" size={20} color={theme.accent3} />
        <Text style={[styles.menuBtnText, { color: theme.text }]}>Leaderboard</Text>
        <ThemeIcon name="arrowRight" size={18} color={theme.textSecondary} />
      </Pressable>
      <Pressable style={({ pressed }) => [styles.menuBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]} onPress={resetTutorial}>
          <ThemeIcon name="helpCircle" size={20} color={theme.textSecondary} />
          <Text style={[styles.menuBtnText, { color: theme.text }]}>Reset tutorial</Text>
          <ThemeIcon name="arrowRight" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 14, paddingTop: 56, paddingBottom: 100 },
  sectionBox: { marginBottom: 20, padding: 20, borderRadius: 22, borderWidth: 1 },
  hero: { borderRadius: 20, padding: 24, marginBottom: 0 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  avatarText: { fontSize: 24, fontWeight: '800' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  name: { fontSize: 26, fontWeight: '800', marginBottom: 10, letterSpacing: -0.5 },
  meta: { fontSize: 13, marginBottom: 4, lineHeight: 18 },
  progressCard: { borderRadius: 18, padding: 20, marginBottom: 14, borderWidth: 1 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  progressLabel: { fontSize: 13, fontWeight: '800' },
  barBg: { height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 10 },
  barFill: { height: '100%', borderRadius: 5 },
  progressPct: { fontSize: 13, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 14, marginBottom: 0 },
  statCard: { flex: 1, borderRadius: 18, padding: 18, borderWidth: 1 },
  statValue: { fontSize: 22, fontWeight: '800', marginTop: 10 },
  statLabel: { fontSize: 12, marginTop: 4 },
  menuBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 18, marginBottom: 12, borderWidth: 1 },
  pressed: { opacity: 0.96 },
  menuBtnText: { flex: 1, marginLeft: 14, fontSize: 16, fontWeight: '700' },
});
