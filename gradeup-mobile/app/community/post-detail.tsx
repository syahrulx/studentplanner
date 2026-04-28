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
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import * as eventsApi from '@/src/lib/eventsApi';
import type { CommunityPost, PostType } from '@/src/lib/eventsApi';

const TYPE_BADGE: Record<PostType, { label: string; emoji: string; color: string }> = {
  event: { label: 'Event', emoji: '📅', color: '#3b82f6' },
  service: { label: 'Service', emoji: '🔧', color: '#f59e0b' },
  memo: { label: 'Memo', emoji: '📋', color: '#8b5cf6' },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PostDetailScreen() {
  const theme = useTheme();
  const { user } = useApp();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPost = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const data = await eventsApi.fetchPost(postId);
      setPost(data);
    } catch (e) {
      console.error('[PostDetail] fetchPost error:', e);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  const isAuthor = post?.author_id === user?.id;

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

  const badge = TYPE_BADGE[post.post_type];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Post</Text>
        {isAuthor ? (
          <Pressable onPress={handleDelete} hitSlop={10}>
            <Feather name="trash-2" size={20} color={theme.danger || '#ef4444'} />
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Image */}
        {post.image_url ? (
          <Image source={{ uri: post.image_url }} style={styles.postImage} resizeMode="cover" />
        ) : null}

        {/* Badge + Status */}
        <View style={styles.badgeRow}>
          <View style={[styles.typeBadge, { backgroundColor: badge.color + '18' }]}>
            <Text style={{ fontSize: 13 }}>{badge.emoji}</Text>
            <Text style={[styles.typeBadgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
          {post.pinned && (
            <View style={[styles.typeBadge, { backgroundColor: theme.primary + '15' }]}>
              <Text style={{ fontSize: 11 }}>📌</Text>
              <Text style={[styles.typeBadgeText, { color: theme.primary }]}>Pinned</Text>
            </View>
          )}
          {post.status === 'closed' && (
            <View style={[styles.typeBadge, { backgroundColor: '#ef444420' }]}>
              <Text style={[styles.typeBadgeText, { color: '#ef4444' }]}>Closed</Text>
            </View>
          )}
        </View>

        {/* Title */}
        <Text style={[styles.postTitle, { color: theme.text }]}>{post.title}</Text>

        {/* Meta */}
        <View style={styles.metaSection}>
          {post.event_date && (
            <View style={styles.metaItem}>
              <Feather name="calendar" size={14} color={theme.primary} />
              <Text style={[styles.metaText, { color: theme.text }]}>
                {post.event_date}{post.event_time ? ` · ${post.event_time}` : ''}
              </Text>
            </View>
          )}
          {post.location && (
            <View style={styles.metaItem}>
              <Feather name="map-pin" size={14} color={theme.primary} />
              <Text style={[styles.metaText, { color: theme.text }]}>{post.location}</Text>
            </View>
          )}
          {post.university_id && (
            <View style={styles.metaItem}>
              <Feather name="book" size={14} color={theme.primary} />
              <Text style={[styles.metaText, { color: theme.text }]}>
                {post.university_id.toUpperCase()}{post.campus ? ` — ${post.campus}` : ''}
              </Text>
            </View>
          )}
          <View style={styles.metaItem}>
            <Feather name="clock" size={14} color={theme.textSecondary} />
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>
              Posted {formatDate(post.created_at)}
            </Text>
          </View>
          {post.expires_at && (
            <View style={styles.metaItem}>
              <Feather name="alert-circle" size={14} color="#f59e0b" />
              <Text style={[styles.metaText, { color: '#f59e0b' }]}>
                Expires {formatDate(post.expires_at)}
              </Text>
            </View>
          )}
        </View>

        {/* Body */}
        {post.body ? (
          <Text style={[styles.postBody, { color: theme.text }]}>{post.body}</Text>
        ) : null}

        {/* Author card */}
        <View style={[styles.authorCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.authorAvatar, { backgroundColor: theme.primary }]}>
            <Text style={styles.authorAvatarText}>
              {(post.author_name || '?')[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.authorName, { color: theme.text }]}>{post.author_name}</Text>
            {post.author_university && (
              <Text style={[styles.authorUni, { color: theme.textSecondary }]}>
                {post.author_university}
              </Text>
            )}
          </View>
        </View>

        {/* Author actions */}
        {isAuthor && post.status === 'active' && (
          <Pressable
            style={({ pressed }) => [
              styles.closeBtn,
              { borderColor: theme.border },
              pressed && { opacity: 0.7 },
            ]}
            onPress={handleClose}
          >
            <Feather name="x-circle" size={16} color={theme.textSecondary} />
            <Text style={[styles.closeBtnText, { color: theme.textSecondary }]}>Close this post</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  content: { paddingBottom: 60 },
  postImage: { width: '100%', height: 240 },
  badgeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 16 },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  typeBadgeText: { fontSize: 12, fontWeight: '700' },
  postTitle: { fontSize: 24, fontWeight: '900', lineHeight: 30, paddingHorizontal: 20, paddingTop: 14 },
  metaSection: { paddingHorizontal: 20, paddingTop: 16, gap: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontSize: 14, fontWeight: '500' },
  postBody: { fontSize: 15, lineHeight: 24, paddingHorizontal: 20, paddingTop: 20 },
  authorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 24,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  authorAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  authorAvatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  authorName: { fontSize: 15, fontWeight: '700' },
  authorUni: { fontSize: 12, marginTop: 2 },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  closeBtnText: { fontSize: 14, fontWeight: '600' },
});
