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

/** Academic level for SOW/calendar (diploma, bachelor, etc.) */
export type AcademicLevel = 'Diploma' | 'Bachelor' | 'Master' | 'PhD' | 'Foundation' | 'Other';

/** Per-user academic calendar: semester dates and week count for SOW alignment */
export interface AcademicCalendar {
  id: string;
  userId?: string;
  semesterLabel: string;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  breakStartDate?: string;
  breakEndDate?: string;
  isActive: boolean;
  createdAt?: string;
}

export interface UserProfile {
  id?: string;
  name: string;
  studentId: string;
  program: string;
  part: number;
  currentWeek: number;
  startDate: string;
  isBreak?: boolean;
  avatar?: string;
  /** University/school name – used for SOW and calendar */
  university?: string;
  /** Diploma, Bachelor, Master, etc. – affects semester length and SOW intelligence */
  academicLevel?: AcademicLevel;
}

export interface Note {
  id: string;
  subjectId: string;
  /** Optional chapter/folder id (user-defined). */
  folderId?: string;
  title: string;
  content: string;
  tag: 'Lecture' | 'Tutorial' | 'Exam' | 'Important' | 'Lab' | 'Discussion';
  updatedAt: string;
  /** Storage path for attached file (Supabase Storage bucket note-attachments). */
  attachmentPath?: string;
  attachmentFileName?: string;
}

export interface NoteFolder {
  id: string;
  subjectId: string;
  name: string;
  createdAt: string; // ISO timestamp
}

export interface FlashcardFolder {
  id: string;
  name: string;
  createdAt: string; // ISO date
  /** Optional: group folder under a subject (e.g. course code) for chapter/topic organization. */
  subjectId?: string;
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

export type SharedTaskStatus = 'pending' | 'accepted' | 'declined';

export interface SharedTask {
  id: string;
  task_id: string;
  owner_id: string;
  recipient_id: string | null;
  circle_id: string | null;
  status: SharedTaskStatus;
  recipient_completed: boolean;
  message: string | null;
  created_at: string;
  updated_at: string;
  /** Joined from the tasks table */
  task?: Task;
  /** Profile of the person who shared the task */
  owner_profile?: { id: string; name: string; avatar_url?: string };
  /** Profile of the recipient */
  recipient_profile?: { id: string; name: string; avatar_url?: string };
}
