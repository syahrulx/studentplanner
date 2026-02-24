import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';
import { setHasSeenTutorial } from '@/src/storage';

export default function Profile() {
  const { user, tasks } = useApp();
  const pending = tasks.filter((t) => !t.isDone);
  const completed = tasks.length - pending.length;
  const rate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  const resetTutorial = async () => {
    await setHasSeenTutorial(false);
    router.replace('/(auth)/onboarding');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user.name.split(' ').map((n) => n[0]).join('')}
          </Text>
        </View>
        <View style={styles.badge}>
          <View style={styles.dot} />
          <Text style={styles.badgeText}>Active</Text>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.meta}>{user.studentId}</Text>
        <Text style={styles.meta}>{user.program}</Text>
      </View>

      <View style={styles.progressCard}>
        <View style={styles.progressRow}>
          <Icons.Sparkles size={16} color={COLORS.gold} />
          <Text style={styles.progressLabel}>Scholar Level</Text>
        </View>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${rate}%` }]} />
        </View>
        <Text style={styles.progressPct}>{rate}%</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Icons.CheckCircle size={20} color={COLORS.navy} />
          <Text style={styles.statValue}>{pending.length}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Icons.TrendingUp size={20} color={COLORS.navy} />
          <Text style={styles.statValue}>{rate}%</Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
      </View>

      <Pressable style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]} onPress={() => router.push('/stress-map' as any)}>
        <Icons.Layers size={20} color={COLORS.navy} />
        <Text style={styles.menuBtnText}>Stress Map</Text>
        <Icons.ArrowRight size={18} color={COLORS.gray} />
      </Pressable>
      <Pressable style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]} onPress={() => router.push('/weekly-summary' as any)}>
        <Icons.Calendar size={20} color={COLORS.navy} />
        <Text style={styles.menuBtnText}>Weekly Summary</Text>
        <Icons.ArrowRight size={18} color={COLORS.gray} />
      </Pressable>
      <Pressable style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]} onPress={() => router.push('/leaderboard' as any)}>
        <Icons.TrendingUp size={20} color={COLORS.navy} />
        <Text style={styles.menuBtnText}>Leaderboard</Text>
        <Icons.ArrowRight size={18} color={COLORS.gray} />
      </Pressable>
      <Pressable style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]} onPress={resetTutorial}>
        <Icons.HelpCircle size={20} color={COLORS.navy} />
        <Text style={styles.menuBtnText}>Reset tutorial</Text>
        <Icons.ArrowRight size={18} color={COLORS.gray} />
      </Pressable>
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 100 },
  hero: {
    backgroundColor: COLORS.navy,
    borderRadius: 28,
    padding: 28,
    marginBottom: 28,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  avatarText: { fontSize: 24, fontWeight: '800', color: COLORS.navy },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#4ade80' },
  badgeText: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
  name: { fontSize: 26, fontWeight: '800', color: COLORS.white, marginBottom: 10, letterSpacing: -0.5 },
  meta: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 4, lineHeight: 18 },
  progressCard: { backgroundColor: COLORS.white, borderRadius: 24, padding: 22, marginBottom: 28, borderWidth: 1, borderColor: COLORS.border },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  progressLabel: { fontSize: 13, fontWeight: '800', color: COLORS.navy },
  barBg: { height: 10, backgroundColor: COLORS.bg, borderRadius: 5, overflow: 'hidden', marginBottom: 10 },
  barFill: { height: '100%', backgroundColor: COLORS.navy, borderRadius: 5 },
  progressPct: { fontSize: 13, fontWeight: '700', color: COLORS.gray },
  statsRow: { flexDirection: 'row', gap: 14, marginBottom: 28 },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: COLORS.navy, marginTop: 10 },
  statLabel: { fontSize: 12, color: COLORS.gray, marginTop: 4 },
  menuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 18,
    borderRadius: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pressed: { opacity: 0.96 },
  menuBtnText: { flex: 1, marginLeft: 14, fontSize: 16, fontWeight: '700', color: COLORS.navy },
});
