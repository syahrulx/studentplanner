import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS } from '@/src/constants';

export default function StressMap() {
  const { user, courses } = useApp();
  const weeks = Array.from({ length: 14 }, (_, i) => i + 1);
  const maxWork = 10;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Stress Map</Text>
      </View>
      <Text style={styles.subtitle}>Week workload (1–10) by subject</Text>
      <View style={styles.chart}>
        {weeks.map((w) => {
          const workload = courses.reduce((sum, c) => sum + (c.workload[w - 1] ?? 0), 0);
          const pct = Math.min(100, (workload / maxWork) * 100);
          return (
            <View key={w} style={styles.barRow}>
              <Text style={styles.weekLabel}>W{w}</Text>
              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.barValue}>{workload}</Text>
            </View>
          );
        })}
      </View>
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  backBtn: { marginRight: 18 },
  backText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: COLORS.gray, marginBottom: 28, marginTop: 4 },
  chart: { gap: 14 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  weekLabel: { width: 32, fontSize: 12, fontWeight: '700', color: COLORS.gray },
  barBg: { flex: 1, height: 28, backgroundColor: COLORS.border, borderRadius: 10, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: COLORS.navy, borderRadius: 10 },
  barValue: { width: 24, fontSize: 12, fontWeight: '700', color: COLORS.text, textAlign: 'right' },
});
