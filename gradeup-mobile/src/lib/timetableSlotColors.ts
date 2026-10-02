import { SUBJECT_COLOR_OPTIONS } from '../constants/subjectColors';
import { subjectKey } from './subjectOptions';

/**
 * The automatic colour a subject gets before anyone picks one.
 *
 * There used to be two of these: the Study tab hashed the code into
 * SUBJECT_COLOR_OPTIONS while the timetable hashed it into a different list of
 * ten. Same code, same hash, different arrays — so CSP650 was indigo in Study
 * and red on the timetable, ENT600 red in Study and violet on the timetable,
 * and so on for every subject. One palette, in one place, so they cannot drift
 * apart again.
 *
 * The code is normalised first, or "csp650" and "CSP650" hash to different
 * colours for what the student considers one subject.
 */
const AUTO_COLORS = SUBJECT_COLOR_OPTIONS.slice(0, 10);

export function subjectAutoColor(code: string): string {
  const key = subjectKey(code);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash) + key.charCodeAt(i);
  return AUTO_COLORS[Math.abs(hash) % AUTO_COLORS.length];
}

export function getSlotColorForSubjectCode(code: string): string {
  return subjectAutoColor(code);
}

/** What the per-class colour picker offers. Every colour a subject can be. */
export const TIMETABLE_SLOT_COLOR_OPTIONS = [...SUBJECT_COLOR_OPTIONS];

export function getTimetableEntryColor(
  e: { subjectCode: string; slotColor?: string },
  subjectColors?: Record<string, string>
): string {
  const c = e.slotColor?.trim();
  if (c) return c;
  if (subjectColors) {
    const sc = subjectColors[e.subjectCode];
    if (sc) return sc;
    // The map is keyed by the course id as the student typed it, while a
    // timetable row carries the code as the portal spells it — "csp650" against
    // "CSP650". An exact match misses, and the miss was silent: the class fell
    // through to the automatic palette below, so the colour the student picked
    // simply never appeared. Everywhere else in the app these are compared
    // through subjectKey, so compare the same way here.
    const want = subjectKey(e.subjectCode);
    if (want) {
      for (const key of Object.keys(subjectColors)) {
        if (subjectKey(key) === want) return subjectColors[key];
      }
    }
  }
  return getSlotColorForSubjectCode(e.subjectCode);
}
