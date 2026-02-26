import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS, Icons } from '@/src/constants';

export default function ResultsPage() {
  const { score } = useLocalSearchParams<{ score?: string }>();
  const s = parseInt(score ?? '0', 10);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quiz complete</Text>
      <Text style={styles.score}>{s} / 5</Text>
      <Pressable style={({ pressed }) => [styles.btn, pressed && styles.pressed]} onPress={() => router.replace('/leaderboard' as any)}>
        <Text style={styles.btnText}>View leaderboard</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 24, paddingTop: 48, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 16 },
  score: { fontSize: 48, fontWeight: '800', color: COLORS.gold, marginBottom: 32 },
  btn: { backgroundColor: COLORS.navy, paddingVertical: 16, paddingHorizontal: 32, borderRadius: 16 },
  pressed: { opacity: 0.95 },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: '800' },
});
