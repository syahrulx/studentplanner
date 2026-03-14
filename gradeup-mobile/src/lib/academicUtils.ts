/**
 * Utility to calculate the current academic week according to UiTM rules.
 * Rule: Semester consists of 14 weeks. After that, it's Semester Break.
 * 
 * @param startDateStr ISO date string (e.g. '2025-10-14')
 * @returns { week: number, isBreak: boolean, label: string }
 */
export function getAcademicProgress(startDateStr: string) {
  const startDate = new Date(startDateStr);
  const now = new Date();
  
  // Set both to midnight to ignore time-of-day diffs
  startDate.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  // Time difference in milliseconds
  const diffTime = now.getTime() - startDate.getTime();
  
  // Convert to absolute weeks (1-based)
  // Day 0-6 = Week 1
  // Day 7-13 = Week 2, etc.
  const weeksDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7)) + 1;

  if (weeksDiff < 1) {
    return { week: 1, isBreak: false, label: 'Week 1' };
  }
  
  if (weeksDiff > 14) {
    // According to user: "after 14 week its semester break until new sem"
    return { week: 14, isBreak: true, label: 'Semester Break' };
  }
  
  return { week: weeksDiff, isBreak: false, label: `Week ${weeksDiff}` };
}
