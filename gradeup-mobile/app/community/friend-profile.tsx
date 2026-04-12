import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Image,
  Alert,
  Platform,
  Switch,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { useTranslations } from '@/src/i18n';
import {
  ACTIVITY_TYPES,
  REACTION_EMOJIS,
  REACTION_TEMPLATES,
  getSharedTasksBetweenUsers,
} from '@/src/lib/communityApi';
import * as communityApi from '@/src/lib/communityApi';
import type { SharedTask } from '@/src/types';
import { studyingStatusDetailText } from '@/src/lib/timetableCurrentSlot';
import NowPlayingCard from '@/components/NowPlayingCard';
import { addTrackToLibrary } from '@/src/lib/spotifyAuth';

function getActivityEmoji(type?: string): string {
  return ACTIVITY_TYPES.find((a) => a.type === type)?.emoji || '⏸️';
}
function getActivityLabel(type?: string): string {
  return ACTIVITY_TYPES.find((a) => a.type === type)?.label || 'Idle';
}
function getInitials(name?: string): string {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function ProfileAvatar({ name, avatarUrl, size = 96 }: { name?: string; avatarUrl?: string; size?: number }) {
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'];
  const i = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors[i], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.34 }}>{getInitials(name)}</Text>
    </View>
  );
}

