import { decode } from 'base64-arraybuffer';
import { FunctionsHttpError } from '@supabase/functions-js';
import { supabase } from './supabase';
import { showMonthlyLimitAlert, isMonthlyLimitError } from './aiLimitError';
import { readUriAsBase64 } from './readUriAsBase64';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CampusRoom {
  id: string;
  room_code: string;
  room_label: string | null;
  building: string | null;
  level: string | null;
  description: string | null;
  campus: string | null;
  faculty: string | null;
  source: 'pdf' | 'photo' | 'manual';
  source_file_url: string | null;
  upvote_count: number;
  downvote_count: number;
  verified: boolean;
  /** -1, 0, or 1 — the caller's own accuracy vote. */
  my_vote: number;
  is_mine: boolean;
  created_at: string;
}

export interface MatchedRoom {
  id: string;
  room_code: string;
  room_label: string | null;
  building: string | null;
  level: string | null;
  description: string | null;
  campus: string | null;
  faculty: string | null;
  verified: boolean;
  source: 'pdf' | 'photo' | 'manual' | null;
  source_file_url: string | null;
}

/** True when the matched room has an uploaded PDF directory reference. */
export function isCampusRoomPdfRef(room: Pick<MatchedRoom, 'source' | 'source_file_url'>): boolean {
  if (room.source === 'pdf') return true;
  const url = (room.source_file_url ?? '').toLowerCase();
  return url.includes('.pdf');
}

/** A row extracted by AI, before the user reviews & saves it. */
export interface ExtractedRoom {
  room_code: string;
  room_label: string;
  building: string;
  level: string;
  description: string;
}

export type RoomReportReason = 'incorrect' | 'duplicate' | 'spam' | 'other';

function toErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: string }).message);
  }
  return 'Something went wrong. Please try again.';
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function fetchCampusRooms(options?: {
  campus?: string | null;
  search?: string | null;
  faculty?: string | null;
}): Promise<CampusRoom[]> {
  const { campus = null, search = null, faculty = null } = options ?? {};
  const { data, error } = await supabase.rpc('get_campus_rooms', {
    p_campus: campus,
    p_search: search,
    p_faculty: faculty,
  });
  if (error) throw new Error(toErrorMessage(error));
  return (data ?? []) as CampusRoom[];
}

/** Faculties registered for the caller's university + (optional) campus. */
export async function fetchCampusFaculties(campus?: string | null): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_campus_faculties', {
    p_campus: campus ?? null,
  });
  if (error) throw new Error(toErrorMessage(error));
  return ((data ?? []) as { name: string }[])
    .map((r) => (r?.name ?? '').trim())
    .filter((n) => n.length > 0);
}

/** Register a new faculty under the caller's campus. Returns the stored name. */
export async function addCampusFaculty(name: string, campus?: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('add_campus_faculty', {
    p_name: name.trim(),
    p_campus: campus ?? null,
  });
  if (error) throw new Error(toErrorMessage(error));
  return String(data ?? name).trim();
}

/**
 * Strip common Malay/English room-type prefix words so that
 * "Bilik BK31", "Bilik kuliah BK31", "Dewan BK31" etc. all reduce
 * to just the room code ("BK31") before being sent to the database.
 * The DB _norm_room function then normalises case/punctuation as usual.
 *
 * This is a client-side pre-pass; the DB match_room still handles its
 * own normalisation, so this does NOT break rooms that are stored
 * without a prefix.
 *
 * Exported so the campus-map search screen can apply the same stripping
 * before filtering the local room list.
 */
export function stripRoomPrefixes(text: string): string {
  // List of prefix words to strip (case-insensitive, whole words)
  const PREFIXES = [
    'bilik', 'dewan', 'makmal', 'lab', 'laboratory',
    'kuliah', 'tutorial', 'kelas', 'class', 'room'
  ];
  
  let cleaned = (text ?? '').trim();
  
  // Repeatedly strip matching prefixes from the start
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of PREFIXES) {
      // Regex matches prefix at start of string, followed by space or punctuation
      const regex = new RegExp(`^${prefix}\\b\\s*`, 'i');
      if (regex.test(cleaned)) {
        cleaned = cleaned.replace(regex, '').trim();
        changed = true;
      }
    }
  }
  
  return cleaned || text; // fallback to original if stripped everything
}

/** Best matching room for a free-text timetable room string, or null. */
export async function matchRoom(roomText: string): Promise<MatchedRoom | null> {
  const trimmed = stripRoomPrefixes(roomText);
  if (!trimmed || trimmed === '-') return null;
  const { data, error } = await supabase.rpc('match_room', { p_room_text: trimmed });
  if (error) throw new Error(toErrorMessage(error));
  const rows = (data ?? []) as MatchedRoom[];
  return rows[0] ?? null;
}

// ─── Write ──────────────────────────────────────────────────────────────────

