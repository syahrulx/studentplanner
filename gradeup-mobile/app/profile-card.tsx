/**
 * "Your profile card" — pick a banner, and choose what the card says about you.
 *
 * Two separate things on one screen, deliberately kept apart:
 *
 *   - The banner is decoration, and the paid part. Locked ones are shown, not
 *     hidden: a student cannot want something they have never seen.
 *   - What the card shows is privacy, and is free for everyone. Charging to
 *     hide your own campus would be charging for a setting, not a feature.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import * as communityApi from '@/src/lib/communityApi';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradePrompt } from '@/hooks/useUpgradePrompt';
import { supabase } from '@/src/lib/supabase';
import { captureError } from '@/src/lib/monitoring';
import { Avatar } from '@/components/Avatar';
import { ProfileBannerView } from '@/components/ProfileBannerView';
import { FriendPeek, type FriendPeekPerson } from '@/components/FriendPeek';
import {
  PROFILE_BANNERS,
  PROFILE_BANNER_COLORS,
  PROFILE_BANNER_DESIGNS,
  PROFILE_CARD_FIELDS,
  canUseProfileBanner,
  isFieldVisible,
  type ProfileCardField,
} from '@/src/lib/profileBanners';

export default function ProfileCardScreen() {
  const { user } = useApp();
  const { myActivity } = useCommunity();
  const theme = useTheme();
  const { promptUpgrade } = useUpgradePrompt();
  const plan = user.subscriptionPlan;

  const [banner, setBanner] = useState<string>('theme');
  const [hidden, setHidden] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<FriendPeekPerson | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user.id) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('profile_banner, profile_hidden_fields')
        .eq('id', user.id)
        .maybeSingle();
      if (!alive) return;
      if (error) captureError(error, { where: 'profileCard.load' });
      const id = (data as any)?.profile_banner;
      if (id && PROFILE_BANNERS[id]) setBanner(id);
      setHidden(((data as any)?.profile_hidden_fields as string[] | null) ?? []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [user.id]);

  /**
   * Saves the whole card in one write.
   *
   * It takes the values as arguments rather than reading state, because a
   * toggle calls this in the same tick it sets state — reading state here
   * would save the value the switch had a moment ago, and the card would be
   * one tap behind for ever.
   */
  const save = async (nextBanner: string, nextHidden: string[]) => {
    if (!user.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        profile_banner: nextBanner === 'theme' ? null : nextBanner,
        profile_hidden_fields: nextHidden.length > 0 ? nextHidden : null,
      })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      captureError(error, { where: 'profileCard.save' });
      Alert.alert('Not saved', 'Your card could not be saved. Check your connection and try again.');
    }
  };

  const pickBanner = (id: string) => {
    if (!canUseProfileBanner(id, plan)) {
      const b = PROFILE_BANNERS[id];
      promptUpgrade({
        plan: b.tier === 'pro' ? 'pro' : 'plus',
        feature: `The ${b.name} banner`,
        detail:
          b.tier === 'pro'
            ? 'Pro designs move — petals, drifting light, a scrolling grid.'
            : 'Pick any colour from the palette for the strip behind your picture.',
        fallbackTitle: b.tier === 'pro' ? 'Pro design' : 'Plus design',
      });
      return;
    }
    setBanner(id);
    void save(id, hidden);
  };

  const toggleField = (key: ProfileCardField) => {
    const next = hidden.includes(key) ? hidden.filter((f) => f !== key) : [...hidden, key];
    setHidden(next);
    void save(banner, next);
  };

  const me: FriendPeekPerson = useMemo(
    () => ({
      id: user.id || 'me',
      name: user.name || 'You',
      avatar_url: user.avatar,
      university: (user as any).university,
      campus: (user as any).campus,
      faculty: (user as any).faculty,
      // The app saves a student's programme as profiles.program. profiles.course
      // is a legacy column nothing has written for years, which is why this row
      // was blank on every card.
      course: (user as any).program || (user as any).course,
      activityText:
        myActivity && myActivity.activity_type !== 'idle'
          ? myActivity.custom_status_text
            || communityApi.ACTIVITY_TYPES.find((a) => a.type === myActivity.activity_type)?.label
          : undefined,
      activityIcon:
        myActivity && myActivity.activity_type !== 'idle'
          ? (communityApi.getActivityFeatherIcon(myActivity.activity_type) as any)
          : undefined,
      songText: myActivity?.is_playing ? myActivity.song_name ?? undefined : undefined,
      profile_banner: banner,
      profile_hidden_fields: hidden,
      plan,
    }),
    [user, myActivity, banner, hidden, plan],
  );

  if (loading) {
    return (
      <View style={[s.container, s.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <View style={s.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            s.backBtn,
            { backgroundColor: theme.card, borderColor: theme.border },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Back"
        >
          <Feather name="chevron-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[s.title, { color: theme.text }]}>Your profile card</Text>
        {saving ? <ActivityIndicator color={theme.primary} /> : <View style={{ width: 44 }} />}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[s.intro, { color: theme.textSecondary }]}>
          This is what other students see when they tap your name or your picture.
        </Text>

        {/* The live card, not a drawing of one — it is the same component the
            rest of the app shows, so what you see here cannot drift from what
            anyone else gets. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Preview your card"
          onPress={() => setPreview(me)}
          style={({ pressed }) => [
            s.previewCard,
            { backgroundColor: theme.card, borderColor: theme.border },
            pressed && { opacity: 0.85 },
          ]}
        >
          <ProfileBannerView
            banner={PROFILE_BANNERS[banner]}
            themeColor={theme.primary}
            height={72}
          />
          <View style={s.previewBody}>
            <View style={[s.previewAvatar, { borderColor: theme.card, backgroundColor: theme.card }]}>
              <Avatar name={user.name} avatarUrl={user.avatar} size={56} />
            </View>
            <Text style={[s.previewName, { color: theme.text }]} numberOfLines={1}>
              {user.name}
            </Text>
            <Text style={[s.previewHint, { color: theme.textSecondary }]}>
              {PROFILE_CARD_FIELDS.filter((f) => isFieldVisible(f.key, hidden))
                .map((f) => f.label)
                .join(' · ') || 'Nothing shown'}
            </Text>
            <Text style={[s.previewTap, { color: theme.primary }]}>Tap to see it full size</Text>
          </View>
        </Pressable>

        {/* Colours are swatches, designs are tiles. A flat colour needs
            nothing bigger than a circle to be judged, and eleven full-width
            tiles would have buried the four designs that are actually worth
            looking at. */}
        <View style={s.sectionRow}>
          <Text style={[s.section, { color: theme.textSecondary }]}>COLOUR</Text>
          <Text style={[s.sectionTier, { color: theme.primary }]}>Plus</Text>
        </View>
        <View style={s.swatchRow}>
          {PROFILE_BANNER_COLORS.map((id) => {
            const b = PROFILE_BANNERS[id];
            const locked = !canUseProfileBanner(id, plan);
            const selected = banner === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={locked ? `${b.name}, locked` : b.name}
                onPress={() => pickBanner(id)}
                style={({ pressed }) => [pressed && { opacity: 0.75 }]}
              >
                <View
                  style={[
                    s.swatch,
                    {
                      backgroundColor: b.color ?? theme.primary,
                      borderColor: selected ? theme.primary : 'transparent',
                    },
                  ]}
                >
                  {locked && <Feather name="lock" size={13} color="rgba(255,255,255,0.95)" />}
                  {selected && !locked && <Feather name="check" size={16} color="#fff" />}
                </View>
                <Text style={[s.swatchName, { color: theme.textSecondary }]} numberOfLines={1}>
                  {/* "Theme colour" does not fit under a 46pt circle, and an
                      ellipsis on the one free option is a poor advert for it. */}
                  {id === 'theme' ? 'Theme' : b.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={s.sectionRow}>
          <Text style={[s.section, { color: theme.textSecondary }]}>DESIGN</Text>
          <Text style={[s.sectionTier, { color: theme.primary }]}>Pro</Text>
        </View>
        <View style={s.bannerGrid}>
          {PROFILE_BANNER_DESIGNS.map((id) => {
            const b = PROFILE_BANNERS[id];
            const locked = !canUseProfileBanner(id, plan);
            const selected = banner === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={locked ? `${b.name}, locked` : b.name}
                onPress={() => pickBanner(id)}
                style={({ pressed }) => [
                  s.bannerTile,
                  { borderColor: selected ? theme.primary : theme.border },
                  selected && { borderWidth: 2.5 },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <ProfileBannerView banner={b} themeColor={theme.primary} height={62} />
                {locked && (
                  <View style={s.lockVeil}>
                    <Feather name="lock" size={16} color="#fff" />
                  </View>
                )}
                <View style={[s.bannerLabel, { backgroundColor: theme.card }]}>
                  <Text style={[s.bannerName, { color: theme.text }]} numberOfLines={1}>
                    {b.name}
                  </Text>
                  {selected && <Feather name="check" size={15} color={theme.primary} />}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={s.sectionRow}>
          <Text style={[s.section, { color: theme.textSecondary }]}>WHAT YOUR CARD SHOWS</Text>
        </View>
        <View style={[s.cardGroup, { backgroundColor: theme.card }]}>
          {PROFILE_CARD_FIELDS.map((f, i) => (
            <View
              key={f.key}
              style={[
                s.fieldRow,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
              ]}
            >
              <Text style={[s.fieldLabel, { color: theme.text }]}>{f.label}</Text>
              <Switch
                value={isFieldVisible(f.key, hidden)}
                onValueChange={() => toggleField(f.key)}
                trackColor={{ true: theme.primary }}
                accessibilityLabel={`Show ${f.label} on your card`}
              />
            </View>
          ))}
        </View>
        <Text style={[s.footnote, { color: theme.textSecondary }]}>
          Turning one off hides the row completely — nobody is shown a blank line where it was.
          Your name and picture always show.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>

      <FriendPeek person={preview} onClose={() => setPreview(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 58,
    paddingBottom: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800' },
  scroll: { paddingHorizontal: 16 },
  intro: { fontSize: 13, fontWeight: '600', lineHeight: 19, marginBottom: 14 },

  previewCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  previewBody: { paddingHorizontal: 16, paddingBottom: 14 },
  previewAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -32,
    marginBottom: 8,
  },
  previewName: { fontSize: 17, fontWeight: '800' },
  previewHint: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  previewTap: { fontSize: 12, fontWeight: '700', marginTop: 8 },

  section: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    marginBottom: 10,
  },
  sectionTier: { fontSize: 11, fontWeight: '800' },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchName: { fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 4, width: 46 },
  bannerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bannerTile: {
    width: '48%',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  lockVeil: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 62,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 6,
  },
  bannerName: { fontSize: 13, fontWeight: '700', flex: 1 },

  cardGroup: { borderRadius: 16, overflow: 'hidden' },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fieldLabel: { fontSize: 15, fontWeight: '600' },
  footnote: { fontSize: 12, fontWeight: '600', lineHeight: 18, marginTop: 10 },
});
