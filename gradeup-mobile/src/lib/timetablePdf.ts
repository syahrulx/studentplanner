import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';

import { normalizeClock } from '@/src/lib/lockScreen/lockScreenFormat';
import { getTimetableEntryColor } from '@/src/lib/timetableSlotColors';
import type { DayOfWeek, TimetableEntry } from '@/src/types';

/**
 * The Timetable menu's "Export to PDF": the week on one A4 page, for printing
 * or sending to a group chat. Portrait lays it out like the grid on screen
 * (days across, hours down); landscape turns it on its side (days down, hours
 * across), the same two shapes the old wallpaper download offered.
 *
 * pdf-lib is plain JavaScript, so this needs no native module. Its standard
 * fonts only cover WinAnsi, so text is reduced to that set (see pdfSafe).
 */

export interface TimetablePdfOptions {
  timetable: readonly TimetableEntry[];
  subjectColors: Record<string, string>;
  /** Days in the student's week order; weekends without classes are dropped. */
  days: readonly DayOfWeek[];
  title: string;
  subtitle?: string;
  /** Mirrors the card toggles, so the PDF matches what the grid shows. */
  show: { courseName: boolean; room: boolean; lecturer: boolean; group: boolean };
  /** What the grid prints for a class with no room. */
  onlineLabel: string;
  orientation: TimetablePdfOrientation;
}

export type TimetablePdfOrientation = 'portrait' | 'landscape';

/** A4 in PDF points. */
const A4_SHORT = 595;
const A4_LONG = 842;
const MARGIN = 28;
const HEADER_H = 46;
const FOOTER_H = 16;
/** Portrait: the day names above the columns and the hour labels beside them. */
const DAY_ROW_H = 22;
const GUTTER_W = 40;
/** Landscape: the hour labels above the columns and the day names beside the rows. */
const HOUR_ROW_H = 18;
const DAY_COL_W = 44;

const INK = { r: 0.07, g: 0.09, b: 0.13 };
const MUTED = { r: 0.42, g: 0.45, b: 0.5 };
const LINE = { r: 0.88, g: 0.89, b: 0.91 };

const DAY_SHORT: Record<DayOfWeek, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
};

function pdfSafe(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '?');
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0.39, g: 0.4, b: 0.95 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function minutesOf(value: string): number | null {
  const clock = normalizeClock(value);
  if (!clock) return null;
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
}

/** Cuts text to fit a width, ending in "..." when something was dropped. */
function fit(text: string, font: PDFFont, size: number, maxW: number): string {
  const safe = pdfSafe(text);
  if (font.widthOfTextAtSize(safe, size) <= maxW) return safe;
  let cut = safe;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}...`, size) > maxW) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

function hourLabel(h: number): string {
  const suffix = h < 12 || h === 24 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${suffix}`;
}

