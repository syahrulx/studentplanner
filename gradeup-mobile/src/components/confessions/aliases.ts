// Server labels commenters "OP" / "Anon 1", "Anon 2"… in order of first
// comment. We map those to local nicknames so a thread reads like people, not
// row numbers. The mapping is stable per confession (seeded by its id) and
// never reveals anything the numbered label didn't.

const NAMES = [
  'Teh Tarik', 'Roti Canai', 'Kucing Oren', 'Nasi Lemak', 'Milo Ais', 'Kopi O',
  'Cendol', 'Maggi Kari', 'Pisang Goreng', 'Kuih Lapis', 'Ayam Gepuk', 'Air Sirap',
  'Sambal Ijo', 'Keropok Lekor', 'Laksa', 'Burger Ramly', 'Kek Batik', 'Karipap',
  'Mee Goreng', 'Satay', 'Tempoyak', 'Rojak', 'Apam Balik', 'Nescafe Ais',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function isOpAlias(alias: string): boolean {
  return alias === 'OP';
}

/** "Anon 3" → "Kucing Oren" (distinct within a thread for the first 24 commenters). */
export function friendlyAlias(alias: string, confessionId: string): string {
  const m = /^Anon (\d+)$/.exec(alias);
  if (!m) return alias;
  const n = Number(m[1]) - 1;
  const name = NAMES[(hash(confessionId) + n) % NAMES.length];
  const lap = Math.floor(n / NAMES.length);
  return lap > 0 ? `${name} ${lap + 1}` : name;
}
