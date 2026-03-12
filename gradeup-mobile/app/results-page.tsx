import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { useTranslations } from '@/src/i18n';

const PAD = 20;
const SECTION = 24;
const RADIUS = 20;
const RADIUS_SM = 14;

export default function ResultsPage() {
  const { language } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const { score, total } = useLocalSearchParams<{ score?: string; total?: string }>();
  const s = parseInt(score ?? '0', 10);
  const t = Math.max(1, parseInt(total ?? '5', 10));
  const correctCount = Math.round(s / 10);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <ThemeIcon name="checkCircle" size={48} color={theme.primary} />
        <Text style={[styles.title, { color: theme.text }]}>{T('quizComplete')}</Text>
        <Text style={[styles.score, { color: theme.primary }]}>{correctCount} / {t}</Text>
        <Text style={[styles.sub, { color: theme.textSecondary }]}>
          {s} {T('points')} • {t} {T('questions')}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.ctaBtn, { backgroundColor: theme.primary }, pressed && styles.pressed]}
          onPress={() => router.replace('/leaderboard' as any)}
        >
          <ThemeIcon name="leaderboard" size={20} color="#fff" />
          <Text style={styles.ctaBtnText}>{T('viewLeaderboard')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]}
          onPress={() => router.replace('/(tabs)/notes' as any)}
        >
          <ThemeIcon name="target" size={20} color={theme.primary} />
          <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{T('backToNotesQuiz')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: PAD, paddingTop: 80, alignItems: 'center' },
  card: {
    alignItems: 'center',
    padding: 32,
    borderRadius: RADIUS,
    borderWidth: 1,
    marginBottom: SECTION,
    width: '100%',
  },
  title: { fontSize: 22, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  score: { fontSize: 42, fontWeight: '800' },
  sub: { fontSize: 14, marginTop: 8 },
  actions: { width: '100%', gap: 12 },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: RADIUS,
  },
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: RADIUS_SM,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.96 },
});
