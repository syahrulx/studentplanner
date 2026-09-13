import type { DayOfWeek, TimetableEntry } from '../../types';

/**
 * UiTM timetable fetcher — runs entirely on the client, public sources only.
 *
 * Flow (student ID / matric only, no credentials):
 * 1. Timetable JSON from the UiTM CDN  (jadual/baru/{matric}.json)
 * 2. Fallback: ICRESS student page, then ICRESS course pages (user-supplied codes)
 * 3. Profile from the UiTM CDN          (biodata/{matric}.json and friends)
 *
 * Every endpoint here is unauthenticated. There is no MyStudent login step:
 * we never ask for, transmit, or store a student's portal password.
 */

const UITM_CDN = 'https://cdn.uitm.link/';
const MYSTUDENT_CDN = `${UITM_CDN}jadual/baru/`;

// ── Types ───────────────────────────────────────────────────

interface TimetableRow {
  subjectCode: string;
  subjectName: string;
  group: string;
  day: string;
  startTime: string;
  endTime: string;
  location: string;
  lecturer: string;
}

interface JadualItem {
  course_desc?: string;
  courseid?: string;
  groups?: string;
  masa?: string;
  bilik?: string;
  lecturer?: string;
}

interface DayBlock {
  hari?: string;
  jadual?: JadualItem[];
}

export type MyStudentProfilePayload = {
  matric: string;
  fullName?: string;
  program?: string;
  part?: number;
  campus?: string;
  faculty?: string;
  studyMode?: string;
  semester?: number;
  personalEmail?: string;
};

// ── Helpers ─────────────────────────────────────────────────

const DAY_MAP: Record<string, string> = {
  mon: 'Monday', monday: 'Monday', isnin: 'Monday',
  tue: 'Tuesday', tuesday: 'Tuesday', selasa: 'Tuesday',
  wed: 'Wednesday', wednesday: 'Wednesday', rabu: 'Wednesday',
  thu: 'Thursday', thursday: 'Thursday', khamis: 'Thursday',
  fri: 'Friday', friday: 'Friday', jumaat: 'Friday', "jum'aat": 'Friday',
  sat: 'Saturday', saturday: 'Saturday', sabtu: 'Saturday',
  sun: 'Sunday', sunday: 'Sunday', ahad: 'Sunday',
};

function normalizeDay(raw: string): string | null {
  const key = raw.toLowerCase().trim();
  if (DAY_MAP[key]) return DAY_MAP[key];
  for (const [k, v] of Object.entries(DAY_MAP)) {
    if (key.startsWith(k) || k.startsWith(key)) return v;
  }
  return null;
}

function normalizeTime(raw: string): string {
  let t = raw.replace(/\s+/g, ' ').trim();
  const amPm = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (amPm) {
    let h = parseInt(amPm[1], 10);
    const m = amPm[2];
    const p = amPm[3].toLowerCase();
    if (p === 'pm' && h < 12) h += 12;
    if (p === 'am' && h === 12) h = 0;
    return h.toString().padStart(2, '0') + ':' + m;
  }
  let cleaned = t.replace(/\s+/g, '').replace('.', ':');
  if (/^\d{4}$/.test(cleaned)) {
    cleaned = cleaned.slice(0, 2) + ':' + cleaned.slice(2);
  }
  return cleaned;
}

function strVal(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  return undefined;
}

function intPart(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 20) return Math.floor(v);
  if (typeof v === 'string') {
    const m = v.match(/(\d{1,2})/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 0 && n < 20) return n;
    }
  }
  return undefined;
}

function intSemester(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 30) return Math.floor(v);
  if (typeof v === 'string') {
    const m = v.match(/(\d{1,2})/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 0 && n <= 30) return n;
    }
  }
  return undefined;
}

function intPartFromRecord(nested: Record<string, unknown>): number | undefined {
  const keys = [
    'part', 'peringkat', 'bahagian', 'semester_part',
    'part_pengajian', 'peringkat_pengajian', 'tahun_pengajian', 'tahun',
  ];
  for (const k of keys) {
    const p = intPart(nested[k]);
    if (p !== undefined) return p;
  }
  for (const v of Object.values(nested)) {
    if (typeof v === 'string') {
      const m = v.match(/\b(?:part|peringkat)\s*[:\s.-]*(\d{1,2})\b/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > 0 && n < 20) return n;
      }
    }
  }
  return undefined;
}

