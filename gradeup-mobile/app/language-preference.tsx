import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTheme, useThemeId } from '@/hooks/useTheme';
import Feather from '@expo/vector-icons/Feather';
import { useTranslations } from '@/src/i18n';
import { isDarkTheme } from '@/constants/Themes';

export default function LanguagePreferenceScreen() {
  const language = 'en';
  const theme = useTheme();
  const themeId = useThemeId();
  const dark = isDarkTheme(themeId);
  const T = useTranslations(language);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
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
        <Text style={[styles.headerTitle, { color: theme.text }]}>{T('languagePreference')}</Text>
      </View>

      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        English is the only supported app language right now.
      </Text>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[
          styles.optionRow,
          language === 'en' && { backgroundColor: dark ? 'rgba(56,189,248,0.12)' : 'rgba(0,51,102,0.04)' },
        ]}>
          <View style={[styles.radioOuter, { borderColor: theme.border }]}>
            {language === 'en' && <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />}
          </View>
          <View style={styles.optionTextWrap}>
            <Text style={[styles.optionTitle, { color: theme.text }]}>{T('english')}</Text>
            <Text style={[styles.optionDesc, { color: theme.textSecondary }]}>{T('defaultLang')}</Text>
          </View>
        </View>
      </View>
      </View>
    </View>
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
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
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
  optionDesc: { fontSize: 12, marginTop: 2 },
});

