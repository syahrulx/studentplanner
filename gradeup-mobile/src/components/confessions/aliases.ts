// The server labels a confession's commenters "OP" / "Anon 1", "Anon 2"… in
// order of first comment. We map those to nicknames so a thread reads like
// people talking rather than a numbered list.
//
// Two rules make this work:
//
//   1. Stable within a thread. The mapping is seeded by the confession id, so
//      the same person keeps the same name for the whole conversation and a
//      reply can say who it is answering.
//   2. Different between threads. The same person posting again gets a
//      different name, because the seed changes with the confession. That is
//      the point: a name that followed someone across confessions would let
//      anyone join their posts together, which is the one thing an anonymous
//      board must not allow.
//
// Nothing here reveals anything the numbered label did not.

const NAMES = [
  // food
  'Teh Tarik', 'Roti Canai', 'Nasi Lemak', 'Milo Ais', 'Kopi O', 'Cendol',
  'Maggi Kari', 'Pisang Goreng', 'Kuih Lapis', 'Ayam Gepuk', 'Air Sirap',
  'Sambal Ijo', 'Keropok Lekor', 'Laksa', 'Burger Ramly', 'Kek Batik',
  'Karipap', 'Mee Goreng', 'Satay', 'Tempoyak', 'Rojak', 'Apam Balik',
  'Nescafe Ais', 'Murtabak Goreng', 'Nasi Kerabu', 'Roti John', 'Teh Ais',
  'Bubur Lambuk',
  // animals
  'Kucing Oren', 'Kancil Hijau', 'Monyet Kampus', 'Burung Hantu', 'Ikan Keli',
  'Musang Biru', 'Kura Kura', 'Rusa Senja', 'Helang Petang', 'Siamang Pagi',
  // things around campus
  'Payung Merah', 'Basikal Tua', 'Kipas Rosak', 'Lampu Suluh', 'Beg Galas',
  'Kasut Putih', 'Topi Hitam', 'Jam Dinding', 'Pensel Pendek', 'Botol Air',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Pick the nth name for a thread.
 *
 * Slot 0 belongs to whoever wrote the confession, so commenters start at 1.
 * Without that offset the author and the first commenter drew the same name
 * and a thread had two people answering to "Laksa".
 */
function nameAt(confessionId: string, slot: number): string {
  const name = NAMES[(hash(confessionId) + slot) % NAMES.length];
  const lap = Math.floor(slot / NAMES.length);
  return lap > 0 ? `${name} ${lap + 1}` : name;
}

export function isOpAlias(alias: string): boolean {
  return alias === 'OP';
}

/** The name the person who wrote the confession goes by, in this thread only. */
export function authorAlias(confessionId: string): string {
  return nameAt(confessionId, 0);
}

/** "OP" → the author's name; "Anon 3" → that commenter's name. */
export function friendlyAlias(alias: string, confessionId: string): string {
  if (isOpAlias(alias)) return authorAlias(confessionId);
  const m = /^Anon (\d+)$/.exec(alias);
  if (!m) return alias;
  return nameAt(confessionId, Number(m[1]));
}