/** Bulk-save a reviewed batch of extracted rooms. Returns number saved. */
export async function saveExtractedRooms(
  rooms: ExtractedRoom[],
  source: 'pdf' | 'photo' = 'pdf',
  sourceFileUrl?: string | null,
  faculty?: string | null,
): Promise<number> {
  const clean = rooms
    .map((r) => ({
      room_code: (r.room_code ?? '').trim(),
      room_label: (r.room_label ?? '').trim(),
      building: (r.building ?? '').trim(),
      level: (r.level ?? '').trim(),
      description: (r.description ?? '').trim(),
    }))
    .filter((r) => r.room_code.length > 0);
  if (clean.length === 0) return 0;
  const { data, error } = await supabase.rpc('upsert_campus_rooms', {
    p_rows: clean,
    p_source: source,
    p_source_file_url: sourceFileUrl ?? null,
    p_faculty: faculty ?? null,
  });
  if (error) throw new Error(toErrorMessage(error));
  return Number(data) || 0;
}

export async function createCampusRoom(input: {
  roomCode: string;
  roomLabel?: string;
  building?: string;
  level?: string;
  description?: string;
  faculty?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_campus_room', {
    p_room_code: input.roomCode.trim(),
    p_room_label: input.roomLabel?.trim() || null,
    p_building: input.building?.trim() || null,
    p_level: input.level?.trim() || null,
    p_description: input.description?.trim() || null,
    p_source_file_url: null,
    p_faculty: input.faculty?.trim() || null,
  });
  if (error) throw new Error(toErrorMessage(error));
  return String(data);
}

export async function updateCampusRoom(
  id: string,
  input: { roomLabel?: string; building?: string; level?: string; description?: string },
): Promise<void> {
  const { error } = await supabase.rpc('update_campus_room', {
    p_id: id,
    p_room_label: input.roomLabel?.trim() || null,
    p_building: input.building?.trim() || null,
    p_level: input.level?.trim() || null,
    p_description: input.description?.trim() || null,
  });
  if (error) throw new Error(toErrorMessage(error));
}

export async function deleteCampusRoom(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_campus_room', { p_id: id });
  if (error) throw new Error(toErrorMessage(error));
}

export interface RoomVoteResult {
  upvote_count: number;
  downvote_count: number;
  verified: boolean;
  my_vote: number;
}

/** vote: 1 = accurate, -1 = wrong, 0 = clear vote. */
export async function voteCampusRoom(id: string, vote: 1 | -1 | 0): Promise<RoomVoteResult> {
  const { data, error } = await supabase.rpc('vote_campus_room', { p_id: id, p_vote: vote });
  if (error) throw new Error(toErrorMessage(error));
  const rows = (data ?? []) as RoomVoteResult[];
  return rows[0] ?? { upvote_count: 0, downvote_count: 0, verified: false, my_vote: vote };
}

export async function reportCampusRoom(
  roomId: string,
  reason: RoomReportReason = 'incorrect',
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('campus_room_reports')
    .insert({ room_id: roomId, reporter_id: user.id, reason });
  if (error) {
    if (error.code === '23505') return; // duplicate report → treat as success
    throw new Error(toErrorMessage(error));
  }
}

// ─── Source file upload (optional verification image/PDF) ─────────────────────

export async function uploadDirectoryFile(uri: string, isPdf: boolean): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const ext = isPdf ? 'pdf' : 'jpg';
    const fileName = `${user.id}/${Date.now()}.${ext}`;
    const base64 = await readUriAsBase64(uri);
    const arrayBuffer = decode(base64);
    const { error } = await supabase.storage
      .from('campus-directories')
      .upload(fileName, arrayBuffer, {
        contentType: isPdf ? 'application/pdf' : 'image/jpeg',
        upsert: false,
      });
    if (error) throw error;
    const { data } = supabase.storage.from('campus-directories').getPublicUrl(fileName);
    return data.publicUrl;
  } catch {
    // Source-file upload is best-effort; extraction still works without it.
    return null;
  }
}

// ─── AI extraction (edge function) ────────────────────────────────────────────

export interface ExtractRoomsResult {
  rooms: ExtractedRoom[];
  error?: { message: string; code?: string };
}

/** Calls the extract_room_map edge function with a base64 PDF/image. */
export async function extractRoomsFromFile(payload: {
  file_base64: string;
  mime_type: string;
}): Promise<ExtractRoomsResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return { rooms: [], error: { message: 'No valid session. Sign in again and retry.', code: 'NO_SESSION' } };
  }

  try {
    const { data, error, response } = await supabase.functions.invoke('extract_room_map', {
      body: payload,
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let body: Record<string, unknown> | null = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;

    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      const raw = await res.text();
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = { error: { message: raw.slice(0, 400) || `HTTP ${res.status}`, code: 'INVALID_RESPONSE' } };
      }
    } else if (error) {
      return { rooms: [], error: { message: toErrorMessage(error), code: 'INVOKE_FAILED' } };
    }

    const fnErr = body?.error as { message?: string; code?: string } | undefined;
    if (fnErr?.message) {
      if (isMonthlyLimitError(fnErr as never)) showMonthlyLimitAlert();
      return { rooms: [], error: { message: fnErr.message, code: fnErr.code } };
    }

    const rooms = Array.isArray(body?.rooms) ? (body!.rooms as ExtractedRoom[]) : [];
    void response;
    return { rooms };
  } catch (e) {
    return { rooms: [], error: { message: toErrorMessage(e), code: 'INVOKE_FAILED' } };
  }
}
