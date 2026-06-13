/**
 * Crossword generator for the 7x7 mini crossword mini-game.
 *
 * Uses a "criss-cross" interlocking layout (not a dense American fill): words
 * are placed one at a time so each new word crosses an already-placed word at a
 * shared letter. Cells not covered by any word are blocks. This is robust and
 * always produces valid puzzles (every white cell belongs to a real word).
 *
 * Run:  npx tsx scripts/genCrossword.ts            (verify + print grids)
 *       npx tsx scripts/genCrossword.ts --write     (also emit data files)
 *
 * Output data files (generated, do not hand-edit):
 *   - src/lib/crosswordPuzzles.ts        (consumed by the app)
 *   - ../admin-web/src/data/crosswordPuzzles.json  (consumed by admin web)
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES, type Theme } from './crosswordBanks';

const SIZE = 7;
type Dir = 'across' | 'down';
type Grid = (string | null)[][];

interface Placed {
  answer: string;
  clue: string;
  row: number;
  col: number;
  dir: Dir;
}

/** The hidden bonus word for a theme — never placed in the grid. */
function bonusWordOf(theme: Theme): string {
  return theme.bonus.toUpperCase().replace(/[^A-Z]/g, '');
}

// ---- deterministic RNG so output is stable across runs ----
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));
}

function inBounds(r: number, c: number) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

const delta = (dir: Dir): [number, number] => (dir === 'across' ? [0, 1] : [1, 0]);

/** Can `word` be placed at (row,col) going `dir`? Returns crossings count or -1. */
function canPlace(grid: Grid, word: string, row: number, col: number, dir: Dir): number {
  const [dr, dc] = delta(dir);
  const [pr, pc] = [dr, dc]; // perpendicular handled below
  let crossings = 0;

  // Cell immediately before the start and after the end must be empty/edge so
  // we never merge two collinear words into one longer (invalid) word.
  const beforeR = row - dr;
  const beforeC = col - dc;
  if (inBounds(beforeR, beforeC) && grid[beforeR][beforeC] !== null) return -1;
  const afterR = row + dr * word.length;
  const afterC = col + dc * word.length;
  if (inBounds(afterR, afterC) && grid[afterR][afterC] !== null) return -1;

  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    if (!inBounds(r, c)) return -1;
    const cell = grid[r][c];
    if (cell !== null) {
      if (cell !== word[i]) return -1; // conflict
      crossings++;
      continue; // crossing cell: perpendicular neighbours belong to the other word, ok
    }
    // New (empty) cell: its perpendicular neighbours must be empty, otherwise we
    // would create an unintended adjacency/parallel word.
    const perp: [number, number][] =
      dir === 'across'
        ? [[r - 1, c], [r + 1, c]]
        : [[r, c - 1], [r, c + 1]];
    for (const [nr, nc] of perp) {
      if (inBounds(nr, nc) && grid[nr][nc] !== null) return -1;
    }
  }
  // suppress unused
  void pr; void pc;
  return crossings;
}

function placeWord(grid: Grid, word: string, row: number, col: number, dir: Dir) {
  const [dr, dc] = delta(dir);
  for (let i = 0; i < word.length; i++) grid[row + dr * i][col + dc * i] = word[i];
}

