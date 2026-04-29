import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, Image } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme, useThemePack } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { CatLottie } from '@/components/CatLottie';

const PAD = 20;

type ThemePreview = {
  id: string;
  name: string;
  /** Used in pills & mini-headlines to tint subtle accents in the modal preview. */
  accent: string;
  description: string;
  /** Real background color the user sees once the theme is applied. */
  background: string;
  /** Real card color in the applied theme. */
  card: string;
  /** Real header bar color (or gradient base) the user will see. */
  headerColor: string;
  /** Optional gradient end color for the hero header. */
  headerColorEnd?: string;
  /** Foreground color used for header text/icons in the applied theme. */
  headerOnPrimary: string;
};

const THEME_PREVIEWS: ThemePreview[] = [
  {
    id: 'cat',
    name: 'Cat Theme',
    accent: '#b26f45',
    description: 'Warm cream cards, playful cat accents, cozy study vibe.',
    background: '#fff8f1',
    card: '#fffdf9',
    headerColor: '#f6c47f',
    headerColorEnd: '#f7ddb8',
    headerOnPrimary: '#5b3a22',
  },
  {
    id: 'sakura',
    name: 'Mono Theme',
    accent: '#ffffff',
    description: 'Pitch-black minimalist pack with clean monochrome icons and strong contrast.',
    background: '#000000',
    card: '#0a0a0a',
    headerColor: '#2a2a2a',
    headerColorEnd: '#1f1f1f',
    headerOnPrimary: '#f5f5f5',
  },
  {
    id: 'spider',
    name: 'Spider Theme',
    accent: '#b91c1c',
    description:
      'Near-black surfaces with deep crimson thread accents—high contrast, focused study mode.',
    background: '#050508',
    card: '#0c0c12',
    headerColor: '#140506',
    headerColorEnd: '#7f1d1d',
    headerOnPrimary: '#fef2f2',
  },
  {
    id: 'purple',
    name: 'Aurora Purple Theme',
    accent: '#b794f4',
    description:
      'Lilac wallpaper header with a marbled aurora pulse card — soft white surfaces underneath.',
    background: '#f7f4ff',
    card: '#ffffff',
    /** Header base is lilac, but in the real app a dark veil sits over a glitter
     *  wallpaper, so the header reads as deep violet with white text. */
    headerColor: '#e4d8ff',
    headerColorEnd: '#d4c2ff',
    headerOnPrimary: '#ffffff',
  },
];

