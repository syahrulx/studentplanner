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
  ScrollView,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import Constants from 'expo-constants';
import { supabase } from '@/src/lib/supabase';

/** Must match app.json `scheme` so TestFlight/production never uses an `exp://` Expo Go URL. */
const authRedirect = (path: string) =>
  makeRedirectUri({
    scheme: (Constants.expoConfig?.scheme as string) || 'rencana',
    path,
  });

WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const withTimeout = async <T>(promise: Promise<T>, timeoutMs = 20000): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
      ),
    ]);
  };

  const routeAfterAuth = async () => {
    try {
      const { data: userData } = await withTimeout(supabase.auth.getUser());
      const user = userData.user;
      if (!user) {
        router.replace('/(auth)/profile-setup');
        return;
      }
      const { data: profile } = await withTimeout(
        supabase
          .from('profiles')
          .select('university')
          .eq('id', user.id)
          .maybeSingle()
      );
      if (!profile?.university) router.replace('/(auth)/profile-setup');
      else router.replace('/(tabs)');
    } catch (e) {
      setError('The server is taking too long to respond. Please try again.');
    }
  };

  const handleLogin = async () => {
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) { setError('Please enter your email'); return; }
    if (!password) { setError('Please enter your password'); return; }
    setLoading(true);
    try {
      const { data, error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        })
      );
      if (signInError) {
        let msg = signInError.message;
        const invalidCreds =
          msg === 'Invalid login credentials' ||
          (signInError as { code?: string }).code === 'invalid_credentials';
        if (invalidCreds) {
          msg = 'Invalid email or password';
        } else if (msg.includes('504') || msg.includes('Gateway Timeout') || msg.startsWith('{')) {
          msg = 'Server unavailable. Please try again later.';
        }
        setError(msg);
        return;
      }
      if (data.session) await routeAfterAuth();
    } catch (e: any) {
      if (e.message === 'TIMEOUT') {
        setError('Server busy. Please try again in a moment.');
      } else {
        setError('Something went wrong. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const redirectUrl = authRedirect('login');
      const { data, error: oauthError } = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true,
            queryParams: {
              prompt: 'select_account',
            },
          },
        })
      );
      if (oauthError) {
        setError('Google sign-in failed. Please try again.');
        return;
      }
      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        if (result.type === 'success' && result.url) {
          // Extract tokens from the redirect URL
          const url = new URL(result.url);
          // Supabase puts tokens in the fragment (#)
          const params = new URLSearchParams(url.hash.replace('#', ''));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken) {
            const { data: sessionData, error: sessionError } = await withTimeout(
              supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              })
            );
            if (sessionError) {
              setError('Sign-in failed. Please try again.');
            } else if (sessionData.session) await routeAfterAuth();
          } else {
            setError('Authentication failed. Please try again.');
          }
        }
      }
    } catch (e: any) {
      if (e.message === 'TIMEOUT') {
        setError('Sign-in is taking too long. The server might be busy.');
      } else {
        setError('Google sign-in failed. Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setAppleLoading(true);
    setError(null);
    try {
      const redirectUrl = authRedirect('login');
      const { data, error: oauthError } = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true,
          },
        })
      );
      if (oauthError) {
        setError('Apple sign-in failed. Please try again.');
        return;
      }
      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        if (result.type === 'success' && result.url) {
          const url = new URL(result.url);
          const params = new URLSearchParams(url.hash.replace('#', ''));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken) {
            const { data: sessionData, error: sessionError } = await withTimeout(
              supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              })
            );
            if (sessionError) {
              setError('Sign-in failed. Please try again.');
            } else if (sessionData.session) await routeAfterAuth();
          } else {
            setError('Authentication failed. Please try again.');
          }
        }
      }
    } catch (e: any) {
      if (e.message === 'TIMEOUT') {
        setError('Sign-in is taking too long. The server might be busy.');
      } else {
        setError('Apple sign-in failed. Please try again.');
      }
    } finally {
      setAppleLoading(false);
    }
  };

  const isLoading = loading || googleLoading || appleLoading;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Gradient Hero ── */}
        <LinearGradient
          colors={['#0f172a', '#1e3a5f', '#0f172a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.logoWrap}>
            <Image 
              source={require('@/assets/images/app_logo.png')} 
              style={{ width: 74, height: 74, borderRadius: 14 }} 
              resizeMode="contain"
            />
          </View>
          <Text style={styles.heroTitle}>Rencana.</Text>
          <Text style={styles.heroSubtitle}>Your study companion</Text>
        </LinearGradient>

        {/* ── Card ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome back 👋</Text>
          <Text style={styles.cardSubtitle}>Sign in to continue your journey</Text>

          {/* Email */}
          <View style={styles.inputWrap}>
            <Feather name="mail" size={18} color="#94a3b8" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#94a3b8"
              value={email}
              onChangeText={(t) => { setEmail(t); setError(null); }}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!isLoading}
            />
          </View>

          {/* Password */}
          <View style={styles.inputWrap}>
            <Feather name="lock" size={18} color="#94a3b8" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#94a3b8"
              value={password}
              onChangeText={(t) => { setPassword(t); setError(null); }}
              secureTextEntry={!showPassword}
              autoComplete="password"
              editable={!isLoading}
            />
            <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color="#94a3b8" />
            </Pressable>
          </View>

          {/* Forgot password */}
          <Pressable
            onPress={() => router.push('/(auth)/forgot-password')}
            style={styles.forgotBtn}
            disabled={isLoading}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          {/* Error */}
          {error && (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={14} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Login Button */}
          <Pressable
            style={({ pressed }) => [
              styles.loginBtnOuter,
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              isLoading && { opacity: 0.6 },
            ]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <LinearGradient
              colors={['#24334d', '#1a2436']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.loginBtnGradient}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginBtnText}>Sign In</Text>
              )}
            </LinearGradient>
          </Pressable>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social icon buttons */}
          <View style={styles.socialRow}>
            <Pressable
              style={({ pressed }) => [
                styles.socialIconBtn,
                pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] },
                isLoading && { opacity: 0.6 },
              ]}
              onPress={handleGoogleSignIn}
              disabled={isLoading}
            >
              {googleLoading ? (
                <ActivityIndicator color="#4285F4" size="small" />
              ) : (
                <Text style={styles.googleIconText}>G</Text>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.socialIconBtn,
                styles.appleIconBtn,
                pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] },
                isLoading && { opacity: 0.6 },
              ]}
              onPress={handleAppleSignIn}
              disabled={isLoading}
            >
              {appleLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="logo-apple" size={22} color="#fff" />
              )}
            </Pressable>
          </View>

          {/* Sign up link */}
          <View style={styles.signUpRow}>
            <Text style={styles.signUpLabel}>Don't have an account? </Text>
            <Pressable onPress={() => router.push('/(auth)/sign-up')} disabled={isLoading}>
              <Text style={styles.signUpLink}>Sign up</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { flexGrow: 1 },

  // Hero
  hero: {
    paddingTop: Platform.OS === 'ios' ? 70 : 50,
    paddingBottom: 60,
    alignItems: 'center',
  },
  logoWrap: {
    width: 86,
    height: 86,
    borderRadius: 24,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
    fontWeight: '500',
  },

  // Card
  card: {
    marginTop: -28,
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 10,
    marginBottom: 40,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 24,
  },

  // Social icon buttons
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 4,
  },
  socialIconBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
  },
  appleIconBtn: {
    backgroundColor: '#000',
    borderColor: '#000',
  },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 22,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  dividerText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },

  // Inputs
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
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    paddingVertical: 15,
    fontSize: 15,
    color: '#0f172a',
  },

  // Forgot
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 16 },
  forgotText: { color: '#64748b', fontSize: 13, fontWeight: '500' },

  // Error
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

  // Login button — navy gradient (matches brand hero / reference)
  loginBtnOuter: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  loginBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Sign up
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  signUpLabel: { color: '#64748b', fontSize: 14 },
  signUpLink: { color: '#24334d', fontSize: 14, fontWeight: '700' },
});
