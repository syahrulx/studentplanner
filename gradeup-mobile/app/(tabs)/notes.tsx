import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';

const NAVY = '#003366';
const BG = '#f8fafc';
const CARD = '#ffffff';
const TEXT_PRIMARY = '#0f172a';
const TEXT_SECONDARY = '#94a3b8';
const DIVIDER = '#f1f5f9';

const ACCENT_PALETTE = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#ef4444', '#6366f1',
];

export default function NotesHub() {
  const { courses, notes, language, getSubjectColor } = useApp();
  const T = useTranslations(language);

  const getColor = (courseId: string, idx: number): string => {
    const custom = getSubjectColor?.(courseId);
    if (custom && custom !== '#003366') return custom;
    return ACCENT_PALETTE[idx % ACCENT_PALETTE.length];
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.headerIconWrap}>
            <Feather name="book-open" size={20} color={NAVY} />
          </View>
          <View>
            <Text style={s.headerTitle}>{T('studyTitle')}</Text>
            <Text style={s.headerSub}>{courses.length} subjects · {notes.length} notes</Text>
          </View>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Grouped Subject List */}
        <Text style={s.sectionLabel}>{T('yourSubjects')}</Text>
        <View style={s.groupCard}>
          {courses.map((course, idx) => {
            const count = notes.filter((n) => n.subjectId === course.id).length;
            const color = getColor(course.id, idx);

            return (
              <Pressable
                key={course.id}
                style={({ pressed }) => [s.row, pressed && { backgroundColor: '#f8fafc' }]}
                onPress={() => router.push({ pathname: '/notes-list' as any, params: { subjectId: course.id } })}
              >
                <View style={[s.colorDot, { backgroundColor: color }]} />
                <View style={s.rowBody}>
                  <Text style={s.rowTitle}>{course.id}</Text>
                  <Text style={s.rowSub} numberOfLines={1}>{course.name}</Text>
                </View>
                <Text style={s.rowCount}>{count}</Text>
                <Feather name="chevron-right" size={16} color="#cbd5e1" />
                <View style={s.divider} />
              </Pressable>
            );
          })}

          {/* Add Subject — last row inside the group */}
          <Pressable
            style={({ pressed }) => [s.row, pressed && { backgroundColor: '#f8fafc' }]}
            onPress={() => router.push('/add-subject' as any)}
          >
            <View style={[s.colorDot, { backgroundColor: NAVY, borderRadius: 5 }]}>
              <Feather name="plus" size={10} color="#ffffff" />
            </View>
            <View style={s.rowBody}>
              <Text style={[s.rowTitle, { color: NAVY }]}>{T('addSubject')}</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#cbd5e1" />
          </Pressable>
        </View>

        {/* QUIZ AND PRACTICE FEATURE HELD PER USER REQUEST
        <Text style={s.sectionLabel}>QUIZ & PRACTICE</Text>
        <View style={s.groupCard}>
          <Pressable
            style={({ pressed }) => [s.row, pressed && { backgroundColor: '#f8fafc' }]}
            onPress={() => router.push('/quiz-config' as any)}
          >
            <View style={[s.colorDot, { backgroundColor: '#3b82f6' }]} />
            <View style={s.rowBody}>
              <Text style={s.rowTitle}>Flashcard Quiz</Text>
              <Text style={s.rowSub}>Practice from your flashcard decks</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#cbd5e1" />
            <View style={s.divider} />
          </Pressable>
          ...
        </View>
        */}

        {/* Leaderboard */}
        <Text style={s.sectionLabel}>{T('leaderboard').toUpperCase()}</Text>
        <View style={s.groupCard}>
          <Pressable
            style={({ pressed }) => [s.row, pressed && { backgroundColor: '#f8fafc' }]}
            onPress={() => router.push('/leaderboard' as any)}
          >
            <View style={[s.colorDot, { backgroundColor: '#f59e0b' }]} />
            <View style={s.rowBody}>
              <Text style={s.rowTitle}>{T('quizTaskRank')}</Text>
              <Text style={s.rowSub}>{T('viewLeaderboard')}</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#cbd5e1" />
          </Pressable>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 64 : 48,
    paddingBottom: 4,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0,51,102,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: TEXT_PRIMARY, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, fontWeight: '500', color: TEXT_SECONDARY, marginTop: 2 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 28 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_SECONDARY,
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingLeft: 4,
  },

  // Grouped card (iOS Settings style)
  groupCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    position: 'relative',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: TEXT_PRIMARY },
  rowSub: { fontSize: 13, fontWeight: '400', color: TEXT_SECONDARY, marginTop: 1 },
  rowCount: { fontSize: 15, fontWeight: '500', color: TEXT_SECONDARY, marginRight: 4 },

  divider: {
    position: 'absolute',
    bottom: 0,
    left: 54,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: DIVIDER,
  },

  // Add Subject
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
    marginBottom: 32,
    marginTop: -12,
  },
  addText: { fontSize: 15, fontWeight: '600', color: NAVY },
});
