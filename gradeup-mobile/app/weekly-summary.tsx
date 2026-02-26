import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS } from '@/src/constants';

export default function WeeklySummary() {
  const { user, tasks } = useApp();
  const pending = tasks.filter((t) => !t.isDone);
  const completed = tasks.length - pending.length;
  const rate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Weekly Summary</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Completion</Text>
        <Text style={styles.cardValue}>{rate}%</Text>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${rate}%` }]} />
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Pending tasks</Text>
        <Text style={styles.cardValue}>{pending.length}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.summaryText}>
          Week 12 (Dec 30 - Jan 3) shows a <Text style={styles.summaryBold}>25% workload increase</Text>. Week 13 is your critical window.
        </Text>
      </View>
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
  backBtn: { marginRight: 18 },
  backText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  card: { backgroundColor: COLORS.card, borderRadius: 24, padding: 26, marginBottom: 18, borderWidth: 1, borderColor: COLORS.border },
  cardLabel: { fontSize: 12, color: COLORS.gray, fontWeight: '800', marginBottom: 8, letterSpacing: 1 },
  cardValue: { fontSize: 32, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  barBg: { height: 10, backgroundColor: COLORS.bg, borderRadius: 5, marginTop: 16, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: COLORS.navy, borderRadius: 5 },
  summaryText: { fontSize: 13, color: COLORS.gray, lineHeight: 22 },
  summaryBold: { fontWeight: '800', color: '#1a1c1e' },
});
