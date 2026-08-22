import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/src/lib/supabase';
import { ensureImageLibraryAccessForPicker } from '@/src/lib/imageLibraryPickerGate';
import {
  SHARE_COOLDOWN_DAYS,
  SHARE_MAX_PENDING,
  SHARE_MESSAGE,
  SHARE_MIN_POST_AGE_HOURS,
  SHARE_PLATFORMS,
  SHARE_TIERS,
  submitErrorCopy,
  type SocialSharePlatform,
} from '@/src/lib/socialShareRewards';
import {
  listMyShareClaims,
  submitShareClaim,
  uploadShareProof,
  SocialShareSubmitError,
  type SocialShareClaim,
} from '@/src/lib/socialShareApi';

const PLATFORM_LABEL: Record<SocialSharePlatform, string> = Object.fromEntries(
  SHARE_PLATFORMS.map((p) => [p.id, p.label]),
) as Record<SocialSharePlatform, string>;

export default function FreePremiumScreen() {
  const { user, setUser } = useApp();
  const theme = useTheme();

  const [platform, setPlatform] = useState<SocialSharePlatform>('threads');
  const [postUrl, setPostUrl] = useState('');
  const [likes, setLikes] = useState('');
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const [screenshotExt, setScreenshotExt] = useState('jpeg');
  const [busy, setBusy] = useState(false);
  const [claims, setClaims] = useState<SocialShareClaim[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(true);

  const selectedPlatform = useMemo(
    () => SHARE_PLATFORMS.find((p) => p.id === platform) ?? SHARE_PLATFORMS[0],
    [platform],
  );

  const canSubmit =
    postUrl.trim().length > 0 && likes.trim().length > 0 && !!screenshotBase64 && !busy;

  const refresh = useCallback(async () => {
    try {
      const rows = await listMyShareClaims();
      setClaims(rows);
    } catch {
      // Non-fatal: keep whatever list we already have.
    } finally {
      setClaimsLoading(false);
    }
    // An approved claim flips profiles.subscription_plan server-side; the app
    // only re-reads it on RevenueCat events, so refresh explicitly here.
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('subscription_plan')
        .eq('id', uid)
        .maybeSingle();
      if (error) return;
      const plan =
        data?.subscription_plan === 'pro' ? 'pro' : data?.subscription_plan === 'plus' ? 'plus' : 'free';
      setUser((prev) => (prev.subscriptionPlan === plan ? prev : { ...prev, subscriptionPlan: plan }));
    } catch {
      // Non-fatal.
    }
  }, [setUser]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function onShareNow() {
    try {
      await Share.share({ message: SHARE_MESSAGE });
    } catch {
      // User dismissed the sheet.
    }
  }

  async function pickScreenshot() {
    const allowed = await ensureImageLibraryAccessForPicker();
    if (!allowed) {
      Alert.alert('Permission needed', 'Allow photo access to attach your screenshot.');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const sizeEst = asset.base64 ? (asset.base64.length * 3) / 4 : 0;
        if (sizeEst > 5 * 1024 * 1024) {
          Alert.alert('Too large', 'The screenshot must be under 5MB.');
          return;
        }
        setScreenshotBase64(asset.base64 || null);
        setScreenshotUri(asset.uri);
        const extMatch = asset.uri.match(/\.([^.]+)$/);
        setScreenshotExt(extMatch ? extMatch[1].toLowerCase() : 'jpeg');
      }
    } catch {
      // Picker dismissed or failed; leave the form as-is.
    }
  }

  async function onSubmit() {
    if (!canSubmit || !screenshotBase64) return;
    const claimedLikes = Number.parseInt(likes.trim(), 10);
    if (!Number.isFinite(claimedLikes) || claimedLikes < 0) {
      Alert.alert('Check the likes', 'Enter the number of likes your post has right now.');
      return;
    }
    setBusy(true);
    try {
      const screenshotPath = await uploadShareProof(screenshotBase64, screenshotExt);
      await submitShareClaim({ platform, postUrl, claimedLikes, screenshotPath });
      setPostUrl('');
      setLikes('');
      setScreenshotBase64(null);
      setScreenshotUri(null);
      Alert.alert(
        'Claim sent 🎉',
        'We check the live post and count the likes ourselves — you’ll get a notification either way, usually within 2–3 days.',
      );
      void refresh();
    } catch (e) {
      const copy =
        e instanceof SocialShareSubmitError
          ? submitErrorCopy(e.code)
          : 'Could not submit your claim. Please check your connection and try again.';
      Alert.alert('Not submitted', copy);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}>
            <Feather name="chevron-left" size={28} color={theme.text} />
          </Pressable>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: theme.text }]}>Get Plus for free</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Post about Rencana on social media. The more likes your post earns, the more free Plus days you get.
          </Text>

          {user.subscriptionPlan !== 'free' ? (
            <View style={[styles.planBanner, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <Feather name="zap" size={16} color={theme.primary} />
              <Text style={[styles.planBannerText, { color: theme.text }]}>
                {`You’re on ${String(user.subscriptionPlan).toUpperCase()} right now.`}
              </Text>
            </View>
          ) : null}

          {/* Tier ladder */}
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Reward ladder</Text>
            {SHARE_TIERS.map((tier) => (
              <View key={tier.likes} style={styles.tierRow}>
                <View style={styles.tierLikes}>
                  <Feather name="heart" size={14} color={theme.primary} />
                  <Text style={[styles.tierLikesText, { color: theme.text }]}>
                    {tier.likes.toLocaleString()}+ likes
                  </Text>
                </View>
                <Text style={[styles.tierDays, { color: theme.primary }]}>+{tier.days} days Plus</Text>
              </View>
            ))}
            <View style={[styles.rules, { borderTopColor: theme.cardBorder }]}>
              {[
                'Your post must be public and mention Rencana.',
                `Wait at least ${SHARE_MIN_POST_AGE_HOURS} hours after posting so likes settle.`,
                `One claim per platform every ${SHARE_COOLDOWN_DAYS} days (max ${SHARE_MAX_PENDING} in review).`,
                'The screenshot must show your post and its like count.',
              ].map((rule) => (
                <View key={rule} style={styles.ruleRow}>
                  <Feather name="check" size={13} color={theme.textSecondary} style={{ marginTop: 3 }} />
                  <Text style={[styles.ruleText, { color: theme.textSecondary }]}>{rule}</Text>
                </View>
              ))}
            </View>
          </View>

          <Pressable
            onPress={() => void onShareNow()}
            style={({ pressed }) => [styles.shareBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.8 }]}
          >
            <Feather name="share-2" size={16} color="#fff" />
            <Text style={styles.shareBtnText}>Share Rencana now</Text>
          </Pressable>

          {/* Submission form */}
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Claim your reward</Text>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>PLATFORM</Text>
            <View style={styles.platformRow}>
              {SHARE_PLATFORMS.map((p) => {
                const active = platform === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setPlatform(p.id)}
                    style={[
                      styles.platformChip,
                      {
                        backgroundColor: active ? theme.primary : theme.backgroundSecondary,
                        borderColor: active ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <Text style={[styles.platformChipText, { color: active ? '#fff' : theme.textSecondary }]}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>LINK TO YOUR POST</Text>
            <TextInput
              value={postUrl}
              onChangeText={setPostUrl}
              placeholder={selectedPlatform.urlPlaceholder}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
            />

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>LIKES RIGHT NOW</Text>
            <TextInput
              value={likes}
              onChangeText={(t) => setLikes(t.replace(/[^0-9]/g, ''))}
              placeholder="e.g. 120"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
            />

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>SCREENSHOT PROOF</Text>
            {screenshotUri ? (
              <View style={styles.screenshotWrap}>
                <Image source={{ uri: screenshotUri }} style={styles.screenshot} resizeMode="cover" />
                <Pressable
                  onPress={() => {
                    setScreenshotBase64(null);
                    setScreenshotUri(null);
                  }}
                  style={[styles.screenshotRemove, { backgroundColor: theme.background }]}
                >
                  <Feather name="x" size={14} color={theme.text} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => void pickScreenshot()}
                style={[styles.pickBtn, { borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
              >
                <Feather name="image" size={16} color={theme.textSecondary} />
                <Text style={[styles.pickBtnText, { color: theme.textSecondary }]}>
                  Attach a screenshot of your post
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => void onSubmit()}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.submitBtn,
                { backgroundColor: canSubmit ? theme.primary : theme.backgroundSecondary },
                pressed && canSubmit && { opacity: 0.8 },
              ]}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.submitBtnText, { color: canSubmit ? '#fff' : theme.textSecondary }]}>
                  Submit claim
                </Text>
              )}
            </Pressable>
          </View>

          {/* Claims list */}
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>YOUR CLAIMS</Text>
          {claimsLoading ? (
            <ActivityIndicator color={theme.primary} style={{ marginTop: 12 }} />
          ) : claims.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No claims yet. Share a post and claim your first reward.
            </Text>
          ) : (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, paddingVertical: 4 }]}>
              {claims.map((claim, idx) => (
                <View
                  key={claim.id}
                  style={[styles.claimRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.cardBorder }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.claimPlatform, { color: theme.text }]}>
                      {PLATFORM_LABEL[claim.platform] ?? claim.platform}
                    </Text>
                    <Text style={[styles.claimDate, { color: theme.textSecondary }]}>
                      {new Date(claim.created_at).toLocaleDateString()}
                    </Text>
                    {claim.status === 'rejected' && claim.review_note ? (
                      <Text style={[styles.claimNote, { color: theme.textSecondary }]}>{claim.review_note}</Text>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor:
                          claim.status === 'approved'
                            ? '#10b98122'
                            : claim.status === 'rejected'
                              ? '#ef444422'
                              : '#f59e0b22',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        {
                          color:
                            claim.status === 'approved'
                              ? '#059669'
                              : claim.status === 'rejected'
                                ? '#dc2626'
                                : '#d97706',
                        },
                      ]}
                    >
                      {claim.status === 'approved'
                        ? `+${claim.awarded_days ?? 0} days`
                        : claim.status === 'rejected'
                          ? 'Not approved'
                          : 'In review'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  iconBtn: { padding: 8 },
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginTop: 8 },
  subtitle: { marginTop: 10, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  planBannerText: { fontSize: 13, fontWeight: '700' },
  card: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  tierLikes: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tierLikesText: { fontSize: 14, fontWeight: '700' },
  tierDays: { fontSize: 14, fontWeight: '800' },
  rules: { marginTop: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  ruleRow: { flexDirection: 'row', gap: 8 },
  ruleText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 14,
  },
  shareBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  fieldLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  platformChip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  platformChipText: { fontSize: 13, fontWeight: '700' },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  screenshotWrap: { position: 'relative', alignSelf: 'flex-start' },
  screenshot: { width: 120, height: 160, borderRadius: 12 },
  screenshotRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: 18,
  },
  pickBtnText: { fontSize: 13, fontWeight: '700' },
  submitBtn: {
    marginTop: 18,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { fontSize: 15, fontWeight: '800' },
  sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginTop: 24 },
  emptyText: { marginTop: 12, fontSize: 13, fontWeight: '600' },
  claimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  claimPlatform: { fontSize: 14, fontWeight: '700' },
  claimDate: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  claimNote: { fontSize: 12, fontWeight: '600', marginTop: 4, fontStyle: 'italic' },
  statusPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { fontSize: 12, fontWeight: '800' },
});