export default function FriendProfileScreen() {
  const theme = useTheme();
  const { language } = useApp();
  const T = useTranslations(language);
  const params = useLocalSearchParams<{ friendId?: string | string[] }>();
  const friendId = Array.isArray(params.friendId) ? params.friendId[0] : params.friendId;
  const { friendsWithStatus, sendReaction, sendBump, userId, refreshFriends, shareStreams, toggleShareStream } = useCommunity();

  const friend = friendsWithStatus.find((f) => f.id === friendId);
  const [sentReaction, setSentReaction] = useState<string | null>(null);
  const [sharedTasks, setSharedTasks] = useState<SharedTask[]>([]);

  const isAutoShareEnabled = friendId
    ? shareStreams.find((s) => s.recipient_id === friendId)?.enabled ?? false
    : false;

  useEffect(() => {
    if (friendId) getSharedTasksBetweenUsers(friendId).then(setSharedTasks).catch(() => {});
  }, [friendId]);

  const flash = (emoji: string) => { setSentReaction(emoji); setTimeout(() => setSentReaction(null), 1800); };
  const handleReaction = async (type: string) => { if (!friendId) return; await sendReaction(friendId, type); flash(type); };
  const handleTemplate = async (msg: string) => { if (!friendId) return; await sendReaction(friendId, '💬', msg); flash('💬'); };
  const handleBump = async () => { if (!friendId) return; await sendBump(friendId); flash('💥'); };

  const handleRemove = () => {
    const name = friend?.name || '?';
    Alert.alert(T('commFriendRemoveTitle'), T('commFriendRemoveBody').replace('{name}', name), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('commFriendRemoveConfirm'),
        style: 'destructive',
        onPress: async () => {
          if (!userId || !friendId) return;
          try { await communityApi.removeFriendByUserId(userId, friendId); await refreshFriends(); router.back(); }
          catch { Alert.alert(T('commFriendRemoveFailTitle'), T('commTryAgainShort')); }
        },
      },
    ]);
  };

  const studyingSubtitle =
    friend?.activity?.activity_type === 'studying'
      ? studyingStatusDetailText(friend.activity.detail, friend.activity.course_name, { isSelf: false, timetable: [] })
      : null;

  /* ── empty state ── */
  if (!friend) {
    return (
      <View style={[s.root, { backgroundColor: theme.background }]}>
        <SafeHeader theme={theme} />
        <View style={s.emptyWrap}>
          <Feather name="user-x" size={44} color={theme.textSecondary} />
          <Text style={[s.emptyTitle, { color: theme.text }]}>Not found</Text>
          <Text style={[s.emptySub, { color: theme.textSecondary }]}>They may have been removed from your friends.</Text>
          <Pressable style={[s.emptyBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
            <Text style={s.emptyBtnText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const subtitle = [friend.university, friend.course].filter(Boolean).join(' · ');

  return (
    <ScrollView style={[s.root, { backgroundColor: theme.background }]} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <SafeHeader theme={theme} />

      {/* ── identity + status bubble ── */}
      <View style={s.identity}>
        <ProfileAvatar name={friend.name} avatarUrl={friend.avatar_url} size={96} />

        {/* status pill */}
        <View style={[s.bubble, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={s.bubbleEmoji}>{getActivityEmoji(friend.activity?.activity_type)}</Text>
          <Text style={[s.bubbleText, { color: theme.text }]} numberOfLines={1}>
            {getActivityLabel(friend.activity?.activity_type)}
            {friend.activity?.activity_type === 'studying' && studyingSubtitle && studyingSubtitle !== 'Studying'
              ? ` · ${studyingSubtitle}`
              : friend.activity?.detail
                ? ` · ${friend.activity.detail}`
                : ''}
          </Text>
        </View>

        <Text style={[s.name, { color: theme.text }]}>{friend.name}</Text>
        {subtitle ? <Text style={[s.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text> : null}
        {friend.bio ? <Text style={[s.bio, { color: theme.textSecondary }]}>"{friend.bio}"</Text> : null}
      </View>

      {/* ── now playing ── */}
      {friend.music?.isPlaying && (
        <NowPlayingCard
          song={friend.music.song}
          artist={friend.music.artist}
          albumArt={friend.music.albumArt}
          onAddToLibrary={friend.music.trackId ? () => addTrackToLibrary(friend.music!.trackId!) : undefined}
        />
      )}

      {/* ── actions row ── */}
      <View style={s.actionsRow}>
        <Pressable
          style={({ pressed }) => [s.actionPill, { backgroundColor: theme.primary }, pressed && { opacity: 0.85 }]}
          onPress={handleBump}
        >
          <Text style={s.actionPillText}>💥 Bump</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.actionPill, s.actionPillOutline, { borderColor: theme.border, backgroundColor: theme.card }, pressed && { opacity: 0.85 }]}
          onPress={() => router.push({ pathname: '/quiz-config' as any, params: { challengeFriendId: friendId } })}
        >
          <Feather name="zap" size={15} color="#f59e0b" />
          <Text style={[s.actionPillOutlineText, { color: theme.text }]}>Quiz</Text>
        </Pressable>
      </View>

      {/* ── sent flash ── */}
      {sentReaction && (
        <View style={[s.flash, { backgroundColor: '#10b981' }]}>
          <Text style={s.flashText}>{sentReaction === '💥' ? 'Bump sent!' : `${sentReaction} Sent`}</Text>
        </View>
      )}

      {/* ── react ── */}
      <Text style={[s.label, { color: theme.textSecondary }]}>REACT</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.emojiRow}>
        {REACTION_EMOJIS.map((r) => (
          <Pressable
            key={r.type}
            style={({ pressed }) => [s.emojiBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { transform: [{ scale: 0.92 }] }]}
            onPress={() => handleReaction(r.type)}
          >
            <Text style={s.emojiBtnText}>{r.type}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ── quick messages ── */}
      <Text style={[s.label, { color: theme.textSecondary }]}>QUICK MESSAGES</Text>
      <View style={[s.msgCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {REACTION_TEMPLATES.map((msg, i) => (
          <Pressable
            key={msg}
            style={({ pressed }) => [
              s.msgRow,
              i < REACTION_TEMPLATES.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
              pressed && { backgroundColor: theme.background },
            ]}
            onPress={() => handleTemplate(msg)}
          >
            <Text style={[s.msgText, { color: theme.text }]} numberOfLines={1}>{msg}</Text>
            <Feather name="arrow-up-right" size={16} color={theme.textSecondary} />
          </Pressable>
        ))}
      </View>

      {/* ── shared tasks ── */}
      {sharedTasks.length > 0 && (
        <>
          <Text style={[s.label, { color: theme.textSecondary }]}>SHARED TASKS · {sharedTasks.length}</Text>
          <View style={[s.msgCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {sharedTasks.map((st, idx) => {
              const isOwner = st.owner_id === userId;
              const myDone = isOwner ? (st.task?.isDone ?? false) : st.recipient_completed;
              const theirDone = isOwner ? st.recipient_completed : (st.task?.isDone ?? false);
              const title = st.task?.title || st.message || 'Shared task';
              const meta = st.task
                ? [st.task.courseId, st.task.dueDate].filter(Boolean).join(' · ')
                : st.owner_profile?.name
                  ? `From ${st.owner_profile.name.split(' ')[0]}`
                  : '';
              return (
                <Pressable
                  key={st.id}
                  style={({ pressed }) => [
                    s.msgRow,
                    idx < sharedTasks.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                    pressed && { backgroundColor: theme.background },
                  ]}
                  onPress={() => router.push({ pathname: '/task-details' as any, params: { id: st.task_id } })}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.taskTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
                    {meta ? <Text style={[s.taskMeta, { color: theme.textSecondary }]} numberOfLines={1}>{meta}</Text> : null}
                  </View>
                  <View style={s.statusPills}>
                    <View style={[s.statusPill, { backgroundColor: myDone ? '#10b98120' : theme.background }]}>
                      <View style={[s.dot, { backgroundColor: myDone ? '#10b981' : theme.border }]} />
                      <Text style={[s.statusPillLabel, { color: myDone ? '#10b981' : theme.textSecondary }]}>You</Text>
                    </View>
                    <View style={[s.statusPill, { backgroundColor: theirDone ? '#10b98120' : theme.background }]}>
                      <View style={[s.dot, { backgroundColor: theirDone ? '#10b981' : theme.border }]} />
                      <Text style={[s.statusPillLabel, { color: theirDone ? '#10b981' : theme.textSecondary }]}>{friend.name.split(' ')[0]}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* ── auto-share ── */}
      <Text style={[s.label, { color: theme.textSecondary }]}>SETTINGS</Text>
      <View style={[s.settingRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.settingTitle, { color: theme.text }]}>{T('shareAutoShareNewTasks')}</Text>
          <Text style={[s.settingSub, { color: theme.textSecondary }]}>
            Send new tasks to {friend.name.split(' ')[0]} automatically
          </Text>
        </View>
        <Switch
          value={isAutoShareEnabled}
          onValueChange={(val) => { if (friendId) void toggleShareStream(friendId, val); }}
          trackColor={{ false: theme.border, true: '#10b981' }}
        />
      </View>

      {/* ── remove ── */}
      <Pressable style={({ pressed }) => [s.removeBtn, pressed && { opacity: 0.65 }]} onPress={handleRemove}>
        <Text style={s.removeBtnText}>Remove friend</Text>
      </Pressable>

      <View style={{ height: 44 }} />
    </ScrollView>
  );
}

function SafeHeader({ theme }: { theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 56 : 40 }]}>
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.75 }]}
      >
        <Feather name="chevron-left" size={22} color={theme.text} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  /* identity */
  identity: { alignItems: 'center', paddingTop: 12, paddingBottom: 24 },
  name: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, marginTop: 14 },
  subtitle: { fontSize: 14, fontWeight: '500', marginTop: 6, textAlign: 'center' },
  bio: { fontSize: 14, fontStyle: 'italic', marginTop: 12, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },

  /* status pill */
  bubble: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  bubbleEmoji: { fontSize: 14 },
  bubbleText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },

  /* actions */
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  actionPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 52, borderRadius: 16 },
  actionPillText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  actionPillOutline: { borderWidth: 1 },
  actionPillOutlineText: { fontSize: 16, fontWeight: '800' },

  /* flash */
  flash: { alignItems: 'center', paddingVertical: 10, borderRadius: 14, marginBottom: 14 },
  flashText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  /* section labels */
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 10, marginTop: 10, marginLeft: 4 },

  /* emoji row */
  emojiRow: { gap: 10, paddingBottom: 4 },
  emojiBtn: { width: 52, height: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emojiBtnText: { fontSize: 24 },

  /* message card */
  msgCard: { borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 4 },
  msgRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18, gap: 12 },
  msgText: { fontSize: 15, flex: 1, fontWeight: '500' },

  /* tasks */
  taskTitle: { fontSize: 15, fontWeight: '700' },
  taskMeta: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  statusPills: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  statusPillLabel: { fontSize: 11, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4 },

  /* setting */
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 18, borderWidth: 1, marginBottom: 4 },
  settingTitle: { fontSize: 15, fontWeight: '700' },
  settingSub: { fontSize: 13, marginTop: 3, lineHeight: 18, fontWeight: '500' },

  /* remove */
  removeBtn: { alignItems: 'center', paddingVertical: 20 },
  removeBtnText: { fontSize: 15, fontWeight: '600', color: '#ef4444' },

  /* empty */
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 40, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  emptyBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
