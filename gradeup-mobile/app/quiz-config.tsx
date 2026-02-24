import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { COLORS, Icons } from '@/src/constants';

export default function QuizConfig() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icons.ArrowRight size={20} color={COLORS.gray} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <Text style={styles.title}>Quiz setup</Text>
      </View>
      <Text style={styles.subtitle}>Choose mode to start</Text>
      <Pressable style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]} onPress={() => router.push('/quiz-mode-selection' as any)}>
        <Text style={styles.primaryBtnText}>Start quiz</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 24, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.navy },
  subtitle: { fontSize: 14, color: COLORS.gray, marginBottom: 24 },
  primaryBtn: { backgroundColor: COLORS.navy, paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  pressed: { opacity: 0.95 },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '800' },
});
