// @ts-nocheck — Deno edge function; runs on Supabase Deno runtime, not the RN TS compiler.
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
  'You extract a university faculty room/building directory from documents and images (floor guides, room signage lists, building maps). Output valid JSON only. Preserve the source language exactly — keep Malay terms like "Aras 1", "Blok A", "Bilik", "Makmal", "Dewan Kuliah". Never invent rooms; only extract entries clearly present in the source.';

const ROOM_JSON_SHAPE =
  '{"rooms":[{"room_code":"DK1","room_label":"Dewan Kuliah 1","building":"Blok A","level":"Aras 1","description":"sebelah tandas, dekat tangga utama"}]}';

function buildRoomPrompt(): string {
  return [
    'Extract every room / lecture hall / lab / facility entry from the faculty directory below.',
    'Return JSON only with shape:',
    ROOM_JSON_SHAPE,
    'Field rules:',
    '- room_code: the short code/identifier as printed (e.g. "DK1", "BK2-3", "MakmalA"). REQUIRED — skip rows with no code.',
    '- room_label: the full friendly name if shown (e.g. "Dewan Kuliah 1"), else "".',
    '- building: block/building name if shown (e.g. "Blok A", "FSKM"), else "".',
    '- level: floor/level if shown (e.g. "Aras 1", "Level 2", "Ground Floor"), else "".',
    '- description: any extra location hint (landmarks, nearby facilities, directions), else "".',
    '- Keep the original wording and language. Do not translate.',
    '- One object per distinct room. Do not duplicate.',
    '',
    '=== DIRECTORY TEXT ===',
  ].join('\n');
}

function buildImagePrompt(): string {
  return [
    'You are looking at a university faculty room directory / floor guide / building map image.',
    'Extract EVERY room, lecture hall, lab, office or facility listed, with where it is located.',
    '',
    'For each entry capture:',
    '- room_code: the short code as printed (e.g. DK1, BK2-3, MakmalA). If an entry has no code, skip it.',
    '- room_label: the full name if shown, else "".',
    '- building: block/building name if shown, else "".',
    '- level: floor/level if shown (e.g. "Aras 1", "Level 2"), else "".',
    '- description: extra location hints (landmarks, nearby facilities), else "".',
    '',
    'Rules:',
    '- Preserve the original language (keep Malay terms like Aras, Blok, Bilik, Makmal, Dewan Kuliah).',
    '- Do NOT invent entries. Only extract what is visible.',
    '- Do NOT duplicate the same room.',
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
    const code = String(r.room_code ?? r.code ?? r.roomCode ?? '').trim();
    if (!code) continue;
    const key = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      room_code: code.slice(0, 60),
      room_label: String(r.room_label ?? r.label ?? r.name ?? '').trim().slice(0, 120),
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
      temperature: 0,
    }),
  });
  if (!res.ok) return { ok: false as const, status: res.status, detail: (await res.text()).slice(0, 800) };
  const aiJson = await res.json();
  return { ok: true as const, text: String(aiJson?.choices?.[0]?.message?.content ?? '').trim(), usage: chatUsage(aiJson) };
}

async function fromPdfNative(args: { apiKey: string; model: string; pdfBytes: Uint8Array }) {
  const b64 = encodeBase64(args.pdfBytes);
  const userText = [buildRoomPrompt(), 'The directory is attached as a PDF. Read it and produce the JSON.'].join('\n');
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${args.apiKey}` },
    body: JSON.stringify({
      model: args.model,
      store: false,
      temperature: 0,
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
        {
          role: 'user',
          content: [
            { type: 'text', text: buildImagePrompt() },
            { type: 'image_url', image_url: { url, detail: 'high' } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 4096,
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

    const pdfModel = (Deno.env.get('OPENAI_ROOMMAP_PDF_MODEL') ?? 'gpt-4o').trim();
    const textModel = (Deno.env.get('OPENAI_ROOMMAP_TEXT_MODEL') ?? 'gpt-4o-mini').trim();
    const imageModel = (Deno.env.get('OPENAI_ROOMMAP_IMAGE_MODEL') ?? 'gpt-4o').trim();

    let modelText = '';
    let pendingUsage: { kind: string; model: string; usage: Usage } | null = null;
    const isPdf = mimeType === 'application/pdf' || isPdfMagic(bytes);

    if (isPdf) {
      const unpdfText = await extractPdfTextWithUnpdf(bytes);
      const heuristicText = extractPdfText(bytes);
      const looseFallback = bytesToLooseText(bytes);
      const mergedText = pickLongestText(unpdfText, heuristicText, looseFallback);

      if (mergedText.trim().length >= 120) {
        const r = await fromTextChat({ apiKey: keyTrim, model: textModel, documentText: mergedText });
        if (!r.ok) return errorBody(`OpenAI error ${r.status}: ${r.detail}`, 'OPENAI');
        pendingUsage = { kind: 'roommap_extract_text', model: textModel, usage: r.usage };
        modelText = r.text;
      } else {
        const r = await fromPdfNative({ apiKey: keyTrim, model: pdfModel, pdfBytes: bytes });
        if (!r.ok) {
          return errorBody(
            `Could not read this PDF (OpenAI ${r.status}). Try a clearer PDF or a photo. ${r.detail.slice(0, 200)}`,
            'PDF_READ',
          );
        }
        pendingUsage = { kind: 'roommap_extract_pdf', model: pdfModel, usage: r.usage };
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
      pendingUsage = { kind: 'roommap_extract_image', model: imageModel, usage: r.usage };
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
        'No rooms could be extracted. Try a clearer photo or a text-based PDF of the directory.',
        'EMPTY_EXTRACTION',
      );
    }

    if (pendingUsage) {
      await logTokenUsage(supabaseAdminForLimit, {
        user_id: userId,
        kind: pendingUsage.kind,
        model: pendingUsage.model,
        prompt_tokens: pendingUsage.usage.prompt_tokens || null,
        completion_tokens: pendingUsage.usage.completion_tokens || null,
        total_tokens: pendingUsage.usage.total_tokens || null,
      });
    }

    return jsonResponse({ rooms });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return errorBody(message, 'INTERNAL');
  }
});
