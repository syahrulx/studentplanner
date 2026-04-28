import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme, useThemePack } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { CatLottie } from '@/components/CatLottie';

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
    id: 'cat',
    name: 'Cat Theme',
    accent: '#f59e0b',
    description: 'Warm cream cards, playful cat accents, cozy study vibe.',
    background: '#fef7ea',
    card: '#fff9f0',
  },
  {
    id: 'sakura',
    name: 'Mono Theme',
    accent: '#000000',
    description: 'Pitch-black minimalist pack with clean monochrome icons and strong contrast.',
    background: '#000000',
    card: '#0a0a0a',
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
  const themePack = useThemePack();
  const { user, setThemePack } = useApp();
  const isCatApplied = themePack === 'cat';
  const isMonoApplied = themePack === 'mono';
  const isFreePlan = (user.subscriptionPlan ?? 'free') === 'free';
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const selectedTheme = useMemo(
    () => THEME_PREVIEWS.find((x) => x.id === selectedThemeId) ?? null,
    [selectedThemeId],
  );
  const isGalaxy = selectedTheme?.id === 'galaxy';
  const isSakura = selectedTheme?.id === 'sakura';
  const isCat = selectedTheme?.id === 'cat';
  const heroLabel = isGalaxy ? 'Cosmic Focus' : isSakura ? 'Mono Focus' : 'Cat Focus';
  const heroLabelResolved = heroLabel;
  const heroIcon: 'moon' | 'sun' = isGalaxy ? 'moon' : 'sun';
  const heroEmoji = isGalaxy ? '🌌' : isSakura ? '◻' : '🐾';
  const homeHeadlineColor = isGalaxy ? '#e8e7ff' : isSakura ? '#ffffff' : '#2a2118';
  const homeSublineColor = isGalaxy ? '#b9b7f5' : isSakura ? '#b3b3b3' : '#7a6552';
  const homeCardTextColor = isGalaxy ? '#d9d9ff' : isSakura ? '#e5e5e5' : '#3d2b1f';
  const timetableHeadline = isGalaxy ? 'Timetable Orbit' : isSakura ? 'Timetable Minimal' : 'Timetable';
  const timetableMode = isGalaxy ? 'Week 7 - Galaxy Mode' : isSakura ? 'Week 7 - Mono Mode' : 'Week 7 - Cat Mode';
  const slots = isGalaxy
    ? [
        { label: 'Mon 9:00', title: 'Astro Computing', bg: '#26224a' },
        { label: 'Tue 14:00', title: 'Neural Networks Lab', bg: '#1f2d52' },
        { label: 'Thu 10:30', title: 'Quantum Algorithms', bg: '#2f2458' },
      ]
    : isSakura
    ? [
        { label: 'Mon 9:00', title: 'Systems Design', bg: '#0f0f0f' },
        { label: 'Tue 14:00', title: 'Research Methods', bg: '#141414' },
        { label: 'Thu 10:30', title: 'Software Architecture', bg: '#1a1a1a' },
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
          <View style={[styles.bgRibbonBand, styles.bgRibbonBandA, { backgroundColor: '#ffffff18' }]} />
          <View style={[styles.bgRibbonBand, styles.bgRibbonBandB, { backgroundColor: '#ffffff10' }]} />
          <View style={[styles.bgRibbonBand, styles.bgRibbonBandC, { backgroundColor: '#ffffff14' }]} />
          <Text style={[styles.bgPetal, styles.bgPetalA, { color: '#ffffff' }]}>◻</Text>
          <Text style={[styles.bgPetal, styles.bgPetalB, { color: '#d4d4d4' }]}>○</Text>
        </View>
      );
    }
    return (
      <View style={styles.bgPatternWrap}>
        <View style={[styles.bgBubble, styles.bgBubbleA, { backgroundColor: '#f59e0b40' }]} />
        <View style={[styles.bgBubble, styles.bgBubbleB, { backgroundColor: '#fbbf2460' }]} />
        <View style={[styles.bgBubble, styles.bgBubbleC, { backgroundColor: '#fb923c45' }]} />
        <Text style={[styles.bgPetal, styles.bgPetalA]}>🐾</Text>
        <Text style={[styles.bgPetal, styles.bgPetalB]}>🐾</Text>
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
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.text }]}>In App Themes</Text>
          <Pressable
            onPress={() => setThemePack('none')}
            style={[styles.topResetBtn, { borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
          >
            <Text style={[styles.topResetBtnText, { color: theme.text }]}>Reset to Default</Text>
          </Pressable>
        </View>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {isFreePlan
            ? 'Preview only for now. All custom theme packs are locked on free plan.'
            : 'Preview available. Design packs are unlocked for your plan.'}
        </Text>

        <View style={[styles.lockBanner, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name={isFreePlan ? 'lock' : 'unlock'} size={16} color={theme.textSecondary} />
          <Text style={[styles.lockBannerText, { color: theme.textSecondary }]}>
            {isCatApplied
              ? 'Cat theme is active now'
              : isMonoApplied
              ? 'Mono theme is active now'
              : isFreePlan
              ? 'Free user mode: theme designs are locked'
              : 'Pro/Plus mode: theme previews are visible'}
          </Text>
        </View>

        {THEME_PREVIEWS.map((item) => (
          <View key={item.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.imageContent, { backgroundColor: `${item.accent}88` }]}>
              {item.id === 'cat' ? (
                <View style={styles.cardPatternWrap}>
                  <View style={[styles.cardBubble, styles.cardBubbleA]} />
                  <View style={[styles.cardBubble, styles.cardBubbleB]} />
                  <View style={[styles.cardBubble, styles.cardBubbleC]} />
                  <Text style={[styles.cardPatternGlyph, styles.cardPatternGlyphA]}>🐾</Text>
                </View>
              ) : item.id === 'sakura' ? (
                <View style={styles.cardPatternWrap}>
                  <View style={[styles.cardRibbon, styles.cardRibbonA]} />
                  <View style={[styles.cardRibbon, styles.cardRibbonB]} />
                  <Text style={[styles.cardPatternGlyph, styles.cardPatternGlyphA]}>◻</Text>
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
              {item.id === 'cat' ? (
                <View style={styles.applyTitleRow}>
                  <Text style={[styles.applyTitle, { color: theme.text }]}>Cat Theme Controls</Text>
                  {isCatApplied ? (
                    <View style={[styles.activeBadge, { backgroundColor: `${theme.primary}22` }]}>
                      <Text style={[styles.activeBadgeText, { color: theme.primary }]}>Active</Text>
                    </View>
                  ) : null}
                </View>
              ) : item.id === 'sakura' ? (
                <View style={styles.applyTitleRow}>
                  <Text style={[styles.applyTitle, { color: theme.text }]}>Mono Theme Controls</Text>
                  {isMonoApplied ? (
                    <View style={[styles.activeBadge, { backgroundColor: `${theme.primary}22` }]}>
                      <Text style={[styles.activeBadgeText, { color: theme.primary }]}>Active</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>{item.description}</Text>
              {item.id === 'cat' ? (
                <Text style={[styles.catFeatureNote, { color: theme.textSecondary }]}>
                  Includes simple animated cat accents and playful Cat-theme visuals across selected screens.
                </Text>
              ) : null}
              {item.id === 'cat' ? (
                <View style={styles.applyActionRow}>
                  <Pressable
                    onPress={() => setThemePack('cat')}
                    style={[styles.applyBtn, { backgroundColor: '#8d5a3b' }]}
                  >
                    <Text style={styles.applyBtnText}>Apply Cat Theme</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedThemeId('cat')}
                    style={[styles.resetBtn, { borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
                  >
                    <Text style={[styles.resetBtnText, { color: theme.text }]}>Preview Animated Cat</Text>
                  </Pressable>
                </View>
              ) : null}
              {item.id === 'sakura' ? (
                <View style={styles.applyActionRow}>
                  <Pressable
                    onPress={() => setThemePack('mono')}
                    style={[styles.applyBtn, { backgroundColor: '#000000', borderWidth: 1, borderColor: '#2a2a2a' }]}
                  >
                    <Text style={styles.applyBtnText}>Apply Mono Theme</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedThemeId('sakura')}
                    style={[styles.resetBtn, { borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
                  >
                    <Text style={[styles.resetBtnText, { color: theme.text }]}>Preview Mono Theme</Text>
                  </Pressable>
                </View>
              ) : null}
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
                {isCat ? (
                  <>
                    {renderThemePattern(false)}
                    <View style={styles.previewHomeHeader}>
                      <Text style={styles.previewHomeHello}>Hello, Izwan.</Text>
                    </View>
                    <View style={styles.previewPulseBox}>
                      <View style={styles.previewPulseTopRow}>
                        <Text style={styles.previewPulseWeek}>WEEK 5</Text>
                        <View style={styles.previewPulseBadge}>
                          <Text style={styles.previewPulseBadgeText}>W8 PEAK</Text>
                        </View>
                      </View>
                    <CatLottie variant="badge" style={styles.previewCatLottie} />
                      <Text style={styles.previewPulseLabel}>SEMESTER PULSE</Text>
                      <View style={styles.previewPulseDots}>
                        {Array.from({ length: 11 }, (_, i) => (
                          <View
                            key={i}
                            style={[
                              styles.previewPulseDot,
                              i === 4 && styles.previewPulseDotCurrent,
                              i === 6 && styles.previewPulseDotPeak,
                            ]}
                          />
                        ))}
                      </View>
                    </View>
                    <View style={[styles.mockCard, { backgroundColor: selectedTheme?.card ?? '#fff' }]}>
                      <View style={styles.mockRow}>
                        <View style={[styles.mockIcon, { backgroundColor: '#f2d7b3' }]}>
                          <Feather name="book-open" size={12} color="#8a5b2d" />
                        </View>
                        <Text style={[styles.mockText, { color: homeCardTextColor }]}>Webinar koloboratif ISP640</Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <>
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
                        <View style={[styles.mockIcon, { backgroundColor: isGalaxy ? '#3b2d69' : isSakura ? '#101010' : '#f2d7b3' }]}>
                          <Feather name="book-open" size={12} color={isGalaxy ? '#c8b8ff' : isSakura ? '#ffffff' : '#8a5b2d'} />
                        </View>
                        <Text style={[styles.mockText, { color: homeCardTextColor }]}>
                          {isGalaxy ? 'Review Physics Nebula Chapter' : isSakura ? 'Review Communication Notes' : 'Review Biology Chapter 4'}
                        </Text>
                      </View>
                      <View style={styles.mockRow}>
                        <View style={[styles.mockIcon, { backgroundColor: isGalaxy ? '#1d4a66' : isSakura ? '#171717' : '#d9e9cf' }]}>
                          <Feather name="clock" size={12} color={isGalaxy ? '#91d5ff' : isSakura ? '#d4d4d4' : '#4f7d3d'} />
                        </View>
                        <Text style={[styles.mockText, { color: homeCardTextColor }]}>Focus timer: 25 min</Text>
                      </View>
                    </View>
                  </>
                )}

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
                  <Text style={[styles.slotLabel, isGalaxy && { color: '#a9a0e8' }, isSakura && { color: '#9ca3af' }]}>{slot.label}</Text>
                    <Text style={[styles.slotTitle, isGalaxy && { color: '#ebe9ff' }, isSakura && { color: '#ffffff' }]}>{slot.title}</Text>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  topResetBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  topResetBtnText: {
    fontSize: 12,
    fontWeight: '700',
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
  applyTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  applyTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  activeBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  applySubtitle: {
    marginTop: 6,
    fontSize: 12,
  },
  applyActionRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  catFeatureNote: {
    marginTop: -2,
    fontSize: 12,
    lineHeight: 17,
  },
  applyBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  applyBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  resetBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  resetBtnText: {
    fontWeight: '700',
    fontSize: 12,
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
  previewHomeHeader: {
    marginTop: 10,
    marginBottom: 6,
  },
  previewHomeHello: {
    fontSize: 14,
    fontWeight: '800',
    color: '#3d2b1f',
  },
  previewPulseBox: {
    borderRadius: 10,
    padding: 8,
    backgroundColor: '#fff9f0',
    position: 'relative',
  },
  previewCatLottie: {
    position: 'absolute',
    right: 4,
    top: -16,
    width: 44,
    height: 32,
    opacity: 0.98,
  },
  previewPulseTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewPulseWeek: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3d2b1f',
  },
  previewPulseBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f8efe3',
  },
  previewPulseBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4b3623',
  },
  previewPulseLabel: {
    marginTop: 3,
    fontSize: 8.5,
    fontWeight: '700',
    color: '#8a735f',
    letterSpacing: 0.8,
  },
  previewPulseDots: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e7d9c5',
  },
  previewPulseDotCurrent: {
    backgroundColor: '#f59e0b',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  previewPulseDotPeak: {
    borderWidth: 1.5,
    borderColor: '#ef4444',
    backgroundColor: 'transparent',
    width: 8,
    height: 8,
    borderRadius: 4,
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
