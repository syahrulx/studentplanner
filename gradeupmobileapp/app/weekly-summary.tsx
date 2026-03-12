import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';
import { useAppContext } from '../src/context/AppContext';

export default function WeeklySummaryScreen() {
  const router = useRouter();
  const { user, tasks } = useAppContext();
  const [week, setWeek] = useState(user.currentWeek);
  const [reflection, setReflection] = useState('');

  const doneCount = tasks.filter((t) => t.isDone).length;
  const pendingCount = tasks.filter((t) => !t.isDone).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={COLORS.navy} />
        </Pressable>
        <Text style={styles.headerTitle}>Weekly Summary</Text>
        <View style={styles.weekPicker}>
          <Pressable onPress={() => setWeek((w) => Math.max(1, w - 1))}>
            <Feather name="chevron-left" size={20} color={COLORS.navy} />
          </Pressable>
          <Text style={styles.weekText}>Week {week}</Text>
          <Pressable onPress={() => setWeek((w) => w + 1)}>
            <Feather name="chevron-right" size={20} color={COLORS.navy} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.statDone]}>
            <Text style={[styles.statValue, styles.statValueLight]}>{doneCount}</Text>
            <Text style={[styles.statLabel, styles.statLabelLight]}>Done</Text>
          </View>
          <View style={[styles.statCard, styles.statPending]}>
            <Text style={[styles.statValue, styles.statValueDark]}>{pendingCount}</Text>
            <Text style={[styles.statLabel, styles.statLabelDark]}>Pending</Text>
          </View>
        </View>

        {/* AI Highlights */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Highlights</Text>
          <View style={styles.highlightItem}>
            <Feather name="check" size={18} color={COLORS.green} />
            <Text style={styles.highlightText}>Completed IPS551 Requirements on time</Text>
          </View>
          <View style={styles.highlightItem}>
            <Feather name="zap" size={18} color={COLORS.gold} />
            <Text style={styles.highlightText}>Strong focus on CSC584 this week</Text>
          </View>
        </View>

        {/* Self Reflection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Self Reflection</Text>
          <TextInput
            style={styles.reflectionInput}
            placeholder="How did this week go? What would you do differently?"
            placeholderTextColor={COLORS.textSecondary}
            multiline
            value={reflection}
            onChangeText={setReflection}
          />
        </View>

        {/* Export/Share - disabled */}
        <View style={styles.exportRow}>
          <Pressable style={styles.exportBtn} disabled>
            <Feather name="download" size={18} color={COLORS.textSecondary} />
            <Text style={styles.exportBtnTextDisabled}>Export</Text>
          </Pressable>
          <Pressable style={styles.exportBtn} disabled>
            <Feather name="share-2" size={18} color={COLORS.textSecondary} />
            <Text style={styles.exportBtnTextDisabled}>Share</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  backBtn: { padding: 4, marginRight: 12 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.navy,
    flex: 1,
  },
  weekPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weekText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 20,
  },
  statDone: {
    backgroundColor: COLORS.navy,
  },
  statPending: {
    backgroundColor: COLORS.gold,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  statValueLight: { color: COLORS.white },
  statLabelLight: { color: 'rgba(255,255,255,0.9)' },
  statValueDark: { color: COLORS.navy },
  statLabelDark: { color: 'rgba(0,0,0,0.7)' },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  highlightText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
  },

  reflectionInput: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    minHeight: 120,
    fontSize: 14,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
    textAlignVertical: 'top',
  },

  exportRow: {
    flexDirection: 'row',
    gap: 12,
  },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    opacity: 0.6,
  },
  exportBtnTextDisabled: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
});
