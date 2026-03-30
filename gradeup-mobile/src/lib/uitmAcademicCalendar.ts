import type { AcademicCalendar, AcademicPeriod, AcademicPeriodType } from '@/src/types';

const HEA_CALENDAR_URL = 'https://hea.uitm.edu.my/index.php/calendars/academic-calendar';

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDdMmmmYyyy(s: string): Date | null {
  const t = s.replace(/\s+/g, ' ').trim();
  const m = t.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monName = m[2].toLowerCase();
  const year = parseInt(m[3], 10);
  const months: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    // common abbreviations
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  };
  const mon = months[monName];
  if (mon == null) return null;
  const d = new Date(year, mon, day);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseDateRange(raw: string): { start: string; end: string } | null {
  const s = raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  // Examples: "6 October – 23 November 2025" / "24 – 30 November 2025"
  // Normalize dash
  const cleaned = s.replace(/[–—]/g, '-');
  const parts = cleaned.split('-').map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) return null;

  const left = parts[0].replace(/^[^0-9]*/g, '').trim();
  const right = parts[1].replace(/^[^0-9]*/g, '').replace(/\[[^\]]*\]\s*$/g, '').trim();

  // Case A: left has full date, right has full date
  const d1 = parseDdMmmmYyyy(left);
  const d2 = parseDdMmmmYyyy(right);
  if (d1 && d2) return { start: iso(d1), end: iso(d2) };

  // Case B: left is day-only, right is full date (same month+year)
  const leftDay = left.match(/^(\d{1,2})$/);
  if (leftDay && d2) {
    const day = parseInt(leftDay[1], 10);
    const d0 = new Date(d2.getFullYear(), d2.getMonth(), day);
    if (!Number.isNaN(d0.getTime())) return { start: iso(d0), end: iso(d2) };
  }

  // Case C: left is "DD Month" (no year), right is full date (use right's year)
  const leftNoYear = left.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (leftNoYear && d2) {
    const day = parseInt(leftNoYear[1], 10);
    const monName = leftNoYear[2];
    const withYear = `${day} ${monName} ${d2.getFullYear()}`;
    const d0 = parseDdMmmmYyyy(withYear);
    if (d0) return { start: iso(d0), end: iso(d2) };
  }

  return null;
}

function inferType(label: string): AcademicPeriodType {
  const l = label.toLowerCase();
  if (l.includes('lecture') || l.includes('kuliah')) return 'lecture';
  if (l.includes('registration') || l.includes('pendaftaran')) return 'registration';
  if (l.includes('test') || l.includes('ujian')) return 'test';
  if (l.includes('revision') || l.includes('ulangkaji')) return 'revision';
  if (l.includes('examination') || l.includes('exam') || l.includes('peperiksaan')) return 'exam';
  if (l.includes('break') || l.includes('cuti')) {
    if (l.includes('special') || l.includes('khas') || l.includes('perayaan')) return 'special_break';
    return 'break';
  }
  return 'other';
}

function extractGroupSection(html: string, group: 'A' | 'B'): string | null {
  const hay = html;
  const want = group === 'B' ? 'B' : 'A';

  // Try a few robust markers (English + Malay) and ignore session year changes.
  const patterns: RegExp[] = [
    // "SUMMARY SCHEDULE FOR SESSION 2025/2026: GROUP B"
    new RegExp(String.raw`SUMMARY\s+SCHEDULE[\s\S]{0,120}?GROUP\s+${want}`, 'i'),
    // "GROUP B" / "GROUP A"
    new RegExp(String.raw`GROUP\s+${want}\b`, 'i'),
    // Malay "KUMPULAN B" / "KUMPULAN A"
    new RegExp(String.raw`KUMPULAN\s+${want}\b`, 'i'),
  ];

  for (const re of patterns) {
    const m = re.exec(hay);
    if (m && typeof m.index === 'number' && m.index >= 0) {
      return hay.slice(m.index);
    }
  }
  return null;
}

function stripTags(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPeriodsFromSection(sectionHtml: string): AcademicPeriod[] {
  const periods: AcademicPeriod[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(sectionHtml)) !== null) {
    const rowHtml = m[1];
    const tds = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((x) => stripTags(x[1]));
    if (tds.length < 2) continue;

    const label = tds[0];
    const dateCell = tds[1];
    if (!label || !dateCell) continue;
    if (/activity/i.test(label) && /date/i.test(dateCell)) continue;

    const range = parseDateRange(dateCell);
    if (!range) continue;

    periods.push({
      type: inferType(label),
      label,
      startDate: range.start,
      endDate: range.end,
    });
  }
  return periods;
}

/**
 * Extract periods grouped by HEA term/semester code (e.g. [20262]) by splitting the section
 * HTML into blocks between term headings.
 */
