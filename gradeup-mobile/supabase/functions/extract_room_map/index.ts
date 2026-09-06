// @ts-nocheck — Deno edge function; runs on Supabase Deno runtime, not the RN TS compiler.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { GEMINI_PREFERRED_MODELS, OPENAI_MODEL_FAST, samplingParams } from '../_shared/models.ts';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { getUserPlanRow } from '../_shared/tokenLimit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_BYTES = 8 * 1024 * 1024;

// Room extraction does NOT spend the monthly AI token budget. Instead it is
// capped by a small number of extractions per calendar month, per plan.
const ROOMMAP_EXTRACT_LIMITS: Record<string, number> = {
  free: 1,
  plus: 3,
  pro: 5,
};
const ROOMMAP_EXTRACT_KIND = 'roommap_extract';
const ROOMMAP_LIMIT_ERROR_CODE = 'ROOMMAP_EXTRACT_LIMIT';

function roomExtractLimitForPlan(plan: string | null | undefined): number {
  const key = (plan ?? 'free').toLowerCase();
  return ROOMMAP_EXTRACT_LIMITS[key] ?? ROOMMAP_EXTRACT_LIMITS.free;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countRoomExtractionsThisMonth(admin: any, userId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  try {
    const { count, error } = await admin
      .from('ai_token_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('kind', ROOMMAP_EXTRACT_KIND)
      .gte('created_at', monthStart);
    if (error) return 0;
    return typeof count === 'number' ? count : 0;
  } catch {
    return 0;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logRoomExtraction(admin: any, userId: string, model: string): Promise<void> {
  try {
    // total_tokens is null on purpose: this row is only an extraction-count
    // marker and must NOT contribute to the monthly AI token budget.
    await admin.from('ai_token_usage').insert({
      user_id: userId,
      kind: ROOMMAP_EXTRACT_KIND,
      model,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
    });
  } catch {
    // best-effort — never surface errors to the caller
  }
}

type RoomRow = {
  room_code: string;
  room_label: string;
  building: string;
  level: string;
  description: string;
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
      if (t.length >= 2 && /[A-Za-z0-9]/.test(t)) parts.push(t);
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

const ROOM_SYSTEM =
  'You extract university room/building information from documents and images: room directories, floor guides, signage lists, and architectural floor plans/maps. Output valid JSON only. Preserve the source language exactly — keep Malay terms like "Aras 1", "Blok A", "Bilik", "Makmal", "Dewan Kuliah", "Pejabat", "Tandas", "Surau". Never invent rooms; only extract entries clearly present in the source.';

const ROOM_JSON_SHAPE =
  '{"rooms":[{"room_code":"DK1","room_label":"Dewan Kuliah 1","building":"Blok A","level":"Aras 1","description":"sebelah tandas, dekat tangga utama"}]}';

function buildRoomPrompt(): string {
  return [
    'Extract every room / lecture hall / lab / office / toilet / surau / facility from the document below.',
    'The source may be a room directory OR extracted text from an architectural floor plan — treat each distinct label as a room.',
    'Return JSON only with shape:',
    ROOM_JSON_SHAPE,
    'Field rules:',
    '- room_code: short code if printed (e.g. "DK1", "TH 1"). If no code, use the label/name (e.g. "Pejabat Pengurusan Pentadbiran FSKM", "Dewan Al-Ghazali").',
    '- room_label: full friendly name if shown, else "".',
    '- building: block/building if shown (e.g. "CS1", "Blok A"), else "".',
    '- level: floor if shown (e.g. "Ground Floor (CS1)", "Aras 1"), else "".',
    '- description: nearby landmarks or adjacent rooms, else "".',
    '- Keep original wording and language. Do not translate.',
    '- One object per distinct room. Do not duplicate.',
    '- Only skip if neither code nor usable name exists.',
    '',
    '=== DOCUMENT TEXT ===',
  ].join('\n');
}

function buildImagePrompt(): string {
  return [
    'You are looking at a university room directory, floor guide, signage board, or architectural FLOOR PLAN / building map.',
    'Read ALL visible text labels on the document (including Malay and diagonal/rotated text), then extract EVERY room, office, lab, hall, toilet, surau, cafe or facility you can identify.',
    '',
    'For floor plans / maps specifically:',
    '- Labels are placed ON the drawing (e.g. "Pejabat Pengurusan Pentadbiran FSKM", "TH 1", "Dewan Al-Ghazali", "Tandas (L)", "Surau (P)", "Cafe", "Laman Najib").',
    '- Extract each labelled space as a separate room, even if there is no short code.',
    '- Use the printed label as room_code when no short code exists (e.g. "TH 1", "Pejabat Pengurusan Pentadbiran FSKM").',
    '- Put the floor title in level if shown (e.g. "Ground Floor (CS1)", "Aras 1").',
    '- Put nearby landmarks or adjacent rooms in description (e.g. "dekat lif", "sebelah surau").',
    '- Ignore watermarks (e.g. PPIM) — they are not rooms.',
    '',
    'For each entry capture:',
    '- room_code: short code if printed, otherwise the room name/label as shown.',
    '- room_label: full name if different from code, else "".',
    '- building: block/building name if shown (e.g. "CS1", "Blok A"), else "".',
    '- level: floor/level if shown (e.g. "Ground Floor (CS1)", "Aras 1"), else "".',
    '- description: extra location hints (landmarks, nearby facilities), else "".',
    '',
    'Rules:',
    '- Preserve the original language. Do NOT translate.',
    '- Do NOT invent entries. Only extract what is visible.',
    '- Do NOT duplicate the same room.',
    '- Only skip an entry if it has neither a code nor any usable name.',
    '- If genuinely unreadable, return {"rooms":[]}.',
    '',
    'Return JSON only with this shape:',
    ROOM_JSON_SHAPE,
  ].join('\n');
}

function normalizeRooms(raw: unknown): RoomRow[] {
  const rooms = Array.isArray((raw as { rooms?: unknown })?.rooms)
    ? ((raw as { rooms: unknown[] }).rooms)
    : Array.isArray(raw)
      ? (raw as unknown[])
      : [];
  const out: RoomRow[] = [];
  const seen = new Set<string>();
  for (const row of rooms) {
    const r = row as Record<string, unknown>;
    const label = String(r.room_label ?? r.label ?? r.name ?? '').trim();
    // Fall back to the room name as the code when no short code was extracted,
    // so clearly-named rooms aren't silently dropped.
    const code = (String(r.room_code ?? r.code ?? r.roomCode ?? '').trim()) || label;
    if (!code) continue;
    const key = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      room_code: code.slice(0, 60),
      room_label: label.slice(0, 120),
      building: String(r.building ?? r.block ?? '').trim().slice(0, 120),
      level: String(r.level ?? r.floor ?? r.aras ?? '').trim().slice(0, 80),
      description: String(r.description ?? r.notes ?? r.hint ?? '').trim().slice(0, 400),
    });
    if (out.length >= 300) break;
  }
  return out;
}

type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };

function chatUsage(aiJson: unknown): Usage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = (aiJson as any)?.usage ?? {};
  return {
    prompt_tokens: Number(u?.prompt_tokens) || 0,
    completion_tokens: Number(u?.completion_tokens) || 0,
    total_tokens: Number(u?.total_tokens) || 0,
  };
}

function responsesUsage(aiJson: unknown): Usage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = (aiJson as any)?.usage ?? {};
  const p = Number(u?.input_tokens ?? u?.prompt_tokens) || 0;
  const c = Number(u?.output_tokens ?? u?.completion_tokens) || 0;
  return { prompt_tokens: p, completion_tokens: c, total_tokens: Number(u?.total_tokens) || p + c };
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

async function fromTextChat(args: { apiKey: string; model: string; documentText: string }) {
  const prompt = `${buildRoomPrompt()}\n${args.documentText.slice(0, 45000)}\n=== END ===`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${args.apiKey}` },
    body: JSON.stringify({
      model: args.model,
      messages: [
        { role: 'system', content: ROOM_SYSTEM },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      ...samplingParams(args.model, { temperature: 0, reasoning: 'none' }),
    }),
  });
  if (!res.ok) return { ok: false as const, status: res.status, detail: (await res.text()).slice(0, 800) };
  const aiJson = await res.json();
  return { ok: true as const, text: String(aiJson?.choices?.[0]?.message?.content ?? '').trim(), usage: chatUsage(aiJson) };
}

async function fromPdfNative(args: { apiKey: string; model: string; pdfBytes: Uint8Array }) {
  const b64 = encodeBase64(args.pdfBytes);
  const userText = [
    buildImagePrompt(),
    'The document is attached as a PDF. It may be a floor plan / architectural map with labels on the drawing — read the visual layout, not just text layers.',
  ].join('\n');
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${args.apiKey}` },
    body: JSON.stringify({
      model: args.model,
      store: false,
      ...samplingParams(args.model, { temperature: 0, reasoning: 'none' }),
      instructions: ROOM_SYSTEM,
      text: { format: { type: 'json_object' } },
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_file', filename: 'directory.pdf', file_data: `data:application/pdf;base64,${b64}` },
            { type: 'input_text', text: userText },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return { ok: false as const, status: res.status, detail: (await res.text()).slice(0, 800) };
  const json = await res.json();
  return { ok: true as const, text: textFromResponsesApi(json), usage: responsesUsage(json) };
}

async function fromImage(args: { apiKey: string; model: string; mime: string; base64: string }) {
  const url = `data:${args.mime};base64,${args.base64}`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${args.apiKey}` },
    body: JSON.stringify({
      model: args.model,
      messages: [
        { role: 'system', content: ROOM_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildImagePrompt() },
            { type: 'image_url', image_url: { url, detail: 'high' } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      ...samplingParams(args.model, { temperature: 0, reasoning: 'none' }),
      max_completion_tokens: 4096,
    }),
  });
  if (!res.ok) return { ok: false as const, status: res.status, detail: (await res.text()).slice(0, 800) };
  const aiJson = await res.json();
  return { ok: true as const, text: String(aiJson?.choices?.[0]?.message?.content ?? '').trim(), usage: chatUsage(aiJson) };
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

    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdminForLimit = serviceRole
      ? createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
      : supabaseUser;

    // Room extraction is free of the monthly AI token budget. It is instead
    // limited to a few extractions per calendar month, depending on plan.
    const planRow = await getUserPlanRow(supabaseAdminForLimit, userId);
    const extractLimit = roomExtractLimitForPlan(planRow.plan);
    const usedExtractions = await countRoomExtractionsThisMonth(supabaseAdminForLimit, userId);
    if (usedExtractions >= extractLimit) {
      return errorBody(
        "You've used all your AI room extractions for now. You can still add rooms manually, or upgrade your plan for more AI extractions.",
        ROOMMAP_LIMIT_ERROR_CODE,
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorBody('Invalid JSON body.', 'BAD_REQUEST');
    }

    const fileBase64 = stripDataUrl(String(body?.file_base64 ?? ''));
    const mimeType = String(body?.mime_type ?? 'application/pdf').trim().toLowerCase();
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

    const pdfModel = (Deno.env.get('OPENAI_ROOMMAP_PDF_MODEL') ?? OPENAI_MODEL_FAST).trim();
    const textModel = (Deno.env.get('OPENAI_ROOMMAP_TEXT_MODEL') ?? OPENAI_MODEL_FAST).trim();
    const imageModel = (Deno.env.get('OPENAI_ROOMMAP_IMAGE_MODEL') ?? OPENAI_MODEL_FAST).trim();

    let modelText = '';
    let usedModel = '';
    const isPdf = mimeType === 'application/pdf' || isPdfMagic(bytes);

    if (isPdf) {
      const unpdfText = await extractPdfTextWithUnpdf(bytes);
      const heuristicText = extractPdfText(bytes);
      const looseFallback = bytesToLooseText(bytes);
      const mergedText = pickLongestText(unpdfText, heuristicText, looseFallback);

      // Floor-plan PDFs often embed label text in random stream order (≥120 chars
      // of gibberish), so the cheap text path returns empty. If text path yields
      // nothing, retry with PDF vision (gpt-4o reads the drawing layout).
      if (mergedText.trim().length >= 120) {
        const r = await fromTextChat({ apiKey: keyTrim, model: textModel, documentText: mergedText });
        if (!r.ok) return errorBody(`OpenAI error ${r.status}: ${r.detail}`, 'OPENAI');
        usedModel = textModel;
        modelText = r.text;
        try {
          const parsed = JSON.parse(modelText);
          if (normalizeRooms(parsed).length === 0) {
            const vr = await fromPdfNative({ apiKey: keyTrim, model: pdfModel, pdfBytes: bytes });
            if (vr.ok && vr.text) {
              usedModel = pdfModel;
              modelText = vr.text;
            }
          }
        } catch {
          const vr = await fromPdfNative({ apiKey: keyTrim, model: pdfModel, pdfBytes: bytes });
          if (vr.ok && vr.text) {
            usedModel = pdfModel;
            modelText = vr.text;
          }
        }
      } else {
        const r = await fromPdfNative({ apiKey: keyTrim, model: pdfModel, pdfBytes: bytes });
        if (!r.ok) {
          return errorBody(
            `Could not read this PDF (OpenAI ${r.status}). Try a clearer PDF or a photo. ${r.detail.slice(0, 200)}`,
            'PDF_READ',
          );
        }
        usedModel = pdfModel;
        modelText = r.text;
      }
    } else if (
      mimeType === 'image/jpeg' ||
      mimeType === 'image/png' ||
      mimeType === 'image/webp' ||
      mimeType === 'image/gif'
    ) {
      const r = await fromImage({ apiKey: keyTrim, model: imageModel, mime: mimeType, base64: fileBase64 });
      if (!r.ok) return errorBody(`OpenAI error ${r.status}: ${r.detail}`, 'OPENAI');
      usedModel = imageModel;
      modelText = r.text;
    } else {
      return errorBody(`Unsupported mime_type: ${mimeType}`, 'BAD_REQUEST');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(modelText);
    } catch {
      return errorBody('AI returned invalid JSON.', 'PARSE');
    }

    const rooms = normalizeRooms(parsed);
    if (rooms.length === 0) {
      return errorBody(
        'No rooms could be extracted. Floor plans work best as a clear photo/PDF — try exporting the map as an image if this keeps failing.',
        'EMPTY_EXTRACTION',
      );
    }

    // Record one extraction-count marker (0 tokens → does not touch the
    // monthly AI token budget). Only successful extractions are counted.
    await logRoomExtraction(supabaseAdminForLimit, userId, usedModel);

    return jsonResponse({ rooms });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return errorBody(message, 'INTERNAL');
  }
});
