/**
 * Shared building blocks for the Study World maps. Each map lays out tiles,
 * seats and things with the helpers here, then `finish()` paints everything
 * once onto two canvases: `base` (ground and furniture) and `over` (tree tops
 * and lamp heads drawn above avatars).
 */

export const TILE = 16;

export type MapId = "campus" | "classroom" | "cafe" | "library" | "garden";
export type SeatKind = "stump" | "lib" | "cafe" | "sofa" | "bench" | "chair";
export type Seat = { x: number; y: number; kind: SeatKind; by: object | null };
export type ThingType =
  | "shelf"
  | "desk"
  | "pot"
  | "counter"
  | "tv"
  | "table"
  | "board"
  | "notice"
  | "picnic"
  | "crop"
  | "blackboard"
  | "sdesk"
  | "tdesk"
  | "locker"
  | "clock"
  | "arcade"
  | "piano"
  | "menu"
  | "globe"
  | "fountain"
  | "vending"
  | "returns"
  | "bin"
  | "market"
  | "ranks";
export type Crop = {
  x: number;
  y: number;
  stage: number;
  /** Watered: grows to the next stage at this time (ms, this computer). */
  readyAt?: number | null;
};
export type Thing = {
  t: ThingType;
  x: number;
  y: number;
  w: number;
  h: number;
  crop?: Crop;
  screen?: [number, number, number, number];
};
export type MapLabel = { text: string; x: number; y: number; style: "board" | "wall" | "small" };
/** Inclusive tile rectangle: [x0, y0, x1, y1]. */
export type TileRect = [number, number, number, number];

export type WorldMap = {
  id: MapId;
  w: number;
  h: number;
  base: HTMLCanvasElement;
  over: HTMLCanvasElement;
  solid: boolean[][];
  seats: Map<string, Seat>;
  things: Thing[];
  crops: Crop[];
  labels: MapLabel[];
  sparkles: [number, number, number][];
  /** Where you appear, in world pixels. */
  spawn: [number, number];
  /** Where simulated players start out. */
  roam: TileRect;
  /** O and X areas for quiz rounds. */
  quiz?: { o: TileRect; x: TileRect };
  /** Colour around the map when the screen is bigger than it. */
  bg: string;
  /** Water tiles you can fish from (tileKey). */
  water: Set<string>;
  npcs: number;
};

export const tileKey = (x: number, y: number) => `${x},${y}`;

