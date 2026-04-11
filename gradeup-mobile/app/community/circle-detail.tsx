import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, Image, Share, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useCommunity } from '@/src/context/CommunityContext';
import * as communityApi from '@/src/lib/communityApi';
import type { CircleMember } from '@/src/lib/communityApi';

function getInitials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function Avatar({ name, avatarUrl, size = 44 }: { name?: string; avatarUrl?: string; size?: number }) {
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'];
  const i = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors[i], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{getInitials(name)}</Text>
    </View>
  );
}

export default function CircleDetailScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ circleId?: string | string[] }>();
  const circleId = typeof params.circleId === 'string' ? params.circleId : undefined;
  const { circles, userId, setSelectedCircleId, refreshCircles } = useCommunity();

  const circle = circles.find((c) => c.id === circleId);
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [loading, setLoading] = useState(true);
  const myMemberRole = useMemo(() => members.find((m) => m.user_id === userId)?.role ?? null, [members, userId]);
  const isCreator = Boolean(userId && circle?.created_by === userId);
  const canManageMembers = isCreator || myMemberRole === 'admin';

  useEffect(() => {
    if (!circleId) return;
    communityApi
      .getCircleMembers(circleId)
      .then(setMembers)
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [circleId]);

  const handleViewOnMap = () => {
    if (!circleId) return;
    setSelectedCircleId(circleId);
    router.back();
  };

  const handleCopyCode = async () => {
    if (!circle?.invite_code) return;
    try {
      await Clipboard.setStringAsync(circle.invite_code);
      Alert.alert('Copied', 'Invite code copied to clipboard');
    } catch {
      Alert.alert('Error', 'Failed to copy invite code');
    }
  };

  const handleShareInvite = async () => {
    if (!circle) return;
    try {
      await Share.share({
        message: `Join my circle "${circle.name}" on Rencana! Code: ${circle.invite_code}`,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const handleLeave = () => {
    if (!userId || !circleId) return;
    Alert.alert('Leave Circle', `Leave "${circle?.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await communityApi.leaveCircle(circleId, userId);
            await refreshCircles();
            router.back();
          } catch (e) {
            Alert.alert('Error', 'Failed to leave circle');
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.7 }]}
        >
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>
          {circle?.emoji} {circle?.name || 'Circle'}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Circle Info Card */}
        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={{ fontSize: 48, textAlign: 'center' }}>{circle?.emoji || '👥'}</Text>
          <Text style={[styles.circleName, { color: theme.text }]}>{circle?.name}</Text>
          <Text style={[styles.memberCount, { color: theme.textSecondary }]}>
            {members.length} member{members.length !== 1 ? 's' : ''}
          </Text>
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.8 }]}
              onPress={handleViewOnMap}
            >
              <Feather name="map" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>View on Map</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }, pressed && { opacity: 0.8 }]}
              onPress={handleShareInvite}
            >
              <Feather name="share-2" size={16} color={theme.text} />
              <Text style={[styles.actionBtnText, { color: theme.text }]}>Share</Text>
            </Pressable>
          </View>
          <View style={[styles.codeRow, { backgroundColor: theme.background }]}>
            <Text style={[styles.codeLabel, { color: theme.textSecondary }]}>Invite Code:</Text>
            <Pressable
              style={[styles.codePill, { borderColor: theme.border, backgroundColor: theme.card }]}
              onPress={handleCopyCode}
            >
              <Text style={[styles.codeValue, { color: theme.primary }]}>{circle?.invite_code}</Text>
              <Feather name="copy" size={14} color={theme.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* Members List */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Members</Text>
          <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>{members.length}</Text>
        </View>

        <View style={[styles.membersCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {loading ? (
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading…</Text>
          ) : (
            members.map((m, idx) => {
              const isMe = m.user_id === userId;
              const showDivider = idx < members.length - 1;
              return (
                <React.Fragment key={m.user_id}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.memberRow,
                      pressed && !isMe && { backgroundColor: theme.backgroundSecondary },
                    ]}
                    onPress={() => {
                      if (!isMe) {
                        router.push({ pathname: '/community/friend-profile', params: { friendId: m.user_id } } as any);
                      }
                    }}
                  >
                    <Avatar name={m.profile?.name} avatarUrl={m.profile?.avatar_url} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.memberName, { color: theme.text }]} numberOfLines={1}>
                        {m.profile?.name || 'Unknown'}
                        {isMe ? ' (You)' : ''}
                      </Text>
                      <Text style={[styles.memberSub, { color: theme.textSecondary }]} numberOfLines={1}>
                        {m.role === 'admin' ? 'Circle admin' : 'Circle member'}
                        {m.profile?.university ? ` · ${m.profile.university}` : ''}
                      </Text>
                    </View>

                    {m.role === 'admin' ? (
                      <View style={[styles.adminPill, { backgroundColor: `${theme.primary}18`, borderColor: `${theme.primary}33` }]}>
                        <Text style={[styles.adminPillText, { color: theme.primary }]}>Admin</Text>
                      </View>
                    ) : null}

                    {canManageMembers && !isMe ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          Alert.alert('Remove member', `Remove ${m.profile?.name || 'this user'} from the circle?`, [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Remove',
                              style: 'destructive',
                              onPress: async () => {
                                if (!circleId) return;
                                try {
                                  await communityApi.removeCircleMember(circleId, m.user_id);
                                  const next = await communityApi.getCircleMembers(circleId);
                                  setMembers(next);
                                  await refreshCircles();
                                } catch {
                                  Alert.alert('Error', 'Failed to remove member');
                                }
                              },
                            },
                          ]);
                        }}
                        style={({ pressed }) => [
                          styles.kickBtn,
                          { borderColor: theme.border, backgroundColor: theme.background },
                          pressed && { opacity: 0.85 },
                        ]}
                        hitSlop={8}
                      >
                        <Feather name="user-x" size={16} color={theme.textSecondary} />
                      </Pressable>
                    ) : (
                      <Feather name="chevron-right" size={18} color={theme.textSecondary} />
                    )}
                  </Pressable>
                  {showDivider ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
                </React.Fragment>
              );
            })
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          {isCreator ? (
            <Pressable
              style={({ pressed }) => [
                styles.actionDangerBtn,
                { borderColor: theme.border, backgroundColor: theme.card },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => {
                if (!circleId) return;
                Alert.alert('Delete Circle', `Delete "${circle?.name}"? This cannot be undone.`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await communityApi.deleteCircle(circleId);
                        await refreshCircles();
                        router.back();
                      } catch {
                        Alert.alert('Error', 'Failed to delete circle');
                      }
                    },
                  },
                ]);
              }}
            >
              <Feather name="trash-2" size={16} color="#ef4444" />
              <Text style={styles.actionDangerText}>Delete</Text>
            </Pressable>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.actionDangerBtn,
              { borderColor: theme.border, backgroundColor: theme.card },
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleLeave}
          >
            <Feather name="log-out" size={16} color="#ef4444" />
            <Text style={styles.actionDangerText}>Leave</Text>
          </Pressable>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 12,
  },
  backBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, flex: 1 },
  content: { paddingHorizontal: 20 },

  infoCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  circleName: { fontSize: 22, fontWeight: '800', marginTop: 8 },
  memberCount: { fontSize: 14, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
  },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 16,
    width: '100%',
    justifyContent: 'center',
  },
  codeLabel: { fontSize: 13, fontWeight: '600' },
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  codeValue: { fontSize: 16, fontWeight: '800', letterSpacing: 1, lineHeight: 18 },

  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  sectionHint: { fontSize: 13, fontWeight: '700' },
  loadingText: { textAlign: 'center', paddingVertical: 16, fontWeight: '600' },

  membersCard: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  memberName: { fontSize: 15, fontWeight: '800' },
  memberSub: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },

  adminPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, marginRight: 8 },
  adminPillText: { fontSize: 12, fontWeight: '800' },

  kickBtn: { marginLeft: 8, width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  actionDangerBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionDangerText: { color: '#ef4444', fontSize: 14, fontWeight: '800' },
});
