import { TaskType } from './types';
import type { UserProfile, Course, Task, Note, Flashcard } from './types';
import { DEFAULT_COURSES } from './constants';

export const initialUser: UserProfile = {
  name: 'Student',
  studentId: '',
  program: '',
  part: 0,
  currentWeek: 1,
  subscriptionPlan: 'free',
  /** Default semester start: keep “teaching week 1” plausible for late March 2026 (avoids instant week 5 on cold start). */
  startDate: '2026-03-24',
};

const courseNames: Record<string, string> = {
  IPS551: 'Information System Development',
  CSC584: 'Enterprise Programming',
  ICT551: 'Mobile App Development',
  ICT502: 'IT Infrastructure',
  ISP573: 'IS Planning & Strategy',
  TAC451: 'Third Language',
  CTU551: 'Tamadun Islam & Asia',
  LCC401: 'Critical Reading',
};

export const initialCourses: Course[] = [];

export const initialTasks: Task[] = [];

export const initialNotes: Note[] = [];

export const initialFlashcards: Flashcard[] = [];
