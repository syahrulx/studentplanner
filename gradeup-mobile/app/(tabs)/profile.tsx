import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { setHasSeenTutorial } from '@/src/storage';
import { useTheme, useThemeId, useSetTheme } from '@/hooks/useTheme';
import { THEMES, THEME_IDS, type ThemeId } from '@/constants/Themes';
import { THEME_DISPLAY_ICON_KEY } from '@/constants/ThemeIcons';
import { ThemeIcon } from '@/components/ThemeIcon';

function ThemeOptionRow({
  themeId,
  theme,
  isSelected,
  onSelect,
}: {
  themeId: ThemeId;
  theme: typeof THEMES.dark;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.dropdownItem,
        {
          backgroundColor: isSelected ? theme.primary + '18' : theme.card,
          borderLeftColor: theme.primary,
          borderLeftWidth: isSelected ? 4 : 0,
        },
      ]}
      onPress={onSelect}
    >
      <View style={[styles.dropdownItemIcon, { backgroundColor: theme.backgroundSecondary }]}>
        <ThemeIcon name={THEME_DISPLAY_ICON_KEY[themeId]} size={22} color={theme.primary} themeId={themeId} />
      </View>
      <Text style={[styles.dropdownItemLabel, { color: theme.text }]}>{THEMES[themeId].name}</Text>
      {isSelected && <Feather name="check" size={20} color={theme.primary} />}
    </Pressable>
  );
}

export default function Profile() {
  const { user, tasks } = useApp();
  const theme = useTheme();
  const currentThemeId = useThemeId();
  const setTheme = useSetTheme();
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const pending = tasks.filter((t) => !t.isDone);
  const completed = tasks.length - pending.length;
  const rate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  const resetTutorial = async () => {
    await setHasSeenTutorial(false);
    router.replace('/(auth)/onboarding');
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
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

      {/* Theme dropdown */}
      <View style={[styles.sectionHeader, { marginBottom: 12 }]}>
        <ThemeIcon name="settings" size={18} color={theme.primary} />
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Theme</Text>
      </View>
      <Pressable
        style={[styles.dropdownTrigger, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => setThemeDropdownOpen(true)}
      >
        <View style={[styles.dropdownTriggerIcon, { backgroundColor: theme.backgroundSecondary }]}>
          <ThemeIcon name={THEME_DISPLAY_ICON_KEY[currentThemeId]} size={22} color={theme.primary} themeId={currentThemeId} />
        </View>
        <Text style={[styles.dropdownTriggerLabel, { color: theme.text }]}>{THEMES[currentThemeId].name}</Text>
        <Feather name="chevron-down" size={20} color={theme.textSecondary} />
      </Pressable>

      <Modal visible={themeDropdownOpen} transparent animationType="fade">
        <Pressable style={styles.dropdownBackdrop} onPress={() => setThemeDropdownOpen(false)}>
          <View style={[styles.dropdownPanel, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.dropdownHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.dropdownTitle, { color: theme.text }]}>Choose theme</Text>
              <Pressable onPress={() => setThemeDropdownOpen(false)}>
                <Feather name="x" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>
            {THEME_IDS.map((id) => (
              <ThemeOptionRow
                key={id}
                themeId={id}
                theme={THEMES[id]}
                isSelected={currentThemeId === id}
                onSelect={() => {
                  setTheme(id);
                  setThemeDropdownOpen(false);
                }}
              />
            ))}
          </View>
        </Pressable>
      </Modal>

      <View style={[styles.progressCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.progressRow}>
          <ThemeIcon name="star" size={16} color={theme.accent3} />
          <Text style={[styles.progressLabel, { color: theme.text }]}>Scholar Level</Text>
        </View>
        <View style={[styles.barBg, { backgroundColor: theme.backgroundSecondary }]}>
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
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 100 },
  hero: { borderRadius: 28, padding: 28, marginBottom: 20 },
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  dropdownTriggerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  dropdownTriggerLabel: { flex: 1, fontSize: 16, fontWeight: '700' },
  dropdownBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  dropdownPanel: { borderRadius: 24, overflow: 'hidden', maxHeight: 400 },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  dropdownTitle: { fontSize: 18, fontWeight: '800' },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  dropdownItemIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  dropdownItemLabel: { flex: 1, fontSize: 16, fontWeight: '600' },
  progressCard: { borderRadius: 24, padding: 22, marginBottom: 28, borderWidth: 1 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  progressLabel: { fontSize: 13, fontWeight: '800' },
  barBg: { height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 10 },
  barFill: { height: '100%', borderRadius: 5 },
  progressPct: { fontSize: 13, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 14, marginBottom: 28 },
  statCard: { flex: 1, borderRadius: 20, padding: 18, borderWidth: 1 },
  statValue: { fontSize: 22, fontWeight: '800', marginTop: 10 },
  statLabel: { fontSize: 12, marginTop: 4 },
  menuBtn: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 20, marginBottom: 14, borderWidth: 1 },
  pressed: { opacity: 0.96 },
  menuBtnText: { flex: 1, marginLeft: 14, fontSize: 16, fontWeight: '700' },
});
