import type { Task, Course } from '../types';
import { getAcademicProgress } from './academicUtils';

/**
 * SOW intelligence: alignment of tasks/subjects with the user's academic calendar.
 * Uses actual tasks and course workload for the current semester.
 */
export function getSowAlignment(params: {
  tasks: Task[];
  courses: Course[];
  startDate: string;
  totalWeeks: number;
  currentWeek: number;
}): { alignmentPercent: number; message: string } {
  const { tasks, courses, startDate, totalWeeks, currentWeek } = params;
  const progress = getAcademicProgress(startDate, totalWeeks);

  // Expected load this week from course workload (SOW)
  const expectedLoad = courses.reduce((sum, c) => sum + (c.workload?.[currentWeek - 1] ?? 0), 0);
  // Actual: tasks due in current week (by suggestedWeek or by due date falling in this week)
  const weekStart = new Date(startDate);
  weekStart.setDate(weekStart.getDate() + (currentWeek - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const actualTaskCount = tasks.filter((t) => {
    if (t.isDone) return false;
    const due = (t.dueDate ?? '').slice(0, 10);
    if (due >= weekStartStr && due <= weekEndStr) return true;
    return t.suggestedWeek === currentWeek;
  }).length;
  const actualEffort = tasks.filter((t) => {
    if (t.isDone) return false;
    const due = (t.dueDate ?? '').slice(0, 10);
    if (due >= weekStartStr && due <= weekEndStr) return true;
    return t.suggestedWeek === currentWeek;
  }).reduce((sum, t) => sum + (t.effort ?? 0), 0);

  const actualLoad = Math.max(actualTaskCount, actualEffort / 4);
  const expectedNorm = Math.max(expectedLoad, 0.5);
  let alignmentPercent = Math.round(Math.min(100, (actualLoad / expectedNorm) * 100));
  if (expectedLoad === 0 && actualLoad === 0) alignmentPercent = 100;
  if (expectedLoad === 0 && actualLoad > 0) alignmentPercent = 100;

  let message: string;
  if (progress.isBreak) {
    message = 'Semester break—no SOW load.';
  } else if (courses.length === 0) {
    message = 'Add subjects to see SOW alignment.';
  } else if (alignmentPercent >= 90) {
    message = 'Aligned with SOW this week.';
  } else if (alignmentPercent < 60) {
    message = 'Below expected load—check deadlines.';
  } else if (actualLoad > expectedNorm * 1.2) {
    message = 'Heavy week—above SOW. Pace yourself.';
  } else {
    message = 'On track with semester workload.';
  }

  return { alignmentPercent, message };
}
