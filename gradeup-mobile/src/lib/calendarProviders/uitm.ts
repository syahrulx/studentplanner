import type { CalendarProvider } from './types';
import type { UserProfile, AcademicCalendar } from '@/src/types';
import {
  fetchUitmAcademicCalendar,
  type UitmCalendarVariant,
  type UitmTermKind,
} from '@/src/lib/uitmAcademicCalendar';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Official HEA tables have many rows; below this we treat stored data as summary-only and re-fetch. */
export const UITM_HEA_PERIOD_COUNT_MIN = 12;

/** True when start/end/totalWeeks are usable (portal anchor or prior save). */
export function isAcademicCalendarRangeComplete(cal: AcademicCalendar | null | undefined): boolean {
  if (!cal) return false;
  const start = String(cal.startDate ?? '').trim().slice(0, 10);
  const end = String(cal.endDate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  const tw = Number(cal.totalWeeks);
  return Number.isFinite(tw) && tw >= 1 && tw <= 60;
}

export const uitmProvider: CalendarProvider = {
  universityId: 'uitm',

  async autoSync(
    profile: UserProfile,
    currentCalendar?: AcademicCalendar | null,
  ): Promise<Omit<AcademicCalendar, 'id' | 'userId' | 'createdAt'> | null> {
    const rangeOk = isAcademicCalendarRangeComplete(currentCalendar);
    const hasPeriods = (currentCalendar?.periods?.length ?? 0) > 0;
    const isCommunityVerified = /uitm\s+community\s+verified/i.test(String(currentCalendar?.semesterLabel ?? ''));

    // Community calendars are an explicit, per-user choice. Never replace one
    // silently with HEA data during background auto-sync.
    if (isCommunityVerified && rangeOk) return null;

    // Full calendar already persisted — no HEA on every app open.
    //
    // Unless it has expired. A calendar whose end date has passed is not
    // "already persisted" in any useful sense: nothing else in the app ever
    // refreshes one, so a student who finished a semester stayed on that
    // semester's dates permanently. When this was found, 5,184 students were
    // still on a calendar that started in March while the new term had begun
    // in late September — their week never moved off the old term, and any
    // leftover teaching_week_offset was being applied on top of it.
    //
    // rangeOk only asks whether the dates parse and totalWeeks is plausible,
    // which an ancient calendar passes just as well as a current one.
    //
    // Expiry is measured against the last period, not `endDate`. endDate comes
    // from teachingBounds, which is the last *lecture* day — study week and the
    // finals that follow it sit outside that date. Expiring on it would have
    // moved a student onto next semester's calendar the morning after their
    // last lecture, i.e. for the whole of revision week and the exams, which is
    // worse than the staleness this is fixing. The last period ends with the
    // published semester break, the day before the next term begins.
    const periodEnds = (currentCalendar?.periods ?? [])
      .map((p) => String(p?.endDate ?? '').trim().slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const storedEnd =
      periodEnds.length > 0
        ? periodEnds.reduce((a, b) => (a > b ? a : b))
        : String(currentCalendar?.endDate ?? '').trim().slice(0, 10);
    const stillRunning =
      /^\d{4}-\d{2}-\d{2}$/.test(storedEnd) && storedEnd >= todayISO();
    if (rangeOk && hasPeriods && stillRunning) {
      return null;
    }

    const group: 'A' | 'B' =
      profile.academicLevel === 'Foundation' ? 'A' : 'B';

    const preferredTermCode = profile.heaTermCode?.trim() || undefined;
    const today = todayISO();

    const currentLabel = String(currentCalendar?.semesterLabel ?? '');
    const variant: UitmCalendarVariant =
      /kedah\/kelantan\/terengganu/i.test(currentLabel) ? 'kkt' : /standard/i.test(currentLabel) ? 'standard' : 'auto';

    // A short semester is chosen by hand in Semester configuration. Background
    // sync must not quietly move that student back to the normal term.
    const termKind: UitmTermKind = /short semester/i.test(currentLabel) ? 'short' : 'auto';

    const official = await fetchUitmAcademicCalendar(group, {
      targetDateISO: today,
      preferredTermCode,
      variant,
      termKind,
    });

    if (!official?.startDate || !official?.endDate) return null;

    const officialPeriodN = official.periods?.length ?? 0;
    const currentPeriodN = currentCalendar?.periods?.length ?? 0;
    const needsPeriodBackfill =
      officialPeriodN >= UITM_HEA_PERIOD_COUNT_MIN && currentPeriodN < UITM_HEA_PERIOD_COUNT_MIN;

    // Range saved (e.g. portal) but phases missing — enrich once per cold start via AppContext autoSync.
    if (rangeOk && !hasPeriods) {
      if (!official.periods?.length) return null;
      return {
        semesterLabel: official.semesterLabel,
        startDate: official.startDate,
        endDate: official.endDate,
        totalWeeks: official.totalWeeks ?? currentCalendar!.totalWeeks,
        periods: official.periods,
        isActive: true,
      };
    }

    // Incomplete calendar: skip if bounds already match HEA (avoid duplicate writes)
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
