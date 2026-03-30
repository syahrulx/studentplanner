import type { TimetableEntry } from '../../types';

/**
 * UiTM MyStudent timetable fetcher — runs entirely on the client.
 *
 * Flow (same as https://mystudent.uitm.edu.my/ PWA):
 * 1. Firebase signInWithEmailAndPassword  ({matric}@mystudent.uitm.edu.my)
 * 2. Load timetable JSON from CDN          (jadual/baru/{matric}.json)
 * 3. Fallback: ICRESS student page / course pages
 * 4. Profile from Firestore pelajar doc + CDN biodata + MyStudent HTML
 *
 * All endpoints are public (no server secrets). The Firebase Web API key
 * comes from the MyStudent PWA bundle — it is client-exposed by design.
 */

const FIREBASE_WEB_API_KEY = 'AIzaSyCzaZT_qsgrbWBmtFJ0Sg3I-eJbZtntbpM';
const FIRESTORE_PROJECT_ID = 'universiti-tekno-1581783266917';
const MYSTUDENT_CDN = 'https://cdn.uitm.link/jadual/baru/';

/**
 * Google Identity Toolkit often has this API key locked to browser HTTP referrers
 * (mystudent.uitm.edu.my). React Native sends no Referer, so Google returns
 * "Requests from referer <empty> are blocked." — we send the same Origin/Referer
 * the official PWA would use.
 */
const FIREBASE_ALLOWED_REFERERS = [
  'https://mystudent.uitm.edu.my/',
  `https://${FIRESTORE_PROJECT_ID}.firebaseapp.com/`,
  `https://${FIRESTORE_PROJECT_ID}.web.app/`,
];

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

function toFirebaseEmail(input: string): string {
  const t = input.trim();
  if (!t) return t;
  if (!t.includes('@')) return `${t}@mystudent.uitm.edu.my`;
  const lower = t.toLowerCase();
  const local = t.split('@')[0].trim();
  if (
    lower.endsWith('@student.uitm.edu.my') ||
    lower.endsWith('@isiswa.uitm.edu.my') ||
    lower.endsWith('@mails.uitm.edu.my')
  ) {
    return `${local}@mystudent.uitm.edu.my`;
  }
  if (lower.endsWith('@mystudent.uitm.edu.my')) return t.trim();
  return t.trim();
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

// ── Firebase Auth ───────────────────────────────────────────

function isRefererBlockedMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes('referer') && (m.includes('blocked') || m.includes('empty'));
}

