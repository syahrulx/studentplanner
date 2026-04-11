import type { Course, DayOfWeek, Task, TimetableEntry } from '../types';
import { getTodayISO, isTaskPastDueNow } from '../utils/date';
import { compareTasksByDueDate, getDaysUntilTaskDue } from './taskUtils';

const JS_TO_DAY: DayOfWeek[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export type HomeWidgetTaskRow = {
  id: string;
  title: string;
  subtitle: string;
  accent: 'overdue' | 'today' | 'default';
};

export type HomeWidgetClassRow = {
  startTime: string;
  endTime: string;
  label: string;
  location: string;
};

export type HomeWidgetProps = {
  dateISO: string;
  greeting: string;
  signedIn: boolean;
  tasks: HomeWidgetTaskRow[];
  classes: HomeWidgetClassRow[];
};

function timeSortKey(t: string): number {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0);
}

export function buildHomeWidgetProps(input: {
  tasks: Task[];
  timetable: TimetableEntry[];
  courses: Course[];
  pinnedTaskIds: string[];
  userName: string;
  signedIn: boolean;
  todayISO?: string;
  maxTasks?: number;
  maxClasses?: number;
}): HomeWidgetProps {
  const todayISO = input.todayISO ?? getTodayISO();
  const maxTasks = input.maxTasks ?? 5;
  const maxClasses = input.maxClasses ?? 6;

  if (!input.signedIn) {
    return {
      dateISO: todayISO,
      greeting: 'Rencana',
      signedIn: false,
      tasks: [],
      classes: [],
    };
  }

  const courseById = new Map(input.courses.map((c) => [c.id, c]));
  const pinned = new Set(input.pinnedTaskIds);
  const pending = input.tasks.filter((t) => !t.isDone);

  const scored = pending.map((task) => {
    const days = getDaysUntilTaskDue(task, todayISO);
    const overdue = !task.needsDate && isTaskPastDueNow(task);
    const bucket = overdue ? 0 : days === 0 ? 1 : days < 0 ? 0 : pinned.has(task.id) ? 2 : days === 1 ? 3 : 4;
    return { task, bucket, days };
  });

  scored.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    if (a.days < 0 && b.days < 0 && a.days !== b.days) return b.days - a.days;
    return compareTasksByDueDate(a.task, b.task);
  });

  const tasks: HomeWidgetTaskRow[] = scored.slice(0, maxTasks).map(({ task, days, bucket }) => {
    const course = courseById.get(task.courseId);
    const subtitle = (course?.name || task.courseId).trim().slice(0, 32);
    let accent: HomeWidgetTaskRow['accent'] = 'default';
    if (bucket === 0 || days < 0) accent = 'overdue';
    else if (days === 0) accent = 'today';
    return {
      id: task.id,
      title: task.title.trim().slice(0, 120),
      subtitle,
      accent,
    };
  });

  const dow = JS_TO_DAY[new Date(`${todayISO}T12:00:00`).getDay()];
  const dayClasses = input.timetable
    .filter((e) => e.day === dow)
    .sort((a, b) => timeSortKey(a.startTime) - timeSortKey(b.startTime));

  const classes: HomeWidgetClassRow[] = dayClasses.slice(0, maxClasses).map((e) => ({
    startTime: e.startTime.trim(),
    endTime: e.endTime.trim(),
    label: (e.displayName || e.subjectCode || e.subjectName || '').trim().slice(0, 28),
    location: (e.location || '').trim().slice(0, 24),
  }));

  const rawName = (input.userName || '').trim();
  const first = rawName.split(/\s+/)[0] || 'there';
  const greeting = `Hi, ${first}`;

  return {
    dateISO: todayISO,
    greeting,
    signedIn: true,
    tasks,
    classes,
  };
}
