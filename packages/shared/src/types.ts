export enum TaskType {
  Assignment = 'Assignment',
  Quiz = 'Quiz',
  Project = 'Project',
  Lab = 'Lab',
  Test = 'Test',
}

export interface Course {
  id: string;
  name: string;
  creditHours: number;
  workload: number[];
}

export type NoteTag = 'Lecture' | 'Tutorial' | 'Exam' | 'Important' | 'Lab' | 'Discussion';

export interface Note {
  id: string;
  subjectId: string;
  folderId?: string;
  title: string;
  content: string;
  tag: NoteTag;
  updatedAt: string;
  attachmentPath?: string;
  attachmentFileName?: string;
  extractedText?: string;
  extractionError?: string;
}

export interface Flashcard {
  id: string;
  noteId?: string;
  front: string;
  back: string;
}

export type DayOfWeek =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export interface TimetableEntry {
  id: string;
  day: DayOfWeek;
  subjectCode: string;
  subjectName: string;
  displayName?: string;
  slotColor?: string;
  lecturer: string;
  startTime: string;
  endTime: string;
  location: string;
  group?: string;
}

export interface Task {
  id: string;
  title: string;
  courseId: string;
  type: string;
  dueDate: string;
  dueTime: string;
  notes: string;
  isDone: boolean;
  deadlineRisk?: 'High' | 'Medium' | 'Low';
  suggestedWeek?: number;
  sourceMessage?: string;
  needsDate?: boolean;
  repeatDays?: number[];
  repeatNotify?: boolean;
  excludeFromFocus?: boolean;
  excludeFromPulse?: boolean;
}
