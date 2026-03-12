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
  tag: 'Lecture' | 'Tutorial' | 'Exam' | 'Important';
  updatedAt: string;
}

export interface Flashcard {
  id: string;
  noteId?: string;
  question: string;
  answer: string;
}
