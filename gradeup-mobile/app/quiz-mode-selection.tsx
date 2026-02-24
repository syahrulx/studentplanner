import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { COLORS, Icons } from '@/src/constants';

export default function QuizModeSelection() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icons.ArrowRight size={20} color={COLORS.gray} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <Text style={styles.title}>Quiz mode</Text>
      </View>
      <Pressable style={({ pressed }) => [styles.modeBtn, pressed && styles.pressed]} onPress={() => router.push('/quiz-gameplay' as any)}>
        <Text style={styles.modeBtnText}>Solo</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [styles.modeBtn, pressed && styles.pressed]} onPress={() => router.push('/match-lobby' as any)}>
        <Text style={styles.modeBtnText}>Multiplayer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 24, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.navy },
  modeBtn: { backgroundColor: COLORS.white, paddingVertical: 20, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  pressed: { opacity: 0.95 },
  modeBtnText: { fontSize: 16, fontWeight: '800', color: COLORS.navy },
});
