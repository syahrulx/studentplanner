import type { UserProfile, AcademicCalendar } from '@/src/types';

/**
 * University-specific calendar provider.
 * Implementations derive the correct academic calendar from the user's profile
 * and today's date — no AI API calls, just profile data + date logic.
 */
export interface CalendarProvider {
  universityId: string;
  /**
   * Return a calendar if one should be saved/updated, or `null` if no change is needed.
   * Called once per app session after profile + existing calendar are loaded.
   * Implementations should return `null` without network I/O when a complete calendar is already stored.
   */
  autoSync(
    profile: UserProfile,
    currentCalendar?: AcademicCalendar | null,
  ): Promise<Omit<AcademicCalendar, 'id' | 'userId' | 'createdAt'> | null>;
}
