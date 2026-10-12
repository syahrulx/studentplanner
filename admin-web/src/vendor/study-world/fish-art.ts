/**
 * Pixel art for Study World fish. Rarer fish are drawn bigger; ultra rare
 * fish have moving patterns and a glow (drawn with drawFishGlow). Plain code,
 * no React or Supabase, so the admin website can copy it too.
 */

export type FishArtKey =
  | "minnow"
  | "tilapia"
  | "carp"
  | "koi"
  | "toman"
  | "gourami"
  | "starkoi"
  | "thunder"
  | "dragon";
type Grid = (string | null)[][];

export const FISH_GRID_W = 24;
export const FISH_GRID_H = 12;

type Style = {
  len: number;
  tall: number;
  body: string;
  belly: string;
  fin: string;
  glow?: string;
  pattern?: (x: number, y: number, t: number, top: number, bottom: number) => string | null;
};

const STYLES: Record<FishArtKey, Style> = {
  minnow: {
    len: 11,
    tall: 4,
    body: "#c9d3dc",
    belly: "#eef3f7",
    fin: "#9fb0be",
    pattern: (x, y, _t, top, bottom) =>
      y === Math.round((top + bottom) / 2) && x % 2 ? "#8094a8" : null,
  },
  tilapia: {
    len: 12,
    tall: 6,
    body: "#7f8f6a",
    belly: "#c9cfb0",
    fin: "#5f6b4c",
    pattern: (x) => (x % 3 === 0 ? "#66754f" : null),
  },
  carp: {
    len: 13,
    tall: 6,
    body: "#c9a14a",
    belly: "#ead49c",
    fin: "#9a7a30",
    pattern: (x, y) => ((x + y) % 3 === 0 ? "#b48c38" : null),
  },
  koi: {
    len: 15,
    tall: 7,
    body: "#f4f1ea",
    belly: "#ffffff",
    fin: "#f4a35a",
    pattern: (x, y) => ((x * 3 + y * 5) % 7 < 3 ? "#f28c28" : null),
  },
  toman: {
    len: 17,
    tall: 6,
    body: "#4d5a3a",
    belly: "#a8b08a",
    fin: "#38432a",
    pattern: (x, y) => ((x + y * 2) % 5 === 0 ? "#2f3824" : null),
  },
  gourami: {
    len: 16,
    tall: 9,
    body: "#b8b0a0",
    belly: "#e2dccb",
    fin: "#8f8676",
    pattern: (x, y) => (x % 4 === 0 && y % 2 ? "#a39a89" : null),
  },
  starkoi: {
    len: 19,
    tall: 9,
    body: "#2c3e9a",
    belly: "#5b7be0",
    fin: "#58e1ff",
    glow: "88,225,255",
    pattern: (x, y, t) =>
      (x * 7 + y * 11) % 9 === 0 && Math.sin(t / 220 + x + y) > 0 ? "#fff6c8" : null,
  },
  thunder: {
    len: 21,
    tall: 9,
    body: "#3a3f5a",
    belly: "#6b6f8f",
    fin: "#ffd84d",
    glow: "255,216,77",
    pattern: (x, y, t, top, bottom) => {
      const mid = Math.round((top + bottom) / 2);
      const zig = mid + ((x + Math.floor(t / 120)) % 4 < 2 ? -1 : 0);
      return y === zig ? "#ffe97a" : null;
    },
  },
  dragon: {
    len: 22,
    tall: 9,
    body: "#f2c14e",
    belly: "#ffe9a8",
    fin: "#e24b4a",
    glow: "242,193,78",
    pattern: (x, y, t) =>
      (x + y) % 2 === 0 ? (Math.sin(t / 260 + x * 0.6) > 0.6 ? "#fff6c8" : "#d9a22a") : null,
  },
};

/** One frame of a fish, facing right. `t` animates patterns and the tail. */
export function buildFish(key: FishArtKey, t: number): Grid {
  const s = STYLES[key];
  const grid: Grid = Array.from({ length: FISH_GRID_H }, () =>
    Array<string | null>(FISH_GRID_W).fill(null),
  );
  const put = (x: number, y: number, c: string | null) => {
    if (c && x >= 0 && y >= 0 && x < FISH_GRID_W && y < FISH_GRID_H) grid[y][x] = c;
  };
  const tail = Math.max(3, Math.round(s.len / 4));
  const x0 = Math.round((FISH_GRID_W - s.len - tail) / 2) + tail;
  const mid = (FISH_GRID_H - 1) / 2;
  const wag = Math.sin(t / 160) > 0 ? 0 : 1;

  // Body: an oval, belly lighter, pattern on top.
  for (let i = 0; i < s.len; i++) {
    const half = (s.tall / 2) * Math.pow(Math.sin((Math.PI * (i + 0.5)) / s.len), 0.7);
    const top = Math.round(mid - half);
    const bottom = Math.round(mid + half);
    for (let y = top; y <= bottom; y++) {
      const belly = y > mid + half / 3;
      put(x0 + i, y, (!belly && s.pattern?.(i, y, t, top, bottom)) || (belly ? s.belly : s.body));
    }
  }
  // Tail fin (forked) and top fin.
  for (let k = 0; k < tail; k++) {
    const spread = Math.round(((k + 1) * s.tall) / (tail * 2)) + wag;
    put(x0 - 1 - k, Math.round(mid - spread), s.fin);
    put(x0 - 1 - k, Math.round(mid + spread), s.fin);
    if (k < 2) put(x0 - 1 - k, Math.round(mid), s.fin);
  }
  const finStart = Math.round(s.len * 0.35);
  for (let i = 0; i < Math.round(s.len * 0.3); i++)
    put(x0 + finStart + i, Math.round(mid - s.tall / 2) - 1 + (i > 0 ? 0 : 1), s.fin);
  // Eye and mouth.
  put(x0 + s.len - 3, Math.round(mid - 1), "#ffffff");
  put(x0 + s.len - 3, Math.round(mid), "#1d1d22");
  put(x0 + s.len, Math.round(mid + 1), s.fin);
  if (key === "thunder") {
    put(x0 + s.len, Math.round(mid + 2), "#ffd84d");
    put(x0 + s.len + 1, Math.round(mid + 3), "#ffd84d");
  }
  return grid;
}

/** Soft glow behind ultra rare fish. (x, y) is the centre on screen. */
export function drawFishGlow(
  c: CanvasRenderingContext2D,
  key: FishArtKey,
  x: number,
  y: number,
  size: number,
  t: number,
) {
  const rgb = STYLES[key].glow;
  if (!rgb) return;
  const r = size * (0.9 + Math.sin(t / 300) * 0.1);
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},0.55)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

export const hasGlow = (key: FishArtKey) => Boolean(STYLES[key].glow);
