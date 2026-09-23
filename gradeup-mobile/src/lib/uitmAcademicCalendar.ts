import type { AcademicCalendar, AcademicPeriod, AcademicPeriodType } from '@/src/types';

const HEA_CALENDAR_URL = 'https://hea.uitm.edu.my/index.php/calendars/academic-calendar';

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  januari: 0, februari: 1, mac: 2, mei: 4, julai: 6, ogos: 7, oktober: 9, disember: 11,
};

function parseDdMmmmYyyy(s: string): Date | null {
  const t = s.replace(/\s+/g, ' ').trim();
  const m = t.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = MONTH_MAP[m[2].toLowerCase()];
  if (mon == null) return null;
  const d = new Date(parseInt(m[3], 10), mon, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

function stripNotes(s: string): string {
  return s
    .replace(/\([^)]*\)\s*$/g, '')   // trailing (Online), (Atas Talian), etc.
    .replace(/\[[^\]]*\]\s*$/g, '')   // trailing [Raya Haji - ...]
    .replace(/\([^)]*\)/g, '')        // any remaining parenthesized notes
    .replace(/\[[^\]]*\]/g, '')       // any remaining bracketed notes
    .trim();
}

function parseSingleDateRange(raw: string): { start: string; end: string } | null {
  const s = stripNotes(raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim());
  const cleaned = s.replace(/[–—]/g, '-');
  const parts = cleaned.split('-').map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) {
    const one = parseDdMmmmYyyy(s.replace(/^[^0-9]*/g, '').trim());
    if (one) { const v = iso(one); return { start: v, end: v }; }
    return null;
  }

  const left = parts[0].replace(/^[^0-9]*/g, '').trim();
  const right = parts[1].replace(/^[^0-9]*/g, '').trim();

  const d1 = parseDdMmmmYyyy(left);
  const d2 = parseDdMmmmYyyy(right);
  if (d1 && d2) return { start: iso(d1), end: iso(d2) };

  const leftDay = left.match(/^(\d{1,2})$/);
  if (leftDay && d2) {
    const d0 = new Date(d2.getFullYear(), d2.getMonth(), parseInt(leftDay[1], 10));
    if (!Number.isNaN(d0.getTime())) return { start: iso(d0), end: iso(d2) };
  }

  const leftNoYear = left.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (leftNoYear && d2) {
    const d0 = parseDdMmmmYyyy(`${leftNoYear[1]} ${leftNoYear[2]} ${d2.getFullYear()}`);
    if (d0) return { start: iso(d0), end: iso(d2) };
  }
  return null;
}

export type UitmCalendarVariant = 'auto' | 'standard' | 'kkt';

/**
 * Which kind of term to read out of the HEA page.
 *
 * UiTM publishes two in the same table: the normal ~14-week semester, and the
 * short semester (session 3, "semester antara"/intersession) that runs between
 * them. The picker skipped every short term, because most students never sit
 * one — so a student who does had no way to see their own dates, and was shown
 * the next normal semester instead. 'short' asks for exactly the terms 'auto'
 * refuses to consider.
 */
export type UitmTermKind = 'auto' | 'normal' | 'short';

function parseDateRangeDual(raw: string): { standard?: { start: string; end: string }; kkt?: { start: string; end: string } } {
  const s = raw.replace(/\u00a0/g, ' ').replace(/[–—]/g, '-');
  const parts = s.split('*').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    const single = parseSingleDateRange(s);
    return single ? { standard: single } : {};
  }
  const standard = parseSingleDateRange(parts[0]);
  const kkt = parseSingleDateRange(parts.slice(1).join(' '));
  return { ...(standard ? { standard } : {}), ...(kkt ? { kkt } : {}) };
}

function pickDateRange(raw: string, variant: UitmCalendarVariant): { start: string; end: string } | null {
  const dual = parseDateRangeDual(raw);
  const { standard, kkt } = dual;
  if (!standard && !kkt) return null;
  if (variant === 'standard') return standard ?? kkt ?? null;
  if (variant === 'kkt') return kkt ?? standard ?? null;
  if (standard && kkt) return standard.start <= kkt.start ? standard : kkt;
  return standard ?? kkt ?? null;
}

