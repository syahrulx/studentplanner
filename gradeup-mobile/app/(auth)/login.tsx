import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { supabase } from '@/src/lib/supabase';

const THEME = {
  primary: '#0c4a6e',
  primaryLight: '#0e7490',
  accent: '#06b6d4',
  bg: '#f0f9ff',
  card: '#ffffff',
  text: '#0c4a6e',
  textSecondary: '#475569',
  border: '#e0f2fe',
  inputBg: '#f0f9ff',
  danger: '#b91c1c',
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (signInError) {
        setError(signInError.message === 'Invalid login credentials' ? 'Invalid email or password' : signInError.message);
        return;
      }
      if (data.session) {
        router.replace('/(tabs)');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: THEME.bg }]}
    >
      <View style={[styles.hero, { backgroundColor: THEME.primary }]}>
        <View style={styles.heroIconWrap}>
          <Feather name="book-open" size={40} color="#fff" />
        </View>
        <Text style={styles.heroTitle}>GradeUp</Text>
        <Text style={styles.heroSubtitle}>Welcome back. Sign in to continue.</Text>
      </View>

      <View style={styles.card}>
        <Text style={[styles.title, { color: THEME.text }]}>Sign in</Text>
        <TextInput
          style={[styles.input, { backgroundColor: THEME.inputBg, borderColor: THEME.border, color: THEME.text }]}
          placeholder="Email"
          placeholderTextColor={THEME.textSecondary}
          value={email}
          onChangeText={(t) => { setEmail(t); setError(null); }}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          editable={!loading}
        />
        <TextInput
          style={[styles.input, { backgroundColor: THEME.inputBg, borderColor: THEME.border, color: THEME.text }]}
          placeholder="Password"
          placeholderTextColor={THEME.textSecondary}
          value={password}
          onChangeText={(t) => { setPassword(t); setError(null); }}
          secureTextEntry
          autoComplete="password"
          editable={!loading}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: THEME.primary },
            pressed && styles.pressed,
            loading && styles.buttonDisabled,
          ]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Log in</Text>
          )}
        </Pressable>
        <View style={styles.links}>
          <Pressable onPress={() => router.push('/(auth)/sign-up')} style={styles.link} disabled={loading}>
            <Text style={[styles.linkText, { color: THEME.primary }]}>Create account</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(auth)/forgot-password')} style={styles.link} disabled={loading}>
            <Text style={[styles.linkTextSecondary, { color: THEME.textSecondary }]}>Forgot password?</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    paddingTop: 56,
    paddingBottom: 32,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: 'center',
  },
  heroIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  card: {
    flex: 1,
    marginHorizontal: 20,
    marginTop: -20,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: '#e0f2fe',
    shadowColor: '#0c4a6e',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 24,
    letterSpacing: -0.3,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    marginBottom: 14,
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    marginBottom: 12,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.7 },
  pressed: { opacity: 0.95 },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  links: {
    marginTop: 24,
    alignItems: 'center',
    gap: 12,
  },
  link: { paddingVertical: 4 },
  linkText: { fontSize: 15, fontWeight: '700' },
  linkTextSecondary: { fontSize: 14, fontWeight: '500' },
});
