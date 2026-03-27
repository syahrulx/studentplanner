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
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { supabase } from '@/src/lib/supabase';
import { getMalaysianUniversities, type UniversityItem } from '@/src/lib/universities';

const THEME = {
  primary: '#003366',
  primaryLight: '#004b7a',
  accent: '#06b6d4',
  bg: '#f0f9ff',
  card: '#ffffff',
  text: '#003366',
  textSecondary: '#475569',
  border: '#e0f2fe',
  inputBg: '#f0f9ff',
  danger: '#b91c1c',
};

const MIN_PASSWORD_LENGTH = 6;

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [university, setUniversity] = useState<UniversityItem | null>(null);
  const [universities, setUniversities] = useState<UniversityItem[]>([]);
  const [universitiesLoading, setUniversitiesLoading] = useState(false);
  const [universityModalVisible, setUniversityModalVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailConfirmRequired, setEmailConfirmRequired] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUniversitiesLoading(true);
    getMalaysianUniversities()
      .then((list) => {
        if (!cancelled) setUniversities(list);
      })
      .finally(() => {
        if (!cancelled) setUniversitiesLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleSignUp = async () => {
    setError(null);
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      setError('Please enter your name');
      return;
    }
    if (!trimmedEmail) {
      setError('Please enter your email');
      return;
    }
    if (!university) {
      setError('Please select your university');
      return;
    }
    if (!password) {
      setError('Please enter a password');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            full_name: trimmedName,
            university: university.name,
          },
        },
      });
      if (signUpError) {
        let msg = signUpError.message;
        if (msg.includes('504') || msg.includes('Gateway Timeout') || msg.startsWith('{')) {
          msg = 'The server is currently unavailable (504 Timeout). Please try again later.';
        }
        setError(msg);
        return;
      }
      if (data.user) {
        try {
          await supabase.from('profiles').upsert(
            {
              id: data.user.id,
              name: trimmedName,
              university: university.name,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );
        } catch (_) {
          // profiles table may not have university column yet
          try {
            await supabase.from('profiles').upsert(
              { id: data.user.id, name: trimmedName, updated_at: new Date().toISOString() },
              { onConflict: 'id' }
            );
          } catch (_) {}
        }
        if (data.session) {
          router.replace('/(tabs)');
        } else {
          setError('Check your email to confirm your account, then log in.');
          setEmailConfirmRequired(true);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      setError(msg.includes('504') || msg.startsWith('{') ? 'The server is currently unavailable (504 Timeout). Please try again later.' : msg);
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
          <Feather name="user-plus" size={40} color="#fff" />
        </View>
        <Text style={styles.heroTitle}>GradeUp</Text>
        <Text style={styles.heroSubtitle}>Create account. Join and manage your studies.</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={[styles.title, { color: THEME.text }]}>Sign up</Text>

          <TextInput
            style={[styles.input, { backgroundColor: THEME.inputBg, borderColor: THEME.border, color: THEME.text }]}
            placeholder="Full name"
            placeholderTextColor={THEME.textSecondary}
            value={name}
            onChangeText={(t) => { setName(t); setError(null); }}
            autoCapitalize="words"
            autoComplete="name"
            editable={!loading}
          />
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

          <Text style={[styles.label, { color: THEME.textSecondary }]}>University (Malaysia)</Text>
          <Pressable
            style={[
              styles.universityPicker,
              { backgroundColor: THEME.inputBg, borderColor: THEME.border },
              university && { borderColor: THEME.primary },
            ]}
            onPress={() => setUniversityModalVisible(true)}
            disabled={loading || universitiesLoading}
          >
            {universitiesLoading ? (
              <ActivityIndicator size="small" color={THEME.primary} />
            ) : (
              <>
                <Text
                  style={[
                    styles.universityPickerText,
                    { color: university ? THEME.text : THEME.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {university ? university.name : 'Select your university'}
                </Text>
                <Feather name="chevron-down" size={20} color={THEME.textSecondary} />
              </>
            )}
          </Pressable>

          <TextInput
            style={[styles.input, { backgroundColor: THEME.inputBg, borderColor: THEME.border, color: THEME.text }]}
            placeholder={`Password (min ${MIN_PASSWORD_LENGTH} characters)`}
            placeholderTextColor={THEME.textSecondary}
            value={password}
            onChangeText={(t) => { setPassword(t); setError(null); }}
            secureTextEntry
            autoComplete="new-password"
            editable={!loading}
          />
          <TextInput
            style={[styles.input, { backgroundColor: THEME.inputBg, borderColor: THEME.border, color: THEME.text }]}
            placeholder="Confirm password"
            placeholderTextColor={THEME.textSecondary}
            value={confirmPassword}
            onChangeText={(t) => { setConfirmPassword(t); setError(null); }}
            secureTextEntry
            autoComplete="new-password"
            editable={!loading}
          />

          {error ? (
            <View style={[styles.messageBanner, emailConfirmRequired && styles.messageBannerSuccess]}>
              <Text style={[styles.error, emailConfirmRequired && styles.messageBannerText]}>{error}</Text>
            </View>
          ) : null}

          {emailConfirmRequired ? (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: THEME.primary },
                pressed && styles.pressed,
              ]}
              onPress={() => router.replace('/(auth)/login')}
            >
              <Text style={styles.primaryButtonText}>Go to Login</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: THEME.primary },
                pressed && styles.pressed,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleSignUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Create account</Text>
              )}
            </Pressable>
          )}

          <View style={styles.links}>
            <Pressable
              onPress={() => {
                setEmailConfirmRequired(false);
                setError(null);
                router.back();
              }}
              style={styles.link}
              disabled={loading}
            >
              <Text style={[styles.linkText, { color: THEME.primary }]}>
                {emailConfirmRequired ? 'Back to sign up' : 'Back to login'}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={universityModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setUniversityModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setUniversityModalVisible(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: THEME.text }]}>Select university</Text>
              <Pressable onPress={() => setUniversityModalVisible(false)} hitSlop={12}>
                <Feather name="x" size={24} color={THEME.text} />
              </Pressable>
            </View>
            <FlatList
              data={universities}
              keyExtractor={(item) => item.name}
              style={styles.modalList}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.universityRow,
                    { backgroundColor: university?.name === item.name ? THEME.inputBg : '#fff', borderColor: THEME.border },
                    university?.name === item.name && { borderColor: THEME.primary },
                    pressed && styles.pressedRow,
                  ]}
                  onPress={() => {
                    setUniversity(item);
                    setUniversityModalVisible(false);
                  }}
                >
                  <Text style={[styles.universityRowText, { color: THEME.text }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {university?.name === item.name && (
                    <Feather name="check" size={20} color={THEME.primary} />
                  )}
                </Pressable>
              )}
              ListEmptyComponent={
                universitiesLoading ? (
                  <View style={styles.modalEmpty}>
                    <ActivityIndicator size="large" color={THEME.primary} />
                  </View>
                ) : (
                  <View style={styles.modalEmpty}>
                    <Text style={[styles.modalEmptyText, { color: THEME.textSecondary }]}>
                      No universities loaded. Check your connection.
                    </Text>
                  </View>
                )
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  scrollContent: { paddingHorizontal: 20, marginTop: 0, paddingBottom: 40 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: '#e0f2fe',
    shadowColor: '#003366',
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
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    marginBottom: 14,
  },
  universityPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 14,
  },
  universityPickerText: {
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    marginBottom: 0,
  },
  messageBanner: {
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  messageBannerSuccess: {
    backgroundColor: 'rgba(185, 28, 28, 0.08)',
    borderRadius: 12,
    padding: 14,
  },
  messageBannerText: {
    color: '#b91c1c',
    fontSize: 15,
    fontWeight: '600',
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

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0f2fe',
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalList: { maxHeight: 400, paddingHorizontal: 20, paddingTop: 12 },
  universityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  pressedRow: { opacity: 0.9 },
  universityRowText: { fontSize: 15, fontWeight: '600', flex: 1 },
  modalEmpty: { padding: 32, alignItems: 'center' },
  modalEmptyText: { fontSize: 14 },
});
