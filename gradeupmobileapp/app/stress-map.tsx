import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SOW_DATA } from '../src/constants';
import { useAppContext } from '../src/context/AppContext';

const SUBJECT_LOAD = [
  { code: 'CSC584', level: 7.0 },
  { code: 'ICT551', level: 8.0 },
  { code: 'IPS551', level: 9.0 },
  { code: 'ICT502', level: 6.0 },
  { code: 'ISP573', level: 6.0 },
  { code: 'LCC401', level: 5.0 },
  { code: 'TAC451', level: 4.0 },
  { code: 'CTU553', level: 3.0 },
];

const MAX_STRESS = 10;

export default function StressMapScreen() {
  const router = useRouter();
  const { user } = useAppContext();

  const subjects = Object.values(SOW_DATA);
  const stressValues = subjects.length > 0
    ? Array.from({ length: 14 }, (_, i) => {
        const sum = subjects.reduce((acc, s) => acc + (s[i] || 0), 0);
        return Math.round(sum / subjects.length);
      })
    : [3, 4, 5, 4, 5, 6, 5, 6, 7, 6, 8, 5, 9, 7];
  const maxBarHeight = 140;
  const currentIdx = user.currentWeek - 1;

  const avgStress = (stressValues.reduce((a, b) => a + b, 0) / stressValues.length).toFixed(1);
  const highestWeek = stressValues.indexOf(Math.max(...stressValues)) + 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color={COLORS.navy} />
          </Pressable>
          <View>
            <Text style={styles.title}>SOW Intelligence</Text>
            <Text style={styles.subtitle}>PART {user.part} ISE {'\u2022'} AI MANAGED</Text>
          </View>
        </View>

        {/* Velocity Chart */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartLabel}>WORKLOAD VELOCITY</Text>
              <View style={styles.criticalRow}>
                <View style={styles.criticalDot} />
                <Text style={styles.criticalText}>CRITICAL WAVE</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.chartWeekNum}>W14</Text>
              <Text style={styles.chartScaleLabel}>SCALE RANGE</Text>
            </View>
          </View>

          <View style={styles.barsContainer}>
            {stressValues.map((val, i) => {
              const height = (val / MAX_STRESS) * maxBarHeight;
              const isCurrent = i === currentIdx;
              return (
                <View key={i} style={styles.barColumn}>
                  <View
                    style={[
                      styles.bar,
                      { height },
                      isCurrent ? styles.barCurrent : styles.barNormal,
                    ]}
                  />
                  <Text style={[styles.barLabel, isCurrent && styles.barLabelActive]}>
                    W{i + 1}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>AVG. STRESS</Text>
            <Text style={styles.statValue}>{avgStress}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>HIGHEST WEEK</Text>
            <Text style={styles.statValueRed}>W{highestWeek}</Text>
          </View>
        </View>

        {/* Subject Load Breakdown */}
        <View style={styles.loadHeader}>
          <Text style={styles.loadTitle}>SUBJECT LOAD BREAKDOWN</Text>
          <Text style={styles.loadBadge}>AI SYNC ACTIVE</Text>
        </View>

        <View style={styles.loadList}>
          {SUBJECT_LOAD.map((sub, i) => (
            <View key={i} style={styles.loadItem}>
              <Text style={styles.loadCode}>{sub.code}</Text>
              <View style={styles.loadBarTrack}>
                <View style={[styles.loadBarFill, { width: `${(sub.level / MAX_STRESS) * 100}%` }]}>
                  <View style={styles.loadBarThumb} />
                </View>
              </View>
              <Text style={styles.loadLevel}>LEVEL {sub.level.toFixed(1)}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.navy },
  subtitle: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1.5, marginTop: 2 },

  // Chart Card
  chartCard: {
    backgroundColor: '#4a6274',
    borderRadius: 28,
    padding: 24,
    marginBottom: 16,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  chartLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 2,
    marginBottom: 6,
  },
  criticalRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  criticalDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' },
  criticalText: { fontSize: 10, fontWeight: '900', color: COLORS.white, letterSpacing: 1 },
  chartWeekNum: { fontSize: 28, fontWeight: '900', color: COLORS.white },
  chartScaleLabel: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.4)', letterSpacing: 1 },

  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 160,
  },
  barColumn: { alignItems: 'center', flex: 1 },
  bar: {
    width: 14,
    borderRadius: 7,
    marginBottom: 8,
  },
  barNormal: { backgroundColor: 'rgba(255,255,255,0.25)' },
  barCurrent: { backgroundColor: COLORS.white, width: 18, borderRadius: 9 },
  barLabel: { fontSize: 7, fontWeight: '600', color: 'rgba(255,255,255,0.35)' },
  barLabelActive: {
    fontWeight: '900',
    color: COLORS.white,
    backgroundColor: COLORS.navy,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    fontSize: 7,
  },

  // Stats
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 18,
    alignItems: 'center',
  },
  statLabel: { fontSize: 9, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1.5, marginBottom: 6 },
  statValue: { fontSize: 28, fontWeight: '900', color: COLORS.navy },
  statValueRed: { fontSize: 28, fontWeight: '900', color: '#ef4444' },

  // Subject Load
  loadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  loadTitle: { fontSize: 10, fontWeight: '900', color: COLORS.textSecondary, letterSpacing: 2 },
  loadBadge: { fontSize: 9, fontWeight: '700', color: COLORS.navy, letterSpacing: 1 },

  loadList: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    gap: 20,
  },
  loadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadCode: {
    width: 56,
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.navy,
  },
  loadBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'visible',
  },
  loadBarFill: {
    height: 4,
    backgroundColor: '#94a3b8',
    borderRadius: 2,
    position: 'relative',
    justifyContent: 'center',
  },
  loadBarThumb: {
    position: 'absolute',
    right: -5,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.navy,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  loadLevel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    width: 54,
    textAlign: 'right',
  },
});
