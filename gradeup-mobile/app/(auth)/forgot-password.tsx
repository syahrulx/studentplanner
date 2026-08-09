import { useState } from 'react';
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

// Same HTTPS bridge page used for signup email verification — it already
// correctly reopens the app via the `rencana://` deep link after Supabase
// finishes its part in the system browser. See app/(auth)/sign-up.tsx for
// why a direct `rencana://` redirectTo doesn't work from iOS Safari.
const AUTH_BRIDGE_BASE =
  (process.env.EXPO_PUBLIC_AUTH_BRIDGE_BASE as string | undefined) || 'https://aizztech.com';
const PASSWORD_RESET_REDIRECT = `${AUTH_BRIDGE_BASE}/auth/login`;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email address.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Always show the same success state whether or not the account
      // exists — matches Supabase's own behavior (it never reveals which
      // emails are registered) and prevents this screen being used to
      // enumerate accounts.
      await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo: PASSWORD_RESET_REDIRECT });
      setSent(true);
    } catch {
      setError('Could not send the reset email. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <Feather name="mail" size={40} color={COLORS.navy} style={{ marginBottom: 16 }} />
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.body}>
          If an account exists for {email.trim() || 'that email'}, we've sent a link to reset your
          password. Open it on this device to continue.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>Back to login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.title}>Forgot password</Text>
        <Text style={styles.body}>
          Enter the email on your account and we'll send you a link to reset your password.
        </Text>

        <View style={styles.inputWrap}>
          <Feather name="mail" size={18} color="#94a3b8" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#94a3b8"
            value={email}
            onChangeText={(t) => { setEmail(t); setError(null); }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            editable={!loading}
            onSubmitEditing={handleSend}
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
          onPress={handleSend}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>Send reset link</Text>}
        </Pressable>

        <Pressable style={styles.backLink} onPress={() => router.back()} disabled={loading}>
          <Text style={styles.backLinkText}>Back to login</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Width cap keeps the form readable on tablets, matching the login/sign-up
  // card; constraining the shared container covers every child at once.
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: COLORS.bg,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
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
  backLink: { marginTop: 16, alignSelf: 'center' },
  backLinkText: { color: '#64748b', fontSize: 14, fontWeight: '500' },
});
