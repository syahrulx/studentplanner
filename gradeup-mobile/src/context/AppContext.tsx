import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Alert, AppState as RNAppState } from 'react-native';
import '../notificationsForeground';
import type { UserProfile, Course, Task, Note, Flashcard, AcademicCalendar, TimetableEntry } from '../types';
import type { ThemeId } from '@/constants/Themes';
import { isAtLeastPlus } from '../lib/flashcardGenerationLimits';
import { rateCard, type FlashcardRating } from '../lib/fsrs';
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

/** Input for `addFlashcards`: front/back plus any optional Flashcard metadata. */
export type NewFlashcardInput = { front: string; back: string } & Partial<Omit<Flashcard, 'id' | 'noteId' | 'front' | 'back'>>;
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
  getCustomThemeColors,
  setCustomThemeColors as persistCustomThemeColors,
  getSpiderBlueAccents,
  setSpiderBlueAccents as persistSpiderBlueAccents,
  getThemePreviewExpiry,
  setThemePreviewExpiry as persistThemePreviewExpiry,
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
  type CustomThemeColors,
  type PlannerViewMode,
  type WeekStartsOn,
} from '../storage';
import { SUBJECT_COLOR_OPTIONS } from '../constants/subjectColors';
import {
  scheduleRevisionNotification,
  cancelAllRevisionNotifications,
  cancelRevisionNotification,
  rescheduleAllRevisionNotifications,
  requestRevisionPermissions,
} from '../revisionNotifications';
import {
  requestNotificationPermissions,
  scheduleTaskNotifications,
  cancelTaskNotifications,
  rescheduleAllTaskNotifications,
  fireClassroomSyncNotification,
} from '../notificationManager';
import {
  cancelAllAttendanceNotifications,
  cancelAttendanceNotificationsForEntries,
  rescheduleAttendanceNotifications,
} from '../attendanceNotifications';
import { ensureAttendanceCategory, flushPendingAttendanceEvents } from '../attendanceRecording';
import { supabase } from '../lib/supabase';
import * as studyDb from '../lib/studyDb';
import { deleteHandwritingCache, flushHandwritingOutbox } from '../lib/handwritingDb';
import * as taskDb from '../lib/taskDb';
import * as studyTimeDb from '../lib/studyTimeDb';
import * as coursesDb from '../lib/coursesDb';
import * as profileDb from '../lib/profileDb';
import * as academicCalendarDb from '../lib/academicCalendarDb';
import * as timetableDb from '../lib/timetableDb';
import { clearSemesterDataFromDatabase } from '../lib/semesterClearDb';
import { getAcceptedSharedTasks, updateSharedTaskCompletion, syncNewTaskToStreams } from '../lib/communityApi';
import { syncExpoPushTokenToProfile, subscribeExpoPushTokenUpdates } from '../lib/pushRegistration';
import { fetchUitmTimetablePublic, profileUpdatesFromMyStudentPayload } from '../lib/timetableParsers/uitm';
import { getTodayISO, isTaskPastDueNow } from '../utils/date';
import { getCalendarProvider } from '../lib/calendarProviders';
import { UITM_HEA_PERIOD_COUNT_MIN } from '../lib/calendarProviders/uitm';
import { resolveUniversityIdForCalendar } from '../lib/universities';
import { fetchLatestCalendarForUniversity, offerToCalendarPatch } from '../lib/universityCalendarOffersDb';
import { syncHomeScreenWidget } from '../homeWidgetSync';
import { initPurchases, logOutPurchases, onCustomerInfoUpdate } from '../lib/purchases';
import { primeTrialOffers, resetTrialOffers } from '../lib/upgradePrompt';
import * as offlineSync from '../lib/offlineSync';
import type { OfflineSyncStatus } from '../lib/offlineSync';

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
    country?: string;
  }) => Promise<void>;
  updateAcademicCalendar: (calendar: Omit<AcademicCalendar, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  clearAcademicCalendar: () => Promise<void>;
  courses: Course[];
  setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
  addCourse: (course: Course, options?: { skipRemote?: boolean }) => void;
  renameCourse: (subjectId: string, newName: string) => void;
  deleteCourse: (subjectId: string, options?: { deleteTimetable?: boolean }) => Promise<void>;
  tasks: Task[];
  tasksVersion: number;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  deleteNote: (noteId: string) => void;
  flashcards: Flashcard[];
  setFlashcards: React.Dispatch<React.SetStateAction<Flashcard[]>>;
  flashcardFolders?: never; // DEPRECATED - Folders are dead.
  /**
   * Add one card. Optimistic insert; rolls back and rejects when the DB write
   * fails. Prefer `addFlashcards` when inserting more than one card.
   */
  addFlashcard: (noteId: string, front: string, back: string, extra?: Partial<Flashcard>) => Promise<Flashcard>;
  /** Add many cards to one note in ONE batch upsert. Rolls back + throws on failure. */
  addFlashcards: (noteId: string, cards: NewFlashcardInput[]) => Promise<Flashcard[]>;
  /** Resolves true on success. On failure the optimistic edit is rolled back and an alert is shown. */
  updateFlashcard: (cardId: string, front: string, back: string, extra?: Partial<Flashcard>) => Promise<boolean>;
  /** Resolves true on success. On failure the optimistic delete is rolled back and an alert is shown. */
  deleteFlashcard: (cardId: string) => Promise<boolean>;
  /** Deletes every card of a note in one DB call. Resolves true on success (rolls back on failure). */
  deleteFlashcardsForNote: (noteId: string) => Promise<boolean>;
  /**
   * Rate a card (1 Again, 2 Hard, 3 Good, 4 Easy). Computes the next FSRS state,
   * updates local state optimistically, then persists the card and a review-log
   * row. Card write failures roll back and reject; log failures are non-fatal.
   */
  reviewFlashcard: (cardId: string, rating: FlashcardRating, durationMs?: number) => Promise<Flashcard | null>;
  /**
   * Re-read the plan from the server profile and apply it.
   *
   * The server is the single source of truth for entitlement: a plan can come
   * from the store, from Curlec/Razorpay, or from an admin grant, and only the
   * first of those is visible to RevenueCat. Returns the plan now in effect.
   */
  refreshSubscription: () => Promise<import('../types').SubscriptionPlan>;
  pendingExtraction: string;
  setPendingExtraction: (text: string) => void;
  pendingClassroomTasks: import('../lib/googleClassroom').PendingNewTask[];
  clearPendingClassroomTasks: () => void;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  themePack: ThemePackId;
  setThemePack: (pack: ThemePackId) => void;
  customThemeColors: CustomThemeColors | null;
  setCustomThemeColors: (colors: CustomThemeColors | null) => void;
  themePreviewExpiry: number | null;
  setThemePreviewExpiry: (timestamp: number | null) => void;
  spiderBlueAccents: boolean;
  setSpiderBlueAccents: (enabled: boolean) => void;
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
    updates: Partial<
      Pick<
        Task,
        | 'dueDate'
        | 'dueTime'
        | 'courseId'
        | 'title'
        | 'type'
        | 'notes'
        | 'needsDate'
        | 'repeatDays'
        | 'repeatNotify'
        | 'excludeFromFocus'
        | 'excludeFromPulse'
        | 'stepOrder'
        | 'estimatedMinutes'
        | 'assignedTo'
      >
    >,
  ) => void;
  /**
   * Toggle the "done" state for a task. For one-off tasks this flips
   * `task.isDone`. For recurring tasks (`repeatDays` non-empty), it toggles a
   * per-occurrence record in `task_completions` for `occurrenceDate` (defaults
   * to today's ISO date). Without `occurrenceDate`, a recurring task is
   * treated as if you tapped done on today's occurrence.
   */
  toggleTaskDone: (taskId: string, occurrenceDate?: string) => void;
  /** Set of "<taskId>:<YYYY-MM-DD>" keys — one entry per completed recurring-task occurrence. */
  taskCompletionKeys: Set<string>;
  /** Returns true if a recurring task is ticked done on `dateISO`, or if a one-off task is done. */
  isTaskDoneOn: (task: Task, dateISO: string) => boolean;
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
  /** UiTM: re-fetch timetable + profile from public sources; overwrites the saved timetable. */
  refreshUniversityTimetable: (options?: { courses?: string[] }) => Promise<void>;
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
  /** Remove one slot, or the matching subject everywhere when explicitly requested. */
  removeTimetableEntry: (entryId: string, options?: { deleteStudySubject?: boolean }) => Promise<void>;
  /** Wipes timetable, subjects, tasks, academic calendar, study times, SOW imports (DB + storage). Triple-confirm in UI. */
  clearSemesterData: () => Promise<void>;
  /** Re-fetch profile, tasks, calendar, study settings, courses, timetable from Supabase (same as cold start). */
  refreshRemoteData: () => Promise<void>;
  /** @internal Manually mark data as ready (e.g. after sign-up completes profile save). */
  markDataReady: () => void;
  offlineSyncStatus: OfflineSyncStatus;
  retryOfflineSync: () => Promise<void>;
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
  /**
   * Per-occurrence completion records for recurring tasks. Keys are
   * "<taskId>:<YYYY-MM-DD>". Populated on auth load and mutated when the user
   * ticks/un-ticks a recurring task on a specific day.
   */
  const [taskCompletionKeys, setTaskCompletionKeys] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initialFlashcards);
  const [offlineSyncStatus, setOfflineSyncStatus] = useState<OfflineSyncStatus>({
    userId: null,
    pendingCount: 0,
    syncing: false,
    lastError: null,
    lastSyncedAt: null,
  });

  const [pendingExtraction, setPendingExtraction] = useState('');
  const [pendingClassroomTasks, setPendingClassroomTasks] = useState<import('../lib/googleClassroom').PendingNewTask[]>([]);
  const clearPendingClassroomTasks = useCallback(() => setPendingClassroomTasks([]), []);

  // Bump last_active_at for DAU/MAU tracking
  const lastBumpRef = useRef<number>(0);
  const bumpActivity = useCallback(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      if (!uid) return;
      const now = Date.now();
      // Only bump once every 5 minutes to avoid DB spam
      if (now - lastBumpRef.current < 5 * 60 * 1000) return;
      lastBumpRef.current = now;
      supabase
        .from('profiles')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', uid)
        .then();
    });
  }, []);

  useEffect(() => {
    bumpActivity();
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active') bumpActivity();
    });
    return () => sub.remove();
  }, [bumpActivity]);

  useEffect(() => offlineSync.subscribeOfflineSync((status) => {
    // Never surface or apply another account's pending state after sign-out or
    // a fast account switch. Its outbox remains safely stored under its UID.
    if (!status.userId || status.userId === remoteUserIdRef.current) {
      setOfflineSyncStatus(status);
    }
  }), []);

  const retryOfflineSync = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    await Promise.all([
      offlineSync.flushOfflineSync(uid),
      flushHandwritingOutbox(uid),
    ]);
  }, []);

  useEffect(() => {
    const retry = () => { void retryOfflineSync(); };
    const appStateSub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active') retry();
    });
    const timer = setInterval(() => {
      if (offlineSyncStatus.pendingCount > 0 && !offlineSyncStatus.syncing) retry();
    }, 20000);
    return () => {
      appStateSub.remove();
      clearInterval(timer);
    };
  }, [offlineSyncStatus.pendingCount, offlineSyncStatus.syncing, retryOfflineSync]);
  const [theme, setThemeState] = useState<ThemeId>('light');
  const [themePack, setThemePackState] = useState<ThemePackId>('none');
  const [customThemeColors, setCustomThemeColorsState] = useState<CustomThemeColors | null>(null);
  const [themePreviewExpiry, setThemePreviewExpiryState] = useState<number | null>(null);
  const [spiderBlueAccents, setSpiderBlueAccentsState] = useState(true);
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
  /**
   * Indirection for `refreshSubscription`, which is declared further down but
   * needed by the RevenueCat listener set up during sign-in.
   */
  const refreshSubscriptionRef = useRef<() => Promise<import('../types').SubscriptionPlan>>(
    async () => 'free',
  );
  const offlineMutationVersionRef = useRef(0);
  /** Prevents calendar auto-sync from running more than once per session. */
  const calendarAutoSyncedRef = useRef(false);
  const academicCalendarRef = useRef<AcademicCalendar | null>(null);
  const userRef = useRef(user);
  const wasSemesterBreakRef = useRef(false);
  const loadRemoteDataRef = useRef<(uid: string, authFallbackName?: string) => Promise<void>>(async () => {});
  /** Unsubscribe for the current session's RevenueCat live-update listener. */
  const revenueCatUnsubscribeRef = useRef<() => void>(() => {});
  const homeWidgetInputsRef = useRef({
    tasks,
    courses,
    timetable,
    pinnedTaskIds,
    userName: user.name,
    theme,
    themePack,
    customThemeColors,
  });
  const homeWidgetRecommendationFeedbackRef = useRef<import('../lib/recommendationDb').RecommendationFeedback[] | undefined>(undefined);

  /** Push the latest local task state immediately; widget refresh never waits for network sync. */
  const syncHomeWidgetNow = useCallback((nextTasks: Task[]) => {
    const current = homeWidgetInputsRef.current;
    syncHomeScreenWidget({
      tasks: nextTasks,
      courses: current.courses,
      timetable: current.timetable,
      pinnedTaskIds: current.pinnedTaskIds,
      userName: current.userName,
      signedIn: Boolean(remoteUserIdRef.current),
      themeId: current.theme,
      themePack: current.themePack,
      customThemeColors: current.customThemeColors,
      maxTasks: 3,
      recommendationFeedback: homeWidgetRecommendationFeedbackRef.current,
    });
  }, []);
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
  }, [
    academicCalendar?.startDate,
    academicCalendar?.totalWeeks,
    academicCalendar?.teachingWeekOffset,
    academicCalendar?.periods,
  ]);

  useEffect(() => {
    academicCalendarRef.current = academicCalendar;
  }, [academicCalendar]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const scheduleAttendanceNotifications = useCallback((uid: string, entries: TimetableEntry[]) => {
    return rescheduleAttendanceNotifications(uid, entries, {
      academicCalendar: academicCalendarRef.current,
    }).catch(() => {});
  }, []);



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
      // An explicit semester/break choice must outrank background provider
      // refreshes. Users can still choose a different official calendar from
      // Academic Calendar settings whenever they want.
      if (cal?.selectionSource === 'user' || cal?.selectionSource === 'manual') return;
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
    if (!timetable.length) return;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      if (!uid) return;
      rescheduleAttendanceNotifications(uid, timetable, { academicCalendar }).catch(() => {});
    });
  }, [academicCalendar, timetable]);
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const entries = timetableForAttendanceRef.current;
      if (!entries || entries.length === 0) return;
      void supabase.auth.getSession().then(({ data: { session } }) => {
        const uid = session?.user?.id;
        if (!uid) return;
        scheduleAttendanceNotifications(uid, entries).catch(() => {});
      });
    });
    return () => sub.remove();
  }, []);

  /**
   * Re-seed task and study reminders on every return to the foreground.
   *
   * Both are now booked only a short way ahead so they fit the 64 pending
   * notifications iOS allows per app — which means something has to claim the
   * next batch of slots as time moves on. Kept separate from the attendance
   * listener above: that one bails out when the timetable is empty, and these
   * two have nothing to do with having classes.
   */
  const tasksForNotifRef = useRef<Task[]>([]);
  const revisionListForNotifRef = useRef<RevisionSettings[]>([]);
  useEffect(() => {
    tasksForNotifRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    revisionListForNotifRef.current = revisionSettingsList;
  }, [revisionSettingsList]);
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      // Skip while a list is still empty. Resuming before the first load lands
      // would otherwise cancel every reminder and re-schedule nothing. An
      // emptied list is already handled where it is emptied, and the load path
      // rebuilds both from the database anyway.
      const pendingTasks = tasksForNotifRef.current;
      if (pendingTasks.length > 0) {
        void rescheduleAllTaskNotifications(pendingTasks).catch(() => {});
      }
      const pendingRevision = revisionListForNotifRef.current;
      if (pendingRevision.length > 0) {
        void rescheduleAllRevisionNotifications(pendingRevision).catch(() => {});
      }
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
    // Load exactly what's stored — do NOT strip an expired trial here. At
    // this point (mount-time, local storage only) we don't yet know the
    // user's subscription plan, so a since-upgraded Plus/Pro user whose old
    // free-trial expiry simply hasn't been cleared yet would have their
    // theme silently wiped before the plan check below ever gets a chance to
    // run. See the effect below, which re-evaluates once the plan is known
    // and stays reactive to plan changes.
    Promise.all([getThemePack(), getThemePreviewExpiry(), getCustomThemeColors()]).then(([pack, expiry, customColors]) => {
      setThemePackState(pack);
      setThemePreviewExpiryState(expiry);
      setCustomThemeColorsState(customColors);
    });
    getSpiderBlueAccents().then(setSpiderBlueAccentsState);
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
      const mutationVersionAtStart = offlineMutationVersionRef.current;
      remoteUserIdRef.current = uid;
      // Show the last confirmed local snapshot immediately. Remote results are
      // merged over it only when the request actually succeeds, so an offline
      // relaunch never turns a user's planner or notes into an empty screen.
      const cachedReady = Promise.all([
        offlineSync.loadCachedTasks(uid),
        offlineSync.loadCachedNotes(uid),
        offlineSync.loadCachedTaskCompletions(uid),
        offlineSync.loadCachedFlashcards(uid),
      ]).then(([cachedTasks, cachedNotes, cachedCompletions, cachedCards]) => {
        if (gen !== remoteLoadGeneration || remoteUserIdRef.current !== uid) return;
        setTasks(cachedTasks);
        setNotes(cachedNotes);
        setTaskCompletionKeys(new Set(cachedCompletions));
        // Seeded from cache so a review session can start before the network
        // answers, and still works when it never does.
        if (cachedCards.length > 0) setFlashcards(cachedCards);
      });
      // Finish any queued write first. Otherwise a stale fetch could race a
      // successful flush and briefly overwrite the just-synced local version.
      return Promise.all([cachedReady, retryOfflineSync().catch(() => {})]).then(() => Promise.allSettled([
        studyDb.getNotesStrict(uid),
        studyDb.getFlashcards(uid),
        taskDb.getTasksStrict(uid),
        studyTimeDb.getAllStudySettings(uid),
        coursesDb.getCourses(uid),
        profileDb.getProfile(uid),
        academicCalendarDb.getActiveCalendar(uid),
        timetableDb.getTimetable(uid),
        timetableDb.getUniversityConnection(uid),
      ])).then(async (results) => {
        if (gen !== remoteLoadGeneration || remoteUserIdRef.current !== uid) return;
        const localMutatedDuringLoad = offlineMutationVersionRef.current !== mutationVersionAtStart;

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
          // An empty course response is ambiguous when the transport layer
          // cannot expose its error. Preserve the last local course/note view
          // rather than hiding every note during a connection problem.
          if (loadedCourses.length > 0) {
            validCourseIds = new Set(loadedCourses.map((c) => c.id.toUpperCase()));
            setCourses(loadedCourses);
          }
        }

        let loadedNotes: import('../types').Note[] = [];
        if (r0.status === 'fulfilled' && !localMutatedDuringLoad) {
          loadedNotes = await offlineSync.mergePendingNotes(uid, r0.value);
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
          void offlineSync.cacheNotes(uid, loadedNotes);
        }

        if (r1.status === 'fulfilled' && !localMutatedDuringLoad) {
          const loadedCards = r1.value;
          // Soft-hide cards whose parent note is genuinely absent, but ONLY when
          // the notes request itself succeeded. If notes failed to load we have
          // no idea which notes exist, so hiding every card would make the whole
          // flashcard library vanish on a flaky connection. Never auto-delete
          // from Supabase — a missing note can simply mean the note row hasn't
          // synced yet.
          const notesLoadedOk = r0.status === 'fulfilled';
          // Queued reviews and edits win over the server copy, or a fetch that
          // lands before the outbox drains would show the pre-review schedule.
          const mergedCards = await offlineSync.mergePendingFlashcards(uid, loadedCards);
          const validNoteIds = new Set(loadedNotes.map((n) => n.id));
          const visibleCards = notesLoadedOk
            ? mergedCards.filter((c) => !!c.noteId && validNoteIds.has(c.noteId))
            : mergedCards;
          setFlashcards(visibleCards);
          void offlineSync.cacheFlashcards(uid, visibleCards);
        }
        if (r2.status === 'fulfilled' && !localMutatedDuringLoad) {
          const loadedTasks = await offlineSync.mergePendingTasks(uid, r2.value);
          setTasks(loadedTasks);
          void offlineSync.cacheTasks(uid, loadedTasks);
          rescheduleAllTaskNotifications(loadedTasks).catch(() => {});
        }

        // Load this user's recurring-task completion history so the planner
        // can correctly show today's "done" state for repeating to-dos.
        taskDb
          .getTaskCompletionsStrict(uid)
          .then(async (keys) => {
            if (
              gen !== remoteLoadGeneration ||
              remoteUserIdRef.current !== uid ||
              offlineMutationVersionRef.current !== mutationVersionAtStart
            ) return;
            const mergedKeys = await offlineSync.mergePendingTaskCompletions(uid, keys);
            setTaskCompletionKeys(new Set(mergedKeys));
            void offlineSync.cacheTaskCompletions(uid, mergedKeys);
          })
          .catch((err) => {
            if (__DEV__) console.warn('[Rencana] failed to load task_completions:', err);
          });
        if (r3.status === 'fulfilled') {
          const studyList = r3.value;
          setRevisionSettingsList(studyList);
          setRevisionState(studyList.length > 0 ? studyList[0] : defaultRevision);
          // Re-derive the OS schedules from what the DB actually holds. This is
          // what clears reminders for study times deleted on another device —
          // and, on upgrade, the stale legacy single-slot daily notification.
          void rescheduleAllRevisionNotifications(studyList).catch(() => {});
        }
        // (r4 is already processed and set above)
        if (r7.status === 'fulfilled') {
          const tt = r7.value ?? [];
          setTimetable(tt);
          rescheduleAttendanceNotifications(uid, tt, { academicCalendar: academicCalendarRef.current }).catch(() => {});
        }

        const profile = r5.status === 'fulfilled' ? r5.value : undefined;
        const uniConn = r8.status === 'fulfilled' ? r8.value : null;

        if (profile?.themePreferences) {
          const tp = profile.themePreferences;
          const validThemes: ThemeId[] = ['light', 'dark', 'blush', 'midnight', 'emerald'];
          const validPacks: ThemePackId[] = ['none', 'cat', 'mono', 'spider', 'purple', 'custom'];
          if (tp.theme && validThemes.includes(tp.theme as ThemeId)) {
            setThemeState(tp.theme as ThemeId);
            void persistTheme(tp.theme as ThemeId);
          }
          if (tp.themePack && validPacks.includes(tp.themePack as ThemePackId)) {
            setThemePackState(tp.themePack as ThemePackId);
            void persistThemePack(tp.themePack as ThemePackId);
          }
          if (typeof tp.spiderBlueAccents === 'boolean') {
            setSpiderBlueAccentsState(tp.spiderBlueAccents);
            void persistSpiderBlueAccents(tp.spiderBlueAccents);
          }
          if (tp.customThemeColors !== undefined) {
            setCustomThemeColorsState(tp.customThemeColors);
            void persistCustomThemeColors(tp.customThemeColors);
          }
        }

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
          let next = { ...prev, id: uid };
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
                subscriptionStatus: profile.subscriptionStatus,
                subscriptionPeriodType: profile.subscriptionPeriodType,
                subscriptionExpiresAt: profile.subscriptionExpiresAt,
                country: profile.country ?? 'MY',
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

        // Core data (profile, courses, notes, tasks, timetable, calendar) is now
        // in state — let the UI paint immediately. The remaining work below
        // (calendar auto-sync, RevenueCat plan refresh, Google Classroom check)
        // is non-critical and used to block first paint by 1–4s. It now runs in
        // the background and updates state as each piece lands.
        if (gen === remoteLoadGeneration && remoteUserIdRef.current === uid) {
          setDataReady(true);
        }

        void (async () => {
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
          const hasExplicitCalendarChoice =
            calendar?.selectionSource === 'user' ||
            calendar?.selectionSource === 'manual';
          if (provider && profile && !hasExplicitCalendarChoice) {
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
                    selectionSource: 'automatic',
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

        // ── Initialize RevenueCat; the shared server plan controls access ──
        try {
          await initPurchases(uid);
          // Warm trial eligibility so the first feature gate the user hits can
          // already say "try free" rather than a bare "upgrade".
          void primeTrialOffers();
          // RevenueCat's SDK may expose sandbox or cached store state. It must
          // never override the server because the user may instead be entitled
          // through Curlec/Razorpay or an admin grant. A store update simply
          // prompts a fresh read of the unified server entitlement.
          revenueCatUnsubscribeRef.current();
          revenueCatUnsubscribeRef.current = onCustomerInfoUpdate(async () => {
            if (remoteUserIdRef.current !== uid) return; // stale callback from a previous session
            await refreshSubscriptionRef.current();
          });
        } catch (e) {
          if (__DEV__) console.warn('[Rencana] RevenueCat init failed:', e);
          // Non-fatal: the user just keeps whatever plan is in the DB.
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
        })();
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
          rescheduleAttendanceNotifications(uid, timetable, { academicCalendar: academicCalendarRef.current }).catch(() => {});
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
    }).catch((e) => {
      // If getSession() itself rejects (e.g. a corrupt persisted auth blob),
      // dataReady would never flip and the app would sit on "Loading your
      // data..." forever, across restarts. Let the UI through instead.
      if (__DEV__) console.warn('[Rencana] getSession failed on cold start:', e);
      setDataReady(true);
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
          setOfflineSyncStatus({
            userId: null,
            pendingCount: 0,
            syncing: false,
            lastError: null,
            lastSyncedAt: null,
          });
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
          setTaskCompletionKeys(new Set());
          setNotes(initialNotes);
          setFlashcards(initialFlashcards);
          setRevisionSettingsList([]);
          setRevisionState(defaultRevision);
          setCourses([]);
          setAcademicCalendar(null);
          setTimetable([]);
          cancelAllAttendanceNotifications().catch(() => {});
          revenueCatUnsubscribeRef.current();
          revenueCatUnsubscribeRef.current = () => {};
          logOutPurchases().catch(() => {});
          // Trial eligibility belongs to the store account that just signed out.
          resetTrialOffers();
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
      revenueCatUnsubscribeRef.current();
    };
  }, []);

  homeWidgetInputsRef.current = { tasks, courses, timetable, pinnedTaskIds, userName: user.name, theme, themePack, customThemeColors };

  // Solution C: Gate widget sync — only push to widgets once real data is loaded
  useEffect(() => {
    if (!dataReady) return; // Skip seed-data writes to widget
    let cancelled = false;
    const timer = setTimeout(() => {
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (cancelled) return;
        const signedIn = Boolean(session?.user?.id);
        const uid = session?.user?.id;
        // Local cache read only — the widget must not show a suggestion the
        // user already dismissed in the app.
        const feedbackPromise = uid
          ? offlineSync.loadCachedRecommendationFeedback(uid).catch(() => [])
          : Promise.resolve([]);
        void feedbackPromise.then((recommendationFeedback) => {
          if (cancelled) return;
          homeWidgetRecommendationFeedbackRef.current = recommendationFeedback;
          syncHomeScreenWidget({
            tasks,
            courses,
            timetable,
            pinnedTaskIds,
            userName: user.name,
            signedIn,
            themeId: theme,
            themePack,
            customThemeColors,
            maxTasks: 3,
            recommendationFeedback,
          });
        });
      });
    }, 500); // Debounce to prevent JSI pressure
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dataReady, tasks, tasksVersion, courses, timetable, pinnedTaskIds, user.name, theme, themePack, customThemeColors]);

  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const r = homeWidgetInputsRef.current;
      void supabase.auth.getSession().then(({ data: { session } }) => {
        const signedIn = Boolean(session?.user?.id);
        const uid = session?.user?.id;
        const feedbackPromise = uid
          ? offlineSync.loadCachedRecommendationFeedback(uid).catch(() => [])
          : Promise.resolve([]);
        void feedbackPromise.then((recommendationFeedback) => {
          homeWidgetRecommendationFeedbackRef.current = recommendationFeedback;
          syncHomeScreenWidget({
            tasks: r.tasks,
            courses: r.courses,
            timetable: r.timetable,
            pinnedTaskIds: r.pinnedTaskIds,
            userName: r.userName,
            signedIn,
            themeId: r.theme,
            themePack: r.themePack,
            customThemeColors: r.customThemeColors,
            maxTasks: 3,
            recommendationFeedback,
          });
        });
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

  const syncThemePreferencesToProfile = useCallback(
    async (prefs: {
      theme: ThemeId;
      themePack: ThemePackId;
      spiderBlueAccents: boolean;
      customThemeColors: CustomThemeColors | null;
    }) => {
      const uid = user.id?.trim();
      if (!uid) return;
      try {
        await profileDb.updateProfile(uid, { themePreferences: prefs });
      } catch {
        /* theme_preferences column may not be migrated yet */
      }
    },
    [user.id],
  );

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    persistTheme(next);
    void syncThemePreferencesToProfile({
      theme: next,
      themePack,
      spiderBlueAccents,
      customThemeColors,
    });
  }, [themePack, spiderBlueAccents, customThemeColors, syncThemePreferencesToProfile]);

  const setThemePack = useCallback((pack: ThemePackId) => {
    setThemePackState(pack);
    void persistThemePack(pack);
    void syncThemePreferencesToProfile({
      theme,
      themePack: pack,
      spiderBlueAccents,
      customThemeColors,
    });
  }, [theme, spiderBlueAccents, customThemeColors, syncThemePreferencesToProfile]);

  const setCustomThemeColors = useCallback((colors: CustomThemeColors | null) => {
    setCustomThemeColorsState(colors);
    void persistCustomThemeColors(colors);
    void syncThemePreferencesToProfile({
      theme,
      themePack,
      spiderBlueAccents,
      customThemeColors: colors,
    });
  }, [theme, themePack, spiderBlueAccents, syncThemePreferencesToProfile]);

  const setThemePreviewExpiry = useCallback((timestamp: number | null) => {
    setThemePreviewExpiryState(timestamp);
    void persistThemePreviewExpiry(timestamp);
  }, []);

  // Strip an expired FREE-TRIAL theme pack, but only once we actually know
  // the plan and only while it's still free. A Plus/Pro subscriber who
  // upgraded mid-trial without reopening the theme screen (which is what
  // clears themePreviewExpiry — see in-app-themes.tsx) would otherwise have
  // their theme wiped the moment that old timestamp passes, even though
  // paying users aren't on a trial at all. Reactive to plan changes, so an
  // upgrade that lands after this already ran corrects itself immediately.
  useEffect(() => {
    if (themePack === 'none' || themePreviewExpiry === null) return;
    if (isAtLeastPlus(user.subscriptionPlan)) return;
    if (Date.now() <= themePreviewExpiry) return;
    setThemePackState('none');
    void persistThemePack('none');
    setThemePreviewExpiryState(null);
    void persistThemePreviewExpiry(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.subscriptionPlan, themePack, themePreviewExpiry]);

  const setSpiderBlueAccents = useCallback((enabled: boolean) => {
    setSpiderBlueAccentsState(enabled);
    persistSpiderBlueAccents(enabled);
    void syncThemePreferencesToProfile({
      theme,
      themePack,
      spiderBlueAccents: enabled,
      customThemeColors,
    });
  }, [theme, themePack, customThemeColors, syncThemePreferencesToProfile]);

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
        await cancelRevisionNotification(settings.id);
        return;
      }
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
      // Rebuild from the saved list, not from `settings`: the row was just
      // inserted, so only the list carries the DB id each reminder is keyed to.
      await rescheduleAllRevisionNotifications(list);
    } else if (settings.enabled) {
      // Signed out — no DB id to key on, so this one keeps the local slot.
      await scheduleRevisionNotification(settings);
    } else {
      await cancelRevisionNotification(settings.id);
    }
  }, []);

  const deleteStudySetting = useCallback(async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    await studyTimeDb.deleteStudySetting(uid, id);
    // Kill this one's reminder up front, so a failed list refresh can't leave it firing.
    await cancelRevisionNotification(id);
    const list = await studyTimeDb.getAllStudySettings(uid);
    setRevisionSettingsList(list);
    const next = list.length > 0 ? list[0] : defaultRevision;
    setRevisionState(next);
    // Previously skipped, so local storage kept handing back the deleted study time.
    await persistRevision(next);
    await rescheduleAllRevisionNotifications(list);
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
      country?: string;
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
        ...(updates.country !== undefined ? { country: updates.country } : {}),
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
    offlineMutationVersionRef.current += 1;
    const uid = remoteUserIdRef.current;
    setTasks((prev) => {
      const next = [task, ...prev.filter((candidate) => candidate.id !== task.id)];
      if (uid) void offlineSync.cacheTasks(uid, next);
      return next;
    });
    if (!task.parentTaskId) scheduleTaskNotifications(task).catch(() => {});
    if (options?.skipRemote) return;
    if (!uid) {
      Alert.alert('Saved on this device', 'Sign in again to sync this task to your account.');
      return;
    }
    void offlineSync.queueTaskUpsert(uid, task)
      .then(() => offlineSync.flushOfflineSync(uid))
      .then((status) => {
        if (status.pendingCount === 0 && !task.parentTaskId) {
          void syncNewTaskToStreams(task.id, uid).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const updateTask = useCallback(
    (
      taskId: string,
      updates: Partial<
        Pick<
          Task,
          | 'dueDate'
          | 'dueTime'
          | 'courseId'
          | 'title'
          | 'type'
          | 'notes'
          | 'needsDate'
          | 'repeatDays'
          | 'repeatNotify'
          | 'excludeFromFocus'
          | 'excludeFromPulse'
          | 'stepOrder'
          | 'estimatedMinutes'
          | 'assignedTo'
        >
      >,
    ) => {
    offlineMutationVersionRef.current += 1;
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
        ...(updates.repeatDays !== undefined
          ? { repeatDays: Array.isArray(updates.repeatDays) ? updates.repeatDays : [] }
          : {}),
        ...(updates.repeatNotify !== undefined ? { repeatNotify: updates.repeatNotify } : {}),
        ...(updates.excludeFromFocus !== undefined ? { excludeFromFocus: updates.excludeFromFocus } : {}),
        ...(updates.excludeFromPulse !== undefined ? { excludeFromPulse: updates.excludeFromPulse } : {}),
        ...(updates.stepOrder !== undefined ? { stepOrder: updates.stepOrder } : {}),
        ...(updates.estimatedMinutes !== undefined ? { estimatedMinutes: updates.estimatedMinutes } : {}),
        ...(updates.assignedTo !== undefined ? { assignedTo: updates.assignedTo || undefined } : {}),
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
      if (!updated.parentTaskId) {
        cancelTaskNotifications(updated.id).then(() => scheduleTaskNotifications(updated)).catch(() => {});
      }
      // Return a new array with new object refs so React and list consumers see the update
      const next: Task[] = prev.map((t) =>
        String(t.id).trim() === id ? { ...updated } : { ...t }
      );
      const uid = remoteUserIdRef.current;
      if (uid) {
        void offlineSync.cacheTasks(uid, next);
        void offlineSync.queueTaskUpsert(uid, updated)
          .then(() => offlineSync.flushOfflineSync(uid))
          .catch(() => {});
      }
      setTasksVersion((v) => v + 1);
      return next;
    });
  }, [user?.startDate]);

  /**
   * Toggle the done state for a task.
   *
   * - One-off task: flips `isDone` on the row.
   * - Recurring task (repeatDays non-empty): toggles a row in
   *   `task_completions` for `occurrenceDate` (defaults to today). The task
   *   row itself is left untouched so every other day still appears.
   */
  const toggleTaskDone = useCallback((taskId: string, occurrenceDate?: string) => {
    const task = tasksRef.current.find((candidate) => candidate.id === taskId);
    if (!task) return;
    offlineMutationVersionRef.current += 1;

    const isRecurring = Array.isArray(task.repeatDays) && task.repeatDays.length > 0;

    // ── Recurring path: per-occurrence completion record ───────────────────
    if (isRecurring) {
      const dateISO = (occurrenceDate ?? getTodayISO()).slice(0, 10);
      const key = taskDb.makeCompletionKey(taskId, dateISO);
      const wasDone = taskCompletionKeys.has(key);
      // Optimistic local update.
      setTaskCompletionKeys((prev) => {
        const next = new Set(prev);
        if (wasDone) next.delete(key);
        else next.add(key);
        const uid = remoteUserIdRef.current;
        if (uid) void offlineSync.cacheTaskCompletions(uid, [...next]);
        return next;
      });
      const uid = remoteUserIdRef.current;
      if (uid) {
        void offlineSync.queueTaskCompletion(uid, taskId, dateISO, !wasDone)
          .then(() => offlineSync.flushOfflineSync(uid))
          .catch(() => {});
      }
      return;
    }

    // ── One-off path: unchanged legacy behaviour ───────────────────────────
    const next = tasksRef.current.map((candidate) => (
      candidate.id === taskId ? { ...candidate, isDone: !candidate.isDone } : candidate
    ));
    const updated = next.find((candidate) => candidate.id === taskId);
    if (!updated) return;
    tasksRef.current = next;
    setTasks(next);
    syncHomeWidgetNow(next);

    if (updated.isDone) {
      cancelTaskNotifications(taskId).catch(() => {});
    } else {
      scheduleTaskNotifications(updated).catch(() => {});
    }
    const uid = remoteUserIdRef.current;
    if (uid) {
      void offlineSync.cacheTasks(uid, next);
      const queue = updated.parentTaskId
        ? offlineSync.queueBreakdownCompletion(uid, updated.id, updated.isDone)
        : offlineSync.queueTaskUpsert(uid, updated);
      void queue
        .then(() => offlineSync.flushOfflineSync(uid))
        .then(async (status) => {
          if (status.pendingCount > 0 || updated.parentTaskId) return;
          const shared = await getAcceptedSharedTasks();
          const asRecipient = shared.filter((s) => s.task_id === taskId && s.recipient_id === uid);
          for (const st of asRecipient) {
            void updateSharedTaskCompletion(st.id, updated.isDone).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [taskCompletionKeys, syncHomeWidgetNow]);

  /**
   * Helper used by lists to render the right checkbox state for a given
   * (task, date) pair. Recurring tasks use the per-day completion set;
   * one-off tasks fall back to `task.isDone`.
   */
  const isTaskDoneOn = useCallback(
    (task: Task, dateISO: string): boolean => {
      if (Array.isArray(task.repeatDays) && task.repeatDays.length > 0) {
        return taskCompletionKeys.has(taskDb.makeCompletionKey(task.id, dateISO.slice(0, 10)));
      }
      return Boolean(task.isDone);
    },
    [taskCompletionKeys],
  );

  const deleteTask = useCallback((taskId: string) => {
    offlineMutationVersionRef.current += 1;
    cancelTaskNotifications(taskId).catch(() => {});
    const uid = remoteUserIdRef.current;
    setTasks((prev) => {
      const next = prev.filter((t) => t.id !== taskId && t.parentTaskId !== taskId);
      if (uid) void offlineSync.cacheTasks(uid, next);
      return next;
    });
    setPinnedTaskIds((prev) => {
      const next = prev.filter((id) => id !== taskId);
      if (next.length !== prev.length) {
        persistPinnedTaskIds(next);
      }
      return next;
    });

    // If it's a Google Classroom task, dismiss it in prefs so auto-sync doesn't re-add it
    if (taskId.startsWith('gc-')) {
      const workId = taskId.slice(3);
      (async () => {
        try {
          const { getClassroomPrefs, setClassroomPrefs } = require('../storage');
          const prefs = await getClassroomPrefs();
          if (prefs) {
            const dismissed = prefs.dismissedNewTaskIds || [];
            if (!dismissed.includes(workId)) {
              await setClassroomPrefs({
                ...prefs,
                dismissedNewTaskIds: [...dismissed, workId],
              });
            }
          }
        } catch (e) {
          console.warn('[AppContext] Failed to dismiss deleted GC task:', e);
        }
      })();
    }

    if (uid) {
      void offlineSync.queueTaskDelete(uid, taskId)
        .then(() => offlineSync.flushOfflineSync(uid))
        .catch(() => {});
    }
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

  const deleteCourse = useCallback(async (subjectId: string, options?: { deleteTimetable?: boolean }) => {
    offlineMutationVersionRef.current += 1;
    const upper = subjectId.toUpperCase();
    const subjectNoteIds = new Set(
      notes.filter((note) => note.subjectId.toUpperCase() === upper).map((note) => note.id),
    );
    const subjectTaskIds = tasks
      .filter((task) => task.courseId.toUpperCase() === upper)
      .map((task) => task.id);
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) throw new Error('Sign in required to delete a subject.');

    // Resolve every affected row from this user's in-memory timetable, then
    // delete those exact ids with a second user_id guard in timetableDb.
    const timetableIds = options?.deleteTimetable
      ? timetable
          .filter((entry) => entry.subjectCode.trim().toUpperCase() === upper)
          .map((entry) => entry.id)
      : [];

    // Every delete is doubly scoped (authenticated uid + exact subject id).
    // Remove child data before the folder row so a failed child write leaves a
    // visible folder the user can safely retry instead of hidden orphan data.
    await studyDb.deleteSubjectStudyData(uid, subjectId);
    await taskDb.deleteTasksForCourse(uid, subjectId);
    await coursesDb.deleteCourse(uid, subjectId);
    await Promise.all([
      ...subjectTaskIds.map((taskId) => offlineSync.queueTaskDelete(uid, taskId)),
      ...[...subjectNoteIds].map(async (noteId) => {
        await offlineSync.queueNoteDelete(uid, noteId);
        await deleteHandwritingCache(uid, noteId).catch(() => {});
      }),
    ]);
    void offlineSync.flushOfflineSync(uid);
    if (remoteUserIdRef.current && remoteUserIdRef.current !== uid) {
      throw new Error('The signed-in account changed during deletion. Refresh before trying again.');
    }
    setCourses((prev) => {
      const next = prev.filter((c) => c.id.toUpperCase() !== upper);
      persistCourses(next);
      return next;
    });
    setTasks((prev) => {
      const next = prev.filter((task) => task.courseId.toUpperCase() !== upper);
      void offlineSync.cacheTasks(uid, next);
      return next;
    });
    setNotes((prev) => {
      const next = prev.filter((note) => note.subjectId.toUpperCase() !== upper);
      void offlineSync.cacheNotes(uid, next);
      return next;
    });
    setFlashcards((prev) => prev.filter((card) => !card.noteId || !subjectNoteIds.has(card.noteId)));

    if (timetableIds.length > 0) {
      try {
        await timetableDb.deleteTimetableEntries(uid, timetableIds);
        await cancelAttendanceNotificationsForEntries(timetableIds);
        if (remoteUserIdRef.current && remoteUserIdRef.current !== uid) {
          throw new Error('The signed-in account changed during deletion. Refresh before trying again.');
        }
        const remaining = timetable.filter((entry) => !timetableIds.includes(entry.id));
        setTimetable(remaining);
        setUserState((prev) => ({ ...prev, timetable: remaining }));
        await rescheduleAttendanceNotifications(uid, remaining, { academicCalendar: academicCalendarRef.current });
      } catch (error) {
        throw new Error(
          `The Study folder was deleted, but its timetable classes could not be removed. ${error instanceof Error ? error.message : ''}`.trim(),
        );
      }
    }
  }, [notes, tasks, timetable]);

  const handleSaveNote = useCallback((note: Note) => {
    offlineMutationVersionRef.current += 1;
    const uid = remoteUserIdRef.current;
    setNotes((prev) => {
      const exists = prev.find((n) => n.id === note.id);
      const next = exists ? prev.map((n) => (n.id === note.id ? note : n)) : [note, ...prev];
      if (uid) void offlineSync.cacheNotes(uid, next);
      return next;
    });
    if (uid) {
      void offlineSync.queueNoteUpsert(uid, note)
        .then(() => offlineSync.flushOfflineSync(uid))
        .catch(() => {});
    }
  }, []);



  const deleteNote = useCallback((noteId: string) => {
    offlineMutationVersionRef.current += 1;
    const uid = remoteUserIdRef.current;
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== noteId);
      if (uid) void offlineSync.cacheNotes(uid, next);
      return next;
    });
    setFlashcards((prev) => prev.filter((c) => c.noteId !== noteId)); // Also remove associated flashcards locally
    if (uid) {
      void deleteHandwritingCache(uid, noteId);
      void offlineSync.queueNoteDelete(uid, noteId)
        .then(() => offlineSync.flushOfflineSync(uid))
        .catch(() => {});
    }
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
  // When cards are created rapidly (e.g. 10 cards from one generation), a closure
  // over a component-body variable would always read 0, causing duplicate IDs.
  const flashcardsRef = useRef<Flashcard[]>(flashcards);
  flashcardsRef.current = flashcards;

  const addFlashcards = useCallback(async (noteId: string, inputs: NewFlashcardInput[]): Promise<Flashcard[]> => {
    if (inputs.length === 0) return [];
    const nowIso = new Date().toISOString();
    const existingForNote = flashcardsRef.current.filter((c) => c.noteId === noteId).length;
    const cards: Flashcard[] = inputs.map((input, i) => {
      const { front, back, ...extra } = input;
      return {
        ...extra,
        id: `card-${Date.now()}-${_flashcardIdSeq++}`,
        noteId,
        front: front.trim() || 'Front',
        back: back.trim() || 'Back',
        cardType: extra.cardType ?? 'basic',
        position: extra.position ?? existingForNote + i,
        createdAt: nowIso,
        updatedAt: nowIso,
        // New cards are due immediately (FSRS "New" state).
        due: extra.due ?? nowIso,
        state: extra.state ?? 0,
        stability: extra.stability ?? 0,
        difficulty: extra.difficulty ?? 0,
        elapsedDays: extra.elapsedDays ?? 0,
        scheduledDays: extra.scheduledDays ?? 0,
        learningSteps: extra.learningSteps ?? 0,
        reps: extra.reps ?? 0,
        lapses: extra.lapses ?? 0,
        lastReview: extra.lastReview ?? null,
      };
    });
    // Optimistic insert (newest first, matching getFlashcards ordering).
    setFlashcards((prev) => [...cards, ...prev]);
    const uid = remoteUserIdRef.current;
    if (!uid) {
      const ids = new Set(cards.map((c) => c.id));
      setFlashcards((prev) => prev.filter((c) => !ids.has(c.id)));
      throw new Error('Sign in required to save flashcards.');
    }
    await Promise.all(cards.map((card) => offlineSync.queueFlashcardUpsert(uid, card)));
    void offlineSync.flushOfflineSync(uid).catch(() => {});
    return cards;
  }, []);

  const addFlashcard = useCallback(async (
    noteId: string,
    front: string,
    back: string,
    extra?: Partial<Flashcard>,
  ): Promise<Flashcard> => {
    const { id: _ignoredId, noteId: _ignoredNoteId, front: _f, back: _b, ...rest } = extra ?? {};
    const [card] = await addFlashcards(noteId, [{ front, back, ...rest }]);
    return card;
  }, [addFlashcards]);

  const updateFlashcard = useCallback(async (
    cardId: string,
    front: string,
    back: string,
    extra?: Partial<Flashcard>,
  ): Promise<boolean> => {
    const previous = flashcardsRef.current.find((c) => c.id === cardId);
    if (!previous) return false;
    const { id: _ignoredId, ...rest } = extra ?? {};
    const updated: Flashcard = {
      ...previous,
      ...rest,
      front: front.trim() || previous.front,
      back: back.trim() || previous.back,
      updatedAt: new Date().toISOString(),
    };
    setFlashcards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
    const uid = remoteUserIdRef.current;
    if (!uid) {
      setFlashcards((prev) => prev.map((c) => (c.id === cardId ? previous : c)));
      Alert.alert('Not saved', 'Sign in required to edit flashcards.');
      return false;
    }
    await offlineSync.queueFlashcardUpsert(uid, updated);
    void offlineSync.flushOfflineSync(uid).catch(() => {});
    return true;
  }, []);

  const deleteFlashcard = useCallback(async (cardId: string): Promise<boolean> => {
    const snapshot = flashcardsRef.current;
    if (!snapshot.some((c) => c.id === cardId)) return true;
    setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
    const uid = remoteUserIdRef.current;
    if (!uid) {
      setFlashcards(snapshot);
      Alert.alert('Not deleted', 'Sign in required to delete flashcards.');
      return false;
    }
    await offlineSync.queueFlashcardDelete(uid, cardId);
    void offlineSync.flushOfflineSync(uid).catch(() => {});
    return true;
  }, []);

  /** Deletes ALL cards for a note in one call — used by "Replace" mode in generation and "Delete deck". */
  const deleteFlashcardsForNote = useCallback(async (noteId: string): Promise<boolean> => {
    const snapshot = flashcardsRef.current;
    const removed = snapshot.filter((c) => c.noteId === noteId);
    if (removed.length === 0) return true;
    setFlashcards((prev) => prev.filter((c) => c.noteId !== noteId));
    const uid = remoteUserIdRef.current;
    if (!uid) {
      setFlashcards((prev) => [...prev, ...removed.filter((r) => !prev.some((c) => c.id === r.id))]);
      Alert.alert('Not deleted', 'Sign in required to delete flashcards.');
      return false;
    }
    await Promise.all(removed.map((card) => offlineSync.queueFlashcardDelete(uid, card.id)));
    void offlineSync.flushOfflineSync(uid).catch(() => {});
    return true;
  }, []);

  const reviewFlashcard = useCallback(async (
    cardId: string,
    rating: FlashcardRating,
    durationMs?: number,
  ): Promise<Flashcard | null> => {
    const previous = flashcardsRef.current.find((c) => c.id === cardId);
    if (!previous) return null;
    const { card: next, log } = rateCard(previous, rating, new Date(), durationMs);
    setFlashcards((prev) => prev.map((c) => (c.id === cardId ? next : c)));
    const uid = remoteUserIdRef.current;
    if (!uid) {
      setFlashcards((prev) => prev.map((c) => (c.id === cardId ? previous : c)));
      throw new Error('Sign in required to review flashcards.');
    }
    // Queued, not written directly, so a review on a commute still counts once
    // signal returns. Reviewing is the one study action that needs no server:
    // FSRS already ran on the device and only the result has to travel.
    void offlineSync
      .queueFlashcardUpsert(uid, next)
      .then(() => offlineSync.queueFlashcardReviewLog(uid, log))
      .then(() => offlineSync.flushOfflineSync(uid))
      .catch((err) => {
        if (__DEV__) console.error('[Flashcard] could not queue review:', err);
      });
    return next;
  }, []);

  /**
   * Pull the authoritative plan from `profiles` and apply it locally.
   *
   * Used by "Restore Purchases": RevenueCat only knows about store receipts, so
   * an admin grant or a Curlec purchase restores as "no purchases found" unless
   * we also ask the server.
   */
  const refreshSubscription = useCallback(async (): Promise<import('../types').SubscriptionPlan> => {
    const uid = remoteUserIdRef.current;
    if (!uid) return 'free';
    const { data, error } = await supabase
      .from('profiles')
      .select('subscription_plan, subscription_status, subscription_period_type, subscription_expires_at')
      .eq('id', uid)
      .maybeSingle();
    if (error || remoteUserIdRef.current !== uid) {
      if (__DEV__ && error) console.warn('[Rencana] refreshSubscription failed:', error.message);
      return 'free';
    }
    const plan: import('../types').SubscriptionPlan =
      data?.subscription_plan === 'pro' ? 'pro' : data?.subscription_plan === 'plus' ? 'plus' : 'free';
    const status = data?.subscription_status ? String(data.subscription_status) : undefined;
    const periodType = data?.subscription_period_type ? String(data.subscription_period_type) : undefined;
    const expiresAt = data?.subscription_expires_at ? String(data.subscription_expires_at) : undefined;
    setUserState((prev) =>
      prev.subscriptionPlan === plan &&
      prev.subscriptionStatus === status &&
      prev.subscriptionPeriodType === periodType &&
      prev.subscriptionExpiresAt === expiresAt
        ? prev
        : { ...prev, subscriptionPlan: plan, subscriptionStatus: status, subscriptionPeriodType: periodType, subscriptionExpiresAt: expiresAt },
    );
    return plan;
  }, []);
  refreshSubscriptionRef.current = refreshSubscription;

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
    scheduleAttendanceNotifications(uid, entries).catch(() => {});
  }, []);

  const saveTimetableOnly = useCallback(async (entries: TimetableEntry[], options?: { semesterLabel?: string }) => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) throw new Error('Sign in required to save timetable.');
    await timetableDb.saveTimetable(uid, entries, options?.semesterLabel);
    setTimetable(entries);
    setUserState((prev) => ({ ...prev, timetable: entries }));
    scheduleAttendanceNotifications(uid, entries).catch(() => {});
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
    async (options?: { courses?: string[] }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) throw new Error('Sign in required.');
      const uniId = user.universityId;
      if (!uniId) {
        throw new Error('No university link found. Open Timetable and connect once.');
      }
      if (uniId !== 'uitm') {
        throw new Error('Refresh is only supported for UiTM.');
      }
      const login = (user.studentId || '').trim();
      if (!login) throw new Error('Missing saved student ID. Disconnect and connect again.');
      const prevPortalSemester = user.currentSemester;
      const { entries, profile } = await fetchUitmTimetablePublic(login, options?.courses);
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
      // Persist first so the editor never reports success for a change that
      // failed to reach the timetable table. The screen updates immediately
      // after the confirmed write.
      await timetableDb.updateTimetableEntry(uid, entryId, normalized);
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
      // Re-schedule attendance banners so changes to day/startTime take effect.
      scheduleAttendanceNotifications(uid, mergedAfterUpdate).catch(() => {});
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
    scheduleAttendanceNotifications(uid, merged).catch(() => {});
  }, []);

  const removeTimetableEntry = useCallback(async (entryId: string, options?: { deleteStudySubject?: boolean }) => {
    offlineMutationVersionRef.current += 1;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) throw new Error('Sign in required to save timetable.');
    const target = timetable.find((entry) => entry.id === entryId);
    if (!target) throw new Error('This timetable class no longer exists.');
    const subjectCode = target.subjectCode.trim();
    const subjectUpper = subjectCode.toUpperCase();
    const idsToDelete = options?.deleteStudySubject
      ? timetable.filter((entry) => entry.subjectCode.trim().toUpperCase() === subjectUpper).map((entry) => entry.id)
      : [entryId];

    await timetableDb.deleteTimetableEntries(uid, idsToDelete);
    await cancelAttendanceNotificationsForEntries(idsToDelete);
    if (remoteUserIdRef.current && remoteUserIdRef.current !== uid) {
      throw new Error('The signed-in account changed during deletion. Refresh before trying again.');
    }
    const merged = timetable.filter((entry) => !idsToDelete.includes(entry.id));
    setTimetable(merged);
    setUserState((prev) => ({ ...prev, timetable: merged }));
    await rescheduleAttendanceNotifications(uid, merged, { academicCalendar: academicCalendarRef.current });

    if (options?.deleteStudySubject && subjectCode) {
      const linkedCourse = courses.find((course) => course.id.trim().toUpperCase() === subjectUpper);
      if (linkedCourse) {
        try {
          await deleteCourse(linkedCourse.id, { deleteTimetable: false });
        } catch (error) {
          throw new Error(
            `The timetable subject and its reminders were deleted, but the Study folder could not be removed. ${error instanceof Error ? error.message : ''}`.trim(),
          );
        }
      }
    }
  }, [courses, deleteCourse, timetable]);

  const markDataReady = useCallback(() => setDataReady(true), []);

  // Memoized so the context value keeps a stable reference across re-renders
  // that don't actually change any of the underlying state/callbacks (e.g. a
  // parent/navigation re-render). The dependency array lists every value the
  // object references, so it recomputes exactly when one of them changes —
  // correctness is identical to no memo, but consumers skip needless renders.
  const value = useMemo<AppState>(
    () => ({
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
      addFlashcards,
      updateFlashcard,
      deleteFlashcard,
      deleteFlashcardsForNote,
      reviewFlashcard,
      refreshSubscription,
      pendingExtraction,
      setPendingExtraction,
      pendingClassroomTasks,
      clearPendingClassroomTasks,
      theme,
      setTheme,
      themePack,
      setThemePack,
      customThemeColors,
      setCustomThemeColors,
      themePreviewExpiry,
      setThemePreviewExpiry,
      spiderBlueAccents,
      setSpiderBlueAccents,
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
      taskCompletionKeys,
      isTaskDoneOn,
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
      offlineSyncStatus,
      retryOfflineSync,
    }),
    [
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
      addFlashcards,
      updateFlashcard,
      deleteFlashcard,
      deleteFlashcardsForNote,
      reviewFlashcard,
      refreshSubscription,
      pendingExtraction,
      setPendingExtraction,
      pendingClassroomTasks,
      clearPendingClassroomTasks,
      theme,
      setTheme,
      themePack,
      setThemePack,
      customThemeColors,
      setCustomThemeColors,
      themePreviewExpiry,
      setThemePreviewExpiry,
      spiderBlueAccents,
      setSpiderBlueAccents,
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
      taskCompletionKeys,
      isTaskDoneOn,
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
      offlineSyncStatus,
      retryOfflineSync,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
