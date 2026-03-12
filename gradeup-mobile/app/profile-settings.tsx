import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { setHasSeenTutorial } from '@/src/storage';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import Feather from '@expo/vector-icons/Feather';
import type { ThemeIconKey } from '@/constants/ThemeIcons';
import { useTranslations } from '@/src/i18n';

const PAD = 20;
const SECTION = 24;
const RADIUS = 20;
const RADIUS_SM = 14;
const TOTAL_WEEKS = 14;

export default function ProfileSettings() {
  const { user, language } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const initials = user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const resetTutorial = async () => {
    await setHasSeenTutorial(false);
    router.replace('/(auth)/onboarding');
  };

  const menuItems: { icon: ThemeIconKey; label: string; onPress: () => void }[] = [
    { icon: 'settings', label: T('subjectColours'), onPress: () => router.push('/subject-colors' as any) },
    { icon: 'settings', label: T('languagePref'), onPress: () => router.push('/language-preference' as any) },
    { icon: 'stressMap', label: T('stressMap'), onPress: () => router.push('/stress-map' as any) },
    { icon: 'weeklySummary', label: T('weeklySummary'), onPress: () => router.push('/weekly-summary' as any) },
    { icon: 'leaderboard', label: T('leaderboard'), onPress: () => router.push('/leaderboard' as any) },
    { icon: 'helpCircle', label: T('resetTutorial'), onPress: resetTutorial },
  ];

  const menuIconColor = [theme.accent2, theme.primary, theme.secondary, theme.accent3, theme.textSecondary];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: '#f1f5f9' }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header with back */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]}
        >
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{T('profile')}</Text>
      </View>

      {/* Dark blue hero with avatar, name, ID */}
      <View style={[styles.heroWrap, { backgroundColor: theme.primary }]}>
        <Image
          source={require('../assets/images/wave-texture.png')}
          style={[StyleSheet.absoluteFillObject, styles.heroTexture]}
          resizeMode="cover"
        />
        <View style={[StyleSheet.absoluteFillObject, styles.heroOverlay]} />
        <View style={styles.heroContent}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Pressable style={styles.editAvatarBtn}>
              <Feather name="plus" size={18} color="#0f172a" />
            </Pressable>
          </View>
          <Text style={styles.heroName}>{user.name}</Text>
          <Text style={styles.heroId}>{user.studentId}</Text>
        </View>
      </View>

      {/* White card 1: Primary Program, Semester Progress, Academic Status */}
      <View style={[styles.card, styles.cardWhite]}>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{T('primaryProgram')}</Text>
          <View style={[styles.pill, { backgroundColor: theme.primary }]}>
            <Text style={styles.pillText}>{T('part')} {user.part}</Text>
          </View>
        </View>
        <Text style={styles.cardValue}>{user.program}</Text>

        <Text style={[styles.cardLabel, { marginTop: 20 }]}>{T('semesterProgress')}</Text>
        <View style={styles.progressRow}>
          <View style={styles.segmentBar}>
            {Array.from({ length: TOTAL_WEEKS }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.segment,
                  i < user.currentWeek ? [styles.segmentFilled, { backgroundColor: theme.primary }] : styles.segmentEmpty,
                ]}
              />
            ))}
          </View>
          <Text style={styles.weekLabel}>W{user.currentWeek} OF {TOTAL_WEEKS}</Text>
        </View>

        <View style={styles.academicStatusBlock}>
          <View style={styles.academicStatusLeft}>
            <Text style={styles.cardLabel}>{T('academicStatus')}</Text>
            <Text style={styles.statusActive}>{T('activeGoodStanding')}</Text>
          </View>
          <View style={styles.academicStatusRight}>
            <Text style={styles.cardLabel}>{T('facultyHub')}</Text>
            <Text style={styles.facultyValue}>FSKM SHAH ALAM</Text>
          </View>
        </View>
      </View>

      {/* White card 2: Semester Configuration */}
      <View style={styles.section}>
        <Text style={styles.cardLabel}>{T('semesterConfig')}</Text>
        <View style={[styles.configCard, styles.cardWhite]}>
          <Pressable
            style={({ pressed }) => [styles.configRow, pressed && styles.pressed]}
            onPress={() => router.push('/stress-map' as any)}
          >
            <ThemeIcon name="calendar" size={20} color={theme.primary} />
            <Text style={styles.configLabel}>{T('academicCalendar')}</Text>
            <Text style={styles.configMeta}>{T('week')} {user.currentWeek}</Text>
            <Feather name="chevron-right" size={18} color="#94a3b8" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.configRow, styles.configRowBorder, pressed && styles.pressed]}
            onPress={() => router.push('/upload-sow' as any)}
          >
            <Feather name="trending-up" size={20} color="#f59e0b" />
            <Text style={styles.configLabel}>{T('configWorkload')}</Text>
            <Text style={styles.configMeta}>{T('setup')}</Text>
            <Feather name="chevron-right" size={18} color="#94a3b8" />
          </Pressable>
        </View>
      </View>

      {/* Settings menu */}
      <View style={styles.menuSection}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{T('settingsTools')}</Text>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', flex: 1 },
  pressed: { opacity: 0.96 },
  heroWrap: {
    borderRadius: RADIUS,
    marginBottom: SECTION,
    overflow: 'hidden',
    paddingVertical: 32,
    paddingHorizontal: 24,
    minHeight: 200,
    position: 'relative',
  },
  heroTexture: {
    opacity: 0.35,
    borderRadius: RADIUS,
  },
  heroOverlay: {
    backgroundColor: 'rgba(0, 51, 102, 0.35)',
    borderRadius: RADIUS,
  },
  heroContent: {
    position: 'relative',
    zIndex: 1,
    alignItems: 'center',
  },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  editAvatarBtn: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#003366',
  },
  heroName: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 4, letterSpacing: -0.3 },
  heroId: { fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  card: {
    borderRadius: RADIUS_SM,
    padding: 20,
    marginBottom: SECTION,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardWhite: { backgroundColor: '#ffffff' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardLabel: { fontSize: 9, fontWeight: '800', color: '#64748b', letterSpacing: 1.2 },
  cardValue: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  pillText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  segmentBar: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    marginRight: 12,
  },
  segment: {
    flex: 1,
    height: 8,
    borderRadius: 4,
  },
  segmentFilled: {},
  segmentEmpty: { backgroundColor: '#e2e8f0' },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  weekLabel: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  academicStatusBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 20,
    gap: 16,
  },
  academicStatusLeft: { flex: 1, minWidth: 0 },
  academicStatusRight: { alignItems: 'flex-end' },
  statusActive: { fontSize: 14, fontWeight: '800', color: '#059669', marginTop: 4 },
  facultyValue: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginTop: 4, textAlign: 'right' },
  section: { marginBottom: SECTION },
  configCard: { marginTop: 10 },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  configRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0' },
  configLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0f172a', marginLeft: 12 },
  configMeta: { fontSize: 13, fontWeight: '600', color: '#64748b', marginRight: 8 },
  menuSection: { marginBottom: SECTION },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12 },
  menuCard: { borderRadius: RADIUS_SM, borderWidth: 1, overflow: 'hidden' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuLabel: { flex: 1, fontSize: 16, fontWeight: '700' },
});