function inferType(label: string): AcademicPeriodType {
  const l = label.toLowerCase();
  if (l.includes('kuliah') || l.includes('lecture')) return 'lecture';
  if (l.includes('pendaftaran') || l.includes('registration') || l.includes('persetujuan menerima')
      || l.includes('serahan dokumen') || l.includes('tambah dan gugur')) return 'registration';
  if (l.includes('test') || l.includes('ujian') || l.includes('eet')) return 'test';
  if (l.includes('revision') || l.includes('ulangkaji')) return 'revision';
  if (l.includes('examination') || l.includes('exam') || l.includes('peperiksaan') || l.includes('penilaian akhir')) return 'exam';
  if (l.includes('cuti') || l.includes('break') || l.includes('semester break')) {
    if (l.includes('special') || l.includes('khas') || l.includes('perayaan')) return 'special_break';
    return 'break';
  }
  return 'other';
}

function inferTypeForSection(sectionTitle: string): AcademicPeriodType {
  const l = sectionTitle.toLowerCase();
  if (l.includes('pendaftaran pelajar baharu') || l.includes('pendaftaran kursus')) return 'registration';
  if (l.includes('perkuliahan') || l.includes('kuliah')) return 'lecture';
  if (l.includes('peperiksaan') || l.includes('penilaian')) return 'exam';
  return 'other';
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

const PROGRAMME_LEVEL_MAP: Record<string, string> = {
  'semua pelajar': 'All Students',
  'all students': 'All Students',
  'pra-diploma': 'Pre-Diploma',
  'pre-diploma': 'Pre-Diploma',
  'diploma': 'Diploma',
  'sarjana muda': 'Bachelor',
  'bachelor': 'Bachelor',
  'sarjana': 'Master',
  'master': 'Master',
  'kedoktoran': 'PhD',
  'phd': 'PhD',
};

function translateProgrammeLevel(raw: string): string {
  const lower = raw.toLowerCase().trim();
  for (const [key, val] of Object.entries(PROGRAMME_LEVEL_MAP)) {
    if (lower.includes(key)) return val;
  }
  if (lower.length > 0 && lower.length < 80) return raw.trim();
  return '';
}

function cleanActivity(raw: string): string {
  return raw
    .replace(/^o\s+/gi, '')
    .replace(/^\[\d+\]\s*/gi, '')
    .replace(/^\d+\.\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanProgrammeCell(raw: string): string {
  return raw.replace(/^o\s+/gi, '').replace(/^\[\d+\]\s*/gi, '').replace(/\s+/g, ' ').trim();
}

// -------------------------------------------------------------------------------------
// Summary table parser (existing logic)
// -------------------------------------------------------------------------------------

/**
 * Everything on the HEA page that belongs to one group, and nothing from the
 * other.
 *
 * The page interleaves the two groups: summary schedules for A, then B, then
 * the detailed per-term tables for A, then B. So no single contiguous slice
 * holds all of one group without the other. This used to slice from the first
 * "GROUP A" header to the end of the document, which for Foundation students
 * meant every Group B table too — 76+ periods spanning two years, a start date
 * of the earliest date anywhere on the page, and "week 40" on the Home screen.
 * Group B only looked right because its first header sits after both of A's
 * summaries; its slice still swallowed A's detailed tables and relied on the
 * term picker never choosing one of them.
 *
 * Each header naming the wanted group opens a block that runs until the next
 * header naming the other group. Every header appears twice on this page (an
 * aria-label and the visible title, ~75 chars apart), so headers of the same
 * group inside an open block are skipped rather than starting a new one.
 */
function extractGroupSection(html: string, group: 'A' | 'B'): string | null {
  const headerRe = /(?:GROUP|KUMPULAN)\s+([AB])\b/gi;
  const headers: Array<{ index: number; group: 'A' | 'B' }> = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(html)) !== null) {
    headers.push({ index: m.index, group: m[1].toUpperCase() as 'A' | 'B' });
  }
  if (headers.length === 0) return null;

  const parts: string[] = [];
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].group !== group) continue;
    let end = html.length;
    for (let j = i + 1; j < headers.length; j++) {
      if (headers[j].group !== group) {
        end = headers[j].index;
        break;
      }
    }
    parts.push(html.slice(headers[i].index, end));
    // Skip the same-group headers this block already covers.
    while (i + 1 < headers.length && headers[i + 1].group === group && headers[i + 1].index < end) i++;
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

