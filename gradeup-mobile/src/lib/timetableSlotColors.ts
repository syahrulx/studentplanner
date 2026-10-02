import { subjectKey } from './subjectOptions';

const SLOT_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#ef4444', '#06b6d4', '#6366f1', '#84cc16', '#f97316',
];

export function getSlotColorForSubjectCode(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = ((hash << 5) - hash) + code.charCodeAt(i);
  return SLOT_COLORS[Math.abs(hash) % SLOT_COLORS.length];
}

export const TIMETABLE_SLOT_COLOR_OPTIONS = [...SLOT_COLORS];

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
