import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { UserProfile, Course, Task, Note, Flashcard } from '../types';
import type { ThemeId } from '@/constants/Themes';
import {
  initialUser,
  initialCourses,
  initialTasks,
  initialNotes,
  initialFlashcards,
} from '../seedData';
import { getTheme, setTheme as persistTheme, getRevisionSettings, setRevisionSettings as persistRevision, getCompletedStudyKeys, setCompletedStudyKeys as persistCompletedStudies, getPinnedTaskIds, setPinnedTaskIds as persistPinnedTaskIds, getSubjectColors, setSubjectColors as persistSubjectColors, type RevisionSettings } from '../storage';
import { SUBJECT_COLOR_OPTIONS } from '../constants/subjectColors';
import { scheduleRevisionNotification, cancelAllRevisionNotifications, requestRevisionPermissions } from '../revisionNotifications';

type AppState = {
  user: UserProfile;
  setUser: React.Dispatch<React.SetStateAction<UserProfile>>;
  courses: Course[];
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  flashcards: Flashcard[];
  setFlashcards: React.Dispatch<React.SetStateAction<Flashcard[]>>;
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
  const [courses] = useState<Course[]>(initialCourses);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initialFlashcards);
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

  const handleSaveNote = useCallback((note: Note) => {
    setNotes((prev) => {
      const exists = prev.find((n) => n.id === note.id);
      if (exists) return prev.map((n) => (n.id === note.id ? note : n));
      return [note, ...prev];
    });
  }, []);

  const handleGenerateFlashcards = useCallback((newCards: Flashcard[]) => {
    setFlashcards(newCards);
  }, []);

  const value: AppState = {
    user,
    setUser,
    courses,
    tasks,
    setTasks,
    notes,
    setNotes,
    flashcards,
    setFlashcards,
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
