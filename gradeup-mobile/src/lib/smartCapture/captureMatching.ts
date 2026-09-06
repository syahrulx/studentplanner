import type { TaskExtractionDTO } from '../taskExtraction';

/**
 * Pure helpers for the Smart Capture pipeline.
 *
 * Deliberately free of React Native and native-module imports so the logic can
 * be exercised by tests/smartCapture.test.ts under plain Node.
 */

export interface ReviewItem extends TaskExtractionDTO {
  localId: string;
  selected: boolean;
  /** A task with the same title and due date is already in the planner. */
  alreadyExists: boolean;
}

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Key used to spot a task the student already has. */
export function taskKey(title: string, dueDate: string | null | undefined): string {
  return `${normalizeTitle(title)}|${dueDate ?? ''}`;
}

/**
 * Pairs extracted tasks with the planner so duplicates arrive pre-unchecked
 * instead of quietly doubling up a deadline the student already added.
 */
export function buildReviewItems(
  extracted: TaskExtractionDTO[],
  existingTasks: { title: string; dueDate: string }[],
  makeId: (index: number) => string = (i) => `sc_item_${i}`,
): ReviewItem[] {
  const existing = new Set(existingTasks.map((task) => taskKey(task.title, task.dueDate)));

  return extracted.map((dto, index) => {
    const alreadyExists = existing.has(taskKey(dto.title, dto.due_date));
    return {
      ...dto,
      localId: makeId(index),
      alreadyExists,
      selected: !alreadyExists,
    };
  });
}

// ---------------------------------------------------------------------------
// OCR clean-up
// ---------------------------------------------------------------------------

/**
 * Lines that are pure chat chrome. Only whole-line matches are dropped: a
 * timestamp inside a sentence ("submit by 11:59 PM") is a real deadline and
 * must survive, so nothing is stripped from within a line.
 */
const CHROME_LINE_PATTERNS: RegExp[] = [
  // A bubble timestamp on its own: "10:32", "10:32 AM", "22:41 ✓✓", "9.30 pm".
  // A dotted form only counts as a time when am/pm or a tick follows it —
  // otherwise "12.03" is a date (12 March) and must survive.
  /^\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?[\s✓✔☑»]*$/i,
  /^\d{1,2}\.\d{2}\s*(?:[ap]\.?m\.?[\s✓✔☑»]*|[\s]*[✓✔☑»]+)$/i,
  /^(forwarded|diteruskan)$/i,
  // "Edited 2:59 PM ✓" — the edit marker travels with the bubble timestamp.
  /^(edited|disunting)\s+\d{1,2}[:.]\d{2}\s*(?:[ap]\.?m\.?)?[\s✓✔☑»]*$/i,
  /^(edited|disunting)$/i,
  /^(you|anda)?\s*(reacted|bertindak balas)\b.*$/i,
  /^(this message was deleted|mesej ini telah dipadam)$/i,
  /^(online|typing\.{0,3}|sedang menaip\.{0,3}|last seen.*)$/i,
  // Status bar leftovers: "9:41 ▮▮▮", battery/signal glyphs alone
  /^[▮▯▪▫■□•·|\s]+$/,
  /^[✓✔☑»]+$/,
];

/**
 * Tidies on-device OCR output before it reaches the model.
 *
 * Conservative on purpose: whole chrome lines go, everything else is preserved
 * verbatim. The server prompt handles the noise this cannot safely remove.
 */
export function cleanOcrText(raw: string): string {
  const lines = raw
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').trim())
    .filter((line) => !CHROME_LINE_PATTERNS.some((pattern) => pattern.test(line)));

  const collapsed: string[] = [];
  for (const line of lines) {
    // Never let more than one blank line through — OCR loves inserting them
    // and they eat the model's context for nothing.
    if (line === '' && collapsed[collapsed.length - 1] === '') continue;
    collapsed.push(line);
  }

  return collapsed.join('\n').trim();
}
