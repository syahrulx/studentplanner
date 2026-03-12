import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';

const GROUPS = [
  { id: 'g1', name: 'CSC584 Class', color: COLORS.navy },
  { id: 'g2', name: 'IPS551 Project', color: COLORS.gold },
  { id: 'g3', name: 'ICT551 Lab', color: COLORS.blue },
];

const KEYWORDS = ['assignment', 'due', 'submit', 'deadline', 'quiz', 'project'];

export default function GroupsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={COLORS.navy} />
        </Pressable>
        <Text style={styles.headerTitle}>Source Groups</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Group Cards */}
        {GROUPS.map((g) => (
          <View key={g.id} style={styles.groupCard}>
            <View style={[styles.groupBar, { backgroundColor: g.color }]} />
            <View style={styles.groupContent}>
              <Text style={styles.groupName}>{g.name}</Text>
              <Feather name="chevron-right" size={20} color={COLORS.textSecondary} />
            </View>
          </View>
        ))}

        {/* Smart Keyword Rules */}
        <View style={styles.keywordsCard}>
          <Text style={styles.keywordsTitle}>Smart Keyword Rules</Text>
          <View style={styles.keywordPills}>
            {KEYWORDS.map((k) => (
              <View key={k} style={styles.keywordPill}>
                <Text style={styles.keywordText}>{k}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Create New Group */}
        <Pressable style={styles.createBtn}>
          <Feather name="plus" size={24} color={COLORS.textSecondary} />
          <Text style={styles.createBtnText}>Create New Group</Text>
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

  groupCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  groupBar: {
    width: 6,
  },
  groupContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },

  keywordsCard: {
    backgroundColor: COLORS.navy,
    borderRadius: 16,
    padding: 20,
    marginTop: 24,
    marginBottom: 24,
  },
  keywordsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 16,
  },
  keywordPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keywordPill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  keywordText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.white,
  },

  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.white,
  },
  createBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
});