/** One attempt at building a layout from a shuffled candidate ordering. */
function attempt(theme: Theme, rnd: () => number): { placed: Placed[]; filled: number } {
  const bonus = bonusWordOf(theme);
  const candidates = theme.entries
    .map((e) => ({ ...e, word: e.word.toUpperCase().replace(/[^A-Z]/g, '') }))
    // The bonus word stays hidden — never place it in the grid.
    .filter((e) => e.word.length >= 3 && e.word.length <= SIZE && e.word !== bonus);

  const ordered = shuffle(candidates, rnd).sort((a, b) => b.word.length - a.word.length);
  const grid = emptyGrid();
  const placed: Placed[] = [];

  // Seed: longest word, horizontal, roughly centered.
  const first = ordered[0];
  if (!first) return { placed: [], filled: 0 };
  const startCol = Math.floor((SIZE - first.word.length) / 2);
  placeWord(grid, first.word, 3, startCol, 'across');
  placed.push({ answer: first.word, clue: first.clue, row: 3, col: startCol, dir: 'across' });

  const remaining = shuffle(ordered.slice(1), rnd);
  // Multiple passes so words that couldn't cross early can attach later.
  for (let pass = 0; pass < 5; pass++) {
    for (const cand of remaining) {
      if (placed.some((p) => p.answer === cand.word)) continue;
      const options: { row: number; col: number; dir: Dir; crossings: number }[] = [];
      for (let i = 0; i < cand.word.length; i++) {
        for (let r = 0; r < SIZE; r++) {
          for (let c = 0; c < SIZE; c++) {
            if (grid[r][c] !== cand.word[i]) continue;
            for (const dir of ['across', 'down'] as Dir[]) {
              const [dr, dc] = delta(dir);
              const sr = r - dr * i;
              const sc = c - dc * i;
              const x = canPlace(grid, cand.word, sr, sc, dir);
              if (x >= 1) options.push({ row: sr, col: sc, dir, crossings: x });
            }
          }
        }
      }
      if (options.length === 0) continue;
      // Prefer denser/central, but pick from the top few at random so the
      // multi-seed search explores genuinely different layouts.
      options.sort((a, b) => b.crossings - a.crossings || centerBias(a) - centerBias(b));
      const topK = options.slice(0, Math.min(3, options.length));
      const choice = topK[Math.floor(rnd() * topK.length)];
      placeWord(grid, cand.word, choice.row, choice.col, choice.dir);
      placed.push({ answer: cand.word, clue: cand.clue, row: choice.row, col: choice.col, dir: choice.dir });
    }
  }

  let filled = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (grid[r][c] !== null) filled++;
  return { placed, filled };
}

function centerBias(o: { row: number; col: number }) {
  return Math.abs(o.row - 3) + Math.abs(o.col - 3);
}

function buildPuzzle(theme: Theme, id: number) {
  let best: Placed[] = [];
  let bestScore = -1;
  for (let seed = 1; seed <= 1500; seed++) {
    const rnd = mulberry32(id * 100000 + seed);
    const { placed, filled } = attempt(theme, rnd);
    // Maximize word count first, then density (filled cells) as a tiebreak.
    const score = placed.length * 1000 + filled;
    if (score > bestScore) {
      bestScore = score;
      best = placed;
    }
  }
  return best;
}

interface OutClue {
  number: number;
  direction: Dir;
  clue: string;
  answer: string;
  row: number;
  col: number;
}
interface OutPuzzle {
  id: number;
  title: string;
  size: number;
  solution: (string | null)[][];
  clues: OutClue[];
  /** Hidden bonus word — not part of the grid. Players guess it for extra points. */
  bonusWord: string;
  /** Subtle hint shown for the hidden bonus word. */
  bonusHint: string;
}

function finalize(theme: Theme, id: number, placed: Placed[]): OutPuzzle {
  // The hidden bonus word never appears in the grid; its hint defaults to the
  // word's own clue from the bank, or a generic theme hint.
  const bonusAnswer = bonusWordOf(theme);
  const bankClue = theme.entries.find((e) => e.word.toUpperCase().replace(/[^A-Z]/g, '') === bonusAnswer)?.clue;
  const bonusHint = theme.bonusHint || bankClue || `A hidden ${theme.title.toLowerCase()} word`;

  // Build solution grid.
  const grid = emptyGrid();
  for (const p of placed) placeWord(grid, p.answer, p.row, p.col, p.dir);

  // Number start cells in row-major order.
  const startKey = (r: number, c: number) => `${r},${c}`;
  const starts = new Set(placed.map((p) => startKey(p.row, p.col)));
  const numberOf = new Map<string, number>();
  let n = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (starts.has(startKey(r, c))) numberOf.set(startKey(r, c), ++n);
    }
  }

  const clues: OutClue[] = placed
    .map((p) => ({
      number: numberOf.get(startKey(p.row, p.col))!,
      direction: p.dir,
      clue: p.clue,
      answer: p.answer,
      row: p.row,
      col: p.col,
    }))
    .sort((a, b) => a.number - b.number || (a.direction === b.direction ? 0 : a.direction === 'across' ? -1 : 1));

  return { id, title: theme.title, size: SIZE, solution: grid, clues, bonusWord: bonusAnswer, bonusHint };
}

