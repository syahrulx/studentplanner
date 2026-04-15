import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import Constants from 'expo-constants';
import { supabase } from '@/src/lib/supabase';
import { getMalaysianUniversities, type UniversityItem } from '@/src/lib/universities';

WebBrowser.maybeCompleteAuthSession();

const authRedirect = (path: string) =>
  makeRedirectUri({
    scheme: (Constants.expoConfig?.scheme as string) || 'rencana',
    path,
  });

const MIN_PASSWORD_LENGTH = 8;

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [university, setUniversity] = useState<UniversityItem | null>(null);
  const [universities, setUniversities] = useState<UniversityItem[]>([]);
  const [universitiesLoading, setUniversitiesLoading] = useState(false);
  const [universityModalVisible, setUniversityModalVisible] = useState(false);
  const [uniSearch, setUniSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailConfirmRequired, setEmailConfirmRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUniversitiesLoading(true);
    getMalaysianUniversities()
      .then((list) => { if (!cancelled) setUniversities(list); })
      .finally(() => { if (!cancelled) setUniversitiesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredUnis = uniSearch.trim()
    ? universities.filter((u) => u.name.toLowerCase().includes(uniSearch.toLowerCase()))
    : universities;

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const redirectUrl = authRedirect('sign-up');
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });
      if (oauthError) {
        setError('Google sign-up failed. Please try again.');
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
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) {
              setError('Sign-up failed. Please try again.');
            } else {
              // Same exact check profile logic as login: redirect to user data form if needed
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const { data: profile } = await supabase.from('profiles').select('university').eq('id', user.id).maybeSingle();
                if (!profile?.university) router.replace('/(auth)/profile-setup');
                else router.replace('/(tabs)');
              } else {
                 router.replace('/(auth)/profile-setup');
              }
            }
          }
        }
      }
    } catch {
      setError('Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignUp = async () => {
    setAppleLoading(true);
    setError(null);
    try {
      const redirectUrl = authRedirect('sign-up');
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });
      if (oauthError) {
        setError('Apple sign-up failed. Please try again.');
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
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) {
              setError('Sign-up failed. Please try again.');
            } else {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const { data: profile } = await supabase.from('profiles').select('university').eq('id', user.id).maybeSingle();
                if (!profile?.university) router.replace('/(auth)/profile-setup');
                else router.replace('/(tabs)');
              } else {
                router.replace('/(auth)/profile-setup');
              }
            }
          }
        }
      }
    } catch {
      setError('Apple sign-in failed. Please try again.');
    } finally {
      setAppleLoading(false);
    }
  };

  const handleSignUp = async () => {
    setError(null);
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) { setError('Please enter your name'); return; }
    if (!trimmedEmail) { setError('Please enter your email'); return; }
    if (!university) { setError('Please select your university'); return; }
    if (!password) { setError('Please enter a password'); return; }
    if (password.length < MIN_PASSWORD_LENGTH) { setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { data: { full_name: trimmedName, university: university.name } },
      });
      if (signUpError) {
        let msg = signUpError.message;
        if (msg.includes('504') || msg.includes('Gateway Timeout') || msg.startsWith('{'))
          msg = 'Server unavailable. Please try again later.';
        else if (msg.toLowerCase().includes('password'))
          msg = 'Password must be at least 6 characters and contain letters and numbers.';
        setError(msg);
        return;
      }

      // Supabase Fake User Security: when the email is already taken, it returns success but no email is sent 
      // and the identities array is empty. We detect this to give the user a clear error!
      if (data.user?.identities && data.user.identities.length === 0) {
        setError('An account with this email already exists. Please sign in.');
        return;
      }
      if (data.user) {
        try {
          await supabase.from('profiles').upsert(
            {
              id: data.user.id,
              name: trimmedName,
              university: university.name,
              university_id: university.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );
        } catch {}
        if (data.session) {
          router.replace('/(tabs)');
        } else {
          setError('Check your email to confirm your account, then log in.');
          setEmailConfirmRequired(true);
        }
      }
    } catch (e) {
      setError('Something went wrong. Please check your connection and try again.');
    } finally {
      setLoading(false);
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
        {/* ── Hero ── */}
        <LinearGradient
          colors={['#0f172a', '#1e3a5f', '#0f172a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.logoWrap}>
            <Feather name="user-plus" size={28} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>Join Rencana.</Text>
          <Text style={styles.heroSubtitle}>Start managing your studies today</Text>
        </LinearGradient>

        {/* ── Card ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create Account</Text>

          {/* Name */}
          <View style={styles.inputWrap}>
            <Feather name="user" size={18} color="#94a3b8" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor="#94a3b8"
              value={name}
              onChangeText={(t) => { setName(t); setError(null); }}
              autoCapitalize="words"
              autoComplete="name"
              editable={!isLoading}
            />
          </View>

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


          {/* University */}
          <Pressable
            style={[styles.inputWrap, university && { borderColor: '#0f172a' }]}
            onPress={() => setUniversityModalVisible(true)}
            disabled={isLoading || universitiesLoading}
          >
            <Feather name="home" size={18} color="#94a3b8" style={styles.inputIcon} />
            {universitiesLoading ? (
              <ActivityIndicator size="small" color="#94a3b8" />
            ) : (
              <Text style={[styles.input, { paddingVertical: 15, color: university ? '#0f172a' : '#94a3b8' }]} numberOfLines={1}>
                {university ? university.name : 'Select your university'}
              </Text>
            )}
            <Feather name="chevron-down" size={18} color="#94a3b8" />
          </Pressable>

          {/* Password */}
          <View style={styles.inputWrap}>
            <Feather name="lock" size={18} color="#94a3b8" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={`Password (min ${MIN_PASSWORD_LENGTH} chars)`}
              placeholderTextColor="#94a3b8"
              value={password}
              onChangeText={(t) => { setPassword(t); setError(null); }}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              editable={!isLoading}
            />
            <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color="#94a3b8" />
            </Pressable>
          </View>

          {/* Confirm Password */}
          <View style={styles.inputWrap}>
            <Feather name="check-circle" size={18} color="#94a3b8" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor="#94a3b8"
              value={confirmPassword}
              onChangeText={(t) => { setConfirmPassword(t); setError(null); }}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              editable={!isLoading}
            />
          </View>

          {/* Error */}
          {error && (
            <View style={[styles.errorBanner, emailConfirmRequired && { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
              <Feather name={emailConfirmRequired ? 'check-circle' : 'alert-circle'} size={14} color={emailConfirmRequired ? '#16a34a' : '#ef4444'} />
              <Text style={[styles.errorText, emailConfirmRequired && { color: '#16a34a' }]}>{error}</Text>
            </View>
          )}

          {/* Submit */}
          {emailConfirmRequired ? (
            <Pressable
              style={({ pressed }) => [styles.loginBtnOuter, pressed && { opacity: 0.9 }]}
              onPress={() => router.replace('/(auth)/login')}
            >
              <LinearGradient colors={['#24334d', '#1a2436']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.loginBtnGradient}>
                <Text style={styles.loginBtnText}>Go to Login</Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.loginBtnOuter, pressed && { opacity: 0.9 }, isLoading && { opacity: 0.6 }]}
              onPress={handleSignUp}
              disabled={isLoading}
            >
              <LinearGradient colors={['#24334d', '#1a2436']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.loginBtnGradient}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>Create Account</Text>}
              </LinearGradient>
            </Pressable>
          )}

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social icon buttons */}
          <View style={styles.socialRow}>
            <Pressable
              style={({ pressed }) => [styles.socialIconBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] }, isLoading && { opacity: 0.6 }]}
              onPress={handleGoogleSignUp}
              disabled={isLoading}
            >
              {googleLoading ? <ActivityIndicator color="#4285F4" size="small" /> : <Text style={styles.googleIconText}>G</Text>}
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.socialIconBtn, styles.appleIconBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] }, isLoading && { opacity: 0.6 }]}
              onPress={handleAppleSignUp}
              disabled={isLoading}
            >
              {appleLoading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="logo-apple" size={22} color="#fff" />}
            </Pressable>
          </View>

          <View style={styles.signUpRow}>
            <Text style={styles.signUpLabel}>Already have an account? </Text>
            <Pressable onPress={() => router.back()} disabled={isLoading}>
              <Text style={styles.signUpLink}>Sign in</Text>
            </Pressable>
          </View>
        </View>

      </ScrollView>

      {/* ── University Modal ── */}
      <Modal visible={universityModalVisible} transparent animationType="slide" onRequestClose={() => setUniversityModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setUniversityModalVisible(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select University</Text>
              <Pressable onPress={() => setUniversityModalVisible(false)} hitSlop={12}>
                <Feather name="x" size={22} color="#0f172a" />
              </Pressable>
            </View>
            <View style={styles.modalSearchWrap}>
              <Feather name="search" size={16} color="#94a3b8" />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search universities..."
                placeholderTextColor="#94a3b8"
                value={uniSearch}
                onChangeText={setUniSearch}
                autoFocus
              />
              {uniSearch.length > 0 && (
                <Pressable onPress={() => setUniSearch('')}><Feather name="x-circle" size={16} color="#94a3b8" /></Pressable>
              )}
            </View>
            <FlatList
              data={filteredUnis}
              keyExtractor={(item) => item.name}
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSel = university?.name === item.name;
                return (
                  <Pressable
                    style={[styles.uniRow, isSel && { backgroundColor: '#f0f9ff', borderColor: '#0f172a' }]}
                    onPress={() => { setUniversity(item); setUniversityModalVisible(false); setUniSearch(''); }}
                  >
                    <Text style={[styles.uniRowText, isSel && { color: '#0f172a', fontWeight: '700' }]} numberOfLines={2}>{item.name}</Text>
                    {isSel && <Feather name="check" size={18} color="#0f172a" />}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={styles.modalEmpty}>
                  <Text style={styles.modalEmptyText}>{uniSearch ? 'No results found' : 'Loading...'}</Text>
                </View>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { flexGrow: 1 },
  hero: {
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 50,
    alignItems: 'center',
  },
  logoWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  heroSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4, fontWeight: '500' },
  card: {
    marginTop: -24,
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 10,
    marginBottom: 40,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3, marginBottom: 18 },
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
  hintText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
    paddingHorizontal: 10,
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerText: { fontSize: 12, color: '#94a3b8', fontWeight: '500' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: '#0f172a' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { color: '#dc2626', fontSize: 13, fontWeight: '500', flex: 1 },
  loginBtnOuter: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  loginBtnGradient: { paddingVertical: 16, alignItems: 'center' },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  signUpRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  signUpLabel: { color: '#64748b', fontSize: 14 },
  signUpLink: { color: '#24334d', fontSize: 14, fontWeight: '700' },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%', paddingBottom: 34 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    gap: 8,
  },
  modalSearchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: '#0f172a' },
  modalList: { maxHeight: 400, paddingHorizontal: 20, paddingTop: 8 },
  uniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 6,
  },
  uniRowText: { fontSize: 14, fontWeight: '500', color: '#334155', flex: 1 },
  modalEmpty: { padding: 32, alignItems: 'center' },
  modalEmptyText: { fontSize: 14, color: '#94a3b8' },
});
