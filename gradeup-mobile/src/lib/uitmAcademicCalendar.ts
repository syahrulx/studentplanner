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

function extractGroupSection(html: string, group: 'A' | 'B'): string | null {
  const want = group === 'B' ? 'B' : 'A';
  const patterns: RegExp[] = [
    new RegExp(String.raw`SUMMARY\s+SCHEDULE[\s\S]{0,120}?GROUP\s+${want}`, 'i'),
    new RegExp(String.raw`GROUP\s+${want}\b`, 'i'),
    new RegExp(String.raw`KUMPULAN\s+${want}\b`, 'i'),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && typeof m.index === 'number' && m.index >= 0) return html.slice(m.index);
  }
  return null;
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

function extractTermCodeFromDetailedHeader(tableContent: string): string | null {
  const text = stripTags(tableContent.slice(0, 6000));
  const m = text.match(/\((\d{5})\)/);
  if (m) return m[1];
  const m2 = text.match(/\[(\d{5})\]/);
  return m2 ? m2[1] : null;
}

function extractSessionFromDetailedHeader(tableContent: string): string | null {
  const text = stripTags(tableContent.slice(0, 4000));
  const m = text.match(/SESI\s+(I{1,3}|[IV]+)\s+(\d{4})\/(\d{4})/i);
  if (m) return `${m[1]}-${m[2]}/${m[3]}`;
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
  for (let i = 0; i < hits.length; i++) {
    const { code, idx } = hits[i];
    const end = i + 1 < hits.length ? hits[i + 1].idx : sectionHtml.length;
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

function deriveUitmTermCodeFromDate(targetISO?: string): string | null {
  const d = toDate(targetISO || iso(new Date()));
  if (!d) return null;
  const y = d.getFullYear(); const m = d.getMonth();
  if (m <= 1) return `${y - 1}4`;
  if (m >= 2 && m <= 7) return `${y}2`;
  if (m === 8) return `${y}3`;
  if (m >= 9) return `${y}4`;
  return null;
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

export async function fetchUitmAcademicCalendar(
  group: 'A' | 'B',
  options?: { targetDateISO?: string; preferredTermCode?: string; variant?: UitmCalendarVariant },
): Promise<Pick<AcademicCalendar, 'semesterLabel' | 'startDate' | 'endDate' | 'totalWeeks' | 'periods'> | null> {
  const res = await fetch(HEA_CALENDAR_URL);
  if (!res.ok) return null;
  const html = await res.text();
  const section = extractGroupSection(html, group);
  if (!section) return null;

  const variant: UitmCalendarVariant = options?.variant ?? 'auto';
  const derived = deriveUitmTermCodeFromDate(options?.targetDateISO);
  const preferred = options?.preferredTermCode?.trim() || derived || undefined;

  // 1. Summary-level periods (existing logic)
  const byTerm = extractPeriodsByTermCode(section, variant);
  const allSummary = extractPeriodsFromSection(section, variant);
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
      if (session && sessionNum && session.includes(sessionNum + '-')) {
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

  // 3. Merge
  const periods = mergePeriods(chosenSummary ?? [], detailedPeriods);
  const bounds = teachingBounds(periods);
  if (!bounds) return null;

  const totalWeeks = 14;
  const baseLabel = group === 'B' ? 'UiTM (Group B) – Official HEA' : 'UiTM (Group A) – Official HEA';
  const variantSuffix = variant === 'kkt' ? ' (Kedah/Kelantan/Terengganu*)' : variant === 'standard' ? ' (Standard)' : '';

  return {
    semesterLabel: `${baseLabel}${variantSuffix}`,
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    totalWeeks,
    periods,
  };
}
