import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';

import { FlashcardFace } from '@/components/FlashcardFace';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import { readableTextOn } from '@/constants/Themes';
import {
  FLASHCARD_STYLES,
  FLASHCARD_STYLE_ORDER,
  canUseFlashcardStyle,
  type FlashcardStyleId,
} from '@/src/lib/flashcardStyles';

/**
 * Pick the look of the review card.
 *
 * Every style is shown to everyone, including the ones this plan cannot use.
 * Hiding them would make the upgrade invisible, and a locked card a student can
 * see is a better argument for Pro than a list they never knew existed.
 */
export default function FlashcardStylesScreen() {
  const theme = useTheme();
  const T = useTranslations(useApp().language);
  const { flashcardStyle, setFlashcardStyle, user } = useApp();
  const plan = user?.subscriptionPlan;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          accessibilityLabel={T('back')}
        >
          <Feather name="arrow-left" size={21} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>{T('flashcardStyleTitle')}</Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>{T('flashcardStyleDesc')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {FLASHCARD_STYLE_ORDER.map((id) => {
          const s = FLASHCARD_STYLES[id];
          const allowed = canUseFlashcardStyle(id, plan);
          const selected = flashcardStyle === id;
          // Classic is drawn in the student's own theme, so the preview has to
          // be too, or it would advertise a card they will never see.
          const face =
            id === 'classic'
              ? { background: [theme.primary], text: readableTextOn(theme.primary), hint: theme.textSecondary, radius: 28 }
              : s.front;

          return (
            <Pressable
              key={id}
              onPress={() => (allowed ? setFlashcardStyle(id) : router.push('/subscription-plans' as any))}
              style={[
                styles.row,
                { borderColor: selected ? theme.primary : theme.border, backgroundColor: theme.card },
              ]}
            >
              <View style={styles.previewWrap}>
                <FlashcardFace face={face} height={92}>
                  <Text style={{ color: face.text, fontWeight: '700', fontSize: 13 }}>Aa</Text>
                </FlashcardFace>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: theme.text }]}>{s.name}</Text>
                <Text style={[styles.tier, { color: theme.textSecondary }]}>
                  {s.tier === 'free' ? 'Free' : s.tier === 'plus' ? 'Plus · Pro' : 'Pro'}
                </Text>
              </View>

              {selected ? (
                <Feather name="check" size={20} color={theme.primary} />
              ) : allowed ? null : (
                <Feather name="lock" size={17} color={theme.textSecondary} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 56 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, marginBottom: 18 },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  sub: { fontSize: 13, marginTop: 2 },
  list: { paddingHorizontal: 18, paddingBottom: 40, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 18,
    borderWidth: 2,
  },
  previewWrap: { width: 110 },
  name: { fontSize: 16, fontWeight: '700' },
  tier: { fontSize: 12, fontWeight: '600', marginTop: 2 },
});