function extractPeriodsFromSection(sectionHtml: string, variant: UitmCalendarVariant): AcademicPeriod[] {
  const periods: AcademicPeriod[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(sectionHtml)) !== null) {
    const rowHtml = m[1];
    const tds = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((x) => stripTags(x[1]));
    if (tds.length < 2) continue;

    let dateIdx = -1;
    let range: { start: string; end: string } | null = null;
    for (let i = 0; i < tds.length; i++) {
      const maybe = pickDateRange(tds[i], variant);
      if (maybe) { dateIdx = i; range = maybe; break; }
    }
    if (!range || dateIdx < 0) continue;

    const labelCell = tds[Math.max(0, dateIdx - 1)] ?? '';
    const prefixCell = dateIdx >= 2 ? (tds[dateIdx - 2] ?? '') : '';
    const label = String(labelCell || '').trim();
    if (!label) continue;

    const a0 = String(tds[0] || '').toLowerCase();
    const a1 = String(tds[1] || '').toLowerCase();
    if (a0.includes('activity') && (a1.includes('date') || a1.includes('tarikh'))) continue;
    if (a0.includes('programme') && a1.includes('activity')) continue;

    const prefix = String(prefixCell || '').trim();
    const fullLabel = prefix && prefix.toLowerCase() !== 'activity' ? `${prefix} • ${label}` : label;

    periods.push({ type: inferType(label), label: fullLabel, startDate: range.start, endDate: range.end });
  }
  return periods;
}

// -------------------------------------------------------------------------------------
// Detailed "KALENDAR AKADEMIK" table parser
// -------------------------------------------------------------------------------------

function findDetailedSections(html: string, group: 'A' | 'B'): string[] {
  const groupKeywords = group === 'B'
    ? /PRA.?DIPLOMA|DIPLOMA|SARJANA/i
    : /ASASI|PROFESIONAL|FOUNDATION/i;

  const sections: string[] = [];
  const kalRe = /KALENDAR\s+AKADEMIK/gi;
  let km: RegExpExecArray | null;
  while ((km = kalRe.exec(html)) !== null) {
    const nearbyText = stripTags(html.slice(km.index, km.index + 2000));
    if (!groupKeywords.test(nearbyText)) continue;

    // Walk backward to find the enclosing <table
    let tableStart = html.lastIndexOf('<table', km.index);
    if (tableStart < 0 || km.index - tableStart > 3000) continue;

    // Walk forward from tableStart to find matching </table> with nesting
    let depth = 0;
    let pos = tableStart;
    let tableEnd = -1;
    const openRe = /<table\b/gi;
    const closeRe = /<\/table\s*>/gi;
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;

    const events: { pos: number; isOpen: boolean }[] = [];
    let om: RegExpExecArray | null;
    let cm: RegExpExecArray | null;
    while ((om = openRe.exec(html)) !== null) {
      if (om.index > km.index + 300000) break;
      events.push({ pos: om.index, isOpen: true });
    }
    while ((cm = closeRe.exec(html)) !== null) {
      if (cm.index > km.index + 300000) break;
      events.push({ pos: cm.index, isOpen: false });
    }
    events.sort((a, b) => a.pos - b.pos);

    for (const ev of events) {
      if (ev.pos < tableStart) continue;
      if (ev.isOpen) depth++;
      else {
        depth--;
        if (depth === 0) { tableEnd = ev.pos; break; }
      }
    }

    if (tableEnd < 0) tableEnd = html.indexOf('</table', km.index);
    if (tableEnd < 0) continue;

    const content = html.slice(tableStart, tableEnd + 8);
    sections.push(content);
  }
  return sections;
}

// Strip first, then take the head. These tables open with a "download the PDF"
// link whose <img> carries the icon as a base64 data URL, so the first few
// thousand characters of raw HTML are one tag with no text in it — slicing
// before stripping read the code as null for every Group A table and sent the
// term lookup into the session fallback below.
function detailedHeaderText(tableContent: string, chars: number): string {
  return stripTags(tableContent.slice(0, 60000)).slice(0, chars);
}

function extractTermCodeFromDetailedHeader(tableContent: string): string | null {
  const text = detailedHeaderText(tableContent, 600);
  const m = text.match(/\((\d{5})\)/);
  if (m) return m[1];
  const m2 = text.match(/\[(\d{5})\]/);
  return m2 ? m2[1] : null;
}

function extractSessionFromDetailedHeader(tableContent: string): string | null {
  const text = detailedHeaderText(tableContent, 400);
  const m = text.match(/SESI\s+(I{1,3}|[IV]+)\s+(\d{4})\/(\d{4})/i);
  if (m) return `${m[1].toUpperCase()}-${m[2]}/${m[3]}`;
  return null;
}

