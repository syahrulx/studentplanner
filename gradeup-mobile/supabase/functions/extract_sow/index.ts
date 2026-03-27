import { createClient } from 'npm:@supabase/supabase-js@2';

type KnownCourse = { id: string; name: string };

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

function bytesToLooseText(bytes: Uint8Array): string {
  // Minimal fallback extraction: grab printable text chunks from PDF bytes.
  // This is intentionally lightweight for edge runtime compatibility.
  const raw = new TextDecoder('latin1').decode(bytes);
  const parts = raw.match(/[A-Za-z0-9][A-Za-z0-9 .,;:()\-_/]{8,}/g) ?? [];
  return parts.join('\n').slice(0, 60000);
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
  args: { knownCourses: KnownCourse[]; currentWeek: number; todayISO: string }
): { subjects: ExtractedSubject[]; tasks: ExtractedTask[] } {
  const knownMap = new Map(args.knownCourses.map((c) => [c.id.toLowerCase(), c.id]));
  const subjects = (Array.isArray(payload?.subjects) ? payload.subjects : [])
    .map((s: any) => ({
      subject_id: String(s?.subject_id ?? '').trim().toUpperCase(),
      name: String(s?.name ?? '').trim(),
      credit_hours: Number(s?.credit_hours ?? 3) || 3,
      confidence: Number(s?.confidence ?? 0) || undefined,
    }))
    .filter((s: ExtractedSubject) => !!s.subject_id && !!s.name);

  const tasks = (Array.isArray(payload?.tasks) ? payload.tasks : [])
    .map((t: any) => {
      const rawCourse = String(t?.course_id ?? '').trim().toLowerCase();
      const mappedCourse = knownMap.get(rawCourse) ?? rawCourse.toUpperCase() || (args.knownCourses[0]?.id ?? 'GENERAL');
      const dueDate = String(t?.due_date ?? '').slice(0, 10);
      const diff = dueDate ? daysBetween(args.todayISO, dueDate) : 0;
      const suggestedWeek = Number(t?.suggested_week ?? 0) || Math.max(args.currentWeek, args.currentWeek + Math.floor(diff / 7));
      const deadlineRisk = String(t?.deadline_risk ?? '') || computeRisk(diff);
      return {
        title: String(t?.title ?? '').trim(),
        course_id: mappedCourse,
        type: String(t?.type ?? 'Assignment'),
        due_date: dueDate || args.todayISO,
        due_time: String(t?.due_time ?? '23:59').slice(0, 5) || '23:59',
        priority: String(t?.priority ?? 'Medium'),
        effort_hours: Number(t?.effort_hours ?? 2) || 2,
        notes: t?.notes ? String(t.notes) : '',
        deadline_risk: deadlineRisk === 'High' || deadlineRisk === 'Medium' || deadlineRisk === 'Low' ? deadlineRisk : computeRisk(diff),
        suggested_week: suggestedWeek,
        confidence: Number(t?.confidence ?? 0) || undefined,
        is_unknown_course: !knownMap.has(rawCourse),
      } satisfies ExtractedTask;
    })
    .filter((t: ExtractedTask) => !!t.title);

  return { subjects, tasks };
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
    if (!supabaseUrl || !supabaseAnon) throw new Error('Missing Supabase env');

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const storagePath = String(body?.storage_path ?? '').trim();
    const bucket = String(body?.bucket ?? 'sow-files').trim() || 'sow-files';
    const currentWeek = Math.max(1, Number(body?.current_week ?? 1) || 1);
    const todayISO = String(body?.today_iso ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
    const knownCourses: KnownCourse[] = Array.isArray(body?.known_courses) ? body.known_courses : [];
    const importId = String(body?.import_id ?? `sow-${Date.now()}`);
    const fileName = storagePath.split('/').pop() || 'sow.pdf';

    if (!storagePath) {
      throw new Error('storage_path is required');
    }

    await supabase.from('sow_imports').upsert({
      id: importId,
      user_id: authData.user.id,
      file_name: fileName,
      storage_path: storagePath,
      status: 'processing',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id,user_id' });

    const { data: fileData, error: downloadError } = await supabase.storage.from(bucket).download(storagePath);
    if (downloadError || !fileData) {
      throw new Error(downloadError?.message || 'Could not download file');
    }

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    const extractedText = bytesToLooseText(bytes);

    if (!openAiKey) {
      throw new Error('OPENAI_API_KEY is not configured in Supabase secrets.');
    }

    const prompt = [
      'You are an academic SOW parser. Return STRICT JSON only with this shape:',
      '{ "subjects": [{ "subject_id": "...", "name": "...", "credit_hours": 3, "confidence": 0.0 }],',
      '  "tasks": [{ "title":"...", "course_id":"...", "type":"Assignment|Quiz|Project|Lab|Test", "due_date":"YYYY-MM-DD", "due_time":"HH:MM", "priority":"High|Medium|Low", "effort_hours":2, "notes":"...", "confidence":0.0 }] }',
      'If a field is missing, infer conservatively.',
      `Known courses: ${JSON.stringify(knownCourses)}`,
      'Input SOW text:',
      extractedText.slice(0, 40000),
    ].join('\n');

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You extract university subjects and deadlines from SOW documents. Reply with valid JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`OpenAI error ${aiRes.status}: ${errText}`);
    }

    const aiJson = await aiRes.json();
    const rawContent = String(aiJson?.choices?.[0]?.message?.content ?? '{}');
    const parsed = JSON.parse(rawContent);
    const normalized = normalizeOutput(parsed, { knownCourses, currentWeek, todayISO });

    const subjectRows = normalized.subjects.map((s, idx) => ({
      id: `${importId}-subject-${idx + 1}`,
      user_id: authData.user.id,
      sow_import_id: importId,
      item_type: 'subject',
      payload: s,
    }));
    const taskRows = normalized.tasks.map((t, idx) => ({
      id: `${importId}-task-${idx + 1}`,
      user_id: authData.user.id,
      sow_import_id: importId,
      item_type: 'task',
      payload: t,
    }));
    const allRows = [...subjectRows, ...taskRows];
    if (allRows.length > 0) {
      await supabase.from('sow_import_items').upsert(allRows, { onConflict: 'id,user_id' });
    }

    await supabase.from('sow_imports').upsert({
      id: importId,
      user_id: authData.user.id,
      file_name: fileName,
      storage_path: storagePath,
      status: 'review_ready',
      extracted_summary: {
        subject_count: normalized.subjects.length,
        task_count: normalized.tasks.length,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id,user_id' });

    return new Response(JSON.stringify({
      import_id: importId,
      subjects: normalized.subjects,
      tasks: normalized.tasks,
      raw_text_preview: extractedText.slice(0, 1200),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: { message } }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