async function buildTimetablePdf(opts: TimetablePdfOptions): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const page: PDFPage = pdf.addPage(
    opts.orientation === 'portrait' ? [A4_SHORT, A4_LONG] : [A4_LONG, A4_SHORT],
  );
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const c = (x: { r: number; g: number; b: number }): RGB => rgb(x.r, x.g, x.b);

  const entries = opts.timetable
    .map((e) => ({ e, start: minutesOf(e.startTime), end: minutesOf(e.endTime) }))
    .filter((x): x is { e: TimetableEntry; start: number; end: number } => x.start != null && x.end != null && x.end > x.start);

  const busy = new Set(entries.map((x) => x.e.day));
  const days = opts.days.filter((d) => (d !== 'Saturday' && d !== 'Sunday') || busy.has(d));

  // Hours cover the earliest start to the latest end, never less than 8 AM to 6 PM.
  const firstHour = Math.max(0, Math.min(8, ...entries.map((x) => Math.floor(x.start / 60))));
  const lastHour = Math.min(24, Math.max(18, ...entries.map((x) => Math.ceil(x.end / 60))));
  const hours = lastHour - firstHour;

  const portrait = opts.orientation === 'portrait';
  const pageW = portrait ? A4_SHORT : A4_LONG;
  const pageH = portrait ? A4_LONG : A4_SHORT;

  // Header
  const top = pageH - MARGIN;
  page.drawText(pdfSafe(opts.title), { x: MARGIN, y: top - 18, size: 18, font: bold, color: c(INK) });
  if (opts.subtitle) {
    page.drawText(pdfSafe(opts.subtitle), { x: MARGIN, y: top - 34, size: 9.5, font, color: c(MUTED) });
  }
  const gridTop = top - HEADER_H;
  const gridBottom = MARGIN + FOOTER_H;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: c(LINE) });

  /** Where each class sits, in page points, top-left origin of the block. */
  let place: (dayIndex: number, start: number, end: number) => { x: number; yTop: number; w: number; h: number };

  if (portrait) {
    const gridLeft = MARGIN + GUTTER_W;
    const colW = (pageW - MARGIN - gridLeft) / Math.max(1, days.length);
    const bodyTop = gridTop - DAY_ROW_H;
    const hourH = (bodyTop - gridBottom) / Math.max(1, hours);

    days.forEach((day, i) => {
      page.drawText(DAY_SHORT[day].toUpperCase(), { x: gridLeft + i * colW + 6, y: bodyTop + 7, size: 9, font: bold, color: c(MUTED) });
    });
    for (let i = 0; i <= hours; i++) {
      const y = bodyTop - i * hourH;
      line(gridLeft, y, pageW - MARGIN, y);
      if (i < hours) page.drawText(hourLabel(firstHour + i), { x: MARGIN, y: y - 10, size: 7.5, font, color: c(MUTED) });
    }
    for (let i = 0; i <= days.length; i++) line(gridLeft + i * colW, bodyTop, gridLeft + i * colW, gridBottom);

    place = (dayIndex, start, end) => ({
      x: gridLeft + dayIndex * colW + 2,
      yTop: bodyTop - ((start - firstHour * 60) / 60) * hourH - 1,
      w: colW - 4,
      h: ((end - start) / 60) * hourH - 2,
    });
  } else {
    const gridLeft = MARGIN + DAY_COL_W;
    const hourW = (pageW - MARGIN - gridLeft) / Math.max(1, hours);
    const bodyTop = gridTop - HOUR_ROW_H;
    const rowH = (bodyTop - gridBottom) / Math.max(1, days.length);

    for (let i = 0; i <= hours; i++) {
      const x = gridLeft + i * hourW;
      line(x, bodyTop, x, gridBottom);
      if (i < hours) page.drawText(hourLabel(firstHour + i), { x: x + 3, y: bodyTop + 5, size: 7.5, font, color: c(MUTED) });
    }
    days.forEach((day, i) => {
      const y = bodyTop - i * rowH;
      page.drawText(DAY_SHORT[day].toUpperCase(), { x: MARGIN, y: y - rowH / 2 - 3, size: 9, font: bold, color: c(MUTED) });
    });
    for (let i = 0; i <= days.length; i++) line(gridLeft, bodyTop - i * rowH, pageW - MARGIN, bodyTop - i * rowH);

    place = (dayIndex, start, end) => ({
      x: gridLeft + ((start - firstHour * 60) / 60) * hourW + 1,
      yTop: bodyTop - dayIndex * rowH - 2,
      w: ((end - start) / 60) * hourW - 2,
      h: rowH - 4,
    });
  }

  // Class blocks
  for (const { e, start, end } of entries) {
    const dayIndex = days.indexOf(e.day);
    if (dayIndex < 0) continue;
    const { x, yTop, w, h } = place(dayIndex, start, end);
    const y = yTop - h;
    const color = hexToRgb(getTimetableEntryColor(e, opts.subjectColors));

    page.drawRectangle({ x, y, width: w, height: h, color: c(color), opacity: 0.16 });
    page.drawRectangle({ x, y, width: 2.5, height: h, color: c(color) });

    const lines: { text: string; size: number; font: PDFFont; color: RGB }[] = [];
    const code = (e.displayName?.trim() || e.subjectCode || e.subjectName || '').trim();
    lines.push({ text: code, size: 8.5, font: bold, color: c(INK) });
    if (opts.show.courseName && e.subjectName && e.subjectName !== code) {
      lines.push({ text: e.subjectName, size: 7, font, color: c(INK) });
    }
    lines.push({ text: `${normalizeClock(e.startTime)} - ${normalizeClock(e.endTime)}`, size: 7, font, color: c(MUTED) });
    const location = e.location?.trim();
    const room = location && location !== '-' ? location : opts.onlineLabel;
    if (opts.show.room) lines.push({ text: room, size: 7, font, color: c(MUTED) });
    const lecturer = e.lecturer?.trim();
    if (opts.show.lecturer && lecturer && lecturer !== '-') lines.push({ text: lecturer, size: 7, font, color: c(MUTED) });
    const group = e.group?.trim();
    if (opts.show.group && group && group !== '-') lines.push({ text: group, size: 7, font, color: c(MUTED) });

    // Only as many lines as the block has room for; the code always comes first.
    let cursor = yTop - 10;
    for (const item of lines) {
      if (cursor < y + 2) break;
      page.drawText(fit(item.text, item.font, item.size, w - 9), {
        x: x + 6,
        y: cursor,
        size: item.size,
        font: item.font,
        color: item.color,
      });
      cursor -= item.size + 2.5;
    }
  }

  page.drawText('Made with Rencana', { x: MARGIN, y: MARGIN, size: 7.5, font, color: c(MUTED) });

  return pdf.save();
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return globalThis.btoa(binary);
}

/** Builds the PDF and opens the share sheet (or downloads it on web). */
export async function shareTimetablePdf(opts: TimetablePdfOptions): Promise<void> {
  const bytes = await buildTimetablePdf(opts);
  const fileName = `timetable-${new Date().toISOString().slice(0, 10)}.pdf`;

  if (Platform.OS === 'web') {
    const blob = new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }

  const baseDir = FileSystem.cacheDirectory;
  if (!baseDir) throw new Error('Cache directory is not available.');
  const uri = `${baseDir}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, uint8ToBase64(bytes), { encoding: FileSystem.EncodingType.Base64 });

  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: opts.title });
}