function parseDetailedTable(tableContent: string, variant: UitmCalendarVariant): AcademicPeriod[] {
  const periods: AcademicPeriod[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  const rows: string[][] = [];
  while ((m = trRe.exec(tableContent)) !== null) {
    const tds = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((x) => stripTags(x[1]));
    rows.push(tds);
  }

  let currentProgramme = '';
  let currentSectionType: AcademicPeriodType = 'other';

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.length === 0) continue;

    const joined = cells.join(' ').trim().toLowerCase();
    if (!joined || joined.length < 2) continue;

    // Section headers
    if (cells.length <= 2 && /aktiviti\s+(pendaftaran|perkuliahan|peperiksaan)/i.test(joined)) {
      currentSectionType = inferTypeForSection(joined);
      currentProgramme = '';
      continue;
    }

    // Table header rows
    if (/peringkat|programme\s*level/i.test(joined) && /aktiviti|activity/i.test(joined)) continue;
    if (/kalendar\s+akademik/i.test(joined)) continue;
    if (/sesi\s+(akademik|i{1,3}\b)/i.test(joined) && cells.length <= 2) continue;
    if (/semester\s+\w+.*\d{4}/i.test(joined) && cells.length <= 2) continue;
    if (/^nota:|^note:|approved\s+by|kemaskini|berdasarkan/i.test(joined)) continue;

    // Find a date cell
    let dateIdx = -1;
    let range: { start: string; end: string } | null = null;
    for (let ci = 0; ci < cells.length; ci++) {
      const cellText = cells[ci].trim();
      // Skip cells that are just durations like "1 Minggu", "5 Hari"
      if (/^\d+\s+(minggu|hari|weeks?|days?)\b/i.test(cellText)) continue;
      const maybe = pickDateRange(cellText, variant);
      if (maybe) { dateIdx = ci; range = maybe; break; }
    }

    // No date found — check if first cell is a programme level context update
    if (!range) {
      const cleaned0 = cleanProgrammeCell(cells[0] || '');
      const translated = translateProgrammeLevel(cleaned0);
      if (translated && cleaned0.length < 100) {
        currentProgramme = translated;
      }
      continue;
    }

    // Determine activity label and programme tag
    let activityRaw = '';
    let programmeTag = currentProgramme;

    // Check if first cell (cleaned of bullet prefix) is a programme level
    const cell0Clean = cleanProgrammeCell(cells[0] || '');
    const cell0Programme = translateProgrammeLevel(cell0Clean);

    if (cells.length >= 4 && dateIdx >= 2) {
      // 4+ cols: e.g. PROGRAMME | ACTIVITY | DATE | DURATION
      if (cell0Programme) {
        programmeTag = cell0Programme;
        currentProgramme = cell0Programme;
      }
      activityRaw = cells[dateIdx - 1];
    } else if (cells.length >= 3 && dateIdx >= 1) {
      if (cell0Programme && dateIdx >= 2) {
        programmeTag = cell0Programme;
        currentProgramme = cell0Programme;
        activityRaw = cells[dateIdx - 1];
      } else if (dateIdx === 1) {
        activityRaw = cells[0];
      } else {
        activityRaw = cells[dateIdx - 1];
      }
    } else if (cells.length >= 2) {
      const nonDateIdx = dateIdx === 0 ? 1 : 0;
      activityRaw = cells[nonDateIdx] || '';
    }

    const activity = cleanActivity(activityRaw);
    if (!activity || activity.length < 2) continue;
    if (/^\d{1,2}\s+(mac|mei|ogos|jan|feb|march|april|jun|jul)/i.test(activity)) continue;
    // Skip duration-only cells that slipped through
    if (/^\d+\s+(minggu|hari|weeks?|days?)$/i.test(activity)) continue;

    const type = inferType(activity) !== 'other' ? inferType(activity) : currentSectionType;
    const fullLabel = programmeTag ? `${programmeTag} • ${activity}` : activity;

    periods.push({ type, label: fullLabel, startDate: range.start, endDate: range.end });
  }

  return periods;
}

// -------------------------------------------------------------------------------------
// Term code & segment logic
// -------------------------------------------------------------------------------------

