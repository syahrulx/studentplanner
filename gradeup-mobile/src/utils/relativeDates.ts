/**
 * Resolving relative day references ("jumaat ni", "esok", "this Friday") to
 * concrete dates before an AI model ever sees them.
 *
 * Kept free of React Native imports so it can be exercised by
 * tests/relativeDates.test.ts under plain Node.
 */

/**
 * Weekday names the model is likely to meet, Malay and English.
 * 0 = Sunday. "minggu" is deliberately absent: it means "week" far more often
 * than "Sunday" in a deadline message, and `resolveWeekReferences` owns it.
 */
const WEEKDAY_INDEX: Record<string, number> = {
  ahad: 0, sunday: 0, sun: 0,
  isnin: 1, monday: 1, mon: 1,
  selasa: 2, tuesday: 2, tue: 2, tues: 2,
  rabu: 3, wednesday: 3, wed: 3,
  khamis: 4, thursday: 4, thu: 4, thurs: 4,
  jumaat: 5, jumat: 5, friday: 5, fri: 5,
  sabtu: 6, saturday: 6, sat: 6,
};

const WEEKDAY_PATTERN = Object.keys(WEEKDAY_INDEX).join('|');

/** An optional trailing qualifier followed by a date we already added. */
const ALREADY_ANNOTATED = /^\s*(?:ni|ini|depan|hadapan|lepas|lalu)?\s*\(\d{4}-\d{2}-\d{2}\)/i;

/** Adds whole days to an ISO date, staying in local time. */
function addDaysISO(baseISO: string, days: number): string | null {
  const base = new Date(`${baseISO}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Pre-resolve relative day references — "jumaat ni", "this Friday", "esok",
 * "lusa" — into concrete dates, the same way `resolveWeekReferences` handles
 * "Week N".
 *
 * Without this the model sees a relative phrase, follows the rule that says
 * anything "relative without enough context" must be left blank, and returns a
 * task with no due date. "Kena hantar jumaat ni" is completely unambiguous to a
 * student, so it should not land in the planner as "Not set".
 *
 * Past references ("jumaat lepas", "last Friday") are left alone: a deadline
 * that already passed is not something to guess at.
 */
export function resolveRelativeDayReferences(message: string, todayISO: string): string {
  const today = new Date(`${todayISO}T00:00:00`);
  if (Number.isNaN(today.getTime())) return message;
  const todayDow = today.getDay();

  let out = message;

  // "esok" / "besok" / "tomorrow", "lusa", "hari ini" / "today" / "tonight".
  out = out.replace(
    /\b(esok|besok|tomorrow|lusa|hari\s+ini|hari\s+ni|today|tonight|malam\s+ni|malam\s+ini)\b(?!\s*\()/gi,
    (match) => {
      const key = match.toLowerCase().replace(/\s+/g, ' ');
      const offset =
        key === 'lusa' ? 2
        : key === 'esok' || key === 'besok' || key === 'tomorrow' ? 1
        : 0;
      const iso = addDaysISO(todayISO, offset);
      return iso ? `${match} (${iso})` : match;
    },
  );

  // "<weekday>", optionally qualified: "jumaat ni", "this Friday", "jumaat depan".
  const dayRe = new RegExp(
    `\\b(?:(this|next|coming|last|past|previous)\\s+)?(${WEEKDAY_PATTERN})(?:\\s+(ni|ini|depan|hadapan|lepas|lalu))?\\b(?!\\s*\\()`,
    'gi',
  );
  out = out.replace(
    dayRe,
    (
      match: string,
      before: string | undefined,
      day: string,
      after: string | undefined,
      offset: number,
      whole: string,
    ) => {
    const target = WEEKDAY_INDEX[day.toLowerCase()];
    if (target == null) return match;

    // Already annotated. The trailing qualifier is optional, so without this the
    // engine can backtrack to a bare "jumaat" inside "jumaat ni (2026-09-11)"
    // and annotate it a second time.
    if (ALREADY_ANNOTATED.test(whole.slice(offset + match.length))) return match;

    const qualifier = (after ?? before ?? '').toLowerCase();
    // Past references are not ours to resolve.
    if (['lepas', 'lalu', 'last', 'past', 'previous'].includes(qualifier)) return match;

    // Days until the next occurrence; 0 when that weekday is today.
    const ahead = (target - todayDow + 7) % 7;
    const isNextWeek = qualifier === 'depan' || qualifier === 'hadapan' || qualifier === 'next';
    const daysAhead = isNextWeek ? ahead + 7 : ahead;

    const iso = addDaysISO(todayISO, daysAhead);
    return iso ? `${match} (${iso})` : match;
    },
  );

  return out;
}