function extractPeriodsByTermCode(sectionHtml: string): Record<string, AcademicPeriod[]> {
  const codes = extractTermCodesFromHtml(sectionHtml);
  if (codes.length === 0) return {};

  const out: Record<string, AcademicPeriod[]> = {};
  // Find each occurrence of [#####] and take until next term heading.
  const re = /\[(\d{5})\]/g;
  const hits: { code: string; idx: number }[] = [];
  for (const m of sectionHtml.matchAll(re)) {
    if (m[1] && typeof m.index === 'number') hits.push({ code: m[1], idx: m.index });
  }
  if (hits.length === 0) return {};

  for (let i = 0; i < hits.length; i++) {
    const { code, idx } = hits[i];
    const end = i + 1 < hits.length ? hits[i + 1].idx : sectionHtml.length;
    const block = sectionHtml.slice(idx, end);
    const periods = extractPeriodsFromSection(block);
    if (periods.length > 0) out[code] = periods;
  }
  return out;
}

function teachingBounds(periods: AcademicPeriod[]): { startDate: string; endDate: string } | null {
  const lecture = periods.filter((p) => p.type === 'lecture');
  if (lecture.length === 0) return null;
  const starts = lecture.map((p) => p.startDate).sort();
  const ends = lecture.map((p) => p.endDate).sort();
  return { startDate: starts[0], endDate: ends[ends.length - 1] };
}

