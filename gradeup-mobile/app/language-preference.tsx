import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme, useThemeId } from '@/hooks/useTheme';
import Feather from '@expo/vector-icons/Feather';
import { useTranslations } from '@/src/i18n';
import { isDarkTheme } from '@/constants/Themes';

export default function LanguagePreferenceScreen() {
  const { language, setLanguage, loghat, setLoghat } = useApp();
  const theme = useTheme();
  const themeId = useThemeId();
  const dark = isDarkTheme(themeId);
  const T = useTranslations(language);

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
        <Text style={[styles.headerTitle, { color: theme.text }]}>{T('languagePreference')}</Text>
      </View>

      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        {T('languageDesc')}
      </Text>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Pressable
          style={({ pressed }) => [
            styles.optionRow,
            language === 'en' && { backgroundColor: dark ? 'rgba(56,189,248,0.12)' : 'rgba(0,51,102,0.04)' },
            pressed && styles.pressed,
          ]}
          onPress={() => setLanguage('en')}
        >
          <View style={[styles.radioOuter, { borderColor: theme.border }]}>
            {language === 'en' && <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />}
          </View>
          <View style={styles.optionTextWrap}>
            <Text style={[styles.optionTitle, { color: theme.text }]}>{T('english')}</Text>
            <Text style={[styles.optionDesc, { color: theme.textSecondary }]}>{T('defaultLang')}</Text>
          </View>
        </Pressable>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <Pressable
          style={({ pressed }) => [
            styles.optionRow,
            language === 'ms' && { backgroundColor: dark ? 'rgba(56,189,248,0.12)' : 'rgba(0,51,102,0.04)' },
            pressed && styles.pressed,
          ]}
          onPress={() => setLanguage('ms')}
        >
          <View style={[styles.radioOuter, { borderColor: theme.border }]}>
            {language === 'ms' && <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />}
          </View>
          <View style={styles.optionTextWrap}>
            <Text style={[styles.optionTitle, { color: theme.text }]}>{T('bahasaMelayu')}</Text>
            <Text style={[styles.optionDesc, { color: theme.textSecondary }]}>{T('malayInterface')}</Text>
          </View>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, opacity: language === 'ms' ? 1 : 0.5 }]}>
        <View style={styles.languageHeader}>
          <Text style={[styles.languageHeaderText, { color: theme.text }]}>{T('loghatDialect')}</Text>
          {language !== 'ms' && (
            <Text style={[styles.languageHeaderHint, { color: theme.textSecondary }]}>{T('switchToMalay')}</Text>
          )}
        </View>

        {[
          { key: 'negeriSembilan' as const, label: 'Negeri Sembilan' },
          { key: 'kelantan' as const, label: 'Kelantan' },
          { key: 'kedah' as const, label: 'Kedah' },
          { key: 'melaka' as const, label: 'Melaka' },
        ].map((opt, index) => (
          <React.Fragment key={opt.key}>
            {index > 0 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
            <Pressable
              style={({ pressed }) => [
                styles.optionRow,
                loghat === opt.key && { backgroundColor: dark ? 'rgba(56,189,248,0.12)' : 'rgba(0,51,102,0.04)' },
                pressed && language === 'ms' && styles.pressed,
              ]}
              onPress={() => {
                if (language !== 'ms') return;
                setLoghat(opt.key);
              }}
            >
              <View style={[styles.radioOuter, { borderColor: theme.border }]}>
                {loghat === opt.key && <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />}
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={[styles.optionTitle, { color: theme.text }]}>{opt.label}</Text>
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
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  languageHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  languageHeaderText: { fontSize: 13, fontWeight: '800' },
  languageHeaderHint: { fontSize: 11 },
});

