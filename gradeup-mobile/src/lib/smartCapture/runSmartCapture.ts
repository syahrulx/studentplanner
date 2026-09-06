import type { Course, Task } from '../../types';
import { getTodayISO } from '../../utils/date';
import { extractTasksFromMessage, type ExtractionError } from '../taskExtraction';
import { readUriAsBase64 } from '../readUriAsBase64';
import { recognizeText } from 'smart-capture';
import type { CaptureSource } from './captureInboxStore';
import { buildReviewItems, cleanOcrText, type ReviewItem } from './captureMatching';

export type { ReviewItem } from './captureMatching';

/**
 * The Smart Capture pipeline: raw shared content in, reviewable tasks out.
 *
 * Text captures skip straight to extraction. Image captures run on-device OCR
 * first (free, offline, and the screenshot never leaves the phone) and only fall
 * back to the server vision model when OCR comes back near-empty.
 */

/** Below this, OCR is treated as a failure worth escalating to the vision model. */
export const MIN_USABLE_OCR_CHARS = 20;

/** Screenshots above this base64 size are not worth uploading to the vision model. */
const MAX_VISION_BASE64_CHARS = 8 * 1024 * 1024;

export type CaptureStep = 'read' | 'extract' | 'match';

export interface SmartCaptureInput {
  source: CaptureSource;
  /** Plain text capture (share of a chat message, or an in-app paste). */
  text?: string;
  /** Local image URI — must already be readable by the app (see importCaptureFile). */
  imageUri?: string;
  /** MIME type reported by the sharer, when it knew one. */
  mime?: string;
}

const EXTENSION_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heic',
};

/**
 * Labels the upload honestly. A HEIC share announced as image/png is rejected
 * by the model after the whole file has already been uploaded.
 */
function mimeTypeFor(uri: string, reported?: string): string {
  if (reported && /^image\/[a-z0-9.+-]+$/i.test(reported)) return reported.toLowerCase();
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MIME_TYPES[extension] ?? 'image/jpeg';
}

export interface SmartCaptureContext {
  courses: Pick<Course, 'id' | 'name'>[];
  tasks: Pick<Task, 'title' | 'dueDate'>[];
  currentWeek: number;
  userId?: string;
  semesterStartISO?: string;
  country?: string;
  /** Send the screenshot to the vision model when on-device OCR is not enough. */
  allowVisionFallback?: boolean;
}

export type SmartCaptureOutcome =
  | { status: 'ok'; items: ReviewItem[]; sourceText: string; usedVision: boolean }
  | { status: 'empty'; reason: 'no_tasks' | 'no_text'; sourceText: string; error?: ExtractionError }
  | { status: 'needs_vision'; sourceText: string; imageUri: string }
  | { status: 'error'; error: ExtractionError; sourceText: string };

let localIdCounter = 0;
function nextLocalId(): string {
  localIdCounter += 1;
  return `sc_item_${localIdCounter}`;
}

function sourceHintFor(source: CaptureSource, viaOcr: boolean): 'whatsapp_share' | 'screenshot_ocr' | 'paste' {
  if (viaOcr) return 'screenshot_ocr';
  return source === 'share' ? 'whatsapp_share' : 'paste';
}

/** Reads text out of a capture, using on-device OCR when it is an image. */
export async function readCaptureText(
  input: SmartCaptureInput,
): Promise<{ text: string; viaOcr: boolean }> {
  if (input.text?.trim()) return { text: input.text.trim(), viaOcr: false };
  if (!input.imageUri) return { text: '', viaOcr: false };

  try {
    const result = await recognizeText(input.imageUri);
    return { text: cleanOcrText(result.text ?? ''), viaOcr: true };
  } catch {
    // A missing module or an unreadable image both mean "no text on device" —
    // the vision fallback decides whether the capture is recoverable.
    return { text: '', viaOcr: true };
  }
}

export async function runSmartCapture(
  input: SmartCaptureInput,
  context: SmartCaptureContext,
  onStep?: (step: CaptureStep) => void,
): Promise<SmartCaptureOutcome> {
  onStep?.('read');
  const { text, viaOcr } = await readCaptureText(input);

  // The character floor only judges OCR quality. Text the student typed or
  // shared is taken at its word — "Quiz Bab 3 Jumaat" is 17 characters and a
  // perfectly good capture.
  const ocrCameUpShort = viaOcr && text.length < MIN_USABLE_OCR_CHARS;
  const shouldUseVision = ocrCameUpShort && !!input.imageUri;

  if (shouldUseVision && !context.allowVisionFallback) {
    return { status: 'needs_vision', sourceText: text, imageUri: input.imageUri! };
  }
  if (!text.trim() && !input.imageUri) {
    return { status: 'empty', reason: 'no_text', sourceText: text };
  }

  let imageBase64: string | undefined;
  let imageMime: string | undefined;
  if (shouldUseVision && input.imageUri) {
    let encoded: string;
    try {
      encoded = await readUriAsBase64(input.imageUri);
    } catch {
      return {
        status: 'error',
        sourceText: text,
        error: { code: 'UNKNOWN', message: 'READ_FAILED' },
      };
    }
    if (encoded.length > MAX_VISION_BASE64_CHARS) {
      // Say so plainly instead of looping the student back to "hard to read",
      // which offers the same vision button that just failed.
      return {
        status: 'error',
        sourceText: text,
        error: { code: 'UNKNOWN', message: 'IMAGE_TOO_LARGE' },
      };
    }
    imageBase64 = encoded;
    imageMime = mimeTypeFor(input.imageUri, input.mime);
  }

  onStep?.('extract');
  const { tasks: extracted, error } = await extractTasksFromMessage({
    // The model still needs a non-empty message; describe the situation rather
    // than sending whitespace when OCR found nothing and the image carries it.
    message: text || 'Read the attached screenshot and extract any academic tasks or deadlines.',
    courses: context.courses,
    todayISO: getTodayISO(),
    currentWeek: context.currentWeek,
    userId: context.userId,
    semesterStartISO: context.semesterStartISO,
    country: context.country,
    sourceHint: sourceHintFor(input.source, viaOcr),
    smartCapture: true,
    imageBase64,
    imageMime,
  });

  if (error && extracted.length === 0) {
    if (error.code === 'NO_TASKS') {
      return { status: 'empty', reason: 'no_tasks', sourceText: text, error };
    }
    return { status: 'error', error, sourceText: text };
  }
  if (extracted.length === 0) {
    return { status: 'empty', reason: 'no_tasks', sourceText: text };
  }

  onStep?.('match');
  const items: ReviewItem[] = buildReviewItems(extracted, context.tasks, () => nextLocalId());

  return { status: 'ok', items, sourceText: text, usedVision: !!imageBase64 };
}
