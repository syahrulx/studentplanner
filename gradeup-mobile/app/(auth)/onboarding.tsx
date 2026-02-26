import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { COLORS } from '@/src/constants';

export default function Onboarding() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>GradeUp</Text>
      <Text style={styles.subtitle}>AI-powered study companion for UiTM students</Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => router.replace('/(auth)/login')}
      >
        <Text style={styles.buttonText}>Get Started</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: COLORS.bg,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 17,
    color: COLORS.gray,
    textAlign: 'center',
    marginBottom: 56,
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: COLORS.navy,
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 22,
  },
  buttonPressed: { opacity: 0.96 },
  buttonText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '800',
  },
});
