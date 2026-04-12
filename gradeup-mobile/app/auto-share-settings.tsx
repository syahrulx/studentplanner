import { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { useTranslations } from '@/src/i18n';

function formatPersonDisplayName(raw: string): string {
  const t = raw.trim();
  if (!t) return raw;
  return t
    .split(/\s+/)
    .map((w) => (w.length <= 1 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AutoShareSettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language } = useApp();
  const T = useTranslations(language);
  const {
    userId,
    friendsWithStatus,
    circles,
    shareStreams,
    refreshShareStreams,
    refreshFriends,
    refreshCircles,
    toggleShareStream,
    toggleCircleShareStream,
  } = useCommunity();

  useFocusEffect(
    useCallback(() => {
      void Promise.all([refreshShareStreams(), refreshFriends(), refreshCircles()]);
    }, [refreshShareStreams, refreshFriends, refreshCircles]),
  );

  const friendStreamOn = useCallback(
    (friendId: string) => shareStreams.find((s) => s.recipient_id === friendId)?.enabled ?? false,
    [shareStreams],
  );

  const circleStreamOn = useCallback(
    (circleId: string) => shareStreams.find((s) => s.circle_id === circleId)?.enabled ?? false,
    [shareStreams],
  );

  const hasConnections = friendsWithStatus.length > 0 || circles.length > 0;
  const empty = useMemo(() => !userId || !hasConnections, [userId, hasConnections]);

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundSecondary }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.5 }]}>
          <Feather name="chevron-left" size={28} color={theme.primary} />
        </Pressable>
        <View style={styles.heroCenter}>
          <Text style={[styles.heroTitle, { color: theme.text }]} numberOfLines={1}>
            {T('autoShareSettingsTitle')}
          </Text>
          <Text style={[styles.heroSub, { color: theme.textSecondary }]} numberOfLines={2}>
            {T('autoShareSettingsSubtitle')}
          </Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Math.max(insets.bottom, 20) + 16 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!userId ? (
          <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{T('shareSignInHint')}</Text>
        ) : empty ? (
          <View style={styles.emptyBlock}>
            <Text style={[styles.bodyText, { color: theme.textSecondary, textAlign: 'center' }]}>
              {T('autoShareSettingsEmpty')}
            </Text>
            <Pressable
              style={[styles.communityBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/(tabs)/community' as any)}
            >
              <Text style={[styles.communityBtnText, { color: theme.textInverse }]}>{T('shareOpenCommunity')}</Text>
              <Feather name="chevron-right" size={18} color={theme.textInverse} />
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{T('shareFriendsLabel')}</Text>
            {friendsWithStatus.length === 0 ? (
              <Text style={[styles.muted, { color: theme.textSecondary }]}>{T('shareAllNoFriends')}</Text>
            ) : (
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {friendsWithStatus.map((f, index) => (
                  <View
                    key={f.id}
                    style={[
                      styles.row,
                      index < friendsWithStatus.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.border,
                      },
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: `${theme.primary}20` }]}>
                      <Text style={[styles.avatarText, { color: theme.primary }]}>{initials(f.name)}</Text>
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                        {formatPersonDisplayName(f.name)}
                      </Text>
                      <Text style={[styles.rowMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                        {T('shareAllAutoLabel')}
                      </Text>
                    </View>
                    <Switch
                      value={friendStreamOn(f.id)}
                      onValueChange={(v) => void toggleShareStream(f.id, v)}
                      trackColor={{ false: theme.border, true: '#10b981' }}
                    />
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: 20 }]}>
              {T('shareCirclesLabel')}
            </Text>
            {circles.length === 0 ? (
              <Text style={[styles.muted, { color: theme.textSecondary }]}>{T('shareAllNoCircles')}</Text>
            ) : (
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {circles.map((c, index) => (
                  <View
                    key={c.id}
                    style={[
                      styles.row,
                      index < circles.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.border,
                      },
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: `${theme.primary}20` }]}>
                      <Text style={styles.emojiAvatar}>{c.emoji || '●'}</Text>
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text style={[styles.rowMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                        {T('shareAllAutoLabel')}
                      </Text>
                    </View>
                    <Switch
                      value={circleStreamOn(c.id)}
                      onValueChange={(v) => void toggleCircleShareStream(c.id, v)}
                      trackColor={{ false: theme.border, true: '#10b981' }}
                    />
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  heroCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 18,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginLeft: 2,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  muted: { fontSize: 14, marginBottom: 8, marginLeft: 2 },
  emptyBlock: { marginTop: 24, gap: 16 },
  communityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  communityBtnText: { fontSize: 16, fontWeight: '700' },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
      },
      default: {},
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '800' },
  emojiAvatar: { fontSize: 18 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowMeta: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});
