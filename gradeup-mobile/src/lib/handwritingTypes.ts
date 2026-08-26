export type HandwritingTool = 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'lasso';
export type PenStyle = 'fountain' | 'ball' | 'brush';
export type EraserStyle = 'precision' | 'segment' | 'stroke';
export type WritingStyle = 'natural' | 'neat' | 'precise';
export type WritingGuide = 'off' | 'baseline' | 'slant';

export interface HandwritingToolSettings {
  penStyle: PenStyle;
  smoothing: number;
  stabilization: number;
  pressureSensitivity: number;
  tipSharpness: number;
  taperedEnds: boolean;
  pencilSoftness: number;
  pencilOpacity: number;
  markerOpacity: number;
  straightMarker: boolean;
  eraserStyle: EraserStyle;
  eraserSize: number;
  eraseHighlighterOnly: boolean;
  /** Hold a nearly straight stroke briefly to snap it into a clean line. */
  shapeAssist: boolean;
  /** A friendly stabilization preset; it never converts handwriting into typed text. */
  writingStyle: WritingStyle;
  /** Optional non-exported guide shown over the paper while writing. */
  writingGuide: WritingGuide;
  /** Double-tap the paper with a stylus to switch between eraser and the last writing tool. */
  stylusDoubleTap: boolean;
}

export type HandwritingTemplate =
  | 'blank'
  | 'ruled'
  | 'grid'
  | 'dots'
  | 'cornell'
  | 'dark';

export interface HandwritingPoint {
  /** Normalized page coordinate from 0 to 1. */
  x: number;
  /** Normalized page coordinate from 0 to 1. */
  y: number;
  /** Normalized stylus pressure from 0 to 1 when the device provides it. */
  pressure?: number;
}

export interface HandwritingStroke {
  id: string;
  tool: 'pen' | 'pencil' | 'highlighter';
  color: string;
  width: number;
  opacity: number;
  penStyle?: PenStyle;
  smoothing?: number;
  stabilization?: number;
  pressureSensitivity?: number;
  tipSharpness?: number;
  taperedEnds?: boolean;
  pencilSoftness?: number;
  writingStyle?: WritingStyle;
  points: HandwritingPoint[];
}

export interface HandwritingElement {
  id: string;
  type: 'text' | 'image';
  /** Normalized page frame so objects survive rotation, tablets and PDF export. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  text?: string;
  color?: string;
  /** Normalized against page height. */
  fontSize?: number;
  /** Private note-attachment path. Never persist a short-lived signed URL. */
  storagePath?: string;
  /** Keeps a newly inserted image visible until its private upload is available. */
  localUri?: string;
  updatedAt: string;
}

export interface HandwritingPage {
  id: string;
  index: number;
  template: HandwritingTemplate;
  strokes: HandwritingStroke[];
  /** Movable text and image objects layered above the paper. */
  elements?: HandwritingElement[];
  /** OCR index for this page. Ink remains the source of truth. */
  recognizedText?: string;
  /**
   * When set, this page is an annotation layer for the matching PDF page.
   * The original PDF remains in the private note attachment bucket.
   */
  pdfPageNumber?: number;
  /** True for a user-created paper page inserted between PDF pages. */
  isInsertedBlank?: boolean;
  /** Marks that the editable PDF page order has been initialized and may intentionally omit source pages. */
  pdfDocumentInitialized?: boolean;
  updatedAt: string;
}

export const HANDWRITING_PAGE_ASPECT_RATIO = 3 / 4;
export const HANDWRITING_CONTENT_PREFIX = '[Rencana Handwriting]';
export const DEFAULT_HANDWRITING_TOOL_SETTINGS: HandwritingToolSettings = {
  penStyle: 'fountain',
  smoothing: 0.45,
  stabilization: 0.35,
  pressureSensitivity: 0.5,
  tipSharpness: 0.5,
  taperedEnds: true,
  pencilSoftness: 0.5,
  pencilOpacity: 0.72,
  markerOpacity: 0.28,
  straightMarker: false,
  eraserStyle: 'stroke',
  eraserSize: 0.025,
  eraseHighlighterOnly: false,
  shapeAssist: true,
  writingStyle: 'natural',
  writingGuide: 'off',
  stylusDoubleTap: true,
};

export function handwritingNoteSummary(pageCount: number): string {
  return `${HANDWRITING_CONTENT_PREFIX} · ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`;
}

export function isHandwritingNoteContent(content: unknown): boolean {
  return typeof content === 'string' && content.startsWith(HANDWRITING_CONTENT_PREFIX);
}

export function displayHandwritingSummary(content: string): string {
  return content.startsWith(HANDWRITING_CONTENT_PREFIX)
    ? `Handwritten notebook${content.slice(HANDWRITING_CONTENT_PREFIX.length)}`
    : content;
}

export function createHandwritingPage(
  index: number,
  template: HandwritingTemplate = 'ruled',
  pdfPageNumber?: number,
): HandwritingPage {
  return {
    id: `hp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    index,
    template,
    strokes: [],
    elements: [],
    pdfPageNumber,
    updatedAt: new Date().toISOString(),
  };
}

export function isHandwritingTemplate(value: unknown): value is HandwritingTemplate {
  return (
    value === 'blank' ||
    value === 'ruled' ||
    value === 'grid' ||
    value === 'dots' ||
    value === 'cornell' ||
    value === 'dark'
  );
}
