import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, FlatList,
  StyleSheet, Platform, Alert, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations, type TranslationKey } from '@/src/i18n';
import { searchUniversities, getUniversityById } from '@/src/lib/universities';
import { getTodayISO } from '@/src/utils/date';
import {
  fetchUitmTimetable,
  matricFromStudentLoginInput,
  profileUpdatesFromMyStudentPayload,
  type MyStudentProfilePayload,
} from '@/src/lib/timetableParsers/uitm';
import type { UniversityConfig, TimetableEntry, DayOfWeek, Course } from '@/src/types';

type Step = 'university' | 'terms' | 'login' | 'validating' | 'fetching' | 'review' | 'already_connected';

const DAY_ORDER: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function portalHostname(loginUrl: string): string {
  try {
    const h = new URL(loginUrl).hostname;
    return h.startsWith('www.') ? h.slice(4) : h;
  } catch {
    return loginUrl;
  }
}

function termsBodyForUniversity(uni: UniversityConfig, T: (key: TranslationKey) => string): string {
  const portal = portalHostname(uni.loginUrl);
  const raw =
    uni.id === 'uitm' ? T('termsBodyUitm') : T('termsBodyGeneric');
  return raw.replace(/\{full\}/g, uni.name).replace(/\{short\}/g, uni.shortName).replace(/\{portal\}/g, portal);
}

