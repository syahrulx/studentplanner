import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
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
        <Text style={[styles.title, { color: theme.text }]}>Notes & Quiz</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Your knowledge hub</Text>
      </View>

      {/* Knowledge Check CTA */}
      <Pressable
        style={({ pressed }) => [
          styles.ctaCard,
          { backgroundColor: theme.primary },
          pressed && styles.pressed,
        ]}
        onPress={() => router.push('/quiz-config' as any)}
      >
        <View style={[styles.ctaBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <ThemeIcon name="sparkles" size={14} color="#fff" />
          <Text style={styles.ctaBadgeText}>Daily Focus</Text>
        </View>
        <Text style={styles.ctaTitle}>Knowledge Check</Text>
        <Text style={styles.ctaDesc}>AI-generated quizzes from your notes</Text>
        <View style={[styles.ctaArrow, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
          <ThemeIcon name="arrowRight" size={20} color="#fff" />
        </View>
      </Pressable>

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
        </View>
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
  ctaCard: {
    borderRadius: RADIUS,
    padding: 22,
    marginBottom: SECTION,
    overflow: 'hidden',
    position: 'relative',
  },
  ctaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 14,
  },
  ctaBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: '#fff' },
  ctaTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 6, letterSpacing: -0.3 },
  ctaDesc: { fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 18 },
  ctaArrow: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
