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
import { COLORS } from '../../src/constants';
import { useAppContext } from '../../src/context/AppContext';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, tasks } = useAppContext();

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Navy Hero Header */}
        <View style={styles.heroSection}>
          <View style={styles.avatarOuter}>
            <View style={styles.avatarInner}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.avatarBadge}>
              <Feather name="plus" size={12} color={COLORS.white} />
            </View>
          </View>
          <Text style={styles.heroName}>{user.name}</Text>
          <Text style={styles.heroId}>{user.studentId}</Text>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>PRIMARY PROGRAM</Text>
            <View style={styles.partBadge}>
              <Text style={styles.partBadgeText}>PART {user.part}</Text>
            </View>
          </View>
          <Text style={styles.programText}>{user.program}</Text>

          {/* Semester Progress */}
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>SEMESTER PROGRESS</Text>
              <Text style={styles.progressValue}>W{user.currentWeek} OF 14</Text>
            </View>
            <View style={styles.dotsRow}>
              {Array.from({ length: 14 }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.progressDot,
                    i < user.currentWeek ? styles.dotFilled : styles.dotEmpty,
                  ]}
                />
              ))}
            </View>
          </View>

          {/* Status Row */}
          <View style={styles.statusRow}>
            <View>
              <Text style={styles.statusLabel}>ACADEMIC STATUS</Text>
              <Text style={styles.statusGreen}>ACTIVE / GOOD STANDING</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.statusLabel}>FACULTY HUB</Text>
              <Text style={styles.statusValue}>FSKM SHAH ALAM</Text>
            </View>
          </View>
        </View>

        {/* Semester Configuration */}
        <Text style={styles.sectionTitle}>SEMESTER CONFIGURATION</Text>

        <View style={styles.configCard}>
          <Pressable style={styles.configItem} onPress={() => router.push('/stress-map' as any)}>
            <View style={[styles.configIcon, { backgroundColor: '#eff6ff' }]}>
              <Feather name="calendar" size={18} color={COLORS.navy} />
            </View>
            <View style={styles.configContent}>
              <Text style={styles.configLabel}>Academic Calendar</Text>
            </View>
            <View style={styles.configRight}>
              <Text style={styles.configMeta}>WEEK {user.currentWeek}</Text>
              <Feather name="arrow-right" size={16} color={COLORS.textSecondary} />
            </View>
          </Pressable>

          <View style={styles.configDivider} />

          <Pressable style={styles.configItem} onPress={() => router.push('/stress-map' as any)}>
            <View style={[styles.configIcon, { backgroundColor: '#fef2f2' }]}>
              <Feather name="trending-up" size={18} color={COLORS.red} />
            </View>
            <View style={styles.configContent}>
              <Text style={styles.configLabel}>Configure SOW Workload</Text>
            </View>
            <View style={styles.configRight}>
              <Text style={styles.configMeta}>SETUP</Text>
              <Feather name="arrow-right" size={16} color={COLORS.textSecondary} />
            </View>
          </Pressable>

          <View style={styles.configDivider} />

          <Pressable style={styles.configItem}>
            <View style={[styles.configIcon, { backgroundColor: '#f0fdf4' }]}>
              <Feather name="book-open" size={18} color={COLORS.green} />
            </View>
            <View style={styles.configContent}>
              <Text style={styles.configLabel}>Subject Management</Text>
            </View>
            <View style={styles.configRight}>
              <Text style={styles.configMeta}>8 COURSES</Text>
              <Feather name="arrow-right" size={16} color={COLORS.textSecondary} />
            </View>
          </Pressable>
        </View>

        {/* Account Section */}
        <Text style={styles.sectionTitle}>ACCOUNT</Text>

        <View style={styles.configCard}>
          <Pressable style={styles.configItem}>
            <View style={[styles.configIcon, { backgroundColor: '#f5f3ff' }]}>
              <Feather name="settings" size={18} color={COLORS.purple} />
            </View>
            <View style={styles.configContent}>
              <Text style={styles.configLabel}>App Settings</Text>
            </View>
            <Feather name="arrow-right" size={16} color={COLORS.textSecondary} />
          </Pressable>

          <View style={styles.configDivider} />

          <Pressable style={styles.configItem}>
            <View style={[styles.configIcon, { backgroundColor: '#fffbeb' }]}>
              <Feather name="help-circle" size={18} color={COLORS.gold} />
            </View>
            <View style={styles.configContent}>
              <Text style={styles.configLabel}>Help & Support</Text>
            </View>
            <Feather name="arrow-right" size={16} color={COLORS.textSecondary} />
          </Pressable>
        </View>

        {/* Sign Out */}
        <Pressable
          style={styles.signOutBtn}
          onPress={() => router.replace('/(auth)/login' as any)}
        >
          <Feather name="log-out" size={14} color={COLORS.red} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  content: { paddingBottom: 120 },

  // Hero
  heroSection: {
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 40,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  avatarOuter: {
    marginBottom: 16,
    position: 'relative',
  },
  avatarInner: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.navy,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.navy,
  },
  heroName: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: 4,
  },
  heroId: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 3,
  },

  // Info Card
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    marginHorizontal: 20,
    marginTop: -20,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 28,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 2,
  },
  partBadge: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  partBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 1,
  },
  programText: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.navy,
    lineHeight: 24,
    marginBottom: 20,
  },

  // Progress
  progressSection: { marginBottom: 20 },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 2,
  },
  progressValue: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.navy,
    letterSpacing: 1,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  progressDot: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  dotFilled: {
    backgroundColor: COLORS.navy,
  },
  dotEmpty: {
    backgroundColor: COLORS.border,
  },

  // Status Row
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  statusGreen: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.green,
    letterSpacing: 0.5,
  },
  statusValue: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.navy,
  },

  // Section Title
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 2,
    marginBottom: 14,
    marginHorizontal: 20,
  },

  // Config Card
  configCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: 20,
    marginBottom: 28,
    overflow: 'hidden',
  },
  configItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 14,
  },
  configIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  configContent: { flex: 1 },
  configLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.navy,
  },
  configRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  configMeta: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  configDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 18,
  },

  // Sign Out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  signOutText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.red,
  },
});
