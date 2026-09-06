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
  sortOrder?: number;
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
  /** If true, hide this generic to-do from Today's focus. */
  excludeFromFocus?: boolean;
  /** If true, hide this generic to-do from Semester Pulse and workload maps. */
  excludeFromPulse?: boolean;
  /** Parent task id when this row is a user-authored breakdown step. */
  parentTaskId?: string;
  /** Zero-based order under parentTaskId. */
  stepOrder?: number;
  /** Planning estimate only; never interpreted as measured study time. */
  estimatedMinutes?: number;
  /** User assigned by the task owner to complete this breakdown step. */
  assignedTo?: string;
}

/** Academic level for SOW/calendar (diploma, bachelor, etc.) */
export type AcademicLevel = 'Diploma' | 'Bachelor' | 'Master' | 'PhD' | 'Foundation' | 'Other';

/** Derived from semester start date + today vs teaching weeks / break */
export type SemesterPhase = 'no_calendar' | 'before_start' | 'teaching' | 'break_after';

export type AcademicPeriodType =
  | 'lecture'
  | 'orientation'
  | 'registration'
  | 'test'
  | 'revision'
  | 'exam'
  | 'break'
  | 'special_break'
  | 'holiday'
  | 'industrial_training'
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
  /** Why this calendar became active. User/manual choices outrank background imports. */
  selectionSource?: 'automatic' | 'user' | 'manual';
  /** ISO timestamp of the latest explicit user selection. */
  selectedAt?: string;
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
  /** ISO 3166-1 alpha-2 country code (e.g. 'MY', 'US'). Defaults to 'MY' for every existing user; editable in Settings. */
  country?: string;
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
  /** Text/PDF note (default) or an editable handwriting notebook. */
  noteType?: 'text' | 'handwriting';
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


/** FSRS card state. Mirrors ts-fsrs `State`: 0 New, 1 Learning, 2 Review, 3 Relearning. */
export type FlashcardState = 0 | 1 | 2 | 3;

export type FlashcardType = 'basic' | 'cloze' | 'concept';

export interface Flashcard {
  id: string;
  noteId?: string; // which note this flashcard belongs to
  front: string;
  back: string;
  question?: string;
  answer?: string;
  // ── Content metadata (public.flashcards columns) ──
  /** 'basic' Q/A, 'cloze' (front contains {{c1::answer}} markup), or 'concept'. */
  cardType?: FlashcardType;
  hint?: string;
  /** Short excerpt from the source note that the card was generated from. */
  sourceExcerpt?: string;
  /** Ordering inside a deck (0-based). */
  position?: number;
  createdAt?: string;
  updatedAt?: string;
  // ── FSRS scheduling state (ISO strings for dates) ──
  due?: string;
  stability?: number;
  difficulty?: number;
  elapsedDays?: number;
  scheduledDays?: number;
  learningSteps?: number;
  reps?: number;
  lapses?: number;
  state?: FlashcardState;
  lastReview?: string | null;
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

export type GradingScheme = 'uitm' | 'generic_4' | 'generic_5';

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
  /** Client edit timestamp used to reconcile offline and cloud copies. */
  updatedAt?: string;
  gradingScheme: GradingScheme;
  /** User-edited grade thresholds. A non-empty list overrides gradingScheme. */
  customGradeRows?: GradeRow[];
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
  hasData: boolean;
  carryEarned: number;       // carry mark contribution to final score (out of carryWeight)
  carryPossible: number;     // max possible carry earned so far
  carryPending: number;      // carry % from components not yet entered
  finalContribution: number; // final exam contribution to total (out of finalWeight)
  totalScore: number;        // projected total % (0-100)
  currentStandingScore: number;
  currentStandingGrade: GradeRow;
  grade: GradeRow;
  /** What score user needs in final exam to reach each grade threshold. */
  requiredForGrades: {
    grade: string;
    point: number;
    required: number;        // % needed in final exam (0-100)
    achievable: boolean;
  }[];
}
