import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Share, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/src/lib/supabase';
import { useQuiz } from '@/src/context/QuizContext';
import * as quizApi from '@/src/lib/quizApi';

const PAD = 20;
const RADIUS = 20;
const RADIUS_SM = 14;

export default function MatchLobby() {
  const theme = useTheme();
  const { sessionId, inviteCode: paramCode } = useLocalSearchParams<{ sessionId?: string; inviteCode?: string }>();
  const {
    currentSession, participants, myParticipantId, countdown, isReady,
    joinQuiz, setReady, leaveQuiz, refreshParticipants, broadcastGameStart,
  } = useQuiz();

  const [joining, setJoining] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [starting, setStarting] = useState(false);

  // Join session on mount if needed
  useEffect(() => {
    const init = async () => {
      if (currentSession?.id === sessionId) {
        await refreshParticipants();
        return;
      }
      if (sessionId && sessionId !== currentSession?.id) {
        setJoining(true);
        try {
          await joinQuiz(sessionId);
        } catch (e: any) {
          Alert.alert('Could not join session', 'Something went wrong. Please try again.');
          router.back();
        } finally {
          setJoining(false);
        }
      } else if (paramCode) {
        setJoining(true);
        try {
          await joinQuiz(paramCode, true);
        } catch (e: any) {
          Alert.alert('Invalid invite code', 'Double-check the code and try again.');
          router.back();
        } finally {
          setJoining(false);
        }
      }
    };
    init();
  }, [sessionId, paramCode]);

  // Realtime: subscribe to participant changes for instant player-join updates
  useEffect(() => {
    if (!currentSession) return;
    // Initial load
    refreshParticipants();
    // Subscribe to realtime changes on quiz_participants
    const channel = supabase
      .channel(`lobby-participants:${currentSession.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quiz_participants', filter: `session_id=eq.${currentSession.id}` },
        () => refreshParticipants(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentSession?.id]);

  // Countdown reached 0 → navigate to gameplay
  useEffect(() => {
    if (countdown === 0 && currentSession) {
      router.replace({ pathname: '/quiz-gameplay', params: { sessionId: currentSession.id } } as any);
    }
  }, [countdown, currentSession]);

  const handleReady = () => {
    setReady();
  };

  const handleStart = async () => {
    if (!currentSession) return;
    setStarting(true);
    try {
      await quizApi.startSession(currentSession.id);
      // Broadcast to non-host players so they navigate too
      broadcastGameStart();
      // Host navigates immediately
      router.replace({ pathname: '/quiz-gameplay', params: { sessionId: currentSession.id } } as any);
    } catch {
      Alert.alert('Could not start game', 'Please try again.');
    } finally {
      setStarting(false);
    }
  };

  const handleShare = async () => {
    if (!currentSession?.invite_code) return;
    try {
      await Share.share({ message: `Join my quiz game! Code: ${currentSession.invite_code}` });
    } catch {}
  };

  const handleCopy = async () => {
    if (!currentSession?.invite_code) return;
    await Clipboard.setStringAsync(currentSession.invite_code);
    Alert.alert('Copied!', 'Invite code copied to clipboard');
  };

  const handleLeave = () => {
    Alert.alert('Leave Game?', 'You will leave this quiz session.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => { leaveQuiz(); router.back(); } },
    ]);
  };

  if (joining) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.joiningText, { color: theme.textSecondary }]}>Joining session...</Text>
      </View>
    );
  }

  if (!currentSession) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.joiningText, { color: theme.textSecondary }]}>No active session</Text>
        <Pressable style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={styles.btnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // Correctly determine if current user is the host
  const myUserId = participants.find((p) => p.id === myParticipantId)?.user_id;
  const isHost = !!myUserId && currentSession.host_id === myUserId;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleLeave} style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Match Lobby</Text>
      </View>

      {/* Session Info */}
      <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Type</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{currentSession.quiz_type.toUpperCase()}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Questions</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{currentSession.question_count}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Difficulty</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{currentSession.difficulty}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Source</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{currentSession.source_type}</Text>
        </View>
      </View>

      {/* Invite Code */}
      {currentSession.invite_code && (
        <View style={[styles.codeCard, { backgroundColor: '#003366' }]}>
          <Text style={styles.codeLabel}>INVITE CODE</Text>
          <Text style={styles.codeValue}>{currentSession.invite_code}</Text>
          <View style={styles.codeActions}>
            <Pressable style={styles.codeBtn} onPress={handleCopy}>
              <Feather name="copy" size={16} color="#fff" />
              <Text style={styles.codeBtnText}>Copy</Text>
            </Pressable>
            <Pressable style={styles.codeBtn} onPress={handleShare}>
              <Feather name="share" size={16} color="#fff" />
              <Text style={styles.codeBtnText}>Share</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Players */}
      <Text style={[styles.playersLabel, { color: theme.textSecondary }]}>
        PLAYERS ({participants.length})
      </Text>
      <View style={styles.playerList}>
        {participants.map((p, idx) => {
          const initials = (p.profile?.name || 'P').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
          const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
          const bgColor = colors[idx % colors.length];
          return (
            <View key={p.id} style={[styles.playerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={[styles.playerAvatar, { backgroundColor: bgColor }]}>
                <Text style={styles.playerInitial}>{initials}</Text>
              </View>
              <View style={styles.playerBody}>
                <Text style={[styles.playerName, { color: theme.text }]}>{p.profile?.name || 'Player'}</Text>
                <Text style={[styles.playerStatus, { color: theme.textSecondary }]}>
                  {p.user_id === currentSession.host_id ? 'Host' : 'Joined'}
                </Text>
              </View>
              <View style={[styles.readyDot, { backgroundColor: '#10b981' }]} />
            </View>
          );
        })}

        {/* Empty slots */}
        {participants.length < 2 && (
          <View style={[styles.playerCard, styles.emptySlot, { borderColor: theme.border }]}>
            <Feather name="user-plus" size={20} color={theme.textSecondary} />
            <Text style={[styles.waitingText, { color: theme.textSecondary }]}>Waiting for opponent...</Text>
          </View>
        )}
      </View>

      {/* Countdown overlay */}
      {countdown !== null && countdown > 0 && (
        <View style={styles.countdownOverlay}>
          <Text style={styles.countdownNum}>{countdown}</Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        {!isReady ? (
          <Pressable style={[styles.btn, { backgroundColor: '#10b981' }]} onPress={handleReady}>
            <Feather name="check" size={20} color="#fff" />
            <Text style={styles.btnText}>I'm Ready</Text>
          </Pressable>
        ) : isHost ? (
          <Pressable
            style={[styles.btn, { backgroundColor: participants.length >= 2 ? theme.primary : '#94a3b8' }]}
            onPress={handleStart}
            disabled={participants.length < 2 || starting}
          >
            {starting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="play" size={20} color="#fff" />
                <Text style={styles.btnText}>
                  {participants.length >= 2 ? 'Start Game' : 'Waiting for players...'}
                </Text>
              </>
            )}
          </Pressable>
        ) : (
          <View style={[styles.waitingBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[styles.waitingBtnText, { color: theme.textSecondary }]}>Waiting for host to start...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: PAD, paddingTop: 56, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: { width: 44, height: 44, borderRadius: RADIUS_SM, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1 },
  title: { fontSize: 22, fontWeight: '800', flex: 1 },
  joiningText: { fontSize: 16, textAlign: 'center', marginTop: 80 },

  infoCard: { borderRadius: RADIUS_SM, borderWidth: 1, padding: 16, marginBottom: 16, gap: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 13, fontWeight: '700' },

  codeCard: { borderRadius: RADIUS, padding: 24, alignItems: 'center', marginBottom: 20 },
  codeLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, marginBottom: 8 },
  codeValue: { fontSize: 36, fontWeight: '800', color: '#fff', letterSpacing: 6, marginBottom: 16 },
  codeActions: { flexDirection: 'row', gap: 16 },
  codeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12 },
  codeBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  playersLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12 },
  playerList: { gap: 10, flex: 1 },
  playerCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: RADIUS_SM, borderWidth: 1 },
  playerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  playerInitial: { color: '#fff', fontSize: 15, fontWeight: '700' },
  playerBody: { flex: 1 },
  playerName: { fontSize: 15, fontWeight: '700' },
  playerStatus: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  readyDot: { width: 10, height: 10, borderRadius: 5 },
  emptySlot: { borderStyle: 'dashed', borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', paddingVertical: 24, gap: 8 },
  waitingText: { fontSize: 13, fontWeight: '600' },

  countdownOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  countdownNum: { fontSize: 96, fontWeight: '800', color: '#fff' },

  actions: { marginTop: 16 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, borderRadius: RADIUS },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  waitingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, borderRadius: RADIUS, borderWidth: 1 },
  waitingBtnText: { fontSize: 15, fontWeight: '600' },
});
