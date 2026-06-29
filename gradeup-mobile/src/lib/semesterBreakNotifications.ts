import { cancelAllAttendanceNotifications } from '@/src/attendanceNotifications';
import { getPostTeachingKind } from '@/src/lib/academicUtils';
import { getNotificationPrefs, setNotificationPrefs } from '@/src/storage';
import type { SemesterPhase, UserProfile } from '@/src/types';

/** Week-align picker: study (+1), exam (+2), or semester break (+3). */
export function isSemesterBreakAlignWeek(week: number, totalWeeks: number): boolean {
  return getPostTeachingKind(week, totalWeeks) != null;
}

/**
 * True when class check-ins should be off: study week, exam week, semester break,
 * or calendar-derived end-of-semester break (not mid-semester teaching).
 */
export function isUserInSemesterBreak(
  user: Pick<UserProfile, 'currentWeek' | 'isBreak' | 'semesterPhase'>,
  totalWeeks: number,
): boolean {
  if (!user.isBreak || user.semesterPhase !== 'break_after') return false;
  const cap = Math.max(1, totalWeeks);
  const w = user.currentWeek ?? 1;
  if (getPostTeachingKind(w, totalWeeks) != null) return true;
  return w <= cap;
}

/** Turn off class check-in popup and clear scheduled attendance locals. */
export async function disableClassNotificationsForSemesterBreak(): Promise<void> {
  const prefs = await getNotificationPrefs();
  if (prefs.attendanceCheckinPopup) {
    await setNotificationPrefs({ ...prefs, attendanceCheckinPopup: false });
  }
  await cancelAllAttendanceNotifications();
}

export function semesterBreakFromPhase(
  phase: SemesterPhase | undefined,
  isBreak: boolean | undefined,
  currentWeek: number,
  totalWeeks: number,
): boolean {
  return isUserInSemesterBreak(
    { currentWeek, isBreak, semesterPhase: phase },
    totalWeeks,
  );
}
