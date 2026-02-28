import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';

const PAD = 20;
const SECTION = 24;
const RADIUS = 20;
const RADIUS_SM = 14;

export default function QuizModeSelection() {
  const theme = useTheme();
  const { folderId, total, fromBuilder, subjectId } = useLocalSearchParams<{
    folderId?: string;
    total?: string;
    fromBuilder?: string;
    subjectId?: string;
  }>();
  const params = {
    folderId: folderId || '_all',
    total: total || '5',
    ...(subjectId && { subjectId }),
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: '#f1f5f9' }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Choose mode</Text>
      </View>

      {total && (
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{total} questions ready</Text>
      )}

      <View style={styles.cards}>
        {/* Solo Practice - white card */}
        <Pressable
          style={({ pressed }) => [styles.modeCard, styles.soloCard, pressed && styles.pressed]}
          onPress={() => router.push({ pathname: '/quiz-gameplay', params } as any)}
        >
          <View style={styles.soloIconWrap}>
            <Feather name="user" size={24} color="#64748b" />
          </View>
          <View style={styles.modeCardBody}>
            <Text style={styles.soloTitle}>Solo Practice</Text>
            <Text style={styles.soloDesc}>Personal focus, no timers, learn at your own pace.</Text>
          </View>
        </Pressable>

        {/* Multiplayer VS - dark blue card */}
        <Pressable
          style={({ pressed }) => [styles.modeCard, styles.multiCard, pressed && styles.pressed]}
          onPress={() => router.push({ pathname: '/match-lobby', params } as any)}
        >
          <View style={styles.multiIconWrap}>
            <ThemeIcon name="sparkles" size={22} color="#fff" />
          </View>
          <View style={styles.modeCardBody}>
            <Text style={styles.multiTitle}>Multiplayer VS</Text>
            <Text style={styles.multiDesc}>Battle classmates real-time and climb the leaderboard.</Text>
          </View>
        </Pressable>
      </View>

      <Text style={styles.footer}>AI SIMULATED MATCHMAKING ACTIVE</Text>
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: PAD, paddingTop: 56, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: RADIUS_SM, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1 },
  title: { fontSize: 22, fontWeight: '800', flex: 1 },
  subtitle: { fontSize: 13, fontWeight: '600', marginBottom: SECTION },
  cards: { gap: 16 },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 20,
    borderRadius: RADIUS,
    minHeight: 100,
  },
  soloCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  soloIconWrap: {
    width: 52,
    height: 52,
    borderRadius: RADIUS_SM,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  multiCard: {
    backgroundColor: '#0c4a6e',
  },
  multiIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  modeCardBody: { flex: 1, minWidth: 0 },
  soloTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  soloDesc: { fontSize: 14, color: '#64748b', lineHeight: 20 },
  multiTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 6 },
  multiDesc: { fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 20 },
  footer: {
    marginTop: SECTION,
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  pressed: { opacity: 0.96 },
});
