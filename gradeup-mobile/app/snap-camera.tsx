import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Image,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { maxSnapsPerDay, isAtLeastPlus } from '@/src/lib/flashcardGenerationLimits';
import { uploadSnapImage, postSnap, getMySnapsToday, getMyStreak } from '@/src/lib/snapApi';
import type { SnapStreak } from '@/src/types';

export default function SnapCamera() {
  const { user } = useApp();
  const theme = useTheme();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [snapsToday, setSnapsToday] = useState(0);
  const [streak, setStreak] = useState<SnapStreak | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLaunchedCamera = useRef(false);

  const plan = user.subscriptionPlan;
  const maxSnaps = maxSnapsPerDay(plan);
  const atLimit = snapsToday >= maxSnaps;
  const snapsLeft = maxSnaps === Infinity ? null : maxSnaps - snapsToday;

  useEffect(() => {
    (async () => {
      const [count, myStreak] = await Promise.all([
        getMySnapsToday(user.id!),
        getMyStreak(user.id!),
      ]);
      setSnapsToday(count);
      setStreak(myStreak);
      setLoading(false);
    })();
  }, [user.id]);

  useEffect(() => {
    if (!loading && !atLimit && !photoUri && !hasLaunchedCamera.current) {
      hasLaunchedCamera.current = true;
      // Small delay for smooth transition
      setTimeout(() => {
        handleOpenCamera();
      }, 300);
    }
  }, [loading, atLimit, photoUri]);

  const handleOpenCamera = async () => {
    if (atLimit) {
      Alert.alert(
        'Daily limit reached',
        plan === 'free'
          ? 'Free users get 1 snap per day. Upgrade to Plus for 3, or Pro for unlimited.'
          : `You've posted all ${maxSnaps} snaps for today. ${plan === 'plus' ? 'Upgrade to Pro for unlimited!' : 'Come back tomorrow!'}`,
        plan !== 'pro'
          ? [
              { text: 'Not now', style: 'cancel' },
              { text: 'Upgrade', onPress: () => router.push('/subscription-plans' as any) },
            ]
          : [{ text: 'OK' }],
      );
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to post a snap.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    } else {
      router.back();
    }
  };

  const handlePost = async () => {
    if (!photoUri || posting) return;
    setPosting(true);
    try {
      const imageUrl = await uploadSnapImage(photoUri);
      await postSnap(user.id!, imageUrl);

      const updatedStreak = await getMyStreak(user.id!);
      const streakGrew = updatedStreak.currentStreak > (streak?.currentStreak || 0);

      Alert.alert(
        streakGrew && updatedStreak.currentStreak > 1
          ? `🔥 ${updatedStreak.currentStreak}-day streak!`
          : '📸 Snap posted!',
        streakGrew && updatedStreak.currentStreak > 1
          ? 'Your snap is live on the map. Keep it up!'
          : 'Your moment is now live on the map for 24 hours.',
      );
      router.back();
    } catch (e: any) {
      console.error('[SnapCamera] post error:', e);
      Alert.alert('Upload failed', 'Something went wrong. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const handleRetake = () => {
    setPhotoUri(null);
    setTimeout(() => {
      handleOpenCamera();
    }, 100);
  };

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  // ─── Photo preview state ───────────────────────────────────────────────────
  if (photoUri) {
    return (
      <View style={[s.container, { backgroundColor: '#000' }]}>
        {/* Full-bleed preview */}
        <Image source={{ uri: photoUri }} style={s.previewImage} resizeMode="cover" />

        {/* Top bar */}
        <View style={s.previewTopBar}>
          <Pressable onPress={handleRetake} style={s.previewTopBtn}>
            <Feather name="refresh-cw" size={20} color="#fff" />
          </Pressable>
          <View style={s.previewTitle}>
            <Text style={s.previewTitleText}>Snap Streak</Text>
          </View>
          {/* Placeholder to balance the row */}
          <View style={{ width: 40 }} />
        </View>

        {/* Bottom bar */}
        <View style={s.previewBottom}>
          {/* Post button */}
          <Pressable
            style={({ pressed }) => [
              s.postBtn,
              posting && { opacity: 0.55 },
              pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
            ]}
            onPress={handlePost}
            disabled={posting}
          >
            {posting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="send" size={18} color="#fff" />
                <Text style={s.postBtnText}>Share to Map</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Prompt state ──────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Feather name="chevron-left" size={26} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: theme.text }]}>Snap Streak</Text>
        </View>
        {/* Snaps remaining pill */}
        {!atLimit && snapsLeft !== null && (
          <View style={[s.snapsPill, { backgroundColor: theme.primary + '14' }]}>
            <Text style={[s.snapsPillText, { color: theme.primary }]}>
              {snapsLeft} left today
            </Text>
          </View>
        )}
        {streak && streak.currentStreak > 0 && (
          <View style={[s.streakPill, { backgroundColor: '#FF6B0015' }]}>
            <Text style={s.streakPillIcon}>🔥</Text>
            <Text style={[s.streakPillCount, { color: '#FF6B00' }]}>{streak.currentStreak}</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero CTA */}
        <View style={s.hero}>
          {atLimit ? (
            // Limit reached state
            <View style={[s.heroLimitCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={s.heroLimitEmoji}>😴</Text>
              <Text style={[s.heroLimitTitle, { color: theme.text }]}>
                All snaps used for today
              </Text>
              <Text style={[s.heroLimitSub, { color: theme.textSecondary }]}>
                {plan === 'free'
                  ? 'Free plan includes 1 snap/day. Upgrade to Plus for 3 or Pro for unlimited.'
                  : `Plus plan includes ${maxSnaps} snaps/day. Upgrade to Pro for unlimited.`}
              </Text>
              {plan !== 'pro' && (
                <Pressable
                  style={[s.upgradeBtn, { backgroundColor: theme.primary }]}
                  onPress={() => router.push('/subscription-plans' as any)}
                >
                  <Feather name="zap" size={15} color="#fff" />
                  <Text style={s.upgradeBtnText}>Upgrade plan</Text>
                </Pressable>
              )}
            </View>
          ) : (
            // While camera is opening, show a subtle loading state
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 62 : 40,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  backBtn: { marginLeft: -4 },
  headerTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  snapsPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  snapsPillText: { fontSize: 12, fontWeight: '700' },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
  },
  streakPillIcon: { fontSize: 13 },
  streakPillCount: { fontSize: 13, fontWeight: '800' },

  // Scroll
  scrollContent: { padding: 20, gap: 14, paddingBottom: 48 },

  // Hero section
  hero: { gap: 16 },

  // Limit reached card
  heroLimitCard: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
  },
  heroLimitEmoji: { fontSize: 40 },
  heroLimitTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  heroLimitSub: { fontSize: 14, lineHeight: 20, textAlign: 'center', fontWeight: '500' },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 4,
  },
  upgradeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ─── Preview ───────────────────────────────────────────────────────────────
  previewImage: {
    ...StyleSheet.absoluteFillObject,
  },
  previewTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 38,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  previewTopBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitle: { flex: 1, alignItems: 'center' },
  previewTitleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  previewBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
    gap: 12,
  },
  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#1e293b',
    borderRadius: 18,
    paddingVertical: 17,
  },
  postBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
