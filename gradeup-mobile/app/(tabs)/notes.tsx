import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';

const PAD = 20;
const SECTION = 24;
const RADIUS = 20;
const RADIUS_SM = 14;

export default function NotesHub() {
  const { courses, notes } = useApp();
  const theme = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.headerWrap}>
        <Text style={[styles.title, { color: theme.text }]}>Study</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Your notes power flashcards & quizzes</Text>
      </View>

      {/* How notes become flashcards & quiz — clear for users */}
      <View style={[styles.notesTipCard, { backgroundColor: theme.primary + '14', borderColor: theme.primary + '30' }]}>
        <View style={styles.notesTipRow}>
          <View style={[styles.notesTipIconWrap, { backgroundColor: theme.primary + '24' }]}>
            <ThemeIcon name="layers" size={18} color={theme.primary} />
          </View>
          <View style={styles.notesTipBody}>
            <Text style={[styles.notesTipTitle, { color: theme.text }]}>Notes → Flashcards & Quiz</Text>
            <Text style={[styles.notesTipDesc, { color: theme.textSecondary }]}>
              Open a subject below to view notes. From any note you can create flashcards or a practice quiz.
            </Text>
          </View>
        </View>
      </View>

      {/* Subjects */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>YOUR SUBJECTS</Text>
        <View style={styles.subjectList}>
          {courses.map((course) => {
            const count = notes.filter((n) => n.subjectId === course.id).length;
            return (
              <Pressable
                key={course.id}
                style={({ pressed }) => [
                  styles.subjectCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                  pressed && styles.pressed,
                ]}
                onPress={() => router.push({ pathname: '/notes-list' as any, params: { subjectId: course.id } })}
              >
                <View style={[styles.subjectIconWrap, { backgroundColor: theme.primary + '18' }]}>
                  <ThemeIcon name="bookOpen" size={20} color={theme.primary} />
                </View>
                <View style={styles.subjectBody}>
                  <View style={styles.subjectRow}>
                    <Text style={[styles.subjectCode, { color: theme.text }]}>{course.id}</Text>
                    <View style={[styles.countPill, { backgroundColor: theme.backgroundSecondary }]}>
                      <Text style={[styles.countText, { color: theme.textSecondary }]}>{count}</Text>
                    </View>
                  </View>
                  <Text style={[styles.subjectName, { color: theme.textSecondary }]} numberOfLines={1}>{course.name}</Text>
                </View>
                <ThemeIcon name="arrowRight" size={18} color={theme.textSecondary} />
              </Pressable>
            );
          })}
          <Pressable
            style={({ pressed }) => [
              styles.addSubjectCard,
              { backgroundColor: theme.card, borderColor: theme.border, borderStyle: 'dashed' },
              pressed && styles.pressed,
            ]}
            onPress={() => router.push('/add-subject' as any)}
          >
            <View style={[styles.addSubjectIconWrap, { backgroundColor: theme.primary + '14' }]}>
              <Feather name="plus" size={24} color={theme.primary} />
            </View>
            <View style={styles.subjectBody}>
              <Text style={[styles.addSubjectLabel, { color: theme.primary }]}>Add subject</Text>
              <Text style={[styles.subjectName, { color: theme.textSecondary }]}>Create a new subject for notes & flashcards</Text>
            </View>
            <Feather name="chevron-right" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>LEADERBOARD</Text>
        <Pressable
          style={({ pressed }) => [
            styles.subjectCard,
            { backgroundColor: theme.card, borderColor: theme.border },
            pressed && styles.pressed,
          ]}
          onPress={() => router.push('/leaderboard' as any)}
        >
          <View style={[styles.subjectIconWrap, { backgroundColor: (theme.accent3 || theme.accent || theme.primary) + '18' }]}>
            <ThemeIcon name="leaderboard" size={20} color={theme.accent3 || theme.accent || theme.primary} />
          </View>
          <View style={styles.subjectBody}>
            <Text style={[styles.subjectCode, { color: theme.text }]}>Quiz & Task Rank</Text>
            <Text style={[styles.subjectName, { color: theme.textSecondary }]} numberOfLines={1}>View leaderboard</Text>
          </View>
          <ThemeIcon name="arrowRight" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: PAD, paddingTop: 56, paddingBottom: 24 },
  headerWrap: { marginBottom: SECTION },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 6, fontWeight: '500' },
  notesTipCard: {
    borderRadius: RADIUS_SM,
    borderWidth: 1,
    padding: 16,
    marginBottom: SECTION,
  },
  notesTipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  notesTipIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesTipBody: { flex: 1, minWidth: 0 },
  notesTipTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  notesTipDesc: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  pressed: { opacity: 0.96 },
  section: { marginBottom: SECTION },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 14 },
  subjectList: { gap: 12 },
  subjectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: RADIUS_SM,
    borderWidth: 1,
  },
  addSubjectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: RADIUS_SM,
    borderWidth: 1,
  },
  addSubjectIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  addSubjectLabel: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  subjectIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  subjectBody: { flex: 1, minWidth: 0 },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  subjectCode: { fontSize: 16, fontWeight: '800' },
  countPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  countText: { fontSize: 11, fontWeight: '700' },
  subjectName: { fontSize: 13, fontWeight: '500' },
});
