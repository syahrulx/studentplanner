import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { AppState as RNAppState } from 'react-native';
import '../notificationsForeground';
import type { UserProfile, Course, Task, Note, Flashcard, AcademicCalendar, TimetableEntry } from '../types';
import type { ThemeId } from '@/constants/Themes';
import {
  initialUser,
  initialCourses,
  initialTasks,
  initialNotes,
  initialFlashcards,

} from '../seedData';

// Fix 1: Module-level counter for flashcard IDs — never resets between renders.
// A component-body `let` would reset to 0 on every render, causing duplicate IDs
// when addFlashcard is called rapidly (e.g. 10 cards from Promise.all).
let _flashcardIdSeq = Date.now();
import {
  getAcademicProgress,
  getAcademicProgressFromCalendar,
  mergeTeachingWeeksForStoredCalendar,
} from '../lib/academicUtils';
import {
  getTheme,
  setTheme as persistTheme,
  getThemePack,
  setThemePack as persistThemePack,
  setRevisionSettings as persistRevision,
  getCompletedStudyKeys,
  setCompletedStudyKeys as persistCompletedStudies,
  getPinnedTaskIds,
  setPinnedTaskIds as persistPinnedTaskIds,
  getSubjectColors,
  setSubjectColors as persistSubjectColors,
  getCourses,
  setCourses as persistCourses,
  getLanguage,
  setLanguage as persistLanguage,
  getLoghat,
  setLoghat as persistLoghat,
  getPlannerView,
  setPlannerView as persistPlannerView,
  getWeekStartsOn,
  setWeekStartsOn as persistWeekStartsOn,
  getAutoDeletePastTasks,
  setAutoDeletePastTasks as persistAutoDeletePastTasks,
  type RevisionSettings,
  type AppLanguage,
  type AppLoghat,
  type ThemePackId,
  type PlannerViewMode,
  type WeekStartsOn,
} from '../storage';
import { SUBJECT_COLOR_OPTIONS } from '../constants/subjectColors';
import { scheduleRevisionNotification, cancelAllRevisionNotifications, requestRevisionPermissions } from '../revisionNotifications';
import {
  requestNotificationPermissions,
  scheduleTaskNotifications,
  cancelTaskNotifications,
  rescheduleAllTaskNotifications,
  fireClassroomSyncNotification,
} from '../notificationManager';
import {
  cancelAllAttendanceNotifications,
  rescheduleAttendanceNotifications,
} from '../attendanceNotifications';
import { ensureAttendanceCategory, flushPendingAttendanceEvents } from '../attendanceRecording';
import { supabase } from '../lib/supabase';
import * as studyDb from '../lib/studyDb';
import * as taskDb from '../lib/taskDb';
import * as studyTimeDb from '../lib/studyTimeDb';
import * as coursesDb from '../lib/coursesDb';
import * as profileDb from '../lib/profileDb';
import * as academicCalendarDb from '../lib/academicCalendarDb';
import * as timetableDb from '../lib/timetableDb';
import { clearSemesterDataFromDatabase } from '../lib/semesterClearDb';
import { getAcceptedSharedTasks, updateSharedTaskCompletion, syncNewTaskToStreams } from '../lib/communityApi';
import { syncExpoPushTokenToProfile, subscribeExpoPushTokenUpdates } from '../lib/pushRegistration';
import { fetchUitmTimetable, profileUpdatesFromMyStudentPayload } from '../lib/timetableParsers/uitm';
import { getTodayISO, isTaskPastDueNow } from '../utils/date';
import { getCalendarProvider } from '../lib/calendarProviders';
import { UITM_HEA_PERIOD_COUNT_MIN } from '../lib/calendarProviders/uitm';
import { resolveUniversityIdForCalendar } from '../lib/universities';
import { fetchLatestCalendarForUniversity, offerToCalendarPatch } from '../lib/universityCalendarOffersDb';
import { buildHomeWidgetProps } from '../lib/homeWidgetProps';
import { syncHomeScreenWidget } from '../homeWidgetSync';

function getAuthFallbackName(session: { user?: { user_metadata?: Record<string, unknown>; email?: string } } | null): string {
  const u = session?.user;
  if (!u) return '';
  const meta = u.user_metadata ?? {};
  const metaName = (meta.name || meta.full_name || meta.display_name) as string | undefined;
  const emailName = typeof u.email === 'string' ? u.email.split('@')[0] : '';
  return (String(metaName || '').trim() || emailName || '').trim();
}

