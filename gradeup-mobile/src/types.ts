export type Page =
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
  /**
   * Category name. The legacy `TaskType` enum is kept for default values
   * (Assignment, Quiz, …) but admin-defined categories from
   * `public.task_categories` can also flow through here, so we accept any
   * string at the type level.
   */
  type: string;
  dueDate: string;
  dueTime: string;
  notes: string;
  isDone: boolean;
  /** When omitted, stored as NULL (e.g. device calendar import). */
  deadlineRisk?: 'High' | 'Medium' | 'Low';
  /** When omitted, stored as NULL (e.g. device calendar import). */
  suggestedWeek?: number;
  sourceMessage?: string;
  /** True when imported from Google Classroom without a real due date — placeholder is today */
  needsDate?: boolean;
  /**
   * When non-empty, this is a recurring "To Do" task. Numbers are Postgres
   * DOW (0=Sun..6=Sat). dueDate is then used only as a placeholder.
   */
  repeatDays?: number[];
  /** If true, schedule a local notification at dueTime on each repeat day. */
  repeatNotify?: boolean;
}

/** Academic level for SOW/calendar (diploma, bachelor, etc.) */
export type AcademicLevel = 'Diploma' | 'Bachelor' | 'Master' | 'PhD' | 'Foundation' | 'Other';

/** Derived from semester start date + today vs teaching weeks / break */
export type SemesterPhase = 'no_calendar' | 'before_start' | 'teaching' | 'break_after';

export type AcademicPeriodType =
  | 'lecture'
  | 'registration'
  | 'test'
  | 'revision'
  | 'exam'
  | 'break'
  | 'special_break'
  | 'other';

/** A dated range within a semester (inclusive). */
export interface AcademicPeriod {
  type: AcademicPeriodType;
  label: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

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
  /** Optional detailed schedule. When present, teaching week excludes non-lecture periods. */
  periods?: AcademicPeriod[];
  /** Delta applied to calendar-derived teaching week (clamped to 1..totalWeeks). */
  teachingWeekOffset?: number;
  isActive: boolean;
  createdAt?: string;
}

/** Billing tier from `profiles.subscription_plan` (admin-managed). */
export type SubscriptionPlan = 'free' | 'plus' | 'pro';

export interface UserProfile {
  id?: string;
  name: string;
  studentId: string;
  program: string;
  part: number;
  currentWeek: number;
  startDate: string;
  isBreak?: boolean;
  /** Present when derived from academic calendar + today */
  semesterPhase?: SemesterPhase;
  avatar?: string;
  /** University/school name – used for SOW and calendar */
  university?: string;
  /** University portal ID (e.g. 'uitm') — set when user connects once */
  universityId?: string;
  /** Diploma, Bachelor, Master, etc. – affects semester length and SOW intelligence */
  academicLevel?: AcademicLevel;
  /** From MyStudent profile / CDN when linked */
  campus?: string;
  faculty?: string;
  studyMode?: string;
  /** Current semester number from portal (e.g. 5) */
  currentSemester?: number;
  /** UiTM HEA term/semester code (e.g. 20262) to select correct calendar segment */
  heaTermCode?: string;
  /** DB: portal semester we last aligned academic calendar teaching-week 1 to */
  portalTeachingAnchoredSemester?: number;
  /** Personal email shown on MyStudent profile */
  mystudentEmail?: string;
  /** ISO timestamp of last portal sync */
  lastSync?: string;
  /** Timetable entries fetched from university portal */
  timetable?: TimetableEntry[];
  /** Subscription tier; default free when missing from DB */
  subscriptionPlan?: SubscriptionPlan;
  /** True if the user has ever claimed a premium theme trial */
  hasUsedThemeTrial?: boolean;
}

export interface Note {
  id: string;
  subjectId: string;
  /** Optional chapter/folder name (user-defined). */
  folderId?: string;
  title: string;
  content: string;
  tag: 'Lecture' | 'Tutorial' | 'Exam' | 'Important' | 'Lab' | 'Discussion';
  updatedAt: string;
  /** Storage path for attached file (Supabase Storage bucket note-attachments). */
  attachmentPath?: string;
  attachmentFileName?: string;
  /** Cached text extracted from PDF attachment — avoids re-extraction on every AI call. */
  extractedText?: string;
  /**
   * Persisted extraction error message when PDF text extraction fails.
   * Allows the UI to show failure state and offer retry.
   */
  extractionError?: string;
}


