import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  Animated,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';

import * as Haptics from 'expo-haptics';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import * as confessionsApi from '@/src/lib/confessionsApi';
import type { Confession, ConfessionComment } from '@/src/lib/confessionsApi';

const MAX_COMMENT = 300;

const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '🔥'];

function getTopReactions(counts: Record<string, number> | undefined) {
  if (!counts) return [];
  const entries = Object.entries(counts).filter(([_, c]) => c > 0);
  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(0, 3).map(e => e[0]);
}

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
  const [replyingTo, setReplyingTo] = useState<ConfessionComment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeReactionPicker, setActiveReactionPicker] = useState(false);

  const getTagColor = (tag: string | null) => {
    if (tag === '☕️ Tea') return '#F59E0B'; // Amber
    if (tag === '❤️ Crush') return '#EC4899'; // Pink
    if (tag === '📚 Rant') return '#EF4444'; // Red
    if (tag === '❓ Advice') return '#3B82F6'; // Blue
    return '#8B5CF6'; // Purple
  };

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

  const handleReaction = async (reaction: string | null) => {
    if (!confession) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const wasReacted = !!confession.my_reaction;
    const oldReaction = confession.my_reaction;
    const isAdding = !!reaction;

    let newCount = confession.like_count;
    if (wasReacted && !isAdding) newCount = Math.max(0, newCount - 1);
    if (!wasReacted && isAdding) newCount += 1;

    setConfession({
      ...confession,
      my_reaction: reaction,
      like_count: newCount,
    });
    
    if (activeReactionPicker) setActiveReactionPicker(false);

    try {
      await confessionsApi.setConfessionReaction(confession.id, reaction);
    } catch {
      setConfession({
        ...confession,
        my_reaction: oldReaction,
        like_count: confession.like_count,
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
      const created = await confessionsApi.addConfessionComment(confessionId, text, replyingTo?.id);
      setComments((prev) => [...prev, created]);
      setConfession((c) => (c ? { ...c, comment_count: c.comment_count + 1 } : c));
      setCommentDraft('');
      setReplyingTo(null);
    } catch (e: any) {
      Alert.alert(T('error'), e?.message || T('confessionCommentError'));
    } finally {
      setSubmitting(false);
    }
  };

  // Group comments hierarchically
  const groupedComments = React.useMemo(() => {
    const roots = comments.filter(c => !c.parent_id);
    const result: ConfessionComment[] = [];
    roots.forEach(root => {
      result.push(root);
      const replies = comments.filter(c => c.parent_id === root.id);
      result.push(...replies);
    });
    return result;
  }, [comments]);

  const renderComment = ({ item }: { item: ConfessionComment }) => {
    const isReply = !!item.parent_id;
    return (
      <View style={[
        s.commentCard, 
        { backgroundColor: theme.card, borderColor: theme.border },
        isReply && { marginLeft: 32, marginTop: -4, borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }
      ]}>
        <View style={s.commentHeader}>
          {isReply && <Feather name="corner-down-right" size={12} color={theme.textSecondary} style={{ marginRight: 4 }} />}
          <Text style={[s.commentAlias, { color: theme.primary }]}>{item.alias}</Text>
          <Text style={[s.commentTime, { color: theme.textSecondary }]}>{timeAgo(item.created_at)}</Text>
          
          {!isReply && (
            <Pressable hitSlop={12} onPress={() => {
              setReplyingTo(item);
            }} style={{ marginRight: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary }}>Reply</Text>
            </Pressable>
          )}

          <Pressable hitSlop={12} onPress={() => handleCommentMenu(item)}>
            <Feather name="more-horizontal" size={16} color={theme.textSecondary} />
          </Pressable>
        </View>
        <Text style={[s.commentBody, { color: theme.text }]}>{item.content}</Text>
      </View>
    );
  };

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
        data={groupedComments}
        keyExtractor={(item) => item.id}
        renderItem={renderComment}
        contentContainerStyle={s.listContent}
        ListHeaderComponent={
          <View style={{ position: 'relative' }}>
            <ReactionBubble
              visible={activeReactionPicker}
              onSelect={(e) => void handleReaction(e)}
              theme={theme}
            />

            <View style={[s.confessionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={s.confessionMeta}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={[s.anonAvatar, { backgroundColor: getTagColor(confession.tag) + '15' }]}>
                    <Feather name="user" size={20} color={getTagColor(confession.tag)} />
                  </View>
                  <View>
                    <Text style={[s.metaText, { color: theme.text }]}>
                      {confession.tag || 'Anon'}
                    </Text>
                    <Text style={[s.timeText, { color: theme.textSecondary }]}>{timeAgo(confession.created_at)}</Text>
                  </View>
                </View>
              </View>
              <Text style={[s.confessionBody, { color: theme.text }]}>{confession.content}</Text>
              <View style={s.detailBottomRight}>
                <Pressable
                  style={[
                    s.upvotePill, 
                    !!confession.my_reaction ? { backgroundColor: theme.primary + '12', borderColor: theme.primary + '30' } : { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }
                  ]}
                  hitSlop={8}
                  onPress={() => void handleReaction(confession.my_reaction ? null : '❤️')}
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setActiveReactionPicker(!activeReactionPicker);
                  }}
                  delayLongPress={200}
                >
                  {!!confession.my_reaction ? (
                    <Text style={s.upvoteReactedEmoji}>{confession.my_reaction}</Text>
                  ) : (
                    confession.like_count > 0 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 2 }}>
                        {getTopReactions(confession.reaction_counts).map((r, i) => (
                          <Text key={r} style={{ fontSize: 14, marginLeft: i > 0 ? -4 : 0 }}>{r}</Text>
                        ))}
                      </View>
                    ) : (
                      <Feather name="heart" size={16} color={theme.textSecondary} />
                    )
                  )}
                  {confession.like_count > 0 ? (
                    <Text style={[s.actionCount, { color: confession.my_reaction ? theme.primary : theme.textSecondary }]}>
                      {confession.like_count}
                    </Text>
                  ) : null}
                </Pressable>
              </View>
              <Text style={[s.commentsLabel, { color: theme.textSecondary }]}>
                {T('confessionComments')} ({confession.comment_count})
              </Text>
            </View>
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
            flexDirection: 'column',
            alignItems: 'stretch',
          },
        ]}
      >
        {replyingTo && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 }}>
            <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '600' }}>
              Replying to <Text style={{ color: theme.primary }}>{replyingTo.alias}</Text>
            </Text>
            <Pressable hitSlop={12} onPress={() => setReplyingTo(null)}>
              <Feather name="x" size={16} color={theme.textSecondary} />
            </Pressable>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12 }}>
          <TextInput
            style={[s.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
            placeholder={replyingTo ? 'Write a reply...' : T('confessionCommentPlaceholder')}
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
      </View>
    </KeyboardAvoidingView>
  );
}

