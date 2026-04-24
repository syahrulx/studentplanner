import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import {
  checkMonthlyTokenLimit,
  formatMonthlyLimitMessage,
  logTokenUsage,
  MONTHLY_LIMIT_ERROR_CODE,
} from '../_shared/tokenLimit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_BYTES = 8 * 1024 * 1024;
const VALID_DAYS = new Set([
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]);

type TimetableSlot = {
  day: string;
  start_time: string;
  end_time: string;
  subject_code: string;
  subject_name: string;
  lecturer: string;
  location: string;
  group: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorBody(message: string, code?: string) {
  return jsonResponse({ error: { message, code } }, 200);
}

function stripDataUrl(input: string): string {
  const t = input.trim().replace(/\s/g, '');
  const m = t.match(/^data:[^;]+;base64,(.+)$/i);
  return m ? m[1] : t;
}

function base64ToBytes(b64: string): Uint8Array {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

function bytesToLooseText(bytes: Uint8Array): string {
  const raw = new TextDecoder('latin1').decode(bytes);
  const parts = raw.match(/[A-Za-z0-9][A-Za-z0-9 .,;:()\-_/]{3,}/g) ?? [];
  return parts.join('\n').slice(0, 80000);
}

function extractPdfText(bytes: Uint8Array): string {
  const raw = new TextDecoder('latin1').decode(bytes);
  const parts: string[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '(') {
      let j = i + 1;
      let buf = '';
      while (j < raw.length) {
        const c = raw[j];
        if (c === '\\' && j + 1 < raw.length) {
          const n = raw[j + 1];
          if (n === 'n') buf += '\n';
          else if (n === 'r') buf += '\r';
          else if (n === 't') buf += '\t';
          else buf += n;
          j += 2;
          continue;
        }
        if (c === ')') break;
        buf += c;
        j++;
      }
      const t = buf.replace(/\s+/g, ' ').trim();
      if (t.length >= 2 && /[A-Za-z]/.test(t)) parts.push(t);
      i = j < raw.length ? j + 1 : raw.length;
      continue;
    }
    i++;
  }
  const loose = raw.match(/[A-Za-z0-9][A-Za-z0-9 .,;:()\-_/]{3,}/g) ?? [];
  parts.push(...loose);
  return parts.join('\n').slice(0, 80000);
}

async function extractPdfTextWithUnpdf(bytes: Uint8Array): Promise<string | null> {
  try {
    const { extractText, getDocumentProxy } = await import('npm:unpdf@0.12.1');
    const pdf = await getDocumentProxy(bytes, { verbosity: 0 });
    const { text } = await extractText(pdf, { mergePages: true });
    const s = typeof text === 'string' ? text.trim() : '';
    return s.length > 0 ? s : null;
  } catch (e) {
    console.error('unpdf extract failed:', e);
    return null;
  }
}

function pickLongestText(...candidates: (string | null | undefined)[]): string {
  let best = '';
  for (const c of candidates) {
    const t = (c ?? '').trim();
    if (t.length > best.length) best = t;
  }
  return best;
}

function textFromResponsesApi(body: unknown): string {
  const out = (body as { output?: unknown[] })?.output;
  if (!Array.isArray(out)) return '';
  const chunks: string[] = [];
  for (const item of out) {
    const rec = item as { type?: string; content?: unknown[] };
    if (rec.type !== 'message' || !Array.isArray(rec.content)) continue;
    for (const part of rec.content) {
      const p = part as { type?: string; text?: string };
      if (p.type === 'output_text' && typeof p.text === 'string') chunks.push(p.text);
    }
  }
  return chunks.join('').trim();
}

const TIMETABLE_SYSTEM =
  'You are an expert at extracting weekly university class timetables from images and documents. Output valid JSON only. Use 24-hour times HH:MM. Days must be English full names: Monday..Sunday. Do not invent classes; only extract rows clearly visible in the source. Be extremely thorough — missing even one class is unacceptable.';

const TIMETABLE_JSON_SHAPE =
  '{"slots":[{"day":"Monday","start_time":"09:00","end_time":"10:00","subject_code":"ABC123","subject_name":"Course title","lecturer":"Name or -","location":"Room or Online or -","group":""}]}';

function buildUserPromptForText(): string {
  return [
    'Extract every scheduled class session from the timetable text below.',
    'Return JSON only with shape:',
    TIMETABLE_JSON_SHAPE,
    'Rules:',
    '- day: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, or Sunday only.',
    '- start_time and end_time: 24h HH:MM.',
    '- subject_code: short code as printed (e.g. CSC101).',
    '- subject_name: full course name if visible, else repeat code.',
    '- lecturer, location, group: use "-" or empty string if missing.',
    '- One object per class meeting (split double periods into one row spanning start to end if shown as one block).',
    '',
    '=== TIMETABLE TEXT ===',
  ].join('\n');
}

function normalizeDay(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const u = s.replace(/\./g, '').toUpperCase();
  for (const d of VALID_DAYS) {
    if (d.toLowerCase() === s.toLowerCase()) return d;
  }
  const map: Record<string, string> = {
    MON: 'Monday',
    MONDAY: 'Monday',
    ISNIN: 'Monday',
    TUE: 'Tuesday',
    TUES: 'Tuesday',
    TUESDAY: 'Tuesday',
    SELASA: 'Tuesday',
    WED: 'Wednesday',
    WEDS: 'Wednesday',
    WEDNESDAY: 'Wednesday',
    RABU: 'Wednesday',
    THU: 'Thursday',
    THUR: 'Thursday',
    THURS: 'Thursday',
    THURSDAY: 'Thursday',
    KHAMIS: 'Thursday',
    FRI: 'Friday',
    FRIDAY: 'Friday',
    JUMAAT: 'Friday',
    SAT: 'Saturday',
    SATURDAY: 'Saturday',
    SABTU: 'Saturday',
    SUN: 'Sunday',
    SUNDAY: 'Sunday',
    AHAD: 'Sunday',
  };
  const key = u.replace(/\s+/g, '');
  if (map[key]) return map[key];
  return null;
}

function normalizeTime(raw: string): string | null {
  const t = raw.trim().replace(/\./g, ':').replace(/\s+/g, '');
  if (!t) return null;
  let h: number;
  let m: number;
  const m12 = t.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  if (m12) {
    h = parseInt(m12[1], 10);
    m = parseInt(m12[2], 10);
    const ap = m12[3].toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
  } else if (/^\d{3,4}$/.test(t)) {
    const pad = t.length === 3 ? `0${t}` : t;
    h = parseInt(pad.slice(0, 2), 10);
    m = parseInt(pad.slice(2, 4), 10);
  } else {
    const m24 = t.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!m24) return null;
    h = parseInt(m24[1], 10);
    m = parseInt(m24[2], 10);
  }
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function normalizeSlots(raw: unknown): TimetableSlot[] {
  const slots = Array.isArray((raw as { slots?: unknown })?.slots)
    ? ((raw as { slots: unknown[] }).slots)
    : [];
  const out: TimetableSlot[] = [];
  for (const row of slots) {
    const r = row as Record<string, unknown>;
    const day = normalizeDay(String(r.day ?? r.Day ?? ''));
    const st = normalizeTime(String(r.start_time ?? r.startTime ?? r.start ?? ''));
    const et = normalizeTime(String(r.end_time ?? r.endTime ?? r.end ?? ''));
    const code = String(r.subject_code ?? r.subjectCode ?? r.code ?? '').trim() || 'CLASS';
    const name = String(r.subject_name ?? r.subjectName ?? r.name ?? r.title ?? code).trim() || code;
    if (!day || !st || !et) continue;
    out.push({
      day,
      start_time: st,
      end_time: et,
      subject_code: code.slice(0, 32),
      subject_name: name.slice(0, 200),
      lecturer: String(r.lecturer ?? r.Lecturer ?? '-').trim().slice(0, 120) || '-',
      location: String(r.location ?? r.room ?? r.venue ?? '-').trim().slice(0, 120) || '-',
      group: String(r.group ?? r.Group ?? '').trim().slice(0, 80),
    });
  }
  return out;
}

type TtUsage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };

