import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { supabase } from '@/src/lib/supabase';
import { COLORS } from '@/src/constants';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Reached only via the `rencana://reset-password#access_token=...&type=recovery`
 * deep link captured in app/(auth)/_layout.tsx, which already calls
 * supabase.auth.setSession() with the recovery tokens before routing here —
 * this screen just needs an active session to call updateUser() against.
 */
export default function ResetPassword() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) {
        setHasSession(!!data.session);
        setCheckingSession(false);
      }
    });
    return () => { alive = false; };
  }, []);

  async function handleReset() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setDone(true);
    } catch {
      setError('Something went wrong. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={COLORS.navy} size="large" />
      </View>
    );
  }

  // No recovery session — either this screen was opened directly, or the
  // reset link expired. There is nothing useful to do here except send the
  // user back to request a fresh link.
  if (!hasSession) {
    return (
      <View style={styles.container}>
        <Feather name="alert-circle" size={40} color="#ef4444" style={{ marginBottom: 16 }} />
        <Text style={styles.title}>Link expired</Text>
        <Text style={styles.body}>
          This password reset link is no longer valid. Request a new one from the login screen.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() => router.replace('/(auth)/forgot-password')}
        >
          <Text style={styles.buttonText}>Request new link</Text>
        </Pressable>
      </View>
    );
  }

  if (done) {
    return (
      <View style={styles.container}>
        <Feather name="check-circle" size={40} color="#16a34a" style={{ marginBottom: 16 }} />
        <Text style={styles.title}>Password updated</Text>
        <Text style={styles.body}>You're signed in with your new password.</Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.body}>Choose a new password for your account.</Text>

        <View style={styles.inputWrap}>
          <Feather name="lock" size={18} color="#94a3b8" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor="#94a3b8"
            value={password}
            onChangeText={(t) => { setPassword(t); setError(null); }}
            secureTextEntry={!showPassword}
            autoComplete="password-new"
            editable={!loading}
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
            <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color="#94a3b8" />
          </Pressable>
        </View>

        <View style={styles.inputWrap}>
          <Feather name="lock" size={18} color="#94a3b8" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.input}
            placeholder="Confirm new password"
            placeholderTextColor="#94a3b8"
            value={confirmPassword}
            onChangeText={(t) => { setConfirmPassword(t); setError(null); }}
            secureTextEntry={!showPassword}
            autoComplete="password-new"
            editable={!loading}
            onSubmitEditing={handleReset}
          />
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={14} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.button, (pressed || loading) && styles.pressed]}
          onPress={handleReset}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>Update password</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: COLORS.bg },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  body: { fontSize: 14, color: COLORS.gray, marginBottom: 24, lineHeight: 20 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  input: { flex: 1, paddingVertical: 15, fontSize: 15, color: '#0f172a' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { color: '#dc2626', fontSize: 13, fontWeight: '500', flex: 1 },
  button: { backgroundColor: COLORS.navy, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  pressed: { opacity: 0.9 },
  buttonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
});