function extractPeriodsByTermCode(sectionHtml: string, variant: UitmCalendarVariant): Record<string, AcademicPeriod[]> {
  const codes = extractTermCodesFromHtml(sectionHtml);
  if (codes.length === 0) return {};
  const re = /\[(\d{5})\]/g;
  const hits: { code: string; idx: number }[] = [];
  for (const m of sectionHtml.matchAll(re)) {
    if (m[1] && typeof m.index === 'number') hits.push({ code: m[1], idx: m.index });
  }
  if (hits.length === 0) return {};
  const out: Record<string, AcademicPeriod[]> = {};
  // The detailed "KALENDAR AKADEMIK" tables follow the summary schedules, so a
  // segment must also stop where those begin. Without this the last [code] on
  // the page ran to the end of the section and swallowed every detailed table
  // after it — the two-year "catch-all bucket" pickTermCodeForDate has to
  // reject, which left the final term of each group unselectable for the
  // whole time it was actually running.
  const detailedRe = /KALENDAR\s+AKADEMIK/gi;
  for (let i = 0; i < hits.length; i++) {
    const { code, idx } = hits[i];
    let end = i + 1 < hits.length ? hits[i + 1].idx : sectionHtml.length;
    detailedRe.lastIndex = idx;
    const dm = detailedRe.exec(sectionHtml);
    if (dm && dm.index < end) end = dm.index;
    const block = sectionHtml.slice(idx, end);
    const periods = extractPeriodsFromSection(block, variant);
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

function splitIntoSegments(periods: AcademicPeriod[]): AcademicPeriod[][] {
  const sorted = sortPeriods(periods);
  const segments: AcademicPeriod[][] = [];
  let cur: AcademicPeriod[] = [];
  for (const p of sorted) {
    cur.push(p);
    if (isSemesterBreak(p)) { segments.push(cur); cur = []; }
  }
  if (cur.length > 0) segments.push(cur);
  return segments.filter((seg) => seg.some((p) => p.type === 'lecture'));
}

/** ISO date `days` days from `isoStr`; the input unchanged when it does not parse. */
function shiftISO(isoStr: string, days: number): string {
  const d = toDate(isoStr);
  if (!d) return isoStr;
  d.setDate(d.getDate() + days);
  return iso(d);
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
  starts.sort(); ends.sort();
  return { start: starts[0], end: ends[ends.length - 1] };
}

function pickSegmentForDate(segments: AcademicPeriod[][], targetISO?: string): AcademicPeriod[] | null {
  const target = toDate(targetISO || iso(new Date()));
  if (!target || segments.length === 0) return segments[0] ?? null;
  const byBounds = segments.map((seg) => ({ seg, b: segmentBounds(seg) }))
    .filter((x): x is { seg: AcademicPeriod[]; b: { start: string; end: string } } => Boolean(x.b));
  for (const x of byBounds) {
    const s = toDate(x.b.start); const e = toDate(x.b.end);
    if (s && e && target.getTime() >= s.getTime() && target.getTime() <= e.getTime()) return x.seg;
  }
  const future = byBounds.map((x) => ({ ...x, s: toDate(x.b.start)! }))
    .filter((x) => x.s.getTime() > target.getTime()).sort((a, b) => a.s.getTime() - b.s.getTime());
  if (future.length > 0) return future[0].seg;
  const past = byBounds.map((x) => ({ ...x, s: toDate(x.b.start)! }))
    .filter((x) => x.s.getTime() <= target.getTime()).sort((a, b) => b.s.getTime() - a.s.getTime());
  return past[0]?.seg ?? byBounds[0]?.seg ?? null;
}

function extractTermCodes(periods: AcademicPeriod[]): string[] {
  const codes = new Set<string>();
  for (const p of periods) for (const m of String(p.label || '').matchAll(/\((\d{5})\)/g)) if (m[1]) codes.add(m[1]);
  return [...codes].sort();
}

function extractTermCodesFromHtml(sectionHtml: string): string[] {
  const codes = new Set<string>();
  for (const m of sectionHtml.matchAll(/\[(\d{5})\]/g)) if (m[1]) codes.add(m[1]);
  for (const m of sectionHtml.matchAll(/\((\d{5})\)/g)) if (m[1]) codes.add(m[1]);
  return [...codes].sort();
}

function segmentHasTermCode(seg: AcademicPeriod[], code: string): boolean {
  const want = String(code || '').trim();
  if (!/^\d{5}$/.test(want)) return false;
  return seg.some((p) => { const l = String(p.label || ''); return l.includes(`(${want})`) || l.includes(`[${want}]`); });
}

export async function fetchUitmAcademicCalendarTermCodes(group: 'A' | 'B'): Promise<string[]> {
  const res = await fetch(HEA_CALENDAR_URL);
  if (!res.ok) return [];
  const html = await res.text();
  const section = extractGroupSection(html, group);
  if (!section) return [];
  const fromHtml = extractTermCodesFromHtml(section);
  if (fromHtml.length > 0) return fromHtml;
  return extractTermCodes(extractPeriodsFromSection(section, 'auto'));
}

function pickSegmentForTermCode(segments: AcademicPeriod[][], code: string): AcademicPeriod[] | null {
  const want = String(code || '').trim();
  if (!/^\d{5}$/.test(want)) return null;
  const direct = segments.find((seg) => segmentHasTermCode(seg, want));
  if (direct) return direct;
  const year = parseInt(want.slice(0, 4), 10);
  const slot = want.slice(-1);
  const monthRanges: Record<string, { min: number; max: number }> = { '4': { min: 8, max: 10 }, '2': { min: 2, max: 4 }, '3': { min: 6, max: 8 } };
  const range = monthRanges[slot];
  if (!range) return null;
  const scored = segments.map((seg) => {
    const b = segmentBounds(seg);
    if (!b) return null;
    const sd = toDate(b.start);
    if (!sd) return null;
    const score = (sd.getFullYear() === year ? 10 : 0) + (sd.getMonth() >= range.min && sd.getMonth() <= range.max ? 5 : 0) - Math.abs(sd.getMonth() - Math.round((range.min + range.max) / 2));
    return { seg, score };
  }).filter((x): x is { seg: AcademicPeriod[]; score: number } => Boolean(x)).sort((a, b) => b.score - a.score);
  return scored[0]?.seg ?? null;
}

/**
 * Widest lecture window a real UiTM semester can have. Anything beyond this is a
 * parse artefact: `extractPeriodsByTermCode` slices the section at each `[code]`
 * marker, so the last code on the page swallows every row after it — 20272
 * currently comes out spanning Dec 2025 to Dec 2027. Those buckets must never
 * win the auto-pick.
 */
const MAX_TERM_LECTURE_SPAN_DAYS = 300;

/** Session 3 is intersession: a short optional term most students never sit. */
function isIntersessionTermCode(code: string): boolean {
  return /^\d{4}3$/.test(String(code || '').trim());
}

/** Lecture window for one term code, or null when absent or implausibly wide. */
function lectureBoundsForTerm(periods: AcademicPeriod[]): { start: string; end: string } | null {
  const b = teachingBounds(periods);
  if (!b) return null;
  const s = toDate(b.startDate);
  const e = toDate(b.endDate);
  if (!s || !e || e.getTime() < s.getTime()) return null;
  if (Math.round((e.getTime() - s.getTime()) / 864e5) > MAX_TERM_LECTURE_SPAN_DAYS) return null;
  return { start: b.startDate, end: b.endDate };
}

/**
 * Choose the term code from the dates HEA actually publishes, rather than from
 * the month number.
 *
 * The month map this replaces sent the whole of September to session 3, so a
 * student opening the app on 23 Sep 2026 — four days before their semester
 * started — was measured against the intersession that began 17 August and told
 * they were in week 6. September is exactly where the two terms overlap, which
 * is why guessing from the calendar month cannot work here.
 *
 * Order: the term whose lectures are running today, then the one starting
 * soonest after today (so the week before a semester reads week 1), then the
 * most recent one that has already ended.
 */
function pickTermCodeForDate(
  byTerm: Record<string, AcademicPeriod[]>,
  targetISO?: string,
  kind: UitmTermKind = 'auto',
): string | null {
  const target = toDate(targetISO || iso(new Date()));
  if (!target) return null;

  const candidates: { code: string; start: Date; end: Date }[] = [];
  for (const [code, periods] of Object.entries(byTerm)) {
    if (isIntersessionTermCode(code) !== (kind === 'short')) continue;
    const b = lectureBoundsForTerm(periods);
    const start = b && toDate(b.start);
    const end = b && toDate(b.end);
    if (start && end) candidates.push({ code, start, end });
  }
  if (candidates.length === 0) return null;

  const running = candidates
    .filter((c) => target.getTime() >= c.start.getTime() && target.getTime() <= c.end.getTime())
    .sort((a, b) => b.start.getTime() - a.start.getTime());
  if (running.length > 0) return running[0].code;

  const upcoming = candidates
    .filter((c) => c.start.getTime() > target.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  if (upcoming.length > 0) return upcoming[0].code;

  const past = candidates
    .filter((c) => c.end.getTime() < target.getTime())
    .sort((a, b) => b.end.getTime() - a.end.getTime());
  return past[0]?.code ?? null;
}

/**
 * True when this term's lectures finished before the target date.
 *
 * Nothing in the app ever refreshes `profiles.hea_term_code` — it is read in
 * several places and written back as null, so a code stored one semester would
 * otherwise pin that student to a dead term for good. Unknown codes return
 * false so `pickSegmentForTermCode` still gets its chance at them.
 */
function isTermCodeExpired(
  byTerm: Record<string, AcademicPeriod[]>,
  code: string,
  targetISO?: string,
): boolean {
  const periods = byTerm[String(code || '').trim()];
  if (!periods) return false;
  const b = lectureBoundsForTerm(periods);
  const end = b && toDate(b.end);
  const target = toDate(targetISO || iso(new Date()));
  if (!end || !target) return false;
  return end.getTime() < target.getTime();
}

// -------------------------------------------------------------------------------------
// Merge & deduplicate periods
// -------------------------------------------------------------------------------------

function deduplicatePeriods(periods: AcademicPeriod[]): AcademicPeriod[] {
  const seen = new Set<string>();
  const result: AcademicPeriod[] = [];
  for (const p of periods) {
    const key = `${p.type}|${p.startDate}|${p.endDate}|${p.label}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p);
    }
  }
  return result;
}

function mergePeriods(summary: AcademicPeriod[], detailed: AcademicPeriod[]): AcademicPeriod[] {
  return deduplicatePeriods(sortPeriods([...detailed, ...summary]));
}

// -------------------------------------------------------------------------------------
// Main fetch function
// -------------------------------------------------------------------------------------

export type UitmCalendarFetchResult = Pick<
  AcademicCalendar,
  'semesterLabel' | 'startDate' | 'endDate' | 'totalWeeks' | 'periods'
> & {
  /** HEA term code the dates came from, when one could be resolved. */
  termCode?: string;
  /** What was actually applied. 'short' only when a short term was found. */
  resolvedTermKind: 'normal' | 'short';
  /** A short semester was asked for and HEA publishes none for this group. */
  shortSemesterUnavailable: boolean;
};

export async function fetchUitmAcademicCalendar(
  group: 'A' | 'B',
  options?: {
    targetDateISO?: string;
    preferredTermCode?: string;
    variant?: UitmCalendarVariant;
    termKind?: UitmTermKind;
  },
): Promise<UitmCalendarFetchResult | null> {
  const res = await fetch(HEA_CALENDAR_URL);
  if (!res.ok) return null;
  const html = await res.text();
  const section = extractGroupSection(html, group);
  if (!section) return null;

  const variant: UitmCalendarVariant = options?.variant ?? 'auto';

  // 1. Summary-level periods (existing logic)
  const byTerm = extractPeriodsByTermCode(section, variant);
  const allSummary = extractPeriodsFromSection(section, variant);

  // Term code: an explicit request wins, but only while its lectures are still
  // running. Otherwise read the code off the published dates — never off the
  // month number, which put every September student in the intersession.
  const termKind: UitmTermKind = options?.termKind ?? 'auto';
  const requested = options?.preferredTermCode?.trim() || undefined;
  // A stored code from the other kind of term must not win: a student who
  // switches to the short semester still carries last semester's code.
  const requestedFitsKind =
    !!requested && (termKind === 'auto' || isIntersessionTermCode(requested) === (termKind === 'short'));
  const byKind = pickTermCodeForDate(byTerm, options?.targetDateISO, termKind);
  // Asked for a short semester and HEA lists none for this group: fall back to
  // the normal term rather than to nothing, and say so in the result.
  const shortSemesterUnavailable = termKind === 'short' && !byKind;
  const preferred =
    (requested && requestedFitsKind && !isTermCodeExpired(byTerm, requested, options?.targetDateISO)
      ? requested
      : undefined) ||
    byKind ||
    (shortSemesterUnavailable ? pickTermCodeForDate(byTerm, options?.targetDateISO, 'normal') : null) ||
    undefined;

  const directByTerm = preferred && /^\d{5}$/.test(preferred) ? byTerm[preferred] : undefined;
  const summarySource = directByTerm && directByTerm.length > 0 ? directByTerm : null;
  const segments = splitIntoSegments(allSummary);
  const chosenSummary =
    summarySource ||
    (preferred && pickSegmentForTermCode(segments, preferred)) ||
    pickSegmentForDate(segments, options?.targetDateISO) ||
    allSummary;

  // 2. Detailed "KALENDAR AKADEMIK" periods
  const detailedSections = findDetailedSections(html, group);
  let detailedPeriods: AcademicPeriod[] = [];
  const targetCode = preferred || '';

  // Try matching by term code first
  for (const sec of detailedSections) {
    const code = extractTermCodeFromDetailedHeader(sec);
    if (targetCode && code === targetCode) {
      detailedPeriods.push(...parseDetailedTable(sec, variant));
    }
  }

  // If no match by code, try matching by session label (e.g. "SESI II" for code ending in 2)
  if (detailedPeriods.length === 0 && targetCode) {
    const slot = targetCode.slice(-1);
    const sessionNum = slot === '4' ? 'I' : slot === '2' ? 'II' : slot === '3' ? 'III' : '';
    for (const sec of detailedSections) {
      const session = extractSessionFromDetailedHeader(sec);
      // Compare the numeral exactly. `includes('I-')` also matched "II-" and
      // "III-", which is how a June–October term picked up December's table.
      if (session && sessionNum && session.split('-')[0] === sessionNum) {
        detailedPeriods.push(...parseDetailedTable(sec, variant));
      }
    }
  }

  // Fallback: parse all sections and filter by date overlap with chosen summary
  if (detailedPeriods.length === 0) {
    let allDetailed: AcademicPeriod[] = [];
    for (const sec of detailedSections) {
      allDetailed.push(...parseDetailedTable(sec, variant));
    }
    const sumBounds = segmentBounds(chosenSummary as AcademicPeriod[]);
    if (sumBounds && allDetailed.length > 0) {
      detailedPeriods = allDetailed.filter((p) => p.endDate >= sumBounds.start && p.startDate <= sumBounds.end);
    }
    if (detailedPeriods.length === 0) detailedPeriods = allDetailed;
  }

  // The summary schedule decides which semester this is; detailed tables only
  // add rows to it. Whatever path matched a detailed table above, its rows must
  // START inside the chosen term — a table matched by the wrong code or session
  // otherwise redefines the semester's start and end. The margin ahead of the
  // start keeps genuine pre-semester registration rows. Starting, not merely
  // overlapping: consecutive UiTM terms sit a week apart, so the previous
  // term's final lecture row overlaps any useful margin and would leak in.
  const summaryBounds = segmentBounds(chosenSummary as AcademicPeriod[]);
  if (summaryBounds && detailedPeriods.length > 0) {
    const earliest = shiftISO(summaryBounds.start, -45);
    detailedPeriods = detailedPeriods.filter((p) => p.startDate >= earliest && p.startDate <= summaryBounds.end);
  }

  // 3. Merge
  const periods = mergePeriods(chosenSummary ?? [], detailedPeriods);
  // Term range from the summary when it has one: detailed rows may legitimately
  // sit a little outside the lecture window, and must never widen the semester.
  const bounds = teachingBounds(chosenSummary as AcademicPeriod[]) ?? teachingBounds(periods);
  if (!bounds) return null;

  const isShort = !!preferred && isIntersessionTermCode(preferred);
  // A short semester is not 14 weeks, and saying it is put its students several
  // weeks out on the Home screen. Measure it instead; normal terms keep the
  // published 14 so a parse that clips a week cannot shift everyone's count.
  const totalWeeks = isShort ? weeksBetween(bounds.startDate, bounds.endDate) : 14;
  const baseLabel = group === 'B' ? 'UiTM (Group B) – Official HEA' : 'UiTM (Group A) – Official HEA';
  const variantSuffix = variant === 'kkt' ? ' (Kedah/Kelantan/Terengganu*)' : variant === 'standard' ? ' (Standard)' : '';
  const kindSuffix = isShort ? ' – Short semester' : '';

  return {
    semesterLabel: `${baseLabel}${variantSuffix}${kindSuffix}`,
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    totalWeeks,
    periods,
    ...(preferred ? { termCode: preferred } : {}),
    resolvedTermKind: isShort ? 'short' : 'normal',
    shortSemesterUnavailable,
  };
}

/** Whole teaching weeks a range covers, at least one. */
function weeksBetween(startISO: string, endISO: string): number {
  const a = toDate(startISO);
  const b = toDate(endISO);
  if (!a || !b) return 14;
  const days = Math.round((b.getTime() - a.getTime()) / 864e5) + 1;
  return Math.max(1, Math.min(60, Math.ceil(days / 7)));
}
