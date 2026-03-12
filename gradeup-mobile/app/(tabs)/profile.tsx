import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import Feather from '@expo/vector-icons/Feather';
import { useTranslations } from '@/src/i18n';

const PAD = 20;
const SECTION = 28;
const RADIUS = 24;
const RADIUS_SM = 18;

const CONNECT_CARDS = [
  { id: 'study-buddy' as const, titleKey: 'connectStudyBuddyTitle' as const, descKey: 'connectStudyBuddyDesc' as const, icon: 'book-open' as const, route: '/community/study-buddy' as const },
  { id: 'merit' as const, titleKey: 'connectMeritTitle' as const, descKey: 'connectMeritDesc' as const, icon: 'award' as const, route: '/community/merit' as const },
  { id: 'music' as const, titleKey: 'connectMusicTitle' as const, descKey: 'connectMusicDesc' as const, icon: 'music' as const, route: '/community/music' as const },
] as const;

export default function Profile() {
  const { language } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const cardAccent = theme.primary;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero header with texture */}
      <View style={[styles.heroWrap, { backgroundColor: theme.primary }]}>
        <Image
          source={require('../../assets/images/wave-texture.png')}
          style={[StyleSheet.absoluteFillObject, styles.heroTexture]}
          resizeMode="cover"
        />
        <View style={[StyleSheet.absoluteFillObject, styles.heroOverlay]} />
        <View style={styles.heroContent}>
          <View style={[styles.heroIconRing, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
            <Feather name="users" size={28} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>{T('communityHeroTitle')}</Text>
          <Text style={styles.heroSubtitle}>{T('communityHeroSubtitle')}</Text>
          <View style={[styles.heroPill, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
            <Text style={styles.heroPillText}>{T('communityHeroPill')}</Text>
          </View>
        </View>
      </View>

      {/* Connect section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconWrap, { backgroundColor: theme.primary + '12' }]}>
            <Feather name="user-plus" size={16} color={theme.primary} />
          </View>
          <Text style={[styles.sectionLabel, { color: theme.text }]}>{T('communitySectionLabel')}</Text>
        </View>
        <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
          {T('communitySectionHint')}
        </Text>
        <View style={styles.cardList}>
          {CONNECT_CARDS.map((card) => (
            <Pressable
              key={card.id}
              style={({ pressed }) => [
                styles.connectCard,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderLeftColor: cardAccent,
                  shadowColor: theme.primary,
                  transform: [{ scale: pressed ? 0.99 : 1 }],
                },
              ]}
              onPress={() => router.push(card.route as any)}
            >
              <View style={[styles.cardAccentBg, { backgroundColor: cardAccent + '08' }]} />
              <View style={[styles.connectIconWrap, { backgroundColor: cardAccent + '18' }]}>
                <Feather name={card.icon} size={26} color={cardAccent} />
              </View>
              <View style={styles.connectBody}>
                <Text style={[styles.connectTitle, { color: theme.text }]}>{T(card.titleKey)}</Text>
                <Text style={[styles.connectDesc, { color: theme.textSecondary }]}>{T(card.descKey)}</Text>
              </View>
              <View style={[styles.arrowWrap, { backgroundColor: cardAccent + '14' }]}>
                <Feather name="chevron-right" size={20} color={cardAccent} />
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.footerHint, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name="sparkles" size={14} color={theme.textSecondary} />
        <Text style={[styles.footerHintText, { color: theme.textSecondary }]}>{T('communityFooterHint')}</Text>
      </View>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 0, paddingBottom: 24 },
  heroWrap: {
    marginHorizontal: PAD,
    marginTop: 56,
    marginBottom: SECTION,
    borderRadius: RADIUS,
    overflow: 'hidden',
    minHeight: 180,
    paddingVertical: 28,
    paddingHorizontal: 24,
    shadowColor: '#003366',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  heroTexture: {
    opacity: 0.35,
    borderRadius: RADIUS,
  },
  heroOverlay: {
    backgroundColor: 'rgba(0, 51, 102, 0.4)',
    borderRadius: RADIUS,
  },
  heroContent: {
    position: 'relative',
    zIndex: 1,
    alignItems: 'center',
  },
  heroIconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    marginTop: 4,
  },
  heroPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 14,
  },
  heroPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  section: { paddingHorizontal: PAD, marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionHint: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 18,
    lineHeight: 19,
    marginLeft: 42,
  },
  cardList: { gap: 14 },
  connectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: RADIUS_SM,
    borderWidth: 1,
    borderLeftWidth: 5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  cardAccentBg: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '50%',
    height: '100%',
    borderTopRightRadius: RADIUS_SM,
    borderBottomRightRadius: RADIUS_SM,
  },
  connectIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 18,
  },
  connectBody: { flex: 1, minWidth: 0 },
  connectTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4, letterSpacing: -0.3 },
  connectDesc: { fontSize: 14, fontWeight: '500', lineHeight: 21 },
  arrowWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  footerHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: PAD,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  footerHintText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
