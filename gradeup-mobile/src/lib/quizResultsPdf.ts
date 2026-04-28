import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { ParticipantAnswer } from '@/src/lib/quizApi';
import type { GeneratedQuizQuestion } from '@/src/lib/studyApi';

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;
/** ~11pt Helvetica fit width on A4 minus margins */
const MAX_CHARS = 88;

/** Standard PDF fonts only support WinAnsi; strip/simplify problematic chars */
function pdfSafe(raw: string, maxLen = 4000): string {
  const s = raw.replace(/\s+/g, ' ').trim().slice(0, maxLen);
  return s.replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '?');
}

function wrapText(text: string, maxChars: number): string[] {
  const safe = pdfSafe(text);
  const words = safe.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w.length > maxChars ? `${w.slice(0, maxChars - 1)}…` : w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function isShortAnswerQuestion(q: GeneratedQuizQuestion): boolean {
  return !q.options || q.options.length === 0;
}

function formatUserPick(q: GeneratedQuizQuestion, ans: ParticipantAnswer | undefined): string {
  if (!ans) return 'No answer recorded';
  if (isShortAnswerQuestion(q)) {
    return '(Short answer — exact wording was not saved for export; marked '
      + (ans.correct ? 'correct' : 'incorrect')
      + ')';
  }
  const i = ans.selectedIndex;
  if (i >= 0 && i < q.options.length) {
    const letter = String.fromCharCode(65 + i);
    return `${letter}. ${pdfSafe(q.options[i], 500)}`;
  }
  return '—';
}

function formatCorrectAnswer(q: GeneratedQuizQuestion): string {
  if (isShortAnswerQuestion(q)) {
    return pdfSafe(q.expectedAnswer?.trim() || '—', 500);
  }
  const ci = q.correctIndex;
  if (ci >= 0 && ci < q.options.length) {
    const letter = String.fromCharCode(65 + ci);
    return `${letter}. ${pdfSafe(q.options[ci], 500)}`;
  }
  return '—';
}

export type QuizPdfMeta = {
  quizType?: string;
  difficulty?: string;
  sourceLabel?: string;
};

type DrawState = {
  pdfDoc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  fontBold: PDFFont;
  lineHeight: number;
};

function ensureLineFits(st: DrawState) {
  if (st.y < MARGIN + st.lineHeight * 2) {
    st.page = st.pdfDoc.addPage([PAGE_W, PAGE_H]);
    st.y = PAGE_H - MARGIN;
  }
}

function drawLine(st: DrawState, text: string, size: number, bold = false) {
  const font = bold ? st.fontBold : st.font;
  const lines = wrapText(text, MAX_CHARS);
  for (const line of lines) {
    ensureLineFits(st);
    st.page.drawText(line, {
      x: MARGIN,
      y: st.y,
      size,
      font,
      color: rgb(0.12, 0.12, 0.14),
    });
    st.y -= Math.max(st.lineHeight, size + 2);
  }
}

function newLine(st: DrawState, gap = 4) {
  st.y -= gap;
}

async function buildQuizPdf(params: {
  questions: GeneratedQuizQuestion[];
  answersByIndex: Map<number, ParticipantAnswer>;
  summary: {
    correctCount: number;
    totalQuestions: number;
    accuracyPct: number | null;
    points: number;
    xp: number;
    avgTimeSec: number | null;
    title?: string;
  };
  meta?: QuizPdfMeta;
}): Promise<Uint8Array> {
  const { questions, answersByIndex, summary, meta } = params;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const lineHeight = 14;
  const st: DrawState = {
    pdfDoc,
    page,
    y: PAGE_H - MARGIN,
    font,
    fontBold,
    lineHeight,
  };

  const title = pdfSafe(summary.title?.trim() || 'Quiz results');
  drawLine(st, title, 18, true);
  newLine(st, 8);

  const metaBits: string[] = [];
  if (meta?.quizType) metaBits.push(`Type: ${pdfSafe(meta.quizType)}`);
  if (meta?.difficulty) metaBits.push(`Difficulty: ${pdfSafe(meta.difficulty)}`);
  if (meta?.sourceLabel) metaBits.push(`Source: ${pdfSafe(meta.sourceLabel)}`);
  metaBits.push(`Generated: ${pdfSafe(new Date().toLocaleString())}`);
  drawLine(st, metaBits.join(' · '), 10);
  newLine(st, 14);

  const acc = summary.accuracyPct !== null ? `${summary.accuracyPct}%` : '—';
  const avg = summary.avgTimeSec !== null ? `${summary.avgTimeSec.toFixed(1)}s` : '—';
  drawLine(st, 'Summary', 13, true);
  newLine(st, 6);
  drawLine(st, `Score: ${summary.correctCount}/${summary.totalQuestions}    Accuracy: ${acc}    Points: ${summary.points}    XP: +${summary.xp}    Avg time / Q: ${avg}`, 11);
  newLine(st, 18);

  drawLine(st, 'Questions', 13, true);
  newLine(st, 10);

  questions.forEach((q, idx) => {
    const ans = answersByIndex.get(idx);
    const userPick = formatUserPick(q, ans);
    const correct = formatCorrectAnswer(q);
    const resultLabel =
      ans === undefined ? '—' : ans.correct ? 'Correct' : 'Wrong';

    drawLine(st, `Question ${idx + 1}`, 12, true);
    newLine(st, 4);
    drawLine(st, pdfSafe(q.question?.trim() || '', 2000), 11);
    newLine(st, 6);
    drawLine(st, `Your answer: ${userPick}`, 11);
    drawLine(st, `Correct answer: ${correct}`, 11);
    drawLine(st, `Result: ${resultLabel}`, 11, true);
    newLine(st, 14);
  });

  return pdfDoc.save();
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return globalThis.btoa(binary);
}

export async function shareQuizResultsPdf(params: {
  questions: GeneratedQuizQuestion[];
  myAnswers: ParticipantAnswer[];
  summary: {
    correctCount: number;
    totalQuestions: number;
    accuracyPct: number | null;
    points: number;
    xp: number;
    avgTimeSec: number | null;
    title?: string;
  };
  meta?: QuizPdfMeta;
}): Promise<void> {
  const answersByIndex = new Map<number, ParticipantAnswer>();
  for (const a of params.myAnswers) {
    answersByIndex.set(a.questionIndex, a);
  }

  const pdfBytes = await buildQuizPdf({
    questions: params.questions,
    answersByIndex,
    summary: params.summary,
    meta: params.meta,
  });

  const baseDir = FileSystem.cacheDirectory;
  if (!baseDir) {
    throw new Error('Cache directory is not available.');
  }

  const uri = `${baseDir}quiz-results-${Date.now()}.pdf`;
  await FileSystem.writeAsStringAsync(uri, uint8ToBase64(pdfBytes), {
    encoding: FileSystem.EncodingType.Base64,
  });

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Share quiz results',
    UTI: 'com.adobe.pdf',
  });
}
