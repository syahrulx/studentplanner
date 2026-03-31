import type { CalendarProvider } from './types';
import { uitmProvider } from './uitm';

const providers: Record<string, CalendarProvider> = {
  [uitmProvider.universityId]: uitmProvider,
};

/**
 * Look up a calendar provider by university ID.
 * Returns `undefined` when no auto-sync logic exists for that university.
 */
export function getCalendarProvider(universityId?: string): CalendarProvider | undefined {
  if (!universityId) return undefined;
  return providers[universityId];
}
