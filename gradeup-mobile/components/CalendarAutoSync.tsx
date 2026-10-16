import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useApp } from '@/src/context/AppContext';
import { supabase } from '@/src/lib/supabase';
import { calendarFields } from '@/src/lib/calendarSync';
import { SYNC_EVERY_MS, runCalendarSync } from '@/src/lib/calendarSyncRunner';

/**
 * Brings tasks imported from the phone calendar up to date with the phone:
 * once the tasks have loaded, and again when the app comes back to the front,
 * at most every 15 minutes. Draws nothing. See calendarSyncRunner.ts.
 */
export function CalendarAutoSync() {
  const { tasks, updateTask, dataReady } = useApp();
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const lastRunRef = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!dataReady) return;

    const run = async () => {
      if (runningRef.current || Date.now() - lastRunRef.current < SYNC_EVERY_MS) return;
      runningRef.current = true;
      lastRunRef.current = Date.now();
      try {
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user?.id;
        if (!uid) return;
        await runCalendarSync(uid, tasksRef.current, (u) => {
          // Re-check against the task as it is now: if the student edited one of
          // these fields while the sync ran, their edit wins.
          const task = tasksRef.current.find((t) => t.id === u.taskId);
          if (!task || task.isDone) return;
          const now = calendarFields(task);
          for (const [f, v] of Object.entries(u.before)) {
            if (now[f as keyof typeof now] !== v) return;
          }
          updateTask(u.taskId, u.changes);
        });
      } catch {
        // Calendar unreadable right now (access changed, provider error): try next time.
      } finally {
        runningRef.current = false;
      }
    };

    void run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
    });
    return () => sub.remove();
  }, [dataReady, updateTask]);

  return null;
}
