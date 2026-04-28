import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useClassroomAuth } from '@/hooks/useClassroomAuth';
import { useApp } from '@/src/context/AppContext';
import {
  completeClassroomAuth,
  getValidToken,
  loadCoursesWithWorkProgressive,
  fetchCourseWork,
  syncSelectedCourses,
  isSelectableClassroomWork,
  type CourseWithWork,
  type GoogleCourseWork,
} from '@/src/lib/googleClassroom';
import { getClassroomPrefs, setClassroomPrefs } from '@/src/storage';
import * as taskDb from '@/src/lib/taskDb';
import * as coursesDb from '@/src/lib/coursesDb';

type Step = 'authenticating' | 'loading_work' | 'selecting' | 'syncing' | 'done';

export default function ClassroomSync() {
  const theme = useTheme();
  const { user, setTasks, setCourses: setAppCourses } = useApp();

  const [step, setStep] = useState<Step>('authenticating');
  const [courses, setCourses] = useState<CourseWithWork[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [syncProgress, setSyncProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState('');
  const [includeMaterials, setIncludeMaterials] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const tokenRef = useRef<string | null>(null);
  /** The Google email being used for Classroom (shown to Android users). */
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);

  const { request, response, promptAsync, redirectUri, clientId, notConfigured } =
    useClassroomAuth();
  const promptedRef = useRef(false);

  const startCourseLoad = useCallback(
    async (token: string) => {
      tokenRef.current = token;
      setStep('loading_work');
      const prefs = await getClassroomPrefs();
      const mat = Boolean(prefs?.includeClassroomMaterials);
      setIncludeMaterials(mat);

      const data = await loadCoursesWithWorkProgressive(token, (partial) => {
        setCourses(partial);
      });

      setCourses(data);
      const allCourseIds = new Set(data.map((c) => c.id));
      setSelectedCourses(allCourseIds);
      const allTaskIds = new Set<string>();
      data.forEach((c) => {
        c.courseWork.forEach((w) => {
          if (isSelectableClassroomWork(w, mat)) allTaskIds.add(w.id);
        });
      });
      setSelectedTasks(allTaskIds);
      setExpandedCourses(new Set());
      setStep('selecting');
    },
    [],
  );

  // Reset the prompted flag whenever the user hits "Try Again".
  useEffect(() => {
    promptedRef.current = false;
  }, [loadKey]);

  // Fetch the user's email to show Android users which account is being used.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        const { supabase } = await import('@/src/lib/supabase');
        const { data } = await supabase.auth.getUser();
        if (data?.user?.email) setConnectedEmail(data.user.email);
      } catch {}
    })();
  }, []);

  // If a Classroom refresh token is already cached, skip the browser entirely
  // and just load courses. Otherwise open Google exactly once per load attempt.
  useEffect(() => {
    if (notConfigured) {
      setError(
        'Google Classroom needs the correct OAuth client for this device: use an iOS client id in EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID (not the "Web" client) for iPhone, and an Android client id for EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID. Add them to EAS build env, then rebuild.',
      );
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const cached = await getValidToken();
        if (cancelled) return;
        if (cached) {
          await startCourseLoad(cached);
          return;
        }

        if (!request || promptedRef.current) return;
        promptedRef.current = true;
        const result = await promptAsync();
        if (cancelled) return;

        if (result.type === 'cancel' || result.type === 'dismiss') {
          setError('Sign-in was cancelled.');
          return;
        }
        if (result.type !== 'success' || !('params' in result)) {
          const rawErr =
            result.type === 'error' && 'error' in result ? (result as any).error : null;
          const msg = rawErr
            ? String(rawErr?.message || rawErr?.description || rawErr)
            : 'Browser session was dismissed.';
          setError(`Could not connect: ${msg}`);
          return;
        }

        // ── Android: Direct token flow (no code exchange needed) ──
        if (result.params?.__directToken === 'true') {
          const { accessToken, refreshToken: providerRefresh, expiresAt } = result.params;
          if (!accessToken) {
            setError('Could not connect: missing Google access token. Please sign out and sign in again with Google.');
            return;
          }

          // Save the token to the classroom cache so future auto-syncs work
          const { setClassroomToken: saveToken } = await import('@/src/storage');
          await saveToken({
            accessToken,
            expiresAt: Number(expiresAt) || Date.now() + 3600000,
            refreshToken: providerRefresh || undefined,
          });

          if (cancelled) return;
          await startCourseLoad(accessToken);
          return;
        }

        // ── iOS / Web: Standard code exchange flow ──
        if (!result.params?.code) {
          setError('Could not connect: no authorization code received.');
          return;
        }

        const verifier = result.params.codeVerifier || request.codeVerifier;
        if (!verifier) {
          setError('Could not connect: missing PKCE verifier.');
          return;
        }

        const token = await completeClassroomAuth({
          code: result.params.code,
          codeVerifier: verifier,
          redirectUri,
          clientId,
        });
        if (cancelled) return;
        await startCourseLoad(token);
      } catch (e: any) {
        if (!cancelled) {
          console.error('Google Classroom Connection Error:', e);
          const m = String(e?.message || '');
          if (/cancel|dismiss/i.test(m)) {
            setError(`Sign-in was cancelled. ${m}`);
          } else {
            setError(`Could not connect: ${m}`);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadKey, request, promptAsync, redirectUri, clientId, notConfigured, startCourseLoad]);

  // Keep the unused `response` referenced so future hot-reload detection does not warn.
  useEffect(() => {
    /* response state is consumed inside the effect above via promptAsync */
    void response;
  }, [response]);

  useEffect(() => {
    if (step !== 'selecting' || courses.length === 0) return;
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      courses.forEach((c) => {
        c.courseWork.forEach((w) => {
          if (w.workType !== 'MATERIAL') return;
          if (includeMaterials) next.add(w.id);
          else next.delete(w.id);
        });
      });
      return next;
    });
  }, [includeMaterials, step, courses.length]);

  const toggleCourse = useCallback((courseId: string, courseWork: GoogleCourseWork[]) => {
    setSelectedCourses(prev => {
      const next = new Set(prev);
      const isSelected = next.has(courseId);
      if (isSelected) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      setSelectedTasks(tPrev => {
        const tNext = new Set(tPrev);
        courseWork.forEach((w) => {
          if (!isSelectableClassroomWork(w, includeMaterials)) return;
          if (isSelected) tNext.delete(w.id);
          else tNext.add(w.id);
        });
        return tNext;
      });
      return next;
    });
  }, [includeMaterials]);

  const toggleTask = useCallback((taskId: string, courseId: string) => {
    setSelectedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);

      // Keep selectedCourses in sync with the updated task set
      const c = courses.find((x) => x.id === courseId);
      const courseSelectableIds =
        c?.courseWork.filter((w) => isSelectableClassroomWork(w, includeMaterials)).map((w) => w.id) ?? [];
      const courseHasTasks = courseSelectableIds.some((id) => next.has(id));
      setSelectedCourses(prev2 => {
        const next2 = new Set(prev2);
        if (courseHasTasks) next2.add(courseId);
        else next2.delete(courseId);
        return next2;
      });

      return next;
    });
  }, [courses, includeMaterials]);

  const toggleExpand = useCallback((courseId: string) => {
    setExpandedCourses(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  }, []);

  const retryCourseLoad = useCallback(async (courseId: string) => {
    const token = tokenRef.current;
    if (!token) return;
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId ? { ...c, courseLoadPending: true, courseLoadError: false } : c,
      ),
    );
    try {
      const cw = await fetchCourseWork(token, courseId);
      setCourses((prev) =>
        prev.map((c) =>
          c.id === courseId
            ? { ...c, courseWork: cw, courseLoadPending: false, courseLoadError: false }
            : c,
        ),
      );
    } catch {
      setCourses((prev) =>
        prev.map((c) =>
          c.id === courseId
            ? { ...c, courseWork: [], courseLoadPending: false, courseLoadError: true }
            : c,
        ),
      );
    }
  }, []);

  const visibleCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => c.name.toLowerCase().includes(q));
  }, [courses, courseSearch]);

  const totalSelected = selectedTasks.size;

  // Derive which courses have at least one selected task — source of truth for import
  const coursesWithSelectedTasks = courses.filter((c) =>
    c.courseWork.some(
      (w) => selectedTasks.has(w.id) && isSelectableClassroomWork(w, includeMaterials),
    ),
  );
  const selectedCourseCount = coursesWithSelectedTasks.length;

  const handleImport = async () => {
    if (totalSelected === 0) {
      Alert.alert('No tasks selected', 'Please select at least one task to import.');
      return;
    }

    setStep('syncing');
    try {
      const courseIds = coursesWithSelectedTasks.map(c => c.id);
      const taskIds = Array.from(selectedTasks);

      await setClassroomPrefs({
        selectedCourseIds: courseIds,
        selectedTaskIds: taskIds,
        autoSync: true,
        lastSyncAt: null,
        includeClassroomMaterials: includeMaterials,
      });

      const result = await syncSelectedCourses(
        courseIds,
        (name, cur, total) => setSyncProgress(`Syncing ${name}... (${cur}/${total})`),
        user.startDate,
        taskIds,
      );

      // Refresh tasks and courses in context
      const { data: { session } } = await (await import('@/src/lib/supabase')).supabase.auth.getSession();
      if (session?.user?.id) {
        const [fresh, freshCourses] = await Promise.all([
          taskDb.getTasks(session.user.id),
          coursesDb.getCourses(session.user.id),
        ]);
        setTasks(fresh);
        setAppCourses(freshCourses);
      }

      setStep('done');

      const baseMsg =
        result.failedCount > 0
          ? `Imported ${result.syncedCount} task${result.syncedCount !== 1 ? 's' : ''}. ${result.failedCount} could not be saved. Auto-sync is on.`
          : `Imported ${result.syncedCount} task${result.syncedCount !== 1 ? 's' : ''}. Auto-sync is on.`;
      const errLines = result.errors?.filter(Boolean) ?? [];
      if (errLines.length > 0) {
        const detailText = errLines.slice(0, 20).join('\n\n');
        Alert.alert('Import finished', baseMsg, [
          { text: 'Details', onPress: () => Alert.alert('What went wrong', detailText) },
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Import complete', baseMsg, [{ text: 'OK', onPress: () => router.back() }]);
      }
    } catch (e: any) {
      setStep('selecting');
      Alert.alert('Sync failed', 'Could not import tasks. Please check your connection and try again.');
    }
  };

  const formatDueDate = (w: GoogleCourseWork) => {
    if (!w.dueDate) return 'No due date';
    const { year, month, day } = w.dueDate;
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-MY', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const workTypeLabel = (wt: string) => {
    switch (wt) {
      case 'ASSIGNMENT': return 'Assignment';
      case 'SHORT_ANSWER_QUESTION':
      case 'MULTIPLE_CHOICE_QUESTION': return 'Question';
      case 'QUIZ': return 'Quiz';
      case 'MATERIAL': return 'Material';
      default: return wt;
    }
  };

  const workTypeColor = (wt: string) => {
    switch (wt) {
      case 'ASSIGNMENT': return '#3b82f6';
      case 'SHORT_ANSWER_QUESTION':
      case 'MULTIPLE_CHOICE_QUESTION':
      case 'QUIZ': return '#8b5cf6';
      case 'MATERIAL': return '#6b7280';
      default: return '#6b7280';
    }
  };

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Feather name="alert-circle" size={48} color={theme.danger} />
        <Text style={[styles.errorTitle, { color: theme.text }]}>Connection Failed</Text>
        <Text style={[styles.errorMsg, { color: theme.textSecondary }]}>{error}</Text>
        <Pressable
          style={[styles.retryBtn, { backgroundColor: theme.primary }]}
          onPress={() => {
            setError(null);
            setCourses([]);
            setLoadKey((k) => k + 1);
          }}
        >
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={{ color: theme.textSecondary }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (step === 'authenticating' || step === 'loading_work') {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadText, { color: theme.text }]}>
          {step === 'authenticating' ? 'Connecting to Google Classroom…' : 'Loading your classes and assignments…'}
        </Text>
        <Text style={[styles.subText, { color: theme.textSecondary }]}>
          {step === 'authenticating'
            ? 'Complete sign-in in the browser if prompted.'
            : 'Courses appear as they load. You can pick tasks in a moment.'}
        </Text>
        {Platform.OS === 'android' && connectedEmail && (
          <View style={styles.emailNotice}>
            <Feather name="info" size={14} color="#3b82f6" />
            <Text style={styles.emailNoticeText}>
              Using your login account: <Text style={{ fontWeight: '700' }}>{connectedEmail}</Text>
            </Text>
          </View>
        )}
      </View>
    );
  }

  // Syncing state
  if (step === 'syncing' || step === 'done') {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadText, { color: theme.text }]}>{syncProgress || 'Starting sync...'}</Text>
      </View>
    );
  }

  // Selection state
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBack}>
          <Feather name="chevron-left" size={28} color={theme.primary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Google Classroom</Text>
          <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
            Select courses and tasks to import
          </Text>
        </View>
      </View>

      <View style={[styles.toolbar, { backgroundColor: theme.background }]}>
        <View style={[styles.searchWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="search" size={18} color={theme.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search classes"
            placeholderTextColor={theme.textSecondary}
            value={courseSearch}
            onChangeText={setCourseSearch}
            style={[styles.searchInput, { color: theme.text }]}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
        <View style={[styles.materialToggle, { borderColor: theme.border }]}>
          <Text style={[styles.materialToggleLabel, { color: theme.text }]}>Include readings & materials</Text>
          <Switch value={includeMaterials} onValueChange={setIncludeMaterials} />
        </View>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {courses.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Feather name="inbox" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No active courses found in your Google Classroom.
            </Text>
            {Platform.OS === 'android' && connectedEmail && (
              <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>
                Connected as {connectedEmail}. If your courses are on a different Google account, sign out and sign in with that account instead.
              </Text>
            )}
          </View>
        ) : visibleCourses.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Feather name="search" size={40} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No classes match &quot;{courseSearch.trim()}&quot;.
            </Text>
          </View>
        ) : (
          visibleCourses.map(course => {
            const isExpanded = expandedCourses.has(course.id);
            const isCourseSelected = selectedCourses.has(course.id);
            const actionableWork = course.courseWork.filter((w) =>
              isSelectableClassroomWork(w, includeMaterials),
            );
            const selectedInCourse = actionableWork.filter(w => selectedTasks.has(w.id)).length;
            const countLabel = course.courseLoadPending
              ? 'Loading…'
              : `${selectedInCourse}/${actionableWork.length} tasks`;

            return (
              <View
                key={course.id}
                style={[styles.courseCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                {/* Course header */}
                <Pressable style={styles.courseHeader} onPress={() => toggleExpand(course.id)}>
                  <Pressable
                    style={[
                      styles.checkbox,
                      isCourseSelected
                        ? { backgroundColor: '#4285f4', borderColor: '#4285f4' }
                        : { borderColor: theme.textSecondary },
                    ]}
                    onPress={() => toggleCourse(course.id, course.courseWork)}
                  >
                    {isCourseSelected && <Feather name="check" size={14} color="#fff" />}
                  </Pressable>

                  <View style={styles.courseInfo}>
                    <Text style={[styles.courseName, { color: theme.text }]} numberOfLines={1}>
                      {course.name}
                    </Text>
                    <Text style={[styles.courseCount, { color: theme.textSecondary }]}>
                      {countLabel}
                      {course.section ? `  •  ${course.section}` : ''}
                    </Text>
                  </View>

                  <Feather
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={theme.textSecondary}
                  />
                </Pressable>

                {/* Coursework list */}
                {isExpanded && (
                  <View style={styles.workList}>
                    {course.courseLoadPending ? (
                      <Text style={[styles.noWork, { color: theme.textSecondary }]}>Loading assignments…</Text>
                    ) : course.courseLoadError ? (
                      <View style={styles.errorCourseWrap}>
                        <Text style={[styles.noWork, { color: theme.textSecondary }]}>
                          Could not load assignments for this class.
                        </Text>
                        <Pressable
                          style={[styles.retryCourseBtn, { borderColor: theme.primary }]}
                          onPress={() => retryCourseLoad(course.id)}
                        >
                          <Text style={{ color: theme.primary, fontWeight: '600' }}>Try again</Text>
                        </Pressable>
                      </View>
                    ) : actionableWork.length === 0 ? (
                      <Text style={[styles.noWork, { color: theme.textSecondary }]}>
                        No assignments or quizzes in this course
                      </Text>
                    ) : (
                      actionableWork.map(work => {
                        const isTaskSelected = selectedTasks.has(work.id);
                        return (
                          <Pressable
                            key={work.id}
                            style={[
                              styles.workRow,
                              { borderTopColor: theme.border },
                            ]}
                            onPress={() => toggleTask(work.id, course.id)}
                          >
                            <Pressable
                              style={[
                                styles.checkboxSmall,
                                isTaskSelected
                                  ? { backgroundColor: '#34a853', borderColor: '#34a853' }
                                  : { borderColor: theme.textSecondary },
                              ]}
                              onPress={() => toggleTask(work.id, course.id)}
                            >
                              {isTaskSelected && <Feather name="check" size={12} color="#fff" />}
                            </Pressable>

                            <View style={styles.workInfo}>
                              <Text
                                style={[styles.workTitle, { color: theme.text }]}
                                numberOfLines={2}
                              >
                                {work.title}
                              </Text>
                              <View style={styles.workMeta}>
                                <View
                                  style={[
                                    styles.typeBadge,
                                    { backgroundColor: workTypeColor(work.workType) + '20' },
                                  ]}
                                >
                                  <Text
                                    style={[styles.typeText, { color: workTypeColor(work.workType) }]}
                                  >
                                    {workTypeLabel(work.workType)}
                                  </Text>
                                </View>
                                <Text style={[styles.dueText, { color: work.dueDate ? theme.textSecondary : '#d97706' }]}>
                                  {work.dueDate ? `Due ${formatDueDate(work)}` : 'No due date'}
                                </Text>
                              </View>
                            </View>
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom action bar */}
      {courses.length > 0 && (
        <View style={[styles.bottomBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <Text style={[styles.selSummary, { color: theme.textSecondary }]}>
            {totalSelected} task{totalSelected !== 1 ? 's' : ''} selected from{' '}
            {selectedCourseCount} course{selectedCourseCount !== 1 ? 's' : ''}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.importBtn,
              { backgroundColor: totalSelected > 0 ? '#4285f4' : '#94a3b8', opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={handleImport}
            disabled={totalSelected === 0}
          >
            <Feather name="download" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.importText}>
              Import {totalSelected} Task{totalSelected !== 1 ? 's' : ''}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadText: { fontSize: 18, fontWeight: '600', marginTop: 20, textAlign: 'center' },
  subText: { fontSize: 14, marginTop: 8, textAlign: 'center' },
  emailNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 20,
    maxWidth: 320,
  },
  emailNoticeText: { fontSize: 13, color: '#1e40af', flex: 1 },
  emptyHint: { fontSize: 13, marginTop: 12, textAlign: 'center', lineHeight: 19, paddingHorizontal: 8 },
  errorTitle: { fontSize: 20, fontWeight: '700', marginTop: 16 },
  errorMsg: { fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  retryBtn: { marginTop: 24, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  backLink: { marginTop: 16, padding: 8 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  headerBack: { padding: 8 },
  headerCenter: { flex: 1, marginLeft: 4 },
  headerTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  headerSub: { fontSize: 14, marginTop: 2 },

  toolbar: { paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 16, padding: 0 },
  materialToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  materialToggleLabel: { flex: 1, fontSize: 13, fontWeight: '600', paddingRight: 12 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 16 },

  emptyWrap: { alignItems: 'center', marginTop: 80, paddingHorizontal: 24 },
  emptyText: { fontSize: 15, textAlign: 'center', marginTop: 16, lineHeight: 22 },

  courseCard: {
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  courseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  courseInfo: { flex: 1 },
  courseName: { fontSize: 16, fontWeight: '700' },
  courseCount: { fontSize: 13, marginTop: 2 },

  workList: { paddingBottom: 4 },
  noWork: { paddingHorizontal: 50, paddingVertical: 12, fontSize: 13 },
  errorCourseWrap: { paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', gap: 10 },
  retryCourseBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },

  workRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    paddingLeft: 50,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  checkboxSmall: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  workInfo: { flex: 1 },
  workTitle: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  workMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  typeText: { fontSize: 11, fontWeight: '600' },
  dueText: { fontSize: 12 },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  selSummary: { fontSize: 13, marginBottom: 10, textAlign: 'center' },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
  },
  importText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
