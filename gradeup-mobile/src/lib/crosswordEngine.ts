import { CROSSWORD_PUZZLES, type CrosswordPuzzle, type CrosswordClue, type CrosswordDir } from './crosswordPuzzles';

export { CROSSWORD_PUZZLES };
export type { CrosswordPuzzle, CrosswordClue, CrosswordDir };

export const TOTAL_PUZZLES = CROSSWORD_PUZZLES.length;

export interface CellInfo {
  row: number;
  col: number;
  block: boolean;
  solution: string | null;
  /** Start number shown in the top-left of the cell, if it starts a word. */
  number: number | null;
  /** Index (into puzzle.clues) of the across word covering this cell, if any. */
  acrossClue: number | null;
  /** Index (into puzzle.clues) of the down word covering this cell, if any. */
  downClue: number | null;
}

const dirDelta = (dir: CrosswordDir): [number, number] => (dir === 'across' ? [0, 1] : [1, 0]);

/** Cells (row,col) covered by a clue's answer. */
export function clueCells(clue: CrosswordClue): { row: number; col: number }[] {
  const [dr, dc] = dirDelta(clue.direction);
  const out: { row: number; col: number }[] = [];
  for (let i = 0; i < clue.answer.length; i++) out.push({ row: clue.row + dr * i, col: clue.col + dc * i });
  return out;
}

/** Build a size×size grid of cell descriptors for rendering and navigation. */
export function buildCells(puzzle: CrosswordPuzzle): CellInfo[][] {
  const n = puzzle.size;
  const cells: CellInfo[][] = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => ({
      row: r,
      col: c,
      block: puzzle.solution[r][c] === null,
      solution: puzzle.solution[r][c],
      number: null as number | null,
      acrossClue: null as number | null,
      downClue: null as number | null,
    })),
  );

  puzzle.clues.forEach((clue, idx) => {
    const start = cells[clue.row][clue.col];
    start.number = clue.number;
    for (const { row, col } of clueCells(clue)) {
      const cell = cells[row][col];
      if (clue.direction === 'across') cell.acrossClue = idx;
      else cell.downClue = idx;
    }
  });

  return cells;
}

/** True if every non-block cell matches the solution. `entries` is size×size. */
export function isComplete(puzzle: CrosswordPuzzle, entries: string[][]): boolean {
  for (let r = 0; r < puzzle.size; r++) {
    for (let c = 0; c < puzzle.size; c++) {
      const sol = puzzle.solution[r][c];
      if (sol === null) continue;
      if ((entries[r]?.[c] || '') !== sol) return false;
    }
  }
  return true;
}

/** True if the answer for clues[clueIdx] is fully and correctly filled. */
export function isClueCorrect(puzzle: CrosswordPuzzle, clueIdx: number, entries: string[][]): boolean {
  const clue = puzzle.clues[clueIdx];
  if (!clue) return false;
  for (const { row, col } of clueCells(clue)) {
    if ((entries[row]?.[col] || '') !== puzzle.solution[row][col]) return false;
  }
  return true;
}

/** True if `guess` matches the puzzle's hidden bonus word (case/space-insensitive). */
export function checkBonusGuess(puzzle: CrosswordPuzzle, guess: string): boolean {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '');
  if (!puzzle.bonusWord) return false;
  return norm(guess) === norm(puzzle.bonusWord);
}

export function getPuzzle(id: number): CrosswordPuzzle | undefined {
  return CROSSWORD_PUZZLES.find((p) => p.id === id);
}
