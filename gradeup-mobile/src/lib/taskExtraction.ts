import type { Course } from '../types';
import { resolveRelativeDayReferences } from '../utils/relativeDates';

export { resolveRelativeDayReferences };
import {
  invokeAiGenerate,
  type AiGenerateTaskExtractResult,
} from './invokeAiGenerate';

export type ExtractionErrorCode = 'MODEL_UNAVAILABLE' | 'INVALID_OUTPUT' | 'NO_TASKS' | 'UNKNOWN';

export interface ExtractionError {
  code: ExtractionErrorCode;
  message: string;
  details?: unknown;
  /** Raw error code from the Edge Function, e.g. 'RATE_LIMIT' | 'SMART_CAPTURE_LIMIT'. */
  serverCode?: string;
}

export interface TaskExtractionDTO {
  title: string;
  course_id: string;
  type: string;
  due_date: string; // ISO yyyy-mm-dd — empty string when date is unknown/TBA
  due_time: string; // HH:mm
  priority: string;
  effort_hours: number;
  notes?: string;
  deadline_risk?: string;
  suggested_week?: number;
  confidence?: number;
  is_inferred_date?: boolean;
  is_unknown_course?: boolean;
  needs_date?: boolean; // true when no concrete date was found in the message
}

export interface ExtractTasksArgs {
  message: string;
  courses: Pick<Course, 'id' | 'name'>[];
  todayISO: string;
  currentWeek: number;
  userId?: string;
  /** Semester start date — used to resolve 'Week N' references to concrete dates. */
  semesterStartISO?: string;
  /** ISO 3166-1 alpha-2 country code. Defaults to 'MY' (Malaysian phrasing) when omitted. */
  country?: string;
  /** Where the text came from — tunes the prompt for OCR noise and chat chrome. */
  sourceHint?: 'whatsapp_share' | 'screenshot_ocr' | 'paste';
  /** Tags the request as a Smart Capture so the server applies the daily capture quota. */
  smartCapture?: boolean;
  /** Optional original screenshot, sent only when on-device OCR produced too little text. */
  imageBase64?: string;
  imageMime?: string;
}

export interface ExtractTasksResult {
  tasks: TaskExtractionDTO[];
  error?: ExtractionError;
  rawResponseText?: string;
}

/** Extra instructions appended to the prompt per capture source. */
const SOURCE_HINTS: Record<NonNullable<ExtractTasksArgs['sourceHint']>, string[]> = {
  whatsapp_share: [
    'The text was shared from a chat app. It may include a sender name, a timestamp or quoted replies —',
    'ignore that chrome and extract only the tasks the message actually announces.',
  ],
  screenshot_ocr: [
    'The text is OCR output from a screenshot, so it is noisy. Ignore interface chrome: sender names,',
    'timestamps like "10:32 AM", delivery ticks, "Forwarded", reaction counts, and the status bar.',
    'Rejoin lines that wrapped mid-sentence before reading them. Characters may be misread —',
    'prefer an obvious reading over a literal one, but never invent a date that is not there.',
  ],
  paste: [],
};

const FALLBACK_EFFORT = 2;

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

function computeRiskAndSuggestedWeek(dueISO: string, args: ExtractTasksArgs): {
  risk: string;
  suggestedWeek: number;
} {
  const todayISO = args.todayISO;
  const diffDays = daysBetween(todayISO, dueISO);

  let risk: string;
  if (diffDays <= 2) {
    risk = 'High';
  } else if (diffDays <= 7) {
    risk = 'Medium';
  } else {
    risk = 'Low';
  }

  // Map calendar distance into semester week suggestion.
  // Every 7 days ahead roughly equals +1 week. Never suggest a week before currentWeek.
  const weekOffset = Math.floor(diffDays / 7);
  const suggestedWeek = Math.max(args.currentWeek, args.currentWeek + weekOffset);

  return { risk, suggestedWeek };
}

