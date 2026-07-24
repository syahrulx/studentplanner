import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { getNoteAttachmentUrl } from './noteStorage';
import type { HandwritingPage, HandwritingStroke } from './handwritingTypes';

const DEFAULT_PAGE_WIDTH = 612;
const DEFAULT_PAGE_HEIGHT = 816;

function colorFromHex(hex: string) {
  const normalized = hex.replace('#', '').trim();
  const value = normalized.length === 3
    ? normalized.split('').map((part) => `${part}${part}`).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  const parsed = Number.parseInt(value, 16);
  if (!Number.isFinite(parsed)) return rgb(0.08, 0.1, 0.15);
  return rgb(
    ((parsed >> 16) & 255) / 255,
    ((parsed >> 8) & 255) / 255,
    (parsed & 255) / 255,
  );
}

function drawTemplate(page: PDFPage, template: HandwritingPage['template']): void {
  if (template === 'blank') return;
  const { width, height } = page.getSize();
  const lineColor = template === 'dark' ? rgb(0.25, 0.29, 0.36) : rgb(0.83, 0.86, 0.91);
  const background = template === 'dark' ? rgb(0.08, 0.1, 0.15) : rgb(1, 1, 1);
  page.drawRectangle({ x: 0, y: 0, width, height, color: background });

  if (template === 'dots') {
    for (let x = 28; x < width; x += 24) {
      for (let y = 28; y < height; y += 24) {
        page.drawCircle({ x, y, size: 0.8, color: lineColor, opacity: 0.65 });
      }
    }
    return;
  }

  if (template === 'grid') {
    for (let x = 24; x < width; x += 24) {
      page.drawLine({ start: { x, y: 0 }, end: { x, y: height }, color: lineColor, thickness: 0.5 });
    }
  }

  for (let y = 32; y < height; y += 26) {
    page.drawLine({ start: { x: 0, y }, end: { x: width, y }, color: lineColor, thickness: 0.55 });
  }

  if (template === 'cornell') {
    page.drawLine({
      start: { x: width * 0.28, y: 0 },
      end: { x: width * 0.28, y: height },
      color: rgb(0.91, 0.38, 0.38),
      thickness: 0.8,
    });
    page.drawLine({
      start: { x: 0, y: height * 0.18 },
      end: { x: width, y: height * 0.18 },
      color: lineColor,
      thickness: 0.8,
    });
  }
}

function drawStroke(page: PDFPage, stroke: HandwritingStroke): void {
  if (stroke.points.length === 0) return;
  const { width, height } = page.getSize();
  const color = colorFromHex(stroke.color);

  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    page.drawCircle({
      x: point.x * width,
      y: height - point.y * height,
      size: Math.max(0.8, stroke.width * 0.45),
      color,
      opacity: stroke.opacity,
    });
    return;
  }

  for (let index = 1; index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1];
    const current = stroke.points[index];
    const pressure = Math.max(0.25, ((previous.pressure ?? 0.55) + (current.pressure ?? 0.55)) / 2);
    page.drawLine({
      start: { x: previous.x * width, y: height - previous.y * height },
      end: { x: current.x * width, y: height - current.y * height },
      color,
      opacity: stroke.opacity,
      thickness: stroke.tool === 'highlighter'
        ? stroke.width * 1.9
        : stroke.width * (0.72 + pressure * 0.55),
      lineCap: 1,
    });
  }
}

function safeFileName(title: string): string {
  const cleaned = title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  return `${cleaned || 'Rencana-Notes'}.pdf`;
}

export async function exportHandwritingPdf(options: {
  title: string;
  pages: HandwritingPage[];
  attachmentPath?: string;
}): Promise<string> {
  const { title, pages, attachmentPath } = options;
  let document: PDFDocument;

  if (attachmentPath) {
    const { url, error } = await getNoteAttachmentUrl(attachmentPath);
    if (error || !url) throw error ?? new Error('Could not access the attached PDF.');
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not download the attached PDF.');
    const sourceDocument = await PDFDocument.load(await response.arrayBuffer());
    document = await PDFDocument.create();
    for (const handwrittenPage of pages) {
      let pdfPage: PDFPage;
      if (handwrittenPage.pdfPageNumber != null) {
        const sourceIndex = handwrittenPage.pdfPageNumber - 1;
        if (sourceIndex < 0 || sourceIndex >= sourceDocument.getPageCount()) continue;
        const [copiedPage] = await document.copyPages(sourceDocument, [sourceIndex]);
        pdfPage = document.addPage(copiedPage);
      } else {
        pdfPage = document.addPage([DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT]);
        drawTemplate(pdfPage, handwrittenPage.template);
      }
      handwrittenPage.strokes.forEach((stroke) => drawStroke(pdfPage, stroke));
    }
  } else {
    document = await PDFDocument.create();
    for (const handwrittenPage of pages) {
      const pdfPage = document.addPage([DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT]);
      drawTemplate(pdfPage, handwrittenPage.template);
      handwrittenPage.strokes.forEach((stroke) => drawStroke(pdfPage, stroke));
    }
  }

  if (document.getPageCount() === 0) {
    const pdfPage = document.addPage([DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT]);
    const firstPage = pages[0];
    if (firstPage) {
      drawTemplate(pdfPage, firstPage.template);
      firstPage.strokes.forEach((stroke) => drawStroke(pdfPage, stroke));
    }
  }

  const base64 = await document.saveAsBase64();
  const outputPath = `${FileSystem.cacheDirectory}${safeFileName(title)}`;
  await FileSystem.writeAsStringAsync(outputPath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(outputPath, {
      mimeType: 'application/pdf',
      dialogTitle: `Export ${title}`,
      UTI: 'com.adobe.pdf',
    });
  }
  return outputPath;
}
