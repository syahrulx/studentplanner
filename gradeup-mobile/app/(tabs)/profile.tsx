import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import Feather from '@expo/vector-icons/Feather';
import { useTranslations } from '@/src/i18n';

const NAVY = '#003366';
const BG = '#f8fafc';
const CARD = '#ffffff';
const TEXT_PRIMARY = '#0f172a';
const TEXT_SECONDARY = '#94a3b8';
const DIVIDER = '#f1f5f9';

const CONNECT_CARDS = [
  { id: 'study-buddy' as const, titleKey: 'connectStudyBuddyTitle' as const, descKey: 'connectStudyBuddyDesc' as const, icon: 'book-open' as const, route: '/community/study-buddy' as const, color: '#3b82f6' },
  { id: 'merit' as const, titleKey: 'connectMeritTitle' as const, descKey: 'connectMeritDesc' as const, icon: 'award' as const, route: '/community/merit' as const, color: '#f59e0b' },
  { id: 'music' as const, titleKey: 'connectMusicTitle' as const, descKey: 'connectMusicDesc' as const, icon: 'music' as const, route: '/community/music' as const, color: '#ec4899' },
] as const;

export default function Profile() {
  const { language } = useApp();
  const T = useTranslations(language);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.headerIconWrap}>
            <Feather name="users" size={20} color={NAVY} />
          </View>
          <View>
            <Text style={s.headerTitle}>{T('community')}</Text>
            <Text style={s.headerSub}>{T('communityHeroSubtitle')}</Text>
          </View>
        </View>
      </View>

      {/* Connect Group */}
      <Text style={s.sectionLabel}>{T('communitySectionLabel').toUpperCase()}</Text>
      
      <View style={s.groupCard}>
        {CONNECT_CARDS.map((card, idx) => {
          const isLast = idx === CONNECT_CARDS.length - 1;
          return (
            <Pressable
              key={card.id}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: '#f8fafc' }]}
              onPress={() => router.push(card.route as any)}
            >
              <View style={[s.iconBox, { backgroundColor: card.color }]}>
                <Feather name={card.icon} size={14} color="#ffffff" />
              </View>
              <View style={s.rowBody}>
                <Text style={s.rowTitle}>{T(card.titleKey)}</Text>
                <Text style={s.rowSub} numberOfLines={1}>{T(card.descKey)}</Text>
              </View>
              <Feather name="chevron-right" size={16} color="#cbd5e1" />
              {!isLast && <View style={s.divider} />}
            </Pressable>
          );
        })}
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 64 : 48, paddingBottom: 24 },

  // Header
  header: {
    paddingBottom: 28,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0,51,102,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: TEXT_PRIMARY, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, fontWeight: '500', color: TEXT_SECONDARY, marginTop: 2 },

  // List
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_SECONDARY,
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingLeft: 4,
  },
  groupCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
    position: 'relative',
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: TEXT_PRIMARY },
  rowSub: { fontSize: 13, fontWeight: '400', color: TEXT_SECONDARY, marginTop: 1 },
  
  divider: {
    position: 'absolute',
    bottom: 0,
    left: 58,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: DIVIDER,
  },
});