function addUsage(a: TtUsage, b: TtUsage): TtUsage {
  return {
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
  };
}

function chatUsage(aiJson: unknown): TtUsage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = (aiJson as any)?.usage ?? {};
  return {
    prompt_tokens: Number(u?.prompt_tokens) || 0,
    completion_tokens: Number(u?.completion_tokens) || 0,
    total_tokens: Number(u?.total_tokens) || 0,
  };
}

function responsesUsage(aiJson: unknown): TtUsage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = (aiJson as any)?.usage ?? {};
  const p = Number(u?.input_tokens ?? u?.prompt_tokens) || 0;
  const c = Number(u?.output_tokens ?? u?.completion_tokens) || 0;
  return {
    prompt_tokens: p,
    completion_tokens: c,
    total_tokens: Number(u?.total_tokens) || p + c,
  };
}

async function openAiTimetableFromPdfNative(args: {
  apiKey: string;
  model: string;
  filename: string;
  pdfBytes: Uint8Array;
}): Promise<
  | { ok: true; text: string; usage: TtUsage }
  | { ok: false; status: number; detail: string }
> {
  const b64 = encodeBase64(args.pdfBytes);
  const userText = [
    buildUserPromptForText(),
    'The timetable is attached as a PDF. Read it and produce the JSON.',
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: args.model,
      store: false,
      temperature: 0,
      instructions: TIMETABLE_SYSTEM,
      text: { format: { type: 'json_object' } },
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename: args.filename.endsWith('.pdf') ? args.filename : `${args.filename}.pdf`,
              file_data: `data:application/pdf;base64,${b64}`,
            },
            { type: 'input_text', text: userText },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 800);
    return { ok: false, status: res.status, detail };
  }
  const json = await res.json();
  return { ok: true, text: textFromResponsesApi(json), usage: responsesUsage(json) };
}

