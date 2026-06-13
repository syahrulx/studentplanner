// Pure, framework-free 2048 game engine. No React Native imports so it can be
// unit-tested directly in Node. The screen layer owns tile identity (ids) and
// animation; this module only computes board transitions and game state.

export const SIZE = 4;
export const WIN_VALUE = 2048;

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Tile {
  id: number;
  value: number;
  row: number;
  col: number;
  /** Set on tiles spawned this turn (drives the scale-in animation). */
  isNew?: boolean;
  /** Set on the surviving tile of a merge this turn (drives the pop animation). */
  merged?: boolean;
}

export interface MoveResult {
  /** Tiles that remain on the board after the move (survivors, merged values applied). */
  tiles: Tile[];
  /** Source tiles that merged away — kept one frame so they can slide into the
   *  destination cell, then dropped by the screen. */
  ghosts: Tile[];
  /** Whether anything actually moved/merged (an invalid move must not spawn). */
  moved: boolean;
  /** Points gained this move (sum of every merged tile's resulting value). */
  gained: number;
}

const VECT: Record<Direction, { r: number; c: number }> = {
  up: { r: -1, c: 0 },
  down: { r: 1, c: 0 },
  left: { r: 0, c: -1 },
  right: { r: 0, c: 1 },
};

function emptyGrid(): (Tile | null)[][] {
  return Array.from({ length: SIZE }, () => Array<Tile | null>(SIZE).fill(null));
}

function traversals(dir: Direction): { rows: number[]; cols: number[] } {
  const rows = [0, 1, 2, 3];
  const cols = [0, 1, 2, 3];
  // Process tiles closest to the target edge first so they settle correctly.
  return {
    rows: dir === 'down' ? [...rows].reverse() : rows,
    cols: dir === 'right' ? [...cols].reverse() : cols,
  };
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

/** Apply a swipe. Returns survivors + ghosts + whether it changed + points gained. */
export function move(tiles: Tile[], dir: Direction): MoveResult {
  const grid = emptyGrid();
  for (const t of tiles) {
    grid[t.row][t.col] = { ...t, isNew: false, merged: false };
  }

  const v = VECT[dir];
  const { rows, cols } = traversals(dir);
  const ghosts: Tile[] = [];
  let moved = false;
  let gained = 0;

  for (const r of rows) {
    for (const c of cols) {
      const tile = grid[r][c];
      if (!tile) continue;

      // Slide as far as possible into empty cells.
      let nr = r;
      let nc = c;
      while (true) {
        const tr = nr + v.r;
        const tc = nc + v.c;
        if (!inBounds(tr, tc) || grid[tr][tc] !== null) break;
        nr = tr;
        nc = tc;
      }

      // Cell blocking further travel — merge candidate.
      const br = nr + v.r;
      const bc = nc + v.c;
      const blocker = inBounds(br, bc) ? grid[br][bc] : null;

      if (blocker && blocker.value === tile.value && !blocker.merged) {
        blocker.value *= 2;
        blocker.merged = true;
        gained += blocker.value;
        grid[r][c] = null;
        // The source tile slides onto the blocker's cell, then is removed.
        ghosts.push({ ...tile, row: br, col: bc, isNew: false, merged: false });
        moved = true;
      } else if (nr !== r || nc !== c) {
        grid[nr][nc] = tile;
        grid[r][c] = null;
        tile.row = nr;
        tile.col = nc;
        moved = true;
      }
    }
  }

  const survivors: Tile[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid[r][c];
      if (t) survivors.push(t);
    }
  }

  return { tiles: survivors, ghosts, moved, gained };
}

/** Pick a random empty cell and return a new tile (90% → 2, 10% → 4). */
export function spawnTile(
  tiles: Tile[],
  nextId: number,
  rng: () => number = Math.random,
): Tile | null {
  const occupied = new Set(tiles.map((t) => t.row * SIZE + t.col));
  const empties: number[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (!occupied.has(i)) empties.push(i);
  }
  if (empties.length === 0) return null;
  const pick = empties[Math.floor(rng() * empties.length)];
  const value = rng() < 0.9 ? 2 : 4;
  return { id: nextId, value, row: Math.floor(pick / SIZE), col: pick % SIZE, isNew: true };
}

/** A fresh board with two starting tiles. */
export function createInitialTiles(rng: () => number = Math.random): { tiles: Tile[]; nextId: number } {
  let nextId = 1;
  const tiles: Tile[] = [];
  const a = spawnTile(tiles, nextId++, rng);
  if (a) tiles.push(a);
  const b = spawnTile(tiles, nextId++, rng);
  if (b) tiles.push(b);
  return { tiles, nextId };
}

/** No empty cell and no adjacent equal pair → no moves left. */
export function isGameOver(tiles: Tile[]): boolean {
  if (tiles.length < SIZE * SIZE) return false;
  const grid = emptyGrid();
  for (const t of tiles) grid[t.row][t.col] = t;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const val = grid[r][c]!.value;
      if (c + 1 < SIZE && grid[r][c + 1] && grid[r][c + 1]!.value === val) return false;
      if (r + 1 < SIZE && grid[r + 1][c] && grid[r + 1][c]!.value === val) return false;
    }
  }
  return true;
}

export function bestTileValue(tiles: Tile[]): number {
  return tiles.reduce((max, t) => Math.max(max, t.value), 0);
}

export function hasReached(tiles: Tile[], value: number): boolean {
  return tiles.some((t) => t.value >= value);
}
