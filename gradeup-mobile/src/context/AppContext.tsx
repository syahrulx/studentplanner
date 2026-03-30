import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { UserProfile, Course, Task, Note, Flashcard, FlashcardFolder, NoteFolder, AcademicCalendar } from '../types';
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
  type RevisionSettings,
  type AppLanguage,
  type AppLoghat,
  type PlannerViewMode,
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
import { getAcceptedSharedTasks, updateSharedTaskCompletion } from '../lib/communityApi';

type AppState = {
  user: UserProfile;
  setUser: React.Dispatch<React.SetStateAction<UserProfile>>;
  academicCalendar: AcademicCalendar | null;
  setAcademicCalendar: React.Dispatch<React.SetStateAction<AcademicCalendar | null>>;
  updateProfile: (updates: { name?: string; university?: string; academicLevel?: UserProfile['academicLevel'] }) => Promise<void>;
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
    setUserState(prev => {
      const updated = typeof newUser === 'function' ? newUser(prev) : newUser;
      const totalWeeks = academicCalendar?.totalWeeks ?? 14;
      const progress = getAcademicProgress(updated.startDate, totalWeeks);
      return {
        ...updated,
        currentWeek: progress.week,
        isBreak: progress.isBreak,
        semesterPhase: progress.semesterPhase,
      };
    });
  }, [academicCalendar?.totalWeeks]);

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
  const [theme, setThemeState] = useState<ThemeId>('dark');
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

  useEffect(() => {
    getTheme().then(setThemeState);
    getCompletedStudyKeys().then(setCompletedStudyKeys);
    getPinnedTaskIds().then(setPinnedTaskIds);
    getSubjectColors().then(setSubjectColorsState);
    getPlannerView().then(setLastPlannerViewState);
    getLanguage().then(setLanguageState);
    getLoghat().then(setLoghatState);
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

    const loadRemoteData = (uid: string, authFallbackName?: string) => {
      Promise.all([
        studyDb.getNotes(uid),
        studyDb.getNoteFolders(uid),
        studyDb.getFlashcardFolders(uid),
        studyDb.getFlashcards(uid),
        taskDb.getTasks(uid),
        studyTimeDb.getAllStudySettings(uid),
        coursesDb.getCourses(uid),
        profileDb.getProfile(uid),
        academicCalendarDb.getActiveCalendar(uid),
      ])
        .then(async ([notesList, noteFoldersList, foldersList, cardsList, tasksList, studyList, coursesList, profile, calendar]) => {
          setNotes(notesList);
          setNoteFolders(noteFoldersList);
          setFlashcardFolders(foldersList);
          setFlashcards(cardsList);
          setTasks(tasksList);
          setRevisionSettingsList(studyList);
          setRevisionState(studyList.length > 0 ? studyList[0] : defaultRevision);
          setCourses(coursesList);
          setAcademicCalendar(calendar ?? null);
          setUserState((prev) => {
            const profileName = (profile?.name || '').trim();
            const fallbackName = (authFallbackName || '').trim();
            let next = { ...prev, name: profileName || fallbackName || prev.name || 'Student' };
            if (profile) {
              next = { ...next, university: profile.university, academicLevel: profile.academicLevel };
            }
            const totalW = calendar?.totalWeeks ?? 14;
            const startForProgress = calendar?.startDate ?? prev.startDate;
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
        })
        .catch(() => {});
    };

    // Load once for current session (cold start / reload)
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      if (!uid) return;
      loadRemoteData(uid, getAuthFallbackName(session));
    });

    // Load remote data whenever auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id;
      if (!uid) {
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
        return;
      }
      loadRemoteData(uid, getAuthFallbackName(session));
    });

    return () => {
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

  const updateProfile = useCallback(async (updates: { name?: string; university?: string; academicLevel?: UserProfile['academicLevel'] }) => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    await profileDb.updateProfile(uid, updates);
    setUserState((prev) => ({ ...prev, ...updates }));
  }, []);

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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