export default function InAppThemesScreen() {
  const theme = useTheme();
  const themePack = useThemePack();
  const { user, setThemePack } = useApp();
  const isCatApplied = themePack === 'cat';
  const isMonoApplied = themePack === 'mono';
  const isSpiderApplied = themePack === 'spider';
  const isPurpleApplied = themePack === 'purple';
  const isFreePlan = (user.subscriptionPlan ?? 'free') === 'free';
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const selectedTheme = useMemo(
    () => THEME_PREVIEWS.find((x) => x.id === selectedThemeId) ?? null,
    [selectedThemeId],
  );
  const isSpider = selectedTheme?.id === 'spider';
  const isSakura = selectedTheme?.id === 'sakura';
  const isCat = selectedTheme?.id === 'cat';
  const isPurple = selectedTheme?.id === 'purple';
  const heroLabel = isSpider
    ? 'Thread Focus'
    : isSakura
    ? 'Mono Focus'
    : isPurple
    ? 'Aurora Focus'
    : 'Cat Focus';
  const heroLabelResolved = heroLabel;
  const heroIcon: 'grid' | 'sun' | 'feather' = isSpider ? 'grid' : isPurple ? 'feather' : 'sun';
  const heroEmoji = isSpider ? '◇' : isSakura ? '◻' : isPurple ? '☾' : '🐾';
  const headerOnPrimary = selectedTheme?.headerOnPrimary ?? '#ffffff';
  const headerColor = selectedTheme?.headerColor ?? '#6366f1';
  const headerColorEnd = selectedTheme?.headerColorEnd ?? headerColor;
  /** Body text on the page background (NOT inside the header). */
  const homeHeadlineColor = isSpider
    ? '#fafafa'
    : isSakura
    ? '#ffffff'
    : isPurple
    ? '#3f2f69'
    : '#2a2118';
  const homeSublineColor = isSpider
    ? '#d4d4d8'
    : isSakura
    ? '#b3b3b3'
    : isPurple
    ? '#66558e'
    : '#7a6552';
  const homeCardTextColor = isSpider
    ? '#e4e4e7'
    : isSakura
    ? '#e5e5e5'
    : isPurple
    ? '#3f2f69'
    : '#3d2b1f';
  const timetableHeadline = isSpider
    ? 'Timetable'
    : isSakura
    ? 'Timetable Minimal'
    : isPurple
    ? 'Timetable Aurora'
    : 'Timetable';
  const timetableMode = isSpider
    ? 'Week 7 — Thread view'
    : isSakura
    ? 'Week 7 - Mono Mode'
    : isPurple
    ? 'Week 7 — Aurora Mode'
    : 'Week 7 - Cat Mode';
  const slots = isSpider
    ? [
        { label: 'Mon 9:00', title: 'Linear Systems', bg: '#14080a' },
        { label: 'Tue 14:00', title: 'Academic Writing', bg: '#0f0608' },
        { label: 'Thu 10:30', title: 'Data Structures', bg: '#120709' },
      ]
    : isSakura
    ? [
        { label: 'Mon 9:00', title: 'Systems Design', bg: '#0f0f0f' },
        { label: 'Tue 14:00', title: 'Research Methods', bg: '#141414' },
        { label: 'Thu 10:30', title: 'Software Architecture', bg: '#1a1a1a' },
      ]
    : isPurple
    ? [
        { label: 'Mon 9:00', title: 'Quantum Methods', bg: '#f3edff' },
        { label: 'Tue 14:00', title: 'Visual Studies', bg: '#ece2ff' },
        { label: 'Thu 10:30', title: 'Creative Writing', bg: '#efe6ff' },
      ]
    : [
        { label: 'Mon 9:00', title: 'Database Systems', bg: '#f7e4cb' },
        { label: 'Tue 14:00', title: 'Software Eng Lab', bg: '#dbead4' },
        { label: 'Thu 10:30', title: 'Data Structures', bg: '#fce7d3' },
      ];
  const renderThemePattern = (forTimetable: boolean) => {
    if (isSpider) {
      const line = forTimetable ? 'rgba(185,28,28,0.22)' : 'rgba(220,38,38,0.26)';
      const node = forTimetable ? 'rgba(248,113,113,0.32)' : 'rgba(252,165,165,0.4)';
      return (
        <View style={styles.bgPatternWrap}>
          <View style={[styles.bgWebNode, { top: 22, right: 26, backgroundColor: node }]} />
          <View style={[styles.bgWebLine, styles.bgWebRayA, { backgroundColor: line }]} />
          <View style={[styles.bgWebLine, styles.bgWebRayB, { backgroundColor: line }]} />
          <View style={[styles.bgWebLine, styles.bgWebRayC, { backgroundColor: line }]} />
          <View style={[styles.bgWebStrand, styles.bgWebStrandA, { backgroundColor: line }]} />
          <View style={[styles.bgWebStrand, styles.bgWebStrandB, { backgroundColor: line }]} />
        </View>
      );
    }
    if (isSakura) {
      return (
        <View style={styles.bgPatternWrap}>
          <View style={styles.bgMonoTopBar} />
          <View style={styles.bgMonoSideAccent} />
        </View>
      );
    }
    if (isPurple) {
      return (
        <View style={styles.bgPatternWrap}>
          <View style={styles.bgPurpleSoftWash} />
        </View>
      );
    }
    return (
      <View style={styles.bgPatternWrap}>
        <View style={[styles.bgBubble, styles.bgBubbleA, { backgroundColor: '#f59e0b30' }]} />
        <View style={[styles.bgBubble, styles.bgBubbleB, { backgroundColor: '#fbbf2440' }]} />
        <View style={[styles.bgBubble, styles.bgBubbleC, { backgroundColor: '#fb923c30' }]} />
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
              : isSpiderApplied
              ? 'Spider theme is active now'
              : isPurpleApplied
              ? 'Aurora Purple theme is active now'
              : isFreePlan
              ? 'Free user mode: theme designs are locked'
              : 'Pro/Plus mode: theme previews are visible'}
          </Text>
        </View>

        {THEME_PREVIEWS.map((item) => (
          <View key={item.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.imageContent, { backgroundColor: item.headerColor }]}>
              {item.headerColorEnd ? (
                <View style={[styles.heroGradientSheen, { backgroundColor: item.headerColorEnd }]} />
              ) : null}
              {item.id === 'cat' ? (
                <View style={styles.cardPatternWrap}>
                  <View style={[styles.cardBubble, styles.cardBubbleA, { backgroundColor: 'rgba(255,255,255,0.32)' }]} />
                  <View style={[styles.cardBubble, styles.cardBubbleB, { backgroundColor: 'rgba(255,255,255,0.22)' }]} />
                  <View style={[styles.cardBubble, styles.cardBubbleC, { backgroundColor: 'rgba(255,255,255,0.18)' }]} />
                  <Text style={[styles.cardPatternGlyph, styles.cardPatternGlyphA, { color: '#5b3a22', opacity: 0.78 }]}>🐾</Text>
                </View>
              ) : item.id === 'sakura' ? (
                <View style={styles.cardPatternWrap}>
                  <View style={styles.heroMonoLineA} />
                  <View style={styles.heroMonoLineB} />
                  <View style={styles.heroMonoChipA} />
                  <View style={styles.heroMonoDotA} />
                </View>
              ) : item.id === 'spider' ? (
                <View style={styles.cardPatternWrap}>
                  <Image
                    source={require('../assets/spider-header-web.png')}
                    style={styles.cardSpiderWebImage}
                    resizeMode="contain"
                  />
                  <View style={styles.heroSpiderShade} />
                </View>
              ) : (
                <View style={styles.cardPatternWrap}>
                  <Image
                    source={require('../assets/purple-wallpaper-glitter.jpg')}
                    style={styles.cardPurpleGlitterImage}
                    resizeMode="cover"
                  />
                  <View style={styles.cardPurpleGlitterVeil} />
                  <Feather name="feather" size={16} color="#ffffff" style={styles.cardPurpleIcon} />
                </View>
              )}
              <Text style={[styles.previewTitle, { color: item.headerOnPrimary }]}>{item.name}</Text>
              <View style={[styles.previewTag, { backgroundColor: `${item.headerOnPrimary}22` }]}>
                <Text style={[styles.previewTagText, { color: item.headerOnPrimary }]}>Preview</Text>
              </View>
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
              ) : item.id === 'spider' ? (
                <View style={styles.applyTitleRow}>
                  <Text style={[styles.applyTitle, { color: theme.text }]}>Spider Theme Controls</Text>
                  {isSpiderApplied ? (
                    <View style={[styles.activeBadge, { backgroundColor: `${theme.primary}22` }]}>
                      <Text style={[styles.activeBadgeText, { color: theme.primary }]}>Active</Text>
                    </View>
                  ) : null}
                </View>
              ) : item.id === 'purple' ? (
                <View style={styles.applyTitleRow}>
                  <Text style={[styles.applyTitle, { color: theme.text }]}>Aurora Purple Theme Controls</Text>
                  {isPurpleApplied ? (
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
              ) : item.id === 'spider' ? (
                <Text style={[styles.catFeatureNote, { color: theme.textSecondary }]}>
                  Applies the dark charcoal + deep red Spider palette everywhere; optional motion accents can hook in later.
                </Text>
              ) : item.id === 'purple' ? (
                <Text style={[styles.catFeatureNote, { color: theme.textSecondary }]}>
                  Three-tone soft palette — lavender, lilac and orchid — paired with quiet aurora backdrops and a crescent moon accent.
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
              {item.id === 'spider' ? (
                <View style={styles.applyActionRow}>
                  <Pressable
                    onPress={() => setThemePack('spider')}
                    style={[
                      styles.applyBtn,
                      { backgroundColor: '#7f1d1d', borderWidth: 1, borderColor: '#b91c1c' },
                    ]}
                  >
                    <Text style={styles.applyBtnText}>Apply Spider Theme</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedThemeId('spider')}
                    style={[styles.resetBtn, { borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
                  >
                    <Text style={[styles.resetBtnText, { color: theme.text }]}>Preview Spider Theme</Text>
                  </Pressable>
                </View>
              ) : null}
              {item.id === 'purple' ? (
                <View style={styles.applyActionRow}>
                  <Pressable
                    onPress={() => setThemePack('purple')}
                    style={[
                      styles.applyBtn,
                      { backgroundColor: '#4d3b85', borderWidth: 1, borderColor: '#b794f4' },
                    ]}
                  >
                    <Text style={styles.applyBtnText}>Apply Purple Theme</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedThemeId('purple')}
                    style={[styles.resetBtn, { borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
                  >
                    <Text style={[styles.resetBtnText, { color: theme.text }]}>Preview Purple Theme</Text>
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
                {renderThemePattern(false)}

                {/* Mini Home Header — matches the real applied theme header */}
                <View style={[styles.previewHeaderBar, { backgroundColor: headerColor }]}>
                  <View style={[styles.previewHeaderSheen, { backgroundColor: headerColorEnd }]} />
                  {isSpider ? (
                    <Image
                      source={require('../assets/spider-header-web.png')}
                      style={styles.previewSpiderHeaderWeb}
                      resizeMode="contain"
                    />
                  ) : null}
                  {isPurple ? (
                    <>
                      <Image
                        source={require('../assets/purple-wallpaper-glitter.jpg')}
                        style={styles.previewPurpleHeaderImage}
                        resizeMode="cover"
                      />
                      <View style={styles.previewPurpleHeaderVeil} />
                    </>
                  ) : null}
                  <View style={styles.previewHeaderRow}>
                    <View style={[styles.previewPill, { backgroundColor: `${headerOnPrimary}1f` }]}>
                      <Feather name={heroIcon} size={10} color={headerOnPrimary} />
                      <Text style={[styles.previewPillText, { color: headerOnPrimary }]}>{heroLabelResolved}</Text>
                    </View>
                    <Text style={[styles.previewHeaderEmoji, { color: headerOnPrimary }]}>{heroEmoji}</Text>
                  </View>
                  <Text style={[styles.previewHeaderHello, { color: headerOnPrimary }]}>Hello, Izwan</Text>
                </View>

                {/* Mini Week Pulse card — replicates per-theme pulse styling */}
                {isPurple ? (
                  <View style={styles.previewPulseBoxPurple}>
                    <Image
                      source={require('../assets/purple-weekpulse-gradient.png')}
                      style={styles.previewPulseBoxImage}
                      resizeMode="cover"
                    />
                    <View style={styles.previewPulseBoxImageVeil} />
                    <View style={styles.previewPulseTopRow}>
                      <Text style={[styles.previewPulseWeek, { color: '#ffffff' }]}>WEEK 5</Text>
                      <View style={[styles.previewPulseBadge, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                        <Text style={[styles.previewPulseBadgeText, { color: '#ffffff' }]}>W8 PEAK</Text>
                      </View>
                    </View>
                    <Text style={[styles.previewPulseLabel, { color: 'rgba(255,255,255,0.85)' }]}>SEMESTER PULSE</Text>
                    <View style={styles.previewPulseDots}>
                      {Array.from({ length: 11 }, (_, i) => (
                        <View
                          key={i}
                          style={[
                            styles.previewPulseDot,
                            { backgroundColor: 'rgba(255,255,255,0.32)' },
                            i === 4 && { backgroundColor: '#ffffff', width: 8, height: 8, borderRadius: 4 },
                            i === 6 && { borderWidth: 1.5, borderColor: '#ffffff', backgroundColor: 'transparent', width: 8, height: 8, borderRadius: 4 },
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                ) : isSpider ? (
                  <View style={[styles.previewPulseBoxDark, { backgroundColor: '#0c0c12', borderColor: '#1f0d0e' }]}>
                    <Image
                      source={require('../assets/spider-card-web.png')}
                      style={styles.previewPulseSpiderWeb}
                      resizeMode="contain"
                    />
                    <View style={styles.previewPulseTopRow}>
                      <Text style={[styles.previewPulseWeek, { color: '#fafafa' }]}>WEEK 5</Text>
                      <View style={[styles.previewPulseBadge, { backgroundColor: '#1a0a0c' }]}>
                        <Text style={[styles.previewPulseBadgeText, { color: '#fecaca' }]}>W8 PEAK</Text>
                      </View>
                    </View>
                    <Text style={[styles.previewPulseLabel, { color: '#a8a29e' }]}>SEMESTER PULSE</Text>
                    <View style={styles.previewPulseDots}>
                      {Array.from({ length: 11 }, (_, i) => (
                        <View
                          key={i}
                          style={[
                            styles.previewPulseDot,
                            { backgroundColor: '#27272a' },
                            i === 4 && { backgroundColor: '#b91c1c', width: 8, height: 8, borderRadius: 4 },
                            i === 6 && { borderWidth: 1.5, borderColor: '#dc2626', backgroundColor: 'transparent', width: 8, height: 8, borderRadius: 4 },
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                ) : isSakura ? (
                  <View style={[styles.previewPulseBoxDark, { backgroundColor: '#0a0a0a', borderColor: '#1f1f1f' }]}>
                    <View style={styles.previewPulseTopRow}>
                      <Text style={[styles.previewPulseWeek, { color: '#fafafa' }]}>WEEK 5</Text>
                      <View style={[styles.previewPulseBadge, { backgroundColor: '#1f1f1f' }]}>
                        <Text style={[styles.previewPulseBadgeText, { color: '#e5e5e5' }]}>W8 PEAK</Text>
                      </View>
                    </View>
                    <Text style={[styles.previewPulseLabel, { color: '#9ca3af' }]}>SEMESTER PULSE</Text>
                    <View style={styles.previewPulseDots}>
                      {Array.from({ length: 11 }, (_, i) => (
                        <View
                          key={i}
                          style={[
                            styles.previewPulseDot,
                            { backgroundColor: '#1f1f1f' },
                            i === 4 && { backgroundColor: '#fafafa', width: 8, height: 8, borderRadius: 4 },
                            i === 6 && { borderWidth: 1.5, borderColor: '#d4d4d4', backgroundColor: 'transparent', width: 8, height: 8, borderRadius: 4 },
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                ) : (
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
                )}

                {/* Mini task card — uses the real applied card color */}
                <View
                  style={[
                    styles.mockCard,
                    {
                      backgroundColor: selectedTheme?.card ?? '#fff',
                      borderWidth: isSakura || isSpider ? 1 : 0,
                      borderColor: isSpider ? '#3a0d11' : isSakura ? '#1f1f1f' : 'transparent',
                    },
                  ]}
                >
                  <View style={styles.mockRow}>
                    <View
                      style={[
                        styles.mockIcon,
                        {
                          backgroundColor: isSpider
                            ? '#3f0a0d'
                            : isSakura
                            ? '#1f1f1f'
                            : isPurple
                            ? '#ece2ff'
                            : '#f2d7b3',
                        },
                      ]}
                    >
                      <Feather
                        name="book-open"
                        size={12}
                        color={
                          isSpider
                            ? '#fca5a5'
                            : isSakura
                            ? '#ffffff'
                            : isPurple
                            ? '#7762bd'
                            : '#8a5b2d'
                        }
                      />
                    </View>
                    <Text style={[styles.mockText, { color: homeCardTextColor }]}>
                      {isSpider
                        ? 'Review Methods draft'
                        : isSakura
                        ? 'Review Communication Notes'
                        : isPurple
                        ? 'Aurora study plan today'
                        : 'Webinar koloboratif ISP640'}
                    </Text>
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

                {/* Mini Timetable header — matches real header colors */}
                <View style={[styles.previewHeaderBar, { backgroundColor: headerColor }]}>
                  <View style={[styles.previewHeaderSheen, { backgroundColor: headerColorEnd }]} />
                  {isSpider ? (
                    <Image
                      source={require('../assets/spider-header-web.png')}
                      style={styles.previewSpiderHeaderWeb}
                      resizeMode="contain"
                    />
                  ) : null}
                  {isPurple ? (
                    <>
                      <Image
                        source={require('../assets/purple-wallpaper-glitter.jpg')}
                        style={styles.previewPurpleHeaderImage}
                        resizeMode="cover"
                      />
                      <View style={styles.previewPurpleHeaderVeil} />
                    </>
                  ) : null}
                  <View style={styles.previewHeaderRow}>
                    <Feather name="calendar" size={11} color={headerOnPrimary} />
                    <Text style={[styles.previewHeaderHello, { color: headerOnPrimary, marginTop: 0 }]}>{timetableHeadline}</Text>
                  </View>
                  <Text style={[styles.previewHeaderSub, { color: headerOnPrimary }]}>{timetableMode}</Text>
                </View>

                {slots.map((slot) => (
                  <View
                    key={slot.label}
                    style={[
                      styles.slotCard,
                      { backgroundColor: slot.bg },
                      isSpider && { borderWidth: 1, borderColor: '#3a0d11' },
                      isSakura && { borderWidth: 1, borderColor: '#1f1f1f' },
                      isPurple && { borderWidth: 1, borderColor: '#ddd3fb' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.slotLabel,
                        isSpider && { color: '#f87171' },
                        isSakura && { color: '#9ca3af' },
                        isPurple && { color: '#7762bd' },
                      ]}
                    >
                      {slot.label}
                    </Text>
                    <Text
                      style={[
                        styles.slotTitle,
                        isSpider && { color: '#fafafa' },
                        isSakura && { color: '#ffffff' },
                        isPurple && { color: '#3f2f69' },
                      ]}
                    >
                      {slot.title}
                    </Text>
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
    fontSize: 18,
    fontWeight: '800',
  },
  previewTag: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  previewTagText: {
    fontSize: 12,
    fontWeight: '700',
  },
  heroGradientSheen: {
    position: 'absolute',
    right: -30,
    top: -20,
    width: 180,
    height: 180,
    borderRadius: 999,
    opacity: 0.55,
  },
  heroMonoLineA: {
    position: 'absolute',
    width: 130,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    top: 18,
    left: -10,
    transform: [{ rotate: '-9deg' }],
  },
  heroMonoLineB: {
    position: 'absolute',
    width: 80,
    height: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    top: 50,
    right: 10,
    transform: [{ rotate: '8deg' }],
  },
  heroMonoChipA: {
    position: 'absolute',
    width: 26,
    height: 10,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    top: 14,
    right: 14,
  },
  heroMonoDotA: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f5f5f5',
    top: 16,
    right: 16,
  },
  heroSpiderShade: {
    position: 'absolute',
    bottom: -12,
    left: -20,
    width: 200,
    height: 70,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  cardPurpleHeroImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
    opacity: 0.92,
    transform: [{ rotate: '90deg' }, { scale: 1.4 }],
  },
  cardPurpleHeroVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(228,216,255,0.18)',
  },
  cardSpiderWebImage: {
    position: 'absolute',
    top: -8,
    left: -28,
    width: 240,
    height: 170,
    opacity: 0.32,
    tintColor: '#f3f4f6',
  },
  cardPurpleGlitterImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
    opacity: 1,
  },
  cardPurpleGlitterVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(54, 31, 124, 0.74)',
  },
  bgMonoTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 64,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  bgMonoSideAccent: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    width: 70,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
  },
  bgPurpleSoftWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(232,222,255,0.55)',
  },
  previewHeaderBar: {
    marginHorizontal: -8,
    marginTop: -8,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
    position: 'relative',
  },
  previewHeaderSheen: {
    position: 'absolute',
    right: -40,
    top: -30,
    width: 160,
    height: 160,
    borderRadius: 999,
    opacity: 0.45,
  },
  previewHeaderWebRayA: {
    height: 80,
    top: -10,
    right: 18,
    transform: [{ rotate: '32deg' }],
  },
  previewHeaderWebRayB: {
    height: 70,
    top: 4,
    right: 38,
    transform: [{ rotate: '-22deg' }],
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  previewHeaderEmoji: {
    fontSize: 14,
  },
  previewHeaderHello: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
  },
  previewHeaderSub: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    opacity: 0.85,
  },
  previewPulseBoxPurple: {
    borderRadius: 10,
    padding: 8,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d6c8fb',
  },
  previewPulseBoxImage: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 220,
    height: 340,
    opacity: 0.92,
    transform: [{ translateX: -102 }, { translateY: -174 }, { rotate: '90deg' }],
  },
  previewPulseBoxImageVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(60,40,90,0.18)',
  },
  previewPulseBoxDark: {
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  previewPulseWebRayA: {
    height: 70,
    top: -8,
    right: 12,
    transform: [{ rotate: '36deg' }],
  },
  previewPulseWebRayB: {
    height: 60,
    top: 8,
    right: 32,
    transform: [{ rotate: '-22deg' }],
  },
  previewSpiderHeaderWeb: {
    position: 'absolute',
    top: -4,
    left: -16,
    width: 230,
    height: 160,
    opacity: 0.30,
    tintColor: '#f3f4f6',
  },
  previewPurpleHeaderImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
    opacity: 1,
  },
  previewPurpleHeaderVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(54, 31, 124, 0.74)',
  },
  previewPulseSpiderWeb: {
    position: 'absolute',
    right: -50,
    top: -32,
    width: 190,
    height: 130,
    opacity: 0.55,
    tintColor: '#7f1d1d',
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
  /** Spider theme: subtle radial threads + strands (no character imagery). */
  bgWebLine: {
    position: 'absolute',
    width: StyleSheet.hairlineWidth * 2,
    borderRadius: 1,
  },
  bgWebRayA: {
    height: 168,
    top: -16,
    left: '40%',
    transform: [{ rotate: '34deg' }],
  },
  bgWebRayB: {
    height: 152,
    top: 4,
    left: '36%',
    transform: [{ rotate: '-22deg' }],
  },
  bgWebRayC: {
    height: 148,
    top: 16,
    left: '48%',
    transform: [{ rotate: '72deg' }],
  },
  bgWebStrand: {
    position: 'absolute',
    height: StyleSheet.hairlineWidth * 2,
    borderRadius: 1,
  },
  bgWebStrandA: {
    width: 76,
    top: 52,
    left: 10,
    transform: [{ rotate: '-26deg' }],
  },
  bgWebStrandB: {
    width: 92,
    top: 72,
    left: 22,
    transform: [{ rotate: '11deg' }],
  },
  bgWebNode: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  cardWebLine: {
    position: 'absolute',
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(248,113,113,0.42)',
    borderRadius: 1,
  },
  cardWebRayA: {
    height: 78,
    top: 6,
    right: 28,
    transform: [{ rotate: '36deg' }],
  },
  cardWebRayB: {
    height: 70,
    bottom: 10,
    left: 16,
    transform: [{ rotate: '-28deg' }],
  },
  cardWebStrand: {
    position: 'absolute',
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(185,28,28,0.35)',
    borderRadius: 1,
  },
  cardWebStrandA: {
    width: 54,
    top: 46,
    left: 8,
    transform: [{ rotate: '-16deg' }],
  },
  cardWebNode: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(254,202,202,0.65)',
  },
  cardWebNodePos: {
    top: 12,
    right: 38,
  },
  bgPurpleWallpaper: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
    opacity: 0.4,
  },
  bgPurpleVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34,26,63,0.55)',
  },
  cardPurpleWallpaper: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
    opacity: 0.55,
  },
  cardPurpleVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34,26,63,0.4)',
  },
  cardPurpleIcon: {
    position: 'absolute',
    top: 12,
    right: 14,
    opacity: 0.9,
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
