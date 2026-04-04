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
import { useCommunity } from '@/src/context/CommunityContext';
import {
  ACTIVITY_TYPES,
  REACTION_EMOJIS,
  REACTION_TEMPLATES,
  getSharedTasksBetweenUsers,
} from '@/src/lib/communityApi';
import * as communityApi from '@/src/lib/communityApi';
import type { FriendWithStatus } from '@/src/lib/communityApi';
import type { SharedTask } from '@/src/types';
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

function Avatar({ name, avatarUrl, size = 64 }: { name?: string; avatarUrl?: string; size?: number }) {
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'];
  const i = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors[i], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.36 }}>{getInitials(name)}</Text>
    </View>
  );
}

export default function FriendProfileScreen() {
  const theme = useTheme();
  const { friendId } = useLocalSearchParams<{ friendId: string }>();
  const { friendsWithStatus, sendReaction, sendBump, userId, refreshFriends, shareStreams, toggleShareStream } = useCommunity();

  const friend = friendsWithStatus.find((f) => f.id === friendId);
  const [sentReaction, setSentReaction] = useState<string | null>(null);
  const [sharedTasks, setSharedTasks] = useState<SharedTask[]>([]);

  const isAutoShareEnabled = shareStreams.find(s => s.recipient_id === friendId)?.enabled ?? false;

  useEffect(() => {
    if (friendId) {
      getSharedTasksBetweenUsers(friendId).then(setSharedTasks).catch(() => {});
    }
  }, [friendId]);

  const handleReaction = async (type: string) => {
    if (!friendId) return;
    await sendReaction(friendId, type);
    setSentReaction(type);
    setTimeout(() => setSentReaction(null), 2000);
  };

  const handleTemplate = async (msg: string) => {
    if (!friendId) return;
    await sendReaction(friendId, '💬', msg);
    setSentReaction('💬');
    setTimeout(() => setSentReaction(null), 2000);
  };

  const handleBump = async () => {
    if (!friendId) return;
    await sendBump(friendId);
    setSentReaction('💥');
    setTimeout(() => setSentReaction(null), 2000);
  };

  const handleRemove = () => {
    Alert.alert('Remove Friend', `Are you sure you want to remove ${friend?.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (!userId || !friendId) return;
          try {
            await communityApi.removeFriendByUserId(userId, friendId);
            await refreshFriends();
            router.back();
          } catch (e) {
            Alert.alert('Error', 'Failed to remove friend');
          }
        },
      },
    ]);
  };

  if (!friend) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Feather name="chevron-left" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>Profile</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={{ color: theme.textSecondary }}>User not found</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.7 }]}
        >
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Profile</Text>
      </View>

      {/* Profile Card */}
      <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Avatar name={friend.name} avatarUrl={friend.avatar_url} size={80} />
        <Text style={[styles.profileName, { color: theme.text }]}>{friend.name}</Text>
        {friend.university && (
          <Text style={[styles.profileDetail, { color: theme.textSecondary }]}>
            🏫 {friend.university}
          </Text>
        )}
        {friend.faculty && (
          <Text style={[styles.profileDetail, { color: theme.textSecondary }]}>
            📋 {friend.faculty}
          </Text>
        )}
        {friend.course && (
          <Text style={[styles.profileDetail, { color: theme.textSecondary }]}>
            📚 {friend.course}
          </Text>
        )}
        {friend.bio && (
          <Text style={[styles.profileBio, { color: theme.text }]}>"{friend.bio}"</Text>
        )}
      </View>

      {/* Current Activity */}
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Current Activity</Text>
        <View style={styles.activityRow}>
          <Text style={styles.activityEmoji}>
            {getActivityEmoji(friend.activity?.activity_type)}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.activityType, { color: theme.text }]}>
              {getActivityLabel(friend.activity?.activity_type)}
            </Text>
            {friend.activity?.detail && (
              <Text style={[styles.activityDetail, { color: theme.textSecondary }]}>
                {friend.activity.detail}
              </Text>
            )}
            {friend.activity?.course_name && (
              <Text style={[styles.activityCourse, { color: theme.primary }]}>
                {friend.activity.course_name}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Now Playing — Spotify Music Presence */}
      {friend.music?.isPlaying && (
        <NowPlayingCard
          song={friend.music.song}
          artist={friend.music.artist}
          albumArt={friend.music.albumArt}
          onAddToLibrary={friend.music.trackId ? () => addTrackToLibrary(friend.music!.trackId!) : undefined}
        />
      )}

      {/* Location */}
      {friend.location && (
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Location</Text>
          <View style={styles.activityRow}>
            <Feather name="map-pin" size={22} color={theme.primary} />
            <Text style={[styles.locationText, { color: theme.text }]}>
              {friend.location.place_name || 'Location shared'}
            </Text>
          </View>
        </View>
      )}

      {/* Shared Tasks */}
      {sharedTasks.length > 0 && (
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Feather name="clipboard" size={16} color="#6366f1" />
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
              Shared Tasks ({sharedTasks.length})
            </Text>
          </View>
          {sharedTasks.map(st => {
            const isOwner = st.owner_id === userId;
            const ownerDone = st.task?.isDone ?? false;
            const recipientDone = st.recipient_completed;
            return (
              <Pressable
                key={st.id}
                style={[styles.sharedTaskRow, { borderColor: theme.border }]}
                onPress={() => {
                  if (st.task) router.push({ pathname: '/task-details' as any, params: { id: st.task_id } });
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sharedTaskTitle, { color: theme.text }]} numberOfLines={1}>
                    {st.task?.title || 'Task'}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                    {st.task?.courseId} {st.task?.dueDate ? `• Due ${st.task.dueDate}` : ''}
                  </Text>
                </View>
                <View style={styles.completionRings}>
                  <View style={[styles.completionRing, { borderColor: isOwner ? (ownerDone ? '#10b981' : theme.border) : (recipientDone ? '#10b981' : theme.border) }]}>
                    {(isOwner ? ownerDone : recipientDone) && (
                      <Feather name="check" size={10} color="#10b981" />
                    )}
                  </View>
                  <View style={[styles.completionRing, { borderColor: isOwner ? (recipientDone ? '#10b981' : theme.border) : (ownerDone ? '#10b981' : theme.border) }]}>
                    {(isOwner ? recipientDone : ownerDone) && (
                      <Feather name="check" size={10} color="#10b981" />
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Auto-share setting */}
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.autoShareRow}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 4 }]}>
              Auto-share new tasks
            </Text>
            <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
              New tasks you add will be automatically sent to {friend.name} for approval.
            </Text>
          </View>
          <Switch
            value={isAutoShareEnabled}
            onValueChange={(val) => toggleShareStream(friend.id, val)}
            trackColor={{ false: theme.border, true: '#10b981' }}
          />
        </View>
      </View>

      {/* Challenge to Quiz */}
      <Pressable
        style={[styles.challengeBtn, { backgroundColor: '#003366' }]}
        onPress={() => router.push({ pathname: '/quiz-config' as any, params: { challengeFriendId: friendId } })}
      >
        <Feather name="zap" size={18} color="#f59e0b" />
        <Text style={styles.challengeBtnText}>Challenge to Quiz</Text>
      </Pressable>

      {/* Sent indicator */}
      {sentReaction && (
        <View style={[styles.sentBanner, { backgroundColor: '#10b981' }]}>
          <Text style={styles.sentBannerText}>
            {sentReaction === '💥' ? 'Bump sent! 💥' : `${sentReaction} Sent!`}
          </Text>
        </View>
      )}

      {/* Quick Reactions */}
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick React</Text>
        <View style={styles.reactionsGrid}>
          {REACTION_EMOJIS.map((r) => (
            <Pressable
              key={r.type}
              style={({ pressed }) => [
                styles.reactionItem,
                { backgroundColor: theme.background },
                pressed && { opacity: 0.6, transform: [{ scale: 0.92 }] },
              ]}
              onPress={() => handleReaction(r.type)}
            >
              <Text style={styles.reactionItemEmoji}>{r.type}</Text>
              <Text style={[styles.reactionItemLabel, { color: theme.textSecondary }]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Bump button */}
        <Pressable
          style={({ pressed }) => [
            styles.bumpButton,
            { backgroundColor: theme.primary },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleBump}
        >
          <Text style={styles.bumpBtnText}>💥 Bump!</Text>
        </Pressable>
      </View>

      {/* Template Messages */}
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick Messages</Text>
        {REACTION_TEMPLATES.map((msg) => (
          <Pressable
            key={msg}
            style={({ pressed }) => [
              styles.templateRow,
              { borderColor: theme.border },
              pressed && { backgroundColor: theme.background },
            ]}
            onPress={() => handleTemplate(msg)}
          >
            <Text style={[styles.templateText, { color: theme.text }]}>{msg}</Text>
            <Feather name="send" size={14} color={theme.primary} />
          </Pressable>
        ))}
      </View>

      {/* Remove Friend */}
      <Pressable
        style={({ pressed }) => [
          styles.removeBtn,
          pressed && { opacity: 0.7 },
        ]}
        onPress={handleRemove}
      >
        <Feather name="user-minus" size={16} color="#ef4444" />
        <Text style={styles.removeBtnText}>Remove Friend</Text>
      </Pressable>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 32 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },

  profileCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  profileName: { fontSize: 24, fontWeight: '800', marginTop: 12 },
  profileDetail: { fontSize: 14, marginTop: 4 },
  profileBio: { fontSize: 14, fontStyle: 'italic', marginTop: 10, textAlign: 'center', lineHeight: 20 },

  section: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  autoShareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  activityEmoji: { fontSize: 28 },
  activityType: { fontSize: 16, fontWeight: '600' },
  activityDetail: { fontSize: 13, marginTop: 2 },
  activityCourse: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  locationText: { fontSize: 15 },

  sentBanner: {
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  sentBannerText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  reactionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  reactionItem: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    minWidth: 70,
  },
  reactionItemEmoji: { fontSize: 26 },
  reactionItemLabel: { fontSize: 10, fontWeight: '600', marginTop: 4 },

  bumpButton: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  bumpBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  templateText: { fontSize: 15, flex: 1 },

  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
  },
  removeBtnText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },

  sharedTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  sharedTaskTitle: { fontSize: 14, fontWeight: '600' },
  completionRings: { flexDirection: 'row', gap: 6 },
  completionRing: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  challengeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  challengeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
