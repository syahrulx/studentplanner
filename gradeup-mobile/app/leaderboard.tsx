import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';

export default function Leaderboard() {
  const { user } = useApp();
  const rows = [
    { rank: 1, name: 'Ahmad', score: 98 },
    { rank: 2, name: user.name.split(' ')[0], score: 85 },
    { rank: 3, name: 'Siti', score: 82 },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icons.ArrowRight size={20} color={COLORS.gray} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <Text style={styles.title}>Leaderboard</Text>
      </View>
      {rows.map((r) => (
        <View key={r.rank} style={styles.row}>
          <Text style={styles.rank}>#{r.rank}</Text>
          <Text style={styles.name}>{r.name}</Text>
          <Text style={styles.score}>{r.score}</Text>
        </View>
      ))}
      <View style={{ height: 48 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 24, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.navy },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  rank: { width: 36, fontSize: 14, fontWeight: '800', color: COLORS.gold },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.navy },
  score: { fontSize: 16, fontWeight: '800', color: COLORS.navy },
});
