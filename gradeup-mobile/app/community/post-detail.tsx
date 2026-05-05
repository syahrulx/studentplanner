import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  Share,
  useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import Feather from '@expo/vector-icons/Feather';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import * as eventsApi from '@/src/lib/eventsApi';
import * as communityApi from '@/src/lib/communityApi';
import type { CommunityPost, PostType } from '@/src/lib/eventsApi';

// ─── Image Carousel ──────────────────────────────────────────────────────────

function ImageCarousel({ images }: { images: string[] }) {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = React.useState(0);

  if (!images.length) return null;

  if (images.length === 1) {
    return (
      <Image
        source={{ uri: images[0] }}
        style={{ width, aspectRatio: 1, backgroundColor: '#111' }}
        resizeMode="cover"
      />
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setActiveIndex(idx);
        }}
        scrollEventThrottle={32}
      >
        {images.map((uri, i) => (
          <Image
            key={i}
            source={{ uri }}
            style={{ width, aspectRatio: 1, backgroundColor: '#111' }}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
      {/* Dots */}
      <View style={carouselStyles.dots}>
        {images.map((_, i) => (
          <View
            key={i}
            style={[
              carouselStyles.dot,
              i === activeIndex ? carouselStyles.dotActive : carouselStyles.dotInactive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const carouselStyles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
  },
  dot: { borderRadius: 4 },
  dotActive: { width: 18, height: 6, borderRadius: 3, backgroundColor: '#0A84FF' },
  dotInactive: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(150,150,150,0.4)' },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_META: Record<PostType, { label: string; icon: 'calendar' | 'tool' | 'clipboard'; tint: string }> = {
  event: { label: 'Event', icon: 'calendar', tint: '#3b82f6' },
  service: { label: 'Service', icon: 'tool', tint: '#f59e0b' },
  memo: { label: 'Memo', icon: 'clipboard', tint: '#8b5cf6' },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** Query `id` fallback for deep links. */
function pickIdFromQueryParams(q: Linking.QueryParams | null | undefined): string | undefined {
  if (!q) return undefined;
  const raw = q.id || q.postId;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw[0] != null && String(raw[0]).trim()) return String(raw[0]).trim();
  return undefined;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PostDetailScreen() {
  const theme = useTheme();
  const { user } = useApp();
  const { postId: postIdParam, id: idParam } = useLocalSearchParams<{ postId: string; id: string }>();
  
  // Universal link might come in as ?id=
  const linkingUrl = Linking.useURL();
  const idFromLinking = React.useMemo(() => {
    if (!linkingUrl) return undefined;
    try {
      return pickIdFromQueryParams(Linking.parse(linkingUrl).queryParams);
    } catch {
      return undefined;
    }
  }, [linkingUrl]);

  const postId = postIdParam || idParam || idFromLinking;

  const [post, setPost] = useState<CommunityPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  const loadPost = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const data = await eventsApi.fetchPost(postId);
      setPost(data);
      setLikeCount(data?.like_count ?? 0);
      // Check if user has liked this post
      if (data) {
        const liked = await eventsApi.getMyLikes([data.id]);
        setIsLiked(liked.has(data.id));
      }
    } catch (e) {
      console.error('[PostDetail] fetchPost error:', e);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => { loadPost(); }, [loadPost]);

  const isAuthor = post?.author_id === user?.id;

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleLike = () => {
    const willLike = !isLiked;
    setIsLiked(willLike);
    setLikeCount((c) => Math.max(0, c + (willLike ? 1 : -1)));
    if (willLike) {
      eventsApi.likePost(post!.id).catch(() => {});
    } else {
      eventsApi.unlikePost(post!.id).catch(() => {});
    }
  };

  const handleShare = async () => {
    if (!post) return;
    const url = eventsApi.generateEventShareLink(post.id);
    const dateStr = post.event_date ? ` · ${formatDate(post.event_date)}` : '';
    const locStr = post.location ? ` · ${post.location}` : '';
    try {
      await Share.share({
        message: `${post.title}${dateStr}${locStr}\n${url}`,
        title: post.title,
      });
    } catch (_) {}
  };

  const handleReport = () => {
    if (!post) return;
    Alert.alert(
      'Report or Block',
      'What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report: Inappropriate',
          onPress: () => {
            eventsApi.reportPost(post.id, 'inappropriate').catch(() => {});
            Alert.alert('Reported', 'Thank you. Our team will review this post.');
          },
        },
        {
          text: 'Report: Spam',
          onPress: () => {
            eventsApi.reportPost(post.id, 'spam').catch(() => {});
            Alert.alert('Reported', 'Thank you for your feedback.');
          },
        },
        {
          text: 'Report: Misleading',
          onPress: () => {
            eventsApi.reportPost(post.id, 'misleading').catch(() => {});
            Alert.alert('Reported', 'Thank you for your feedback.');
          },
        },
        {
          text: 'Block User',
          style: 'destructive',
          onPress: () => {
            if (!user?.id || !post.author_id) return;
            communityApi.blockUserByUserId(user.id, post.author_id).catch(() => {});
            Alert.alert('User Blocked', 'You will no longer see posts or messages from this user.');
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await eventsApi.deletePost(post!.id);
            router.back();
          } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to delete post.');
          }
        },
      },
    ]);
  };

  const handleClose = async () => {
    try {
      await eventsApi.updatePost(post!.id, { status: 'closed' });
      loadPost();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to close post.');
    }
  };

  // ─── Loading / Empty ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary, fontSize: 16 }}>Post not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: theme.primary, fontWeight: '700' }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const meta = TYPE_META[post.post_type];
  const images = post.image_urls?.length ? post.image_urls : post.image_url ? [post.image_url] : [];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ── Top nav bar ── */}
      <View style={[styles.navBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.navBack}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.navTitle, { color: theme.text }]}>Post</Text>
        <View style={styles.navRight}>
          {isAuthor ? (
            <>
              <Pressable
                onPress={() => router.push({ pathname: '/community/create-post', params: { editId: post.id } } as any)}
                hitSlop={10}
              >
                <Feather name="edit-2" size={20} color={theme.primary} />
              </Pressable>
              <Pressable onPress={handleDelete} hitSlop={10} style={{ marginLeft: 16 }}>
                <Feather name="trash-2" size={20} color={theme.danger || '#ef4444'} />
              </Pressable>
            </>
          ) : (
            <Pressable onPress={handleReport} hitSlop={10}>
              <Feather name="more-horizontal" size={22} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Author header ── */}
        <View style={styles.authorHeader}>
          <View style={[styles.authorAvatarWrap, { backgroundColor: meta.tint + '25' }]}>
            {post.author_avatar ? (
              <Image source={{ uri: post.author_avatar }} style={styles.authorAvatarImg} />
            ) : (
              <Text style={[styles.authorAvatarInitial, { color: meta.tint }]}>
                {(post.author_name || '?')[0].toUpperCase()}
              </Text>
            )}
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.authorName, { color: theme.text }]}>{post.author_name || 'Author'}</Text>
            {post.author_university && (
              <Text style={[styles.authorUni, { color: theme.textSecondary }]}>{post.author_university}</Text>
            )}
          </View>
          <View style={[styles.typeBadge, { backgroundColor: meta.tint + '18' }]}>
            <Feather name={meta.icon} size={12} color={meta.tint} />
            <Text style={[styles.typeBadgeText, { color: meta.tint }]}>{meta.label}</Text>
          </View>
        </View>

        {/* ── Image carousel ── */}
        {images.length > 0 ? (
          <ImageCarousel images={images} />
        ) : (
          <View style={[styles.noImagePlaceholder, { backgroundColor: meta.tint + '10' }]}>
            <Feather name={meta.icon} size={48} color={meta.tint + '50'} />
          </View>
        )}

        {/* ── Action bar ── */}
        <View style={styles.actionBar}>
          <Pressable onPress={handleLike} style={styles.actionBtn}>
            <Feather
              name="heart"
              size={26}
              color={isLiked ? '#FF3B30' : theme.textSecondary}
              style={isLiked ? {} : { opacity: 0.5 }}
            />
          </Pressable>
          <Pressable onPress={handleShare} style={styles.actionBtn}>
            <Feather name="send" size={24} color={theme.textSecondary} style={{ opacity: 0.5 }} />
          </Pressable>
          {post.status !== 'active' && (
            <View style={[styles.statusBadge, { backgroundColor: '#ef444420', marginLeft: 'auto' as any }]}>
              <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700' }}>
                {post.status.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* ── Like count ── */}
        {likeCount > 0 && (
          <Text style={[styles.likeCount, { color: theme.text }]}>
            {likeCount.toLocaleString()} {likeCount === 1 ? 'like' : 'likes'}
          </Text>
        )}

        {/* ── Caption / Body ── */}
        <View style={styles.captionBlock}>
          {post.pinned && (
            <View style={[styles.pinnedBadge, { backgroundColor: theme.primary + '15' }]}>
              <Feather name="bookmark" size={12} color={theme.primary} />
              <Text style={[styles.pinnedBadgeText, { color: theme.primary }]}>Pinned</Text>
            </View>
          )}
          <Text style={[styles.postTitle, { color: theme.text }]}>{post.title}</Text>
          {post.body ? (
            <Text style={[styles.postBody, { color: theme.text }]}>{post.body}</Text>
          ) : null}
        </View>

        {/* ── Meta row ── */}
        <View style={[styles.metaCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {post.event_date && (
            <View style={styles.metaItem}>
              <Feather name="calendar" size={15} color={meta.tint} />
              <Text style={[styles.metaText, { color: theme.text }]}>
                {formatDate(post.event_date)}{post.event_time ? ` at ${post.event_time}` : ''}
              </Text>
            </View>
          )}
          {post.location && (
            <View style={styles.metaItem}>
              <Feather name="map-pin" size={15} color={meta.tint} />
              <Text style={[styles.metaText, { color: theme.text }]}>{post.location}</Text>
            </View>
          )}
          {post.university_id && (
            <View style={styles.metaItem}>
              <Feather name="book" size={15} color={meta.tint} />
              <Text style={[styles.metaText, { color: theme.text }]}>
                {post.university_id.toUpperCase()}{post.campus ? ` — ${post.campus}` : ''}
              </Text>
            </View>
          )}
          <View style={styles.metaItem}>
            <Feather name="clock" size={15} color={theme.textSecondary} />
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>
              Posted {formatDate(post.created_at)}
            </Text>
          </View>
          {post.expires_at && (
            <View style={styles.metaItem}>
              <Feather name="alert-circle" size={15} color="#f59e0b" />
              <Text style={[styles.metaText, { color: '#f59e0b' }]}>
                Expires {formatDate(post.expires_at)}
              </Text>
            </View>
          )}
        </View>

        {/* ── Author actions (owner only) ── */}
        {isAuthor && post.status === 'active' && (
          <View style={styles.ownerActions}>
            <Pressable
              style={({ pressed }) => [
                styles.ownerBtn,
                { backgroundColor: theme.primary + '12', borderColor: theme.primary + '30' },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => router.push({ pathname: '/community/create-post', params: { editId: post.id } } as any)}
            >
              <Feather name="edit-2" size={15} color={theme.primary} />
              <Text style={[styles.ownerBtnText, { color: theme.primary }]}>Edit</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.ownerBtn,
                { backgroundColor: '#ef444412', borderColor: '#ef444430' },
                pressed && { opacity: 0.7 },
              ]}
              onPress={handleDelete}
            >
              <Feather name="trash-2" size={15} color="#ef4444" />
              <Text style={[styles.ownerBtnText, { color: '#ef4444' }]}>Delete</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.ownerBtn,
                { borderColor: theme.border },
                pressed && { opacity: 0.7 },
              ]}
              onPress={handleClose}
            >
              <Feather name="x-circle" size={15} color={theme.textSecondary} />
              <Text style={[styles.ownerBtnText, { color: theme.textSecondary }]}>Close</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },

  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBack: { padding: 4 },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  navRight: { flexDirection: 'row', alignItems: 'center' },

  content: { paddingBottom: 80 },

  // Author header
  authorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  authorAvatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorAvatarImg: { width: 42, height: 42, borderRadius: 21 },
  authorAvatarInitial: { fontSize: 17, fontWeight: '800' },
  authorName: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  authorUni: { fontSize: 12, marginTop: 2 },

  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  typeBadgeText: { fontSize: 12, fontWeight: '700' },

  // No-image
  noImagePlaceholder: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 2,
  },
  actionBtn: { padding: 6 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },

  // Like count
  likeCount: {
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 16,
    marginTop: 2,
  },

  // Caption
  captionBlock: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  pinnedBadgeText: { fontSize: 12, fontWeight: '700' },
  postTitle: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  postBody: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    fontWeight: '400',
  },

  // Meta card
  metaCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  metaText: { fontSize: 14, fontWeight: '500', flex: 1 },

  // Owner actions
  ownerActions: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 20,
  },
  ownerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  ownerBtnText: { fontSize: 13, fontWeight: '700' },
});
