import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import Feather from '@expo/vector-icons/Feather';
import { useTranslations } from '@/src/i18n';
import type { WeekStartsOn } from '@/src/storage';

export default function WeekStartPreferenceScreen() {
  const { language, weekStartsOn, setWeekStartsOn } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);

  const options: { mode: WeekStartsOn; title: string }[] = [
    { mode: 'monday', title: T('weekStartsMonday') },
    { mode: 'sunday', title: T('weekStartsSunday') },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backBtn,
            { borderColor: theme.border, backgroundColor: theme.card },
            pressed && styles.pressed,
          ]}
        >
          <Feather name="chevron-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{T('weekStartPref')}</Text>
      </View>

      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{T('weekStartPrefDesc')}</Text>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {options.map((opt, index) => (
          <React.Fragment key={opt.mode}>
            {index > 0 && <View style={styles.divider} />}
            <Pressable
              style={({ pressed }) => [
                styles.optionRow,
                weekStartsOn === opt.mode && styles.optionRowActive,
                pressed && styles.pressed,
              ]}
              onPress={() => setWeekStartsOn(opt.mode)}
            >
              <View style={styles.radioOuter}>
                {weekStartsOn === opt.mode && (
                  <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />
                )}
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={[styles.optionTitle, { color: theme.text }]}>{opt.title}</Text>
              </View>
            </Pressable>
          </React.Fragment>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 32 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
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
  subtitle: { fontSize: 13, lineHeight: 20, marginBottom: 20 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 4,
    marginBottom: 24,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionRowActive: {
    backgroundColor: 'rgba(0,51,102,0.04)',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#cbd5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  optionTextWrap: { flex: 1 },
  optionTitle: { fontSize: 15, fontWeight: '800' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e2e8f0', marginHorizontal: 16 },
});