function deriveTitleFromMessage(message: string): string {
  const msg = message.trim();
  if (!msg) return 'New task';
  const lower = msg.toLowerCase();
  const keywords = ['quiz', 'test', 'assignment', 'lab', 'project', 'presentation', 'exam'];
  let idx = -1;
  for (const k of keywords) {
    const i = lower.indexOf(k);
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  }
  let candidate: string;
  if (idx !== -1) {
    candidate = msg.slice(idx);
  } else {
    candidate = msg;
  }
  // Take first sentence / line from candidate
  candidate = candidate.split(/[.!?\n]/)[0].slice(0, 80).trim();
  if (!candidate) candidate = msg.split(/[.!?\n]/)[0].slice(0, 80).trim() || 'New task';
  // Capitalize first letter
  return candidate.charAt(0).toUpperCase() + candidate.slice(1);
}

function normalizeCourseId(raw: string, courses: Pick<Course, 'id' | 'name'>[]): {
  id: string;
  isUnknown: boolean;
} {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return { id: courses[0]?.id ?? 'UNKNOWN', isUnknown: true };
  }
  const direct = courses.find((c) => c.id.toLowerCase() === trimmed.toLowerCase());
  if (direct) return { id: direct.id, isUnknown: false };
  const byName = courses.find((c) => c.name.toLowerCase().includes(trimmed.toLowerCase()));
  if (byName) return { id: byName.id, isUnknown: false };
  return { id: courses[0]?.id ?? 'UNKNOWN', isUnknown: true };
}

// Phrases that signal the model explicitly flagged the date as unknown.
const DATE_UNKNOWN_SENTINELS = ['null', 'unknown', 'tba', 'tbd', 'n/a', '', 'none', 'not specified'];

