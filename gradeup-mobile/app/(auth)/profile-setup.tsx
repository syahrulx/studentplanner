import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { COLORS } from '@/src/constants';

export default function ProfileSetup() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile setup</Text>
      <Pressable style={({ pressed }) => [styles.button, pressed && styles.pressed]} onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.buttonText}>Finish</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: COLORS.bg },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 24 },
  button: { backgroundColor: COLORS.navy, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  pressed: { opacity: 0.9 },
  buttonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
});