export default function UniversityConnectScreen() {
  const {
    language,
    user,
    saveTimetableAndLink,
    addCourse,
    courses,
    academicCalendar,
    updateAcademicCalendar,
    updateProfile,
    disconnectUniversity,
  } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);

  const [step, setStep] = useState<Step>('university');
  const [selectedUni, setSelectedUni] = useState<UniversityConfig | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [resolvedMatric, setResolvedMatric] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [campusInfo, setCampusInfo] = useState<string | undefined>();
  const [coursesInput, setCoursesInput] = useState('');
  const [lastMyStudentProfile, setLastMyStudentProfile] = useState<MyStudentProfilePayload | null>(null);

  const filteredUnis = searchUniversities(searchQuery);

  useEffect(() => {
    if (user.universityId) setStep('already_connected');
  }, [user.universityId]);

  useEffect(() => {
    if (step === 'terms' && !selectedUni) setStep('university');
  }, [step, selectedUni]);

  const handleAcceptTerms = () => {
    if (!selectedUni) return;
    setStep('login');
  };

  const handleSelectUni = (uni: UniversityConfig) => {
    setSelectedUni(uni);
    setStep('terms');
  };

  const handleFetchTimetable = async () => {
    if (!studentEmail.trim()) {
      Alert.alert(T('error'), T('studentEmailLabel'));
      return;
    }
    if (!password.trim()) {
      Alert.alert(T('error'), T('passwordLabel'));
      return;
    }

    const coursesList = coursesInput
      .split(/[,\s]+/)
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length >= 4);

    setStep('validating');
    setLoading(true);

    const timetablePromise = fetchUitmTimetable(
      studentEmail.trim(),
      password,
      coursesList.length > 0 ? coursesList : undefined,
    );
    const minValidateMs = 500;
    const minDelay = new Promise<void>((r) => setTimeout(r, minValidateMs));

    try {
      await minDelay;
      setStep('fetching');
      const { entries: fetched, campus, matric: m, profile: mystudentProfile } = await timetablePromise;
      setResolvedMatric(m || matricFromStudentLoginInput(studentEmail.trim()));

      if (fetched.length === 0) {
        Alert.alert(
          T('noTimetable'),
          'No timetable slots were found. Add your course codes in the optional field and try again.',
          [{ text: 'OK', onPress: () => setStep('login') }],
        );
        return;
      }

      setCampusInfo(campus);
      setEntries(fetched);
      setLastMyStudentProfile(mystudentProfile ?? null);
      setStep('review');
    } catch (e) {
      Alert.alert(T('error'), e instanceof Error ? e.message : 'Failed to fetch timetable');
      setStep('login');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSave = async () => {
    if (entries.length === 0 || !selectedUni) return;
    setLoading(true);
    try {
      const studentId = resolvedMatric || matricFromStudentLoginInput(studentEmail.trim());
      await saveTimetableAndLink(entries, selectedUni.id, studentId);

      await updateProfile({
        university: selectedUni.shortName,
        ...profileUpdatesFromMyStudentPayload(lastMyStudentProfile, studentId),
      });

      const existingIds = new Set(courses.map((c) => c.id.toUpperCase()));
      const uniqueSubjects = new Map<string, string>();
      for (const e of entries) {
        if (e.subjectCode && e.subjectCode !== 'N/A' && !uniqueSubjects.has(e.subjectCode.toUpperCase())) {
          uniqueSubjects.set(e.subjectCode.toUpperCase(), e.subjectName);
        }
      }
      for (const [code, name] of uniqueSubjects) {
        if (!existingIds.has(code)) {
          const course: Course = { id: code, name: name || code, creditHours: 3, workload: [] };
          addCourse(course);
        }
      }

      const prevSem = user.currentSemester;
      const newSem = lastMyStudentProfile?.semester;
      const portalSemChanged =
        typeof newSem === 'number' && newSem > 0 && prevSem !== newSem;
      const calendarFromPortal = academicCalendar?.semesterLabel?.includes('(portal)');
      const today = getTodayISO();
      const tw = academicCalendar?.totalWeeks ?? 14;
      const endFrom = (startISO: string) => {
        const start = new Date(`${startISO}T00:00:00`);
        const end = new Date(start);
        end.setDate(end.getDate() + tw * 7 - 1);
        return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
      };
      const portalLabel =
        typeof newSem === 'number' && newSem > 0 ? `Programme semester ${newSem} (portal)` : `Teaching ${today.slice(0, 7)}`;

      if (!academicCalendar) {
        await updateAcademicCalendar({
          semesterLabel: portalLabel,
          startDate: today,
          endDate: endFrom(today),
          totalWeeks: tw,
          isActive: true,
        });
      } else if (portalSemChanged || !calendarFromPortal) {
        await updateAcademicCalendar({
          semesterLabel: portalLabel,
          startDate: today,
          endDate: endFrom(today),
          totalWeeks: tw,
          isActive: true,
        });
      }

      if (typeof newSem === 'number' && newSem > 0) {
        await updateProfile({ portalTeachingAnchoredSemester: newSem });
      }

      Alert.alert(T('timetableSaved'), '', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert(T('error'), e instanceof Error ? e.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  /* ── Step indicator ─────────────────────────────────── */
  const renderStepIndicator = () => {
    const labels = [T('stepUniversity'), T('stepTerms'), T('stepLogin'), T('stepReview')];
    const displayIndex =
      step === 'university' ? 0
      : step === 'terms' ? 1
      : step === 'login' || step === 'validating' || step === 'fetching' ? 2
      : 3;
    return (
      <View style={styles.stepRow}>
        {labels.map((label, i) => (
          <View key={label} style={styles.stepItem}>
            <View style={[styles.stepDot, displayIndex >= i ? { backgroundColor: theme.primary } : { backgroundColor: theme.border }]}>
              {displayIndex > i ? (
                <Feather name="check" size={12} color="#fff" />
              ) : (
                <Text style={[styles.stepDotText, displayIndex >= i && { color: '#fff' }]}>{i + 1}</Text>
              )}
            </View>
            <Text style={[styles.stepLabel, { color: displayIndex >= i ? theme.text : theme.textSecondary }]}>{label}</Text>
          </View>
        ))}
      </View>
    );
  };

  /* ── Already linked (data lives in Supabase) ───────── */
  const renderAlreadyConnected = () => {
    const uni = user.universityId
      ? getUniversityById(user.universityId)
      : undefined;
    return (
      <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.termsCard, { backgroundColor: theme.card }]}>
          <Feather name="link" size={32} color={theme.primary} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <Text style={[styles.termsTitle, { color: theme.text }]}>{T('alreadyConnectedUniTitle')}</Text>
          <Text style={[styles.termsBody, { color: theme.textSecondary }]}>{T('alreadyConnectedUniBody')}</Text>
          {user.lastSync ? (
            <Text style={[styles.hintText, { color: theme.textSecondary, marginTop: 12 }]}>
              {T('lastSynced')}: {new Date(user.lastSync).toLocaleString()}
            </Text>
          ) : null}
        </View>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.85 }]}
          onPress={() => router.back()}
        >
          <Text style={styles.primaryBtnText}>{T('back')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: '#fee2e2', marginTop: 12 }, pressed && { opacity: 0.85 }]}
          onPress={() => {
            Alert.alert(T('disconnectUniversity'), T('disconnectUniversityConfirm'), [
              { text: T('cancel'), style: 'cancel' },
              {
                text: T('disconnectUniversity'),
                style: 'destructive',
                onPress: () =>
                  disconnectUniversity().then(() => {
                    setSelectedUni(null);
                    setStep('university');
                  }),
              },
            ]);
          }}
        >
          <Text style={[styles.primaryBtnText, { color: '#b91c1c' }]}>{T('disconnectUniversity')}</Text>
        </Pressable>
      </ScrollView>
    );
  };

  /* ── Terms ──────────────────────────────────────────── */
  const renderTerms = () => {
    if (!selectedUni) return null;
    const termsTitle = T('termsTitleUni').replace('{short}', selectedUni.shortName);
    const termsBody = termsBodyForUniversity(selectedUni, T);
    return (
      <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.termsCard, { backgroundColor: theme.card }]}>
          <View style={[styles.termsUniRow, { borderBottomColor: theme.border }]}>
            <Text style={styles.termsUniEmoji}>{selectedUni.logoEmoji || '🏫'}</Text>
            <View style={styles.termsUniText}>
              <Text style={[styles.termsUniShort, { color: theme.text }]}>{selectedUni.shortName}</Text>
              <Text style={[styles.termsUniFull, { color: theme.textSecondary }]} numberOfLines={2}>
                {selectedUni.name}
              </Text>
            </View>
          </View>
          <Feather name="shield" size={28} color={theme.primary} style={{ alignSelf: 'center', marginBottom: 12 }} />
          <Text style={[styles.termsTitle, { color: theme.text }]}>{termsTitle}</Text>
          <Text style={[styles.termsBody, { color: theme.textSecondary }]}>{termsBody}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.85 }]}
          onPress={handleAcceptTerms}
        >
          <Feather name="check-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.primaryBtnText}>{T('iAgree')}</Text>
        </Pressable>
      </ScrollView>
    );
  };

  /* ── University picker ──────────────────────────────── */
  const renderUniversityPicker = () => (
    <View style={styles.flex1}>
      <View style={[styles.searchBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Feather name="search" size={18} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder={T('searchUniversity')}
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <Feather name="x" size={18} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>
      <FlatList
        data={filteredUnis}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.uniRow, { backgroundColor: theme.card }, pressed && { opacity: 0.85 }]}
            onPress={() => handleSelectUni(item)}
          >
            <Text style={styles.uniEmoji}>{item.logoEmoji || '🏫'}</Text>
            <View style={styles.uniBody}>
              <Text style={[styles.uniName, { color: theme.text }]}>{item.shortName}</Text>
              <Text style={[styles.uniFullName, { color: theme.textSecondary }]}>{item.name}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No universities found</Text>
        }
      />
    </View>
  );

  /* ── Login form (student ID + password) ─────────────── */
  const renderLoginForm = () => (
    <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.loginCard, { backgroundColor: theme.card }]}>
          <View style={styles.loginHeader}>
            <Text style={styles.loginEmoji}>{selectedUni?.logoEmoji || '🏫'}</Text>
            <View>
              <Text style={[styles.loginUniName, { color: theme.text }]}>{selectedUni?.shortName}</Text>
              <Text style={[styles.loginSubtext, { color: theme.textSecondary }]}>MyStudent · mystudent.uitm.edu.my</Text>
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{T('studentEmailLabel')}</Text>
          <TextInput
            style={[styles.textField, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
            value={studentEmail}
            onChangeText={setStudentEmail}
            placeholder={T('studentEmailPlaceholder')}
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 20 }]}>
            {T('passwordLabel')}
          </Text>
          <View style={[styles.passwordWrap, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <TextInput
              style={[styles.passwordInput, { color: theme.text }]}
              value={password}
              onChangeText={setPassword}
              placeholder={T('mystudentPasswordPlaceholder')}
              placeholderTextColor={theme.textSecondary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 20 }]}>
            {T('optionalCourseCodes')}
          </Text>
          <TextInput
            style={[styles.textField, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
            value={coursesInput}
            onChangeText={setCoursesInput}
            placeholder="CSP600, ISP613, …"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Text style={[styles.hintText, { color: theme.textSecondary }]}>{T('optionalCourseCodesHint')}</Text>

          <View style={[styles.securityBanner, { backgroundColor: '#22c55e10' }]}>
            <Feather name="lock" size={16} color="#22c55e" />
            <Text style={[styles.securityText, { color: theme.textSecondary }]}>
              {T('mystudentSecurityNote')}
            </Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: theme.primary },
            pressed && { opacity: 0.85 },
            (!studentEmail.trim() || !password.trim()) && { opacity: 0.5 },
          ]}
          onPress={handleFetchTimetable}
          disabled={!studentEmail.trim() || !password.trim()}
        >
          <Feather name="log-in" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.primaryBtnText}>{T('loginToPortal')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  /* ── Validating login ───────────────────────────────── */
  const renderValidating = () => (
    <View style={styles.fetchingWrap}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={[styles.fetchingText, { color: theme.text }]}>{T('validatingPortalLogin')}</Text>
      <Text style={[styles.fetchingSub, { color: theme.textSecondary }]}>
        {T('validatingMystudentLogin')}
      </Text>
    </View>
  );

  /* ── Fetching timetable ─────────────────────────────── */
  const renderFetching = () => (
    <View style={styles.fetchingWrap}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={[styles.fetchingText, { color: theme.text }]}>{T('fetchingTimetableData')}</Text>
      <Text style={[styles.fetchingSub, { color: theme.textSecondary }]}>
        {T('scrapingTimetable')}
      </Text>
    </View>
  );

  /* ── Review & confirm ───────────────────────────────── */
  const renderReview = () => {
    const grouped = DAY_ORDER.map((day) => ({
      day,
      items: entries.filter((e) => e.day === day),
    })).filter((g) => g.items.length > 0);

    const uniqueSubjects = [...new Set(entries.map((e) => e.subjectCode).filter((c) => c && c !== 'N/A'))];

    return (
      <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.reviewHeader, { backgroundColor: theme.card }]}>
          <Feather name="check-circle" size={28} color="#22c55e" />
          <Text style={[styles.reviewTitle, { color: theme.text }]}>{T('reviewTimetable')}</Text>
          <Text style={[styles.reviewSub, { color: theme.textSecondary }]}>
            {entries.length} {T('entriesFound')} · {uniqueSubjects.length} subjects
          </Text>
          {campusInfo && (
            <Text style={[styles.reviewCampus, { color: theme.primary }]}>
              {campusInfo}
            </Text>
          )}
        </View>

        {grouped.map(({ day, items }) => (
          <View key={day} style={{ marginBottom: 16 }}>
            <View style={styles.dayHeaderRow}>
              <Text style={[styles.dayHeader, { color: theme.primary }]}>{day}</Text>
              <View style={[styles.dayBadge, { backgroundColor: theme.primary + '20' }]}>
                <Text style={[styles.dayBadgeText, { color: theme.primary }]}>{items.length}</Text>
              </View>
            </View>
            {items.map((e) => (
              <View key={e.id} style={[styles.entryCard, { backgroundColor: theme.card }]}>
                <View style={styles.entryTime}>
                  <Text style={[styles.entryTimeText, { color: theme.primary }]}>{e.startTime}</Text>
                  <Text style={[styles.entryTimeDash, { color: theme.textSecondary }]}>-</Text>
                  <Text style={[styles.entryTimeText, { color: theme.primary }]}>{e.endTime}</Text>
                </View>
                <View style={styles.entryBody}>
                  <Text style={[styles.entryCode, { color: theme.text }]}>{e.subjectCode}</Text>
                  <Text style={[styles.entryName, { color: theme.textSecondary }]} numberOfLines={1}>{e.subjectName}</Text>

                  {e.lecturer && e.lecturer !== '-' && (
                    <View style={styles.entryMeta}>
                      <Feather name="user" size={12} color={theme.textSecondary} />
                      <Text style={[styles.entryMetaText, { color: theme.textSecondary }]}>{e.lecturer}</Text>
                    </View>
                  )}

                  <View style={styles.entryDetailRow}>
                    {e.group ? (
                      <View style={styles.entryMeta}>
                        <Feather name="users" size={12} color={theme.textSecondary} />
                        <Text style={[styles.entryMetaText, { color: theme.textSecondary }]}>{e.group}</Text>
                      </View>
                    ) : null}
                    <View style={[styles.entryMeta, e.group ? { marginLeft: 12 } : undefined]}>
                      <Feather name="map-pin" size={12} color={theme.textSecondary} />
                      <Text style={[styles.entryMetaText, { color: theme.textSecondary }]}>{e.location}</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ))}

        <View style={[styles.autoConfigNote, { backgroundColor: theme.card }]}>
          <Feather name="info" size={16} color={theme.primary} />
          <Text style={[styles.autoConfigText, { color: theme.textSecondary }]}>{T('autoConfigSemester')}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: '#22c55e' }, pressed && { opacity: 0.85 }]}
          onPress={handleConfirmSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Feather name="save" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.primaryBtnText}>{T('confirmSave')}</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    );
  };

  /* ── Main render ────────────────────────────────────── */
  const goBack = () => {
    if (step === 'already_connected') {
      router.back();
      return;
    }
    if (step === 'university') {
      router.back();
      return;
    }
    if (step === 'validating' || step === 'fetching') return;
    if (step === 'terms') {
      setSelectedUni(null);
      setStep('university');
      return;
    }
    const map: Record<Step, Step> = {
      university: 'university',
      terms: 'university',
      login: 'terms',
      validating: 'login',
      fetching: 'login',
      review: 'login',
      already_connected: 'already_connected',
    };
    setStep(map[step]);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={goBack} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color={theme.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{T('connectUniversity')}</Text>
        <View style={{ width: 32 }} />
      </View>

      {step !== 'already_connected' ? renderStepIndicator() : null}

      {step === 'already_connected' && renderAlreadyConnected()}
      {step === 'terms' && renderTerms()}
      {step === 'university' && renderUniversityPicker()}
      {step === 'login' && renderLoginForm()}
      {step === 'validating' && renderValidating()}
      {step === 'fetching' && renderFetching()}
      {step === 'review' && renderReview()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700' },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 16,
  },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotText: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },
  stepLabel: { fontSize: 11, fontWeight: '600' },
  scrollBody: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  termsCard: { borderRadius: 16, padding: 24, marginBottom: 24 },
  termsUniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  termsUniEmoji: { fontSize: 32 },
  termsUniText: { flex: 1, minWidth: 0 },
  termsUniShort: { fontSize: 18, fontWeight: '800' },
  termsUniFull: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  termsTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  termsBody: { fontSize: 14, lineHeight: 22 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 16, marginTop: 8,
  },
  primaryBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', margin: 16,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, gap: 10,
  },
  searchInput: { flex: 1, fontSize: 16, padding: 0 },
  listContent: { paddingHorizontal: 16, paddingBottom: 20, gap: 8 },
  uniRow: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, gap: 12,
  },
  uniEmoji: { fontSize: 28 },
  uniBody: { flex: 1 },
  uniName: { fontSize: 16, fontWeight: '700' },
  uniFullName: { fontSize: 13, marginTop: 2 },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 15 },
  loginCard: { borderRadius: 16, padding: 24, marginBottom: 24 },
  loginHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  loginEmoji: { fontSize: 32 },
  loginUniName: { fontSize: 22, fontWeight: '800' },
  loginSubtext: { fontSize: 13, marginTop: 2 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, letterSpacing: 0.3 },
  textField: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
  },
  hintText: { fontSize: 12, marginTop: 8, lineHeight: 18 },
  passwordWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 12, overflow: 'hidden',
  },
  passwordInput: {
    flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
  },
  eyeBtn: {
    paddingHorizontal: 14, paddingVertical: 14,
  },
  securityBanner: {
    flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12,
    padding: 14, gap: 10, marginTop: 20,
  },
  securityText: { flex: 1, fontSize: 13, lineHeight: 19 },
  fetchingWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40,
  },
  fetchingText: { fontSize: 18, fontWeight: '700', marginTop: 20 },
  fetchingSub: { fontSize: 14, marginTop: 8, textAlign: 'center' },
  reviewHeader: {
    borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 24, gap: 8,
  },
  reviewTitle: { fontSize: 20, fontWeight: '800' },
  reviewSub: { fontSize: 14 },
  reviewCampus: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  dayHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginLeft: 4 },
  dayHeader: { fontSize: 16, fontWeight: '800' },
  dayBadge: {
    minWidth: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  dayBadgeText: { fontSize: 12, fontWeight: '700' },
  entryCard: {
    flexDirection: 'row', borderRadius: 12, padding: 14, marginBottom: 8, gap: 12,
  },
  entryTime: { alignItems: 'center', width: 50 },
  entryTimeText: { fontSize: 13, fontWeight: '700' },
  entryTimeDash: { fontSize: 10 },
  entryBody: { flex: 1 },
  entryCode: { fontSize: 15, fontWeight: '700' },
  entryName: { fontSize: 13, marginTop: 2 },
  entryDetailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  entryMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  entryMetaText: { fontSize: 12 },
  autoConfigNote: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 12,
    padding: 14, gap: 10, marginBottom: 8,
  },
  autoConfigText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
