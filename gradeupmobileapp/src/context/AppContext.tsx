import React, { createContext, useContext, useState, ReactNode } from 'react';
import { UserProfile, Course, Task, Note, Flashcard, TaskType, Priority } from '../types';
import {
  initialUser,
  initialCourses,
  initialTasks,
  initialNotes,
  initialFlashcards,
} from '../seedData';

interface AppState {
  user: UserProfile;
  setUser: (u: UserProfile) => void;
  courses: Course[];
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  flashcards: Flashcard[];
  setFlashcards: React.Dispatch<React.SetStateAction<Flashcard[]>>;
  addTask: (task: Task) => void;
  toggleTaskDone: (taskId: string) => void;
  deleteTask: (taskId: string) => void;
  saveNote: (note: Note) => void;
  quizScore: number;
  setQuizScore: (s: number) => void;
  selectedSubjectId: string | null;
  setSelectedSubjectId: (id: string | null) => void;
  selectedNote: Note | null;
  setSelectedNote: (n: Note | null) => void;
  selectedTask: Task | null;
  setSelectedTask: (t: Task | null) => void;
}

const AppContext = createContext<AppState>({} as AppState);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserProfile>(initialUser);
  const [courses] = useState<Course[]>(initialCourses);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initialFlashcards);
  const [quizScore, setQuizScore] = useState(0);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const addTask = (task: Task) => {
    setTasks((prev) => [task, ...prev]);
  };

  const toggleTaskDone = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, isDone: !t.isDone } : t))
    );
  };

  const deleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const saveNote = (note: Note) => {
    setNotes((prev) => {
      const exists = prev.find((n) => n.id === note.id);
      if (exists) return prev.map((n) => (n.id === note.id ? note : n));
      return [note, ...prev];
    });
  };

  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        courses,
        tasks,
        setTasks,
        notes,
        setNotes,
        flashcards,
        setFlashcards,
        addTask,
        toggleTaskDone,
        deleteTask,
        saveNote,
        quizScore,
        setQuizScore,
        selectedSubjectId,
        setSelectedSubjectId,
        selectedNote,
        setSelectedNote,
        selectedTask,
        setSelectedTask,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
