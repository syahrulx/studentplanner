import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { isAtLeastPlus, SNAP_VIEW_LIMIT_FREE } from '@/src/lib/flashcardGenerationLimits';
import {
  getSnapById,
  getSnapReactions,
  reactToSnap,
  removeReaction,
  getViewCountToday,
  incrementViewCount,
  deleteSnap,
} from '@/src/lib/snapApi';
import { Avatar } from '@/components/Avatar';
import type { StudySnap, SnapReaction } from '@/src/types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const REACTION_EMOJIS = ['🔥', '💪', '📚', '❤️', '👍', '🎉'];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SnapViewer() {
  const { snapId: snapIdParam } = useLocalSearchParams<{ snapId: string }>();
  const snapId = typeof snapIdParam === 'string' ? snapIdParam : '';

  const { user } = useApp();
  const theme = useTheme();
  const plan = user.subscriptionPlan;
  const canReact = isAtLeastPlus(plan);

  const [snap, setSnap] = useState<StudySnap | null>(null);
  const [reactions, setReactions] = useState<SnapReaction[]>([]);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewBlocked, setViewBlocked] = useState(false);

  const loadSnap = useCallback(async () => {
    if (!snapId) return;

    // Fetch the snap first — don't count a "view" until we know it exists.
    const data = await getSnapById(snapId);

    if (!data) {
      setSnap(null);
      setLoading(false);
      return;
    }

    // Free tier: check view limit AFTER confirming the snap exists, so a
    // failed/expired snap doesn't waste one of the user's limited daily views.
    if (!isAtLeastPlus(plan)) {
      const viewCount = await getViewCountToday();
      if (viewCount >= SNAP_VIEW_LIMIT_FREE) {
        setViewBlocked(true);
        setLoading(false);
        return;
      }
      await incrementViewCount();
    }

    setSnap(data);

    const rx = await getSnapReactions(data.id);
    setReactions(rx);
    const mine = rx.find(r => r.userId === user.id);
    setMyReaction(mine?.emoji || null);

    setLoading(false);
  }, [snapId, plan, user.id]);

  useEffect(() => {
    loadSnap();
  }, [loadSnap]);

  const handleReact = async (emoji: string) => {
    if (!snap || !canReact) {
      Alert.alert(
        'Plus Feature',
        'Reactions are available for Plus and Pro users.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/subscription-plans' as any) },
        ],
      );
      return;
    }

    try {
      if (myReaction === emoji) {
        await removeReaction(snap.id, user.id!);
        setMyReaction(null);
        setReactions(prev => prev.filter(r => r.userId !== user.id));
      } else {
        await reactToSnap(snap.id, user.id!, emoji);
        setMyReaction(emoji);
        setReactions(prev => {
          const filtered = prev.filter(r => r.userId !== user.id);
          return [...filtered, {
            id: 'temp',
            snapId: snap.id,
            userId: user.id!,
            emoji,
            createdAt: new Date().toISOString(),
          }];
        });
      }
    } catch (e) {
      console.warn('[SnapViewer] reaction error:', e);
    }
  };

  const handleDelete = () => {
    if (!snap) return;
    Alert.alert(
      'Delete Snap',
      'Are you sure you want to delete this snap? It will be removed from the map for everyone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await deleteSnap(snap.id);
              router.back();
            } catch (e) {
              console.warn('[SnapViewer] delete error:', e);
              Alert.alert('Error', 'Failed to delete snap. Please try again.');
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: '#000' }]}>
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 100 }} />
      </View>
    );
  }

  // Free user view limit reached
  if (viewBlocked) {
    return (
      <View style={[s.container, { backgroundColor: theme.background }]}>
        <View style={s.blockedContainer}>
          <View style={[s.blockedCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[s.blockedIconWrap, { backgroundColor: theme.primary + '15' }]}>
              <Feather name="lock" size={40} color={theme.primary} />
            </View>
            <Text style={[s.blockedTitle, { color: theme.text }]}>
              Daily Snap Limit Reached
            </Text>
            <Text style={[s.blockedDesc, { color: theme.textSecondary }]}>
              Free users can view up to {SNAP_VIEW_LIMIT_FREE} friend snaps per day. Upgrade to see unlimited snaps!
            </Text>
            <Pressable
              style={({ pressed }) => [
                s.upgradeBtn,
                { backgroundColor: theme.primary },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => router.push('/subscription-plans' as any)}
            >
              <Feather name="zap" size={18} color="#fff" />
              <Text style={s.upgradeBtnText}>Upgrade Now</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
              <Text style={[s.backLink, { color: theme.textSecondary }]}>Go Back</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (!snap) {
    return (
      <View style={[s.container, { backgroundColor: theme.background }]}>
        <View style={s.blockedContainer}>
          <Feather name="image" size={48} color={theme.textSecondary} />
          <Text style={[s.blockedTitle, { color: theme.text, marginTop: 16 }]}>Snap not found</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={[s.backLink, { color: theme.primary }]}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: '#000' }]}>
      {/* Full-screen snap image */}
      <Image source={{ uri: snap.imageUrl }} style={s.fullImage} resizeMode="cover" />

      {/* Top overlay: author info + close */}
      <View style={s.topOverlay}>
        <Pressable onPress={() => router.back()} style={s.closeBtn}>
          <Feather name="chevron-left" size={28} color="#fff" />
        </Pressable>
        <View style={s.authorRow}>
          <Avatar name={snap.authorName} avatarUrl={snap.authorAvatar} size={36} />
          <View>
            <Text style={s.authorName}>{snap.authorName || 'Friend'}</Text>
            <Text style={s.timestamp}>{timeAgo(snap.createdAt)}</Text>
          </View>
        </View>
        {snap.userId === user.id && (
          <Pressable onPress={handleDelete} style={s.deleteBtn} hitSlop={12}>
            <Feather name="trash-2" size={20} color="#ff4444" />
          </Pressable>
        )}
      </View>

      {/* Bottom overlay: caption + reactions */}
      <View style={s.bottomOverlay}>
        {snap.caption ? (
          <Text style={s.captionText}>{snap.caption}</Text>
        ) : null}

        {/* Reaction counts */}
        {reactions.length > 0 && (
          <View style={s.reactionSummary}>
            {Object.entries(
              reactions.reduce<Record<string, number>>((acc, r) => {
                acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                return acc;
              }, {}),
            ).map(([emoji, count]) => (
              <View key={emoji} style={s.reactionPill}>
                <Text style={s.reactionEmoji}>{emoji}</Text>
                <Text style={s.reactionCount}>{count}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Reaction bar */}
        <View style={s.reactionBar}>
          {REACTION_EMOJIS.map(emoji => (
            <Pressable
              key={emoji}
              style={({ pressed }) => [
                s.reactionBtn,
                myReaction === emoji && s.reactionBtnActive,
                !canReact && { opacity: 0.4 },
                pressed && { transform: [{ scale: 0.9 }] },
              ]}
              onPress={() => handleReact(emoji)}
            >
              <Text style={s.reactionBtnEmoji}>{emoji}</Text>
            </Pressable>
          ))}
          {!canReact && (
            <Pressable
              style={s.lockHint}
              onPress={() =>
                Alert.alert(
                  'Plus Feature',
                  'Upgrade to Plus or Pro to react to snaps!',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Upgrade', onPress: () => router.push('/subscription-plans' as any) },
                  ],
                )
              }
            >
              <Feather name="lock" size={14} color="rgba(255,255,255,0.6)" />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  fullImage: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_W,
    height: SCREEN_H,
  },

  // Top overlay
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'transparent',
  },
  closeBtn: { padding: 4 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  authorName: { color: '#fff', fontSize: 16, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  timestamp: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '500', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  deleteBtn: { padding: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20 },

  // Bottom overlay
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 48 : 24,
    paddingHorizontal: 20,
    paddingTop: 30,
    gap: 12,
  },
  captionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  // Reactions
  reactionSummary: { flexDirection: 'row', gap: 6 },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { color: '#fff', fontSize: 12, fontWeight: '700' },

  reactionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reactionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 2,
    borderColor: '#fff',
  },
  reactionBtnEmoji: { fontSize: 20 },
  lockHint: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Blocked state
  blockedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  blockedCard: {
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    gap: 12,
    width: '100%',
    maxWidth: 360,
  },
  blockedIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  blockedTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  blockedDesc: { fontSize: 15, lineHeight: 22, textAlign: 'center', fontWeight: '500' },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    marginTop: 8,
  },
  upgradeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backLink: { fontSize: 15, fontWeight: '600' },
});