async function firebaseSignIn(
  email: string,
  password: string,
): Promise<{ matric: string; email: string; displayName?: string; idToken: string }> {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`;
  const body = JSON.stringify({ email, password, returnSecureToken: true });

  let lastRefererError = '';
  for (const referer of FIREBASE_ALLOWED_REFERERS) {
    const origin = referer.replace(/\/$/, '');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Referer: referer,
        Origin: origin,
      },
      body,
    });
    const raw = await res.text();
    let j: {
      idToken?: string;
      email?: string;
      displayName?: string;
      error?: { message?: string };
    } | null = null;
    try {
      j = raw ? (JSON.parse(raw) as typeof j) : null;
    } catch {
      j = null;
    }
    const errMsg = (j?.error?.message || (raw && !j ? raw : '') || '').trim();

    if (res.ok && j?.idToken) {
      const resolved = (j.email || email).trim();
      const matric = resolved.split('@')[0] || '';
      if (!matric) throw new Error('Could not read student ID from account.');
      const displayName =
        typeof j.displayName === 'string' && j.displayName.trim() !== '' ? j.displayName.trim() : undefined;
      const idToken = typeof j.idToken === 'string' && j.idToken.length > 10 ? j.idToken : '';
      if (!idToken) throw new Error('Could not obtain session from MyStudent login.');
      return { matric, email: resolved, displayName, idToken };
    }

    if (isRefererBlockedMessage(errMsg) || isRefererBlockedMessage(raw)) {
      lastRefererError = errMsg || raw;
      continue;
    }

    if (
      errMsg.includes('INVALID_PASSWORD') ||
      errMsg.includes('INVALID_LOGIN_CREDENTIALS') ||
      errMsg.includes('EMAIL_NOT_FOUND') ||
      errMsg.includes('INVALID_EMAIL')
    ) {
      throw new Error(
        'Invalid email or password. Use the same account as mystudent.uitm.edu.my (e.g. your student number as 2024xxxxxx@mystudent.uitm.edu.my).',
      );
    }
    throw new Error(errMsg || `Could not sign in to MyStudent (Firebase). HTTP ${res.status}`);
  }

  throw new Error(
    lastRefererError ||
      'MyStudent login is blocked by Google API key rules. Open Google Cloud Console → APIs & Services → Credentials → ' +
      'the browser API key for this Firebase project → Application restrictions: use “None” or add iOS/Android app IDs.',
  );
}

// ── Firestore pelajar doc ───────────────────────────────────

function firestoreValueToJs(v: unknown): unknown {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if ('nullValue' in o) return null;
  if (typeof o.stringValue === 'string') return o.stringValue;
  if (o.integerValue !== undefined) {
    if (typeof o.integerValue === 'string') return parseInt(o.integerValue, 10);
    if (typeof o.integerValue === 'number') return o.integerValue;
  }
  if (o.doubleValue !== undefined) {
    if (typeof o.doubleValue === 'number') return o.doubleValue;
    if (typeof o.doubleValue === 'string') return parseFloat(o.doubleValue);
  }
  if (typeof o.booleanValue === 'boolean') return o.booleanValue;
  if (o.mapValue && typeof o.mapValue === 'object') {
    const inner = (o.mapValue as { fields?: Record<string, unknown> }).fields;
    return firestoreFieldsToPlain(inner || {});
  }
  if (o.arrayValue && typeof o.arrayValue === 'object') {
    const vals = (o.arrayValue as { values?: unknown[] }).values;
    return Array.isArray(vals) ? vals.map(firestoreValueToJs) : [];
  }
  return undefined;
}

function firestoreFieldsToPlain(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fields)) {
    const j = firestoreValueToJs(val);
    if (j !== undefined) out[key] = j;
  }
  return out;
}

async function fetchPelajarFirestorePlain(matric: string, idToken: string): Promise<Record<string, unknown>> {
  const docSuffixes = ['@student.uitm.edu.my', '@mystudent.uitm.edu.my'];
  for (const suf of docSuffixes) {
    const docId = `${matric}${suf}`;
    const path = `projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/pelajar/${encodeURIComponent(docId)}`;
    const url = `https://firestore.googleapis.com/v1/${path}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { fields?: Record<string, unknown> };
      const plain = firestoreFieldsToPlain(json.fields || {});
      if (Object.keys(plain).length > 0) return plain;
    } catch {
      continue;
    }
  }
  return {};
}

function mapPelajarFirestoreToPortal(
  data: Record<string, unknown>,
  firebaseDisplayName?: string,
): Partial<MyStudentProfilePayload> {
  if (!data || Object.keys(data).length === 0) return {};
  const str = (k: string): string | undefined => {
    const v = data[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    return undefined;
  };
  const partSem = (): number | undefined => {
    const v = data.part;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 30) return Math.floor(v);
    if (typeof v === 'string') {
      const n = parseInt(v.trim(), 10);
      if (n > 0 && n < 30) return n;
    }
    return undefined;
  };
  const ps = partSem();
  const fullName = str('name') || str('nama') || str('nama_pelajar');
  return {
    fullName: fullName || firebaseDisplayName,
    program: str('program_desc') || str('program'),
    campus: str('campus_desc') || str('kampus'),
    faculty: str('faculty_desc') || str('fakulti'),
    studyMode: str('studymode_desc') || str('mod_pengajian'),
    semester: ps,
    part: ps,
    personalEmail: str('official_email') || str('emel') || str('email'),
  };
}

// ── CDN profile ─────────────────────────────────────────────

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
      const url = `https://cdn.uitm.link/${p}`;
      const res = await fetch(url);
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

