import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';

const PAD = 20;

type ThemePreview = {
  id: string;
  name: string;
  accent: string;
  description: string;
  background: string;
  card: string;
};

const THEME_PREVIEWS: ThemePreview[] = [
  {
    id: 'capybara',
    name: 'Capybara Theme',
    accent: '#f59e0b',
    description: 'Warm beige cards, soft brown accents, calm focus vibe.',
    background: '#fef7ea',
    card: '#fff9f0',
  },
  {
    id: 'sakura',
    name: 'Sakura Theme',
    accent: '#ec4899',
    description: 'Pink highlights with clean white layout and gentle contrast.',
    background: '#fff2f8',
    card: '#fff7fb',
  },
  {
    id: 'galaxy',
    name: 'Galaxy Theme',
    accent: '#6366f1',
    description: 'Deep dark surfaces with neon indigo glow and sharp buttons.',
    background: '#151432',
    card: '#1d1b42',
  },
];

export default function InAppThemesScreen() {
  const theme = useTheme();
  const { user } = useApp();
  const isFreePlan = (user.subscriptionPlan ?? 'free') === 'free';
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const selectedTheme = useMemo(
    () => THEME_PREVIEWS.find((x) => x.id === selectedThemeId) ?? null,
    [selectedThemeId],
  );
  const isGalaxy = selectedTheme?.id === 'galaxy';
  const isSakura = selectedTheme?.id === 'sakura';
  const heroLabel = isGalaxy ? 'Cosmic Focus' : 'Capy Focus';
  const heroLabelResolved = isSakura ? 'Sakura Focus' : heroLabel;
  const heroIcon: 'moon' | 'sun' = isGalaxy ? 'moon' : 'sun';
  const heroEmoji = isGalaxy ? '🌌' : isSakura ? '🌸' : '🦫';
  const homeHeadlineColor = isGalaxy ? '#e8e7ff' : isSakura ? '#7a214d' : '#2a2118';
  const homeSublineColor = isGalaxy ? '#b9b7f5' : isSakura ? '#9f4f73' : '#7a6552';
  const homeCardTextColor = isGalaxy ? '#d9d9ff' : isSakura ? '#7a214d' : '#3d2b1f';
  const timetableHeadline = isGalaxy ? 'Timetable Orbit' : isSakura ? 'Timetable Blossom' : 'Timetable';
  const timetableMode = isGalaxy ? 'Week 7 - Galaxy Mode' : isSakura ? 'Week 7 - Sakura Mode' : 'Week 7 - Capybara Mode';
  const slots = isGalaxy
    ? [
        { label: 'Mon 9:00', title: 'Astro Computing', bg: '#26224a' },
        { label: 'Tue 14:00', title: 'Neural Networks Lab', bg: '#1f2d52' },
        { label: 'Thu 10:30', title: 'Quantum Algorithms', bg: '#2f2458' },
      ]
    : isSakura
    ? [
        { label: 'Mon 9:00', title: 'Literature Seminar', bg: '#ffe7f3' },
        { label: 'Tue 14:00', title: 'Design Thinking Lab', bg: '#ffeef7' },
        { label: 'Thu 10:30', title: 'Human Computer Interaction', bg: '#ffe2f0' },
      ]
    : [
        { label: 'Mon 9:00', title: 'Database Systems', bg: '#f7e4cb' },
        { label: 'Tue 14:00', title: 'Software Eng Lab', bg: '#dbead4' },
        { label: 'Thu 10:30', title: 'Data Structures', bg: '#fce7d3' },
      ];
  const renderThemePattern = (forTimetable: boolean) => {
    if (isGalaxy) {
      return (
        <View style={styles.bgPatternWrap}>
          <Text style={[styles.bgStar, styles.bgStarA, { color: forTimetable ? '#c4b5fd' : '#a78bfa' }]}>✦</Text>
          <Text style={[styles.bgStar, styles.bgStarB, { color: '#67e8f9' }]}>✶</Text>
          <Text style={[styles.bgStar, styles.bgStarC, { color: '#ddd6fe' }]}>✧</Text>
          <View style={[styles.bgNebula, styles.bgNebulaTop, { backgroundColor: '#7c3aed33' }]} />
          <View style={[styles.bgNebula, styles.bgNebulaBottom, { backgroundColor: '#06b6d433' }]} />
        </View>
      );
    }
    if (isSakura) {
      return (
        <View style={styles.bgPatternWrap}>
          <View style={[styles.bgRibbonBand, styles.bgRibbonBandA, { backgroundColor: '#f9a8d455' }]} />
          <View style={[styles.bgRibbonBand, styles.bgRibbonBandB, { backgroundColor: '#fb718555' }]} />
          <View style={[styles.bgRibbonBand, styles.bgRibbonBandC, { backgroundColor: '#f472b655' }]} />
          <Text style={[styles.bgPetal, styles.bgPetalA]}>❀</Text>
          <Text style={[styles.bgPetal, styles.bgPetalB]}>✿</Text>
        </View>
      );
    }
    return (
      <View style={styles.bgPatternWrap}>
        <View style={[styles.bgBubble, styles.bgBubbleA, { backgroundColor: '#f59e0b33' }]} />
        <View style={[styles.bgBubble, styles.bgBubbleB, { backgroundColor: '#84cc1633' }]} />
        <View style={[styles.bgBubble, styles.bgBubbleC, { backgroundColor: '#fb923c33' }]} />
        <Text style={[styles.bgPetal, styles.bgPetalA]}>🦫</Text>
        <Text style={[styles.bgPetal, styles.bgPetalB]}>🌿</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.75 }]}
        >
          <Feather name="chevron-left" size={28} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.text }]}>In App Themes</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {isFreePlan
            ? 'Preview only for now. All custom theme packs are locked on free plan.'
            : 'Preview available. Design packs are unlocked for your plan.'}
        </Text>

        <View style={[styles.lockBanner, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name={isFreePlan ? 'lock' : 'unlock'} size={16} color={theme.textSecondary} />
          <Text style={[styles.lockBannerText, { color: theme.textSecondary }]}>
            {isFreePlan ? 'Free user mode: theme designs are locked' : 'Pro/Plus mode: theme previews are visible'}
          </Text>
        </View>

        {THEME_PREVIEWS.map((item) => (
          <View key={item.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.imageContent, { backgroundColor: `${item.accent}88` }]}>
              {item.id === 'capybara' ? (
                <View style={styles.cardPatternWrap}>
                  <View style={[styles.cardBubble, styles.cardBubbleA]} />
                  <View style={[styles.cardBubble, styles.cardBubbleB]} />
                  <View style={[styles.cardBubble, styles.cardBubbleC]} />
                  <Text style={[styles.cardPatternGlyph, styles.cardPatternGlyphA]}>🦫</Text>
                </View>
              ) : item.id === 'sakura' ? (
                <View style={styles.cardPatternWrap}>
                  <View style={[styles.cardRibbon, styles.cardRibbonA]} />
                  <View style={[styles.cardRibbon, styles.cardRibbonB]} />
                  <Text style={[styles.cardPatternGlyph, styles.cardPatternGlyphA]}>❀</Text>
                </View>
              ) : (
                <View style={styles.cardPatternWrap}>
                  <Text style={[styles.cardPatternGlyph, styles.cardPatternGlyphA]}>✦</Text>
                  <Text style={[styles.cardPatternGlyph, styles.cardPatternGlyphB]}>✶</Text>
                  <View style={[styles.cardNebula, styles.cardNebulaA]} />
                  <View style={[styles.cardNebula, styles.cardNebulaB]} />
                </View>
              )}
              <Text style={styles.previewTitle}>{item.name}</Text>
              <Text style={styles.previewTag}>Preview</Text>
            </View>

            <View style={styles.cardBody}>
              <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>{item.description}</Text>
              <Pressable
                onPress={() => setSelectedThemeId(item.id)}
                style={[styles.lockedButton, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
              >
                <Feather name="eye" size={14} color={theme.textSecondary} />
                <Text style={[styles.lockedButtonText, { color: theme.textSecondary }]}>
                  Preview Home & Timetable
                </Text>
              </Pressable>
              {isFreePlan ? (
                <Text style={[styles.lockedNote, { color: theme.textSecondary }]}>Theme apply is locked for free users</Text>
              ) : (
                <Text style={[styles.lockedNote, { color: theme.textSecondary }]}>You can preview this theme design style</Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal
        visible={!!selectedTheme}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedThemeId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {selectedTheme?.name ?? 'Theme Preview'}
              </Text>
              <Pressable onPress={() => setSelectedThemeId(null)} style={styles.modalCloseBtn}>
                <Feather name="x" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Preview images: Home and Timetable
            </Text>

            <View style={styles.previewGrid}>
              <View
                style={[
                  styles.screenCard,
                  {
                    borderColor: theme.border,
                    backgroundColor: selectedTheme?.background ?? '#eef2ff',
                  },
                ]}
              >
                {renderThemePattern(false)}
                <View style={styles.previewTopRow}>
                  <View style={[styles.previewPill, { backgroundColor: `${selectedTheme?.accent ?? '#6366f1'}22` }]}>
                    <Feather name={heroIcon} size={12} color={selectedTheme?.accent ?? '#6366f1'} />
                    <Text style={[styles.previewPillText, { color: selectedTheme?.accent ?? '#6366f1' }]}>{heroLabelResolved}</Text>
                  </View>
                  <Text style={styles.capyEmoji}>{heroEmoji}</Text>
                </View>

                <Text style={[styles.previewHeadline, { color: homeHeadlineColor }]}>Good evening, Izwan</Text>
                <Text style={[styles.previewSubline, { color: homeSublineColor }]}>
                  {isGalaxy ? '2 missions + 1 revision orbit today' : isSakura ? '2 classes + 1 gentle review today' : '2 tasks + 1 revision due today'}
                </Text>

                <View style={[styles.mockCard, { backgroundColor: selectedTheme?.card ?? '#fff' }]}>
                  <View style={styles.mockRow}>
                    <View style={[styles.mockIcon, { backgroundColor: isGalaxy ? '#3b2d69' : isSakura ? '#ffd5e8' : '#f2d7b3' }]}>
                      <Feather name="book-open" size={12} color={isGalaxy ? '#c8b8ff' : isSakura ? '#b93473' : '#8a5b2d'} />
                    </View>
                    <Text style={[styles.mockText, { color: homeCardTextColor }]}>
                      {isGalaxy ? 'Review Physics Nebula Chapter' : isSakura ? 'Review Communication Notes' : 'Review Biology Chapter 4'}
                    </Text>
                  </View>
                  <View style={styles.mockRow}>
                    <View style={[styles.mockIcon, { backgroundColor: isGalaxy ? '#1d4a66' : isSakura ? '#ffe7f1' : '#d9e9cf' }]}>
                      <Feather name="clock" size={12} color={isGalaxy ? '#91d5ff' : isSakura ? '#b93473' : '#4f7d3d'} />
                    </View>
                    <Text style={[styles.mockText, { color: homeCardTextColor }]}>Focus timer: 25 min</Text>
                  </View>
                </View>

                <View style={styles.screenLabelRow}>
                  <Feather name="home" size={12} color="#fff" />
                  <Text style={styles.screenLabel}>Home Preview</Text>
                </View>
              </View>

              <View
                style={[
                  styles.screenCard,
                  {
                    borderColor: theme.border,
                    backgroundColor: selectedTheme?.background ?? '#eef2ff',
                  },
                ]}
              >
                {renderThemePattern(true)}
                <Text style={[styles.previewHeadline, { color: homeHeadlineColor }]}>{timetableHeadline}</Text>
                <View style={[styles.timetableHeader, { backgroundColor: `${selectedTheme?.accent ?? '#6366f1'}22` }]}>
                  <Text style={[styles.timetableHeaderText, { color: selectedTheme?.accent ?? '#6366f1' }]}>{timetableMode}</Text>
                </View>

                {slots.map((slot) => (
                  <View key={slot.label} style={[styles.slotCard, { backgroundColor: slot.bg }]}>
                    <Text style={[styles.slotLabel, isGalaxy && { color: '#a9a0e8' }, isSakura && { color: '#a94473' }]}>{slot.label}</Text>
                    <Text style={[styles.slotTitle, isGalaxy && { color: '#ebe9ff' }, isSakura && { color: '#7a214d' }]}>{slot.title}</Text>
                  </View>
                ))}

                <View style={styles.screenLabelRow}>
                  <Feather name="calendar" size={12} color="#fff" />
                  <Text style={styles.screenLabel}>Timetable Preview</Text>
                </View>
              </View>
            </View>

            <Text style={[styles.modalNote, { color: theme.textSecondary }]}>
              {isFreePlan
                ? 'Preview only. Applying this theme is currently locked on free plan.'
                : 'Design preview mode enabled. Full implementation can include custom icons and backgrounds.'}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginTop: 48,
    marginBottom: 4,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backText: { fontSize: 17, fontWeight: '500', marginLeft: -4 },
  content: {
    paddingHorizontal: PAD,
    paddingBottom: 36,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  lockBanner: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lockBannerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  imageContent: {
    minHeight: 110,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'flex-end',
    position: 'relative',
    overflow: 'hidden',
  },
  cardPatternWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  cardBubble: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  cardBubbleA: { width: 56, height: 56, top: -10, left: -8 },
  cardBubbleB: { width: 42, height: 42, top: 22, right: 16 },
  cardBubbleC: { width: 64, height: 64, bottom: -22, left: 46 },
  cardRibbon: {
    position: 'absolute',
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  cardRibbonA: {
    width: 150,
    top: 14,
    left: -24,
    transform: [{ rotate: '-10deg' }],
  },
  cardRibbonB: {
    width: 160,
    bottom: 14,
    right: -28,
    transform: [{ rotate: '9deg' }],
  },
  cardNebula: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  cardNebulaA: { width: 90, height: 70, top: -16, left: -12 },
  cardNebulaB: { width: 96, height: 72, bottom: -20, right: -18 },
  cardPatternGlyph: {
    position: 'absolute',
    color: '#fff',
    opacity: 0.8,
    fontSize: 14,
    fontWeight: '700',
  },
  cardPatternGlyphA: { top: 10, right: 12 },
  cardPatternGlyphB: { top: 34, left: 10 },
  previewTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  previewTag: {
    marginTop: 6,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(15,23,42,0.35)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  cardBody: {
    padding: 12,
    gap: 10,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  lockedButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  lockedButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  lockedNote: {
    fontSize: 12,
    fontWeight: '500',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
  },
  previewGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  screenCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    padding: 8,
    minHeight: 220,
  },
  bgPatternWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  bgBubble: {
    position: 'absolute',
    borderRadius: 999,
  },
  bgBubbleA: {
    width: 92,
    height: 92,
    top: -20,
    left: -18,
  },
  bgBubbleB: {
    width: 70,
    height: 70,
    top: 36,
    right: -12,
  },
  bgBubbleC: {
    width: 105,
    height: 105,
    bottom: -30,
    left: 34,
  },
  bgRibbonBand: {
    position: 'absolute',
    borderRadius: 14,
  },
  bgRibbonBandA: {
    width: 172,
    height: 18,
    top: 14,
    left: -36,
    transform: [{ rotate: '-14deg' }],
  },
  bgRibbonBandB: {
    width: 150,
    height: 16,
    top: 66,
    right: -34,
    transform: [{ rotate: '16deg' }],
  },
  bgRibbonBandC: {
    width: 180,
    height: 16,
    bottom: 10,
    left: -24,
    transform: [{ rotate: '-10deg' }],
  },
  bgPetal: {
    position: 'absolute',
    fontSize: 13,
    opacity: 0.62,
  },
  bgPetalA: {
    top: 10,
    right: 12,
  },
  bgPetalB: {
    top: 44,
    left: 12,
  },
  bgStar: {
    position: 'absolute',
    fontSize: 13,
    opacity: 0.72,
  },
  bgStarA: {
    top: 12,
    right: 12,
  },
  bgStarB: {
    top: 48,
    left: 14,
  },
  bgStarC: {
    top: 90,
    right: 24,
  },
  bgNebula: {
    position: 'absolute',
    borderRadius: 999,
  },
  bgNebulaTop: {
    width: 120,
    height: 90,
    top: -24,
    left: -14,
  },
  bgNebulaBottom: {
    width: 130,
    height: 100,
    bottom: -30,
    right: -20,
  },
  previewTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  previewPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  capyEmoji: {
    fontSize: 16,
  },
  previewHeadline: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '800',
  },
  previewSubline: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '500',
  },
  mockCard: {
    marginTop: 8,
    borderRadius: 10,
    padding: 8,
    gap: 6,
  },
  mockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mockIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mockText: {
    fontSize: 10.5,
    color: '#3d2b1f',
    fontWeight: '600',
  },
  timetableHeader: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 8,
    marginBottom: 6,
  },
  timetableHeaderText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  slotCard: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginBottom: 5,
  },
  slotLabel: {
    fontSize: 9.5,
    color: '#6b4c33',
    fontWeight: '700',
  },
  slotTitle: {
    marginTop: 2,
    fontSize: 10.5,
    color: '#2f241a',
    fontWeight: '700',
  },
  screenLabelRow: {
    position: 'absolute',
    left: 8,
    top: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15,23,42,0.35)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  screenLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  modalNote: {
    fontSize: 12,
    lineHeight: 17,
  },
});
