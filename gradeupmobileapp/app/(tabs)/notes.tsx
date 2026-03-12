import React from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../../src/constants';
import { useAppContext } from '../../src/context/AppContext';
import { Course } from '../../src/types';

export default function NotesScreen() {
  const router = useRouter();
  const { courses, notes, setSelectedSubjectId } = useAppContext();

  const renderSubject = ({ item }: { item: Course }) => (
    <Pressable
      style={styles.subjectCard}
      onPress={() => {
        setSelectedSubjectId(item.id);
        router.push('/notes-list' as any);
      }}
    >
      <View style={styles.subjectContent}>
        <Text style={styles.subjectCode}>{item.id}</Text>
        <Text style={styles.subjectName}>{item.name.toUpperCase()}</Text>
      </View>
      <Feather name="arrow-right" size={20} color={COLORS.textSecondary} />
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={courses}
        keyExtractor={(item) => item.id}
        renderItem={renderSubject}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Notes & Quiz</Text>
                <Text style={styles.subtitle}>STUDY CHALLENGE HUB</Text>
              </View>
              <Pressable style={styles.sparkleBtn}>
                <Feather name="zap" size={18} color={COLORS.navy} />
              </Pressable>
            </View>

            {/* Knowledge Check CTA */}
            <Pressable
              style={styles.ctaCard}
              onPress={() => router.push('/quiz-config' as any)}
            >
              <Text style={styles.ctaTitle}>DAILY KNOWLEDGE CHECK</Text>
              <Text style={styles.ctaDesc}>
                Ready to test your memory? Build a customized AI quiz based on your study materials.
              </Text>
              <View style={styles.ctaBtn}>
                <Text style={styles.ctaBtnText}>CONFIGURE PRACTICE QUIZ</Text>
              </View>
            </Pressable>

            {/* Section Label */}
            <Text style={styles.sectionLabel}>SELECT SUBJECT TO STUDY</Text>
          </>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: { fontSize: 24, fontWeight: '900', color: COLORS.navy, letterSpacing: -0.5 },
  subtitle: { fontSize: 10, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 1.5, marginTop: 2 },
  sparkleBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // CTA Card
  ctaCard: {
    backgroundColor: COLORS.gold,
    borderRadius: 28,
    padding: 24,
    marginBottom: 28,
  },
  ctaTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 1,
    marginBottom: 10,
  },
  ctaDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
    fontWeight: '500',
    marginBottom: 20,
  },
  ctaBtn: {
    backgroundColor: COLORS.navy,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 2,
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 2,
    marginBottom: 14,
  },

  // Subject Card
  subjectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 22,
    marginBottom: 12,
  },
  subjectContent: { flex: 1 },
  subjectCode: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.navy,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subjectName: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
  },
});
