import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { COLORS, Icons } from '@/src/constants';
import { getHasSeenTutorial, setHasSeenTutorial } from '@/src/storage';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    const seenTutorial = await getHasSeenTutorial();
    if (!seenTutorial) {
      await setHasSeenTutorial(false);
    }
    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Welcome back</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={COLORS.gray}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={COLORS.gray}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          onPress={handleLogin}
        >
          <Text style={styles.primaryButtonText}>Log in</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(auth)/sign-up')} style={styles.link}>
          <Text style={styles.linkText}>Sign up</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(auth)/forgot-password')} style={styles.link}>
          <Text style={styles.linkText}>Forgot password?</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: COLORS.bg,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 28,
    padding: 32,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.navy,
    marginBottom: 28,
    letterSpacing: -0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    marginBottom: 18,
    backgroundColor: COLORS.white,
  },
  primaryButton: {
    backgroundColor: COLORS.navy,
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 12,
  },
  pressed: { opacity: 0.96 },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '800',
  },
  link: { marginTop: 18, alignItems: 'center' },
  linkText: { color: COLORS.navy, fontSize: 14, fontWeight: '600' },
});
