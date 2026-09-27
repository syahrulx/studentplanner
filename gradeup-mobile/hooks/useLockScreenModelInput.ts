import { useMemo } from 'react';

import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { t, type TranslationKey } from '@/src/i18n';
import { resolveDisplayTeachingWeeks } from '@/src/lib/academicWeek';
import { collectLockScreenTasks, type LockScreenModelInput } from '@/src/lib/lockScreen/lockScreenModel';

/** Everything a day model is built from except the clock; each build adds `nowMs` and `uses24h`. */
export type LockScreenBaseInput = Omit<LockScreenModelInput, 'nowMs' | 'uses24h'>;

/**
 * The lock screen's model input, gathered the way Home gathers its own view
 * (accepted shared tasks merged in, Home's semester length), so the Studio
 * preview, the render host's pictures and Home never disagree about a day.
 *
 * A new object whenever any of it changes, which is also what tells the render
 * host to re-plan. The model caches per input object, so spread it into a new
 * object per build and never mutate it.
 *
 * `T` only changes with the language: useTranslations hands out a new function
 * every render, which would restart every debounce keyed on the input.
 *
 * Pass `enabled = false` to skip the work (the render host while inactive).
 */
export function useLockScreenModelInput(): LockScreenBaseInput;
export function useLockScreenModelInput(enabled: boolean): LockScreenBaseInput | null;
export function useLockScreenModelInput(enabled = true): LockScreenBaseInput | null {
  const {
    user,
    timetable,
    tasks,
    courses,
    subjectColors,
    getSubjectColor,
    isTaskDoneOn,
    academicCalendar,
    weekStartsOn,
    language,
  } = useApp();
  const { acceptedSharedTasks, userId: communityUserId } = useCommunity();
  const { startDate, currentWeek } = user;

  const T = useMemo(() => (key: TranslationKey) => t(language, key), [language]);

  return useMemo<LockScreenBaseInput | null>(() => {
    if (!enabled) return null;
    const allTasks = collectLockScreenTasks(tasks, acceptedSharedTasks, communityUserId);
    const totalWeeks = resolveDisplayTeachingWeeks(academicCalendar, startDate, allTasks);
    return {
      timetable,
      tasks: allTasks,
      courses,
      subjectColors,
      getSubjectColor,
      isTaskDoneOn,
      pulseCalendar: academicCalendar ? { ...academicCalendar, totalWeeks } : null,
      totalWeeks,
      startDate: startDate || null,
      currentWeek,
      weekStartsOn,
      language,
      T,
    };
  }, [
    enabled,
    tasks,
    acceptedSharedTasks,
    communityUserId,
    academicCalendar,
    startDate,
    currentWeek,
    timetable,
    courses,
    subjectColors,
    getSubjectColor,
    isTaskDoneOn,
    weekStartsOn,
    language,
    T,
  ]);
}
