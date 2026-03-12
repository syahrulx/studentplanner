import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';

export default function AIExtractionScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={COLORS.navy} />
        </Pressable>
        <Text style={styles.headerTitle}>AI Extraction</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>Extraction Preview</Text>
          <Text style={styles.previewText}>
            • ISP573 Case Study - Due Dec 26, 12:00{'\n'}
            • LCC401 Critical Reading - Due Dec 26, 17:00{'\n'}
            • TAC451 Mandarin Test - Due Dec 27, 14:00
          </Text>
        </View>

        <Pressable
          style={styles.addBtn}
          onPress={() => router.back()}
        >
          <Text style={styles.addBtnText}>Add to Planner</Text>
        </Pressable>
      </ScrollView>
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
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  backBtn: { padding: 4, marginRight: 12 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.navy,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  previewCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  previewLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 12,
  },
  previewText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 24,
  },

  addBtn: {
    backgroundColor: COLORS.navy,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
});
