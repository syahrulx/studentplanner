/**
 * Utility to calculate the current academic week from semester start.
 * Follows academic calendar: semester has totalWeeks (default 14); after that = break.
 *
 * @param startDateStr ISO date string (e.g. '2025-10-14')
 * @param totalWeeks Semester length (14 for diploma/bachelor, may differ for other levels)
 * @returns { week: number, isBreak: boolean, label: string }
 */
export function getAcademicProgress(startDateStr: string, totalWeeks: number = 14) {
  const startDate = new Date(startDateStr);
  const now = new Date();

  startDate.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const diffTime = now.getTime() - startDate.getTime();
  const weeksDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7)) + 1;

  if (weeksDiff < 1) {
    return { week: 1, isBreak: false, label: 'Week 1' };
  }

  if (weeksDiff > totalWeeks) {
    return { week: totalWeeks, isBreak: true, label: 'Semester Break' };
  }

  return { week: weeksDiff, isBreak: false, label: `Week ${weeksDiff}` };
}
