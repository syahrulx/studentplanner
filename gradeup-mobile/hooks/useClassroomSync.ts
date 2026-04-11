import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import type { Task } from '@/src/types';
import { getClassroomPrefs, type ClassroomPrefs } from '@/src/storage';
import { syncSelectedCourses } from '@/src/lib/googleClassroom';
import { getTasks } from '@/src/lib/taskDb';
import { supabase } from '@/src/lib/supabase';

export function formatClassroomLastSync(ts: number | null): string {
  if (!ts) return 'Never synced';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type SetTasks = Dispatch<SetStateAction<Task[]>>;

/**
 * Shared Google Classroom prefs + manual sync (used on Home & Planner).
 * Profile uses the same prefs via {@link refreshPrefs} but keeps connect / manage / disconnect only.
 */
export function useClassroomSync(userStartDate: string | undefined, setTasks: SetTasks) {
  const [classroomPrefs, setClassroomPrefsState] = useState<ClassroomPrefs | null>(null);
  const [classroomLoading, setClassroomLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshPrefs = useCallback(async () => {
    const p = await getClassroomPrefs();
    setClassroomPrefsState(p);
    setClassroomLoading(false);
  }, []);

  const isClassroomLinked = classroomPrefs !== null && classroomPrefs.selectedCourseIds.length > 0;

  const openClassroomSetup = useCallback(() => {
    router.push('/classroom-sync' as any);
  }, []);

  const runSync = useCallback(async () => {
    if (isSyncing) return;
    const prefs = await getClassroomPrefs();
    if (!prefs || prefs.selectedCourseIds.length === 0) {
      openClassroomSetup();
      return;
    }
    setIsSyncing(true);
    try {
      const result = await syncSelectedCourses(
        prefs.selectedCourseIds,
        undefined,
        userStartDate,
        undefined,
      );
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user?.id) {
        const fresh = await getTasks(session.user.id);
        setTasks(fresh);
      }
      await refreshPrefs();
      const baseMsg =
        result.failedCount > 0
          ? `Synced ${result.syncedCount} task${result.syncedCount !== 1 ? 's' : ''}. ${result.failedCount} could not be saved.`
          : `Successfully synced ${result.syncedCount} task${result.syncedCount !== 1 ? 's' : ''}.`;
      const errLines = result.errors?.filter(Boolean) ?? [];
      if (errLines.length > 0) {
        const detailText = errLines.slice(0, 20).join('\n\n');
        Alert.alert(result.failedCount > 0 ? 'Sync finished with issues' : 'Sync complete', baseMsg, [
          { text: 'Details', onPress: () => Alert.alert('What went wrong', detailText) },
          { text: 'OK', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Sync complete', baseMsg);
      }
    } catch {
      Alert.alert('Sync failed', 'Could not sync Google Classroom. Check your connection and try again.');
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, userStartDate, setTasks, refreshPrefs, openClassroomSetup]);

  return {
    classroomPrefs,
    classroomLoading,
    refreshPrefs,
    isClassroomLinked,
    isSyncing,
    runSync,
    openClassroomSetup,
    formatClassroomLastSync,
  };
}