// ── Profile: public CDN ─────────────────────────────────────

function parseStudentProfileJson(data: unknown): Partial<MyStudentProfilePayload> {
  if (!data || typeof data !== 'object') return {};
  const o = data as Record<string, unknown>;
  const nested =
    o.pelajar && typeof o.pelajar === 'object'
      ? (o.pelajar as Record<string, unknown>)
      : o.data && typeof o.data === 'object'
        ? (o.data as Record<string, unknown>)
        : o;
  return {
    fullName:
      strVal(nested.nama) || strVal(nested.name) || strVal(nested.nama_penuh) ||
      strVal(nested.fullName) || strVal(nested.student_name),
    program:
      strVal(nested.program) || strVal(nested.kursus) || strVal(nested.course_name) ||
      strVal(nested.nama_kursus) || strVal(nested.nama_program),
    faculty:
      strVal(nested.fakulti) || strVal(nested.faculty) || strVal(nested.kolej) ||
      strVal(nested.nama_fakulti),
    campus:
      strVal(nested.kampus) || strVal(nested.campus) || strVal(nested.nama_kampus),
    studyMode:
      strVal(nested.mod_pengajian) || strVal(nested.mod) || strVal(nested.jenis_pengajian),
    personalEmail:
      strVal(nested.emel) || strVal(nested.email) || strVal(nested.email_peribadi) ||
      strVal(nested.personal_email),
    semester:
      intSemester(nested.semester) || intSemester(nested.sem_semasa) ||
      intSemester(nested.semester_semasa) || intSemester(nested.semester_semasa_pelajar) ||
      undefined,
    part: intPartFromRecord(nested),
  };
}

async function fetchMystudentProfileCdn(matric: string): Promise<Partial<MyStudentProfilePayload>> {
  const paths = [
    `biodata/${encodeURIComponent(matric)}.json`,
    `profil/${encodeURIComponent(matric)}.json`,
    `pelajar/${encodeURIComponent(matric)}.json`,
    `mahasiswa/${encodeURIComponent(matric)}.json`,
  ];
  for (const p of paths) {
    try {
      const res = await fetch(`${UITM_CDN}${p}`);
      if (!res.ok) continue;
      const data = (await res.json()) as unknown;
      const parsed = parseStudentProfileJson(data);
      if (parsed.fullName || parsed.program || parsed.campus || parsed.faculty || parsed.semester !== undefined)
        return parsed;
    } catch {
      continue;
    }
  }
  return {};
}

/** Public-source profile. Fields the CDN does not publish stay undefined. */
async function buildPublicProfile(matric: string): Promise<MyStudentProfilePayload> {
  const cdn = await fetchMystudentProfileCdn(matric);
  const semester = cdn.semester;
  const part =
    cdn.part ?? (semester != null && semester > 0 && semester < 20 ? semester : undefined);
  return {
    matric,
    fullName: cdn.fullName,
    program: cdn.program,
    part,
    campus: cdn.campus,
    faculty: cdn.faculty,
    studyMode: cdn.studyMode,
    semester: semester ?? undefined,
    personalEmail: cdn.personalEmail,
  };
}

// ── Timetable: CDN ──────────────────────────────────────────

function parseMasaRange(masa: string): { startTime: string; endTime: string } | null {
  const s = (masa || '').trim();
  if (!s || s === 'TBA') return null;
  const range = s.match(/(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*[-–]\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?)/i);
  if (range) return { startTime: normalizeTime(range[1]), endTime: normalizeTime(range[2]) };
  const digits = s.match(/(\d{3,4})\s*[-–]\s*(\d{3,4})/);
  if (digits) return { startTime: normalizeTime(digits[1]), endTime: normalizeTime(digits[2]) };
  return null;
}

