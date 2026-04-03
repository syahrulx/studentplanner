import type { UniversityConfig } from '../types';

/**
 * Predefined list of Malaysian universities.
 * Each entry includes the student portal URL used for WebView login.
 * Add new universities by appending to this array + creating a parser.
 */
export const UNIVERSITIES: UniversityConfig[] = [
  {
    id: 'uitm',
    name: 'Universiti Teknologi MARA',
    shortName: 'UiTM',
    loginUrl: 'https://mystudent.uitm.edu.my/login',
    timetableUrl: 'https://mystudent.uitm.edu.my/timetable',
    mode: 'api',
    logoEmoji: '🏛️',
  },
  {
    id: 'um',
    name: 'Universiti Malaya',
    shortName: 'UM',
    loginUrl: 'https://maya.um.edu.my/',
    mode: 'webview',
    logoEmoji: '🎓',
  },
  {
    id: 'utm',
    name: 'Universiti Teknologi Malaysia',
    shortName: 'UTM',
    loginUrl: 'https://asis.utm.my/',
    mode: 'webview',
    logoEmoji: '🔧',
  },
  {
    id: 'ukm',
    name: 'Universiti Kebangsaan Malaysia',
    shortName: 'UKM',
    loginUrl: 'https://smpweb.ukm.my/',
    mode: 'webview',
    logoEmoji: '📘',
  },
  {
    id: 'upm',
    name: 'Universiti Putra Malaysia',
    shortName: 'UPM',
    loginUrl: 'https://smp.upm.edu.my/',
    mode: 'webview',
    logoEmoji: '🌿',
  },
  {
    id: 'usm',
    name: 'Universiti Sains Malaysia',
    shortName: 'USM',
    loginUrl: 'https://campusonline.usm.my/',
    mode: 'webview',
    logoEmoji: '🔬',
  },
  {
    id: 'uiam',
    name: 'Universiti Islam Antarabangsa Malaysia',
    shortName: 'UIAM',
    loginUrl: 'https://i-ma3lum.iium.edu.my/',
    mode: 'webview',
    logoEmoji: '🕌',
  },
  {
    id: 'unimas',
    name: 'Universiti Malaysia Sarawak',
    shortName: 'UNIMAS',
    loginUrl: 'https://icress.unimas.my/',
    mode: 'webview',
    logoEmoji: '🌴',
  },
  {
    id: 'ums',
    name: 'Universiti Malaysia Sabah',
    shortName: 'UMS',
    loginUrl: 'https://ems.ums.edu.my/',
    mode: 'webview',
    logoEmoji: '🏔️',
  },
  {
    id: 'upsi',
    name: 'Universiti Pendidikan Sultan Idris',
    shortName: 'UPSI',
    loginUrl: 'https://smp.upsi.edu.my/',
    mode: 'webview',
    logoEmoji: '📚',
  },
  {
    id: 'uthm',
    name: 'Universiti Tun Hussein Onn Malaysia',
    shortName: 'UTHM',
    loginUrl: 'https://elearning.uthm.edu.my/',
    mode: 'webview',
    logoEmoji: '⚙️',
  },
  {
    id: 'umt',
    name: 'Universiti Malaysia Terengganu',
    shortName: 'UMT',
    loginUrl: 'https://smp.umt.edu.my/',
    mode: 'webview',
    logoEmoji: '🌊',
  },
  {
    id: 'unimap',
    name: 'Universiti Malaysia Perlis',
    shortName: 'UniMAP',
    loginUrl: 'https://epelajar.unimap.edu.my/',
    mode: 'webview',
    logoEmoji: '🏗️',
  },
  {
    id: 'ump',
    name: 'Universiti Malaysia Pahang Al-Sultan Abdullah',
    shortName: 'UMP',
    loginUrl: 'https://smp.ump.edu.my/',
    mode: 'webview',
    logoEmoji: '🏭',
  },
  {
    id: 'unisel',
    name: 'Universiti Selangor',
    shortName: 'UNISEL',
    loginUrl: 'https://sims.unisel.edu.my/',
    mode: 'webview',
    logoEmoji: '🎯',
  },
  {
    id: 'mmu',
    name: 'Multimedia University',
    shortName: 'MMU',
    loginUrl: 'https://cams2.mmu.edu.my/',
    mode: 'webview',
    logoEmoji: '💻',
  },
  {
    id: 'uniten',
    name: 'Universiti Tenaga Nasional',
    shortName: 'UNITEN',
    loginUrl: 'https://ecitie.uniten.edu.my/',
    mode: 'webview',
    logoEmoji: '⚡',
  },
  {
    id: 'utp',
    name: 'Universiti Teknologi PETRONAS',
    shortName: 'UTP',
    loginUrl: 'https://uis.utp.edu.my/',
    mode: 'webview',
    logoEmoji: '🛢️',
  },
  {
    id: 'taylors',
    name: "Taylor's University",
    shortName: "Taylor's",
    loginUrl: 'https://erp.taylors.edu.my/',
    mode: 'webview',
    logoEmoji: '🌟',
  },
  {
    id: 'sunway',
    name: 'Sunway University',
    shortName: 'Sunway',
    loginUrl: 'https://elearn.sunway.edu.my/',
    mode: 'webview',
    logoEmoji: '☀️',
  },
];

export function searchUniversities(query: string): UniversityConfig[] {
  const q = query.trim().toLowerCase();
  if (!q) return UNIVERSITIES;
  return UNIVERSITIES.filter(
    (u) =>
      u.name.toLowerCase().includes(q) ||
      u.shortName.toLowerCase().includes(q) ||
      u.id.includes(q),
  );
}

export function getUniversityById(id: string): UniversityConfig | undefined {
  return UNIVERSITIES.find((u) => u.id === id);
}

/**
 * UiTM-only: map stored profile `university` label to portal id for calendar auto-sync.
 * Matches the name we save from the picker or common variants.
 */
export function inferUniversityIdFromUniversityName(
  universityName: string | undefined | null,
): string | undefined {
  const n = (universityName ?? '').trim().toLowerCase();
  if (!n) return undefined;
  const uitm = UNIVERSITIES.find((u) => u.id === 'uitm');
  if (!uitm) return undefined;
  if (n === uitm.name.toLowerCase()) return 'uitm';
  if (n.includes('teknologi mara')) return 'uitm';
  if (/\buitm\b/.test(n)) return 'uitm';
  return undefined;
}

/** Resolve portal university id for calendar features (explicit profile/connection, then UiTM heuristics). */
export function resolveUniversityIdForCalendar(opts: {
  profileUniversityId?: string | null;
  connectionUniversityId?: string | null;
  studentId?: string | null;
  universityName?: string | null;
}): string | undefined {
  const a = (opts.profileUniversityId ?? '').trim();
  if (a) return a;
  const b = (opts.connectionUniversityId ?? '').trim();
  if (b) return b;
  const sid = (opts.studentId ?? '').trim();
  if (sid && /^\d{10,}$/.test(sid)) return 'uitm';
  return inferUniversityIdFromUniversityName(opts.universityName);
}

export type UniversityItem = UniversityConfig;

export async function getMalaysianUniversities(): Promise<UniversityItem[]> {
  return UNIVERSITIES;
}
