import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <Feather name="alert-circle" size={64} color={COLORS.textSecondary} />
        <Text style={styles.title}>Not Found</Text>
        <Text style={styles.subtitle}>This page doesn't exist.</Text>
        <Pressable style={styles.homeBtn} onPress={() => router.replace('/(tabs)' as any)}>
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.navy,
    marginTop: 24,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: 32,
  },
  homeBtn: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  homeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
});
