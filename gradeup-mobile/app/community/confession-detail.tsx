import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import * as confessionsApi from '@/src/lib/confessionsApi';
import type { Confession, ConfessionComment } from '@/src/lib/confessionsApi';

const MAX_COMMENT = 300;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function ConfessionDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language } = useApp();
  const T = useTranslations(language);
  const { confessionId } = useLocalSearchParams<{ confessionId: string }>();

  const [confession, setConfession] = useState<Confession | null>(null);
  const [comments, setComments] = useState<ConfessionComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentDraft, setCommentDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    if (!confessionId) return;
    try {
      const [conf, comms] = await Promise.all([
        confessionsApi.fetchConfession(confessionId),
        confessionsApi.fetchConfessionComments(confessionId),
      ]);
      setConfession(conf);
      setComments(comms);
    } catch (e) {
      if (__DEV__) console.warn('[ConfessionDetail] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [confessionId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadAll();
    }, [loadAll]),
  );

  const handleToggleLike = async () => {
    if (!confession) return;
    const wasLiked = confession.liked_by_me;
    const delta = wasLiked ? -1 : 1;
    setConfession({
      ...confession,
      liked_by_me: !wasLiked,
      like_count: Math.max(0, confession.like_count + delta),
    });
    try {
      await confessionsApi.toggleConfessionLike(confession.id);
    } catch {
      setConfession({
        ...confession,
        liked_by_me: wasLiked,
        like_count: Math.max(0, confession.like_count - delta),
      });
    }
  };

  const handleReportConfession = () => {
    if (!confession) return;
    Alert.alert(T('confessionReportTitle'), T('confessionReportPrompt'), [
      {
        text: T('confessionReportInappropriate'),
        onPress: () => {
          void confessionsApi.reportConfession(confession.id, 'inappropriate').then(() => {
            Alert.alert(T('confessionReportedTitle'), T('confessionReportedBody'));
            router.back();
          }).catch(() => {});
        },
      },
      { text: T('cancel'), style: 'cancel' },
    ]);
  };

  const handleDeleteConfession = () => {
    if (!confession) return;
    Alert.alert(T('confessionDeleteTitle'), T('confessionDeleteBody'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('delete'),
        style: 'destructive',
        onPress: () => {
          void confessionsApi.deleteConfession(confession.id).then(() => router.back()).catch((e: Error) => {
            Alert.alert(T('error'), e.message);
          });
        },
      },
    ]);
  };

  const handleReportComment = (comment: ConfessionComment) => {
    if (!confession) return;
    Alert.alert(T('confessionReportTitle'), T('confessionReportPrompt'), [
      {
        text: T('confessionReportInappropriate'),
        onPress: () => {
          void confessionsApi.reportConfession(confession.id, 'inappropriate', comment.id).then(() => {
            setComments((prev) => prev.filter((c) => c.id !== comment.id));
            setConfession((c) =>
              c ? { ...c, comment_count: Math.max(0, c.comment_count - 1) } : c,
            );
            Alert.alert(T('confessionReportedTitle'), T('confessionReportedBody'));
          }).catch(() => {});
        },
      },
      { text: T('cancel'), style: 'cancel' },
    ]);
  };

  const handleDeleteComment = (comment: ConfessionComment) => {
    Alert.alert(T('confessionDeleteCommentTitle'), T('confessionDeleteCommentBody'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('delete'),
        style: 'destructive',
        onPress: () => {
          void confessionsApi.deleteConfessionComment(comment.id).then(() => {
            setComments((prev) => prev.filter((c) => c.id !== comment.id));
            setConfession((c) =>
              c ? { ...c, comment_count: Math.max(0, c.comment_count - 1) } : c,
            );
          }).catch((e: Error) => Alert.alert(T('error'), e.message));
        },
      },
    ]);
  };

  const handleCommentMenu = (comment: ConfessionComment) => {
    const buttons: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [
      { text: T('confessionReport'), onPress: () => handleReportComment(comment) },
    ];
    if (comment.is_mine) {
      buttons.unshift({
        text: T('delete'),
        style: 'destructive',
        onPress: () => handleDeleteComment(comment),
      });
    }
    buttons.push({ text: T('cancel'), style: 'cancel' });
    Alert.alert(T('confessionOptions'), undefined, buttons);
  };

  const handleSubmitComment = async () => {
    const text = commentDraft.trim();
    if (!text || !confessionId || submitting) return;
    setSubmitting(true);
    try {
      const created = await confessionsApi.addConfessionComment(confessionId, text);
      setComments((prev) => [...prev, created]);
      setConfession((c) => (c ? { ...c, comment_count: c.comment_count + 1 } : c));
      setCommentDraft('');
    } catch (e: any) {
      Alert.alert(T('error'), e?.message || T('confessionCommentError'));
    } finally {
      setSubmitting(false);
    }
  };

  const renderComment = ({ item }: { item: ConfessionComment }) => (
    <View style={[s.commentCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={s.commentHeader}>
        <Text style={[s.commentAlias, { color: theme.primary }]}>{item.alias}</Text>
        <Text style={[s.commentTime, { color: theme.textSecondary }]}>{timeAgo(item.created_at)}</Text>
        <Pressable hitSlop={12} onPress={() => handleCommentMenu(item)}>
          <Feather name="more-horizontal" size={16} color={theme.textSecondary} />
        </Pressable>
      </View>
      <Text style={[s.commentBody, { color: theme.text }]}>{item.content}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <ActivityIndicator style={{ marginTop: 80 }} color={theme.primary} />
      </View>
    );
  }

  if (!confession) {
    return (
      <View style={[s.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Feather name="arrow-left" size={22} color={theme.text} />
          </Pressable>
        </View>
        <Text style={[s.notFound, { color: theme.textSecondary }]}>{T('confessionNotFound')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: theme.background, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={s.headerBtn} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[s.headerTitle, { color: theme.text }]}>{T('confessionDetailTitle')}</Text>
        <Pressable
          style={s.headerBtn}
          onPress={() => {
            const buttons: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [
              { text: T('confessionReport'), onPress: handleReportConfession },
            ];
            if (confession.is_mine) {
              buttons.unshift({
                text: T('delete'),
                style: 'destructive',
                onPress: handleDeleteConfession,
              });
            }
            buttons.push({ text: T('cancel'), style: 'cancel' });
            Alert.alert(T('confessionOptions'), undefined, buttons);
          }}
        >
          <Feather name="more-horizontal" size={22} color={theme.text} />
        </Pressable>
      </View>

      <FlatList
        data={comments}
        keyExtractor={(item) => item.id}
        renderItem={renderComment}
        contentContainerStyle={s.listContent}
        ListHeaderComponent={
          <View style={[s.confessionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={s.confessionMeta}>
              <View style={[s.anonBadge, { backgroundColor: theme.primary + '18' }]}>
                <Feather name="eye-off" size={14} color={theme.primary} />
                <Text style={[s.anonText, { color: theme.primary }]}>{T('confessionAnonymous')}</Text>
              </View>
              <Text style={[s.timeText, { color: theme.textSecondary }]}>{timeAgo(confession.created_at)}</Text>
            </View>
            <Text style={[s.confessionBody, { color: theme.text }]}>{confession.content}</Text>
            <Pressable style={s.likeRow} onPress={() => void handleToggleLike()}>
              <Feather
                name="heart"
                size={20}
                color={confession.liked_by_me ? '#ef4444' : theme.textSecondary}
              />
              <Text style={[s.likeText, { color: theme.textSecondary }]}>
                {confession.like_count} {T('confessionLikes')}
              </Text>
            </Pressable>
            <Text style={[s.commentsLabel, { color: theme.textSecondary }]}>
              {T('confessionComments')} ({confession.comment_count})
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={[s.noComments, { color: theme.textSecondary }]}>{T('confessionNoComments')}</Text>
        }
      />

      <View
        style={[
          s.inputBar,
          {
            backgroundColor: theme.card,
            borderTopColor: theme.border,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <TextInput
          style={[s.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
          placeholder={T('confessionCommentPlaceholder')}
          placeholderTextColor={theme.textSecondary}
          value={commentDraft}
          onChangeText={setCommentDraft}
          maxLength={MAX_COMMENT}
          multiline
        />
        <Pressable
          style={[s.sendBtn, { backgroundColor: commentDraft.trim() ? theme.primary : theme.border }]}
          onPress={() => void handleSubmitComment()}
          disabled={!commentDraft.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Feather name="send" size={18} color="#fff" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  listContent: { padding: 16, paddingBottom: 24, gap: 10 },
  confessionCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 8 },
  confessionMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  anonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  anonText: { fontSize: 12, fontWeight: '700' },
  timeText: { fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' },
  confessionBody: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  likeText: { fontSize: 14, fontWeight: '600' },
  commentsLabel: { fontSize: 13, fontWeight: '700', marginTop: 16 },
  commentCard: { borderRadius: 12, borderWidth: 1, padding: 12 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  commentAlias: { fontSize: 13, fontWeight: '800' },
  commentTime: { fontSize: 11, fontWeight: '600', flex: 1 },
  commentBody: { fontSize: 14, lineHeight: 20 },
  noComments: { textAlign: 'center', marginTop: 8, fontSize: 14 },
  notFound: { textAlign: 'center', marginTop: 48, fontSize: 15 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