function safeDateISO(
  raw: string | null | undefined,
  todayISO: string,
): { iso: string; inferred: boolean; needsDate: boolean } {
  if (raw == null) return { iso: todayISO, inferred: true, needsDate: true };
  const trimmed = String(raw).trim().toLowerCase();
  if (DATE_UNKNOWN_SENTINELS.includes(trimmed)) {
    return { iso: todayISO, inferred: true, needsDate: true };
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { iso: todayISO, inferred: true, needsDate: true };
  return { iso: d.toISOString().slice(0, 10), inferred: false, needsDate: false };
}

function safeTime(raw: string | undefined): string {
  if (!raw) return '23:59';
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '23:59';
  const h = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const m = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function clampEffort(effort: unknown): number {
  const n = typeof effort === 'number' ? effort : Number(effort);
  if (!Number.isFinite(n)) return FALLBACK_EFFORT;
  return Math.min(12, Math.max(1, Math.round(n)));
}

function toDtos(raw: any, args: ExtractTasksArgs): TaskExtractionDTO[] {
  const arr = Array.isArray(raw?.tasks) ? raw.tasks : Array.isArray(raw) ? raw : [];
  const tasks: TaskExtractionDTO[] = [];
  for (const t of arr) {
    if (!t) continue;
    let title = String(t.title ?? '').trim();
    const msg = args.message?.trim();
    if (!title && msg) {
      title = deriveTitleFromMessage(msg);
    }
    if (!title) continue;
    if (msg) {
      const msgLower = msg.toLowerCase();
      const titleLower = title.toLowerCase();
      const looksLikeGreeting =
        /^hi\b|^hello\b|^assalam/i.test(title) || titleLower.startsWith('dear ');
      // If the model just echoed the whole message, made it very long, or it's just a greeting,
      // derive a shorter, task-focused title from the message.
      if (titleLower === msgLower || title.length > 80 || looksLikeGreeting) {
        title = deriveTitleFromMessage(msg);
      }
    }
    const courseRaw = String(t.course_id ?? '');
    const { id: courseId, isUnknown } = normalizeCourseId(courseRaw, args.courses);
    const dueTime = safeTime(t.due_time);

    // Support multiple due dates for a single extracted task.
    // When provided, duplicate the task into multiple TaskExtractionDTO rows (one per date).
    const rawDates: unknown =
      (t as any).due_dates ??
      (t as any).dueDates ??
      (t as any).dates ??
      (t as any).due_date;

    const dateList: Array<string | null | undefined> = Array.isArray(rawDates) ? rawDates : [rawDates as any];
    for (const rawDate of dateList) {
      const { iso, inferred, needsDate } = safeDateISO(rawDate as any, args.todayISO);
      const taskNeedsDate = needsDate || !!t.needs_date || !!t.is_inferred_date;
      const { risk, suggestedWeek } = computeRiskAndSuggestedWeek(iso, args);
      tasks.push({
        title,
        course_id: courseId,
        type: String(t.type ?? 'Assignment'),
        due_date: iso,
        due_time: dueTime,
        priority: String(t.priority ?? 'Medium'),
        effort_hours: clampEffort(t.effort_hours),
        notes: t.notes ? String(t.notes) : undefined,
        deadline_risk: t.deadline_risk ? String(t.deadline_risk) : risk,
        suggested_week: typeof t.suggested_week === 'number' ? t.suggested_week : suggestedWeek,
        confidence: typeof t.confidence === 'number' ? t.confidence : undefined,
        is_inferred_date: inferred || !!t.is_inferred_date,
        is_unknown_course: isUnknown || !!t.is_unknown_course,
        needs_date: taskNeedsDate,
      });
    }
  }
  return tasks;
}

/**
 * Pre-resolve "Week N" / "wk 8" / "minggu 8" references to a concrete ISO date
 * using the semester start date. This prevents the AI from expanding a single
 * week reference into 7 separate daily dates.
 */
export function resolveWeekReferences(
  message: string,
  currentWeek: number,
  semesterStartISO: string | undefined,
): string {
  if (!semesterStartISO) return message; // no calendar — leave for AI

  // Match: "week 8", "Week8", "wk 8", "wk8", "minggu 8" (BM support)
  return message.replace(
    /\b(?:week|wk|minggu)\s*(\d{1,2})\b/gi,
    (match, numStr) => {
      const weekNum = parseInt(numStr, 10);
      if (isNaN(weekNum) || weekNum < 1 || weekNum > 20) return match;
      
      // Calculate the same day-of-week in the target week
      const semStart = new Date(semesterStartISO + 'T00:00:00');
      if (isNaN(semStart.getTime())) return match;
      const weekStart = new Date(semStart);
      weekStart.setDate(semStart.getDate() + (weekNum - 1) * 7);
      
      // Snap to Friday (day 5) of that week
      const startDow = weekStart.getDay(); // 0 (Sun) to 6 (Sat)
      // Math to find the upcoming Friday within the next 6 days:
      const offsetToFriday = (5 - startDow + 7) % 7;
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + offsetToFriday);
      const iso = weekEnd.toISOString().slice(0, 10);
      return `${match} (by ${iso})`;
    }
  );
}

function buildPrompt(args: ExtractTasksArgs): string {
  const courseList = args.courses.map((c) => `${c.id} = ${c.name}`).join('\\n');
  const isMY = (args.country || 'MY') === 'MY';
  return [
    isMY
      ? 'You are an academic task extraction assistant for a Malaysian university student.'
      : 'You are an academic task extraction assistant for a university student studying abroad.',
    'Extract all assessment tasks from the message as strict JSON ONLY, no extra text.',
    '',
    'IMPORTANT DATE RULE: Only populate "due_date" when a specific, real calendar date can be determined',
    'from the message (e.g. "15 March", "next Monday", "Week 10"). If the date is vague, relative without',
    'enough context, TBA, "last week of semester", or otherwise unknown, set "due_date" to null and',
    '"needs_date" to true. NEVER invent or guess a date.',
    '',
    'A date in parentheses after a phrase has already been worked out for you from today\'s date —',
    'for example "jumaat ni (2026-09-11)" or "esok (2026-09-07)". Treat it as a concrete date and put it',
    'in "due_date" with "needs_date": false. Malay day words are ordinary dates: isnin, selasa, rabu,',
    'khamis, jumaat, sabtu, ahad, and esok / lusa / hari ini.',
    '',
    'IMPORTANT WEEK RULE: "Week N" means a SINGLE task due at end of that week — return ONE due_date,',
    'do NOT expand into 5-7 separate daily dates. Only use "due_dates" array when a task genuinely',
    'recurs on different specific dates (e.g. lab sessions on Mon, Wed, Fri).',
    '',
    'JSON schema:',
    '{',
    '  \"tasks\": [',
    '    {',
    '      \"title\": string,',
    '      \"course_id\": string,  // use one of the known course codes when possible',
    '      \"type\": \"Assignment\" | \"Quiz\" | \"Project\" | \"Lab\" | \"Test\",',
    '      \"due_dates\"?: [\"YYYY-MM-DD\", ...] | null,  // ONLY for genuinely recurring sessions',
    '      \"due_date\": \"YYYY-MM-DD\" | null,  // single date (default for most tasks)',
    '      \"due_time\": \"HH:MM\" (24h),',
    '      \"needs_date\": boolean,  // true when due_date is null',
    '      \"priority\": \"High\" | \"Medium\" | \"Low\",',
    '      \"effort_hours\": number,',
    '      \"notes\"?: string,',
    '      \"deadline_risk\"?: string,',
    '      \"suggested_week\"?: number,',
    '      \"confidence\"?: number',
    '    }',
    '  ]',
    '}',
    '',
    ...(args.sourceHint ? SOURCE_HINTS[args.sourceHint] : []),
    ...(args.sourceHint && SOURCE_HINTS[args.sourceHint].length ? [''] : []),
    `Today: ${args.todayISO}. Current semester week: ${args.currentWeek}.`,
    'Known course codes for this student:',
    courseList || 'None provided.',
    '',
    'Message to analyse:',
    args.message,
  ].join('\\n');
}

export async function extractTasksFromMessage(args: ExtractTasksArgs): Promise<ExtractTasksResult> {
  if (!args.message.trim()) {
    return {
      tasks: [],
      error: { code: 'NO_TASKS', message: 'Empty message' },
    };
  }

  let rawText = '';
  // Pre-resolve "Week N" references to concrete dates before the AI sees them
  const resolvedMessage = resolveRelativeDayReferences(
    resolveWeekReferences(args.message, args.currentWeek, args.semesterStartISO),
    args.todayISO,
  );
  const prompt = buildPrompt({ ...args, message: resolvedMessage });
  try {
    const { data, error, errorCode } = await invokeAiGenerate<AiGenerateTaskExtractResult>({
      kind: 'task_extract',
      content: prompt,
      today_iso: args.todayISO,
      current_week: args.currentWeek,
      courses: args.courses.map((c) => ({ id: c.id, name: c.name })),
      ...(args.smartCapture ? { source: 'smart_capture' as const } : {}),
      ...(args.imageBase64
        ? { image_base64: args.imageBase64, image_mime: args.imageMime ?? 'image/png' }
        : {}),
    });
    if (error) {
      // Preserve the server's code (RATE_LIMIT, SMART_CAPTURE_LIMIT, …) so the
      // caller can show the right recovery UI instead of a generic failure.
      return {
        tasks: [],
        error: {
          code: 'MODEL_UNAVAILABLE',
          message: error,
          details: errorCode ?? undefined,
          serverCode: errorCode,
        },
      };
    }
    rawText = JSON.stringify(data ?? {});
  } catch (e) {
    return {
      tasks: [],
      error: {
        code: 'MODEL_UNAVAILABLE',
        message: 'Failed to call AI task extraction model',
        details: e instanceof Error ? e.message : 'Unknown error calling the AI model.',
      },
    };
  }

  if (!rawText) {
    return {
      tasks: [],
      error: { code: 'INVALID_OUTPUT', message: 'AI returned empty response' },
      rawResponseText: rawText,
    };
  }

  const tryParse = (text: string): any | null => {
    try {
      return JSON.parse(text);
    } catch {
      // try to trim markdown fencing if present
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      try {
        return JSON.parse(cleaned);
      } catch {
        return null;
      }
    }
  };

  const parsed = tryParse(rawText);

  if (!parsed) {
    return {
      tasks: [],
      error: { code: 'INVALID_OUTPUT', message: 'AI returned malformed JSON' },
      rawResponseText: rawText,
    };
  }

  const tasks = toDtos(parsed, args);
  if (!tasks.length) {
    return {
      tasks: [],
      error: { code: 'NO_TASKS', message: 'No tasks extracted from message' },
      rawResponseText: rawText,
    };
  }

  return { tasks, rawResponseText: rawText };
}

