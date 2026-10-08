/**
 * The nicknames students see in a confession thread.
 *
 * A COPY of gradeup-mobile/src/components/confessions/aliases.ts. The two have
 * to agree exactly: an admin reading a reported thread needs to see the names
 * the reporter saw, or a report naming "Kancil Hijau" points at nobody. They
 * are duplicated rather than shared because the app and this console are
 * separate packages with no common module.
 *
 * If you change the list or the hash, change it in both places.
 */

const NAMES = [
  'Teh Tarik', 'Roti Canai', 'Nasi Lemak', 'Milo Ais', 'Kopi O', 'Cendol',
  'Maggi Kari', 'Pisang Goreng', 'Kuih Lapis', 'Ayam Gepuk', 'Air Sirap',
  'Sambal Ijo', 'Keropok Lekor', 'Laksa', 'Burger Ramly', 'Kek Batik',
  'Karipap', 'Mee Goreng', 'Satay', 'Tempoyak', 'Rojak', 'Apam Balik',
  'Nescafe Ais', 'Murtabak Goreng', 'Nasi Kerabu', 'Roti John', 'Teh Ais',
  'Bubur Lambuk',
  'Kucing Oren', 'Kancil Hijau', 'Monyet Kampus', 'Burung Hantu', 'Ikan Keli',
  'Musang Biru', 'Kura Kura', 'Rusa Senja', 'Helang Petang', 'Siamang Pagi',
  'Payung Merah', 'Basikal Tua', 'Kipas Rosak', 'Lampu Suluh', 'Beg Galas',
  'Kasut Putih', 'Topi Hitam', 'Jam Dinding', 'Pensel Pendek', 'Botol Air',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Slot 0 is the author; commenters start at 1. */
function nameAt(confessionId: string, slot: number): string {
  const name = NAMES[(hash(confessionId) + slot) % NAMES.length];
  const lap = Math.floor(slot / NAMES.length);
  return lap > 0 ? `${name} ${lap + 1}` : name;
}

export function authorAlias(confessionId: string): string {
  return nameAt(confessionId, 0);
}

/** "OP" → the author's name; "Anon 3" → that commenter's name. */
export function friendlyAlias(alias: string | null | undefined, confessionId: string): string {
  if (!alias) return '—';
  if (alias === 'OP') return authorAlias(confessionId);
  const m = /^Anon (\d+)$/.exec(alias);
  if (!m) return alias;
  return nameAt(confessionId, Number(m[1]));
}
