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
import { getTheme, setTheme as persistTheme, getRevisionSettings, setRevisionSettings as persistRevision, getCompletedStudyKeys, setCompletedStudyKeys as persistCompletedStudies, getPinnedTaskIds, setPinnedTaskIds as persistPinnedTaskIds, getSubjectColors, setSubjectColors as persistSubjectColors, getCourses, setCourses as persistCourses, type RevisionSettings } from '../storage';
import { SUBJECT_COLOR_OPTIONS } from '../constants/subjectColors';
import { scheduleRevisionNotification, cancelAllRevisionNotifications, requestRevisionPermissions } from '../revisionNotifications';
import { supabase } from '../lib/supabase';
import * as studyDb from '../lib/studyDb';

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
  revisionSettings: RevisionSettings;
  setRevisionSettings: (settings: RevisionSettings) => Promise<void>;
  completedStudyKeys: string[];
  markStudyDone: (key: string) => void;
  unmarkStudyDone: (key: string) => void;
  addTask: (task: Task) => void;
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
  const [user, setUser] = useState<UserProfile>(initialUser);
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initialFlashcards);
  const [flashcardFolders, setFlashcardFolders] = useState<FlashcardFolder[]>(initialFlashcardFolders);
  const [pendingExtraction, setPendingExtraction] = useState('');
  const [theme, setThemeState] = useState<ThemeId>('dark');
  const [revisionSettings, setRevisionState] = useState<RevisionSettings>({
    enabled: false,
    time: '20:00',
    subjectId: '',
    day: 'Every day',
    durationMinutes: 60,
    topic: '',
    repeat: 'repeated',
  });
  const [completedStudyKeys, setCompletedStudyKeys] = useState<string[]>([]);
  const [pinnedTaskIds, setPinnedTaskIds] = useState<string[]>([]);
  const [subjectColors, setSubjectColorsState] = useState<Record<string, string>>({});

  useEffect(() => {
    getTheme().then(setThemeState);
    getRevisionSettings().then(setRevisionState);
    getCompletedStudyKeys().then(setCompletedStudyKeys);
    getPinnedTaskIds().then(setPinnedTaskIds);
    getSubjectColors().then(setSubjectColorsState);
    getCourses().then((stored) => {
      if (stored && stored.length > 0) setCourses(stored);
    });
    // Load study data from Supabase when user is signed in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user?.id) return;
      const uid = session.user.id;
      Promise.all([studyDb.getNotes(uid), studyDb.getFlashcardFolders(uid), studyDb.getFlashcards(uid)]).then(([notesList, foldersList, cardsList]) => {
        if (notesList.length > 0) setNotes(notesList);
        if (foldersList.length > 0) setFlashcardFolders(foldersList);
        if (cardsList.length > 0) setFlashcards(cardsList);
      });
    });
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    persistTheme(next);
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
  }, []);

  const toggleTaskDone = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, isDone: !t.isDone } : t))
    );
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setPinnedTaskIds((prev) => {
      const next = prev.filter((id) => id !== taskId);
      if (next.length !== prev.length) persistPinnedTaskIds(next);
      return next;
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
    revisionSettings,
    setRevisionSettings,
    completedStudyKeys,
    markStudyDone,
    unmarkStudyDone,
    addTask,
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
