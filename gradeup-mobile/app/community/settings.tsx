import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import {
  getCircleLocationVisibility,
  setCircleLocationVisibility,
  getCustomFriendLocationVisibility,
  setCustomFriendLocationVisibility,
} from '@/src/lib/communityApi';
import {
  getCommunityPushPrefs,
  updateCommunityPushPrefs,
  DEFAULT_COMMUNITY_PUSH_PREFS,
  type CommunityPushPrefs,
} from '@/src/lib/communityPushPrefs';
import { Avatar } from '@/components/Avatar';
import { useTheme, useThemePack } from '@/hooks/useTheme';
import Feather from '@expo/vector-icons/Feather';
import { useTranslations } from '@/src/i18n';
import { featherForLegacyCircleEmoji } from '@/src/lib/featherGlyphUi';

const PAD = 20;
const RADIUS = 14;

export default function CommunitySettings() {
  const { language } = useApp();
  const {
    locationVisibility,
    setLocationVisibility,
    circles,
    friendsWithStatus,
    userId,
  } = useCommunity();
  const theme = useTheme();
  const themePack = useThemePack();
  const isMonoTheme = themePack === 'mono';
  const switchTrackOff = isMonoTheme ? '#262626' : theme.border;
  const switchTrackOn = isMonoTheme ? '#525252' : theme.primary;
  const switchThumb = isMonoTheme ? '#ffffff' : undefined;
  const T = useTranslations(language);

  const [isUpdating, setIsUpdating] = useState(false);
  const [circleVisibilityIds, setCircleVisibilityIds] = useState<string[]>([]);
  const [loadingCircleVisibility, setLoadingCircleVisibility] = useState(false);
  const [circleDropdownOpen, setCircleDropdownOpen] = useState(false);

  const [friendVisibilityIds, setFriendVisibilityIds] = useState<string[]>([]);
  const [loadingFriendVisibility, setLoadingFriendVisibility] = useState(false);
  const [friendDropdownOpen, setFriendDropdownOpen] = useState(false);

  const [pushPrefs, setPushPrefs] = useState<CommunityPushPrefs>(DEFAULT_COMMUNITY_PUSH_PREFS);
  const [loadingPushPrefs, setLoadingPushPrefs] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoadingPushPrefs(true);
    getCommunityPushPrefs(userId)
      .then((prefs) => {
        if (!cancelled) setPushPrefs(prefs);
      })
      .finally(() => {
        if (!cancelled) setLoadingPushPrefs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const togglePushPref = async (key: keyof CommunityPushPrefs, next: boolean) => {
    if (!userId) return;
    const prev = pushPrefs;
    const nextPrefs = { ...prev, [key]: next };
    setPushPrefs(nextPrefs);
    const ok = await updateCommunityPushPrefs(userId, { [key]: next });
    if (!ok) {
      setPushPrefs(prev);
      Alert.alert('Could not update notification preferences', 'Please try again.');
    }
  };

  useEffect(() => {
    if (!userId || locationVisibility !== 'circles') return;
    setLoadingCircleVisibility(true);
    getCircleLocationVisibility(userId)
      .then(setCircleVisibilityIds)
      .catch(() => setCircleVisibilityIds([]))
      .finally(() => setLoadingCircleVisibility(false));
  }, [userId, locationVisibility]);

  useEffect(() => {
    if (!userId || locationVisibility !== 'custom_friends') return;
    setLoadingFriendVisibility(true);
    getCustomFriendLocationVisibility(userId)
      .then(setFriendVisibilityIds)
      .catch(() => setFriendVisibilityIds([]))
      .finally(() => setLoadingFriendVisibility(false));
  }, [userId, locationVisibility]);

  const toggleCircleVisibility = async (circleId: string) => {
    if (!userId) return;
    const prev = circleVisibilityIds;
    const next = prev.includes(circleId) ? prev.filter((id) => id !== circleId) : [...prev, circleId];
    setCircleVisibilityIds(next);
    try {
      await setCircleLocationVisibility(userId, next);
    } catch (e) {
      setCircleVisibilityIds(prev);
      Alert.alert('Could not update visibility', 'Please try again.');
    }
  };

  const toggleFriendVisibility = async (friendId: string) => {
    if (!userId) return;
    const prev = friendVisibilityIds;
    const next = prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId];
    setFriendVisibilityIds(next);
    try {
      await setCustomFriendLocationVisibility(userId, next);
    } catch (e) {
      setFriendVisibilityIds(prev);
      Alert.alert('Could not update visibility', 'Please try again.');
    }
  };

  const privacyOptions: { value: LocationVisibility; label: string; icon: React.ComponentProps<typeof Feather>['name']; desc: string }[] = [
    { value: 'public', label: 'Public', icon: 'globe', desc: 'Everyone can see your location' },
    { value: 'friends', label: 'Friends Only', icon: 'users', desc: 'All friends can see your location' },
    { value: 'custom_friends', label: 'Selected Friends', icon: 'user', desc: 'Only specific friends can see your location' },
    { value: 'circles', label: 'Circles', icon: 'circle', desc: 'Only people in your circles can see your location' },
    { value: 'off', label: 'Off', icon: 'lock', desc: 'No one can see your location' },
  ];


  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <Feather name="chevron-left" size={28} color={theme.primary} />
            <Text style={[styles.backText, { color: theme.primary }]}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.titleWrap}>
          <Text style={[styles.largeTitle, { color: theme.text }]}>Community Settings</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Manage your spatial presence and social integrations
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>LOCATION PRIVACY</Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          {privacyOptions.map((opt, i) => (
            <React.Fragment key={opt.value}>
              <Pressable
                style={({ pressed }) => [styles.privacyRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
                onPress={() => {
                  setLocationVisibility(opt.value).catch(() => {});
                  if (opt.value === 'circles') {
                    setCircleDropdownOpen((open) => !open);
                    setFriendDropdownOpen(false);
                  } else if (opt.value === 'custom_friends') {
                    setFriendDropdownOpen((open) => !open);
                    setCircleDropdownOpen(false);
                  } else {
                    setCircleDropdownOpen(false);
                    setFriendDropdownOpen(false);
                  }
                }}
              >
                <View style={{ width: 28, alignItems: 'center' }}>
                  <Feather name={opt.icon} size={22} color={theme.primary} />
                </View>
                <View style={styles.privacyBody}>
                  <Text style={[styles.privacyLabel, { color: theme.text }]}>{opt.label}</Text>
                  <Text style={[styles.privacyDesc, { color: theme.textSecondary }]}>{opt.desc}</Text>
                </View>
                {opt.value === 'circles' || opt.value === 'custom_friends' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {locationVisibility === opt.value && <Feather name="check" size={18} color={theme.primary} />}
                    <Feather
                      name={
                        (opt.value === 'circles' && circleDropdownOpen && locationVisibility === 'circles') ||
                        (opt.value === 'custom_friends' && friendDropdownOpen && locationVisibility === 'custom_friends')
                          ? 'chevron-up'
                          : 'chevron-down'
                      }
                      size={18}
                      color={theme.textSecondary}
                    />
                  </View>
                ) : (
                  locationVisibility === opt.value && <Feather name="check" size={20} color={theme.primary} />
                )}
              </Pressable>
              {opt.value === 'circles' && circleDropdownOpen && locationVisibility === 'circles' && (
                <View style={{ paddingHorizontal: 4, paddingBottom: 6 }}>
                  {loadingCircleVisibility ? (
                    <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Text style={[styles.cardValue, { color: theme.textSecondary }]}>Loading circles…</Text>
                    </View>
                  ) : circles.length === 0 ? (
                    <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Text style={[styles.cardValue, { color: theme.textSecondary }]}>
                        No circles found. Create one in the Community tab.
                      </Text>
                    </View>
                  ) : (
                    circles.map((c, index) => {
                      const selected = circleVisibilityIds.includes(c.id);
                      return (
                        <React.Fragment key={c.id}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.circleVisibilityRow,
                              pressed && { backgroundColor: theme.backgroundSecondary },
                            ]}
                            onPress={() => toggleCircleVisibility(c.id)}
                          >
                            <View style={{ width: 28, alignItems: 'center', justifyContent: 'center' }}>
                              <Feather name={featherForLegacyCircleEmoji(c.emoji)} size={18} color={theme.primary} />
                            </View>
                            <View style={styles.circleVisibilityBody}>
                               <Text style={[styles.circleVisibilityLabel, { color: theme.text }]}>{c.name}</Text>
                               <Text style={[styles.circleVisibilityDesc, { color: theme.textSecondary }]}>
                                 {selected ? 'Visible' : 'Hidden'}
                               </Text>
                            </View>
                            {selected && <Feather name="check" size={18} color={theme.primary} />}
                          </Pressable>
                          {index < circles.length - 1 && <View style={styles.dividerList} />}
                        </React.Fragment>
                      );
                    })
                  )}
                </View>
              )}
              {opt.value === 'custom_friends' && friendDropdownOpen && locationVisibility === 'custom_friends' && (
                <View style={{ paddingHorizontal: 4, paddingBottom: 6 }}>
                  {loadingFriendVisibility ? (
                    <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Text style={[styles.cardValue, { color: theme.textSecondary }]}>Loading friends…</Text>
                    </View>
                  ) : friendsWithStatus.length === 0 ? (
                    <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Text style={[styles.cardValue, { color: theme.textSecondary }]}>
                        No friends found. Add friends in the Community tab.
                      </Text>
                    </View>
                  ) : (
                    friendsWithStatus.map((friend, index) => {
                      const selected = friendVisibilityIds.includes(friend.id);
                      return (
                        <React.Fragment key={friend.id}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.circleVisibilityRow,
                              pressed && { backgroundColor: theme.backgroundSecondary },
                            ]}
                            onPress={() => toggleFriendVisibility(friend.id)}
                          >
                            <View style={{ marginRight: 10 }}>
                              <Avatar name={friend.name} url={friend.avatar_url} size={28} />
                            </View>
                            <View style={styles.circleVisibilityBody}>
                              <Text style={[styles.circleVisibilityLabel, { color: theme.text }]}>{friend.name}</Text>
                              <Text style={[styles.circleVisibilityDesc, { color: theme.textSecondary }]}>
                                {selected ? 'Visible' : 'Hidden'}
                              </Text>
                            </View>
                            {selected && <Feather name="check" size={18} color={theme.primary} />}
                          </Pressable>
                          {index < friendsWithStatus.length - 1 && <View style={styles.dividerList} />}
                        </React.Fragment>
                      );
                    })
                  )}
                </View>
              )}
              {i < privacyOptions.length - 1 && <View style={styles.dividerList} />}
            </React.Fragment>
          ))}
        </View>


        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>PUSH NOTIFICATIONS</Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          <View style={styles.pushRow}>
            <View style={styles.pushBody}>
              <Text style={[styles.pushLabel, { color: theme.text }]}>Community notifications</Text>
              <Text style={[styles.pushDesc, { color: theme.textSecondary }]}>
                Master switch for all community alerts (reactions, friends, circles, shared tasks).
              </Text>
            </View>
            <Switch
              value={pushPrefs.communityPushEnabled}
              onValueChange={(v) => togglePushPref('communityPushEnabled', v)}
              disabled={loadingPushPrefs}
              trackColor={{ false: switchTrackOff, true: switchTrackOn }}
              thumbColor={switchThumb}
              ios_backgroundColor={switchTrackOff}
            />
          </View>
          <View style={styles.dividerList} />
          <View style={[styles.pushRow, !pushPrefs.communityPushEnabled && { opacity: 0.4 }]}>
            <View style={styles.pushBody}>
              <Text style={[styles.pushLabel, { color: theme.text }]}>Reactions & bumps</Text>
              <Text style={[styles.pushDesc, { color: theme.textSecondary }]}>
                When someone sends you a reaction or a nudge.
              </Text>
            </View>
            <Switch
              value={pushPrefs.pushReactionsEnabled}
              onValueChange={(v) => togglePushPref('pushReactionsEnabled', v)}
              disabled={loadingPushPrefs || !pushPrefs.communityPushEnabled}
              trackColor={{ false: switchTrackOff, true: switchTrackOn }}
              thumbColor={switchThumb}
              ios_backgroundColor={switchTrackOff}
            />
          </View>
          <View style={styles.dividerList} />
          <View style={[styles.pushRow, !pushPrefs.communityPushEnabled && { opacity: 0.4 }]}>
            <View style={styles.pushBody}>
              <Text style={[styles.pushLabel, { color: theme.text }]}>Friend requests</Text>
              <Text style={[styles.pushDesc, { color: theme.textSecondary }]}>
                New friend requests and when someone accepts yours.
              </Text>
            </View>
            <Switch
              value={pushPrefs.pushFriendRequestsEnabled}
              onValueChange={(v) => togglePushPref('pushFriendRequestsEnabled', v)}
              disabled={loadingPushPrefs || !pushPrefs.communityPushEnabled}
              trackColor={{ false: switchTrackOff, true: switchTrackOn }}
              thumbColor={switchThumb}
              ios_backgroundColor={switchTrackOff}
            />
          </View>
          <View style={styles.dividerList} />
          <View style={[styles.pushRow, !pushPrefs.communityPushEnabled && { opacity: 0.4 }]}>
            <View style={styles.pushBody}>
              <Text style={[styles.pushLabel, { color: theme.text }]}>Circles</Text>
              <Text style={[styles.pushDesc, { color: theme.textSecondary }]}>
                Circle invitations and responses.
              </Text>
            </View>
            <Switch
              value={pushPrefs.pushCircleEnabled}
              onValueChange={(v) => togglePushPref('pushCircleEnabled', v)}
              disabled={loadingPushPrefs || !pushPrefs.communityPushEnabled}
              trackColor={{ false: switchTrackOff, true: switchTrackOn }}
              thumbColor={switchThumb}
              ios_backgroundColor={switchTrackOff}
            />
          </View>
          <View style={styles.dividerList} />
          <View style={[styles.pushRow, !pushPrefs.communityPushEnabled && { opacity: 0.4 }]}>
            <View style={styles.pushBody}>
              <Text style={[styles.pushLabel, { color: theme.text }]}>Shared tasks</Text>
              <Text style={[styles.pushDesc, { color: theme.textSecondary }]}>
                When tasks are shared with you or someone updates one.
              </Text>
            </View>
            <Switch
              value={pushPrefs.pushSharedTaskEnabled}
              onValueChange={(v) => togglePushPref('pushSharedTaskEnabled', v)}
              disabled={loadingPushPrefs || !pushPrefs.communityPushEnabled}
              trackColor={{ false: switchTrackOff, true: switchTrackOn }}
              thumbColor={switchThumb}
              ios_backgroundColor={switchTrackOff}
            />
          </View>
        </View>

        <Text style={styles.footerNote}>
          These settings only affect the Community tab. For global app preferences like themes and notifications, visit the main Settings.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: 56 },
  headerRow: {
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backText: { fontSize: 17, fontWeight: '500', marginLeft: -4 },
  titleWrap: {
    marginHorizontal: PAD,
    marginBottom: 24,
  },
  largeTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 4,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: PAD,
    marginBottom: 8,
    marginTop: 24,
    letterSpacing: 0.5,
  },
  cardGroup: {
    marginHorizontal: PAD,
    borderRadius: RADIUS,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(150,150,150,0.2)',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  privacyEmoji: { fontSize: 24, marginRight: 12 },
  privacyBody: { flex: 1 },
  privacyLabel: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  privacyDesc: { fontSize: 13, fontWeight: '400' },
  circleVisibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  circleVisibilityEmoji: {
    fontSize: 20,
    marginRight: 10,
  },
  circleVisibilityBody: { flex: 1 },
  circleVisibilityLabel: { fontSize: 14, fontWeight: '600' },
  circleVisibilityDesc: { fontSize: 12, marginTop: 2 },

  dividerList: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(150,150,150,0.2)',
    marginLeft: 16,
  },
  pushRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  pushBody: { flex: 1 },
  pushLabel: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  pushDesc: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  footerNote: {
    marginHorizontal: PAD,
    marginTop: 32,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    opacity: 0.6,
  },
  cardValue: { fontSize: 14, fontWeight: '400' },
});
