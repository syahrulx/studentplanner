import { TaskType } from './types';
import type { UserProfile, Course, Task, Note, Flashcard, FlashcardFolder } from './types';
import { DEFAULT_COURSES } from './constants';

export const initialUser: UserProfile = {
  name: 'Student',
  studentId: '',
  program: '',
  part: 0,
  currentWeek: 1,
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

export const initialCourses = DEFAULT_COURSES.map(id => ({
  id,
  name: courseNames[id] || 'Course ' + id,
  creditHours: 3,
  workload: [2,3,4,6,5,7,8,4,6,8,10,9,10,4],
}));

export const initialTasks: Task[] = [
  { id: 't1', title: 'Final Project: Backend API', courseId: 'CSC584', type: TaskType.Project, dueDate: '2024-12-27', dueTime: '23:59', notes: 'Implement JWT.', isDone: false, deadlineRisk: 'High', suggestedWeek: 11 },
  { id: 't7', title: 'ISP573: Case Study Analysis', courseId: 'ISP573', type: TaskType.Assignment, dueDate: '2024-12-26', dueTime: '12:00', notes: 'Analyze process.', isDone: false, deadlineRisk: 'Medium', suggestedWeek: 11 },
  { id: 't9', title: 'LCC401: Critical Reading Exercise', courseId: 'LCC401', type: TaskType.Assignment, dueDate: '2024-12-26', dueTime: '17:00', notes: 'Submit summary.', isDone: false, deadlineRisk: 'Low', suggestedWeek: 11 },
  { id: 't11', title: 'IPS551: Requirements Report', courseId: 'IPS551', type: TaskType.Assignment, dueDate: '2024-12-20', dueTime: '23:59', notes: 'SRS.', isDone: true, deadlineRisk: 'Low', suggestedWeek: 10 },
];

export const initialNotes: Note[] = [
  { id: 'n1', subjectId: 'CSC584', title: 'MVC Architecture', content: 'Model-View-Controller.', tag: 'Lecture', updatedAt: '2024-12-20' },
  { id: 'n2', subjectId: 'CSC584', title: 'Hibernate Mapping', content: 'OneToMany, ManyToOne.', tag: 'Tutorial', updatedAt: '2024-12-23' },
];

export const initialFlashcardFolders: FlashcardFolder[] = [
  { id: 'folder1', name: 'General', createdAt: new Date().toISOString().slice(0, 10) },
];

export const initialFlashcards: Flashcard[] = [
  { id: 'f1', folderId: 'folder1', noteId: 'n1', front: 'What does MVC stand for?', back: 'Model-View-Controller' },
  { id: 'f2', folderId: 'folder1', noteId: 'n1', front: 'Role of Controller?', back: 'Handles input, updates model' },
];
