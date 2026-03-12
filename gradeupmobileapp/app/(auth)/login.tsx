import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { COLORS } from '../../src/constants';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Login</Text>
        <Text style={styles.subtitle}>Access your personalized study hub.</Text>

        <TextInput
          style={styles.input}
          placeholder="2022456789@student.uitm.edu.my"
          placeholderTextColor={COLORS.textSecondary}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={COLORS.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Pressable
          style={({ pressed }) => [styles.forgotLink, pressed && styles.pressed]}
          onPress={() => router.push('/(auth)/forgot-password')}
        >
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={handleLogin}
        >
          <Text style={styles.buttonText}>Login</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
          onPress={() => router.push('/(auth)/sign-up')}
        >
          <Text style={styles.linkText}>Don't have an account? </Text>
          <Text style={styles.linkHighlight}>Sign Up</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>Prototype • AI Simulated Hub</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    paddingTop: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.navy,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: 32,
  },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.navy,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotText: {
    fontSize: 14,
    color: COLORS.gold,
    fontWeight: '600',
  },
  button: {
    backgroundColor: COLORS.navy,
    paddingVertical: 18,
    borderRadius: 24,
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '700',
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  linkText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  linkHighlight: {
    fontSize: 15,
    color: COLORS.gold,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
  footer: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
});