function ReactionBubble({ visible, onSelect, theme }: {
  visible: boolean;
  onSelect: (emoji: string) => void;
  theme: any;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 100, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        s.reactionBubbleWrapper,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <View style={[s.reactionBubble, { backgroundColor: theme.card + 'F0', borderColor: theme.border }]}>
        {REACTIONS.map((emoji) => (
          <Pressable
            key={emoji}
            onPressIn={() => { Haptics.selectionAsync().catch(() => {}); onSelect(emoji); }}
            style={({ pressed }) => [
              s.reactionBubbleBtn,
              pressed && { transform: [{ scale: 1.3 }], backgroundColor: theme.primary + '20' },
            ]}
          >
            <Text style={s.reactionBubbleEmoji}>{emoji}</Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
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
  confessionCard: {
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  confessionMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  anonAvatar: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  metaText: { fontSize: 14, fontWeight: '600' },
  timeText: { fontSize: 13, fontWeight: '500' },
  confessionBody: { fontSize: 18, lineHeight: 28, fontWeight: '400', letterSpacing: -0.3 },
  detailBottomRight: { marginTop: 16, flexDirection: 'row', justifyContent: 'flex-start' },
  actionPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  upvotePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  upvoteReactedEmoji: { fontSize: 18 },
  upvoteCount: { fontSize: 16, fontWeight: '700' },
  actionCount: { fontSize: 13, fontWeight: '700' },
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
  reactionBubbleWrapper: { position: 'absolute', top: -60, left: 0, right: 0, zIndex: 10, alignItems: 'center' },
  reactionBubble: { flexDirection: 'row', padding: 8, borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  reactionBubbleBtn: { padding: 8, borderRadius: 12 },
  reactionBubbleEmoji: { fontSize: 22 },
});
