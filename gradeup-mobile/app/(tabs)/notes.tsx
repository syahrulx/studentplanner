import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';

export default function NotesHub() {
  const { courses, notes } = useApp();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Notes & Quiz</Text>
        <Text style={styles.subtitle}>Knowledge Hub</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.quizCard, pressed && styles.pressed]}
        onPress={() => router.push('/quiz-config' as any)}
      >
        <View style={styles.quizInner}>
          <Icons.Sparkles size={16} color={COLORS.gold} />
          <Text style={styles.quizLabel}>Daily Focus</Text>
        </View>
        <Text style={styles.quizTitle}>Knowledge Check</Text>
        <Text style={styles.quizDesc}>AI-generated quizzes from your notes.</Text>
        <View style={styles.quizArrow}>
          <Icons.ArrowRight size={20} color={COLORS.navy} />
        </View>
      </Pressable>

      <Text style={styles.sectionTitle}>Your Subjects</Text>
      {courses.map((course) => {
        const count = notes.filter((n) => n.subjectId === course.id).length;
        return (
          <Pressable
            key={course.id}
            style={({ pressed }) => [styles.subjectCard, pressed && styles.pressed]}
            onPress={() => router.push({ pathname: '/notes-list' as any, params: { subjectId: course.id } })}
          >
            <View style={styles.subjectRow}>
              <View style={styles.subjectIcon}>
                <Icons.BookOpen size={18} color={COLORS.gray} />
              </View>
              <Text style={styles.subjectCode}>{course.id}</Text>
              <Text style={styles.subjectCount}>{count} Notes</Text>
            </View>
            <Text style={styles.subjectName}>{course.name}</Text>
          </Pressable>
        );
      })}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 100 },
  header: { marginBottom: 28 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.navy, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: COLORS.gray, marginTop: 6, fontWeight: '600' },
  quizCard: {
    backgroundColor: COLORS.navy,
    borderRadius: 28,
    padding: 24,
    marginBottom: 28,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.96 },
  quizInner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  quizLabel: { fontSize: 10, fontWeight: '800', color: COLORS.gold, letterSpacing: 2 },
  quizTitle: { fontSize: 20, fontWeight: '800', color: COLORS.white, marginBottom: 6, lineHeight: 26 },
  quizDesc: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 16, lineHeight: 18 },
  quizArrow: { alignSelf: 'flex-end', backgroundColor: COLORS.white, padding: 12, borderRadius: 14 },
  sectionTitle: { fontSize: 10, fontWeight: '800', color: COLORS.gray, letterSpacing: 2.5, marginBottom: 16 },
  subjectCard: {
    backgroundColor: COLORS.white,
    padding: 18,
    borderRadius: 22,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  subjectRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  subjectIcon: { width: 36, height: 36, borderRadius: 14, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  subjectCode: { flex: 1, fontSize: 17, fontWeight: '800', color: COLORS.navy },
  subjectCount: { fontSize: 10, color: COLORS.gray, fontWeight: '700' },
  subjectName: { fontSize: 13, color: COLORS.gray, marginLeft: 50, lineHeight: 18 },
});