function toDate(isoStr: string): Date | null {
  const s = (isoStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sortPeriods(periods: AcademicPeriod[]): AcademicPeriod[] {
  return [...periods].sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
}

function isSemesterBreak(p: AcademicPeriod): boolean {
  const label = String(p.label || '').toLowerCase();
  return p.type === 'break' && label.includes('semester break');
}

/**
 * Split periods into semester "segments" separated by Semester Break.
 * We keep the break in the preceding segment so ranges are continuous.
 */
function splitIntoSegments(periods: AcademicPeriod[]): AcademicPeriod[][] {
  const sorted = sortPeriods(periods);
  const segments: AcademicPeriod[][] = [];
  let cur: AcademicPeriod[] = [];
  for (const p of sorted) {
    cur.push(p);
    if (isSemesterBreak(p)) {
      segments.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) segments.push(cur);
  return segments.filter((seg) => seg.some((p) => p.type === 'lecture'));
}

function segmentBounds(seg: AcademicPeriod[]): { start: string; end: string } | null {
  const starts: string[] = [];
  const ends: string[] = [];
  for (const p of seg) {
    const s = String(p.startDate).slice(0, 10);
    const e = String(p.endDate).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) starts.push(s);
    if (/^\d{4}-\d{2}-\d{2}$/.test(e)) ends.push(e);
  }
  if (starts.length === 0 || ends.length === 0) return null;
  starts.sort();
  ends.sort();
  return { start: starts[0], end: ends[ends.length - 1] };
}

function pickSegmentForDate(segments: AcademicPeriod[][], targetISO?: string): AcademicPeriod[] | null {
  const target = toDate(targetISO || iso(new Date()));
  if (!target || segments.length === 0) return segments[0] ?? null;

  const byBounds = segments
    .map((seg) => ({ seg, b: segmentBounds(seg) }))
    .filter((x): x is { seg: AcademicPeriod[]; b: { start: string; end: string } } => Boolean(x.b));

  // Prefer the segment that contains target date.
  for (const x of byBounds) {
    const s = toDate(x.b.start);
    const e = toDate(x.b.end);
    if (s && e && target.getTime() >= s.getTime() && target.getTime() <= e.getTime()) return x.seg;
  }

  // Otherwise pick the next upcoming segment (closest start after target), else the most recent past.
  const future = byBounds
    .map((x) => ({ ...x, s: toDate(x.b.start)! }))
    .filter((x) => x.s.getTime() > target.getTime())
    .sort((a, b) => a.s.getTime() - b.s.getTime());
  if (future.length > 0) return future[0].seg;

  const past = byBounds
    .map((x) => ({ ...x, s: toDate(x.b.start)! }))
    .filter((x) => x.s.getTime() <= target.getTime())
    .sort((a, b) => b.s.getTime() - a.s.getTime());
  return past[0]?.seg ?? byBounds[0]?.seg ?? null;
}

function extractTermCodes(periods: AcademicPeriod[]): string[] {
  const codes = new Set<string>();
  for (const p of periods) {
    const label = String(p.label || '');
    for (const m of label.matchAll(/\((\d{5})\)/g)) {
      if (m[1]) codes.add(m[1]);
    }
  }
  return [...codes].sort();
}

function extractTermCodesFromHtml(sectionHtml: string): string[] {
  const codes = new Set<string>();
  for (const m of sectionHtml.matchAll(/\[(\d{5})\]/g)) {
    if (m[1]) codes.add(m[1]);
  }
  for (const m of sectionHtml.matchAll(/\((\d{5})\)/g)) {
    if (m[1]) codes.add(m[1]);
  }
  return [...codes].sort();
}

function segmentHasTermCode(seg: AcademicPeriod[], code: string): boolean {
  const want = String(code || '').trim();
  if (!/^\d{5}$/.test(want)) return false;
  return seg.some((p) => {
    const label = String(p.label || '');
    return label.includes(`(${want})`) || label.includes(`[${want}]`);
  });
}

export async function fetchUitmAcademicCalendarTermCodes(group: 'A' | 'B'): Promise<string[]> {
  const res = await fetch(HEA_CALENDAR_URL);
  if (!res.ok) return [];
  const html = await res.text();
  const section = extractGroupSection(html, group);
  if (!section) return [];
  const fromHtml = extractTermCodesFromHtml(section);
  if (fromHtml.length > 0) return fromHtml;
  const allPeriods = extractPeriodsFromSection(section);
  return extractTermCodes(allPeriods);
}

function pickSegmentForTermCode(segments: AcademicPeriod[][], code: string): AcademicPeriod[] | null {
  const want = String(code || '').trim();
  if (!/^\d{5}$/.test(want)) return null;

  // First: exact match if any period label contains the code.
  const direct = segments.find((seg) => segmentHasTermCode(seg, want));
  if (direct) return direct;

  // Fallback: infer typical UiTM term windows from last digit:
  // - ...4 : Oct–Feb (session I)
  // - ...2 : Mar–Aug (session II)
  // - ...3 : intersession (usually Aug–Sep-ish)
  const year = parseInt(want.slice(0, 4), 10);
  const slot = want.slice(-1);
  const monthRanges: Record<string, { min: number; max: number }> = {
    '4': { min: 8, max: 10 }, // Sep–Nov start
    '2': { min: 2, max: 4 },  // Mar–May start
    '3': { min: 6, max: 8 },  // Jul–Sep start
  };
  const range = monthRanges[slot];
  if (!range) return null;

  const scored = segments
    .map((seg) => {
      const b = segmentBounds(seg);
      if (!b) return null;
      const sd = toDate(b.start);
      if (!sd) return null;
      const y = sd.getFullYear();
      const m = sd.getMonth(); // 0-based
      const inYear = y === year;
      const inRange = m >= range.min && m <= range.max;
      const score = (inYear ? 10 : 0) + (inRange ? 5 : 0) - Math.abs(m - Math.round((range.min + range.max) / 2));
      return { seg, score };
    })
    .filter((x): x is { seg: AcademicPeriod[]; score: number } => Boolean(x))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.seg ?? null;
}

function deriveUitmTermCodeFromDate(targetISO?: string): string | null {
  const d = toDate(targetISO || iso(new Date()));
  if (!d) return null;
  const y = d.getFullYear();
  const m = d.getMonth(); // 0=Jan

  // UiTM pattern (typical):
  // - Session I (Oct–Feb) => YYYY4 (year is the Oct year, so Jan/Feb uses previous year)
  // - Session II (Mar–Aug) => YYYY2
  // - Intersession (Aug–Sep-ish) => YYYY3
  if (m <= 1) return `${y - 1}4`;        // Jan/Feb belong to previous Oct term
  if (m >= 2 && m <= 7) return `${y}2`;  // Mar–Aug
  if (m === 8) return `${y}3`;           // Sep (often intersession)
  if (m === 7) return `${y}2`;           // Aug still session II by default
  if (m === 9 || m === 10 || m === 11) return `${y}4`; // Oct–Dec
  return null;
}

/**
 * Fetch UiTM official academic calendar periods from HEA and return a calendar object.
 * This is a best-effort parser; if HEA HTML changes, we fall back to null.
 */
export async function fetchUitmAcademicCalendar(
  group: 'A' | 'B',
  options?: { targetDateISO?: string; preferredTermCode?: string },
): Promise<Pick<AcademicCalendar, 'semesterLabel' | 'startDate' | 'endDate' | 'totalWeeks' | 'periods'> | null> {
  const res = await fetch(HEA_CALENDAR_URL);
  if (!res.ok) return null;
  const html = await res.text();
  const section = extractGroupSection(html, group);
  if (!section) return null;

  const derived = deriveUitmTermCodeFromDate(options?.targetDateISO);
  const preferred = options?.preferredTermCode?.trim() || derived || undefined;
  const byTerm = extractPeriodsByTermCode(section);
  const allPeriods = extractPeriodsFromSection(section);

  // If a term code was chosen, and we can extract that term block, use it directly.
  const directByTerm = preferred && /^\d{5}$/.test(preferred) ? byTerm[preferred] : undefined;
  const periodsForChoice = directByTerm && directByTerm.length > 0 ? directByTerm : null;

  const periodsSource = periodsForChoice ?? allPeriods;
  const segments = splitIntoSegments(allPeriods);
  const chosen =
    periodsForChoice ||
    (preferred && pickSegmentForTermCode(segments, preferred)) ||
    pickSegmentForDate(segments, options?.targetDateISO) ||
    periodsSource;
  const periods = chosen ?? periodsSource;
  const bounds = teachingBounds(periods);
  if (!bounds) return null;

  // UiTM typical teaching weeks (excluding breaks) is 14 for Group B.
  const totalWeeks = group === 'B' ? 14 : 14;
  const semesterLabel = group === 'B' ? 'UiTM (Group B) – Official HEA' : 'UiTM (Group A) – Official HEA';

  return {
    semesterLabel,
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    totalWeeks,
    periods,
  };
}

