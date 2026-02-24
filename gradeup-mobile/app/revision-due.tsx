import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { schedulePostponedRevision } from '@/src/revisionNotifications';

const POSTPONE_OPTIONS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
];

export default function RevisionDueScreen() {
  const theme = useTheme();

  const handlePostpone = async (minutes: number) => {
    await schedulePostponedRevision(minutes);
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: theme.primary + '22' }]}>
          <ThemeIcon name="clock" size={40} color={theme.primary} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Time to study</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Your revision reminder. Start now or postpone if you’re busy.
        </Text>

        <Pressable
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.primary }, pressed && styles.pressed]}
          onPress={() => router.back()}
        >
          <Text style={[styles.primaryBtnText, { color: theme.textInverse }]}>Start studying</Text>
        </Pressable>

        <Text style={[styles.postponeLabel, { color: theme.textSecondary }]}>Postpone</Text>
        <View style={styles.postponeRow}>
          {POSTPONE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.minutes}
              style={({ pressed }) => [styles.postponeBtn, { backgroundColor: theme.background, borderColor: theme.border }, pressed && styles.pressed]}
              onPress={() => handlePostpone(opt.minutes)}
            >
              <Text style={[styles.postponeBtnText, { color: theme.text }]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={({ pressed }) => [styles.postponeDateBtn, { backgroundColor: theme.background, borderColor: theme.primary }, pressed && styles.pressed]}
          onPress={() => router.push('/revision-postpone')}
        >
          <ThemeIcon name="calendar" size={18} color={theme.primary} />
          <Text style={[styles.postponeDateBtnText, { color: theme.primary }]}>Choose date & time</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, borderRadius: 28, borderWidth: 1, padding: 28, alignItems: 'center' },
  iconWrap: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 28 },
  primaryBtn: { width: '100%', paddingVertical: 16, borderRadius: 20, alignItems: 'center', marginBottom: 24 },
  primaryBtnText: { fontSize: 16, fontWeight: '800' },
  postponeLabel: { fontSize: 12, fontWeight: '700', marginBottom: 12 },
  postponeRow: { flexDirection: 'row', gap: 12 },
  postponeBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  postponeBtnText: { fontSize: 14, fontWeight: '700' },
  postponeDateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12, paddingVertical: 14, borderRadius: 16, borderWidth: 1 },
  postponeDateBtnText: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.9 },
});
