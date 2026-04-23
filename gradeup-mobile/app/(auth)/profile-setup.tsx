import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/lib/supabase';
import { getMalaysianUniversities, type UniversityItem } from '@/src/lib/universities';
import { useApp } from '@/src/context/AppContext';

const PROFILE_SETUP_SKIPPED_KEY_PREFIX = 'profile_setup_skipped_v1:';
const skippedKeyFor = (uid: string) => `${PROFILE_SETUP_SKIPPED_KEY_PREFIX}${uid}`;

const ACADEMIC_LEVELS = [
  { key: 'foundation', label: 'Foundation / Pre-U', icon: '📚' },
  { key: 'diploma', label: 'Diploma', icon: '📋' },
  { key: 'degree', label: 'Degree', icon: '🎓' },
  { key: 'masters', label: "Master's", icon: '🏅' },
  { key: 'phd', label: 'PhD', icon: '🔬' },
] as const;

export default function ProfileSetup() {
  const { updateProfile } = useApp();
  const [name, setName] = useState('');
  const [university, setUniversity] = useState<UniversityItem | null>(null);
  const [academicLevel, setAcademicLevel] = useState<string>('');
  const [universities, setUniversities] = useState<UniversityItem[]>([]);
  const [universitiesLoading, setUniversitiesLoading] = useState(false);
  const [universityModalVisible, setUniversityModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Pre-fill name from auth metadata using local session to avoid network race conditions
    supabase.auth.getSession().then(({ data }) => {
      const user = data?.session?.user;
      const meta = user?.user_metadata;
      if (meta?.full_name) setName(meta.full_name);
      else if (meta?.name) setName(meta.name);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setUniversitiesLoading(true);
    getMalaysianUniversities()
      .then((list) => { if (!cancelled) setUniversities(list); })
      .finally(() => { if (!cancelled) setUniversitiesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (!university) { setError('Please select your university'); return; }

    setSaving(true);
    try {
      // Use getSession to rely on the local auth state directly after OAuth redirect
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { throw new Error('Session expired'); }
      // Update the local AppContext and Supabase concurrently to ensure instant UI sync
      await updateProfile({
        name: name.trim(),
        university: university.name,
        universityId: university.id,
        academicLevel: academicLevel as any,
      });

      try {
        await AsyncStorage.removeItem(skippedKeyFor(user.id));
      } catch {
        /* non-fatal */
      }
      router.replace('/(tabs)');
    } catch (e) {
      setError('Could not save your profile. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip profile setup?',
      "No worries — you can continue. But your experience will be much better if you fill this in.\n\nEspecially if you're a UiTM student: we can unlock UiTM-specific timetable & academic calendar flows.\n\nYou can always complete this later in Settings.",
      [
        { text: 'Fill now', style: 'cancel' },
        {
          text: 'Skip anyway',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const uid = session?.user?.id;
              if (uid) await AsyncStorage.setItem(skippedKeyFor(uid), '1');
            } catch {
              // Non-fatal: still route into the app; gate will behave as before if storage fails.
            }
            router.replace('/(tabs)');
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.container}
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
          <Feather name="user" size={28} color="#fff" />
        </View>
        <Text style={styles.heroTitle}>Complete Your Profile</Text>
        <Text style={styles.heroSubtitle}>Tell us a bit about yourself</Text>
      </LinearGradient>

      {/* ── Card ── */}
      <View style={styles.card}>
        <Text style={styles.stepLabel}>STEP 1 OF 1</Text>
        <Text style={styles.cardTitle}>Your Details</Text>
        <Text style={styles.cardSubtitle}>This helps us personalize your experience</Text>

        {/* Name */}
        <Text style={styles.fieldLabel}>Full Name</Text>
        <View style={styles.inputWrap}>
          <Feather name="user" size={18} color="#94a3b8" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            placeholderTextColor="#94a3b8"
            value={name}
            onChangeText={(t) => { setName(t); setError(null); }}
            autoCapitalize="words"
            editable={!saving}
          />
        </View>

        {/* University */}
        <Text style={styles.fieldLabel}>University</Text>
        <Pressable
          style={[styles.inputWrap, university && { borderColor: '#0f172a' }]}
          onPress={() => setUniversityModalVisible(true)}
          disabled={saving || universitiesLoading}
        >
          <Feather name="home" size={18} color="#94a3b8" style={styles.inputIcon} />
          {universitiesLoading ? (
            <ActivityIndicator size="small" color="#94a3b8" style={{ paddingVertical: 15 }} />
          ) : (
            <Text style={[styles.input, { paddingVertical: 15, color: university ? '#0f172a' : '#94a3b8' }]} numberOfLines={1}>
              {university ? university.name : 'Select your university'}
            </Text>
          )}
          <Feather name="chevron-down" size={18} color="#94a3b8" />
        </Pressable>

        {/* Academic Level */}
        <Text style={styles.fieldLabel}>Academic Level (Optional)</Text>
        <View style={styles.levelGrid}>
          {ACADEMIC_LEVELS.map((level) => {
            const sel = academicLevel === level.key;
            return (
              <Pressable
                key={level.key}
                style={[styles.levelChip, sel && styles.levelChipSel]}
                onPress={() => setAcademicLevel(sel ? '' : level.key)}
                disabled={saving}
              >
                <Text style={styles.levelIcon}>{level.icon}</Text>
                <Text style={[styles.levelLabel, sel && styles.levelLabelSel]}>{level.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={14} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Save */}
        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.9 }, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.saveBtnText}>Get Started</Text>
              <Feather name="arrow-right" size={18} color="#fff" />
            </>
          )}
        </Pressable>

        {/* Skip */}
        <Pressable style={styles.skipBtn} onPress={handleSkip} disabled={saving}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </View>

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
            <FlatList
              data={universities}
              keyExtractor={(item) => item.name}
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSel = university?.name === item.name;
                return (
                  <Pressable
                    style={[styles.uniRow, isSel && { backgroundColor: '#f0f9ff', borderColor: '#0f172a' }]}
                    onPress={() => { setUniversity(item); setUniversityModalVisible(false); }}
                  >
                    <Text style={[styles.uniRowText, isSel && { color: '#0f172a', fontWeight: '700' }]} numberOfLines={2}>{item.name}</Text>
                    {isSel && <Feather name="check" size={18} color="#0f172a" />}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={styles.modalEmpty}>
                  <Text style={styles.modalEmptyText}>Loading...</Text>
                </View>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },

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
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
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
  },
  stepLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', letterSpacing: 1, marginBottom: 6 },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  cardSubtitle: { fontSize: 14, color: '#64748b', marginTop: 4, marginBottom: 24 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6, marginTop: 4 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: '#0f172a' },

  levelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  levelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  levelChipSel: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  levelIcon: { fontSize: 14 },
  levelLabel: { fontSize: 13, fontWeight: '500', color: '#475569' },
  levelLabelSel: { color: '#fff', fontWeight: '600' },

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

  saveBtn: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  skipBtn: { alignItems: 'center', marginTop: 14 },
  skipText: { color: '#94a3b8', fontSize: 14, fontWeight: '500' },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%', paddingBottom: 34 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalList: { maxHeight: 460, paddingHorizontal: 20, paddingTop: 12 },
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
