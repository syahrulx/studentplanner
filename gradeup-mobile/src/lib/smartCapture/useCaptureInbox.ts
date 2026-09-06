import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  clearSharedPayloads,
  getResolvedSharedPayloadsAsync,
  getSharedPayloads,
} from 'expo-sharing';
import { consumePendingCapture, importCaptureFile } from 'smart-capture';

import {
  clearActiveCapture,
  getActiveCapture,
  peekCapture,
  promoteCapture,
  setLastConsumedShareKey,
  shareKeyOf,
  subscribeCapture,
  type CaptureRequest,
  type CaptureSource,
} from './captureInboxStore';

/**
 * Turns whatever is waiting in the capture inbox into something the Smart
 * Capture sheet can process: plain text, or a local image URI the app owns.
 *
 * Shared payloads live in native storage until they are cleared, and Android
 * content URIs are only readable while the delivering intent is alive, so the
 * image is imported into app storage before anything is cleared.
 */

export interface CapturePayload {
  kind: 'text' | 'image';
  /** Message body for `text`, local file URI for `image`. */
  value: string;
  /** For images: the MIME type the sharer reported, when it knew one. */
  mime?: string;
}

export interface CaptureInboxState {
  payload: CapturePayload | null;
  source: CaptureSource;
  isLoading: boolean;
  error: Error | null;
  /** Changes when a newer capture replaces the one on screen. */
  captureId: string | null;
  reload: () => void;
}

type ResolvedPayloadLike = {
  value: string;
  shareType: string;
  contentUri?: string | null;
  contentMimeType?: string | null;
  mimeType?: string | null;
};

function firstUsablePayload(resolved: ResolvedPayloadLike[]): CapturePayload | null {
  // Prefer text: sharing a chat message is the common case, and when a share
  // carries both parts, the text is what the student meant to send.
  const text = resolved.find((p) => p.shareType === 'text' && p.value.trim().length > 0);
  if (text) return { kind: 'text', value: text.value.trim() };

  const url = resolved.find((p) => p.shareType === 'url' && p.value.trim().length > 0);
  if (url) return { kind: 'text', value: url.value.trim() };

  const image = resolved.find((p) => p.shareType === 'image');
  const imageUri = image?.contentUri || image?.value;
  if (imageUri) {
    return {
      kind: 'image',
      value: imageUri,
      mime: image?.contentMimeType ?? image?.mimeType ?? undefined,
    };
  }

  return null;
}

async function resolveRequest(request: CaptureRequest | null): Promise<CapturePayload | null> {
  if (request?.text?.trim()) return { kind: 'text', value: request.text.trim() };
  if (request?.imageUri) return { kind: 'image', value: request.imageUri };

  if (request?.source === 'back_tap') {
    const capture = await consumePendingCapture();
    return capture?.uri ? { kind: 'image', value: capture.uri } : null;
  }

  const raw = getSharedPayloads();
  if (raw.length === 0) return null;

  const resolved = (await getResolvedSharedPayloadsAsync()) as unknown as ResolvedPayloadLike[];
  const picked = firstUsablePayload(resolved);
  let payload: CapturePayload | null = picked;
  if (picked?.kind === 'image') {
    // Import before clearing — the Android URI grant dies with the intent and
    // the iOS copy sits outside the app sandbox.
    payload = { ...picked, value: await importCaptureFile(picked.value) };
  }
  setLastConsumedShareKey(shareKeyOf(raw));
  clearSharedPayloads();
  return payload;
}

export function useCaptureInbox(): CaptureInboxState {
  const pending = useSyncExternalStore(subscribeCapture, peekCapture, peekCapture);
  const initial = getActiveCapture() ?? pending;
  const [state, setState] = useState<Omit<CaptureInboxState, 'reload'>>({
    payload: null,
    source: initial?.source ?? 'share',
    isLoading: true,
    error: null,
    captureId: initial?.id ?? null,
  });

  const aliveRef = useRef(true);
  // Tracks the capture this sheet actually showed, so unmount only discards
  // that one and a capture that landed mid-close is handed back to the launcher.
  const lastHandledRef = useRef<string | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearActiveCapture(lastHandledRef.current ?? undefined);
    };
  }, []);

  const load = useCallback(async (request: CaptureRequest | null) => {
    const source = request?.source ?? 'share';
    setState((prev) => ({
      ...prev,
      source,
      isLoading: true,
      error: null,
      captureId: request?.id ?? prev.captureId,
    }));

    try {
      const payload = await resolveRequest(request);
      if (!aliveRef.current) return;
      setState((prev) => ({ ...prev, payload, source, isLoading: false, error: null }));
    } catch (e) {
      if (!aliveRef.current) return;
      setState((prev) => ({
        ...prev,
        payload: null,
        source,
        isLoading: false,
        error: e instanceof Error ? e : new Error('Could not read the shared content'),
      }));
    }
  }, []);

  // Runs on mount, and again when a second share lands while the sheet is open
  // (the launcher deliberately does not push a second route for that).
  useEffect(() => {
    const request = promoteCapture();
    const key = request?.id ?? 'none';
    if (lastHandledRef.current === key) return;
    lastHandledRef.current = key;
    void load(request);
  }, [pending, load]);

  const reload = useCallback(() => {
    lastHandledRef.current = null;
    void load(getActiveCapture());
  }, [load]);

  return { ...state, reload };
}
