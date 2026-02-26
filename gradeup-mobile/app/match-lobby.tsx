import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { COLORS, Icons } from '@/src/constants';

export default function MatchLobby() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icons.ArrowRight size={20} color={COLORS.gray} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <Text style={styles.title}>Match lobby</Text>
      </View>
      <Pressable style={({ pressed }) => [styles.startBtn, pressed && styles.pressed]} onPress={() => router.push('/quiz-gameplay' as any)}>
        <Text style={styles.startBtnText}>Start game</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 24, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  startBtn: { backgroundColor: COLORS.navy, paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  pressed: { opacity: 0.95 },
  startBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '800' },
});