async function openAiTimetableFromTextChat(args: {
  apiKey: string;
  model: string;
  documentText: string;
}): Promise<
  | { ok: true; text: string; usage: TtUsage }
  | { ok: false; status: number; detail: string }
> {
  const prompt = `${buildUserPromptForText()}\n${args.documentText.slice(0, 45000)}\n=== END ===`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: args.model,
      messages: [
        { role: 'system', content: TIMETABLE_SYSTEM },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 800);
    return { ok: false, status: res.status, detail };
  }
  const aiJson = await res.json();
  const text = String(aiJson?.choices?.[0]?.message?.content ?? '').trim();
  return { ok: true, text, usage: chatUsage(aiJson) };
}

function buildImageExtractionPrompt(): string {
  return [
    'You are looking at a university class timetable image. Your job is to extract EVERY class visible.',
    '',
    '## GRID STRUCTURE',
    'The image is a GRID:',
    '- LEFT AXIS: day labels (Mon, Tue, Wed, Thu, Fri or similar abbreviations). Each label marks a HORIZONTAL ROW.',
    '- TOP AXIS: time labels (08:00, 09:00, 10:00, ... up to 18:00 or later). Each label marks a VERTICAL COLUMN.',
    '- COLORED BLOCKS sit inside the grid. Each block = one class session.',
    '- A block\'s HORIZONTAL ROW determines its DAY. A block\'s COLUMN SPAN determines its TIME.',
    '',
    '## EXTRACTION PROCEDURE — FOLLOW EXACTLY',
    '',
    'Process the grid ONE ROW AT A TIME, top to bottom:',
    '',
    'ROW 1 (Monday): Look at the ENTIRE row from left (08:00) to right (18:00). For every colored block in this row:',
    '  - Read subject code (large text like ISP613)',
    '  - Read time range (small text like "08:00-10:00", or infer from column position)',
    '  - Read room/location (small text, often with a pin/location icon). If NO room text exists inside the block, set location to "-"',
    '  - Set day = "Monday"',
    '',
    'ROW 2 (Tuesday): Same process. Set day = "Tuesday" for all blocks in this row.',
    'ROW 3 (Wednesday): Same process. Set day = "Wednesday".',
    'ROW 4 (Thursday): Same process. Set day = "Thursday".',
    'ROW 5 (Friday): Same process. Set day = "Friday".',
    '(Continue for Saturday/Sunday if rows exist.)',
    '',
    '## ABSOLUTE RULES — VIOLATIONS ARE UNACCEPTABLE',
    '',
    '1. DAY ASSIGNMENT: The day is determined ONLY by which labeled row the block sits in. NEVER guess or infer the day from subject names or other logic.',
    '2. NO "Online" HALLUCINATION: If a block has no room/location text inside it, set location to "-". Do NOT write "Online" unless the block literally contains the word "Online".',
    '3. NO FABRICATION: Do not invent classes that are not visible as colored blocks. If you cannot see a block, do not create an entry for it.',
    '4. NO SKIPPING: Every visible colored block MUST appear in your output. Check BOTH the morning section (08:00-12:00) AND afternoon section (14:00-18:00) of EVERY row. Timetables often have a gap between 12:00-14:00 — do not assume afternoon is empty.',
    '5. ROOM ISOLATION: Each block has its own room text (or none). Never copy a room from one block to another.',
    '6. ONE ENTRY PER BLOCK: Each colored block = exactly one JSON entry. Same subject on different days = separate entries.',
    '',
    '## OUTPUT FORMAT',
    'Return JSON only with this shape:',
    TIMETABLE_JSON_SHAPE,
    '',
    '- subject_code: the alphanumeric code (e.g. ISP613, CSP600, TMC501)',
    '- subject_name: full course name if visible, otherwise repeat the code',
    '- 24-hour format HH:MM for all times',
    '- Days must be full English: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday',
  ].join('\n');
}