type AppState = {
  /** True once remote data has loaded (or we confirmed no session). Prevents seed-data flash. */
  dataReady: boolean;
  user: UserProfile;
  setUser: React.Dispatch<React.SetStateAction<UserProfile>>;
  academicCalendar: AcademicCalendar | null;
  setAcademicCalendar: React.Dispatch<React.SetStateAction<AcademicCalendar | null>>;
  updateProfile: (updates: {
    name?: string;
    university?: string | null;
    universityId?: string | null;
    academicLevel?: UserProfile['academicLevel'];
    studentId?: string;
    program?: string;
    part?: number;
    avatarUrl?: string | null;
    campus?: string;
    faculty?: string;
    studyMode?: string;
    currentSemester?: number;
    heaTermCode?: string | null;
    mystudentEmail?: string;
    portalTeachingAnchoredSemester?: number | null;
    subscriptionPlan?: import('../types').SubscriptionPlan;
  }) => Promise<void>;
  updateAcademicCalendar: (calendar: Omit<AcademicCalendar, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  clearAcademicCalendar: () => Promise<void>;
  courses: Course[];
  setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
  addCourse: (course: Course, options?: { skipRemote?: boolean }) => void;
  renameCourse: (subjectId: string, newName: string) => void;
  deleteCourse: (subjectId: string) => void;
  tasks: Task[];
  tasksVersion: number;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  deleteNote: (noteId: string) => void;
  flashcards: Flashcard[];
  setFlashcards: React.Dispatch<React.SetStateAction<Flashcard[]>>;
  flashcardFolders?: never; // DEPRECATED - Folders are dead.
  addFlashcard: (noteId: string, front: string, back: string) => Flashcard;
  updateFlashcard: (cardId: string, front: string, back: string) => void;
  deleteFlashcard: (cardId: string) => void;
  deleteFlashcardsForNote: (noteId: string) => Promise<void>;
  pendingExtraction: string;
  setPendingExtraction: (text: string) => void;
  pendingClassroomTasks: import('../lib/googleClassroom').PendingNewTask[];
  clearPendingClassroomTasks: () => void;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  themePack: ThemePackId;
  setThemePack: (pack: ThemePackId) => void;
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  loghat: AppLoghat | null;
  setLoghat: (loghat: AppLoghat | null) => void;
  revisionSettings: RevisionSettings;
  revisionSettingsList: RevisionSettings[];
  setRevisionSettings: (settings: RevisionSettings) => Promise<void>;
  deleteStudySetting: (id: string) => Promise<void>;
  completedStudyKeys: string[];
  markStudyDone: (key: string) => void;
  unmarkStudyDone: (key: string) => void;
  addTask: (task: Task, options?: { skipRemote?: boolean }) => void;
  updateTask: (
    taskId: string,
    updates: Partial<Pick<Task, 'dueDate' | 'dueTime' | 'courseId' | 'title' | 'type' | 'notes' | 'needsDate'>>,
  ) => void;
  toggleTaskDone: (taskId: string) => void;
  deleteTask: (taskId: string) => void;
  pinnedTaskIds: string[];
  pinTask: (taskId: string) => boolean;
  unpinTask: (taskId: string) => void;
  subjectColors: Record<string, string>;
  setSubjectColor: (courseId: string, color: string) => void;
  getSubjectColor: (courseId: string) => string;
  lastPlannerView: PlannerViewMode;
  setLastPlannerView: (view: PlannerViewMode) => void;
  handleSaveNote: (note: Note) => void;
  handleGenerateFlashcards: (newCards: Flashcard[]) => void;
  timetable: TimetableEntry[];
  setTimetable: React.Dispatch<React.SetStateAction<TimetableEntry[]>>;
  /** Save timetable to DB without linking a university portal. */
  saveTimetableOnly: (entries: TimetableEntry[], options?: { semesterLabel?: string }) => Promise<void>;
  saveTimetableAndLink: (entries: TimetableEntry[], universityId: string, studentId: string) => Promise<void>;
  disconnectUniversity: () => Promise<void>;
  /** UiTM: re-fetch timetable + portal profile; overwrites saved timetable and MyStudent fields. */
  refreshUniversityTimetable: (password: string, options?: { courses?: string[] }) => Promise<void>;
  weekStartsOn: WeekStartsOn;
  setWeekStartsOn: (mode: WeekStartsOn) => Promise<void>;
  /** When true, past-due tasks are removed automatically (local + Supabase when signed in). Default false. */
  autoDeletePastTasks: boolean;
  setAutoDeletePastTasks: (enabled: boolean) => Promise<void>;
  updateTimetableEntry: (
    entryId: string,
    patch: Partial<
      Pick<
        TimetableEntry,
        | 'displayName'
        | 'slotColor'
        | 'lecturer'
        | 'location'
        | 'day'
        | 'startTime'
        | 'endTime'
        | 'subjectCode'
        | 'subjectName'
        | 'group'
      >
    >,
  ) => Promise<void>;
  /** Append one timetable slot and persist (replaces rows for this user). */
  addTimetableEntry: (entry: TimetableEntry) => Promise<void>;
  /** Remove a slot by id and persist. */
  removeTimetableEntry: (entryId: string) => Promise<void>;
  /** Wipes timetable, subjects, tasks, academic calendar, study times, SOW imports (DB + storage). Triple-confirm in UI. */
  clearSemesterData: () => Promise<void>;
  /** Re-fetch profile, tasks, calendar, study settings, courses, timetable from Supabase (same as cold start). */
  refreshRemoteData: () => Promise<void>;
  /** @internal Manually mark data as ready (e.g. after sign-up completes profile save). */
  markDataReady: () => void;
};

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [academicCalendar, setAcademicCalendar] = useState<AcademicCalendar | null>(null);
  const [user, setUserState] = useState<UserProfile>(() => {
    const progress = getAcademicProgress(initialUser.startDate, 14);
    return {
      ...initialUser,
      currentWeek: progress.week,
      isBreak: progress.isBreak,
      semesterPhase: progress.semesterPhase,
    };
  });

  const setUser = useCallback((newUser: UserProfile | ((prev: UserProfile) => UserProfile)) => {
    setUserState((prev) => {
      const updated = typeof newUser === 'function' ? newUser(prev) : newUser;
      const totalWeeks = academicCalendar?.totalWeeks ?? 14;
      const calendarStart = (academicCalendar?.startDate ?? '').trim().slice(0, 10);
      const newEffectiveStart = (calendarStart || (updated.startDate ?? '').trim().slice(0, 10)).trim();
      const prevEffectiveStart = (calendarStart || (prev.startDate ?? '').trim().slice(0, 10)).trim();
      const normalizedStartDate = academicCalendar?.startDate ?? updated.startDate ?? prev.startDate;

      if (newEffectiveStart === prevEffectiveStart) {
        return {
          ...updated,
          startDate: normalizedStartDate,
          currentWeek: updated.currentWeek ?? prev.currentWeek,
          isBreak: updated.isBreak !== undefined ? updated.isBreak : prev.isBreak,
          semesterPhase: updated.semesterPhase ?? prev.semesterPhase,
        };
      }

      const progress = getAcademicProgress(newEffectiveStart, totalWeeks);
      return {
        ...updated,
        startDate: normalizedStartDate,
        currentWeek: progress.week,
        isBreak: progress.isBreak,
        semesterPhase: progress.semesterPhase,
      };
    });
  }, [academicCalendar?.totalWeeks, academicCalendar?.startDate]);

  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksVersion, setTasksVersion] = useState(0);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initialFlashcards);

  const [pendingExtraction, setPendingExtraction] = useState('');
  const [pendingClassroomTasks, setPendingClassroomTasks] = useState<import('../lib/googleClassroom').PendingNewTask[]>([]);
  const clearPendingClassroomTasks = useCallback(() => setPendingClassroomTasks([]), []);
  const [theme, setThemeState] = useState<ThemeId>('light');
  const [themePack, setThemePackState] = useState<ThemePackId>('none');
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [loghat, setLoghatState] = useState<AppLoghat | null>(null);
  const defaultRevision: RevisionSettings = {
    enabled: false,
    time: '20:00',
    subjectId: '',
    day: 'Every day',
    durationMinutes: 60,
    topic: '',
    repeat: 'repeated',
  };
  const [revisionSettings, setRevisionState] = useState<RevisionSettings>(defaultRevision);
  const [revisionSettingsList, setRevisionSettingsList] = useState<RevisionSettings[]>([]);
  const [completedStudyKeys, setCompletedStudyKeys] = useState<string[]>([]);
  const [pinnedTaskIds, setPinnedTaskIds] = useState<string[]>([]);
  const [subjectColors, setSubjectColorsState] = useState<Record<string, string>>({});
  const [lastPlannerView, setLastPlannerViewState] = useState<PlannerViewMode>('week');
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [weekStartsOn, setWeekStartsOnState] = useState<WeekStartsOn>('monday');
  const [autoDeletePastTasks, setAutoDeletePastTasksState] = useState(false);
  /** True once remote data loaded (or no session confirmed). Prevents seed-data flash on UI + widgets. */
  const [dataReady, setDataReady] = useState(false);
  const tasksRef = useRef<Task[]>([]);
  /** Latest auth user id we loaded remote data for — avoids applying results after sign-out. */
  const remoteUserIdRef = useRef<string | null>(null);
  /** Prevents calendar auto-sync from running more than once per session. */
  const calendarAutoSyncedRef = useRef(false);
  const academicCalendarRef = useRef<AcademicCalendar | null>(null);
  const loadRemoteDataRef = useRef<(uid: string, authFallbackName?: string) => Promise<void>>(async () => {});
  const homeWidgetInputsRef = useRef({
    tasks,
    courses,
    timetable,
    pinnedTaskIds,
    userName: user.name,
    theme,
  });
  const withEffectiveTotalWeeks = useCallback((cal: AcademicCalendar | null | undefined): AcademicCalendar | null => {
    if (!cal) return null;
    const effective = mergeTeachingWeeksForStoredCalendar(cal);
    if (effective === cal.totalWeeks) return cal;
    return { ...cal, totalWeeks: effective };
  }, []);

  /** Keep teaching week in sync with the active academic calendar (same start as task week mapping). */
  useEffect(() => {
    setUserState((prev) => {
      const totalW = academicCalendar?.totalWeeks ?? 14;
      const nextStart = (academicCalendar?.startDate ?? prev.startDate ?? '').trim().slice(0, 10);
      const startFor = (academicCalendar?.startDate ?? prev.startDate ?? '').trim();
      const progress =
        academicCalendar?.periods && academicCalendar.periods.length > 0
          ? getAcademicProgressFromCalendar(academicCalendar, prev.startDate)
          : getAcademicProgress(startFor, totalW);
      if (
        (prev.startDate ?? '').trim().slice(0, 10) === nextStart &&
        prev.currentWeek === progress.week &&
        prev.isBreak === progress.isBreak &&
        prev.semesterPhase === progress.semesterPhase
      ) {
        return prev;
      }
      return {
        ...prev,
        startDate: academicCalendar?.startDate ?? prev.startDate,
        currentWeek: progress.week,
        isBreak: progress.isBreak,
        semesterPhase: progress.semesterPhase,
      };
    });
  }, [academicCalendar?.startDate, academicCalendar?.totalWeeks, academicCalendar?.periods]);

  useEffect(() => {
    academicCalendarRef.current = academicCalendar;
  }, [academicCalendar]);

  /**
   * UiTM: when the profile resolves to UiTM but `academic_calendars` has no full HEA period table,
   * pull official HEA, upsert to Supabase, and align `user.currentWeek` / `startDate` with that calendar.
   */
  useEffect(() => {
    const uniId = resolveUniversityIdForCalendar({
      profileUniversityId: user.universityId,
      connectionUniversityId: undefined,
      studentId: user.studentId,
      universityName: user.university,
    });
    if (uniId !== 'uitm') return;

    let cancelled = false;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid || cancelled || remoteUserIdRef.current !== uid) return;

      const cal = academicCalendarRef.current;
      const periodsN = Array.isArray(cal?.periods) ? cal.periods.length : 0;
      if (periodsN >= UITM_HEA_PERIOD_COUNT_MIN) return;

      try {
        const profileForSync: UserProfile = {
          ...initialUser,
          ...user,
          universityId: 'uitm',
        };
        const provider = getCalendarProvider('uitm');
        if (!provider) return;
        const newCal = await provider.autoSync(profileForSync, cal ?? undefined);
        if (cancelled || remoteUserIdRef.current !== uid) return;
        if (!newCal) return;

        const saved = await academicCalendarDb.upsertCalendar(uid, newCal);
        const savedEff = withEffectiveTotalWeeks(saved);
        setAcademicCalendar(savedEff);
        const prog =
          savedEff?.periods && Array.isArray(savedEff.periods) && savedEff.periods.length > 0
            ? getAcademicProgressFromCalendar(savedEff)
            : getAcademicProgress(
                savedEff?.startDate ?? saved.startDate,
                savedEff?.totalWeeks ?? saved.totalWeeks,
              );
        setUserState((prev) => ({
          ...prev,
          startDate: savedEff?.startDate ?? saved.startDate,
          currentWeek: prog.week,
          isBreak: prog.isBreak,
          semesterPhase: prog.semesterPhase,
        }));
      } catch (e) {
        if (__DEV__) console.warn('[Rencana] UiTM HEA calendar ensure failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    user.universityId,
    user.studentId,
    user.university,
    user.academicLevel,
    user.heaTermCode,
    academicCalendar?.id,
    academicCalendar?.startDate,
    academicCalendar?.endDate,
    academicCalendar?.totalWeeks,
    academicCalendar?.periods?.length ?? 0,
  ]);

  /**
   * Re-run attendance reschedule when the app returns to foreground.
   *
   * This covers two failure modes that previously left auto-generated (UiTM)
   * timetables without any check-in notifications:
   *   1. Notification permission was still "undetermined" the first time we
   *      tried to schedule (right after UiTM sync on first launch) — the
   *      reschedule bailed out and nothing ever re-triggered it because the
   *      `timetable` state never changed again.
   *   2. iOS dropped some pending locals while backgrounded — resuming
   *      re-seeds the NEAREST 40 occurrences.
   */
  const timetableForAttendanceRef = useRef<TimetableEntry[]>([]);
  useEffect(() => {
    timetableForAttendanceRef.current = timetable;
  }, [timetable]);
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const entries = timetableForAttendanceRef.current;
      if (!entries || entries.length === 0) return;
      void supabase.auth.getSession().then(({ data: { session } }) => {
        const uid = session?.user?.id;
        if (!uid) return;
        rescheduleAttendanceNotifications(uid, entries).catch(() => {});
      });
    });
    return () => sub.remove();
  }, []);

  /** Recompute teaching week when the app returns to foreground (e.g. new calendar day). */
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const ac = academicCalendarRef.current;
      setUserState((prev) => {
        const totalW = ac?.totalWeeks ?? 14;
        const nextStart = (ac?.startDate ?? prev.startDate ?? '').trim().slice(0, 10);
        const startFor = (ac?.startDate ?? prev.startDate ?? '').trim();
        const progress =
          ac?.periods && ac.periods.length > 0
            ? getAcademicProgressFromCalendar(ac, prev.startDate)
            : getAcademicProgress(startFor, totalW);
        if (
          (prev.startDate ?? '').trim().slice(0, 10) === nextStart &&
          prev.currentWeek === progress.week &&
          prev.isBreak === progress.isBreak &&
          prev.semesterPhase === progress.semesterPhase
        ) {
          return prev;
        }
        return {
          ...prev,
          startDate: ac?.startDate ?? prev.startDate,
          currentWeek: progress.week,
          isBreak: progress.isBreak,
          semesterPhase: progress.semesterPhase,
        };
      });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const purgePastDueTasks = useCallback(async () => {
    const list = tasksRef.current;
    const past = list.filter(isTaskPastDueNow);
    if (past.length === 0) return;
    const pastIds = new Set(past.map((t) => t.id));

    setTasks((prev) => prev.filter((t) => !pastIds.has(t.id)));
    setPinnedTaskIds((prev) => {
      const next = prev.filter((id) => !pastIds.has(id));
      if (next.length !== prev.length) persistPinnedTaskIds(next);
      return next;
    });
    setTasksVersion((v) => v + 1);

    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (uid) {
      for (const id of pastIds) {
        await taskDb.deleteTask(uid, id).catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    if (!autoDeletePastTasks) return;
    void purgePastDueTasks();
  }, [autoDeletePastTasks, tasks, purgePastDueTasks]);

  useEffect(() => {
    if (!autoDeletePastTasks) return;
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active') void purgePastDueTasks();
    });
    return () => sub.remove();
  }, [autoDeletePastTasks, purgePastDueTasks]);

  useEffect(() => {
    getTheme().then(setThemeState);
    getThemePack().then(setThemePackState);
    getCompletedStudyKeys().then(setCompletedStudyKeys);
    getPinnedTaskIds().then(setPinnedTaskIds);
    getSubjectColors().then(setSubjectColorsState);
    getPlannerView().then(setLastPlannerViewState);
    getLanguage().then(setLanguageState);
    getLoghat().then(setLoghatState);
    getWeekStartsOn().then(setWeekStartsOnState);
    getAutoDeletePastTasks().then(setAutoDeletePastTasksState);
    getCourses().then((stored) => {
      if (stored && stored.length > 0) setCourses(stored);
    });

    let remoteLoadGeneration = 0;

    // Helper to load all remote data for a given user id (including profile, calendar, subjects)
    const loadRemoteData = (uid: string, authFallbackName?: string) => {
      const gen = ++remoteLoadGeneration;
      remoteUserIdRef.current = uid;
      return Promise.allSettled([
        studyDb.getNotes(uid),
        studyDb.getFlashcards(uid),
        taskDb.getTasks(uid),
        studyTimeDb.getAllStudySettings(uid),
        coursesDb.getCourses(uid),
        profileDb.getProfile(uid),
        academicCalendarDb.getActiveCalendar(uid),
        timetableDb.getTimetable(uid),
        timetableDb.getUniversityConnection(uid),
      ]).then(async (results) => {
        if (gen !== remoteLoadGeneration || remoteUserIdRef.current !== uid) return;

        const r0 = results[0];
        const r1 = results[1];
        const r2 = results[2];
        const r3 = results[3];
        const r4 = results[4];
        const r5 = results[5];
        const r6 = results[6];
        const r7 = results[7];
        const r8 = results[8];

        if (__DEV__) {
          results.forEach((r, i) => {
            if (r.status === 'rejected') {
              console.warn('[Rencana] loadRemoteData: request failed', i, r.reason);
            }
          });
        }

        let loadedCourses: import('../types').Course[] = [];
        let validCourseIds: Set<string> | null = null;
        if (r4.status === 'fulfilled') {
          loadedCourses = r4.value;
          validCourseIds = new Set(loadedCourses.map((c) => c.id.toUpperCase()));
          setCourses(loadedCourses);
        }

        let loadedNotes: import('../types').Note[] = [];
        if (r0.status === 'fulfilled') {
          loadedNotes = r0.value;
          if (validCourseIds) {
            // Soft-hide notes whose subject isn't in the user's current course
            // list. We previously auto-deleted them from Supabase here, but
            // that caused permanent data loss in edge cases (course loader
            // glitches, subject_id case mismatches, etc.). Now it's
            // display-only — the user can restore access by re-adding the
            // course, or we can clean up server-side via an admin script.
            loadedNotes = loadedNotes.filter((n) => validCourseIds.has(n.subjectId.toUpperCase()));
          }
          setNotes(loadedNotes);
        }

        if (r1.status === 'fulfilled') {
          const loadedCards = r1.value;
          const validNoteIds = new Set(loadedNotes.map((n) => n.id));

          // Same policy as notes above: soft-hide cards whose parent note is
          // missing/hidden. Never auto-delete from Supabase — a missing note
          // can simply mean the note row hasn't synced yet.
          const validCards = loadedCards.filter((c) => c.noteId && validNoteIds.has(c.noteId));
          setFlashcards(validCards);
        }
        if (r2.status === 'fulfilled') {
          setTasks(r2.value);
          rescheduleAllTaskNotifications(r2.value).catch(() => {});
        }
        if (r3.status === 'fulfilled') {
          const studyList = r3.value;
          setRevisionSettingsList(studyList);
          setRevisionState(studyList.length > 0 ? studyList[0] : defaultRevision);
        }
        // (r4 is already processed and set above)
        if (r7.status === 'fulfilled') {
          const tt = r7.value ?? [];
          setTimetable(tt);
          rescheduleAttendanceNotifications(uid, tt).catch(() => {});
        }

        const profile = r5.status === 'fulfilled' ? r5.value : undefined;
        const uniConn = r8.status === 'fulfilled' ? r8.value : null;

        let calendar: AcademicCalendar | null | undefined = undefined;
        if (r6.status === 'fulfilled') {
          calendar = r6.value ?? null;
          const uniId = resolveUniversityIdForCalendar({
            profileUniversityId: profile?.universityId,
            connectionUniversityId: uniConn?.universityId,
            studentId: profile?.studentId,
            universityName: profile?.university,
          });
          const portalSem = profile?.currentSemester;
          const anchoredDb = profile?.portalTeachingAnchoredSemester;
          const calSlice = calendar ? String(calendar.startDate ?? '').trim().slice(0, 10) : '';
          const endSlice = calendar ? String(calendar.endDate ?? '').trim().slice(0, 10) : '';
          const calStartOk = /^\d{4}-\d{2}-\d{2}$/.test(calSlice);
          const calEndOk = /^\d{4}-\d{2}-\d{2}$/.test(endSlice);
          const twNum = Number(calendar?.totalWeeks);
          const hasUsableCalendar =
            calendar != null &&
            calStartOk &&
            calEndOk &&
            Number.isFinite(twNum) &&
            twNum >= 1;
          // Only seed the synthetic "today" placeholder when there is no real saved calendar.
          // If the user already saved HEA (or manual) dates, never clobber them just because
          // portalTeachingAnchoredSemester was missing.
          const shouldApplyPortalTeachingAnchor =
            uniId === 'uitm' &&
            typeof portalSem === 'number' &&
            portalSem > 0 &&
            !hasUsableCalendar &&
            (anchoredDb == null || anchoredDb !== portalSem || !calendar || !calStartOk);
          const shouldMarkPortalAnchorOnly =
            uniId === 'uitm' &&
            typeof portalSem === 'number' &&
            portalSem > 0 &&
            hasUsableCalendar &&
            anchoredDb == null;

          /**
           * Portal “anchor” used to upsert startDate=today + no periods, which forced teaching week 1 and
           * wiped HEA data. Teaching week must come from HEA / auto-sync only — record portal semester on profile.
           */
          if (shouldApplyPortalTeachingAnchor) {
            try {
              await profileDb.updateProfile(uid, { portalTeachingAnchoredSemester: portalSem });
              if (profile) {
                (profile as { portalTeachingAnchoredSemester?: number }).portalTeachingAnchoredSemester =
                  portalSem;
              }
            } catch (e) {
              if (__DEV__) console.warn('[Rencana] Portal teaching-week anchor on load failed', e);
            }
          } else if (shouldMarkPortalAnchorOnly) {
            try {
              await profileDb.updateProfile(uid, { portalTeachingAnchoredSemester: portalSem });
              if (profile) {
                (profile as { portalTeachingAnchoredSemester?: number }).portalTeachingAnchoredSemester =
                  portalSem;
              }
            } catch (e) {
              if (__DEV__) console.warn('[Rencana] Portal teaching-week anchor metadata failed', e);
            }
          }

          if (gen !== remoteLoadGeneration || remoteUserIdRef.current !== uid) return;
          setAcademicCalendar(withEffectiveTotalWeeks(calendar));
        }

        if (gen !== remoteLoadGeneration || remoteUserIdRef.current !== uid) return;

        setUserState((prev) => {
          let next = { ...prev };
          if (profile !== undefined) {
            const profileName = (profile?.name || '').trim();
            const fallbackName = (authFallbackName || '').trim();
            next = {
              ...next,
              name: profileName || fallbackName || next.name || 'Student',
            };
            if (profile) {
              const sid = (profile.studentId ?? '').trim();
              const prog = (profile.program ?? '').trim();
              const p =
                profile.part != null && Number.isFinite(profile.part) && profile.part > 0
                  ? Math.floor(profile.part)
                  : 0;
              const cs =
                profile.currentSemester != null &&
                Number.isFinite(profile.currentSemester) &&
                profile.currentSemester > 0
                  ? Math.floor(profile.currentSemester)
                  : undefined;
              const anchored =
                profile.portalTeachingAnchoredSemester != null &&
                Number.isFinite(profile.portalTeachingAnchoredSemester) &&
                profile.portalTeachingAnchoredSemester > 0
                  ? Math.floor(profile.portalTeachingAnchoredSemester)
                  : undefined;
              const heaTc = (profile.heaTermCode ?? '').trim() || undefined;
              next = {
                ...next,
                university: profile.university,
                universityId: profile.universityId,
                academicLevel: profile.academicLevel,
                studentId: sid,
                program: prog,
                part: p,
                avatar: profile.avatarUrl,
                campus: (profile.campus ?? '').trim(),
                faculty: (profile.faculty ?? '').trim(),
                studyMode: (profile.studyMode ?? '').trim(),
                currentSemester: cs,
                heaTermCode: heaTc,
                mystudentEmail: (profile.mystudentEmail ?? '').trim(),
                lastSync: profile.lastSync,
                portalTeachingAnchoredSemester: anchored,
                subscriptionPlan: profile.subscriptionPlan ?? 'free',
              };
            }
          } else if ((authFallbackName || '').trim()) {
            next = { ...next, name: (authFallbackName || '').trim() || next.name };
          }

          if (uniConn?.universityId && !next.universityId) {
            next = { ...next, universityId: uniConn.universityId };
          }
          if (uniConn?.lastSync && !next.lastSync) {
            next = { ...next, lastSync: uniConn.lastSync };
          }
          if (uniConn?.studentId?.trim() && !(next.studentId || '').trim()) {
            next = { ...next, studentId: uniConn.studentId.trim() };
          }

          if (calendar !== undefined) {
            const calEff = withEffectiveTotalWeeks(calendar);
            const totalW = calEff?.totalWeeks ?? 14;
            const startForProgress = calEff?.startDate ?? next.startDate;
            const progress =
              calEff?.periods && Array.isArray(calEff.periods) && calEff.periods.length > 0
                ? getAcademicProgressFromCalendar(calEff, next.startDate)
                : getAcademicProgress(startForProgress, totalW);
            if (calendar) {
              next = {
                ...next,
                startDate: calEff?.startDate ?? calendar.startDate,
                currentWeek: progress.week,
                isBreak: progress.isBreak,
                semesterPhase: progress.semesterPhase,
              };
            } else {
              next = {
                ...next,
                currentWeek: progress.week,
                isBreak: progress.isBreak,
                semesterPhase: progress.semesterPhase,
              };
            }
          }
          return next;
        });

        // Auto-sync academic calendar via university provider (once per session)
        if (!calendarAutoSyncedRef.current) {
          calendarAutoSyncedRef.current = true;
          const uniId = resolveUniversityIdForCalendar({
            profileUniversityId: profile?.universityId,
            connectionUniversityId: uniConn?.universityId,
            studentId: profile?.studentId,
            universityName: profile?.university,
          });
          const provider = getCalendarProvider(uniId);
          if (provider && profile) {
            try {
              const profileForSync = {
                ...initialUser,
                ...(profile as any),
                universityId: uniId,
              };
              const newCal = await provider.autoSync(profileForSync, calendar ?? undefined);
              if (newCal && gen === remoteLoadGeneration && remoteUserIdRef.current === uid) {
                const saved = await academicCalendarDb.upsertCalendar(uid, newCal);
                const savedEff = withEffectiveTotalWeeks(saved);
                setAcademicCalendar(savedEff);
                const prog =
                  savedEff?.periods && Array.isArray(savedEff.periods) && savedEff.periods.length > 0
                    ? getAcademicProgressFromCalendar(savedEff)
                    : getAcademicProgress(savedEff?.startDate ?? saved.startDate, savedEff?.totalWeeks ?? saved.totalWeeks);
                setUserState((prev) => ({
                  ...prev,
                  startDate: savedEff?.startDate ?? saved.startDate,
                  currentWeek: prog.week,
                  isBreak: prog.isBreak,
                  semesterPhase: prog.semesterPhase,
                }));
              }
            } catch (e) {
              if (__DEV__) console.warn('[Rencana] Calendar auto-sync failed', e);
            }
          }

          // Auto-load admin-published calendar (silent). UiTM uses HEA/provider above — skip admin overwrite.
          if (uniId && uniId !== 'uitm') {
            try {
              const adminOffer = await fetchLatestCalendarForUniversity(uniId);
              if (adminOffer && gen === remoteLoadGeneration && remoteUserIdRef.current === uid) {
                const currentCal = academicCalendarRef.current;
                // Only apply if the user has no saved calendar.
                // Otherwise, this can overwrite user edits on every reload since academic_calendars.created_at
                // does not change on upsert, making any newer admin offer appear "newer" forever.
                if (!currentCal) {
                  const saved = await academicCalendarDb.upsertCalendar(uid, {
                    ...offerToCalendarPatch(adminOffer),
                    teachingWeekOffset: 0,
                  });
                  const savedEff = withEffectiveTotalWeeks(saved);
                  setAcademicCalendar(savedEff);
                  const prog =
                    savedEff?.periods && Array.isArray(savedEff.periods) && savedEff.periods.length > 0
                      ? getAcademicProgressFromCalendar(savedEff)
                      : getAcademicProgress(savedEff?.startDate ?? saved.startDate, savedEff?.totalWeeks ?? saved.totalWeeks);
                  setUserState((prev) => ({
                    ...prev,
                    startDate: savedEff?.startDate ?? saved.startDate,
                    currentWeek: prog.week,
                    isBreak: prog.isBreak,
                    semesterPhase: prog.semesterPhase,
                  }));
                }
              }
            } catch (e) {
              if (__DEV__) console.warn('[Rencana] Admin calendar auto-load failed', e);
            }
          }
        }

        // Check for new Google Classroom tasks in the background (no silent import)
        try {
          const { checkForNewTasks } = require('../lib/googleClassroom');
          const newTasks = await checkForNewTasks();
          if (newTasks && newTasks.length > 0) {
            setPendingClassroomTasks(newTasks);
            fireClassroomSyncNotification(newTasks.length).catch(() => {});
          }
        } catch {}

        // ── Mark data as ready — UI can now render real data ──
        setDataReady(true);
      });
    };

    loadRemoteDataRef.current = loadRemoteData;

    requestNotificationPermissions()
      .then(() => ensureAttendanceCategory().catch(() => {}))
      .then(() => supabase.auth.getSession())
      .then(({ data: { session } }) => {
        const uid = session?.user?.id;
        if (uid) {
          void syncExpoPushTokenToProfile(uid);
          void flushPendingAttendanceEvents();
          // Ensure attendance notifications are scheduled only after permission is granted.
          // This avoids silent failures when timetable loads before the permission prompt resolves.
          rescheduleAttendanceNotifications(uid, timetable).catch(() => {});
        }
      })
      .catch(() => {});

    const removePushTokenListener = subscribeExpoPushTokenUpdates(() => remoteUserIdRef.current);

    // Track whether getSession() already fired loadRemoteData so we don't
    // run it twice when onAuthStateChange fires INITIAL_SESSION immediately after.
    let initialSessionHandled = false;

    // Load once for current session (cold start / reload)
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      if (!uid) {
        // No session on cold start — mark ready so UI shows sign-in prompt immediately
        setDataReady(true);
        return;
      }
      initialSessionHandled = true;
      void loadRemoteData(uid, getAuthFallbackName(session));
    });

    // Load remote data whenever auth state changes.
    // Important: session can be briefly null on refresh before storage restores — only clear state on SIGNED_OUT.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id;
      if (!uid) {
        if (event === 'SIGNED_OUT') {
          remoteLoadGeneration += 1;
          remoteUserIdRef.current = null;
          calendarAutoSyncedRef.current = false;
          setDataReady(false);
          setUserState(() => {
            const p = getAcademicProgress(initialUser.startDate, 14);
            return {
              ...initialUser,
              name: 'Student',
              currentWeek: p.week,
              isBreak: p.isBreak,
              semesterPhase: p.semesterPhase,
            };
          });
          setTasks([]);
          setNotes(initialNotes);
          setFlashcards(initialFlashcards);
          setRevisionSettingsList([]);
          setRevisionState(defaultRevision);
          setCourses([]);
          setAcademicCalendar(null);
          setTimetable([]);
          cancelAllAttendanceNotifications().catch(() => {});
          // After clearing, mark ready so auth screen renders
          setDataReady(true);
        }
        return;
      }
      // Skip the INITIAL_SESSION event if getSession() already handled it above
      // to avoid firing 18 duplicate queries on every cold start.
      if (event === 'INITIAL_SESSION' && initialSessionHandled) return;
      void loadRemoteData(uid, getAuthFallbackName(session));
      void syncExpoPushTokenToProfile(uid);
    });

    return () => {
      remoteLoadGeneration += 1;
      subscription.unsubscribe();
      removePushTokenListener();
    };
  }, []);

  homeWidgetInputsRef.current = { tasks, courses, timetable, pinnedTaskIds, userName: user.name, theme };

  // Solution C: Gate widget sync — only push to widgets once real data is loaded
  useEffect(() => {
    if (!dataReady) return; // Skip seed-data writes to widget
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      syncHomeScreenWidget(
        buildHomeWidgetProps({
          tasks,
          courses,
          timetable,
          pinnedTaskIds,
          userName: user.name,
          signedIn: Boolean(session?.user?.id),
          themeId: theme,
          maxTasks: 3,
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [dataReady, tasks, tasksVersion, courses, timetable, pinnedTaskIds, user.name, theme]);

  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const r = homeWidgetInputsRef.current;
      void supabase.auth.getSession().then(({ data: { session } }) => {
        syncHomeScreenWidget(
          buildHomeWidgetProps({
            tasks: r.tasks,
            courses: r.courses,
            timetable: r.timetable,
            pinnedTaskIds: r.pinnedTaskIds,
            userName: r.userName,
            signedIn: Boolean(session?.user?.id),
            themeId: r.theme,
            maxTasks: 3,
          }),
        );
      });
    });
    return () => sub.remove();
  }, []);

  const refreshRemoteData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    await loadRemoteDataRef.current(uid, getAuthFallbackName(session));
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    persistTheme(next);
  }, []);

  const setThemePack = useCallback((next: ThemePackId) => {
    setThemePackState(next);
    persistThemePack(next);
  }, []);

  const setLanguage = useCallback((lang: AppLanguage) => {
    setLanguageState(lang);
    persistLanguage(lang);
  }, []);

  const setLoghat = useCallback((value: AppLoghat | null) => {
    setLoghatState(value);
    persistLoghat(value);
  }, []);

  const setLastPlannerView = useCallback((view: PlannerViewMode) => {
    setLastPlannerViewState(view);
    persistPlannerView(view);
  }, []);

  const setRevisionSettings = useCallback(async (settings: RevisionSettings) => {
    if (settings.enabled) {
      const ok = await requestRevisionPermissions();
      if (!ok) {
        const fallback = { ...settings, enabled: false };
        setRevisionState(fallback);
        await persistRevision(fallback);
        await cancelAllRevisionNotifications();
        return;
      }
      await scheduleRevisionNotification(settings);
    } else {
      await cancelAllRevisionNotifications();
    }
    setRevisionState(settings);
    await persistRevision(settings);

    // Persist study settings to Supabase and refresh list so UI shows all saved study times
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (uid) {
      await studyTimeDb.upsertStudySettings(uid, settings);
      const list = await studyTimeDb.getAllStudySettings(uid);
      setRevisionSettingsList(list);
    }
  }, []);

  const deleteStudySetting = useCallback(async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    await studyTimeDb.deleteStudySetting(uid, id);
    const list = await studyTimeDb.getAllStudySettings(uid);
    setRevisionSettingsList(list);
    setRevisionState(list.length > 0 ? list[0] : defaultRevision);
  }, []);

  const markStudyDone = useCallback((key: string) => {
    setCompletedStudyKeys((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      persistCompletedStudies(next);
      return next;
    });
  }, []);

  const unmarkStudyDone = useCallback((key: string) => {
    setCompletedStudyKeys((prev) => {
      const next = prev.filter((k) => k !== key);
      persistCompletedStudies(next);
      return next;
    });
  }, []);

  const updateProfile = useCallback(
    async (updates: {
      name?: string;
      university?: string | null;
      universityId?: string | null;
      academicLevel?: UserProfile['academicLevel'];
      studentId?: string;
      program?: string;
      part?: number;
      avatarUrl?: string | null;
      campus?: string;
      faculty?: string;
      studyMode?: string;
      currentSemester?: number;
      heaTermCode?: string | null;
      mystudentEmail?: string;
      portalTeachingAnchoredSemester?: number | null;
      subscriptionPlan?: import('../types').SubscriptionPlan;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      await profileDb.updateProfile(uid, updates as any);
      setUserState((prev) => ({
        ...prev,
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.university !== undefined ? { university: updates.university ?? undefined } : {}),
        ...(updates.universityId !== undefined ? { universityId: updates.universityId ?? undefined } : {}),
        ...(updates.academicLevel !== undefined ? { academicLevel: updates.academicLevel } : {}),
        ...(updates.studentId !== undefined ? { studentId: updates.studentId.trim() } : {}),
        ...(updates.program !== undefined ? { program: updates.program.trim() } : {}),
        ...(updates.part !== undefined ? { part: updates.part > 0 ? updates.part : 0 } : {}),
        ...(updates.avatarUrl !== undefined ? { avatar: updates.avatarUrl ?? undefined } : {}),
        ...(updates.campus !== undefined ? { campus: updates.campus.trim() } : {}),
        ...(updates.faculty !== undefined ? { faculty: updates.faculty.trim() } : {}),
        ...(updates.studyMode !== undefined ? { studyMode: updates.studyMode.trim() } : {}),
        ...(updates.currentSemester !== undefined
          ? {
              currentSemester:
                updates.currentSemester > 0 ? updates.currentSemester : undefined,
            }
          : {}),
        ...(updates.heaTermCode !== undefined
          ? { heaTermCode: updates.heaTermCode ? String(updates.heaTermCode).trim() : undefined }
          : {}),
        ...(updates.mystudentEmail !== undefined ? { mystudentEmail: updates.mystudentEmail.trim() } : {}),
        ...(updates.portalTeachingAnchoredSemester !== undefined
          ? {
              portalTeachingAnchoredSemester:
                updates.portalTeachingAnchoredSemester != null &&
                updates.portalTeachingAnchoredSemester > 0
                  ? updates.portalTeachingAnchoredSemester
                  : undefined,
            }
          : {}),
        ...(updates.subscriptionPlan !== undefined ? { subscriptionPlan: updates.subscriptionPlan } : {}),
      }));
    },
    [],
  );

  const updateAcademicCalendar = useCallback(async (calendar: Omit<AcademicCalendar, 'id' | 'userId' | 'createdAt'>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    const saved = await academicCalendarDb.upsertCalendar(uid, calendar);
    setAcademicCalendar(saved);
    const progress =
      saved?.periods && Array.isArray(saved.periods) && saved.periods.length > 0
        ? getAcademicProgressFromCalendar(saved, saved.startDate)
        : getAcademicProgress(saved.startDate, saved.totalWeeks);
    setUserState((prev) => ({
      ...prev,
      startDate: saved.startDate,
      currentWeek: progress.week,
      isBreak: progress.isBreak,
      semesterPhase: progress.semesterPhase,
    }));
  }, []);

  const clearAcademicCalendar = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    await academicCalendarDb.deleteAllCalendarsForUser(uid);
    setAcademicCalendar(null);
    setUserState((prev) => {
      const p = getAcademicProgress((prev.startDate ?? initialUser.startDate) as any, 14);
      return { ...prev, currentWeek: p.week, isBreak: p.isBreak, semesterPhase: p.semesterPhase };
    });
  }, []);

  const addTask = useCallback((task: Task, options?: { skipRemote?: boolean }) => {
    setTasks((prev) => [task, ...prev]);
    scheduleTaskNotifications(task).catch(() => {});
    if (!options?.skipRemote) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        const uid = session?.user?.id;
        if (!uid) return;
        taskDb.upsertTask(uid, task).then(({ error }) => {
          if (error) {
            console.warn('[Rencana] Failed to sync task to Supabase:', error.message);
          } else {
            syncNewTaskToStreams(task.id, uid).catch(err => {
              console.warn('[Rencana] Failed to auto-sync task to streams:', err);
            });
          }
        });
      });
    }
  }, []);

  const updateTask = useCallback(
    (
      taskId: string,
      updates: Partial<Pick<Task, 'dueDate' | 'dueTime' | 'courseId' | 'title' | 'type' | 'notes' | 'needsDate'>>,
    ) => {
    const id = String(taskId).trim();
    setTasks((prev) => {
      const task = prev.find((t) => String(t.id).trim() === id);
      if (!task) return prev;
      const mergedBase: Task = {
        ...task,
        ...(updates.courseId !== undefined ? { courseId: String(updates.courseId).trim() || task.courseId } : {}),
        ...(updates.title !== undefined ? { title: String(updates.title).trim() } : {}),
        ...(updates.type !== undefined ? { type: updates.type } : {}),
        ...(updates.notes !== undefined ? { notes: String(updates.notes) } : {}),
        ...(updates.needsDate !== undefined ? { needsDate: updates.needsDate } : {}),
      };
      const rawDueDate = updates.dueDate !== undefined ? updates.dueDate : mergedBase.dueDate;
      const dueDate = (rawDueDate ?? '').trim().slice(0, 10);
      const rawDueTime = updates.dueTime !== undefined ? updates.dueTime : mergedBase.dueTime;
      const dueTime = (rawDueTime ?? '').trim().length >= 5 ? (rawDueTime ?? '').trim().slice(0, 5) : (rawDueTime ?? '23:59').trim();
      const todayISO = new Date().toISOString().slice(0, 10);
      const today = new Date(todayISO + 'T00:00:00');
      const due = new Date(dueDate + 'T00:00:00');
      const dueDateValid = !Number.isNaN(due.getTime()) && dueDate.length === 10;
      const diffDays = dueDateValid ? Math.floor((due.getTime() - today.getTime()) / 864e5) : 30;
      const deadlineRisk: Task['deadlineRisk'] = diffDays <= 2 ? 'High' : diffDays <= 7 ? 'Medium' : 'Low';
      const suggestedWeek = (() => {
        if (!dueDateValid) return mergedBase.suggestedWeek || 1;
        const start = user?.startDate ? new Date(user.startDate + 'T00:00:00') : today;
        const diff = Math.floor((due.getTime() - start.getTime()) / 864e5);
        const computed = Math.max(1, Math.ceil(diff / 7));
        return Number.isFinite(computed) ? computed : mergedBase.suggestedWeek || 1;
      })();
      const updated: Task = {
        ...mergedBase,
        dueDate,
        dueTime,
        deadlineRisk,
        suggestedWeek,
      };
      cancelTaskNotifications(updated.id).then(() => scheduleTaskNotifications(updated)).catch(() => {});
      supabase.auth.getSession().then(({ data: { session } }) => {
        const uid = session?.user?.id;
        if (!uid) return;
        taskDb.upsertTask(uid, updated).then(({ error }) => {
          if (error) console.warn('[Rencana] Failed to sync task update:', error.message);
        });
      });
      // Return a new array with new object refs so React and list consumers see the update
      const next: Task[] = prev.map((t) =>
        String(t.id).trim() === id ? { ...updated } : { ...t }
      );
      setTasksVersion((v) => v + 1);
      return next;
    });
  }, [user?.startDate]);

  const toggleTaskDone = useCallback((taskId: string) => {
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === taskId ? { ...t, isDone: !t.isDone } : t));
      const updated = next.find((t) => t.id === taskId);
      if (updated) {
        if (updated.isDone) {
          cancelTaskNotifications(taskId).catch(() => {});
        } else {
          scheduleTaskNotifications(updated).catch(() => {});
        }
        supabase.auth.getSession().then(({ data: { session } }) => {
          const uid = session?.user?.id;
          if (!uid) return;
          taskDb.upsertTask(uid, updated).then(({ error }) => {
            if (error) console.warn('[Rencana] Failed to sync task:', error.message);
          });
          // Propagate to shared_tasks where I'm the owner
          getAcceptedSharedTasks().then(shared => {
            const mine = shared.filter(s => s.task_id === taskId && s.owner_id === uid);
            // Owner completion is reflected via the task itself (is_done); no extra update needed.
            // But if I'm a recipient, toggle recipient_completed
            const asRecipient = shared.filter(s => s.task_id === taskId && s.recipient_id === uid);
            for (const st of asRecipient) {
              updateSharedTaskCompletion(st.id, updated.isDone).catch(() => {});
            }
          }).catch(() => {});
        });
      }
      return next;
    });
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    cancelTaskNotifications(taskId).catch(() => {});
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setPinnedTaskIds((prev) => {
      const next = prev.filter((id) => id !== taskId);
      if (next.length !== prev.length) persistPinnedTaskIds(next);
      return next;
    });
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      await taskDb.deleteTask(uid, taskId);
    })();
  }, []);

  const pinTask = useCallback((taskId: string): boolean => {
    let added = false;
    setPinnedTaskIds((prev) => {
      if (prev.includes(taskId)) return prev;
      if (prev.length >= 2) return prev;
      added = true;
      const next = [...prev, taskId];
      persistPinnedTaskIds(next);
      return next;
    });
    return added;
  }, []);

  const unpinTask = useCallback((taskId: string) => {
    setPinnedTaskIds((prev) => {
      const next = prev.filter((id) => id !== taskId);
      if (next.length !== prev.length) persistPinnedTaskIds(next);
      return next;
    });
  }, []);

  const DEFAULT_PALETTE = SUBJECT_COLOR_OPTIONS.slice(0, 10);
  const getSubjectColor = useCallback((courseId: string): string => {
    return subjectColors[courseId] ?? DEFAULT_PALETTE[Math.abs(courseId.split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0)) % DEFAULT_PALETTE.length];
  }, [subjectColors]);

  const setSubjectColor = useCallback((courseId: string, color: string) => {
    setSubjectColorsState((prev) => {
      const next = { ...prev, [courseId]: color };
      persistSubjectColors(next);
      return next;
    });
  }, []);

  const addCourse = useCallback((course: Course, options?: { skipRemote?: boolean }) => {
    setCourses((prev) => {
      if (prev.some((c) => c.id.toUpperCase() === course.id.toUpperCase())) return prev;
      const next = [...prev, course];
      persistCourses(next);
      if (!options?.skipRemote) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user?.id) {
            coursesDb.addCourse(session.user.id, course).then(({ error }) => {
              if (error) console.warn('[Rencana] Failed to sync course to Supabase:', error.message);
            });
          }
        });
      }
      return next;
    });
  }, []);

  const renameCourse = useCallback((subjectId: string, newName: string) => {
    const upper = subjectId.toUpperCase();
    const trimmed = newName.trim();
    if (!trimmed) return;
    let updated: Course | undefined;
    setCourses((prev) => {
      const next = prev.map((c) => {
        if (c.id.toUpperCase() === upper) {
          const renamed = { ...c, name: trimmed };
          updated = renamed;
          return renamed;
        }
        return c;
      });
      persistCourses(next);
      return next;
    });
    if (!updated) return;
    const courseToSync = updated;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      try {
        await coursesDb.updateCourse(uid, courseToSync);
      } catch (err) {
        console.warn('[Rencana] Failed to sync renamed course to Supabase:', err);
      }
    })();
  }, []);

  const deleteCourse = useCallback((subjectId: string) => {
    const upper = subjectId.toUpperCase();
    setCourses((prev) => {
      const next = prev.filter((c) => c.id.toUpperCase() !== upper);
      persistCourses(next);
      return next;
    });
    setTasks((prev) => prev.filter((t) => t.courseId.toUpperCase() !== upper));
    setNotes((prev) => prev.filter((n) => n.subjectId.toUpperCase() !== upper)); // Cascade drop notes locally
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      await coursesDb.deleteCourse(uid, subjectId);
      const { data: relatedTasks } = await supabase
        .from('tasks')
        .select('id')
        .eq('user_id', uid)
        .eq('course_id', subjectId);
      if (relatedTasks && relatedTasks.length > 0) {
        for (const row of relatedTasks) {
          await taskDb.deleteTask(uid, String(row.id));
        }
      }
    })();
  }, []);

  const handleSaveNote = useCallback((note: Note) => {
    setNotes((prev) => {
      const exists = prev.find((n) => n.id === note.id);
      if (exists) return prev.map((n) => (n.id === note.id ? note : n));
      return [note, ...prev];
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        studyDb.upsertNote(session.user.id, note).catch((err) => {
          if (__DEV__) console.error('[Note] persist failed (save):', err);
        });
      }
    });
  }, []);



  const deleteNote = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    setFlashcards((prev) => prev.filter((c) => c.noteId !== noteId)); // Also remove associated flashcards locally
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        studyDb.deleteNote(session.user.id, noteId).catch((err) => {
          if (__DEV__) console.error('[Note] persist failed (delete):', err);
        });
        studyDb.deleteFlashcardsForNote(session.user.id, noteId).catch((err) => {
          if (__DEV__) console.error('[Flashcard] persist failed (deleteForNote):', err);
        });
      }
    });
  }, []);



  const handleGenerateFlashcards = useCallback((newCards: Flashcard[]) => {
    // Fix 4: Merge new cards into existing state instead of replacing everything
    // Replacing the entire array nukes cards from other decks if called with a partial set
    setFlashcards((prev) => {
      const existingIds = new Set(prev.map((c) => c.id));
      const genuinelyNew = newCards.filter((c) => !existingIds.has(c.id));
      return genuinelyNew.length > 0 ? [...genuinelyNew, ...prev] : prev;
    });
  }, []);

  // Fix 1: Module-level counter (outside component) prevents reset-to-0 on every render.
  // When addFlashcard is called rapidly (e.g. 10 cards from Promise.all), the closure
  // over a component-body variable always reads 0, causing duplicate IDs.
  const addFlashcard = useCallback((noteId: string, front: string, back: string): Flashcard => {
    const card: Flashcard = {
      id: `card-${Date.now()}-${_flashcardIdSeq++}`,
      noteId,
      front: front.trim() || 'Front',
      back: back.trim() || 'Back',
    };
    setFlashcards((prev) => [card, ...prev]);
    // Fix 7: Use cached remoteUserIdRef — avoids auth.getSession() round-trip per card
    const uid = remoteUserIdRef.current;
    if (uid) {
      studyDb.upsertFlashcard(uid, card).catch((err) => {
        if (__DEV__) console.error('[Flashcard] persist failed (add):', err);
      });
    }
    return card;
  }, []);

  const updateFlashcard = useCallback((cardId: string, front: string, back: string) => {
    setFlashcards((prev) => prev.map((c) => {
      if (c.id !== cardId) return c;
      const updated = { ...c, front: front.trim() || c.front, back: back.trim() || c.back };
      // Fix 7 + Fix 3: cached uid, error catch
      const uid = remoteUserIdRef.current;
      if (uid) {
        studyDb.upsertFlashcard(uid, updated).catch((err) => {
          if (__DEV__) console.error('[Flashcard] persist failed (update):', err);
        });
      }
      return updated;
    }));
  }, []);

  const deleteFlashcard = useCallback((cardId: string) => {
    setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
    // Fix 7 + Fix 3: cached uid, error catch
    const uid = remoteUserIdRef.current;
    if (uid) {
      studyDb.deleteFlashcard(uid, cardId).catch((err) => {
        if (__DEV__) console.error('[Flashcard] persist failed (delete):', err);
      });
    }
  }, []);

  /** Deletes ALL cards for a note — used by "Replace" mode in generation. */
  const deleteFlashcardsForNote = useCallback(async (noteId: string): Promise<void> => {
    setFlashcards((prev) => prev.filter((c) => c.noteId !== noteId));
    const uid = remoteUserIdRef.current;
    if (uid) {
      await studyDb.deleteFlashcardsForNote(uid, noteId).catch((err) => {
        if (__DEV__) console.error('[Flashcard] persist failed (deleteForNote):', err);
      });
    }
  }, []);

  const saveTimetableAndLink = useCallback(async (entries: TimetableEntry[], universityId: string, studentId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) throw new Error('Sign in required to save timetable.');
    await timetableDb.saveTimetable(uid, entries);
    const now = new Date().toISOString();
    const sid = studentId.trim();
    await timetableDb.saveUniversityConnection(uid, {
      universityId,
      studentId: sid,
      connectedAt: now,
      lastSync: now,
    });
    await profileDb.updateProfile(uid, { universityId, lastSync: now });
    setTimetable(entries);
    setUserState((prev) => ({ ...prev, universityId, lastSync: now, studentId: sid || prev.studentId, timetable: entries }));
    rescheduleAttendanceNotifications(uid, entries).catch(() => {});
  }, []);

  const saveTimetableOnly = useCallback(async (entries: TimetableEntry[], options?: { semesterLabel?: string }) => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) throw new Error('Sign in required to save timetable.');
    await timetableDb.saveTimetable(uid, entries, options?.semesterLabel);
    setTimetable(entries);
    setUserState((prev) => ({ ...prev, timetable: entries }));
    rescheduleAttendanceNotifications(uid, entries).catch(() => {});
  }, []);

  const clearSemesterData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) throw new Error('Sign in required to clear data.');
    await clearSemesterDataFromDatabase(uid);
    await cancelAllRevisionNotifications();
    await persistRevision(defaultRevision);
    setRevisionState(defaultRevision);
    setRevisionSettingsList([]);
    await persistCourses([]);
    setCourses([]);
    setTasks([]);
    setTasksVersion((v) => v + 1);
    setTimetable([]);
    setAcademicCalendar(null);
    await persistSubjectColors({});
    setSubjectColorsState({});
    await persistPinnedTaskIds([]);
    setPinnedTaskIds([]);
    await persistCompletedStudies([]);
    setCompletedStudyKeys([]);
    setPendingExtraction('');
    const progress = getAcademicProgress(initialUser.startDate, 14);
    setUserState((prev) => ({
      ...prev,
      startDate: initialUser.startDate,
      currentWeek: progress.week,
      isBreak: progress.isBreak,
      semesterPhase: progress.semesterPhase,
      timetable: undefined,
    }));
  }, []);

  const disconnectUniversity = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    await timetableDb.deleteUniversityConnection(uid);
    await profileDb.updateProfile(uid, {
      universityId: null,
      lastSync: null,
    });
    setUserState((prev) => ({
      ...prev,
      universityId: undefined,
      lastSync: undefined,
    }));
  }, []);

  const refreshUniversityTimetable = useCallback(
    async (password: string, options?: { courses?: string[] }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) throw new Error('Sign in required.');
      const uniId = user.universityId;
      if (!uniId) {
        throw new Error('No university link found. Open Timetable and connect once.');
      }
      if (uniId !== 'uitm') {
        throw new Error('Refresh is only supported for UiTM MyStudent.');
      }
      const login = (user.studentId || '').trim();
      if (!login) throw new Error('Missing saved student ID. Disconnect and connect again.');
      const prevPortalSemester = user.currentSemester;
      const { entries, profile } = await fetchUitmTimetable(login, password, options?.courses);
      if (entries.length === 0) {
        throw new Error(
          'No timetable returned. Add optional course codes or check MyStudent in a browser.',
        );
      }
      await saveTimetableAndLink(entries, uniId, (profile?.matric || login).trim());

      const newPortalSem = profile?.semester;
      if (typeof newPortalSem === 'number' && newPortalSem > 0) {
        const anchoredDb = user.portalTeachingAnchoredSemester;
        const needTeachingWeekAnchor =
          prevPortalSemester !== newPortalSem ||
          anchoredDb == null ||
          anchoredDb !== newPortalSem;

        if (needTeachingWeekAnchor) {
          await updateProfile({ portalTeachingAnchoredSemester: newPortalSem });
        }
      }

      const u = profileUpdatesFromMyStudentPayload(profile, login);
      if (Object.keys(u).length > 0) await updateProfile(u);
    },
    [
      user.universityId,
      user.studentId,
      user.currentSemester,
      user.portalTeachingAnchoredSemester,
      saveTimetableAndLink,
      updateProfile,
    ],
  );

  const setWeekStartsOn = useCallback(async (mode: WeekStartsOn) => {
    setWeekStartsOnState(mode);
    await persistWeekStartsOn(mode);
  }, []);

  const setAutoDeletePastTasks = useCallback(async (enabled: boolean) => {
    setAutoDeletePastTasksState(enabled);
    await persistAutoDeletePastTasks(enabled);
  }, []);

  const updateTimetableEntry = useCallback(
    async (
      entryId: string,
      patch: Partial<
        Pick<
          TimetableEntry,
          | 'displayName'
          | 'slotColor'
          | 'lecturer'
          | 'location'
          | 'day'
          | 'startTime'
          | 'endTime'
          | 'subjectCode'
          | 'subjectName'
          | 'group'
        >
      >,
    ) => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      const normalized: typeof patch = { ...patch };
      if (normalized.displayName !== undefined) {
        const t = normalized.displayName.trim();
        normalized.displayName = t.length > 0 ? t : '';
      }
      if (normalized.slotColor !== undefined) {
        const t = normalized.slotColor.trim();
        normalized.slotColor = t.length > 0 ? t : '';
      }
      if (normalized.subjectCode !== undefined) {
        normalized.subjectCode = normalized.subjectCode.trim();
      }
      if (normalized.subjectName !== undefined) {
        normalized.subjectName = normalized.subjectName.trim();
      }
      if (normalized.startTime !== undefined) {
        normalized.startTime = normalized.startTime.trim();
      }
      if (normalized.endTime !== undefined) {
        normalized.endTime = normalized.endTime.trim();
      }
      if (normalized.group !== undefined) {
        normalized.group = normalized.group.trim();
      }
      let mergedAfterUpdate: TimetableEntry[] = [];
      setTimetable((prev) => {
        const next = prev.map((e) => {
          if (e.id !== entryId) return e;
          const merged = { ...e, ...normalized };
          if (normalized.displayName !== undefined) {
            if (normalized.displayName === '') delete merged.displayName;
            else merged.displayName = normalized.displayName;
          }
          if (normalized.slotColor !== undefined) {
            if (normalized.slotColor === '') delete merged.slotColor;
            else merged.slotColor = normalized.slotColor;
          }
          if (normalized.group !== undefined) {
            if (!normalized.group) delete merged.group;
            else merged.group = normalized.group;
          }
          return merged;
        });
        mergedAfterUpdate = next;
        return next;
      });
      await timetableDb.updateTimetableEntry(uid, entryId, normalized);
      // Re-schedule attendance banners so changes to day/startTime take effect.
      rescheduleAttendanceNotifications(uid, mergedAfterUpdate).catch(() => {});
    },
    [],
  );

  const addTimetableEntry = useCallback(async (entry: TimetableEntry) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) throw new Error('Sign in required to save timetable.');
    let merged: TimetableEntry[] = [];
    setTimetable((prev) => {
      merged = [...prev, entry];
      return merged;
    });
    await timetableDb.saveTimetable(uid, merged);
    rescheduleAttendanceNotifications(uid, merged).catch(() => {});
  }, []);

  const removeTimetableEntry = useCallback(async (entryId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) throw new Error('Sign in required to save timetable.');
    let merged: TimetableEntry[] = [];
    setTimetable((prev) => {
      merged = prev.filter((e) => e.id !== entryId);
      return merged;
    });
    await timetableDb.saveTimetable(uid, merged);
    rescheduleAttendanceNotifications(uid, merged).catch(() => {});
  }, []);

  const markDataReady = useCallback(() => setDataReady(true), []);

  const value: AppState = {
    dataReady,
    user,
    setUser,
    academicCalendar,
    setAcademicCalendar,
    updateProfile,
    updateAcademicCalendar,
    clearAcademicCalendar,
    courses,
    setCourses,
    addCourse,
    renameCourse,
    deleteCourse,
    tasks,
    tasksVersion,
    setTasks,
    notes,
    setNotes,
    deleteNote,
    flashcards,
    setFlashcards,
    addFlashcard,
    updateFlashcard,
    deleteFlashcard,
    deleteFlashcardsForNote,
    pendingExtraction,
    setPendingExtraction,
    pendingClassroomTasks,
    clearPendingClassroomTasks,
    theme,
    setTheme,
    themePack,
    setThemePack,
    language,
    setLanguage,
    loghat,
    setLoghat,
    revisionSettings,
    revisionSettingsList,
    setRevisionSettings,
    deleteStudySetting,
    completedStudyKeys,
    markStudyDone,
    unmarkStudyDone,
    addTask,
    updateTask,
    toggleTaskDone,
    deleteTask,
    pinnedTaskIds,
    pinTask,
    unpinTask,
    subjectColors,
    setSubjectColor,
    getSubjectColor,
    lastPlannerView,
    setLastPlannerView,
    handleSaveNote,
    handleGenerateFlashcards,
    timetable,
    setTimetable,
    saveTimetableOnly,
    saveTimetableAndLink,
    disconnectUniversity,
    refreshUniversityTimetable,
    weekStartsOn,
    setWeekStartsOn,
    autoDeletePastTasks,
    setAutoDeletePastTasks,
    updateTimetableEntry,
    addTimetableEntry,
    removeTimetableEntry,
    clearSemesterData,
    refreshRemoteData,
    markDataReady,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
