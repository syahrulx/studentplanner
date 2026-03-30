import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import {
  connectGoogleClassroom,
  fetchCoursesWithWork,
  syncSelectedCourses,
  type CourseWithWork,
  type GoogleCourseWork,
} from '@/src/lib/googleClassroom';
import { setClassroomPrefs } from '@/src/storage';
import * as taskDb from '@/src/lib/taskDb';
import * as coursesDb from '@/src/lib/coursesDb';

type Step = 'connecting' | 'selecting' | 'syncing' | 'done';

export default function ClassroomSync() {
  const theme = useTheme();
  const { user, setTasks, setCourses: setAppCourses } = useApp();

  const [step, setStep] = useState<Step>('connecting');
  const [courses, setCourses] = useState<CourseWithWork[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [syncProgress, setSyncProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await connectGoogleClassroom();
        if (cancelled) return;
        tokenRef.current = token;
        const data = await fetchCoursesWithWork(token);
        if (cancelled) return;

        setCourses(data);

        const allCourseIds = new Set(data.map(c => c.id));
        setSelectedCourses(allCourseIds);
        const allTaskIds = new Set<string>();
        data.forEach(c => c.courseWork.forEach(w => allTaskIds.add(w.id)));
        setSelectedTasks(allTaskIds);
        setExpandedCourses(new Set(data.map(c => c.id)));
        setStep('selecting');
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to connect.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
        courseWork.forEach(w => {
          if (isSelected) tNext.delete(w.id);
          else tNext.add(w.id);
        });
        return tNext;
      });
      return next;
    });
  }, []);

  const toggleTask = useCallback((taskId: string, courseId: string) => {
    setSelectedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);

      // Keep selectedCourses in sync with the updated task set
      const courseWorkIds = courses
        .find(c => c.id === courseId)
        ?.courseWork.map(w => w.id) ?? [];
      const courseHasTasks = courseWorkIds.some(id => next.has(id));
      setSelectedCourses(prev2 => {
        const next2 = new Set(prev2);
        if (courseHasTasks) next2.add(courseId);
        else next2.delete(courseId);
        return next2;
      });

      return next;
    });
  }, [courses]);

  const toggleExpand = useCallback((courseId: string) => {
    setExpandedCourses(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  }, []);

  const totalSelected = selectedTasks.size;

  // Derive which courses have at least one selected task — source of truth for import
  const coursesWithSelectedTasks = courses.filter(c =>
    c.courseWork.some(w => selectedTasks.has(w.id)),
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

      const msg = result.failedCount > 0
        ? `Synced ${result.syncedCount} tasks. ${result.failedCount} failed.`
        : `Successfully imported ${result.syncedCount} tasks!`;

      Alert.alert('Sync Complete', msg + '\n\nAuto-sync is now enabled.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      setStep('selecting');
      Alert.alert('Sync Failed', e.message || 'Something went wrong.');
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

  // Error state
  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Feather name="alert-circle" size={48} color={theme.danger} />
        <Text style={[styles.errorTitle, { color: theme.text }]}>Connection Failed</Text>
        <Text style={[styles.errorMsg, { color: theme.textSecondary }]}>{error}</Text>
        <Pressable
          style={[styles.retryBtn, { backgroundColor: theme.primary }]}
          onPress={() => { setError(null); setStep('connecting'); }}
        >
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={{ color: theme.textSecondary }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // Connecting state
  if (step === 'connecting') {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadText, { color: theme.text }]}>Connecting to Google Classroom...</Text>
        <Text style={[styles.subText, { color: theme.textSecondary }]}>Please complete sign-in in the browser</Text>
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
          </View>
        ) : (
          courses.map(course => {
            const isExpanded = expandedCourses.has(course.id);
            const isCourseSelected = selectedCourses.has(course.id);
            const actionableWork = course.courseWork.filter(
              w => w.workType !== 'MATERIAL',
            );
            const selectedInCourse = actionableWork.filter(w => selectedTasks.has(w.id)).length;

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
                      {selectedInCourse}/{actionableWork.length} tasks
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
                    {actionableWork.length === 0 ? (
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
