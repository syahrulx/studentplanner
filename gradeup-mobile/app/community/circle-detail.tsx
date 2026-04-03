import React, { useState, useEffect } from 'react';
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
  const { circleId } = useLocalSearchParams<{ circleId: string }>();
  const { circles, userId, setSelectedCircleId, refreshCircles } = useCommunity();

  const circle = circles.find((c) => c.id === circleId);
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!circleId) return;
    communityApi
      .getCircleMembers(circleId)
      .then(setMembers)
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [circleId]);

  const handleViewOnMap = () => {
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
        message: `Join my circle "${circle.name}" on Gradeup! Code: ${circle.invite_code}`,
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
            <Pressable style={styles.codePill} onPress={handleCopyCode}>
              <Text style={[styles.codeValue, { color: theme.primary }]}>{circle?.invite_code}</Text>
              <Feather name="copy" size={14} color={theme.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* Members List */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Members</Text>
        {loading ? (
          <Text style={{ color: theme.textSecondary, textAlign: 'center', paddingTop: 20 }}>Loading...</Text>
        ) : (
          members.map((m) => (
            <Pressable
              key={m.user_id}
              style={[styles.memberRow, { borderBottomColor: theme.border }]}
              onPress={() => {
                if (m.user_id !== userId) {
                  router.push({ pathname: '/community/friend-profile', params: { friendId: m.user_id } } as any);
                }
              }}
            >
              <Avatar name={m.profile?.name} avatarUrl={m.profile?.avatar_url} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.memberName, { color: theme.text }]}>
                  {m.profile?.name || 'Unknown'}
                  {m.user_id === userId ? ' (You)' : ''}
                </Text>
                {m.profile?.university && (
                  <Text style={[styles.memberSub, { color: theme.textSecondary }]}>{m.profile.university}</Text>
                )}
              </View>
              {m.role === 'admin' && (
                <View style={[styles.adminBadge, { backgroundColor: '#f59e0b20' }]}>
                  <Text style={styles.adminBadgeText}>Admin</Text>
                </View>
              )}
            </Pressable>
          ))
        )}

        {/* Leave Button */}
        <Pressable
          style={({ pressed }) => [styles.leaveBtn, pressed && { opacity: 0.7 }]}
          onPress={handleLeave}
        >
          <Feather name="log-out" size={16} color="#ef4444" />
          <Text style={styles.leaveBtnText}>Leave Circle</Text>
        </Pressable>

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
  codeValue: { fontSize: 16, fontWeight: '800', letterSpacing: 1 },

  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberName: { fontSize: 16, fontWeight: '700' },
  memberSub: { fontSize: 13, marginTop: 2 },
  adminBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  adminBadgeText: { fontSize: 12, fontWeight: '700', color: '#f59e0b' },

  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 24,
  },
  leaveBtnText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },
});
