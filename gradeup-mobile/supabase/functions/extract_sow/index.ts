import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

type ExtractedSubject = {
  subject_id: string;
  name: string;
  credit_hours?: number;
  confidence?: number;
};

type ExtractedTask = {
  title: string;
  course_id: string;
  type?: string;
  due_date?: string;
  due_time?: string;
  priority?: string;
  effort_hours?: number;
  notes?: string;
  deadline_risk?: string;
  suggested_week?: number;
  confidence?: number;
  is_unknown_course?: boolean;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Use 200 + { error } so mobile clients get a body (avoids opaque "non-2xx" from some SDK paths). */
function errorBody(message: string, code?: string) {
  return jsonResponse({ error: { message, code } }, 200);
}

/** Fallback: pull printable runs from raw bytes (weak for compressed PDFs). */
function bytesToLooseText(bytes: Uint8Array): string {
  const raw = new TextDecoder('latin1').decode(bytes);
  const parts = raw.match(/[A-Za-z0-9][A-Za-z0-9 .,;:()\-_/]{3,}/g) ?? [];
  return parts.join('\n').slice(0, 80000);
}

/**
 * Pull text from common PDF literal strings `( ... )` in content streams, plus loose ASCII runs.
 * Many academic PDFs are uncompressed enough for this to outperform regex-only scraping.
 */
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

/** Real PDF text via PDF.js (unpdf) — reads FlateDecode streams; heuristic scraper often fails on modern PDFs. */
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

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`);
  const to = new Date(`${toISO}T00:00:00`);
  const delta = to.getTime() - from.getTime();
  return Math.floor(delta / 86400000);
}

function computeRisk(diffDays: number): 'High' | 'Medium' | 'Low' {
  if (diffDays <= 2) return 'High';
  if (diffDays <= 7) return 'Medium';
  return 'Low';
}

function normalizeOutput(
  payload: any,
  args: { currentWeek: number; todayISO: string }
): { subjects: ExtractedSubject[]; tasks: ExtractedTask[] } {
  const subjects = (Array.isArray(payload?.subjects) ? payload.subjects : [])
    .map((s: any) => ({
      subject_id: String(
        s?.subject_id ?? s?.subject_code ?? s?.code ?? s?.course_code ?? s?.id ?? ''
      )
        .trim()
        .toUpperCase(),
      name: String(s?.name ?? s?.title ?? s?.subject_name ?? s?.course_name ?? '').trim(),
      credit_hours: Number(s?.credit_hours ?? 3) || 3,
      confidence: Number(s?.confidence ?? 0) || undefined,
    }))
    .filter((s: ExtractedSubject) => !!s.subject_id && !!s.name);

  const extractedSubjectIds = new Set(subjects.map((s) => s.subject_id.toUpperCase()));

  const tasks = (Array.isArray(payload?.tasks) ? payload.tasks : [])
    .map((t: any) => {
      const rawCourse = String(t?.course_id ?? '').trim().toUpperCase();
      const courseId = rawCourse || (subjects[0]?.subject_id ?? 'GENERAL');
      const dueDate = String(t?.due_date ?? '').slice(0, 10);
      const diff = dueDate ? daysBetween(args.todayISO, dueDate) : 0;
      const suggestedWeek = Number(t?.suggested_week ?? 0) || Math.max(args.currentWeek, args.currentWeek + Math.floor(diff / 7));
      const deadlineRisk = String(t?.deadline_risk ?? '') || computeRisk(diff);
      return {
        title: String(t?.title ?? '').trim(),
        course_id: courseId,
        type: String(t?.type ?? 'Assignment'),
        due_date: dueDate || args.todayISO,
        due_time: String(t?.due_time ?? '23:59').slice(0, 5) || '23:59',
        priority: String(t?.priority ?? 'Medium'),
        effort_hours: Number(t?.effort_hours ?? 2) || 2,
        notes: t?.notes ? String(t.notes) : '',
        deadline_risk: deadlineRisk === 'High' || deadlineRisk === 'Medium' || deadlineRisk === 'Low' ? deadlineRisk : computeRisk(diff),
        suggested_week: suggestedWeek,
        confidence: Number(t?.confidence ?? 0) || undefined,
        is_unknown_course: !extractedSubjectIds.has(courseId),
      } satisfies ExtractedTask;
    })
    .filter((t: ExtractedTask) => !!t.title);

  return { subjects, tasks };
}

const MAX_PDF_BYTES_NATIVE = 24 * 1024 * 1024;

function isPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

/** Concatenate assistant text from a /v1/responses body. */
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

const SYSTEM_INSTRUCTIONS =
  'You parse university Scheme of Work (SOW) documents. Extract subjects and tasks that appear in the attached document; use exact course codes from the document. Do not invent courses that are not in the document. Reply with valid JSON only, matching the requested shape.';

function buildExtractionRulesBlock(): string {
  return [
    'You are an academic Scheme of Work (SOW) parser.',
    'CRITICAL: Extract ONLY information that is explicitly written in the document. Do NOT invent, guess, or copy from any other source.',
    'Return STRICT JSON with this shape:',
    '{ "subjects": [{ "subject_id": "CSC301", "name": "Data Structures", "credit_hours": 3, "confidence": 0.9 }],',
    '  "tasks": [{ "title":"Assignment 1", "course_id":"CSC301", "type":"Assignment|Quiz|Project|Lab|Test", "due_date":"YYYY-MM-DD", "due_time":"HH:MM", "priority":"High|Medium|Low", "effort_hours":2, "notes":"", "confidence": 0.9 }] }',
    '',
    'Rules:',
    '- subject_id = the SHORT course/subject code in the document (e.g. CSC259, LCC222, TMC401). If you see codes like these, you MUST list them in subjects with a sensible name from nearby text.',
    '- Extract tasks for every assignment, quiz, test, lab, project, or deadline mentioned with a date or week number.',
    '- course_id in each task must match a subject_id you listed.',
    '- Messy line breaks are normal — read across lines to recover table rows and schedules.',
    '- If dates are "Week 5" style, infer YYYY-MM-DD from context or use a reasonable date in the current semester.',
    '- If a task has no clear date, still include it with your best-guess due_date or the week midpoint.',
    '- Prefer partial extraction over empty: return subjects/tasks for anything clearly in the document, even if incomplete.',
  ].join('\n');
}

async function openAiExtractViaPdfNative(args: {
  apiKey: string;
  model: string;
  filename: string;
  pdfBytes: Uint8Array;
}): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
  const b64 = encodeBase64(args.pdfBytes);
  const userText = [
    buildExtractionRulesBlock(),
    '',
    'The Scheme of Work is attached as a PDF. Read it (text and layout) and produce the JSON.',
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
      instructions: SYSTEM_INSTRUCTIONS,
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
  return { ok: true, text: textFromResponsesApi(json) };
}

async function openAiExtractViaTextChat(args: {
  apiKey: string;
  model: string;
  documentText: string;
}): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
  const prompt = [
    buildExtractionRulesBlock(),
    '',
    '=== DOCUMENT TEXT (extracted from PDF) ===',
    args.documentText.slice(0, 40000),
    '=== END OF DOCUMENT ===',
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: args.model,
      messages: [
        {
          role: 'system',
          content:
            'You parse university Scheme of Work documents from noisy PDF text. Extract subjects and tasks that appear in the provided text; use exact course codes from the document. Do not invent courses that are not in the text. Reply with valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.0,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 800);
    return { ok: false, status: res.status, detail };
  }

  const aiJson = await res.json();
  const text = String(aiJson?.choices?.[0]?.message?.content ?? '').trim();
  return { ok: true, text };
}

function tryNormalizeFromModelJson(
  raw: string,
  ctx: { currentWeek: number; todayISO: string }
): { subjects: ExtractedSubject[]; tasks: ExtractedTask[] } | null {
  try {
    return normalizeOutput(JSON.parse(raw), ctx);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const openAiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';

    if (!supabaseUrl || !supabaseAnon) {
      return errorBody('Missing SUPABASE_URL or SUPABASE_ANON_KEY in Edge Function environment.', 'CONFIG');
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !authData.user) {
      return errorBody('Unauthorized: sign in again and retry.', 'UNAUTHORIZED');
    }

    const userId = authData.user.id;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorBody('Invalid JSON body.', 'BAD_REQUEST');
    }

    const storagePath = String(body?.storage_path ?? '').trim();
    const bucket = String(body?.bucket ?? 'sow-files').trim() || 'sow-files';
    const currentWeek = Math.max(1, Number(body?.current_week ?? 1) || 1);
    const todayISO = String(body?.today_iso ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
    const importId = String(body?.import_id ?? `sow-${Date.now()}`);
    const fileName = storagePath.split('/').pop() || 'sow.pdf';

    if (!storagePath) {
      return errorBody('storage_path is required.', 'BAD_REQUEST');
    }

    if (!storagePath.startsWith(`${userId}/`)) {
      return errorBody('Invalid storage path for this user.', 'FORBIDDEN');
    }

    const { error: importUpsertError } = await supabaseUser.from('sow_imports').upsert({
      id: importId,
      user_id: userId,
      file_name: fileName,
      storage_path: storagePath,
      status: 'processing',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id,user_id' });

    if (importUpsertError) {
      return errorBody(`sow_imports: ${importUpsertError.message}`, 'DB');
    }

    let fileData: Blob | null = null;
    let downloadError: Error | null = null;

    if (serviceRole) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRole, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const dl = await supabaseAdmin.storage.from(bucket).download(storagePath);
      fileData = dl.data;
      downloadError = dl.error;
    } else {
      const dl = await supabaseUser.storage.from(bucket).download(storagePath);
      fileData = dl.data;
      downloadError = dl.error;
    }

    if (downloadError || !fileData) {
      return errorBody(
        downloadError?.message || 'Could not download file from storage (check bucket, path, and policies).',
        'STORAGE'
      );
    }

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    const unpdfText = await extractPdfTextWithUnpdf(bytes);
    const heuristicText = extractPdfText(bytes);
    const looseFallback = bytesToLooseText(bytes);
    const mergedText = pickLongestText(unpdfText, heuristicText, looseFallback);

    if (!openAiKey) {
      return errorBody('OPENAI_API_KEY is not set in Edge Function secrets.', 'CONFIG');
    }
    const keyTrim = openAiKey.trim();
    if (/^your_|^sk-your|^placeholder|^changeme/i.test(keyTrim) || keyTrim.length < 20) {
      return errorBody(
        'OPENAI_API_KEY looks like a placeholder. Set a real key: `npx supabase secrets set OPENAI_API_KEY=sk-...` (Dashboard → Project Settings → Edge Functions → Secrets). App .env EXPO_PUBLIC_OPENAI_API_KEY is not used here.',
        'CONFIG'
      );
    }

    const textForModel = mergedText.trim();
    const pdfModel = (Deno.env.get('OPENAI_SOW_MODEL') ?? 'gpt-4o').trim();
    const textModel = (Deno.env.get('OPENAI_SOW_TEXT_MODEL') ?? 'gpt-4o-mini').trim();
    const normCtx = { currentWeek, todayISO };

    let normalized: { subjects: ExtractedSubject[]; tasks: ExtractedTask[] } | null = null;
    let extractionMode: 'pdf_native' | 'text_chat' = 'text_chat';

    const canTryPdfNative =
      isPdfMagic(bytes) && bytes.length > 0 && bytes.length <= MAX_PDF_BYTES_NATIVE;

    if (canTryPdfNative) {
      const pdfRes = await openAiExtractViaPdfNative({
        apiKey: keyTrim,
        model: pdfModel,
        filename: fileName,
        pdfBytes: bytes,
      });
      if (pdfRes.ok && pdfRes.text) {
        const n = tryNormalizeFromModelJson(pdfRes.text, normCtx);
        if (n && (n.subjects.length > 0 || n.tasks.length > 0)) {
          normalized = n;
          extractionMode = 'pdf_native';
        }
      } else if (!pdfRes.ok) {
        console.error('extract_sow: OpenAI Responses (PDF) failed:', pdfRes.status, pdfRes.detail);
      }
    } else if (bytes.length > MAX_PDF_BYTES_NATIVE && isPdfMagic(bytes)) {
      console.warn(
        `extract_sow: PDF exceeds ${MAX_PDF_BYTES_NATIVE} bytes; skipping native PDF model input (text extraction only).`
      );
    }

    if (!normalized) {
      if (textForModel.length < 120) {
        const hint = canTryPdfNative
          ? ' Native PDF parsing was attempted but produced nothing usable, and almost no text could be extracted locally.'
          : '';
        return errorBody(
          `Almost no readable text was found in this PDF.${hint} Scanned (image-only) PDFs, password-protected files, or heavy compression often cause this. Fix: open the SOW in Word/Google Docs and use Save as PDF / Print to PDF so text is embedded.`,
          'PDF_TEXT'
        );
      }

      const textRes = await openAiExtractViaTextChat({
        apiKey: keyTrim,
        model: textModel,
        documentText: textForModel,
      });
      if (!textRes.ok) {
        return errorBody(`OpenAI error ${textRes.status}: ${textRes.detail}`, 'OPENAI');
      }
      const n = tryNormalizeFromModelJson(textRes.text, normCtx);
      if (!n) {
        return errorBody('AI returned invalid JSON. Try another PDF or simplify the document.', 'PARSE');
      }
      normalized = n;
      extractionMode = 'text_chat';
    }

    if (normalized.subjects.length === 0 && normalized.tasks.length === 0) {
      if (textForModel.length < 400) {
        return errorBody(
          'Not enough text was recovered from the PDF for the model to find subjects or tasks. Try a text-based PDF export.',
          'PDF_TEXT'
        );
      }
      const preview = textForModel.slice(0, 400).replace(/\s+/g, ' ');
      return errorBody(
        `The model returned no subjects or tasks (mode: ${extractionMode}). First 400 chars of locally extracted text: "${preview}"… If this looks like gibberish, the PDF text layer may be broken — the app now sends the PDF directly to the model when possible; redeploy extract_sow and ensure OPENAI_SOW_MODEL supports file input (default gpt-4o). Image-only scans still need OCR or a text export.`,
        'EMPTY_EXTRACTION'
      );
    }

    const subjectRows = normalized.subjects.map((s, idx) => ({
      id: `${importId}-subject-${idx + 1}`,
      user_id: userId,
      sow_import_id: importId,
      item_type: 'subject',
      payload: s,
    }));
    const taskRows = normalized.tasks.map((t, idx) => ({
      id: `${importId}-task-${idx + 1}`,
      user_id: userId,
      sow_import_id: importId,
      item_type: 'task',
      payload: t,
    }));
    const allRows = [...subjectRows, ...taskRows];
    if (allRows.length > 0) {
      const { error: itemsError } = await supabaseUser.from('sow_import_items').upsert(allRows, { onConflict: 'id,user_id' });
      if (itemsError) {
        return errorBody(`sow_import_items: ${itemsError.message}`, 'DB');
      }
    }

    const { error: finalImportError } = await supabaseUser.from('sow_imports').upsert({
      id: importId,
      user_id: userId,
      file_name: fileName,
      storage_path: storagePath,
      status: 'review_ready',
      extracted_summary: {
        subject_count: normalized.subjects.length,
        task_count: normalized.tasks.length,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id,user_id' });

    if (finalImportError) {
      return errorBody(`sow_imports finalize: ${finalImportError.message}`, 'DB');
    }

    return jsonResponse({
      import_id: importId,
      subjects: normalized.subjects,
      tasks: normalized.tasks,
      extraction_mode: extractionMode,
      raw_text_preview: textForModel.slice(0, 1200),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return errorBody(message, 'INTERNAL');
  }
});
