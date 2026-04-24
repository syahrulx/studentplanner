import type { Course } from '../types';
import {
  invokeAiGenerate,
  type AiGenerateTaskExtractResult,
} from './invokeAiGenerate';

export type ExtractionErrorCode = 'MODEL_UNAVAILABLE' | 'INVALID_OUTPUT' | 'NO_TASKS' | 'UNKNOWN';

export interface ExtractionError {
  code: ExtractionErrorCode;
  message: string;
  details?: unknown;
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
}

export interface ExtractTasksResult {
  tasks: TaskExtractionDTO[];
  error?: ExtractionError;
  rawResponseText?: string;
}

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

function buildPrompt(args: ExtractTasksArgs): string {
  const courseList = args.courses.map((c) => `${c.id} = ${c.name}`).join('\\n');
  return [
    'You are an academic task extraction assistant for a Malaysian university student.',
    'Extract all assessment tasks from the message as strict JSON ONLY, no extra text.',
    '',
    'IMPORTANT DATE RULE: Only populate "due_date" when a specific, real calendar date can be determined',
    'from the message (e.g. "15 March", "next Monday", "Week 10"). If the date is vague, relative without',
    'enough context, TBA, "last week of semester", or otherwise unknown, set "due_date" to null and',
    '"needs_date" to true. NEVER invent or guess a date.',
    '',
    'JSON schema:',
    '{',
    '  \"tasks\": [',
    '    {',
    '      \"title\": string,',
    '      \"course_id\": string,  // use one of the known course codes when possible',
    '      \"type\": \"Assignment\" | \"Quiz\" | \"Project\" | \"Lab\" | \"Test\",',
    '      \"due_dates\"?: [\"YYYY-MM-DD\", ...] | null,  // use when the SAME task has multiple dates',
    '      \"due_date\": \"YYYY-MM-DD\" | null,  // single date (omit when due_dates is used)',
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
  const prompt = buildPrompt(args);
  try {
    const { data, error } = await invokeAiGenerate<AiGenerateTaskExtractResult>({
      kind: 'task_extract',
      content: prompt,
      today_iso: args.todayISO,
      current_week: args.currentWeek,
      courses: args.courses.map((c) => ({ id: c.id, name: c.name })),
    });
    if (error) {
      throw new Error(error);
    }
    rawText = JSON.stringify(data ?? {});
  } catch (e) {
    return {
      tasks: [],
      error: {
        code: 'MODEL_UNAVAILABLE',
        message: 'Failed to call AI task extraction model',
        details: e instanceof Error ? e.message : String(e),
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

