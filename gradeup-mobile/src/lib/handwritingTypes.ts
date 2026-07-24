export type HandwritingTool = 'pen' | 'pencil' | 'highlighter' | 'eraser';
export type PenStyle = 'fountain' | 'ball' | 'brush';
export type EraserStyle = 'precision' | 'segment' | 'stroke';

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
  tool: Exclude<HandwritingTool, 'eraser'>;
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
  points: HandwritingPoint[];
}

export interface HandwritingPage {
  id: string;
  index: number;
  template: HandwritingTemplate;
  strokes: HandwritingStroke[];
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
