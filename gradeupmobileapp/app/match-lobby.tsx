import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';

const PARTICIPANTS = [
  { id: '1', name: 'You', isYou: true },
  { id: '2', name: 'Player 2', isYou: false },
];

export default function MatchLobbyScreen() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);
  const [participants, setParticipants] = useState(PARTICIPANTS);

  useEffect(() => {
    const addThird = setTimeout(() => {
      setParticipants((prev) => [
        ...prev,
        { id: '3', name: 'Player 3', isYou: false },
      ]);
    }, 2000);
    return () => clearTimeout(addThird);
  }, []);

  useEffect(() => {
    if (countdown <= 0) {
      router.replace('/quiz-gameplay');
      return;
    }
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown, router]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={COLORS.navy} />
        </Pressable>
        <Text style={styles.title}>Match Lobby</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.countdownCard}>
          <Text style={styles.countdownNumber}>{countdown}</Text>
          <Text style={styles.countdownLabel}>Match starting in...</Text>
        </View>

        <View style={styles.participantList}>
          {participants.map((p) => (
            <View key={p.id} style={styles.participantRow}>
              <View style={[styles.avatar, p.isYou && styles.avatarYou]}>
                <Feather name="user" size={24} color={p.isYou ? COLORS.white : COLORS.navy} />
              </View>
              <Text style={styles.participantName}>{p.name}</Text>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 8, marginRight: 8 },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.navy,
  },
  content: { padding: 20, flex: 1 },
  countdownCard: {
    backgroundColor: COLORS.gold,
    borderRadius: 32,
    padding: 40,
    alignItems: 'center',
    marginBottom: 32,
  },
  countdownNumber: {
    fontSize: 72,
    fontWeight: '900',
    color: COLORS.navy,
    marginBottom: 8,
  },
  countdownLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
    opacity: 0.9,
  },
  participantList: { gap: 16 },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarYou: {
    backgroundColor: COLORS.navy,
  },
  participantName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});
