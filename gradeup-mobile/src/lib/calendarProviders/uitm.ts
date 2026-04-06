import type { CalendarProvider } from './types';
import type { UserProfile, AcademicCalendar } from '@/src/types';
import { fetchUitmAcademicCalendar, type UitmCalendarVariant } from '@/src/lib/uitmAcademicCalendar';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Official HEA tables have many rows; below this we treat stored data as summary-only and re-fetch. */
export const UITM_HEA_PERIOD_COUNT_MIN = 12;

export const uitmProvider: CalendarProvider = {
  universityId: 'uitm',

  async autoSync(
    profile: UserProfile,
    currentCalendar?: AcademicCalendar | null,
  ): Promise<Omit<AcademicCalendar, 'id' | 'userId' | 'createdAt'> | null> {
    const group: 'A' | 'B' =
      profile.academicLevel === 'Foundation' ? 'A' : 'B';

    const preferredTermCode = profile.heaTermCode?.trim() || undefined;
    const today = todayISO();

    const currentLabel = String(currentCalendar?.semesterLabel ?? '');
    const variant: UitmCalendarVariant =
      /kedah\/kelantan\/terengganu/i.test(currentLabel) ? 'kkt' : /standard/i.test(currentLabel) ? 'standard' : 'auto';

    const official = await fetchUitmAcademicCalendar(group, {
      targetDateISO: today,
      preferredTermCode,
      variant,
    });

    if (!official?.startDate || !official?.endDate) return null;

    const officialPeriodN = official.periods?.length ?? 0;
    const currentPeriodN = currentCalendar?.periods?.length ?? 0;
    const needsPeriodBackfill =
      officialPeriodN >= UITM_HEA_PERIOD_COUNT_MIN && currentPeriodN < UITM_HEA_PERIOD_COUNT_MIN;

    // Skip only when dates/weeks match *and* we already have full HEA periods (teaching week needs them).
    if (
      currentCalendar &&
      currentCalendar.startDate === official.startDate &&
      currentCalendar.endDate === official.endDate &&
      currentCalendar.totalWeeks === official.totalWeeks &&
      !needsPeriodBackfill
    ) {
      return null;
    }

    return {
      semesterLabel: official.semesterLabel,
      startDate: official.startDate,
      endDate: official.endDate,
      totalWeeks: official.totalWeeks ?? 14,
      periods: official.periods,
      isActive: true,
    };
  },
};