function parseMystudentCdnJson(data: Record<string, DayBlock>): TimetableRow[] {
  const seen = new Set<string>();
  const rows: TimetableRow[] = [];
  const dateKeys = Object.keys(data).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  for (const dateKey of dateKeys) {
    const block = data[dateKey];
    if (!block?.jadual || !Array.isArray(block.jadual)) continue;
    const day = normalizeDay(block.hari || '');
    if (!day) continue;
    for (const j of block.jadual) {
      const times = parseMasaRange(j.masa || '');
      if (!times) continue;
      const code = (j.courseid || 'N/A').trim();
      const group = (j.groups || '').trim();
      const key = `${day}|${code}|${j.masa}|${group}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        subjectCode: code,
        subjectName: (j.course_desc || code).trim(),
        group,
        day,
        startTime: times.startTime,
        endTime: times.endTime,
        location: (j.bilik || '').trim() || '-',
        lecturer: (j.lecturer || '').trim() || '-',
      });
    }
  }
  return rows;
}

async function fetchMystudentCdn(matric: string): Promise<TimetableRow[]> {
  const url = `${MYSTUDENT_CDN}${encodeURIComponent(matric)}.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as Record<string, DayBlock>;
    if (!data || typeof data !== 'object') return [];
    return parseMystudentCdnJson(data);
  } catch {
    return [];
  }
}

// ── Timetable: ICRESS fallback ──────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function parseIcressDetailHtml(html: string, courseCode: string): TimetableRow[] {
  const rows: TimetableRow[] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  let isFirst = true;
  while ((trMatch = trRegex.exec(html)) !== null) {
    if (isFirst) { isFirst = false; continue; }
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) cells.push(stripHtml(tdMatch[1]));
    if (cells.length < 4) continue;
    let group = '', startTime = '', endTime = '', dayRaw = '', room = '', lecturer = '';
    if (cells.length >= 7) {
      group = cells[1]; startTime = cells[2]; endTime = cells[3];
      dayRaw = cells[4]; lecturer = cells[5]; room = cells[6];
    } else if (cells.length >= 5) {
      group = cells[0]; startTime = cells[1]; endTime = cells[2];
      dayRaw = cells[3]; room = cells[cells.length - 1];
    } else {
      group = cells[0]; startTime = cells[1]; endTime = cells[2]; dayRaw = cells[3] || '';
    }
    const day = normalizeDay(dayRaw);
    if (!day || !startTime || !endTime) continue;
    const subj = courseCode || cells.find((c) => /^[A-Z]{2,4}\d{3,4}[A-Z]?$/i.test(c.trim())) || 'N/A';
    rows.push({
      subjectCode: subj.toUpperCase(), subjectName: subj.toUpperCase(),
      group: group.trim(), day,
      startTime: normalizeTime(startTime), endTime: normalizeTime(endTime),
      location: (room || '-').trim(), lecturer: (lecturer || '-').trim(),
    });
  }
  return rows;
}

function guessFaculties(prefix: string): string[] {
  const map: Record<string, string[]> = {
    CSC: ['CS'], ITC: ['CS'], ISP: ['CS'], CSP: ['CS'], MAD: ['CS'], QMT: ['CS'],
    MAT: ['AS', 'CS'], PHY: ['AS'], CTU: ['PI'], ELC: ['PB'], ACC: ['AC'],
    ARC: ['AP'], ECO: ['BM', 'AM'], MGT: ['BM'],
  };
  const faculties = map[prefix];
  if (faculties) return faculties;
  if (prefix.length === 2) return [prefix];
  const short = prefix.slice(0, 2);
  if (map[short]) return map[short];
  return ['CS', 'AS', 'BM', 'AC', 'EC', 'EE', 'PB', 'PI'];
}

async function fetchStaticIcress(courseCode: string): Promise<TimetableRow[]> {
  const code = courseCode.toUpperCase().trim();
  const prefix = code.replace(/\d+.*$/, '');
  for (const faculty of guessFaculties(prefix)) {
    const url = `https://icress.uitm.edu.my/jadual/${faculty}/${code}.html`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const html = await res.text();
      const rows = parseIcressDetailHtml(html, code);
      if (rows.length > 0) return rows;
    } catch {
      continue;
    }
  }
  return [];
}

async function fetchIcressStudentPage(matric: string): Promise<TimetableRow[]> {
  const urls = [
    `https://icress.uitm.edu.my/jadual/student/${encodeURIComponent(matric)}.html`,
    `https://icress.uitm.edu.my/jadual/${encodeURIComponent(matric)}.html`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const html = await res.text();
      const rows = parseIcressDetailHtml(html, '');
      if (rows.length > 0) return rows;
    } catch {
      continue;
    }
  }
  return [];
}

