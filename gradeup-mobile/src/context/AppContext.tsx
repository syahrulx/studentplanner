import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { UserProfile, Course, Task, Note, Flashcard, FlashcardFolder, NoteFolder, AcademicCalendar, TimetableEntry } from '../types';
import type { ThemeId } from '@/constants/Themes';
import {
  initialUser,
  initialCourses,
  initialTasks,
  initialNotes,
  initialFlashcards,
  initialFlashcardFolders,
} from '../seedData';
import { getAcademicProgress } from '../lib/academicUtils';
import {
  getTheme,
  setTheme as persistTheme,
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
  type RevisionSettings,
  type AppLanguage,
  type AppLoghat,
  type PlannerViewMode,
  type WeekStartsOn,
} from '../storage';
import { SUBJECT_COLOR_OPTIONS } from '../constants/subjectColors';
import { scheduleRevisionNotification, cancelAllRevisionNotifications, requestRevisionPermissions } from '../revisionNotifications';
import { supabase } from '../lib/supabase';
import * as studyDb from '../lib/studyDb';
import * as taskDb from '../lib/taskDb';
import * as studyTimeDb from '../lib/studyTimeDb';
import * as coursesDb from '../lib/coursesDb';
import * as profileDb from '../lib/profileDb';
import * as academicCalendarDb from '../lib/academicCalendarDb';
import * as timetableDb from '../lib/timetableDb';
import { clearSemesterDataFromDatabase } from '../lib/semesterClearDb';
import { getAcceptedSharedTasks, updateSharedTaskCompletion } from '../lib/communityApi';
import { fetchUitmTimetable, profileUpdatesFromMyStudentPayload } from '../lib/timetableParsers/uitm';
import { getTodayISO } from '../utils/date';

