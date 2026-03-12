import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';

export default function QuizModeSelectionScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={COLORS.navy} />
        </Pressable>
        <Text style={styles.title}>Select Mode</Text>
      </View>

      <View style={styles.content}>
        <Pressable
          style={styles.modeCard}
          onPress={() => router.push('/quiz-gameplay')}
        >
          <View style={styles.iconWrapBlue}>
            <Feather name="user" size={32} color={COLORS.white} />
          </View>
          <Text style={styles.modeTitle}>Solo Practice</Text>
          <Text style={styles.modeDesc}>
            Practice at your own pace. No pressure, just you and the questions.
          </Text>
        </Pressable>

        <Pressable
          style={styles.modeCardNavy}
          onPress={() => router.push('/match-lobby')}
        >
          <View style={styles.iconWrapGold}>
            <Feather name="zap" size={32} color={COLORS.white} />
          </View>
          <Text style={styles.modeTitleWhite}>Multiplayer VS</Text>
          <Text style={styles.modeDescWhite}>
            Challenge friends in real-time. Compete for the highest score.
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  content: { padding: 20, gap: 20 },
  modeCard: {
    backgroundColor: COLORS.white,
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconWrapBlue: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modeTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.navy,
    marginBottom: 8,
  },
  modeDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  modeCardNavy: {
    backgroundColor: COLORS.navy,
    borderRadius: 32,
    padding: 24,
  },
  iconWrapGold: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modeTitleWhite: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 8,
  },
  modeDescWhite: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 22,
  },
});
