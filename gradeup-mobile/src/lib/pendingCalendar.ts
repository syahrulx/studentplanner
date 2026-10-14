import type { AcademicCalendar } from '@/src/types';

/** Label of the stand-in calendar saved when a student links the UiTM portal. */
export const PENDING_CALENDAR_LABEL = 'Pending auto-sync';

/**
 * The stand-in calendar from university-connect: dated from the day the portal
 * was linked, no lecture rows. It is never a real choice, even after the
 * student re-saves it from settings (which marks it 'user'): 56 students did
 * exactly that and locked auto-sync out for good (Oct 2026).
 */
export function isPendingPlaceholderCalendar(cal: AcademicCalendar | null | undefined): boolean {
  if (!cal) return false;
  const label = String(cal.semesterLabel ?? '').trim().toLowerCase();
  return label === PENDING_CALENDAR_LABEL.toLowerCase() && (cal.periods?.length ?? 0) === 0;
}
