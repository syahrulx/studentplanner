import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, Platform, Alert, Share, Modal, FlatList } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useCommunity } from '@/src/context/CommunityContext';
import * as communityApi from '@/src/lib/communityApi';

const CIRCLE_EMOJIS = ['👥', '📚', '🏫', '🎓', '💼', '🎵', '⚽', '🎮', '🏠', '🌟', '🔬', '🎪'];

export default function CirclesScreen() {
  const theme = useTheme();
  const { circles, refreshCircles, userId, friends } = useCommunity();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('👥');
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [inviteCircleId, setInviteCircleId] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!userId || !newName.trim()) return;
    setCreating(true);
    try {
      await communityApi.createCircle(userId, newName.trim(), selectedEmoji);
      await refreshCircles();
      setShowCreate(false);
      setNewName('');
      setSelectedEmoji('👥');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create circle');
    }
    setCreating(false);
  }, [userId, newName, selectedEmoji, refreshCircles]);

  const handleJoin = useCallback(async () => {
    if (!userId || !joinCode.trim()) return;
    try {
      const circle = await communityApi.joinCircleByCode(userId, joinCode.trim());
      if (circle) {
        await refreshCircles();
        setJoinCode('');
        Alert.alert('Joined!', `You joined ${circle.name}`);
      } else {
        Alert.alert('Not Found', 'Invalid invite code');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to join circle');
    }
  }, [userId, joinCode, refreshCircles]);

  const handleShare = useCallback(async (circle: communityApi.Circle) => {
    try {
      await Share.share({
        message: `Join my circle "${circle.name}" on Rencana! Use invite code: ${circle.invite_code}`,
      });
    } catch (e) {}
  }, []);

  const handleCopyCode = useCallback(async (code?: string | null) => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      Alert.alert('Copied', 'Invite code copied to clipboard');
    } catch {
      Alert.alert('Error', 'Failed to copy invite code');
    }
  }, []);

  const handleInviteFriend = useCallback(
    (circleId: string) => {
      if (!friends.length) {
        Alert.alert('No friends yet', 'Add friends first in the Community tab before inviting them to a circle.');
        return;
      }
      setInviteCircleId(circleId);
    },
    [friends]
  );

  const handleSelectFriendToInvite = useCallback(
    async (friendId: string) => {
      if (!inviteCircleId) return;
      if (!userId) return;
      try {
        await communityApi.inviteToCircle(inviteCircleId, userId, friendId);
        Alert.alert('Invite sent', 'They will appear in the circle after they accept.');
        setInviteCircleId(null);
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to invite friend');
      }
    },
    [inviteCircleId, userId]
  );

  const handleLeave = useCallback(
    async (circle: communityApi.Circle) => {
      if (!userId) return;
      Alert.alert('Leave Circle', `Leave "${circle.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await communityApi.leaveCircle(circle.id, userId);
            await refreshCircles();
          },
        },
      ]);
    },
    [userId, refreshCircles]
  );

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
        <Text style={[styles.title, { color: theme.text }]}>My Circles</Text>
      </View>

      {/* Join by code */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Join Circle</Text>
        <View style={styles.joinRow}>
          <TextInput
            style={[styles.joinInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            placeholder="Enter invite code..."
            placeholderTextColor={theme.textSecondary}
            value={joinCode}
            onChangeText={setJoinCode}
            autoCapitalize="none"
          />
          <Pressable
            style={({ pressed }) => [styles.joinBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.8 }]}
            onPress={handleJoin}
          >
            <Text style={styles.joinBtnText}>Join</Text>
          </Pressable>
        </View>
      </View>

      {/* Circles list */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Circles ({circles.length})
        </Text>
        <Pressable
          style={({ pressed }) => [styles.createToggle, { backgroundColor: theme.primary }, pressed && { opacity: 0.8 }]}
          onPress={() => setShowCreate(!showCreate)}
        >
          <Feather name={showCreate ? 'x' : 'plus'} size={16} color="#fff" />
        </Pressable>
      </View>

      {/* Create form */}
      {showCreate && (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>New Circle</Text>
          <TextInput
            style={[styles.nameInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            placeholder="Circle name..."
            placeholderTextColor={theme.textSecondary}
            value={newName}
            onChangeText={setNewName}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiRow}>
            {CIRCLE_EMOJIS.map((e) => (
              <Pressable
                key={e}
                style={[
                  styles.emojiItem,
                  selectedEmoji === e && { backgroundColor: theme.primary + '20', borderColor: theme.primary },
                ]}
                onPress={() => setSelectedEmoji(e)}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            style={({ pressed }) => [
              styles.createBtn,
              { backgroundColor: theme.primary },
              (!newName.trim() || creating) && { opacity: 0.5 },
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleCreate}
            disabled={!newName.trim() || creating}
          >
            <Text style={styles.createBtnText}>{creating ? 'Creating...' : 'Create Circle'}</Text>
          </Pressable>
        </View>
      )}

      {/* Circle cards */}
      {circles.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="circle" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No circles yet</Text>
          <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
            Create a circle for your study group, class, or committee
          </Text>
        </View>
      ) : (
        circles.map((circle) => (
          <View key={circle.id} style={[styles.circleCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.circleHeader}>
              <Text style={styles.circleEmoji}>{circle.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.circleName, { color: theme.text }]}>{circle.name}</Text>
                <Text style={[styles.circleMeta, { color: theme.textSecondary }]}>
                  {circle.member_count || 0} members
                </Text>
              </View>
            </View>
            <View style={styles.circleActions}>
              <Pressable
                style={({ pressed }) => [styles.circleActionBtn, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                onPress={() => handleShare(circle)}
              >
                <Feather name="share-2" size={14} color={theme.primary} />
                <Text style={[styles.circleActionText, { color: theme.primary }]}>Share</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.circleActionBtn, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                onPress={() => handleInviteFriend(circle.id)}
              >
                <Feather name="user-plus" size={14} color={theme.primary} />
                <Text style={[styles.circleActionText, { color: theme.primary }]}>Invite Friend</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.circleActionBtn, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                onPress={() => handleLeave(circle)}
              >
                <Feather name="log-out" size={14} color="#ef4444" />
                <Text style={[styles.circleActionText, { color: '#ef4444' }]}>Leave</Text>
              </Pressable>
            </View>
            <View style={[styles.codeRow, { backgroundColor: theme.background }]}>
              <Text style={[styles.codeLabel, { color: theme.textSecondary }]}>Invite code:</Text>
              <Pressable
                style={styles.codePill}
                onPress={() => handleCopyCode(circle.invite_code)}
              >
                <Text style={[styles.codeValue, { color: theme.text }]}>{circle.invite_code}</Text>
                <Feather name="copy" size={14} color={theme.textSecondary} />
              </Pressable>
            </View>
          </View>
        ))
      )}

      <View style={{ height: 60 }} />

      <Modal
        visible={!!inviteCircleId}
        animationType="slide"
        transparent
        onRequestClose={() => setInviteCircleId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Invite Friend</Text>
              <Pressable onPress={() => setInviteCircleId(null)}>
                <Feather name="x" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
            {friends.length === 0 ? (
              <Text style={[styles.modalEmpty, { color: theme.textSecondary }]}>
                You have no friends yet. Add friends in the Community tab first.
              </Text>
            ) : (
              <FlatList
                data={friends}
                keyExtractor={(f) => f.id}
                renderItem={({ item }) => (
                  <Pressable
                    style={({ pressed }) => [styles.friendRow, { borderBottomColor: theme.border }, pressed && { opacity: 0.7 }]}
                    onPress={() => handleSelectFriendToInvite(item.id)}
                  >
                    <View style={styles.friendAvatar}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {(item.name || '?').slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.friendName, { color: theme.text }]}>{item.name || 'Friend'}</Text>
                      {item.university && (
                        <Text style={[styles.friendSub, { color: theme.textSecondary }]}>{item.university}</Text>
                      )}
                    </View>
                    <Feather name="plus-circle" size={18} color={theme.primary} />
                  </Pressable>
                )}
                style={{ maxHeight: 320 }}
              />
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 32 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },

  card: { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },

  joinRow: { flexDirection: 'row', gap: 10 },
  joinInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  joinBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  createToggle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  nameInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 12 },
  emojiRow: { marginBottom: 14 },
  emojiItem: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', marginRight: 8 },
  emojiText: { fontSize: 22 },
  createBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  circleCard: { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 12 },
  circleHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  circleEmoji: { fontSize: 28 },
  circleName: { fontSize: 17, fontWeight: '700' },
  circleMeta: { fontSize: 13, marginTop: 2 },
  circleActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  circleActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  circleActionText: { fontSize: 13, fontWeight: '600' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  codeLabel: { fontSize: 12, fontWeight: '500' },
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  codeValue: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },

  emptyState: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalEmpty: {
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 16,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  friendAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendName: {
    fontSize: 14,
    fontWeight: '600',
  },
  friendSub: {
    fontSize: 12,
    fontWeight: '500',
  },
});
