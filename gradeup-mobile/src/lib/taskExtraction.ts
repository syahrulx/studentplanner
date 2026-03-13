import Constants from 'expo-constants';
import type { Course } from '../types';

const apiKey = (Constants.expoConfig?.extra as any)?.openaiApiKey as string | undefined;

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
  due_date: string; // ISO yyyy-mm-dd
  due_time: string; // HH:mm
  priority: string;
  effort_hours: number;
  notes?: string;
  deadline_risk?: string;
  suggested_week?: number;
  confidence?: number;
  is_inferred_date?: boolean;
  is_unknown_course?: boolean;
}

export interface ExtractTasksArgs {
  message: string;
  courses: Pick<Course, 'id' | 'name'>[];
  todayISO: string;
  currentWeek: number;
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

function safeDateISO(raw: string | undefined, todayISO: string): { iso: string; inferred: boolean } {
  if (!raw) return { iso: todayISO, inferred: true };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { iso: todayISO, inferred: true };
  return { iso: d.toISOString().slice(0, 10), inferred: false };
}

function safeTime(raw: string | undefined): string {
  if (!raw) return '23:59';
  const match = raw.match(/^(\\d{1,2}):(\\d{2})/);
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
    const { iso, inferred } = safeDateISO(t.due_date, args.todayISO);
    const dueTime = safeTime(t.due_time);
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
    });
  }
  return tasks;
}

function buildPrompt(args: ExtractTasksArgs): string {
  const courseList = args.courses.map((c) => `${c.id} = ${c.name}`).join('\\n');
  return [
    'You are an academic task extraction assistant for a Malaysian university student.',
    'Extract all assessment tasks from the message as strict JSON ONLY, no extra text.',
    'JSON schema:',
    '{',
    '  \"tasks\": [',
    '    {',
    '      \"title\": string,',
    '      \"course_id\": string,  // use one of the known course codes when possible',
    '      \"type\": \"Assignment\" | \"Quiz\" | \"Project\" | \"Lab\" | \"Test\",',
    '      \"due_date\": \"YYYY-MM-DD\" (ISO),',
    '      \"due_time\": \"HH:MM\" (24h),',
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

  // If there is no API key, fall back to a simple single-task heuristic.
  if (!apiKey) {
    const title = deriveTitleFromMessage(args.message);
    const { id } = normalizeCourseId('', args.courses);
    const { iso } = safeDateISO(undefined, args.todayISO);
    const { risk, suggestedWeek } = computeRiskAndSuggestedWeek(iso, args);
    return {
      tasks: [
        {
          title,
          course_id: id,
          type: 'Assignment',
          due_date: iso,
          due_time: '23:59',
          priority: 'Medium',
          effort_hours: FALLBACK_EFFORT,
          notes: args.message.slice(0, 200),
           // Computed locally since the model is not used.
          deadline_risk: risk,
          suggested_week: suggestedWeek,
          is_inferred_date: true,
          is_unknown_course: true,
        },
      ],
      error: { code: 'MODEL_UNAVAILABLE', message: 'OpenAI API key not configured; using heuristic extraction.' },
    };
  }

  let rawText = '';
  try {
    const prompt = buildPrompt(args);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an academic task extraction assistant. You must respond with VALID JSON ONLY matching the provided schema.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${text}`);
    }
    const data = await response.json();
    rawText = (data.choices?.[0]?.message?.content ?? '').trim();
  } catch (e) {
    return {
      tasks: [],
      error: {
        code: 'MODEL_UNAVAILABLE',
        message: 'Failed to call AI model',
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