// ── Rows → TimetableEntry ───────────────────────────────────

function rowsToEntries(rows: TimetableRow[]): TimetableEntry[] {
  let idCounter = 0;
  const out: TimetableEntry[] = [];
  for (const r of rows) {
    const day = normalizeDay(r.day);
    if (!day) continue; // Skip malformed rows so we always satisfy DayOfWeek
    out.push({
      id: `uitm-${++idCounter}`,
      day: day as DayOfWeek,
      subjectCode: r.subjectCode,
      subjectName: r.subjectName,
      lecturer: r.lecturer || '-',
      startTime: r.startTime,
      endTime: r.endTime,
      location: r.location || '-',
      group: r.group || undefined,
    });
  }
  return out;
}

// ── Public API ──────────────────────────────────────────────

/** Maps a fetched `profile` into `profileDb.updateProfile` / AppContext `updateProfile` fields. */
export function profileUpdatesFromMyStudentPayload(
  p: MyStudentProfilePayload | null | undefined,
  fallbackMatric?: string,
): {
  name?: string;
  studentId?: string;
  program?: string;
  part?: number;
  campus?: string;
  faculty?: string;
  studyMode?: string;
  currentSemester?: number;
  mystudentEmail?: string;
} {
  const matric = (p?.matric || fallbackMatric || '').trim();
  if (!matric) return {};
  const part =
    p?.part != null && p.part > 0
      ? p.part
      : p?.semester != null && p.semester > 0 && p.semester < 20
        ? p.semester
        : undefined;
  return {
    studentId: matric,
    ...(p?.fullName?.trim() ? { name: p.fullName.trim() } : {}),
    ...(p?.program?.trim() ? { program: p.program.trim() } : {}),
    ...(part != null ? { part } : {}),
    ...(p?.campus?.trim() ? { campus: p.campus.trim() } : {}),
    ...(p?.faculty?.trim() ? { faculty: p.faculty.trim() } : {}),
    ...(p?.studyMode?.trim() ? { studyMode: p.studyMode.trim() } : {}),
    ...(p?.semester != null && p.semester > 0 ? { currentSemester: p.semester } : {}),
    ...(p?.personalEmail?.trim() ? { mystudentEmail: p.personalEmail.trim() } : {}),
  };
}

/**
 * Fetch a UiTM timetable from public sources using the student ID alone.
 *
 * Sources, in order:
 * - UiTM CDN JSON             (jadual/baru/{matric}.json)
 * - ICRESS student page       (fallback)
 * - ICRESS course pages       (fallback, only when the user supplies course codes)
 *
 * Profile fields come from the public CDN biodata files and may be empty —
 * anything UiTM does not publish openly is simply not available.
 */
export async function fetchUitmTimetablePublic(
  matricOrEmail: string,
  courses?: string[],
): Promise<{
  entries: TimetableEntry[];
  coursesFound: string[];
  campus?: string;
  matric?: string;
  profile?: MyStudentProfilePayload;
}> {
  const matric = matricFromStudentLoginInput(matricOrEmail.trim());
  if (!matric) return { entries: [], coursesFound: [], matric: undefined };

  const [cdnRows, profile] = await Promise.all([
    fetchMystudentCdn(matric),
    buildPublicProfile(matric),
  ]);

  let rows = cdnRows;
  if (rows.length === 0) {
    rows = await fetchIcressStudentPage(matric);
  }
  if (rows.length === 0 && courses && courses.length > 0) {
    const merged: TimetableRow[] = [];
    for (const c of courses) {
      const code = c.toUpperCase().trim();
      if (code.length < 4) continue;
      merged.push(...(await fetchStaticIcress(code)));
    }
    rows = merged;
  }

  return {
    entries: rowsToEntries(rows),
    coursesFound: [...new Set(rows.map((r) => r.subjectCode))],
    campus: profile.campus,
    matric,
    profile,
  };
}

export function matricFromStudentLoginInput(input: string): string {
  const t = input.trim();
  if (!t) return t;
  const at = t.indexOf('@');
  return at === -1 ? t : t.slice(0, at);
}
