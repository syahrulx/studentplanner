export type SowExtractedSubject = {
  subject_id: string;
  name: string;
  credit_hours?: number;
  confidence?: number;
};

export type SowExtractedTask = {
  title: string;
  course_id: string;
  type?: string;
  due_date?: string; // YYYY-MM-DD
  due_time?: string; // HH:mm
  priority?: string;
  effort_hours?: number;
  notes?: string;
  deadline_risk?: string;
  suggested_week?: number;
  confidence?: number;
  is_unknown_course?: boolean;
};

export type SowExtractionPayload = {
  importId: string;
  storagePath: string;
  fileName: string;
  extracted: {
    subjects?: SowExtractedSubject[];
    tasks?: SowExtractedTask[];
    raw_text_preview?: string;
    error?: { message: string; code?: string };
  };
};

let pending: SowExtractionPayload | null = null;

export function setPendingSowExtraction(payload: SowExtractionPayload): void {
  pending = payload;
}

export function getPendingSowExtraction(): SowExtractionPayload | null {
  return pending;
}

export function clearPendingSowExtraction(): void {
  pending = null;
}

