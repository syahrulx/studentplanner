import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';

export default function NotesHub() {
  const { courses, notes } = useApp();
  const theme = useTheme();

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Notes & Quiz</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Knowledge Hub</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.quizCard, { backgroundColor: theme.focusCard }, pressed && styles.pressed]}
        onPress={() => router.push('/quiz-config' as any)}
      >
        <View style={styles.quizInner}>
          <ThemeIcon name="sparkles" size={16} color={theme.accent3} />
          <Text style={[styles.quizLabel, { color: theme.accent3 }]}>Daily Focus</Text>
        </View>
        <Text style={[styles.quizTitle, { color: theme.focusCardText }]}>Knowledge Check</Text>
        <Text style={[styles.quizDesc, { color: theme.focusCardText, opacity: 0.9 }]}>AI-generated quizzes from your notes.</Text>
        <View style={[styles.quizArrow, { backgroundColor: theme.card }]}>
          <ThemeIcon name="arrowRight" size={20} color={theme.primary} />
        </View>
      </Pressable>

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Your Subjects</Text>
      {courses.map((course) => {
        const count = notes.filter((n) => n.subjectId === course.id).length;
        return (
          <Pressable
            key={course.id}
            style={({ pressed }) => [styles.subjectCard, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]}
            onPress={() => router.push({ pathname: '/notes-list' as any, params: { subjectId: course.id } })}
          >
            <View style={styles.subjectRow}>
              <View style={[styles.subjectIcon, { backgroundColor: theme.backgroundSecondary }]}>
                <ThemeIcon name="bookOpen" size={18} color={theme.primary} />
              </View>
              <Text style={[styles.subjectCode, { color: theme.text }]}>{course.id}</Text>
              <Text style={[styles.subjectCount, { color: theme.textSecondary }]}>{count} Notes</Text>
            </View>
            <Text style={[styles.subjectName, { color: theme.textSecondary }]}>{course.name}</Text>
          </Pressable>
        );
      })}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 100 },
  header: { marginBottom: 28 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, marginTop: 6, fontWeight: '600' },
  quizCard: { borderRadius: 28, padding: 24, marginBottom: 28, overflow: 'hidden' },
  pressed: { opacity: 0.96 },
  quizInner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  quizLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  quizTitle: { fontSize: 20, fontWeight: '800', marginBottom: 6, lineHeight: 26 },
  quizDesc: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
  quizArrow: { alignSelf: 'flex-end', padding: 12, borderRadius: 14 },
  sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 2.5, marginBottom: 16 },
  subjectCard: { padding: 18, borderRadius: 22, marginBottom: 14, borderWidth: 1 },
  subjectRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  subjectIcon: { width: 36, height: 36, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  subjectCode: { flex: 1, fontSize: 17, fontWeight: '800' },
  subjectCount: { fontSize: 10, fontWeight: '700' },
  subjectName: { fontSize: 13, marginLeft: 50, lineHeight: 18 },
});
