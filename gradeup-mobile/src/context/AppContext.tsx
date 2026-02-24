import React, { createContext, useContext, useState, useCallback } from 'react';
import type { UserProfile, Course, Task, Note, Flashcard } from '../types';
import {
  initialUser,
  initialCourses,
  initialTasks,
  initialNotes,
  initialFlashcards,
} from '../seedData';

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
  addTask: (task: Task) => void;
  toggleTaskDone: (taskId: string) => void;
  deleteTask: (taskId: string) => void;
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
    addTask,
    toggleTaskDone,
    deleteTask,
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
