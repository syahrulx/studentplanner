import AsyncStorage from '@react-native-async-storage/async-storage';
import { NOTE_ATTACHMENTS_BUCKET } from './noteStorage';
import { supabase } from './supabase';
import {
  createHandwritingPage,
  isHandwritingTemplate,
  type HandwritingPage,
  type HandwritingStroke,
} from './handwritingTypes';

const CACHE_PREFIX = 'rencana.handwriting.v1';
const STORAGE_FILE = '_handwriting-v1.json';

function cacheKey(userId: string, noteId: string): string {
  return `${CACHE_PREFIX}:${userId}:${noteId}`;
}

function storagePath(userId: string, noteId: string): string {
  return `${userId}/${noteId}/${STORAGE_FILE}`;
}

function safeStrokes(value: unknown): HandwritingStroke[] {
  if (!Array.isArray(value)) return [];
  return value.filter((stroke): stroke is HandwritingStroke => {
    if (!stroke || typeof stroke !== 'object') return false;
    const candidate = stroke as Partial<HandwritingStroke>;
    return (
      typeof candidate.id === 'string' &&
      (candidate.tool === 'pen' || candidate.tool === 'pencil' || candidate.tool === 'highlighter') &&
      typeof candidate.color === 'string' &&
      typeof candidate.width === 'number' &&
      typeof candidate.opacity === 'number' &&
      Array.isArray(candidate.points)
    );
  });
}

function toPage(value: unknown, fallbackIndex: number): HandwritingPage | null {
  if (!value || typeof value !== 'object') return null;
  const page = value as Partial<HandwritingPage>;
  if (typeof page.id !== 'string') return null;
  return {
    id: page.id,
    index: typeof page.index === 'number' ? page.index : fallbackIndex,
    template: isHandwritingTemplate(page.template) ? page.template : 'ruled',
    strokes: safeStrokes(page.strokes),
    pdfPageNumber: typeof page.pdfPageNumber === 'number' ? page.pdfPageNumber : undefined,
    isInsertedBlank: page.isInsertedBlank === true,
    pdfDocumentInitialized: page.pdfDocumentInitialized === true,
    updatedAt: typeof page.updatedAt === 'string' ? page.updatedAt : new Date().toISOString(),
  };
}

function parsePages(value: unknown): HandwritingPage[] {
  const rawPages = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { pages?: unknown }).pages)
      ? (value as { pages: unknown[] }).pages
      : [];
  return rawPages
    .map((page, index) => toPage(page, index))
    .filter((page): page is HandwritingPage => !!page)
    .sort((a, b) => a.index - b.index)
    .map((page, index) => ({ ...page, index }));
}

async function readCache(userId: string, noteId: string): Promise<HandwritingPage[]> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId, noteId));
    return raw ? parsePages(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

async function writeCache(userId: string, noteId: string, pages: HandwritingPage[]): Promise<void> {
  await AsyncStorage.setItem(cacheKey(userId, noteId), JSON.stringify(pages));
}

function latestTimestamp(pages: HandwritingPage[]): number {
  return pages.reduce((latest, page) => Math.max(latest, Date.parse(page.updatedAt) || 0), 0);
}

function asciiArrayBuffer(value: string): ArrayBuffer {
  // Handwriting data contains JSON keys, numbers and hexadecimal colours only.
  // JSON.stringify escapes any unexpected non-ASCII code points in this payload.
  const safeValue = value.replace(/[^\x00-\x7F]/g, (character) => (
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  ));
  const bytes = new Uint8Array(safeValue.length);
  for (let index = 0; index < safeValue.length; index += 1) {
    bytes[index] = safeValue.charCodeAt(index);
  }
  return bytes.buffer;
}

async function readRemote(userId: string, noteId: string): Promise<HandwritingPage[]> {
  const { data, error } = await supabase.storage
    .from(NOTE_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath(userId, noteId), 90);
  if (error || !data?.signedUrl) return [];

  try {
    const response = await fetch(data.signedUrl, { cache: 'no-store' });
    if (!response.ok) return [];
    return parsePages(JSON.parse(await response.text()));
  } catch {
    return [];
  }
}

/**
 * Opens the newest local or cloud copy. The local cache makes pen input safe
 * immediately; the private attachment bucket keeps the editable layer synced
 * without requiring a separate Supabase table or schema migration.
 */
export async function loadHandwritingPages(
  userId: string,
  noteId: string,
): Promise<HandwritingPage[]> {
  const [local, remote] = await Promise.all([
    readCache(userId, noteId),
    readRemote(userId, noteId),
  ]);

  if (!local.length && !remote.length) return [createHandwritingPage(0)];
  if (latestTimestamp(local) > latestTimestamp(remote)) {
    void saveHandwritingPages(userId, noteId, local).catch(() => {});
    return local;
  }

  await writeCache(userId, noteId, remote);
  return remote;
}

export async function saveHandwritingPages(
  userId: string,
  noteId: string,
  pages: HandwritingPage[],
): Promise<void> {
  const normalized = pages.map((page, index) => ({ ...page, index }));

  // Local persistence happens first so a network interruption never loses ink.
  await writeCache(userId, noteId, normalized);

  const payload = JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    pages: normalized,
  });
  const { error } = await supabase.storage
    .from(NOTE_ATTACHMENTS_BUCKET)
    .upload(storagePath(userId, noteId), asciiArrayBuffer(payload), {
      contentType: 'application/json',
      upsert: true,
    });
  if (error) throw error;
}

export async function deleteHandwritingPage(
  userId: string,
  noteId: string,
  pageId: string,
): Promise<void> {
  const cached = await readCache(userId, noteId);
  const remaining = cached
    .filter((page) => page.id !== pageId)
    .map((page, index) => ({ ...page, index }));
  await writeCache(userId, noteId, remaining);
}

export async function deleteHandwritingCache(userId: string, noteId: string): Promise<void> {
  await AsyncStorage.removeItem(cacheKey(userId, noteId));
  await supabase.storage
    .from(NOTE_ATTACHMENTS_BUCKET)
    .remove([storagePath(userId, noteId)])
    .catch(() => {});
}