// ── MyStudent profile HTML (SPA) ────────────────────────────

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, x) => String.fromCharCode(Number(x)))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMyStudentProfileHtml(html: string): Partial<MyStudentProfilePayload> {
  const out: Partial<MyStudentProfilePayload> = {};
  const afterLabel = (labels: string[]): string | undefined => {
    for (const label of labels) {
      const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const r1 = new RegExp(
        esc + '\\s*[:：]?\\s*</[^>]{0,48}>\\s*(?:<[^>]{0,48}>\\s*){0,4}([^<]{2,400})',
        'i',
      );
      let m = html.match(r1);
      if (m) {
        const t = decodeHtmlEntities(m[1]);
        if (t.length >= 2) return t;
      }
      const r2 = new RegExp(esc + '\\s*[:：]\\s*([^<\\n]{2,400})', 'i');
      m = html.match(r2);
      if (m) {
        const t = decodeHtmlEntities(m[1]);
        if (t.length >= 2) return t;
      }
    }
    return undefined;
  };
  out.campus = afterLabel(['Kampus', 'Campus']);
  out.faculty = afterLabel(['Fakulti', 'Faculty']);
  const prog = afterLabel(['Program']);
  if (prog) out.program = prog;
  out.studyMode = afterLabel(['Mod Pengajian', 'Mod']);
  const mail = html.match(/mailto:([^"'\s>]+)/i);
  if (mail) {
    try {
      out.personalEmail = decodeURIComponent(mail[1].trim());
    } catch {
      out.personalEmail = mail[1].trim();
    }
  }
  if (!out.personalEmail) {
    const em = afterLabel(['Emel', 'Email', 'E-mel']);
    if (em && em.includes('@')) out.personalEmail = em;
  }
  const sem =
    html.match(/Semester\s*<\/[^>]+>\s*<[^>]+>\s*(\d{1,2})/i) ||
    html.match(/Semester\s*[:：]\s*(\d{1,2})/i);
  if (sem) {
    const n = parseInt(sem[1], 10);
    if (n > 0 && n < 30) out.semester = n;
  }
  return out;
}

async function fetchMystudentProfileHtml(idToken: string): Promise<string | null> {
  for (const path of ['/profile', '/student/profile']) {
    try {
      const res = await fetch(`https://mystudent.uitm.edu.my${path}`, {
        redirect: 'follow',
        headers: {
          Authorization: `Bearer ${idToken}`,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        },
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.length > 1200) return text;
    } catch {
      continue;
    }
  }
  return null;
}

// ── Build combined profile ──────────────────────────────────

async function buildStudentPortalProfile(
  matric: string,
  firebaseDisplayName: string | undefined,
  idToken: string,
): Promise<MyStudentProfilePayload> {
  const [cdn, fsPlain] = await Promise.all([
    fetchMystudentProfileCdn(matric),
    fetchPelajarFirestorePlain(matric, idToken),
  ]);
  const fs = mapPelajarFirestoreToPortal(fsPlain, firebaseDisplayName);

  let web: Partial<MyStudentProfilePayload> = {};
  try {
    const html = await fetchMystudentProfileHtml(idToken);
    if (html) web = parseMyStudentProfileHtml(html);
  } catch {
    /* PWA may return shell without SSR — CDN/Firestore still used */
  }

  const semester = fs.semester ?? web.semester ?? cdn.semester;
  const part =
    fs.part ?? cdn.part ?? (semester != null && semester > 0 && semester < 20 ? semester : undefined);

  return {
    matric,
    fullName: fs.fullName || web.fullName || cdn.fullName || firebaseDisplayName,
    program: fs.program || web.program || cdn.program,
    part,
    campus: fs.campus || web.campus || cdn.campus,
    faculty: fs.faculty || web.faculty || cdn.faculty,
    studyMode: fs.studyMode || web.studyMode || cdn.studyMode,
    semester: semester ?? undefined,
    personalEmail: fs.personalEmail || web.personalEmail || cdn.personalEmail,
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
  return rows.map((r) => ({
    id: `uitm-${++idCounter}`,
    day: r.day,
    subjectCode: r.subjectCode,
    subjectName: r.subjectName,
    lecturer: r.lecturer || '-',
    startTime: r.startTime,
    endTime: r.endTime,
    location: r.location || '-',
    group: r.group || undefined,
  }));
}

// ── Public API ──────────────────────────────────────────────

/** Maps Edge `profile` into `profileDb.updateProfile` / AppContext `updateProfile` fields. */
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

export async function fetchUitmTimetable(
  emailOrMatric: string,
  password: string,
  courses?: string[],
): Promise<{
  entries: TimetableEntry[];
  coursesFound: string[];
  campus?: string;
  matric?: string;
  profile?: MyStudentProfilePayload;
}> {
  const firebaseEmail = toFirebaseEmail(emailOrMatric.trim());
  const { matric, displayName, idToken } = await firebaseSignIn(firebaseEmail, password);
  const profile = await buildStudentPortalProfile(matric, displayName, idToken);

  let rows = await fetchMystudentCdn(matric);

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

export async function fetchUitmProfileOnly(
  emailOrMatric: string,
  password: string,
): Promise<MyStudentProfilePayload> {
  const firebaseEmail = toFirebaseEmail(emailOrMatric.trim());
  const { matric, displayName, idToken } = await firebaseSignIn(firebaseEmail, password);
  return buildStudentPortalProfile(matric, displayName, idToken);
}

export function matricFromStudentLoginInput(input: string): string {
  const t = input.trim();
  if (!t) return t;
  const at = t.indexOf('@');
  return at === -1 ? t : t.slice(0, at);
}