type AppState = {
  user: UserProfile;
  setUser: React.Dispatch<React.SetStateAction<UserProfile>>;
  academicCalendar: AcademicCalendar | null;
  setAcademicCalendar: React.Dispatch<React.SetStateAction<AcademicCalendar | null>>;
  updateProfile: (updates: {
    name?: string;
    university?: string;
    academicLevel?: UserProfile['academicLevel'];
    studentId?: string;
    program?: string;
    part?: number;
    avatarUrl?: string | null;
    campus?: string;
    faculty?: string;
    studyMode?: string;
    currentSemester?: number;
    mystudentEmail?: string;
  }) => Promise<void>;
  updateAcademicCalendar: (calendar: Omit<AcademicCalendar, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  courses: Course[];
  setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
  addCourse: (course: Course, options?: { skipRemote?: boolean }) => void;
  deleteCourse: (subjectId: string) => void;
  tasks: Task[];
  tasksVersion: number;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  noteFolders: NoteFolder[];
  addNoteFolder: (folder: NoteFolder) => void;
  deleteNote: (noteId: string) => void;
  deleteNoteFolder: (folderId: string) => void;
  flashcards: Flashcard[];
  setFlashcards: React.Dispatch<React.SetStateAction<Flashcard[]>>;
  flashcardFolders: FlashcardFolder[];
  setFlashcardFolders: React.Dispatch<React.SetStateAction<FlashcardFolder[]>>;
  addFlashcardFolder: (name: string, subjectId?: string) => FlashcardFolder;
  addFlashcard: (folderId: string, front: string, back: string) => Flashcard;
  deleteFlashcardFolder: (folderId: string) => void;
  deleteFlashcard: (cardId: string) => void;
  pendingExtraction: string;
  setPendingExtraction: (text: string) => void;
  pendingClassroomTasks: import('../lib/googleClassroom').PendingNewTask[];
  clearPendingClassroomTasks: () => void;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
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
  updateTask: (taskId: string, updates: Partial<Pick<Task, 'dueDate' | 'dueTime' | 'priority' | 'effort'>>) => void;
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
  saveTimetableAndLink: (entries: TimetableEntry[], universityId: string, studentId: string) => Promise<void>;
  disconnectUniversity: () => Promise<void>;
  /** UiTM: re-fetch timetable + portal profile; overwrites saved timetable and MyStudent fields. */
  refreshUniversityTimetable: (password: string, options?: { courses?: string[] }) => Promise<void>;
  weekStartsOn: WeekStartsOn;
  setWeekStartsOn: (mode: WeekStartsOn) => Promise<void>;
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
  /** Wipes timetable, subjects, tasks, academic calendar, study times, SOW imports (DB + storage). Triple-confirm in UI. */
  clearSemesterData: () => Promise<void>;
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
  const [noteFolders, setNoteFolders] = useState<NoteFolder[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initialFlashcards);
  const [flashcardFolders, setFlashcardFolders] = useState<FlashcardFolder[]>(initialFlashcardFolders);
  const [pendingExtraction, setPendingExtraction] = useState('');
  const [pendingClassroomTasks, setPendingClassroomTasks] = useState<import('../lib/googleClassroom').PendingNewTask[]>([]);
  const clearPendingClassroomTasks = useCallback(() => setPendingClassroomTasks([]), []);
  const [theme, setThemeState] = useState<ThemeId>('light');
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
  /** Latest auth user id we loaded remote data for — avoids applying results after sign-out. */
  const remoteUserIdRef = useRef<string | null>(null);

  /** Keep teaching week in sync with the active academic calendar (same start as task week mapping). */
  useEffect(() => {
    setUserState((prev) => {
      const totalW = academicCalendar?.totalWeeks ?? 14;
      const nextStart = (academicCalendar?.startDate ?? prev.startDate ?? '').trim().slice(0, 10);
      const startFor = (academicCalendar?.startDate ?? prev.startDate ?? '').trim();
      const progress = getAcademicProgress(startFor, totalW);
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
  }, [academicCalendar?.startDate, academicCalendar?.totalWeeks]);

  useEffect(() => {
    getTheme().then(setThemeState);
    getCompletedStudyKeys().then(setCompletedStudyKeys);
    getPinnedTaskIds().then(setPinnedTaskIds);
    getSubjectColors().then(setSubjectColorsState);
    getPlannerView().then(setLastPlannerViewState);
    getLanguage().then(setLanguageState);
    getLoghat().then(setLoghatState);
    getWeekStartsOn().then(setWeekStartsOnState);
    getCourses().then((stored) => {
      if (stored && stored.length > 0) setCourses(stored);
    });

    const getAuthFallbackName = (session: any): string => {
      const metaName =
        session?.user?.user_metadata?.name ||
        session?.user?.user_metadata?.full_name ||
        session?.user?.user_metadata?.display_name;
      const emailName = typeof session?.user?.email === 'string'
        ? session.user.email.split('@')[0]
        : '';
      return (metaName || emailName || '').trim();
    };

    let remoteLoadGeneration = 0;

    // Helper to load all remote data for a given user id (including profile, calendar, subjects)
    const loadRemoteData = (uid: string, authFallbackName?: string) => {
      const gen = ++remoteLoadGeneration;
      remoteUserIdRef.current = uid;
      Promise.allSettled([
        studyDb.getNotes(uid),
        studyDb.getNoteFolders(uid),
        studyDb.getFlashcardFolders(uid),
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
        const r9 = results[9];
        const r10 = results[10];

        if (__DEV__) {
          results.forEach((r, i) => {
            if (r.status === 'rejected') {
              console.warn('[GradeUp] loadRemoteData: request failed', i, r.reason);
            }
          });
        }

        if (r0.status === 'fulfilled') setNotes(r0.value);
        if (r1.status === 'fulfilled') setNoteFolders(r1.value);
        if (r2.status === 'fulfilled') setFlashcardFolders(r2.value);
        if (r3.status === 'fulfilled') setFlashcards(r3.value);
        if (r4.status === 'fulfilled') setTasks(r4.value);
        if (r5.status === 'fulfilled') {
          const studyList = r5.value;
          setRevisionSettingsList(studyList);
          setRevisionState(studyList.length > 0 ? studyList[0] : defaultRevision);
        }
        if (r6.status === 'fulfilled') setCourses(r6.value);
        if (r9.status === 'fulfilled') setTimetable(r9.value ?? []);

        const profile = r7.status === 'fulfilled' ? r7.value : undefined;
        const uniConn = r10.status === 'fulfilled' ? r10.value : null;

        let calendar: AcademicCalendar | null | undefined = undefined;
        if (r8.status === 'fulfilled') {
          calendar = r8.value ?? null;
          const uniId = profile?.universityId ?? uniConn?.universityId;
          const portalSem = profile?.currentSemester;
          const anchoredDb = profile?.portalTeachingAnchoredSemester;
          const calSlice = calendar ? String(calendar.startDate ?? '').trim().slice(0, 10) : '';
          const calStartOk = /^\d{4}-\d{2}-\d{2}$/.test(calSlice);
          const shouldAnchor =
            uniId === 'uitm' &&
            typeof portalSem === 'number' &&
            portalSem > 0 &&
            (anchoredDb == null || anchoredDb !== portalSem || !calendar || !calStartOk);

          if (shouldAnchor) {
            try {
              const today = getTodayISO();
              const tw = calendar?.totalWeeks ?? 14;
              const start = new Date(`${today}T00:00:00`);
              const end = new Date(start);
              end.setDate(end.getDate() + tw * 7 - 1);
              const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
              const saved = await academicCalendarDb.upsertCalendar(uid, {
                semesterLabel: `Programme semester ${portalSem} (portal)`,
                startDate: today,
                endDate: endStr,
                totalWeeks: tw,
                isActive: true,
              });
              calendar = saved;
              await profileDb.updateProfile(uid, { portalTeachingAnchoredSemester: portalSem });
              if (profile) {
                (profile as { portalTeachingAnchoredSemester?: number }).portalTeachingAnchoredSemester =
                  portalSem;
              }
            } catch (e) {
              if (__DEV__) console.warn('[GradeUp] Portal teaching-week anchor on load failed', e);
            }
          }

          if (gen !== remoteLoadGeneration || remoteUserIdRef.current !== uid) return;
          setAcademicCalendar(calendar ?? null);
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
                mystudentEmail: (profile.mystudentEmail ?? '').trim(),
                lastSync: profile.lastSync,
                portalTeachingAnchoredSemester: anchored,
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
            const totalW = calendar?.totalWeeks ?? 14;
            const startForProgress = calendar?.startDate ?? next.startDate;
            const progress = getAcademicProgress(startForProgress, totalW);
            if (calendar) {
              next = {
                ...next,
                startDate: calendar.startDate,
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

        // Check for new Google Classroom tasks in the background (no silent import)
        try {
          const { checkForNewTasks } = require('../lib/googleClassroom');
          const newTasks = await checkForNewTasks();
          if (newTasks && newTasks.length > 0) {
            setPendingClassroomTasks(newTasks);
          }
        } catch {}
      });
    };

    // Load once for current session (cold start / reload)
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      if (!uid) return;
      loadRemoteData(uid, getAuthFallbackName(session));
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
          setNoteFolders([]);
          setFlashcardFolders(initialFlashcardFolders);
          setFlashcards(initialFlashcards);
          setRevisionSettingsList([]);
          setRevisionState(defaultRevision);
          setCourses([]);
          setAcademicCalendar(null);
          setTimetable([]);
        }
        return;
      }
      loadRemoteData(uid, getAuthFallbackName(session));
    });

    return () => {
      remoteLoadGeneration += 1;
      subscription.unsubscribe();
    };
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    persistTheme(next);
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
      university?: string;
      academicLevel?: UserProfile['academicLevel'];
      studentId?: string;
      program?: string;
      part?: number;
      avatarUrl?: string | null;
      campus?: string;
      faculty?: string;
      studyMode?: string;
      currentSemester?: number;
      mystudentEmail?: string;
      portalTeachingAnchoredSemester?: number | null;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      await profileDb.updateProfile(uid, updates);
      setUserState((prev) => ({
        ...prev,
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.university !== undefined ? { university: updates.university } : {}),
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
    const progress = getAcademicProgress(saved.startDate, saved.totalWeeks);
    setUserState((prev) => ({
      ...prev,
      startDate: saved.startDate,
      currentWeek: progress.week,
      isBreak: progress.isBreak,
      semesterPhase: progress.semesterPhase,
    }));
  }, []);

  const addTask = useCallback((task: Task, options?: { skipRemote?: boolean }) => {
    setTasks((prev) => [task, ...prev]);
    if (!options?.skipRemote) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        const uid = session?.user?.id;
        if (!uid) return;
        taskDb.upsertTask(uid, task).then(({ error }) => {
          if (error) console.warn('[GradeUp] Failed to sync task to Supabase:', error.message);
        });
      });
    }
  }, []);

  const updateTask = useCallback((taskId: string, updates: Partial<Pick<Task, 'dueDate' | 'dueTime' | 'priority' | 'effort'>>) => {
    const id = String(taskId).trim();
    setTasks((prev) => {
      const task = prev.find((t) => String(t.id).trim() === id);
      if (!task) return prev;
      const rawDueDate = updates.dueDate !== undefined ? updates.dueDate : task.dueDate;
      const dueDate = (rawDueDate ?? '').trim().slice(0, 10);
      const rawDueTime = updates.dueTime !== undefined ? updates.dueTime : task.dueTime;
      const dueTime = (rawDueTime ?? '').trim().length >= 5 ? (rawDueTime ?? '').trim().slice(0, 5) : (rawDueTime ?? '23:59').trim();
      const todayISO = new Date().toISOString().slice(0, 10);
      const today = new Date(todayISO + 'T00:00:00');
      const due = new Date(dueDate + 'T00:00:00');
      const diffDays = Math.floor((due.getTime() - today.getTime()) / 864e5);
      const deadlineRisk: Task['deadlineRisk'] = diffDays <= 2 ? 'High' : diffDays <= 7 ? 'Medium' : 'Low';
      const suggestedWeek = (() => {
        const start = user?.startDate ? new Date(user.startDate + 'T00:00:00') : new Date(todayISO + 'T00:00:00');
        const diff = Math.floor((due.getTime() - start.getTime()) / 864e5);
        return Math.max(1, Math.ceil(diff / 7));
      })();
      const updated: Task = {
        ...task,
        dueDate,
        dueTime,
        priority: updates.priority !== undefined ? updates.priority : task.priority,
        effort: updates.effort !== undefined ? updates.effort : task.effort,
        deadlineRisk,
        suggestedWeek,
      };
      supabase.auth.getSession().then(({ data: { session } }) => {
        const uid = session?.user?.id;
        if (!uid) return;
        taskDb.upsertTask(uid, updated).then(({ error }) => {
          if (error) console.warn('[GradeUp] Failed to sync task update:', error.message);
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
        supabase.auth.getSession().then(({ data: { session } }) => {
          const uid = session?.user?.id;
          if (!uid) return;
          taskDb.upsertTask(uid, updated).then(({ error }) => {
            if (error) console.warn('[GradeUp] Failed to sync task:', error.message);
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
              if (error) console.warn('[GradeUp] Failed to sync course to Supabase:', error.message);
            });
          }
        });
      }
      return next;
    });
  }, []);

  const deleteCourse = useCallback((subjectId: string) => {
    const upper = subjectId.toUpperCase();
    setCourses((prev) => {
      const next = prev.filter((c) => c.id.toUpperCase() !== upper);
      persistCourses(next);
      return next;
    });
    setTasks((prev) => prev.filter((t) => t.courseId.toUpperCase() !== upper));
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
      if (session?.user?.id) studyDb.upsertNote(session.user.id, note);
    });
  }, []);

  const addNoteFolder = useCallback((folder: NoteFolder) => {
    setNoteFolders((prev) => {
      if (prev.some((f) => f.id === folder.id)) return prev;
      return [...prev, folder];
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) studyDb.upsertNoteFolder(session.user.id, folder);
    });
  }, []);

  const deleteNote = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) studyDb.deleteNote(session.user.id, noteId);
    });
  }, []);

  const deleteNoteFolder = useCallback((folderId: string) => {
    setNoteFolders((prev) => prev.filter((f) => f.id !== folderId));
    setNotes((prev) => prev.map((n) => (n.folderId === folderId ? { ...n, folderId: undefined } : n)));
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) studyDb.deleteNoteFolder(session.user.id, folderId);
    });
  }, []);

  const handleGenerateFlashcards = useCallback((newCards: Flashcard[]) => {
    setFlashcards(newCards);
  }, []);

  const addFlashcardFolder = useCallback((name: string, subjectId?: string): FlashcardFolder => {
    const folder: FlashcardFolder = {
      id: 'folder-' + Date.now(),
      name: name.trim() || 'New folder',
      createdAt: new Date().toISOString().slice(0, 10),
      ...(subjectId != null && subjectId !== '' ? { subjectId } : {}),
    };
    setFlashcardFolders((prev) => [folder, ...prev]);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) studyDb.upsertFlashcardFolder(session.user.id, folder);
    });
    return folder;
  }, []);

  const addFlashcard = useCallback((folderId: string, front: string, back: string): Flashcard => {
    const card: Flashcard = {
      id: 'card-' + Date.now(),
      folderId,
      front: front.trim() || 'Front',
      back: back.trim() || 'Back',
    };
    setFlashcards((prev) => [card, ...prev]);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) studyDb.upsertFlashcard(session.user.id, card);
    });
    return card;
  }, []);

  const deleteFlashcardFolder = useCallback((folderId: string) => {
    setFlashcardFolders((prev) => prev.filter((f) => f.id !== folderId));
    setFlashcards((prev) => prev.filter((c) => c.folderId !== folderId));
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) studyDb.deleteFlashcardFolder(session.user.id, folderId);
    });
  }, []);

  const deleteFlashcard = useCallback((cardId: string) => {
    setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) studyDb.deleteFlashcard(session.user.id, cardId);
    });
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
          const today = getTodayISO();
          const tw = academicCalendar?.totalWeeks ?? 14;
          const start = new Date(`${today}T00:00:00`);
          const end = new Date(start);
          end.setDate(end.getDate() + tw * 7 - 1);
          const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
          await updateAcademicCalendar({
            semesterLabel: `Programme semester ${newPortalSem} (portal)`,
            startDate: today,
            endDate: endStr,
            totalWeeks: tw,
            isActive: true,
          });
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
      academicCalendar?.totalWeeks,
      saveTimetableAndLink,
      updateProfile,
      updateAcademicCalendar,
    ],
  );

  const setWeekStartsOn = useCallback(async (mode: WeekStartsOn) => {
    setWeekStartsOnState(mode);
    await persistWeekStartsOn(mode);
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
      setTimetable((prev) =>
        prev.map((e) => {
          if (e.id !== entryId) return e;
          const next = { ...e, ...normalized };
          if (normalized.displayName !== undefined) {
            if (normalized.displayName === '') delete next.displayName;
            else next.displayName = normalized.displayName;
          }
          if (normalized.slotColor !== undefined) {
            if (normalized.slotColor === '') delete next.slotColor;
            else next.slotColor = normalized.slotColor;
          }
          if (normalized.group !== undefined) {
            if (!normalized.group) delete next.group;
            else next.group = normalized.group;
          }
          return next;
        }),
      );
      await timetableDb.updateTimetableEntry(uid, entryId, normalized);
    },
    [],
  );

  const value: AppState = {
    user,
    setUser,
    academicCalendar,
    setAcademicCalendar,
    updateProfile,
    updateAcademicCalendar,
    courses,
    setCourses,
    addCourse,
    deleteCourse,
    tasks,
    tasksVersion,
    setTasks,
    notes,
    setNotes,
    noteFolders,
    addNoteFolder,
    deleteNote,
    deleteNoteFolder,
    flashcards,
    setFlashcards,
    flashcardFolders,
    setFlashcardFolders,
    addFlashcardFolder,
    addFlashcard,
    deleteFlashcardFolder,
    deleteFlashcard,
    pendingExtraction,
    setPendingExtraction,
    pendingClassroomTasks,
    clearPendingClassroomTasks,
    theme,
    setTheme,
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
    saveTimetableAndLink,
    disconnectUniversity,
    refreshUniversityTimetable,
    weekStartsOn,
    setWeekStartsOn,
    updateTimetableEntry,
    clearSemesterData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
