import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { UserProfile, Course, Task, Note, Flashcard, FlashcardFolder } from '../types';
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
  type RevisionSettings,
  type AppLanguage,
  type AppLoghat,
} from '../storage';
import { SUBJECT_COLOR_OPTIONS } from '../constants/subjectColors';
import { scheduleRevisionNotification, cancelAllRevisionNotifications, requestRevisionPermissions } from '../revisionNotifications';
import { supabase } from '../lib/supabase';
import * as studyDb from '../lib/studyDb';
import * as taskDb from '../lib/taskDb';
import * as studyTimeDb from '../lib/studyTimeDb';
import * as communityApi from '../lib/communityApi';


type AppState = {
  user: UserProfile;
  setUser: React.Dispatch<React.SetStateAction<UserProfile>>;
  courses: Course[];
  setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
  addCourse: (course: Course) => void;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  flashcards: Flashcard[];
  setFlashcards: React.Dispatch<React.SetStateAction<Flashcard[]>>;
  flashcardFolders: FlashcardFolder[];
  setFlashcardFolders: React.Dispatch<React.SetStateAction<FlashcardFolder[]>>;
  addFlashcardFolder: (name: string) => FlashcardFolder;
  addFlashcard: (folderId: string, front: string, back: string) => Flashcard;
  deleteFlashcardFolder: (folderId: string) => void;
  deleteFlashcard: (cardId: string) => void;
  pendingExtraction: string;
  setPendingExtraction: (text: string) => void;
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
  addTask: (task: Task) => void;
  updateTask: (task: Task) => void;
  toggleTaskDone: (taskId: string) => void;
  deleteTask: (taskId: string) => void;
  pinnedTaskIds: string[];
  pinTask: (taskId: string) => boolean;
  unpinTask: (taskId: string) => void;
  subjectColors: Record<string, string>;
  setSubjectColor: (courseId: string, color: string) => void;
  getSubjectColor: (courseId: string) => string;
  handleSaveNote: (note: Note) => void;
  handleGenerateFlashcards: (newCards: Flashcard[]) => void;
};

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<UserProfile>(() => {
    const progress = getAcademicProgress(initialUser.startDate);
    return { ...initialUser, currentWeek: progress.week, isBreak: progress.isBreak };
  });

  const setUser = useCallback((newUser: UserProfile | ((prev: UserProfile) => UserProfile)) => {
    setUserState(prev => {
      const updated = typeof newUser === 'function' ? newUser(prev) : newUser;
      const progress = getAcademicProgress(updated.startDate);
      return { ...updated, currentWeek: progress.week, isBreak: progress.isBreak };
    });
  }, []);

  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initialFlashcards);
  const [flashcardFolders, setFlashcardFolders] = useState<FlashcardFolder[]>(initialFlashcardFolders);
  const [pendingExtraction, setPendingExtraction] = useState('');
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

  useEffect(() => {
    getTheme().then(setThemeState);
    getCompletedStudyKeys().then(setCompletedStudyKeys);
    getPinnedTaskIds().then(setPinnedTaskIds);
    getSubjectColors().then(setSubjectColorsState);
    getLanguage().then(setLanguageState);
    getLoghat().then(setLoghatState);
    getCourses().then((stored) => {
      if (stored && stored.length > 0) setCourses(stored);
    });

    // Helper to load all remote data for a given user id
    const loadRemoteData = (uid: string) => {
      Promise.all([
        studyDb.getNotes(uid),
        studyDb.getFlashcardFolders(uid),
        studyDb.getFlashcards(uid),
        taskDb.getTasks(uid),
        studyTimeDb.getAllStudySettings(uid),
        communityApi.getUserProfile(uid),
      ])
        .then(([notesList, foldersList, cardsList, tasksList, studyList, profile]) => {
          setNotes(notesList);
          setFlashcardFolders(foldersList);
          setFlashcards(cardsList);
          setTasks(tasksList);
          setRevisionSettingsList(studyList);
          setRevisionState(studyList.length > 0 ? studyList[0] : defaultRevision);
          
          if (profile) {
            setUserState(prev => {
              const base = {
                ...prev,
                id: profile.id,
                name: profile.name || prev.name,
                avatar: profile.avatar_url || prev.avatar,
                program: profile.course || profile.faculty || prev.program,
              };
              // Recalculate academic progress if startDate exists in potential future DB schema
              // For now we keep the seedData startDate unless we added it to DB
              return base;
            });
          }
        })
        .catch(() => {
          // On error, keep existing local state
        });
    };

    // Load once for current session (cold start / reload)
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      if (!uid) return;
      loadRemoteData(uid);
    });

    // Load remote data whenever auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id;
      if (!uid) {
        // If user signed out, clear server-backed data but leave local preferences
        setTasks([]);
        setNotes(initialNotes);
        setFlashcardFolders(initialFlashcardFolders);
        setFlashcards(initialFlashcards);
        setRevisionSettingsList([]);
        setRevisionState(defaultRevision);
        return;
      }
      loadRemoteData(uid);
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

  const addTask = useCallback((task: Task) => {
    setTasks((prev) => [task, ...prev]);
    // Persist to Supabase in background
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      if (!uid) return;
      taskDb.upsertTask(uid, task);
    });
  }, []);

  const updateTask = useCallback((task: Task) => {
    setTasks((prev) => prev.map((item) => (item.id === task.id ? task : item)));
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      if (!uid) return;
      taskDb.upsertTask(uid, task);
    });
  }, []);

  const toggleTaskDone = useCallback((taskId: string) => {
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === taskId ? { ...t, isDone: !t.isDone } : t));
      const updated = next.find((t) => t.id === taskId);
      if (updated) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          const uid = session?.user?.id;
          if (!uid) return;
          taskDb.upsertTask(uid, updated);
          
          // Sync with Shared Goals (Accountability Pacts)
          supabase
            .from('shared_goals')
            .update({ is_completed: updated.isDone, updated_at: new Date().toISOString() })
            .eq('local_task_id', updated.id)
            .or(`user_id.eq.${uid},friend_id.eq.${uid}`)
            .then(({ error }) => {
              if (error) console.error('Error syncing shared goal completion:', error);
            });
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      if (!uid) return;
      taskDb.deleteTask(uid, taskId);
    });
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

  const addCourse = useCallback((course: Course) => {
    setCourses((prev) => {
      if (prev.some((c) => c.id.toUpperCase() === course.id.toUpperCase())) return prev;
      const next = [...prev, course];
      persistCourses(next);
      return next;
    });
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

  const handleGenerateFlashcards = useCallback((newCards: Flashcard[]) => {
    setFlashcards(newCards);
  }, []);

  const addFlashcardFolder = useCallback((name: string): FlashcardFolder => {
    const folder: FlashcardFolder = {
      id: 'folder-' + Date.now(),
      name: name.trim() || 'New folder',
      createdAt: new Date().toISOString().slice(0, 10),
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
    courses,
    setCourses,
    addCourse,
    tasks,
    setTasks,
    notes,
    setNotes,
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
