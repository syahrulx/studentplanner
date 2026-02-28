export type Page =
  | 'onboarding'
  | 'login'
  | 'profileSetup'
  | 'dashboard'
  | 'import'
  | 'aiExtraction'
  | 'planner'
  | 'taskDetails'
  | 'ai'
  | 'stressMap'
  | 'weeklySummary'
  | 'groups'
  | 'profileSettings'
  | 'notesHub'
  | 'notesList'
  | 'notesEditor'
  | 'quizConfig'
  | 'quizModeSelection'
  | 'matchLobby'
  | 'quizGameplay'
  | 'resultsPage'
  | 'leaderboard'
  | 'flashcardReview'
  | 'addTask'
  | 'signUp'
  | 'forgotPassword';

export enum TaskType {
  Assignment = 'Assignment',
  Quiz = 'Quiz',
  Project = 'Project',
  Lab = 'Lab',
  Test = 'Test',
}

export enum Priority {
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
}

export interface Course {
  id: string;
  name: string;
  creditHours: number;
  workload: number[];
}

export interface Task {
  id: string;
  title: string;
  courseId: string;
  type: TaskType;
  dueDate: string;
  dueTime: string;
  priority: Priority;
  effort: number;
  notes: string;
  isDone: boolean;
  deadlineRisk: 'High' | 'Medium' | 'Low';
  suggestedWeek: number;
  sourceMessage?: string;
}

export interface UserProfile {
  name: string;
  studentId: string;
  program: string;
  part: number;
  currentWeek: number;
  startDate: string;
}

export interface Note {
  id: string;
  subjectId: string;
  title: string;
  content: string;
  tag: 'Lecture' | 'Tutorial' | 'Exam' | 'Important' | 'Lab' | 'Discussion';
  updatedAt: string;
}

export interface FlashcardFolder {
  id: string;
  name: string;
  createdAt: string; // ISO date
}

export interface Flashcard {
  id: string;
  folderId?: string; // which folder this card belongs to
  noteId?: string;
  front: string;
  back: string;
  question?: string;
  answer?: string;
}
