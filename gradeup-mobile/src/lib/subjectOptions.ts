import type { Course, TimetableEntry } from '@/src/types';

/**
 * The subjects a task can be filed under.
 *
 * The pickers used to list `courses` alone. A student who built their week in
 * Timetable — typed the slots, or generated them from UiTM — has subject codes
 * there that were never written to `courses`, so a new assignment for one of
 * them had nowhere to go: the code simply was not in the list. Reported for
 * CCS21003, which was in the class timetable and missing from Task Details.
 *
 * So the list is: real courses, then whatever the timetable knows about and
 * `courses` does not, and the student can still type a code that is in neither.
 */
export type SubjectOption = Course & {
  /** 'timetable' rows are offered but not yet saved as a course. */
  source: 'course' | 'timetable';
};

/** Codes are compared case- and space-insensitively; CCS21003 is ccs21003. */
export function subjectKey(code: string): string {
  return String(code ?? '').trim().toUpperCase();
}

/** What a typed code becomes. Codes are stored as typed, minus stray spacing. */
export function courseFromCode(code: string): Course {
  const id = String(code ?? '').trim().replace(/\s+/g, ' ');
  return { id, name: id, creditHours: 0, workload: [] };
}

/**
 * A code is usable when it has something in it and is not absurdly long. It is
 * deliberately loose: universities disagree about what a subject code looks
 * like, and refusing a real one is worse than accepting an odd one.
 */
export function isUsableSubjectCode(code: string): boolean {
  const t = String(code ?? '').trim();
  return t.length >= 2 && t.length <= 40;
}

/** The archive folder holds work from deleted subjects; nothing new is filed there. */
export const KEPT_SUBJECT_ID = 'KEPT';

export function buildSubjectOptions(args: {
  courses: Course[];
  timetable: TimetableEntry[];
  /** Keep this id in the list even when nothing else knows it — e.g. the task's current subject. */
  includeId?: string;
}): SubjectOption[] {
  const { courses, timetable, includeId } = args;

  const options: SubjectOption[] = courses
    .filter((c) => c.id !== KEPT_SUBJECT_ID)
    .map((c) => ({ ...c, source: 'course' }));
  const seen = new Set(options.map((c) => subjectKey(c.id)));

  if (includeId && includeId.trim() && !seen.has(subjectKey(includeId))) {
    options.unshift({ ...courseFromCode(includeId), source: 'course' });
    seen.add(subjectKey(includeId));
  }

  // Timetable slots carry the official name; show it so a bare code is not the
  // only thing the student has to recognise the subject by.
  for (const entry of timetable) {
    const code = String(entry?.subjectCode ?? '').trim();
    if (!code || seen.has(subjectKey(code))) continue;
    seen.add(subjectKey(code));
    const name = String(entry?.displayName || entry?.subjectName || '').trim();
    options.push({
      id: code,
      name: name && subjectKey(name) !== subjectKey(code) ? name : code,
      creditHours: 0,
      workload: [],
      source: 'timetable',
    });
  }

  return options;
}
