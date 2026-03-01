import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';

const PAD = 20;
const SECTION = 24;
const RADIUS_SM = 14;

export default function MeritHub() {
  const theme = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.8 }]}
        >
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Campus & merit</Text>
      </View>

      <View style={[styles.infoCard, { backgroundColor: theme.primary + '14', borderColor: theme.primary + '30' }]}>
        <Text style={[styles.infoText, { color: theme.text }]}>
          Connect for clubs, societies, and merit activities. Find friends who share your interests in campus events and co-curriculars.
        </Text>
      </View>

      <View style={[styles.placeholderCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.placeholderTitle, { color: theme.textSecondary }]}>Coming soon</Text>
        <Text style={[styles.placeholderDesc, { color: theme.textSecondary }]}>
          Pick your interests and we’ll match you with peers for clubs and merit activities.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: PAD, paddingTop: 56, paddingBottom: 48 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  infoCard: {
    borderRadius: RADIUS_SM,
    borderWidth: 1,
    padding: 18,
    marginBottom: SECTION,
  },
  infoText: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  placeholderCard: {
    borderRadius: RADIUS_SM,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  placeholderTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  placeholderDesc: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
