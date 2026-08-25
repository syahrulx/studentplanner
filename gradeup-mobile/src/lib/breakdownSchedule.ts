/**
 * Scheduling for task breakdown steps.
 *
 * Before this existed, every step copied the parent's dueDate/dueTime, so a
 * task broken into three steps produced three rows all reading "due in 5 days
 * · 23:59". That shrinks each item but does nothing about *when* the work
 * happens, which is the actual problem breaking a task down is meant to solve.
 *
 * Steps are now spread across the days leading up to the deadline, front
 * loaded so the final step lands a day BEFORE the due date. That buffer day
 * matters: student work slips, and a step scheduled on the deadline itself is
 * worthless as a plan.
 *
 * Hard rule everywhere: a step is never dated after its parent's due date.
 */

/** Parse a yyyy-mm-dd string at local noon (avoids DST/UTC day-shift). */
function parseISO(iso: string): Date | null {
  const clean = (iso ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
  const date = new Date(`${clean}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local yyyy-mm-dd. Built from local parts, never toISOString(). */
function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(iso: string, days: number): string {
  const date = parseISO(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Whole days from `fromISO` to `toISO`. Negative when `toISO` is earlier. */
export function daysBetweenISO(fromISO: string, toISO: string): number {
  const from = parseISO(fromISO);
  const to = parseISO(toISO);
  if (!from || !to) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * The latest date a step may legally take.
 *
 * Normally the parent's deadline. But when the parent is already overdue that
 * deadline is in the past, and honouring it would date every step *behind*
 * today — the step is born overdue and the plan is useless. The deadline rule
 * exists to stop work being scheduled after the due date; once the due date
 * has passed it no longer has anything to protect, so today becomes the
 * ceiling instead.
 */
export function maxStepDate(dueDateISO: string, todayISO: string): string {
  const due = (dueDateISO ?? '').slice(0, 10);
  const today = (todayISO ?? '').slice(0, 10);
  return daysBetweenISO(today, due) >= 0 ? due : today;
}

/**
 * Suggested due dates for `stepCount` steps, in step order.
 *
 * Spread evenly from today up to one day before `dueDateISO`, so the plan
 * finishes with a buffer day. Degrades sensibly when there is no room:
 *   - due today or tomorrow → every step lands on the due date
 *   - parent already overdue → every step lands on TODAY, never in the past
 *   - more steps than available days → several steps share a day
 */
export function suggestStepDates(
  stepCount: number,
  dueDateISO: string,
  todayISO: string,
): string[] {
  if (stepCount <= 0) return [];
  const due = parseISO(dueDateISO);
  const today = parseISO(todayISO);
  if (!due || !today) return Array.from({ length: stepCount }, () => dueDateISO);

  const dueClean = toISODate(due);
  const todayClean = toISODate(today);

  // Last day we're willing to schedule work on — one before the deadline.
  const bufferDay = addDays(dueClean, -1);

  // No usable runway (due today, tomorrow, or already overdue). Fall back to
  // the effective ceiling, which is the due date normally but TODAY when the
  // parent is overdue — a step dated before today is born overdue and can
  // never be acted on.
  if (daysBetweenISO(todayClean, bufferDay) <= 0) {
    const ceiling = maxStepDate(dueClean, todayClean);
    return Array.from({ length: stepCount }, () => ceiling);
  }

  if (stepCount === 1) return [todayClean];

  // Front-load: pack the steps into the earlier part of the runway rather than
  // spreading to the last possible day. On a long deadline an even spread
  // leaves only the single buffer day, which is no real cushion — using ~70%
  // of the runway means a task due in a month finishes its steps with ~10 days
  // spare. Short deadlines are barely affected (a 4-day runway keeps 3 days).
  const runway = daysBetweenISO(todayClean, bufferDay);
  const workingSpan = Math.min(runway, Math.max(2, Math.round(runway * 0.7)));

  return Array.from({ length: stepCount }, (_, index) => {
    const offset = Math.round((index * workingSpan) / (stepCount - 1));
    return addDays(todayClean, offset);
  });
}

/**
 * True when `dateISO` is a legal step date: not after the effective ceiling
 * (see maxStepDate) and not before today. The lower bound matters as much as
 * the upper one — a step in the past shows up as overdue the instant it is
 * created, which is what a plan is supposed to prevent.
 */
export function isValidStepDate(dateISO: string, dueDateISO: string, todayISO: string): boolean {
  const date = parseISO(dateISO);
  if (!date || !parseISO(dueDateISO) || !parseISO(todayISO)) return false;
  const day = toISODate(date);
  const today = (todayISO ?? '').slice(0, 10);
  if (daysBetweenISO(today, day) < 0) return false;
  return daysBetweenISO(day, maxStepDate(dueDateISO, todayISO)) >= 0;
}

/** Clamp a chosen date into [today, maxStepDate]. */
export function clampStepDate(dateISO: string, dueDateISO: string, todayISO: string): string {
  const day = (dateISO ?? '').slice(0, 10);
  const today = (todayISO ?? '').slice(0, 10);
  const ceiling = maxStepDate(dueDateISO, todayISO);
  if (!parseISO(day)) return ceiling;
  if (daysBetweenISO(today, day) < 0) return today;
  if (daysBetweenISO(day, ceiling) < 0) return ceiling;
  return day;
}

/**
 * True when every step shares the parent's due date — i.e. a breakdown made
 * before step scheduling existed. Drives the "Spread dates" offer, so old
 * breakdowns are never silently rewritten; the user opts in.
 */
export function stepsNeedSpreading(
  steps: Array<{ dueDate: string }>,
  parentDueDate: string,
): boolean {
  if (steps.length < 2) return false;
  const parentDay = (parentDueDate ?? '').slice(0, 10);
  return steps.every((step) => (step.dueDate ?? '').slice(0, 10) === parentDay);
}