export function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const target = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  r = Math.round((target - r) * p + r);
  g = Math.round((target - g) * p + g);
  b = Math.round((target - b) * p + b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const makeCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

const BOOK_COLORS = ["#c0504d", "#3d7fd6", "#f2c14e", "#3fae8f", "#a77de0", "#e8e0d0", "#e2874c"];
const WALLS = new Set(["W", "V"]);

export function createKit(W: number, H: number, seed: number) {
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];

  const base = makeCanvas(W * TILE, H * TILE);
  const over = makeCanvas(W * TILE, H * TILE);
  const bx = base.getContext("2d")!;
  const ox = over.getContext("2d")!;
  const P = (c: CanvasRenderingContext2D, col: string, x: number, y: number, w = 1, h = 1) => {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  };
  const circ = (c: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string) => {
    c.fillStyle = col;
    for (let y = -r; y <= r; y++) {
      const d = Math.floor(Math.sqrt(r * r - y * y) + 0.3);
      c.fillRect(cx - d, cy + y, d * 2 + 1, 1);
    }
  };
  const ell = (
    c: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    col: string,
  ) => {
    c.fillStyle = col;
    for (let y = -ry; y <= ry; y++) {
      const d = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))) + 0.3);
      c.fillRect(cx - d, cy + y, d * 2 + 1, 1);
    }
  };

  // Ground codes: g grass, d sand, p paving, k deck, s soil, L dark wood, F light
  // wood, C café checks, t greenhouse tiles, W outer wall, V inside wall, w water.
  const G: string[][] = Array.from({ length: H }, () => Array<string>(W).fill("g"));
  const solid: boolean[][] = Array.from({ length: H }, () => Array<boolean>(W).fill(false));
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const at = (x: number, y: number) => (inside(x, y) ? G[y][x] : "x");
  const fill = (x0: number, y0: number, x1: number, y1: number, t: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) G[y][x] = t;
  };
  const block = (x: number, y: number, w = 1, h = 1) => {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) if (inside(x + i, y + j)) solid[y + j][x + i] = true;
  };
  /** A walled building seen from above, with gaps for doors. */
  const building = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    floor: string,
    doors: [number, number][],
  ) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || y === y0 || y === y1;
        if (edge && !doors.some((d) => d[0] === x && d[1] === y)) {
          G[y][x] = "W";
          solid[y][x] = true;
        } else G[y][x] = floor;
      }
  };
  /** A whole-map room: a tall back wall (3 tiles), side walls and a door at the bottom. */
  const room = (floor: string, doorXs: number[]) => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const wall = y <= 2 ? "V" : x === 0 || x === W - 1 || y === H - 1 ? "W" : null;
        if (wall && !(y === H - 1 && doorXs.includes(x))) {
          G[y][x] = wall;
          solid[y][x] = true;
        } else G[y][x] = floor;
      }
    // Side walls run up beside the back wall too.
    for (let y = 0; y <= 2; y++) {
      G[y][0] = "W";
      G[y][W - 1] = "W";
    }
    doorXs.forEach((x) => mats.push([x, H - 1]));
  };

  const seats = new Map<string, Seat>();
  const things: Thing[] = [];
  const crops: Crop[] = [];
  const labels: MapLabel[] = [];
  const sparkles: [number, number, number][] = [];
  const seat = (x: number, y: number, kind: SeatKind) =>
    seats.set(tileKey(x, y), { x, y, kind, by: null });
  const thing = (t: ThingType, x: number, y: number, w = 1, h = 1) => {
    const item: Thing = { t, x, y, w, h };
    things.push(item);
    block(x, y, w, h);
    return item;
  };
  const label = (text: string, x: number, y: number, style: MapLabel["style"]) =>
    labels.push({ text, x, y, style });
  /** A row of soil with a plant on every tile except the gaps. */
  const cropRow = (x0: number, x1: number, y: number, gaps: number[] = []) => {
    fill(x0, y, x1, y, "s");
    for (let x = x0; x <= x1; x++) {
      if (gaps.includes(x)) continue;
      rnd(); // keeps the decoration pattern the same as before
      // Plants are personal: their real stage comes from the server.
      const crop = { x, y, stage: 0, readyAt: null };
      crops.push(crop);
      things.push({ t: "crop", x, y, w: 1, h: 1, crop });
      block(x, y);
    }
  };

  const trees: [number, number][] = [];
  const bushes: [number, number][] = [];
  const rocks: [number, number][] = [];
  const lamps: [number, number][] = [];
  const fences: [number, number, "h" | "v"][] = [];
  const mats: [number, number][] = [];
  const flowerBeds: TileRect[] = [];
  const ponds: [number, number, number, number][] = [];
  const water = new Set<string>();
  const add =
    (list: [number, number][]) =>
    (...points: [number, number][]) =>
      points.forEach(([x, y]) => {
        list.push([x, y]);
        block(x, y);
      });
  const tree = add(trees);
  const bush = add(bushes);
  const rock = add(rocks);
  const lamp = add(lamps);
  const fence = (x: number, y: number, o: "h" | "v") => {
    fences.push([x, y, o]);
    block(x, y);
  };
  const borderTrees = () => {
    for (let x = 1; x < W; x += 2) tree([x, 1], [x, H - 1]);
    for (let y = 3; y < H - 2; y += 2) tree([0, y], [W - 1, y]);
  };
  /** A flower bed you can't walk through. */
  const flowerBed = (x0: number, y0: number, x1: number, y1: number) => {
    flowerBeds.push([x0, y0, x1, y1]);
    block(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  };
  /** An oval pond, in tiles (centre and radius). */
  const pond = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy < 1) {
          G[y][x] = "w";
          solid[y][x] = true;
          water.add(tileKey(x, y));
        }
      }
    ponds.push([
      Math.round(cx * TILE),
      Math.round(cy * TILE + 2),
      Math.round(rx * TILE),
      Math.round(ry * TILE + 2),
    ]);
  };

  // Painted after the ground (windows, rugs, signs, quiz marks) and after the furniture.
  const afterGround: (() => void)[] = [];
  const afterThings: (() => void)[] = [];
  const decor = (fn: () => void) => afterGround.push(fn);
  const window_ = (x: number, y: number, w: number) =>
    decor(() => {
      const X = x * TILE + 2;
      const Y = y * TILE + 2;
      const width = w * TILE - 4;
      P(bx, "#f6f1e7", X, Y, width, 24);
      P(bx, "#9fd3ef", X + 2, Y + 2, width - 4, 19);
      P(bx, "#c4e6f8", X + 2, Y + 2, width - 4, 4);
      for (let i = 0; i < 3; i++) P(bx, "#e3f4fd", X + 6 + i * 3 + ((x * 5) % 9), Y + 8 - i, 2, 9);
      for (let m = 1; m < w; m++) P(bx, "#f6f1e7", X + m * TILE - 2, Y, 2, 24);
      P(bx, "#f6f1e7", X, Y + 11, width, 2);
      P(bx, "#d9cbb0", X - 2, Y + 23, width + 4, 3);
    });
  /** A wooden plaque with a name on it. */
  const sign = (x: number, y: number, w: number, text: string) => {
    decor(() => {
      const X = x * TILE;
      const Y = y * TILE;
      P(bx, "#4e3019", X + 1, Y + 3, w * TILE - 2, 14);
      P(bx, "#8a5a33", X + 2, Y + 4, w * TILE - 4, 12);
      P(bx, "#a8744a", X + 2, Y + 4, w * TILE - 4, 2);
    });
    label(text, x * TILE + (w * TILE) / 2, y * TILE + 14, "board");
  };
  const rug = (x0: number, y0: number, x1: number, y1: number, cols: [string, string, string]) =>
    decor(() => {
      const X = x0 * TILE + 2;
      const Y = y0 * TILE + 2;
      const w = (x1 - x0 + 1) * TILE - 4;
      const h = (y1 - y0 + 1) * TILE - 4;
      P(bx, cols[0], X, Y, w, h);
      P(bx, cols[1], X + 2, Y + 2, w - 4, h - 4);
      P(bx, cols[2], X + 4, Y + 4, w - 8, h - 8);
      for (let i = X + 8; i < X + w - 8; i += 8) {
        P(bx, cols[1], i, Y + 6, 3, 2);
        P(bx, cols[1], i, Y + h - 8, 3, 2);
      }
    });

  const paintGround = () => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const X = x * TILE;
        const Y = y * TILE;
        const t = G[y][x];
        P(bx, "#79c159", X, Y, 16, 16);
        for (let i = 0; i < 10; i++)
          P(
            bx,
            rnd() < 0.5 ? "#70b651" : "#85cc66",
            X + ((rnd() * 16) | 0),
            Y + ((rnd() * 16) | 0),
          );
        if (t === "g") {
          if (rnd() < 0.4) {
            const a = X + 2 + ((rnd() * 11) | 0);
            const b = Y + 3 + ((rnd() * 10) | 0);
            P(bx, "#5a9b3f", a, b, 1, 2);
            P(bx, "#5a9b3f", a + 2, b, 1, 2);
            P(bx, "#68ad4a", a + 1, b + 1, 1, 2);
          }
          if (rnd() < 0.07 && !solid[y][x]) {
            const c = pick(["#ffffff", "#ffd84d", "#ff9ec4", "#b8a2ff"]);
            const a = X + 3 + ((rnd() * 9) | 0);
            const b = Y + 4 + ((rnd() * 8) | 0);
            P(bx, "#4f8f3a", a + 1, b + 2, 1, 2);
            P(bx, c, a, b);
            P(bx, c, a + 2, b);
            P(bx, c, a + 1, b - 1);
            P(bx, c, a + 1, b + 1);
            P(bx, "#f4a02a", a + 1, b);
          }
        }
        if (t === "d") {
          P(bx, "#ebd29b", X, Y, 16, 16);
          for (let i = 0; i < 14; i++)
            P(
              bx,
              pick(["#dfc286", "#f4e0b2", "#e3c98e"]),
              X + ((rnd() * 16) | 0),
              Y + ((rnd() * 16) | 0),
            );
          if (rnd() < 0.3) P(bx, "#c9b083", X + ((rnd() * 13) | 0), Y + ((rnd() * 14) | 0), 2, 1);
          (
            [
              [0, -1],
              [0, 1],
              [-1, 0],
              [1, 0],
            ] as const
          ).forEach(([dx, dy]) => {
            const n = at(x + dx, y + dy);
            if (n === "d" || n === "p") return;
            if (dy === -1) {
              P(bx, "#d2b77d", X, Y, 16, 1);
              for (let i = 0; i < 16; i += 3) P(bx, "#79c159", X + i, Y, 2, 1);
            }
            if (dy === 1) P(bx, "#d2b77d", X, Y + 15, 16, 1);
            if (dx === -1) P(bx, "#d2b77d", X, Y, 1, 16);
            if (dx === 1) P(bx, "#d2b77d", X + 15, Y, 1, 16);
          });
        }
        if (t === "p") {
          P(bx, "#cfc4ae", X, Y, 16, 16);
          for (let j = 0; j < 2; j++)
            for (let i = 0; i < 2; i++) {
              const cx = X + i * 8 + 1 + (((y + j) % 2 ? 2 : 0) % 8);
              const cy = Y + j * 8 + 1;
              P(bx, pick(["#c2b59d", "#cbbfa8", "#bdb099"]), cx, cy, 6, 6);
              P(bx, "#e3dbcb", cx, cy, 3, 1);
              P(bx, "#a5987f", cx + 1, cy + 5, 5, 1);
            }
        }
        if (t === "k") {
          P(bx, "#c99a63", X, Y, 16, 16);
          for (let j = 0; j < 4; j++) {
            P(bx, "#b0804c", X, Y + j * 4 + 3, 16, 1);
            P(bx, "#d9ad78", X, Y + j * 4, 16, 1);
            P(bx, "#8a5d33", X + ((x + j) % 2 ? 2 : 12), Y + j * 4 + 1);
            if (rnd() < 0.15) P(bx, "#a77546", X + ((rnd() * 13) | 0), Y + j * 4 + 1, 2, 1);
          }
          if (at(x, y + 1) !== "k") {
            P(bx, "#8a5d33", X, Y + 13, 16, 3);
            P(bx, "#6e4425", X, Y + 15, 16, 1);
          }
          if (at(x - 1, y) !== "k") P(bx, "#8a5d33", X, Y, 1, 16);
          if (at(x + 1, y) !== "k") P(bx, "#8a5d33", X + 15, Y, 1, 16);
        }
        if (t === "L") {
          P(bx, "#b5865a", X, Y, 16, 16);
          for (let i = 0; i < 4; i++) {
            P(bx, "#9a6d44", X + i * 4 + 3, Y, 1, 16);
            P(bx, "#c49568", X + i * 4, Y, 1, 16);
            P(bx, "#9a6d44", X + i * 4, Y + ((x * 7 + i * 5 + y * 3) % 14), 3, 1);
          }
        }
        if (t === "F") {
          P(bx, "#dcb583", X, Y, 16, 16);
          for (let i = 0; i < 4; i++) {
            P(bx, "#e8c597", X, Y + i * 4, 16, 1);
            P(bx, "#c49a69", X, Y + i * 4 + 3, 16, 1);
            P(bx, "#c49a69", X + ((x * 7 + i * 5 + y * 3) % 14), Y + i * 4, 1, 3);
          }
        }
        if (t === "C")
          for (let j = 0; j < 2; j++)
            for (let i = 0; i < 2; i++)
              P(bx, (i + j) % 2 ? "#dccfb6" : "#f3eadb", X + i * 8, Y + j * 8, 8, 8);
        if (t === "t") {
          P(bx, "#d6ead0", X, Y, 16, 16);
          P(bx, "#b9d6b0", X, Y, 16, 1);
          P(bx, "#b9d6b0", X, Y, 1, 16);
          P(bx, "#e6f4e1", X + 2, Y + 2, 5, 1);
        }
        if (t === "W") {
          P(bx, "#7a5844", X, Y, 16, 16);
          for (let j = 0; j < 4; j++) {
            P(bx, "#664637", X, Y + j * 4 + 3, 16, 1);
            for (let i = 0; i < 2; i++)
              P(bx, "#664637", X + ((j % 2) * 4 + i * 8), Y + j * 4, 1, 3);
          }
          P(bx, "#9c7862", X, Y, 16, 1);
          if (!WALLS.has(at(x, y - 1))) P(bx, "#b08a70", X, Y, 16, 2);
        }
        if (t === "V") {
          P(bx, "#efe2c8", X, Y, 16, 16);
          P(bx, "#e6d6b8", X + 7, Y, 1, 16);
          P(bx, "#e6d6b8", X + 15, Y, 1, 16);
          if (at(x, y - 1) !== "V") {
            P(bx, "#5a3d2a", X, Y, 16, 3);
            P(bx, "#7a5844", X, Y + 3, 16, 1);
          }
          if (at(x, y + 1) !== "V") {
            P(bx, "#9c6b42", X, Y + 6, 16, 10);
            P(bx, "#b5865a", X, Y + 6, 16, 2);
            P(bx, "#8a5a33", X + (x % 2 ? 3 : 11), Y + 9, 1, 5);
            P(bx, "#6e4425", X, Y + 14, 16, 2);
          }
        }
        if (t === "s") {
          P(bx, "#8c5a36", X, Y, 16, 16);
          P(bx, "#714627", X, Y + 2, 16, 2);
          P(bx, "#714627", X, Y + 11, 16, 2);
          for (let i = 0; i < 5; i++)
            P(bx, "#a06a42", X + ((rnd() * 16) | 0), Y + ((rnd() * 16) | 0));
          P(bx, "#6a4a2a", X, Y + 15, 16, 1);
        }
      }
    // Walls cast a short shadow onto the floor below them.
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (WALLS.has(G[y][x]) && inside(x, y + 1) && !WALLS.has(G[y + 1][x]))
          P(bx, "rgba(0,0,0,.18)", x * TILE, y * TILE + 16, 16, 4);
  };

  const paintPonds = () =>
    ponds.forEach(([PX, PY, PRX, PRY]) => {
      ell(bx, PX, PY + 2, PRX + 4, PRY + 4, "#d9c89a");
      ell(bx, PX, PY + 1, PRX + 2, PRY + 2, "#c9b582");
      ell(bx, PX, PY, PRX, PRY, "#3a8cc2");
      ell(bx, PX, PY + 1, PRX - 2, PRY - 2, "#5db5e6");
      ell(bx, PX + 6, PY + 8, Math.max(4, PRX - 22), Math.max(3, PRY - 18), "#53abdd");
      ell(bx, PX - 20, PY - PRY + 31, Math.max(6, PRX - 40), 6, "#7cc8ef");
      const inPond = (x: number, y: number, m: number) =>
        ((x - PX) / (PRX - m)) ** 2 + ((y - PY) / (PRY - m)) ** 2 < 1;
      for (let i = 0; i < 60; i++) {
        const x = (PX - PRX + rnd() * PRX * 2) | 0;
        const y = (PY - PRY + rnd() * PRY * 2) | 0;
        if (inPond(x, y, 8)) P(bx, "#93d5f5", x, y, 3 + ((rnd() * 4) | 0), 1);
      }
      let pads = 0;
      for (let i = 0; i < 80 && pads < 5; i++) {
        const x = (PX - PRX + rnd() * PRX * 2) | 0;
        const y = (PY - PRY + rnd() * PRY * 2) | 0;
        if (!inPond(x, y, 12)) continue;
        circ(bx, x, y, 4, "#3f8a3a");
        circ(bx, x, y, 3, "#4c9c45");
        P(bx, "#5db5e6", x, y - 4, 2, 4);
        if (pads % 2 === 0) {
          P(bx, "#ff9ec4", x - 2, y - 1, 3, 2);
          P(bx, "#fff", x - 1, y - 1);
        }
        pads++;
      }
      for (let a = 0; a < Math.PI * 2; a += 0.09)
        if (rnd() < 0.35) {
          const x = Math.round(PX + Math.cos(a) * (PRX + 3));
          const y = Math.round(PY + Math.sin(a) * (PRY + 3));
          const h = 4 + ((rnd() * 5) | 0);
          P(bx, "#4f8f3a", x, y - h, 1, h);
          if (rnd() < 0.4) P(bx, "#8a5a33", x, y - h - 2, 1, 2);
        }
      for (let i = 0; i < 40; i++) {
        const x = (PX - PRX + rnd() * PRX * 2) | 0;
        const y = (PY - PRY + rnd() * PRY * 2) | 0;
        if (inPond(x, y, 10)) sparkles.push([x, y, rnd() * Math.PI * 2]);
      }
    });

  const paintNature = () => {
    flowerBeds.forEach(([x0, y0, x1, y1]) => {
      const X = x0 * TILE;
      const Y = y0 * TILE;
      const w = (x1 - x0 + 1) * TILE;
      const h = (y1 - y0 + 1) * TILE;
      P(bx, "#a8733f", X, Y + 2, w, h - 2);
      P(bx, "#7a4e2c", X + 2, Y + 4, w - 4, h - 6);
      P(bx, "#d19a62", X, Y + 2, w, 2);
      const col = pick(["#ff9ec4", "#ffd84d", "#b8a2ff", "#ff7a6b", "#ffffff"]);
      for (let i = 0; i < (w * h) / 22; i++) {
        const a = X + 4 + ((rnd() * (w - 10)) | 0);
        const b = Y + 6 + ((rnd() * (h - 12)) | 0);
        P(bx, "#3f8e3b", a, b + 1, 1, 3);
        P(bx, "#5aae51", a + 1, b + 2, 2, 1);
        const c = rnd() < 0.75 ? col : "#ffffff";
        P(bx, c, a - 1, b, 3, 1);
        P(bx, c, a, b - 1, 1, 3);
        P(bx, "#f4a02a", a, b);
      }
    });
    trees.forEach(([tx, ty]) => {
      const X = tx * TILE + 8;
      const Y = ty * TILE + 14;
      ell(bx, X, Y, 9, 3, "rgba(0,0,0,.2)");
      P(bx, "#6e4425", X - 3, Y - 11, 7, 11);
      P(bx, "#8a5a32", X - 3, Y - 11, 2, 11);
      P(bx, "#55331b", X + 3, Y - 11, 1, 11);
      P(bx, "#55331b", X - 1, Y - 6, 2, 1);
      const cy = Y - 17;
      circ(ox, X, cy, 13, "#245a28");
      circ(ox, X, cy, 12, "#337c35");
      circ(ox, X - 1, cy - 1, 10, "#3f8f3d");
      circ(ox, X - 3, cy - 3, 7, "#4fa447");
      circ(ox, X - 5, cy - 6, 3, "#6cc05e");
      for (let i = 0; i < 7; i++) {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * 9;
        P(ox, "#2c6b2e", X + Math.round(Math.cos(a) * r), cy + Math.round(Math.sin(a) * r), 2, 1);
      }
      for (let i = 0; i < 4; i++) {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * 6;
        P(ox, "#7fcf6c", X - 3 + Math.round(Math.cos(a) * r), cy - 3 + Math.round(Math.sin(a) * r));
      }
      if (rnd() < 0.3)
        for (let i = 0; i < 3; i++)
          P(ox, "#e24b4a", X - 6 + ((rnd() * 12) | 0), cy - 4 + ((rnd() * 10) | 0), 2, 2);
    });
    bushes.forEach(([tx, ty]) => {
      const X = tx * TILE + 8;
      const Y = ty * TILE + 12;
      ell(bx, X, Y + 1, 8, 2, "rgba(0,0,0,.18)");
      circ(bx, X, Y - 5, 7, "#2f7432");
      circ(bx, X - 1, Y - 6, 6, "#3f8e3b");
      circ(bx, X - 2, Y - 8, 3, "#5aae51");
      if (rnd() < 0.5)
        for (let i = 0; i < 3; i++)
          P(
            bx,
            pick(["#e24b4a", "#f6f0e0"]),
            X - 4 + ((rnd() * 8) | 0),
            Y - 9 + ((rnd() * 7) | 0),
            2,
            2,
          );
    });
    rocks.forEach(([tx, ty]) => {
      const X = tx * TILE + 8;
      const Y = ty * TILE + 10;
      ell(bx, X, Y + 3, 7, 2, "rgba(0,0,0,.18)");
      ell(bx, X, Y, 7, 5, "#8f949a");
      ell(bx, X - 1, Y - 1, 5, 3, "#a9aeb4");
      P(bx, "#cfd3d8", X - 3, Y - 3, 2, 1);
    });
    lamps.forEach(([tx, ty]) => {
      const X = tx * TILE + 8;
      const Y = ty * TILE + 14;
      ell(bx, X, Y, 4, 2, "rgba(0,0,0,.2)");
      P(bx, "#3d3d45", X - 1, Y - 16, 3, 16);
      P(bx, "#5a5a66", X - 1, Y - 16, 1, 16);
      P(ox, "#3d3d45", X - 4, Y - 21, 9, 3);
      P(ox, "#ffe7a3", X - 3, Y - 18, 7, 3);
      P(ox, "#fff6d6", X - 1, Y - 18, 2, 1);
      P(ox, "#3d3d45", X - 3, Y - 15, 7, 1);
    });
    fences.forEach(([tx, ty, o]) => {
      const X = tx * TILE;
      const Y = ty * TILE;
      if (o === "h") {
        P(bx, "rgba(0,0,0,.15)", X, Y + 13, 16, 2);
        P(bx, "#a8733f", X, Y + 5, 16, 2);
        P(bx, "#a8733f", X, Y + 9, 16, 2);
        P(bx, "#d19a62", X, Y + 5, 16, 1);
        P(bx, "#d19a62", X, Y + 9, 16, 1);
        P(bx, "#7e5130", X + 6, Y + 2, 4, 12);
        P(bx, "#c08a55", X + 6, Y + 2, 4, 2);
        P(bx, "#5e3a20", X + 9, Y + 4, 1, 10);
      } else {
        P(bx, "rgba(0,0,0,.15)", X + 9, Y, 2, 16);
        P(bx, "#a8733f", X + 6, Y, 2, 16);
        P(bx, "#d19a62", X + 6, Y, 1, 16);
        P(bx, "#7e5130", X + 5, Y + 4, 5, 10);
        P(bx, "#c08a55", X + 5, Y + 4, 5, 2);
      }
    });
    mats.forEach(([tx, ty]) => {
      P(bx, "#7a3530", tx * TILE + 1, ty * TILE + 3, 14, 11);
      P(bx, "#a8423f", tx * TILE + 2, ty * TILE + 4, 12, 9);
    });
  };

  const paintSeat = (s: Seat) => {
    const X = s.x * TILE;
    const Y = s.y * TILE;
    if (s.kind === "stump") {
      ell(bx, X + 8, Y + 13, 7, 2, "rgba(0,0,0,.2)");
      P(bx, "#8b5a33", X + 2, Y + 6, 12, 7);
      for (let i = 0; i < 4; i++) P(bx, "#6e4425", X + 3 + i * 3, Y + 8, 1, 5);
      ell(bx, X + 8, Y + 6, 6, 3, "#e2b07a");
      ell(bx, X + 8, Y + 6, 4, 2, "#cf9a60");
      ell(bx, X + 8, Y + 6, 2, 1, "#e2b07a");
      P(bx, "#b07a46", X + 8, Y + 6);
    }
    if (s.kind === "lib") {
      P(bx, "#6a4428", X + 3, Y + 3, 10, 10);
      P(bx, "#9c6b42", X + 4, Y + 4, 8, 6);
      P(bx, "#5a3a22", X + 3, Y + 12, 10, 3);
    }
    if (s.kind === "chair") {
      P(bx, "rgba(0,0,0,.15)", X + 3, Y + 13, 10, 2);
      P(bx, "#5a5a66", X + 4, Y + 11, 1, 4);
      P(bx, "#5a5a66", X + 11, Y + 11, 1, 4);
      P(bx, "#4a78c2", X + 3, Y + 4, 10, 7);
      P(bx, "#6b95d8", X + 3, Y + 4, 10, 1);
      P(bx, "#36599a", X + 3, Y + 10, 10, 3);
    }
    if (s.kind === "cafe") {
      ell(bx, X + 8, Y + 13, 5, 2, "rgba(0,0,0,.18)");
      circ(bx, X + 8, Y + 8, 5, "#7a3530");
      circ(bx, X + 8, Y + 7, 4, "#c0504d");
      P(bx, "#d9726e", X + 6, Y + 5, 2, 1);
      P(bx, "#5a3a22", X + 7, Y + 12, 2, 2);
    }
    if (s.kind === "sofa") {
      P(bx, "#7a2f2c", X, Y + 2, 16, 13);
      P(bx, "#a8423f", X, Y + 5, 16, 8);
      P(bx, "#c0504d", X + 1, Y + 6, 14, 2);
      P(bx, "#5a2420", X, Y + 14, 16, 1);
    }
    if (s.kind === "bench") {
      P(bx, "rgba(0,0,0,.15)", X + 1, Y + 12, 14, 2);
      P(bx, "#8a5a33", X, Y + 5, 16, 6);
      P(bx, "#b07a46", X, Y + 5, 16, 2);
      P(bx, "#6e4425", X + 2, Y + 11, 2, 3);
      P(bx, "#6e4425", X + 12, Y + 11, 2, 3);
    }
  };

  const paintThing = (o: Thing) => {
    const X = o.x * TILE;
    const Y = o.y * TILE;
    const WW = o.w * TILE;
    if (o.t === "shelf") {
      const y0 = Y - 8;
      P(bx, "#4e3019", X, y0, 32, 24);
      P(bx, "#6e4428", X + 1, y0 + 1, 30, 22);
      P(bx, "#2e1c10", X + 3, y0 + 3, 26, 8);
      P(bx, "#2e1c10", X + 3, y0 + 13, 26, 8);
      [y0 + 11, y0 + 21].forEach((sb) => {
        let xx = X + 3;
        while (xx < X + 28) {
          const w = 2 + ((rnd() * 2) | 0);
          const h = 5 + ((rnd() * 3) | 0);
          const c = pick(BOOK_COLORS);
          P(bx, c, xx, sb - h, w, h);
          P(bx, shade(c, -0.3), xx + w - 1, sb - h, 1, h);
          P(bx, shade(c, 0.35), xx, sb - h + 1, 1, 1);
          xx += w + (rnd() < 0.12 ? 2 : 0);
        }
        P(bx, "#8a5a33", X + 2, sb, 28, 2);
      });
    }
    if (o.t === "desk") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 14, 30, 2);
      P(bx, "#5e3a20", X + 1, Y + 11, 30, 4);
      P(bx, "#a8744a", X + 1, Y + 1, 30, 11);
      P(bx, "#c48d5d", X + 1, Y + 1, 30, 2);
      P(bx, "#fff", X + 5, Y + 4, 9, 6);
      P(bx, "#d8d2c4", X + 9, Y + 4, 1, 6);
      for (let i = 0; i < 3; i++) {
        P(bx, "#bbb", X + 6, Y + 5 + i * 2, 2, 1);
        P(bx, "#bbb", X + 11, Y + 5 + i * 2, 2, 1);
      }
      P(bx, "#3d3d45", X + 24, Y + 3, 2, 7);
      P(bx, "#f2c14e", X + 21, Y + 2, 7, 3);
      P(bx, "#ffe9a8", X + 22, Y + 4, 5, 1);
      P(bx, "#5b7cfa", X + 16, Y + 6, 4, 4);
    }
    if (o.t === "sdesk") {
      P(bx, "rgba(0,0,0,.18)", X + 1, Y + 13, 14, 2);
      P(bx, "#5a5a66", X + 2, Y + 9, 1, 5);
      P(bx, "#5a5a66", X + 13, Y + 9, 1, 5);
      P(bx, "#c48d5d", X + 1, Y + 2, 14, 9);
      P(bx, "#dba676", X + 1, Y + 2, 14, 1);
      P(bx, "#9a6b40", X + 1, Y + 10, 14, 1);
      P(bx, "#fff", X + 3, Y + 4, 5, 5);
      P(bx, "#cfc9bd", X + 4, Y + 5, 3, 1);
      P(bx, "#cfc9bd", X + 4, Y + 7, 3, 1);
      P(bx, pick(BOOK_COLORS), X + 9, Y + 3, 4, 6);
    }
    if (o.t === "tdesk") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 14, WW - 2, 2);
      P(bx, "#4e3019", X + 1, Y + 9, WW - 2, 6);
      P(bx, "#7a4e2c", X + 1, Y, WW - 2, 10);
      P(bx, "#9a6b40", X + 1, Y, WW - 2, 2);
      for (let i = 0; i < o.w; i++) P(bx, "#c8a24a", X + i * 16 + 7, Y + 11, 3, 1);
      P(bx, "#e24b4a", X + 6, Y + 3, 4, 4);
      P(bx, "#3f8e3b", X + 8, Y + 2, 1, 1);
      [0, 1, 2].forEach((i) => P(bx, pick(BOOK_COLORS), X + 18, Y + 6 - i * 2, 9, 2));
      ell(bx, X + WW - 10, Y + 6, 3, 2, "#c8a24a");
      P(bx, "#8a6a20", X + WW - 10, Y + 3, 1, 2);
    }
    if (o.t === "returns") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 14, WW - 2, 2);
      P(bx, "#4e3019", X, Y + 2, WW, 13);
      P(bx, "#8a5a33", X, Y, WW, 6);
      P(bx, "#a8744a", X, Y, WW, 1);
      for (let i = 0; i < o.w; i++) P(bx, "#6e4428", X + i * 16 + 2, Y + 8, 12, 5);
      [0, 1, 2, 3].forEach((i) => P(bx, pick(BOOK_COLORS), X + 6, Y + 3 - i * 2, 10, 2));
      P(bx, "#3d3d45", X + WW - 16, Y - 6, 2, 9);
      P(bx, "#3fae8f", X + WW - 19, Y - 8, 8, 3);
      P(bx, "#fff", X + WW / 2 - 4, Y + 1, 8, 4);
      P(bx, "#3d7fd6", X + WW / 2 - 3, Y + 2, 6, 1);
    }
    if (o.t === "pot") {
      ell(bx, X + 8, Y + 15, 6, 1, "rgba(0,0,0,.2)");
      P(bx, "#a24c27", X + 4, Y + 8, 8, 7);
      P(bx, "#d06e3d", X + 4, Y + 8, 8, 2);
      P(bx, "#8a3e1f", X + 10, Y + 9, 2, 6);
      circ(bx, X + 8, Y + 4, 5, "#2f7432");
      circ(bx, X + 7, Y + 3, 4, "#3f8e3b");
      P(bx, "#5aae51", X + 5, Y + 1, 2, 2);
      P(bx, "#5aae51", X + 9, Y, 2, 2);
    }
    if (o.t === "counter") {
      P(bx, "#5e3a20", X, Y + 2, WW, 14);
      P(bx, "#c48d5d", X, Y, WW, 6);
      P(bx, "#e0ad7c", X, Y, WW, 1);
      for (let i = 0; i < o.w; i++) {
        P(bx, "#7a4e2c", X + i * 16 + 2, Y + 8, 12, 6);
        P(bx, "#4e3019", X + i * 16 + 15, Y + 6, 1, 10);
      }
      P(bx, "#55555f", X + 3, Y - 7, 11, 10);
      P(bx, "#8a8a96", X + 4, Y - 6, 9, 3);
      P(bx, "#2a2a30", X + 7, Y - 2, 3, 3);
      P(bx, "#fff", X + 20, Y - 1, 4, 4);
      P(bx, "#6b3e1f", X + 21, Y, 2, 2);
      P(bx, "#e8b46a", X + 40, Y, 6, 4);
      P(bx, "#f6d39a", X + 41, Y, 4, 1);
      P(bx, "#e8b46a", X + 48, Y, 6, 4);
      P(bx, "#c0504d", X + 60, Y, 5, 4);
      P(bx, "#fff", X + 61, Y, 3, 1);
      if (WW > 90) {
        P(bx, "#3fae8f", X + 80, Y - 4, 10, 8);
        P(bx, "#fff", X + 82, Y - 2, 6, 1);
      }
    }
    if (o.t === "tv") {
      P(bx, "#3a2a25", X + 4, Y + 6, 24, 9);
      P(bx, "#5e463e", X + 4, Y + 6, 24, 1);
      P(bx, "#1b1b1f", X + 2, Y - 9, 28, 16);
      P(bx, "#2d2d33", X + 2, Y - 9, 28, 1);
      o.screen = [X + 4, Y - 7, 24, 12];
    }
    if (o.t === "table") {
      ell(bx, X + 8, Y + 14, 7, 2, "rgba(0,0,0,.2)");
      P(bx, "#5e3a20", X + 7, Y + 9, 2, 5);
      circ(bx, X + 8, Y + 7, 7, "#6e4425");
      circ(bx, X + 8, Y + 6, 6, "#d9a46c");
      P(bx, "#ecc08e", X + 4, Y + 2, 6, 1);
      ell(bx, X + 6, Y + 8, 3, 1, "#e8e2d6");
      P(bx, "#fff", X + 5, Y + 5, 3, 3);
      P(bx, "#e8e2d6", X + 8, Y + 6, 1, 1);
      P(bx, "#6b3e1f", X + 6, Y + 5, 1, 1);
      P(bx, "#f6d39a", X + 10, Y + 4, 3, 2);
      P(bx, "#e8b46a", X + 10, Y + 5, 3, 1);
    }
    if (o.t === "board") {
      P(bx, "#5e3a20", X + 10, Y + 10, 3, 22);
      P(bx, "#5e3a20", X + WW - 13, Y + 10, 3, 22);
      P(bx, "#6e4425", X + 2, Y + 2, WW - 4, 24);
      P(bx, "#8a5a33", X + 2, Y + 2, WW - 4, 2);
      P(bx, "#2f6b45", X + 5, Y + 5, WW - 10, 18);
      P(bx, "#3a7d52", X + 5, Y + 5, WW - 10, 2);
      label("QUIZ ARENA", X + WW / 2, Y + 15, "board");
      label("press E to start a round", X + WW / 2, Y + 22, "small");
    }
    if (o.t === "blackboard") {
      P(bx, "#6e4425", X, Y + 2, WW, 26);
      P(bx, "#8a5a33", X, Y + 2, WW, 2);
      P(bx, "#24453a", X + 3, Y + 5, WW - 6, 19);
      P(bx, "#2c5546", X + 3, Y + 5, WW - 6, 2);
      for (let i = 0; i < 10; i++)
        P(
          bx,
          "rgba(255,255,255,.35)",
          X + 8 + ((rnd() * (WW - 30)) | 0),
          Y + 19 + ((rnd() * 3) | 0),
          4 + ((rnd() * 8) | 0),
          1,
        );
      P(bx, "#a8744a", X + 2, Y + 26, WW - 4, 3);
      P(bx, "#ffffff", X + 12, Y + 25, 5, 1);
      P(bx, "#ffd1dc", X + 20, Y + 25, 4, 1);
      P(bx, "#3d3d45", X + WW - 20, Y + 24, 8, 2);
      label("QUIZ TIME", X + WW / 2, Y + 15, "board");
      label("press E to start a round", X + WW / 2, Y + 23, "small");
    }
    if (o.t === "notice") {
      P(bx, "#5e3a20", X + 6, Y + 12, 3, 18);
      P(bx, "#5e3a20", X + WW - 9, Y + 12, 3, 18);
      P(bx, "#7a4e2c", X + 1, Y + 2, WW - 2, 20);
      P(bx, "#c8a070", X + 3, Y + 4, WW - 6, 16);
      (
        [
          [5, 6, "#fff"],
          [16, 5, "#ffe58a"],
          [28, 7, "#bfe3ff"],
          [9, 12, "#ffd1dc"],
          [22, 12, "#fff"],
        ] as const
      ).forEach(([a, b, c]) => {
        P(bx, c, X + a, Y + b, 9, 7);
        P(bx, "#c0504d", X + a + 4, Y + b);
      });
      label("EVENTS", X + WW / 2, Y, "small");
    }
    if (o.t === "menu") {
      P(bx, "#4e3019", X + 1, Y + 2, WW - 2, 27);
      P(bx, "#2a2a2e", X + 3, Y + 4, WW - 6, 23);
      for (let i = 0; i < 4; i++) {
        P(bx, "rgba(255,255,255,.75)", X + 7, Y + 13 + i * 3, 14 + ((rnd() * 14) | 0), 1);
        P(bx, "#f2c14e", X + WW - 14, Y + 13 + i * 3, 6, 1);
      }
      label("MENU", X + WW / 2, Y + 11, "board");
    }
    if (o.t === "picnic") {
      P(bx, "rgba(0,0,0,.18)", X + 1, Y + 13, 30, 2);
      P(bx, "#8a5a33", X, Y + 2, 32, 11);
      P(bx, "#b8844f", X, Y + 2, 32, 9);
      for (let i = 1; i < 4; i++) P(bx, "#96663a", X, Y + 2 + i * 3 - 1, 32, 1);
      P(bx, "#fff", X + 6, Y + 4, 6, 4);
      P(bx, "#e24b4a", X + 6, Y + 4, 6, 1);
      P(bx, "#f2c14e", X + 20, Y + 5, 4, 3);
    }
    if (o.t === "locker")
      for (let i = 0; i < o.w; i++) {
        const lx = X + i * 16;
        P(bx, "#3f5f86", lx, Y - 12, 16, 28);
        P(bx, "#5b7fa6", lx + 1, Y - 11, 14, 26);
        P(bx, "#7fa2c8", lx + 1, Y - 11, 14, 2);
        for (let v = 0; v < 3; v++) P(bx, "#3f5f86", lx + 4, Y - 7 + v * 2, 8, 1);
        P(bx, "#e8e2d6", lx + 11, Y + 3, 2, 4);
        P(bx, pick(["#ffe58a", "#ffd1dc", "#bfe3ff"]), lx + 3, Y + 6, 5, 4);
      }
    if (o.t === "vending") {
      P(bx, "rgba(0,0,0,.2)", X, Y + 14, 16, 2);
      P(bx, "#9c2f2c", X, Y - 14, 16, 30);
      P(bx, "#c0504d", X + 1, Y - 13, 14, 28);
      P(bx, "#a8d8f0", X + 2, Y - 11, 9, 15);
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
          P(
            bx,
            pick(["#f2c14e", "#3fae8f", "#e2874c", "#a77de0"]),
            X + 3 + c * 3,
            Y - 9 + r * 5,
            2,
            3,
          );
      P(bx, "#2a2a30", X + 12, Y - 9, 2, 6);
      P(bx, "#2a2a30", X + 3, Y + 7, 8, 3);
    }
    if (o.t === "arcade") {
      P(bx, "rgba(0,0,0,.22)", X, Y + 14, 16, 2);
      P(bx, "#2b2258", X + 1, Y - 14, 14, 30);
      P(bx, "#3b2f7a", X + 2, Y - 13, 12, 28);
      P(bx, "#f2c14e", X + 2, Y - 13, 12, 3);
      P(bx, "#0b0b12", X + 3, Y - 9, 10, 9);
      P(bx, "#5d4fa0", X + 2, Y + 1, 12, 4);
      P(bx, "#e24b4a", X + 4, Y + 2, 2, 2);
      P(bx, "#3fae8f", X + 8, Y + 2, 2, 2);
      P(bx, "#ffd84d", X + 11, Y + 2, 1, 2);
      o.screen = [X + 4, Y - 8, 8, 7];
    }
    if (o.t === "piano") {
      P(bx, "rgba(0,0,0,.22)", X + 1, Y + 14, WW - 2, 2);
      P(bx, "#1e1614", X, Y - 12, WW, 27);
      P(bx, "#3a2a25", X + 1, Y - 11, WW - 2, 3);
      P(bx, "#f4f1ea", X + 2, Y + 3, WW - 4, 6);
      for (let i = 0; i < WW - 6; i += 3) P(bx, "#cfc9bd", X + 3 + i, Y + 3, 1, 6);
      for (let i = 0; i < WW - 8; i += 6) {
        P(bx, "#111", X + 4 + i, Y + 3, 2, 3);
        P(bx, "#111", X + 7 + i, Y + 3, 2, 3);
      }
      P(bx, "#f4f1ea", X + 6, Y - 7, 8, 6);
      P(bx, "#cfc9bd", X + 7, Y - 5, 6, 1);
    }
    if (o.t === "clock") {
      circ(bx, X + 8, Y + 9, 6, "#5a3d2a");
      circ(bx, X + 8, Y + 9, 5, "#fdfaf2");
      P(bx, "#2a1b18", X + 8, Y + 5, 1, 4);
      P(bx, "#2a1b18", X + 8, Y + 9, 3, 1);
      P(bx, "#c0504d", X + 8, Y + 9);
    }
    if (o.t === "globe") {
      ell(bx, X + 8, Y + 14, 5, 1, "rgba(0,0,0,.2)");
      P(bx, "#6e4425", X + 5, Y + 12, 6, 2);
      P(bx, "#8a5a33", X + 7, Y + 9, 2, 4);
      circ(bx, X + 8, Y + 5, 5, "#3d7fd6");
      P(bx, "#4fbf6a", X + 5, Y + 2, 3, 3);
      P(bx, "#4fbf6a", X + 9, Y + 5, 3, 2);
      P(bx, "#4fbf6a", X + 6, Y + 7, 2, 2);
      P(bx, "#8ec0f0", X + 5, Y + 1, 2, 1);
      P(bx, "#c8a24a", X + 2, Y + 5, 1, 3);
      P(bx, "#c8a24a", X + 14, Y + 3, 1, 3);
    }
    if (o.t === "bin") {
      ell(bx, X + 8, Y + 15, 6, 1, "rgba(0,0,0,.2)");
      P(bx, "#2f6b45", X + 3, Y + 2, 10, 13);
      P(bx, "#3f8e5c", X + 4, Y + 3, 8, 11);
      P(bx, "#2f6b45", X + 2, Y, 12, 3);
      P(bx, "#4fa56c", X + 2, Y, 12, 1);
      P(bx, "#e8f5ec", X + 6, Y + 6, 4, 4);
      P(bx, "#2f6b45", X + 7, Y + 7, 2, 2);
    }
    if (o.t === "market") {
      // Seaside fish shop: blue roof with a fish sign, an anchor and a hanging
      // scale, fish on ice, a blue counter with a lifebuoy. Every fish is drawn
      // side-on with a wide body and forked tail so it clearly reads as a fish.
      // Roof and sign go on the top layer so people walking behind pass under.
      const cx = X + WW / 2;
      /** Pixel art from rows of characters; "." is see-through. */
      const sprite = (
        c: CanvasRenderingContext2D,
        sx: number,
        sy: number,
        rows: string[],
        pal: Record<string, string>,
      ) =>
        rows.forEach((row, ry) =>
          [...row].forEach((ch, rx) => {
            if (pal[ch]) P(c, pal[ch], sx + rx, sy + ry);
          }),
        );
      P(bx, "rgba(0,0,0,.22)", X + 1, Y + 15, WW - 2, 2);
      // Back wall with a fishing net in the middle.
      P(bx, "#7a4e2c", X + 2, Y - 17, WW - 4, 17);
      for (let i = 0; i < WW - 4; i += 6) P(bx, "#68411f", X + 2 + i, Y - 17, 1, 17);
      for (let i = 13; i < WW - 13; i += 3) P(bx, "#cdbb8c", X + i, Y - 15, 1, 9);
      for (let j = 0; j < 9; j += 3) P(bx, "#cdbb8c", X + 13, Y - 15 + j, WW - 26, 1);
      P(bx, "#e8d9a8", X + 12, Y - 16, WW - 24, 1);
      // Anchor (left) and a hanging fish scale (right).
      sprite(
        bx,
        X + 4,
        Y - 16,
        [
          "...a...",
          "..a.a..",
          "...a...",
          ".aaaaa.",
          "...a...",
          "...a...",
          "a..a..a",
          ".a.a.a.",
          "..aaa..",
        ],
        { a: "#2a3550" },
      );
      sprite(
        bx,
        X + WW - 11,
        Y - 17,
        [
          "...s...",
          "..fff..",
          ".fwwwf.",
          ".fwrwf.",
          ".fwwwf.",
          "..fff..",
          "...s...",
          "s..s..s",
          ".ppppp.",
        ],
        { s: "#d8d2c4", f: "#8a8a96", w: "#fdfaf2", r: "#e24b4a", p: "#b8bcc2" },
      );
      // Corner posts.
      P(bx, "#4e3019", X, Y - 18, 3, 33);
      P(bx, "#6e4425", X + 1, Y - 18, 1, 33);
      P(bx, "#4e3019", X + WW - 3, Y - 18, 3, 33);
      P(bx, "#6e4425", X + WW - 2, Y - 18, 1, 33);
      // Counter top and ice with fish lying side-on.
      P(bx, "#c48d5d", X - 1, Y - 2, WW + 2, 4);
      P(bx, "#e0ad7c", X - 1, Y - 2, WW + 2, 1);
      P(bx, "#dff3fa", X + 3, Y - 7, WW - 6, 5);
      for (let i = 0; i < WW - 6; i += 3) P(bx, "#ffffff", X + 4 + i, Y - 7 + (i % 2), 1, 1);
      const ICE_FISH = ["..bbb....", ".bbbbb..t", "beb#bbbt.", ".lllll..t", "..lll...."];
      const ON_ICE = [
        ["#e2874c", "#f6b27a", "#c0504d"],
        ["#7fa2c8", "#c8dcef", "#3d7fd6"],
        ["#3fae8f", "#9fe0c8", "#2a7a63"],
        ["#c8a24a", "#ecd492", "#9c7a2c"],
      ];
      const count = Math.floor((WW - 8) / 10);
      for (let i = 0; i < count; i++) {
        const [body, belly, tail] = ON_ICE[i % ON_ICE.length];
        sprite(bx, X + 5 + i * 10, Y - 7, ICE_FISH, {
          b: body,
          l: belly,
          t: tail,
          e: "#1a1a1a",
          "#": shade(body, -0.25),
        });
      }
      // Blue painted counter with planks, price tags and a lifebuoy.
      P(bx, "#2f63a8", X, Y + 2, WW, 13);
      P(bx, "#3d7fd6", X, Y + 2, WW, 2);
      for (let i = 6; i < WW; i += 7) P(bx, "#27528c", X + i, Y + 4, 1, 11);
      P(bx, "#f4f1ea", X + 4, Y + 4, 6, 4);
      P(bx, "#e24b4a", X + 5, Y + 5, 2, 1);
      P(bx, "#f4f1ea", X + WW - 10, Y + 4, 6, 4);
      P(bx, "#e24b4a", X + WW - 9, Y + 5, 2, 1);
      circ(bx, cx, Y + 9, 5, "#f4f1ea");
      P(bx, "#e24b4a", cx - 5, Y + 8, 3, 3);
      P(bx, "#e24b4a", cx + 3, Y + 8, 3, 3);
      P(bx, "#e24b4a", cx - 1, Y + 4, 3, 3);
      P(bx, "#e24b4a", cx - 1, Y + 12, 3, 3);
      circ(bx, cx, Y + 9, 2, "#2f63a8");
      // Roof with a scalloped edge.
      P(ox, "#173c6b", X - 3, Y - 27, WW + 6, 9);
      for (let i = 0; i < WW + 6; i += 4) P(ox, "#1f4e8c", X - 3 + i, Y - 26, 3, 8);
      P(ox, "#2f63a8", X - 3, Y - 27, WW + 6, 1);
      for (let i = 0, n = 0; i < WW + 6; i += 6, n++) {
        const col = n % 2 ? "#f4f1ea" : "#3d7fd6";
        P(ox, col, X - 3 + i, Y - 18, 6, 2);
        P(ox, col, X - 2 + i, Y - 16, 4, 1);
      }
      // Fish sign on the roof: tall diamond body, fins, forked tail, outlined.
      sprite(
        ox,
        cx - 9,
        Y - 39,
        [
          "......ooo.........",
          ".....offfo........",
          "....oobbbboo....oo",
          "...obbbbbbbbo..otf",
          "..obbbbbbgbbbo.otf",
          ".obwkbbbbgbsbbootfo",
          "obbbbbbbbgbbbbbtto.",
          ".obllllllllbbbootfo",
          "..olllllllllbo.otf",
          "...ollllllllo..otf",
          "....oolllloo....oo",
          "......ofo.........",
          ".......o..........",
        ],
        {
          o: "#7a3414",
          b: "#e2874c",
          l: "#f6b27a",
          f: "#c0504d",
          t: "#c0504d",
          g: "#b8622c",
          s: "#f6b27a",
          w: "#ffffff",
          k: "#1a1a1a",
        },
      );
      P(ox, "#4e3019", cx - 1, Y - 27, 2, 1);
    }
    if (o.t === "ranks") {
      // Leaderboard: a dark board on two legs with a trophy and a podium.
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 29, WW - 4, 2);
      P(bx, "#5a3d2a", X + 4, Y + 10, 3, 20);
      P(bx, "#5a3d2a", X + WW - 7, Y + 10, 3, 20);
      P(bx, "#6e4425", X, Y - 4, WW, 20);
      P(bx, "#22293a", X + 2, Y - 2, WW - 4, 16);
      P(bx, "#8a5a33", X, Y - 4, WW, 1);
      const cx = X + WW / 2;
      // Trophy
      P(bx, "#f2c14e", cx - 4, Y, 9, 4);
      P(bx, "#ffe08a", cx - 3, Y, 2, 3);
      P(bx, "#f2c14e", cx - 6, Y + 1, 2, 2);
      P(bx, "#f2c14e", cx + 5, Y + 1, 2, 2);
      P(bx, "#d9a22a", cx - 1, Y + 4, 3, 2);
      P(bx, "#d9a22a", cx - 3, Y + 6, 7, 1);
      // Podium bars: silver, gold, bronze
      P(bx, "#c9cdd2", cx - 16, Y + 8, 8, 5);
      P(bx, "#f2c14e", cx - 4, Y + 7, 9, 6);
      P(bx, "#d0844a", cx + 9, Y + 9, 8, 4);
      // Name lines
      for (let i = 0; i < 2; i++) {
        P(bx, "#5b6b8a", X + 5, Y + 1 + i * 4, 9, 1);
        P(bx, "#5b6b8a", X + WW - 14, Y + 1 + i * 4, 9, 1);
      }
    }
    if (o.t === "fountain") {
      const cx = X + WW / 2;
      ell(bx, cx, Y + 26, 16, 5, "rgba(0,0,0,.2)");
      ell(bx, cx, Y + 20, 16, 10, "#8f949a");
      ell(bx, cx, Y + 19, 15, 9, "#b8bcc2");
      ell(bx, cx, Y + 20, 12, 7, "#3a8cc2");
      ell(bx, cx, Y + 20, 11, 6, "#5db5e6");
      P(bx, "#9aa0a6", cx - 2, Y + 4, 4, 16);
      P(bx, "#c9cdd2", cx - 2, Y + 4, 1, 16);
      ell(bx, cx, Y + 5, 6, 2, "#9aa0a6");
      ell(bx, cx, Y + 4, 4, 1, "#93d5f5");
      P(bx, "#c9eefc", cx - 1, Y, 2, 4);
      for (let i = 0; i < 10; i++)
        sparkles.push([cx - 9 + ((rnd() * 16) | 0), Y + 16 + ((rnd() * 7) | 0), rnd() * 6.28]);
    }
  };

  const finish = (meta: Omit<WorldMap, "w" | "h" | "water" | keyof Painted>): WorldMap => {
    paintGround();
    paintPonds();
    afterGround.forEach((fn) => fn());
    paintNature();
    seats.forEach(paintSeat);
    things.forEach(paintThing);
    afterThings.forEach((fn) => fn());
    return {
      ...meta,
      w: W,
      h: H,
      base,
      over,
      solid,
      seats,
      things,
      crops,
      labels,
      sparkles,
      water,
    };
  };

  return {
    W,
    H,
    rnd,
    pick,
    bx,
    ox,
    P,
    circ,
    ell,
    G,
    solid,
    at,
    fill,
    block,
    building,
    room,
    seat,
    thing,
    label,
    cropRow,
    tree,
    bush,
    rock,
    lamp,
    fence,
    borderTrees,
    flowerBed,
    pond,
    window: window_,
    sign,
    rug,
    decor,
    afterThings: (fn: () => void) => afterThings.push(fn),
    finish,
  };
}

type Painted = Pick<
  WorldMap,
  "base" | "over" | "solid" | "seats" | "things" | "crops" | "labels" | "sparkles"
>;
export type Kit = ReturnType<typeof createKit>;