export interface Flashcard {
  id: string;
  noteId?: string; // which note this flashcard belongs to
  front: string;
  back: string;
  question?: string;
  answer?: string;
}

export interface ChatSession {
  id: string;
  subjectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'ai';
  content: string;
  createdAt: string;
}

/* ── Study Snap ────────────────────────────────────────── */

export interface StudySnap {
  id: string;
  userId: string;
  imageUrl: string;
  caption?: string;
  createdAt: string;
  expiresAt: string;
  /** Joined author profile info */
  authorName?: string;
  authorAvatar?: string;
}

export interface SnapStreak {
  currentStreak: number;
  longestStreak: number;
  lastSnapDate: string | null;
  revivalsUsed: number;
  revivalMonth: number;
}

export interface SnapReaction {
  id: string;
  snapId: string;
  userId: string;
  emoji: string;
  createdAt: string;
  /** Joined reactor profile info */
  reactorName?: string;
}

/* ── University & Timetable ─────────────────────────────── */

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export interface UniversityConfig {
  id: string;
  name: string;
  shortName: string;
  loginUrl: string;
  timetableUrl?: string;
  mode: 'webview' | 'api';
  logoEmoji?: string;
}

export interface TimetableEntry {
  id: string;
  day: DayOfWeek;
  subjectCode: string;
  subjectName: string;
  /** Shown instead of subjectName when set (official name stays in subjectName). */
  displayName?: string;
  /** Hex override for this slot; falls back to hash of subjectCode. */
  slotColor?: string;
  lecturer: string;
  startTime: string;
  endTime: string;
  location: string;
  group?: string;
}

export interface UniversityConnection {
  universityId: string;
  studentId: string;
  connectedAt: string;
  lastSync?: string;
}

/* ── Shared Tasks ──────────────────────────────────────── */

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

export interface TaskShareStream {
  id: string;
  owner_id: string;
  recipient_id?: string | null;
  circle_id?: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/* ── Grade Calculator ───────────────────────────────────────── */

/**
 * Supported grading schemes.
 * - 'uitm'      : UiTM Malaysia 13-grade table (A+ 4.0, A 4.0, A- 3.67 … F 0.0)
 * - 'generic_4' : Generic 4.0 GPA scale (A≥90=4.0, B≥80=3.0 etc.)
 * - 'generic_5' : Generic 5.0 GPA scale
 */
export type GradingScheme = 'uitm' | 'generic_4' | 'generic_5';

/** A single carry-mark assessment component (e.g. Test 1, Assignment 2) */
export interface GradeAssessment {
  id: string;
  name: string;
  /** Percentage weight within the carry-marks portion (0-100). All components must sum to 100. */
  weight: number;
  /** Marks scored by the student; null = not yet entered. */
  scored: number | null;
  /** Full marks available for this component (e.g. 100). */
  maxScore: number;
}

/** Full grade configuration for one subject. Persisted both locally and in Supabase. */
export interface SubjectGradeConfig {
  subjectId: string;
  gradingScheme: GradingScheme;
  hasFinalExam: boolean;
  /** % of total grade from carry marks (0–100). */
  carryWeight: number;
  /** % of total grade from final exam — auto-derived as (100 - carryWeight). */
  finalWeight: number;
  assessments: GradeAssessment[];
  /** Final exam score; null = not yet entered. */
  finalExamScored: number | null;
  finalExamMaxScore: number;
}

/** A single row from the UiTM (or generic) grade table. */
export interface GradeRow {
  letter: string;
  minPercent: number;
  maxPercent: number;
  point: number;
}

/** Result of the live grade calculation. */
export interface GradeResult {
  hasData: boolean;          // true if at least one score has been entered
  carryEarned: number;       // carry mark contribution to final score (out of carryWeight)
  carryPossible: number;     // max possible carry earned so far
  carryPending: number;      // carry % from components not yet entered
  finalContribution: number; // final exam contribution to total (out of finalWeight)
  totalScore: number;        // absolute total % earned out of full 100% course weight
  grade: GradeRow;           // absolute grade based on totalScore
  currentStandingScore: number; // percentage based ONLY on exams actually seated/scored
  currentStandingGrade: GradeRow; // relative grade based on currentStandingScore
  /** What score user needs in final exam to reach each grade threshold. */
  requiredForGrades: {
    grade: string;
    point: number;
    required: number;        // % needed in final exam (0-100)
    achievable: boolean;
  }[];
}