function asciiPreview(p: OutPuzzle): string {
  return p.solution
    .map((row) => row.map((ch) => (ch ? ch : '·')).join(' '))
    .join('\n');
}

// ───────────────────────────── run ─────────────────────────────
const write = process.argv.includes('--write');
const puzzles: OutPuzzle[] = [];
let minWords = 99;
const report: string[] = [];

THEMES.forEach((theme, idx) => {
  const id = idx + 1;
  const placed = buildPuzzle(theme, id);
  const pz = finalize(theme, id, placed);
  puzzles.push(pz);
  minWords = Math.min(minWords, pz.clues.length);
  report.push(
    `#${id} ${theme.title}: ${pz.clues.length} words, bonus="${pz.bonusWord}"` +
      (pz.clues.length < 6 ? '  <-- LOW' : ''),
  );
  if (write) {
    // also print previews when writing for spot-checking
  }
});

console.log(report.join('\n'));
console.log(`\nTotal puzzles: ${puzzles.length}, fewest words in a puzzle: ${minWords}`);

// Print a couple of previews for eyeballing.
for (const id of [1, 2, 3]) {
  const p = puzzles.find((x) => x.id === id);
  if (!p) continue;
  console.log(`\n=== Puzzle #${p.id} — ${p.title} (${p.clues.length} words) ===`);
  console.log(asciiPreview(p));
  console.log(`  Hidden bonus: ${p.bonusWord} — ${p.bonusHint}`);
  for (const c of p.clues) {
    console.log(`  ${c.number}${c.direction[0].toUpperCase()} ${c.answer} — ${c.clue}`);
  }
}

if (write) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const tsOut = resolve(__dirname, '../src/lib/crosswordPuzzles.ts');
  const adminOut = resolve(__dirname, '../../admin-web/src/data/crosswordPuzzles.ts');

  const header = `// AUTO-GENERATED by scripts/genCrossword.ts — do not edit by hand.\n// 7x7 mini crosswords for the Crossword mini-game.\n`;
  const types = `export type CrosswordDir = 'across' | 'down';
export interface CrosswordClue {
  number: number;
  direction: CrosswordDir;
  clue: string;
  answer: string;
  row: number;
  col: number;
}
export interface CrosswordPuzzle {
  id: number;
  title: string;
  size: number;
  solution: (string | null)[][];
  clues: CrosswordClue[];
  /** Hidden bonus word — not part of the grid. Players guess it for extra points. */
  bonusWord: string;
  /** Subtle hint shown for the hidden bonus word. */
  bonusHint: string;
}
`;
  const body = `export const CROSSWORD_PUZZLES: CrosswordPuzzle[] = ${JSON.stringify(puzzles, null, 2)};\n`;
  const full = header + types + '\n' + body;
  writeFileSync(tsOut, full);
  const adminDir = dirname(adminOut);
  if (existsSync(resolve(adminDir, '..'))) {
    mkdirSync(adminDir, { recursive: true });
    writeFileSync(adminOut, full);
    console.log(`\nWrote ${tsOut}\nWrote ${adminOut}`);
  } else {
    console.log(`\nWrote ${tsOut}\n(skipped admin copy: ${adminDir} parent missing)`);
  }
}
