/**
 * Streaming client for the `ai_generate` Edge Function (chat only).
 *
 * `supabase.functions.invoke` buffers the whole response, so streaming has to
 * call the function URL directly. React Native's built-in fetch cannot expose a
 * response body stream either, so this uses `expo/fetch`, which returns a real
 * `ReadableStream` on both platforms (Expo SDK 52+).
 *
 * Any failure here is recoverable: callers fall back to the non-streaming
 * `invokeAiGenerate` path, which is still fully supported by the server.
 */
import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';

import { supabase } from './supabase';
import type { AiGenerateRequest } from './invokeAiGenerate';

export type ChatCitation = { note_id: string; title: string };

export interface StreamChatHandlers {
  /** Fires once before any text, carrying citations and the model actually used. */
  onMeta?: (meta: { citations: ChatCitation[]; model: string }) => void;
  /** Fires for every text chunk. Append it to what you already have. */
  onDelta: (text: string) => void;
}

export type StreamChatOutcome =
  | { ok: true; text: string; citations: ChatCitation[]; model: string }
  | { ok: false; error: string; producedText: string };

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl as string | undefined;
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined;

/** Streaming needs a body stream; without it the caller should not even try. */
export function canStreamChat(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && typeof expoFetch === 'function');
}

/**
 * POST a chat request and resolve once the stream completes.
 *
 * Resolves `{ok:false}` rather than throwing so the caller can fall back
 * silently. `producedText` lets a caller keep partial output when the stream
 * dies midway.
 */
export async function streamAiChat(
  body: AiGenerateRequest,
  handlers: StreamChatHandlers,
  signal?: AbortSignal,
): Promise<StreamChatOutcome> {
  let text = '';
  let citations: ChatCitation[] = [];
  let model = '';

  if (!canStreamChat()) {
    return { ok: false, error: 'Streaming is not available on this device.', producedText: '' };
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      return { ok: false, error: 'No active session.', producedText: '' };
    }

    const res = await expoFetch(`${SUPABASE_URL}/functions/v1/ai_generate`, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY as string,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ ...body, stream: true }),
    });

    if (!res.ok) {
      return { ok: false, error: `Request failed (HTTP ${res.status}).`, producedText: '' };
    }

    // The server falls back to a plain JSON body for non-chat kinds and for
    // early errors (auth, quota). Handle that rather than hanging on a reader.
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      const parsed = await res.json().catch(() => null);
      const message = parsed?.error?.message;
      if (message) return { ok: false, error: String(message), producedText: '' };
      const single = parsed?.response;
      if (typeof single === 'string' && single) {
        handlers.onDelta(single);
        return { ok: true, text: single, citations: parsed?.citations ?? [], model: parsed?.model ?? '' };
      }
      return { ok: false, error: 'Unexpected response from the AI service.', producedText: '' };
    }

    const stream = res.body;
    if (!stream) {
      return { ok: false, error: 'This device cannot stream responses.', producedText: '' };
    }

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamError: string | null = null;
    let sawDone = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let cut = buffer.indexOf('\n\n');
        while (cut !== -1) {
          const frame = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          cut = buffer.indexOf('\n\n');

          const line = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;

          let payload: any;
          try {
            payload = JSON.parse(raw);
          } catch {
            continue;
          }

          if (payload.type === 'delta' && typeof payload.text === 'string') {
            text += payload.text;
            handlers.onDelta(payload.text);
          } else if (payload.type === 'meta') {
            citations = Array.isArray(payload.citations) ? payload.citations : [];
            model = typeof payload.model === 'string' ? payload.model : '';
            handlers.onMeta?.({ citations, model });
          } else if (payload.type === 'error') {
            streamError = String(payload.message ?? 'The AI service failed.');
          } else if (payload.type === 'done') {
            sawDone = true;
          }
        }
      }
    } finally {
      reader.releaseLock?.();
    }

    if (streamError) return { ok: false, error: streamError, producedText: text };
    // A stream that ends without `done` was cut off (proxy timeout, network
    // drop). Keep the partial text but report it so the caller can react.
    if (!sawDone && !text) {
      return { ok: false, error: 'The connection dropped before the answer arrived.', producedText: '' };
    }
    return { ok: true, text, citations, model };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: 'aborted', producedText: text };
    }
    return { ok: false, error: err?.message || 'Streaming failed.', producedText: text };
  }
}
