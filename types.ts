
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
  | 'flashcardReview';

export enum TaskType {
  Assignment = 'Assignment',
  Quiz = 'Quiz',
  Project = 'Project',
  Lab = 'Lab',
  Test = 'Test'
}

export enum Priority {
  High = 'High',
  Medium = 'Medium',
  Low = 'Low'
}

export interface Course {
  id: string;
  name: string;
  creditHours: number;
  workload: number[]; // 14 values for each week (0-10)
}

export interface Task {
  id: string;
  title: string;
  courseId: string;
  type: TaskType;
  dueDate: string;
  dueTime: string;
  priority: Priority;
  effort: number; // hours
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
  tag: 'Lecture' | 'Tutorial' | 'Exam' | 'Important';
  updatedAt: string;
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
}