async function openAiTimetableFromImage(args: {
  apiKey: string;
  model: string;
  mime: string;
  base64: string;
}): Promise<
  | { ok: true; text: string; usage: TtUsage }
  | { ok: false; status: number; detail: string }
> {
  const url = `data:${args.mime};base64,${args.base64}`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${args.apiKey}`,
  };

  // ── STEP 1: Ask the AI to describe each block as plain text (chain-of-thought) ──
  // No JSON pressure = model focuses on reading the image accurately row by row.
  const step1Prompt = [
    'Look at this university timetable image carefully.',
    '',
    'The image is a GRID:',
    '- Left axis = day rows (Mon, Tue, Wed, Thu, Fri)',
    '- Top axis = time columns (08:00, 09:00, 10:00, ... 18:00)',
    '- Each COLORED BLOCK = one class session',
    '',
    'TASK: Scan each row from top to bottom, left to right. For EVERY colored block you see, describe it on its own line in this exact format:',
    'DAY | START_TIME-END_TIME | SUBJECT_CODE | ROOM_OR_DASH',
    '',
    'Rules:',
    '- DAY: use the row label (Mon=Monday, Tue=Tuesday, Wed=Wednesday, Thu=Thursday, Fri=Friday)',
    '- TIME: read the time printed inside the block (e.g. 08:00-10:00), or read from grid columns',
    '- SUBJECT_CODE: the large bold code inside the block (e.g. ISP613, CSP600)',
    '- ROOM: the small text inside the block (e.g. Bilik BK31, Big Data Lab). If the block has no room text, write just a dash: -',
    '- NEVER write "Online" unless the word "Online" literally appears in the block',
    '- NEVER skip a block. NEVER hallucinate a block that does not exist.',
    '- After scanning 08:00-12:00, continue scanning 14:00-18:00 for the SAME row before moving to the next day.',
    '',
    'Output ONLY the pipe-separated lines. No extra explanation.',
  ].join('\n');

  const step1Res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: args.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: step1Prompt },
            { type: 'image_url', image_url: { url, detail: 'high' } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 4096,
    }),
  });

  if (!step1Res.ok) {
    const detail = (await step1Res.text()).slice(0, 800);
    return { ok: false, status: step1Res.status, detail };
  }
  const step1Json = await step1Res.json();
  const description = String(step1Json?.choices?.[0]?.message?.content ?? '').trim();
  const step1UsageVal = chatUsage(step1Json);

  if (!description) {
    return { ok: false, status: 500, detail: 'Step 1 returned empty description' };
  }

  // ── STEP 2: Convert the plain-text description to JSON ──
  // Model now only has to format — spatial reasoning is already done.
  const step2Prompt = [
    'Convert the following timetable description into JSON.',
    'Each line is: DAY | START_TIME-END_TIME | SUBJECT_CODE | ROOM',
    '',
    '=== DESCRIPTION ===',
    description,
    '=== END ===',
    '',
    'Rules:',
    '- Parse each line into one JSON slot object.',
    '- day: full English name (Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday)',
    '- start_time and end_time: 24-hour HH:MM format',
    '- subject_code: the code as written',
    '- subject_name: repeat the subject_code (no full name available)',
    '- location: the room as written, or "-" if dash',
    '- lecturer: "-"',
    '- group: ""',
    '',
    'Return JSON only with this shape:',
    TIMETABLE_JSON_SHAPE,
  ].join('\n');

  const step2Res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: args.model,
      messages: [
        { role: 'system', content: 'You convert timetable descriptions to JSON. Output valid JSON only.' },
        { role: 'user', content: step2Prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 4096,
    }),
  });

  if (!step2Res.ok) {
    const detail = (await step2Res.text()).slice(0, 800);
    return { ok: false, status: step2Res.status, detail };
  }
  const step2Json = await step2Res.json();
  const text = String(step2Json?.choices?.[0]?.message?.content ?? '').trim();
  return { ok: true, text, usage: addUsage(step1UsageVal, chatUsage(step2Json)) };
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const openAiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';

    if (!supabaseUrl || !supabaseAnon) {
      return errorBody('Missing SUPABASE_URL or SUPABASE_ANON_KEY.', 'CONFIG');
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !authData.user) {
      return errorBody('Unauthorized: sign in again and retry.', 'UNAUTHORIZED');
    }
    const userId = authData.user.id;

    // ── Monthly AI token budget check ──
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdminForLimit = serviceRole
      ? createClient(supabaseUrl, serviceRole, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : supabaseUser;
    const monthCheck = await checkMonthlyTokenLimit(supabaseAdminForLimit, userId);
    if (!monthCheck.allowed) {
      return errorBody(formatMonthlyLimitMessage(monthCheck), MONTHLY_LIMIT_ERROR_CODE);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorBody('Invalid JSON body.', 'BAD_REQUEST');
    }

    const fileBase64Raw = String(body?.file_base64 ?? '');
    const mimeType = String(body?.mime_type ?? 'application/pdf').trim().toLowerCase();

    const fileBase64 = stripDataUrl(fileBase64Raw);
    if (!fileBase64) {
      return errorBody('file_base64 is required.', 'BAD_REQUEST');
    }

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(fileBase64);
    } catch {
      return errorBody('Invalid base64 data.', 'BAD_REQUEST');
    }

    if (bytes.length > MAX_BYTES) {
      return errorBody(`File too large (max ${MAX_BYTES} bytes).`, 'TOO_LARGE');
    }

    if (!openAiKey) {
      return errorBody('OPENAI_API_KEY is not set in Edge Function secrets.', 'CONFIG');
    }
    const keyTrim = openAiKey.trim();
    if (/^your_|^sk-your|^placeholder|^changeme/i.test(keyTrim) || keyTrim.length < 20) {
      return errorBody('OPENAI_API_KEY looks invalid or placeholder.', 'CONFIG');
    }

    const pdfModel = (Deno.env.get('OPENAI_TIMETABLE_PDF_MODEL') ?? 'gpt-4o').trim();
    const textModel = (Deno.env.get('OPENAI_TIMETABLE_TEXT_MODEL') ?? 'gpt-4o-mini').trim();
    const imageModel = (Deno.env.get('OPENAI_TIMETABLE_IMAGE_MODEL') ?? 'gpt-4o').trim();

    let modelText = '';
    const isPdf = mimeType === 'application/pdf' || isPdfMagic(bytes);

    if (isPdf) {
      const unpdfText = await extractPdfTextWithUnpdf(bytes);
      const heuristicText = extractPdfText(bytes);
      const looseFallback = bytesToLooseText(bytes);
      const mergedText = pickLongestText(unpdfText, heuristicText, looseFallback);

      if (mergedText.trim().length >= 120) {
        const textRes = await openAiTimetableFromTextChat({
          apiKey: keyTrim,
          model: textModel,
          documentText: mergedText,
        });
        if (!textRes.ok) {
          return errorBody(`OpenAI error ${textRes.status}: ${textRes.detail}`, 'OPENAI');
        }
        logTokenUsage(supabaseAdminForLimit, {
          user_id: userId,
          kind: 'timetable_extract_text',
          model: textModel,
          prompt_tokens: textRes.usage.prompt_tokens || null,
          completion_tokens: textRes.usage.completion_tokens || null,
          total_tokens: textRes.usage.total_tokens || null,
        });
        modelText = textRes.text;
      } else {
        const pdfRes = await openAiTimetableFromPdfNative({
          apiKey: keyTrim,
          model: pdfModel,
          filename: 'timetable.pdf',
          pdfBytes: bytes,
        });
        if (!pdfRes.ok) {
          return errorBody(
            `Could not read this PDF (OpenAI ${pdfRes.status}). Try exporting a text-based PDF or use a screenshot. ${pdfRes.detail.slice(0, 200)}`,
            'PDF_READ',
          );
        }
        logTokenUsage(supabaseAdminForLimit, {
          user_id: userId,
          kind: 'timetable_extract_pdf',
          model: pdfModel,
          prompt_tokens: pdfRes.usage.prompt_tokens || null,
          completion_tokens: pdfRes.usage.completion_tokens || null,
          total_tokens: pdfRes.usage.total_tokens || null,
        });
        modelText = pdfRes.text;
      }
    } else if (
      mimeType === 'image/jpeg' ||
      mimeType === 'image/png' ||
      mimeType === 'image/webp' ||
      mimeType === 'image/gif'
    ) {
      const imgRes = await openAiTimetableFromImage({
        apiKey: keyTrim,
        model: imageModel,
        mime: mimeType,
        base64: fileBase64,
      });
      if (!imgRes.ok) {
        return errorBody(`OpenAI error ${imgRes.status}: ${imgRes.detail}`, 'OPENAI');
      }
      logTokenUsage(supabaseAdminForLimit, {
        user_id: userId,
        kind: 'timetable_extract_image',
        model: imageModel,
        prompt_tokens: imgRes.usage.prompt_tokens || null,
        completion_tokens: imgRes.usage.completion_tokens || null,
        total_tokens: imgRes.usage.total_tokens || null,
      });
      modelText = imgRes.text;
    } else {
      return errorBody(`Unsupported mime_type: ${mimeType}`, 'BAD_REQUEST');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(modelText);
    } catch {
      return errorBody('AI returned invalid JSON.', 'PARSE');
    }

    const slots = normalizeSlots(parsed);
    if (slots.length === 0) {
      return errorBody(
        'No class slots could be extracted. Try a clearer image or a text-based PDF export.',
        'EMPTY_EXTRACTION',
      );
    }

    return jsonResponse({ slots });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return errorBody(message, 'INTERNAL');
  }
});
