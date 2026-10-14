/**
 * Shared building blocks for the Study World maps. Each map lays out tiles,
 * seats and things with the helpers here, then `finish()` paints everything
 * once onto two canvases: `base` (ground and furniture) and `over` (tree tops
 * and lamp heads drawn above avatars).
 */

export const TILE = 16;

export type MapId = "campus" | "classroom" | "cafe" | "library" | "garden" | "dorm";
/** "dorm": the dorm furniture piece itself is the seat, so nothing extra is drawn. */
export type SeatKind = "stump" | "lib" | "cafe" | "sofa" | "bench" | "chair" | "dorm";
export type Seat = {
  x: number;
  y: number;
  kind: SeatKind;
  by: object | null;
  /** Which way a seated player faces (dorm pieces that were rotated); default by kind. */
  face?: "f" | "b" | "l" | "r";
};
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
  | "ranks"
  | "furniture"
  | "dormdoor";
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
  /** Dorm furniture id (for t === "furniture"). */
  item?: string;
  /** Painted but not solid: rugs and pieces you sit in. */
  walk?: boolean;
  /**
   * Dorm furniture facing: 0 front (faces down), 1 faces right, 2 faces up
   * (seen from behind), 3 faces left. w and h are already the turned footprint.
   */
  rot?: 0 | 1 | 2 | 3;
  /** Fish tank / aquarium painted without its decorative fish (the owner's real fish are drawn live on top). */
  emptyTank?: boolean;
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
  /**
   * Windows in the back wall (tiles: left x, top y, width). The base canvas
   * has a plain daytime view; WorldCanvas paints the live sky and curtains.
   */
  windows: { x: number; y: number; w: number }[];
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

/**
 * Dorm room looks (ids match ROOM_THEMES in dorm.ts): inside wall ("V") and
 * floor ("F") colours. "cozy" is the normal look every other map uses.
 */
type RoomLook = {
  /** Wall paper and its faint stripes. */
  wall: [string, string];
  /** Dark crown at the top of the wall, and its lighter lip. */
  crown: [string, string];
  /** Wainscot panel along the bottom of the wall: base, top rail, grooves, skirting. */
  panel: [string, string, string, string];
  /** A thin coloured stripe across the panel. */
  stripe?: string;
  /** Floor boards: base, light edge, dark gap. */
  floor: [string, string, string];
  /** Café check floor instead of boards. */
  checks?: boolean;
  /** Big light concrete slabs instead of boards (floor: base, light edge, seam). */
  slabs?: boolean;
  /** Little dots on the wall paper (stars, petals). */
  dots?: string[];
  petals?: boolean;
  /** Twinkling stars on the wall (map sparkles). */
  twinkle?: boolean;
  /** Night sky through the windows. */
  night?: boolean;
};
const ROOM_LOOKS: Record<string, RoomLook> = {
  cozy: {
    wall: ["#efe2c8", "#e6d6b8"],
    crown: ["#5a3d2a", "#7a5844"],
    panel: ["#9c6b42", "#b5865a", "#8a5a33", "#6e4425"],
    floor: ["#dcb583", "#e8c597", "#c49a69"],
  },
  mint: {
    wall: ["#d4f0e1", "#c3e6d3"],
    crown: ["#3f7a64", "#5e9c84"],
    panel: ["#f4f1ea", "#ffffff", "#d8d2c4", "#9fc4b2"],
    floor: ["#ecd8b6", "#f6e7cb", "#d6bc93"],
  },
  night: {
    wall: ["#1f2a4a", "#253256"],
    crown: ["#10162a", "#2a3760"],
    panel: ["#4a3020", "#5e3d28", "#3a2416", "#24160c"],
    floor: ["#7a5236", "#8a6040", "#5e3e28"],
    dots: ["#ffffff", "#ffe58a", "#bfe3ff"],
    night: true,
  },
  cafe: {
    wall: ["#f7eedb", "#efe3c8"],
    crown: ["#5a3d2a", "#7a5844"],
    panel: ["#3f7a5c", "#5e9c7a", "#2f6b4c", "#24523a"],
    stripe: "#f2c14e",
    floor: ["#dcb583", "#e8c597", "#c49a69"],
    checks: true,
  },
  sakura: {
    wall: ["#fde4ec", "#f8d6e2"],
    crown: ["#8a4f5e", "#b06a7c"],
    panel: ["#d99aa8", "#ebb5c1", "#c4808f", "#a86474"],
    floor: ["#f2d2cd", "#fae2de", "#dfb5af"],
    dots: ["#f49ac1", "#ffc4d8", "#ffffff"],
    petals: true,
  },
  galaxy: {
    wall: ["#2a1844", "#311d4f"],
    crown: ["#140a24", "#3a2566"],
    panel: ["#2c1846", "#46307a", "#21113a", "#140a26"],
    stripe: "#a77de0",
    floor: ["#3e2a5e", "#4c3672", "#2e1f48"],
    dots: ["#c9b8ff", "#ffffff", "#ff9ee8", "#7fd1ff"],
    twinkle: true,
    night: true,
  },
  // Admin "Dev studio": charcoal panelled walls, light trim, pale floor.
  // Neon gamer den: near-black walls, dark slab floor, night outside. The
  // room is dimmed and lit by RGB/neon in WorldCanvas (ROOM_THEMES dim).
  studio: {
    wall: ["#17181e", "#1c1e25"],
    crown: ["#0d0e12", "#2a2c35"],
    panel: ["#121318", "#24262e", "#0c0d10", "#2a2c35"],
    stripe: "#a77de0",
    floor: ["#2b2d35", "#34373f", "#1f2026"],
    slabs: true,
    night: true,
  },
};
/** Dorm floor pieces (rugs) are painted under the other walk-on pieces. */
const FLOOR_ITEMS = new Set(["rug", "rug_round", "adminrug"]);
/**
 * The admin "dev studio" set (tier "admin" in dorm.ts): charcoal and
 * off-white with small cyan, violet and oak accents.
 */
const DEV = {
  ink: "#16171b",
  c1: "#1e1f24",
  c2: "#2a2c33",
  c3: "#3a3d46",
  c4: "#4a4e59",
  w0: "#f7f8fa",
  w1: "#eceef2",
  g1: "#c9ccd3",
  g2: "#a9adb6",
  g3: "#8a8f99",
  cyan: "#5ad1e6",
  teal: "#3fae8f",
  violet: "#a77de0",
  oak: "#c49a69",
  oakL: "#dcb98c",
  oakD: "#9c7650",
  screen: "#14161c",
};
/** Syntax colours for the little code on dev screens. */
/** Studio sofa fabric: a soft charcoal grey. */
const SOFA = "#545966";
const SYNTAX = ["#5ad1e6", "#a77de0", "#f2c14e", "#3fae8f", "#ff8a80", "#c9ccd3"];
/** "</>" in tube or rug pixels ("h" = lit), 11 x 5. */
const CODE_TAG = ["..h...h.h..", ".h....h..h.", "h....h....h", ".h..h....h.", "..h.h...h.."];
/** Dorm pieces that look the same from every side: never turned (rot is ignored). */
const ROUND_PIECES = new Set([
  "plant",
  "lamp",
  "lavalamp",
  "rug_round",
  "beanbag",
  "projector",
  "cattree",
]);

type Rect = [number, number, number, number];
/**
 * Where a sleeper lies in a dorm bed, in map pixels from the piece's top-left
 * (after turning). WorldCanvas draws the head on the pillow, then paints the
 * cover rectangles again from the base canvas so the blanket (and a headboard
 * nearest the viewer) sits over the body.
 */
export type SleepSpot = {
  /** Centre of the sleeper's head. */
  head: [number, number];
  /** Quarter turns clockwise from upright: 0 head up, 1 head right, 2 head down, 3 head left. */
  turn: 0 | 1 | 2 | 3;
  /** Drawn again over the sleeper: [x, y, w, h]. */
  cover: Rect[];
  /** The body under the blanket (for a soft bump): [x, y, w, h]. */
  body: Rect;
};
type SpotArt = { head: [number, number]; cover: Rect[]; body: Rect };
/**
 * Pillow and blanket of each bed's art: front (rot 0, headboard on the left),
 * side with the headboard nearest the viewer (rot 1) and side with it at the
 * top (rot 3 before it is mirrored). Rot 2 is the front mirrored.
 */
const SLEEP_ART: Record<string, { front: SpotArt; near: SpotArt; top: SpotArt }> = {
  bed: {
    front: { head: [14, 14], cover: [[20, 4, 25, 24]], body: [20, 7, 18, 15] },
    near: {
      head: [16, 29],
      cover: [
        [3, 4, 26, 22],
        [0, 32, 32, 15],
      ],
      body: [9, 6, 14, 17],
    },
    top: { head: [16, 12], cover: [[3, 19, 26, 24]], body: [9, 20, 14, 17] },
  },
  studiobed: {
    front: { head: [14, 14], cover: [[20, 4, 25, 24]], body: [24, 7, 15, 15] },
    near: {
      head: [16, 29],
      cover: [
        [3, 4, 26, 21],
        [0, 32, 32, 15],
      ],
      body: [9, 12, 14, 11],
    },
    top: { head: [16, 12], cover: [[3, 18, 26, 16]], body: [9, 21, 14, 12] },
  },
  bunkbed: {
    front: { head: [9, -6], cover: [[15, -13, 30, 17]], body: [16, -11, 18, 11] },
    near: { head: [13, 15], cover: [[3, -15, 22, 25]], body: [6, -9, 14, 17] },
    top: { head: [13, -8], cover: [[3, -3, 22, 26]], body: [6, -1, 14, 17] },
  },
};
/** Sleep spot of a bed turned to facing rot, or null if the piece isn't a bed. */
export function sleepSpot(item: string, rot: number, w: number, h: number): SleepSpot | null {
  const art = SLEEP_ART[item];
  if (!art) return null;
  const W = w * TILE;
  const flip = (a: SpotArt): SpotArt => ({
    head: [W - a.head[0], a.head[1]],
    cover: a.cover.map(([x, y, cw, ch]): Rect => [W - x - cw, y, cw, ch]),
    body: [W - a.body[0] - a.body[2], a.body[1], a.body[2], a.body[3]],
  });
  // The footprint is already turned: sideways pieces are taller than wide.
  const side = h > w;
  if (rot === 1 && side) return { ...art.near, turn: 2 };
  if (rot === 3 && side) return { ...flip(art.top), turn: 0 };
  if (rot === 2) return { ...flip(art.front), turn: 1 };
  return { ...art.front, turn: 3 };
}

export function createKit(W: number, H: number, seed: number) {
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];

  const base = makeCanvas(W * TILE, H * TILE);
  const over = makeCanvas(W * TILE, H * TILE);
  const realBx = base.getContext("2d")!;
  // Swapped for a mirrored stand-in while a turned dorm piece is painted (mirror()).
  let bx = realBx;
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
  let look = ROOM_LOOKS.cozy;
  /** Dorm room theme, called right after room(): wall and floor colours. */
  const roomTheme = (id: string) => {
    look = ROOM_LOOKS[id] ?? ROOM_LOOKS.cozy;
    if (look.checks) for (const row of G) row.forEach((t, x) => t === "F" && (row[x] = "C"));
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
  /**
   * Dorm furniture you walk onto (rugs) or sit in (chairs, sofas): painted
   * before the other things and not solid.
   */
  const decorThing = (t: ThingType, x: number, y: number, w: number, h: number, item: string) => {
    const piece: Thing = { t, x, y, w, h, item, walk: true };
    things.push(piece);
    return piece;
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
  const windows: WorldMap["windows"] = [];
  const window_ = (x: number, y: number, w: number) => {
    windows.push({ x, y, w });
    decor(() => {
      const X = x * TILE + 2;
      const Y = y * TILE + 2;
      const width = w * TILE - 4;
      P(bx, "#f6f1e7", X, Y, width, 24);
      if (look.night) {
        // Night sky: dark glass, a moon and a few stars.
        P(bx, "#1d2850", X + 2, Y + 2, width - 4, 19);
        P(bx, "#2a3870", X + 2, Y + 2, width - 4, 4);
        circ(bx, X + width - 9, Y + 8, 3, "#fff3c4");
        circ(bx, X + width - 7, Y + 7, 2, "#1d2850");
        for (let i = 0; i < 5; i++)
          P(
            bx,
            i % 2 ? "#ffe58a" : "#ffffff",
            X + 4 + ((i * 7 + x * 3) % (width - 14)),
            Y + 4 + ((i * 5) % 15),
          );
      } else {
        P(bx, "#9fd3ef", X + 2, Y + 2, width - 4, 19);
        P(bx, "#c4e6f8", X + 2, Y + 2, width - 4, 4);
        for (let i = 0; i < 3; i++)
          P(bx, "#e3f4fd", X + 6 + i * 3 + ((x * 5) % 9), Y + 8 - i, 2, 9);
      }
      for (let m = 1; m < w; m++) P(bx, "#f6f1e7", X + m * TILE - 2, Y, 2, 24);
      P(bx, "#f6f1e7", X, Y + 11, width, 2);
      P(bx, "#d9cbb0", X - 2, Y + 23, width + 4, 3);
    });
  };
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
        if (t === "F" && look.slabs) {
          // Slabs two tiles square: light edge top/left, seam bottom/right, a few specks.
          const [fb, fl, fd] = look.floor;
          P(bx, fb, X, Y, 16, 16);
          if (x % 2 === 0) P(bx, fl, X, Y, 1, 16);
          if (y % 2 === 0) P(bx, fl, X, Y, 16, 1);
          if (x % 2) P(bx, fd, X + 15, Y, 1, 16);
          if (y % 2) P(bx, fd, X, Y + 15, 16, 1);
          for (let i = 0; i < 3; i++)
            P(
              bx,
              i ? fd : fl,
              X + 1 + ((x * 7 + i * 5 + y * 3) % 13),
              Y + 1 + ((x * 3 + i * 9 + y * 5) % 13),
            );
        } else if (t === "F") {
          const [fb, fl, fd] = look.floor;
          P(bx, fb, X, Y, 16, 16);
          for (let i = 0; i < 4; i++) {
            P(bx, fl, X, Y + i * 4, 16, 1);
            P(bx, fd, X, Y + i * 4 + 3, 16, 1);
            P(bx, fd, X + ((x * 7 + i * 5 + y * 3) % 14), Y + i * 4, 1, 3);
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
          const top = at(x, y - 1) !== "V";
          const bottom = at(x, y + 1) !== "V";
          P(bx, look.wall[0], X, Y, 16, 16);
          P(bx, look.wall[1], X + 7, Y, 1, 16);
          P(bx, look.wall[1], X + 15, Y, 1, 16);
          if (look.dots) {
            // A few fixed dots per tile (stars or petals), never on the crown or panel.
            const h = (x * 73 + y * 151) % 97;
            for (let i = 0; i < 3; i++) {
              const dx = (h * (i + 3) + i * 5) % 14;
              const dy = (top ? 5 : 1) + ((h * (i + 2) + i * 7) % (bottom ? 4 : 13));
              const col = look.dots[(h + i) % look.dots.length];
              if (look.petals) {
                P(bx, col, X + dx, Y + dy, 2, 1);
                P(bx, col, X + dx + 1, Y + dy + 1);
              } else if ((h + i) % 4 === 0) {
                // A little cross-shaped star.
                P(bx, col, X + dx + 1, Y + dy, 1, 3);
                P(bx, col, X + dx, Y + dy + 1, 3, 1);
              } else P(bx, col, X + dx, Y + dy);
            }
            if (look.twinkle && h % 3 === 0)
              sparkles.push([X + 2 + (h % 11), Y + (top ? 6 : 2) + (h % (bottom ? 3 : 10)), h]);
          }
          if (top) {
            P(bx, look.crown[0], X, Y, 16, 3);
            P(bx, look.crown[1], X, Y + 3, 16, 1);
          }
          if (bottom) {
            const [pb, pt, pg, ps] = look.panel;
            P(bx, pb, X, Y + 6, 16, 10);
            P(bx, pt, X, Y + 6, 16, 2);
            P(bx, pg, X + (x % 2 ? 3 : 11), Y + 9, 1, 5);
            if (look.stripe) P(bx, look.stripe, X, Y + 8, 16, 1);
            P(bx, ps, X, Y + 14, 16, 2);
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

  /** While mirror() runs, x maps to flip - x (minus the fill's width); 0 = not mirrored. */
  let flip = 0;
  /** A twinkle point (map sparkles) for the shiny Plus and Pro pieces. */
  const glint = (x: number, y: number) =>
    sparkles.push([flip ? flip - x - 3 : x, y, rnd() * Math.PI * 2]);
  /** Runs fn with every fill (and glint) mirrored left to right inside [x0, x0 + w). */
  const mirror = (x0: number, w: number, fn: () => void) => {
    const axis = x0 * 2 + w;
    const real = bx;
    bx = {
      get fillStyle() {
        return real.fillStyle;
      },
      set fillStyle(v) {
        real.fillStyle = v;
      },
      fillRect: (x: number, y: number, fw: number, fh: number) =>
        real.fillRect(axis - x - fw, y, fw, fh),
    } as CanvasRenderingContext2D;
    flip = axis;
    fn();
    bx = real;
    flip = 0;
  };
  /** Set while painting an empty tank (Thing.emptyTank): fish() then draws nothing. */
  let noFish = false;
  /** Small side-on fish facing left (flip = facing right). */
  const fish = (x: number, y: number, body: string, flip = false) => {
    if (noFish) return;
    const rows = [".bbb.t", "bkbbbt", ".bbb.t"];
    sprite(bx, x, y, flip ? rows.map((r) => [...r].reverse().join("")) : rows, {
      b: body,
      k: "#1a1a1a",
      t: shade(body, -0.25),
    });
    P(bx, shade(body, 0.4), x + (flip ? 3 : 2), y);
  };
  /** Water, sand, weed and bubbles inside a tank's glass. */
  const tankWater = (x: number, y: number, w: number, h: number) => {
    P(bx, "#4aa3d8", x, y, w, h);
    P(bx, "#3b93cb", x, y + h - 7, w, 4);
    P(bx, "#7cc8ef", x, y, w, 2);
    P(bx, "#ebd29b", x, y + h - 3, w, 3);
    for (let i = 0; i < w; i += 3) P(bx, "#d2b77d", x + i + (i % 2), y + h - 2 + (i % 2));
    [3, 6, w - 6].forEach((sx, n) => {
      for (let j = 0; j < 7 + n * 2; j++)
        P(bx, n % 2 ? "#3f8e3b" : "#5aae51", x + sx + ((j >> 1) % 2), y + h - 4 - j);
    });
    P(bx, "#c9eefc", x + w - 3, y + 4);
    P(bx, "#c9eefc", x + w - 4, y + 7);
    P(bx, "#c9eefc", x + w - 3, y + 10);
    P(bx, "rgba(255,255,255,.35)", x + 1, y + 3, 1, 6);
  };
  /** A trophy cup standing on y (its base). */
  const cup = (cx: number, y: number, col: string, big = false) => {
    const s = big ? 1 : 0;
    P(bx, shade(col, -0.35), cx - 2 - s, y - 2, 5 + s * 2, 2);
    P(bx, shade(col, -0.2), cx - 1, y - 4, 3, 2);
    P(bx, col, cx - 2 - s, y - 9 - s, 5 + s * 2, 5 + s);
    P(bx, shade(col, -0.2), cx + 2 + s, y - 9 - s, 1, 5 + s);
    P(bx, col, cx - 3 - s, y - 8 - s, 1, 2);
    P(bx, col, cx + 3 + s, y - 8 - s, 1, 2);
    P(bx, shade(col, 0.55), cx - 1 - s, y - 9 - s, 1, 3);
  };
  const { ink, c1, c2, c3, c4, w0, w1, g1, g2, g3, cyan, teal, violet, oak, oakL, oakD } = DEV;
  /** Coloured code lines (one every 2px) on a dark screen; n picks the pattern. */
  const codeLines = (x: number, y: number, w: number, h: number, n = 0) => {
    for (let r = 0; r * 2 < h; r++) {
      const k = (r * 5 + n * 3) % 11;
      let lx = x + 1 + (k % 3) * 2;
      for (let t = 0; t < 1 + (k % 4) && lx < x + w - 1; t++) {
        const len = Math.min(2 + ((k + t * 3) % 5), x + w - 1 - lx);
        P(bx, SYNTAX[(k + t * 2 + r) % SYNTAX.length], lx, y + r * 2, len, 1);
        lx += len + 1;
      }
    }
  };
  /** The same code seen edge-on: a dotted column of colours. */
  const codeColumn = (x: number, y: number, h: number, n = 0) => {
    for (let j = 0; j < h; j++)
      if ((j + n) % 3 !== 2) P(bx, SYNTAX[(j * 5 + n) % SYNTAX.length], x, y + j);
  };
  /** Neon tube letters ("h" rows) with a soft glow round them. */
  const neon = (rows: string[], x: number, y: number, col: string, halo: string) => {
    [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ].forEach(([dx, dy]) => sprite(bx, x + dx, y + dy, rows, { h: halo }));
    sprite(bx, x, y, rows, { h: col });
  };
  /** The studio rug on any footprint; slash flips "/" for the mirrored view. */
  const studioRug = (X: number, Y: number, WW: number, HH: number, slash: boolean) => {
    const w = WW - 4;
    const h = HH - 4;
    P(bx, c1, X + 2, Y + 2, w, h);
    P(bx, c2, X + 3, Y + 3, w - 2, h - 2);
    P(bx, cyan, X + 4, Y + 4, w - 4, h - 4);
    P(bx, c2, X + 5, Y + 5, w - 6, h - 6);
    // Off-white field cut on the diagonal: charcoal lower half with a light pinstripe.
    const fw = w - 8;
    const fh = h - 8;
    P(bx, w1, X + 6, Y + 6, fw, fh);
    for (let j = 0; j < fh; j++) {
      const k = Math.round(((j + 1) * fw) / fh);
      const at = (x0: number, n: number) => (slash ? X + 6 + fw - x0 - n : X + 6 + x0);
      P(bx, c3, at(0, k), Y + 6 + j, k, 1);
      if (k > 4) P(bx, g2, at(k - 4, 1), Y + 6 + j, 1, 1);
      if (j % 3 === 0 && k < fw - 3) P(bx, g1, at(k + 2, 1), Y + 6 + j, 1, 1);
    }
    // The "</>" badge in the middle.
    const bw = 17;
    const bh = 9;
    const bx0 = X + ((WW - bw) >> 1);
    const by0 = Y + ((HH - bh) >> 1);
    P(bx, c2, bx0 + 1, by0, bw - 2, bh);
    P(bx, c2, bx0, by0 + 1, bw, bh - 2);
    P(bx, c3, bx0 + 1, by0 + 1, bw - 2, 1);
    const rows = slash ? CODE_TAG : CODE_TAG.map((r) => [...r].reverse().join(""));
    sprite(bx, bx0 + 3, by0 + 2, rows, { h: w0 });
    for (let j = 0; j < 5; j++)
      P(bx, cyan, bx0 + 3 + (slash ? [6, 6, 5, 4, 4][j] : [4, 4, 5, 6, 6][j]), by0 + 2 + j);
  };

  /** Dorm furniture facing the front (rot 0), by piece id (see FURNITURE in dorm.ts). */
  const paintFront = (o: Thing) => {
    const X = o.x * TILE;
    const Y = o.y * TILE;
    const WW = o.w * TILE;
    const cx = X + WW / 2;
    const it = o.item;
    // ─── Free ───
    if (it === "bed") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 29, WW - 3, 3);
      P(bx, "#4e3019", X + 1, Y + 3, WW - 2, 27);
      P(bx, "#8a5a33", X + 2, Y + 4, WW - 4, 20);
      P(bx, "#6e4428", X + 2, Y + 24, WW - 4, 5);
      P(bx, "#8a5a33", X + 2, Y + 24, WW - 4, 1);
      P(bx, "#e8e2d6", X + 9, Y + 5, WW - 13, 19);
      P(bx, "#fdfaf2", X + 9, Y + 5, WW - 13, 2);
      P(bx, "#d8d2c4", X + 10, Y + 9, 9, 13);
      P(bx, "#ffffff", X + 10, Y + 8, 8, 12);
      P(bx, "#e8e2d6", X + 13, Y + 11, 1, 6);
      const bl = "#4a78c2";
      P(bx, shade(bl, -0.3), X + 21, Y + 5, WW - 25, 22);
      P(bx, bl, X + 21, Y + 5, WW - 25, 18);
      P(bx, shade(bl, 0.45), X + 21, Y + 5, WW - 25, 1);
      P(bx, shade(bl, 0.3), X + 21, Y + 6, 4, 17);
      for (let i = X + 28; i < X + WW - 6; i += 6)
        for (let j = Y + 9; j < Y + 21; j += 6) P(bx, shade(bl, 0.2), i + ((j >> 1) % 3), j, 2, 2);
      P(bx, "#4e3019", X + 1, Y - 4, 8, 34);
      P(bx, "#8a5a33", X + 2, Y - 3, 6, 32);
      P(bx, "#a8744a", X + 2, Y - 3, 6, 2);
      P(bx, "#6e4428", X + 7, Y - 1, 1, 30);
      P(bx, "#4e3019", X + WW - 4, Y + 1, 3, 29);
      P(bx, "#a8744a", X + WW - 3, Y + 1, 1, 2);
    }
    if (it === "desk") paintThing({ ...o, t: "desk" });
    if (it === "chair") {
      P(bx, "rgba(0,0,0,.15)", X + 3, Y + 13, 10, 2);
      P(bx, "#5e3a20", X + 3, Y - 5, 10, 11);
      P(bx, "#a8744a", X + 4, Y - 4, 8, 9);
      P(bx, "#c48d5d", X + 4, Y - 4, 8, 1);
      P(bx, "#8a5a33", X + 6, Y - 2, 1, 6);
      P(bx, "#8a5a33", X + 9, Y - 2, 1, 6);
      P(bx, "#5e3a20", X + 2, Y + 4, 12, 8);
      P(bx, "#c0504d", X + 3, Y + 4, 10, 5);
      P(bx, "#d9726e", X + 3, Y + 4, 10, 1);
      P(bx, "#a8744a", X + 3, Y + 9, 10, 2);
      P(bx, "#5e3a20", X + 3, Y + 12, 2, 3);
      P(bx, "#5e3a20", X + 11, Y + 12, 2, 3);
    }
    if (it === "plant") {
      ell(bx, X + 8, Y + 15, 6, 1, "rgba(0,0,0,.2)");
      P(bx, "#2f7432", X + 7, Y + 2, 2, 7);
      circ(bx, X + 4, Y + 3, 4, "#2f7432");
      circ(bx, X + 12, Y + 2, 4, "#2f7432");
      circ(bx, X + 8, Y - 3, 5, "#2f7432");
      circ(bx, X + 4, Y + 2, 3, "#3f8e3b");
      circ(bx, X + 12, Y + 1, 3, "#3f8e3b");
      circ(bx, X + 8, Y - 4, 4, "#3f8e3b");
      P(bx, "#5aae51", X + 6, Y - 7, 2, 2);
      P(bx, "#5aae51", X + 2, Y, 2, 1);
      P(bx, "#5aae51", X + 11, Y - 1, 2, 1);
      P(bx, "#2c6b2e", X + 8, Y - 5, 1, 4);
      P(bx, "#a24c27", X + 4, Y + 8, 8, 7);
      P(bx, "#d06e3d", X + 3, Y + 7, 10, 2);
      P(bx, "#8a3e1f", X + 10, Y + 9, 2, 6);
    }
    if (it === "rug") {
      const cols = ["#7a3530", "#e2b07a", "#a8423f"];
      const w = WW - 4;
      const h = o.h * TILE - 4;
      P(bx, cols[0], X + 2, Y + 2, w, h);
      P(bx, cols[1], X + 4, Y + 4, w - 4, h - 4);
      P(bx, cols[2], X + 6, Y + 6, w - 8, h - 8);
      for (let i = X + 10; i < X + w - 6; i += 8) {
        P(bx, cols[1], i, Y + 8, 3, 2);
        P(bx, cols[1], i, Y + h - 6, 3, 2);
      }
      P(bx, cols[1], cx - 3, Y + h / 2, 7, 3);
      P(bx, cols[1], cx - 1, Y + h / 2 - 2, 3, 7);
      for (let j = Y + 3; j < Y + h + 1; j += 2) {
        P(bx, "#f4ead6", X, j, 2, 1);
        P(bx, "#f4ead6", X + WW - 2, j, 2, 1);
      }
    }
    if (it === "lamp") {
      ell(bx, X + 8, Y + 13, 7, 3, "rgba(255,226,150,.18)");
      ell(bx, X + 8, Y + 14, 4, 1, "rgba(0,0,0,.2)");
      P(bx, "#3d3d45", X + 5, Y + 12, 6, 2);
      P(bx, "#3d3d45", X + 7, Y - 7, 2, 19);
      P(bx, "#5a5a66", X + 7, Y - 7, 1, 19);
      P(bx, "rgba(255,226,150,.3)", X + 2, Y - 7, 12, 3);
      P(bx, "#d9b77a", X + 5, Y - 15, 6, 1);
      P(bx, "#f6e7c4", X + 4, Y - 14, 8, 4);
      P(bx, "#f6e7c4", X + 3, Y - 10, 10, 2);
      P(bx, "#e0c99a", X + 10, Y - 13, 2, 5);
      P(bx, "#d9b77a", X + 3, Y - 8, 10, 1);
      P(bx, "#fff6d6", X + 5, Y - 7, 6, 1);
    }
    if (it === "shelf_small") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 14, 30, 2);
      P(bx, "#4e3019", X + 1, Y - 4, 30, 19);
      P(bx, "#8a5a33", X + 2, Y - 3, 28, 17);
      P(bx, "#a8744a", X + 2, Y - 3, 28, 2);
      P(bx, "#2e1c10", X + 4, Y + 1, 11, 11);
      P(bx, "#2e1c10", X + 17, Y + 1, 11, 11);
      let xx = X + 4;
      while (xx < X + 13) {
        const c = pick(BOOK_COLORS);
        const h = 6 + ((rnd() * 4) | 0);
        P(bx, c, xx, Y + 12 - h, 2, h);
        P(bx, shade(c, 0.35), xx, Y + 13 - h);
        xx += 2;
      }
      P(bx, "#c8a070", X + 18, Y + 5, 9, 7);
      P(bx, "#a8844f", X + 18, Y + 7, 9, 1);
      P(bx, "#a8844f", X + 18, Y + 10, 9, 1);
      P(bx, "#e0c494", X + 18, Y + 5, 9, 1);
      P(bx, "#a24c27", X + 23, Y - 7, 5, 4);
      circ(bx, X + 25, Y - 9, 3, "#3f8e3b");
      P(bx, "#5aae51", X + 24, Y - 11, 2, 1);
      P(bx, "#f4f1ea", X + 6, Y - 9, 8, 6);
      P(bx, "#7fa2c8", X + 7, Y - 8, 6, 4);
      P(bx, "#4fbf6a", X + 7, Y - 6, 6, 2);
    }
    if (it === "wardrobe") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, 30, 2);
      P(bx, "#4e3019", X + 1, Y - 16, 30, 31);
      P(bx, "#8a5a33", X + 2, Y - 15, 28, 29);
      P(bx, "#a8744a", X + 2, Y - 15, 28, 2);
      P(bx, "#6e4428", X + 2, Y - 13, 28, 1);
      P(bx, "#6e4428", X + 15, Y - 12, 2, 25);
      P(bx, "#9c6b42", X + 4, Y - 10, 10, 21);
      P(bx, "#9c6b42", X + 18, Y - 10, 10, 21);
      P(bx, "#b07a46", X + 4, Y - 10, 1, 21);
      P(bx, "#b07a46", X + 18, Y - 10, 1, 21);
      P(bx, "#7a4e2c", X + 4, Y + 10, 10, 1);
      P(bx, "#7a4e2c", X + 18, Y + 10, 10, 1);
      P(bx, "#f2c14e", X + 12, Y - 1, 2, 3);
      P(bx, "#f2c14e", X + 18, Y - 1, 2, 3);
      P(bx, "#4e3019", X + 3, Y + 14, 3, 2);
      P(bx, "#4e3019", X + 26, Y + 14, 3, 2);
    }
    // ─── Coins ───
    if (it === "beanbag") {
      ell(bx, X + 8, Y + 14, 7, 2, "rgba(0,0,0,.2)");
      ell(bx, X + 8, Y + 8, 7, 6, "#a8582a");
      ell(bx, X + 8, Y + 7, 6, 5, "#e2874c");
      ell(bx, X + 8, Y + 9, 4, 2, "#c96e36");
      ell(bx, X + 6, Y + 4, 2, 1, "#f6b27a");
      P(bx, "#fdfaf2", X + 11, Y + 3, 1, 1);
    }
    if (it === "sofa") {
      const c = "#3fae8f";
      P(bx, "rgba(0,0,0,.18)", X + 1, Y + 14, WW - 2, 2);
      P(bx, shade(c, -0.5), X, Y - 6, WW, 20);
      P(bx, shade(c, -0.15), X + 1, Y - 5, WW - 2, 9);
      P(bx, shade(c, 0.25), X + 1, Y - 5, WW - 2, 1);
      for (let i = 1; i < o.w; i++) P(bx, shade(c, -0.3), X + i * 16, Y - 3, 1, 6);
      P(bx, c, X + 4, Y + 3, WW - 8, 7);
      P(bx, shade(c, 0.3), X + 4, Y + 3, WW - 8, 1);
      for (let i = 1; i < o.w; i++) P(bx, shade(c, -0.3), X + i * 16, Y + 3, 1, 7);
      P(bx, shade(c, -0.3), X + 1, Y + 10, WW - 2, 3);
      P(bx, shade(c, -0.1), X + 1, Y - 1, 4, 12);
      P(bx, shade(c, -0.1), X + WW - 5, Y - 1, 4, 12);
      P(bx, shade(c, 0.25), X + 1, Y - 1, 4, 1);
      P(bx, shade(c, 0.25), X + WW - 5, Y - 1, 4, 1);
      P(bx, "#4e3019", X + 2, Y + 13, 2, 2);
      P(bx, "#4e3019", X + WW - 4, Y + 13, 2, 2);
      P(bx, "#f2c14e", X + 5, Y - 3, 6, 5);
      P(bx, "#ffe08a", X + 5, Y - 3, 6, 1);
      P(bx, "#f2b8c8", X + WW - 11, Y - 3, 6, 5);
      P(bx, "#ffd7e2", X + WW - 11, Y - 3, 6, 1);
    }
    if (it === "bookshelf") paintThing({ ...o, t: "shelf" });
    if (it === "lavalamp") {
      ell(bx, X + 8, Y + 6, 7, 8, "rgba(255,138,92,.12)");
      ell(bx, X + 8, Y + 14, 4, 1, "rgba(0,0,0,.2)");
      P(bx, "#5a5a66", X + 4, Y + 12, 8, 3);
      P(bx, "#8a8a96", X + 5, Y + 8, 6, 4);
      P(bx, "#b8bcc2", X + 5, Y + 8, 2, 4);
      P(bx, "#4a2a7a", X + 5, Y - 5, 6, 13);
      P(bx, "#4a2a7a", X + 4, Y + 1, 8, 7);
      P(bx, "#a77de0", X + 6, Y - 4, 4, 12);
      P(bx, "#a77de0", X + 5, Y + 1, 6, 6);
      ell(bx, X + 8, Y + 5, 2, 1, "#ff8a5c");
      P(bx, "#ff8a5c", X + 7, Y - 2, 2, 2);
      P(bx, "#ffb08a", X + 8, Y + 1, 1, 1);
      P(bx, "#d6c2ff", X + 6, Y - 3, 1, 8);
      P(bx, "#8a8a96", X + 6, Y - 7, 4, 2);
      P(bx, "#b8bcc2", X + 6, Y - 7, 1, 2);
    }
    if (it === "gamingchair") {
      ell(bx, X + 8, Y + 14, 6, 1, "rgba(0,0,0,.2)");
      P(bx, "#2a2a30", X + 3, Y + 13, 10, 1);
      P(bx, "#2a2a30", X + 2, Y + 14, 2, 1);
      P(bx, "#2a2a30", X + 12, Y + 14, 2, 1);
      P(bx, "#5a5a66", X + 7, Y + 10, 2, 4);
      P(bx, "#1b1b1f", X + 3, Y - 9, 10, 15);
      P(bx, "#2d2d33", X + 4, Y - 8, 8, 13);
      P(bx, "#e24b4a", X + 4, Y - 8, 2, 13);
      P(bx, "#e24b4a", X + 10, Y - 8, 2, 13);
      P(bx, "#f4f1ea", X + 6, Y - 7, 4, 2);
      P(bx, "#1b1b1f", X + 2, Y + 3, 12, 8);
      P(bx, "#2d2d33", X + 3, Y + 4, 10, 5);
      P(bx, "#e24b4a", X + 3, Y + 4, 10, 1);
      P(bx, "#1b1b1f", X + 1, Y + 1, 2, 6);
      P(bx, "#1b1b1f", X + 13, Y + 1, 2, 6);
      P(bx, "#5a5a66", X + 1, Y + 1, 2, 1);
      P(bx, "#5a5a66", X + 13, Y + 1, 2, 1);
    }
    if (it === "fridge") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, 13, 2);
      P(bx, "#8a96a3", X + 2, Y - 7, 12, 22);
      P(bx, "#e8eef2", X + 3, Y - 6, 10, 20);
      P(bx, "#ffffff", X + 3, Y - 6, 10, 1);
      P(bx, "#c9d3da", X + 12, Y - 6, 1, 20);
      P(bx, "#8a96a3", X + 3, Y, 10, 1);
      P(bx, "#8a96a3", X + 10, Y - 4, 1, 3);
      P(bx, "#8a96a3", X + 10, Y + 3, 1, 6);
      P(bx, "#e24b4a", X + 5, Y - 4, 2, 2);
      P(bx, "#3d7fd6", X + 7, Y + 3, 2, 2);
      P(bx, "#ffe58a", X + 4, Y + 7, 4, 4);
      P(bx, "#e8c94a", X + 4, Y + 7, 4, 1);
      P(bx, "#5a5a66", X + 3, Y + 14, 2, 1);
      P(bx, "#5a5a66", X + 11, Y + 14, 2, 1);
    }
    if (it === "rug_round") {
      const cy = Y + o.h * 8;
      ell(bx, cx, cy, WW / 2 - 2, o.h * 8 - 2, "#5a3d6b");
      ell(bx, cx, cy, WW / 2 - 4, o.h * 8 - 4, "#e2b07a");
      ell(bx, cx, cy, WW / 2 - 6, o.h * 8 - 6, "#6f4c84");
      ell(bx, cx, cy, WW / 2 - 12, o.h * 8 - 9, "#8a66a0");
      ell(bx, cx, cy, WW / 2 - 16, o.h * 8 - 12, "#e2b07a");
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6)
        P(
          bx,
          "#e2b07a",
          Math.round(cx + Math.cos(a) * (WW / 2 - 9)),
          Math.round(cy + Math.sin(a) * (o.h * 8 - 7)),
          2,
          1,
        );
    }
    if (it === "tv") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 14, 30, 2);
      P(bx, "#3a2a25", X + 2, Y + 4, 28, 11);
      P(bx, "#5e463e", X + 2, Y + 4, 28, 1);
      P(bx, "#2a1e1a", X + 15, Y + 6, 1, 8);
      P(bx, "#4a3730", X + 4, Y + 6, 10, 7);
      P(bx, "#4a3730", X + 17, Y + 6, 11, 7);
      P(bx, "#c8a24a", X + 12, Y + 9, 1, 2);
      P(bx, "#c8a24a", X + 18, Y + 9, 1, 2);
      P(bx, "#1b1b1f", X + 13, Y + 2, 6, 3);
      P(bx, "#1b1b1f", X + 3, Y - 12, 26, 15);
      P(bx, "#2d2d33", X + 3, Y - 12, 26, 1);
      P(bx, "#2d3b48", X + 5, Y - 10, 22, 11);
      P(bx, "#3e5163", X + 7, Y - 9, 2, 1);
      P(bx, "#3e5163", X + 6, Y - 8, 2, 1);
      P(bx, "#3e5163", X + 20, Y - 3, 4, 1);
      P(bx, "#3fae8f", X + 26, Y + 1, 1, 1);
    }
    if (it === "speaker") {
      P(bx, "rgba(0,0,0,.2)", X + 3, Y + 14, 11, 2);
      P(bx, "#1b1b1f", X + 3, Y - 9, 10, 24);
      P(bx, "#2d2d33", X + 4, Y - 8, 8, 22);
      P(bx, "#3d3d45", X + 4, Y - 8, 8, 1);
      circ(bx, X + 8, Y - 3, 2, "#111");
      P(bx, "#5a5a66", X + 8, Y - 3);
      circ(bx, X + 8, Y + 7, 3, "#111");
      circ(bx, X + 8, Y + 7, 1, "#3d3d45");
      P(bx, "#8a8a96", X + 6, Y + 5);
      P(bx, "#3fae8f", X + 10, Y - 7);
    }
    // ─── Plus ───
    if (it === "fishtank") {
      P(bx, "rgba(0,0,0,.2)", X + 1, Y + 14, 31, 2);
      P(bx, "#4e3019", X + 1, Y + 3, 30, 12);
      P(bx, "#6e4428", X + 2, Y + 4, 28, 10);
      P(bx, "#8a5a33", X + 2, Y + 4, 28, 1);
      P(bx, "#4e3019", X + 16, Y + 5, 1, 9);
      P(bx, "#c8a24a", X + 14, Y + 8, 1, 2);
      P(bx, "#c8a24a", X + 18, Y + 8, 1, 2);
      P(bx, "#2a3550", X + 1, Y - 15, 30, 19);
      tankWater(X + 2, Y - 13, 28, 16);
      ell(bx, X + 19, Y + 1, 3, 1, "#8f949a");
      fish(X + 8, Y - 9, "#e2874c");
      fish(X + 18, Y - 5, "#f2c14e", true);
      fish(X + 11, Y - 3, "#a77de0");
      P(bx, "#1b1b1f", X + 1, Y - 16, 30, 2);
      P(bx, "#3d3d45", X + 1, Y - 16, 30, 1);
      P(bx, "#ffe58a", X + 11, Y - 14, 10, 1);
      glint(X + 5, Y - 12);
      glint(X + 21, Y - 9);
    }
    if (it === "trophy") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, 30, 2);
      P(bx, "#4e3019", X + 1, Y - 15, 30, 30);
      P(bx, "#6e4428", X + 2, Y - 14, 28, 28);
      P(bx, "#8a5a33", X + 2, Y - 14, 28, 2);
      P(bx, "#2e1c10", X + 4, Y - 11, 24, 10);
      P(bx, "#2e1c10", X + 4, Y + 2, 24, 9);
      cup(X + 8, Y - 1, "#c9cdd2");
      cup(X + 16, Y - 1, "#f2c14e", true);
      cup(X + 24, Y - 1, "#d0844a");
      P(bx, "#a8744a", X + 3, Y - 1, 26, 2);
      P(bx, "#a8744a", X + 3, Y + 11, 26, 2);
      P(bx, "#c0504d", X + 7, Y + 2, 2, 4);
      P(bx, "#3d7fd6", X + 9, Y + 2, 2, 4);
      circ(bx, X + 9, Y + 7, 2, "#f2c14e");
      P(bx, "#ffe08a", X + 8, Y + 6);
      P(bx, "#4e3019", X + 15, Y + 4, 11, 7);
      P(bx, "#c8a24a", X + 16, Y + 5, 9, 5);
      P(bx, "#8a6a20", X + 18, Y + 7, 5, 1);
      P(bx, "rgba(255,255,255,.18)", X + 5, Y - 10, 1, 8);
      P(bx, "rgba(255,255,255,.18)", X + 5, Y + 3, 1, 7);
      glint(X + 14, Y - 9);
      glint(X + 6, Y - 7);
      glint(X + 7, Y + 7);
    }
    if (it === "deluxedesk") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, 30, 2);
      ell(bx, X + 25, Y + 4, 6, 4, "rgba(255,230,160,.18)");
      P(bx, "#2e1c10", X + 1, Y + 10, 30, 5);
      P(bx, "#4e3019", X + 2, Y + 11, 13, 3);
      P(bx, "#4e3019", X + 17, Y + 11, 13, 3);
      P(bx, "#f2c14e", X + 7, Y + 12, 3, 1);
      P(bx, "#f2c14e", X + 22, Y + 12, 3, 1);
      P(bx, "#2e1c10", X, Y, 32, 11);
      P(bx, "#5e3a20", X + 1, Y + 1, 30, 9);
      P(bx, "#7a4e2c", X + 1, Y + 1, 30, 2);
      P(bx, "#f2c14e", X, Y + 10, 32, 1);
      P(bx, "#ffe08a", X + 2, Y + 10, 6, 1);
      P(bx, "#8a8a96", X + 3, Y + 5, 13, 4);
      P(bx, "#b8bcc2", X + 3, Y + 5, 13, 1);
      for (let i = 0; i < 5; i++) P(bx, "#5a5a66", X + 4 + i * 2, Y + 7, 1, 1);
      P(bx, "#3d3d45", X + 4, Y - 6, 11, 11);
      P(bx, "#7fd1ff", X + 5, Y - 5, 9, 8);
      P(bx, "#ffffff", X + 6, Y - 4, 4, 1);
      P(bx, "#ffd1e8", X + 6, Y - 2, 6, 1);
      P(bx, "#c4f0ff", X + 6, Y, 3, 1);
      P(bx, "#fdfaf2", X + 18, Y + 3, 3, 4);
      P(bx, "#c0504d", X + 18, Y + 3, 3, 1);
      P(bx, "#fdfaf2", X + 21, Y + 4, 1, 2);
      P(bx, "#c8a24a", X + 25, Y - 1, 2, 7);
      P(bx, "#c8a24a", X + 23, Y + 6, 6, 2);
      P(bx, "#f2c14e", X + 22, Y - 4, 7, 3);
      P(bx, "#ffe08a", X + 22, Y - 4, 7, 1);
      P(bx, "#fff6d6", X + 23, Y - 1, 5, 1);
      glint(X + 22, Y - 6);
      glint(X + 8, Y - 7);
    }
    if (it === "hammock") {
      ell(bx, cx, Y + 13, WW / 2 - 8, 2, "rgba(0,0,0,.18)");
      const w = WW - 16;
      for (let i = 0; i < w; i++) {
        const sag = Math.round(Math.sin((Math.PI * i) / (w - 1)) * 5);
        const col = ["#3fae8f", "#f6f0e0", "#f2c14e"][Math.floor(i / 4) % 3];
        P(bx, shade(col, -0.5), X + 8 + i, Y - 3 + sag, 1, 10);
        P(bx, shade(col, -0.2), X + 8 + i, Y - 2 + sag, 1, 8);
        P(bx, col, X + 8 + i, Y - 2 + sag, 1, 5);
        P(bx, shade(col, 0.35), X + 8 + i, Y - 2 + sag, 1, 1);
        if (i % 2) P(bx, "#f6f0e0", X + 8 + i, Y + 7 + sag);
      }
      for (let i = 0; i < 5; i++) {
        P(bx, "#d8c8a0", X + 3 + i, Y - 8 + i, 1, 2);
        P(bx, "#d8c8a0", X + WW - 4 - i, Y - 8 + i, 1, 2);
      }
      [X + 1, X + WW - 4].forEach((px) => {
        P(bx, "#4e3019", px, Y - 10, 3, 25);
        P(bx, "#8a5a33", px + 1, Y - 10, 1, 25);
        P(bx, "#a8744a", px, Y - 10, 3, 1);
      });
    }
    if (it === "neonsign") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, 30, 2);
      P(bx, "#2a2a30", X + 6, Y + 3, 2, 12);
      P(bx, "#2a2a30", X + 24, Y + 3, 2, 12);
      P(bx, "#3d3d45", X + 4, Y + 13, 6, 2);
      P(bx, "#3d3d45", X + 22, Y + 13, 6, 2);
      P(bx, "#0e0e16", X + 1, Y - 15, 30, 19);
      P(bx, "#1b1b28", X + 2, Y - 14, 28, 17);
      const glow = (rows: string[], x: number, y: number, col: string) => {
        const halo = { h: col.replace("1)", ".22)") };
        [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ].forEach(([dx, dy]) => sprite(bx, x + dx, y + dy, rows, halo));
      };
      const heart = [".hh.hh.", "h..h..h", "h.....h", ".h...h.", "..h.h..", "...h..."];
      const word = [
        "dd..rr..eee..a..m.m",
        "d.d.r.r.e...a.a.mmm",
        "d.d.rr..ee..aaa.m.m",
        "d.d.r.r.e...a.a.m.m",
        "dd..r.r.eee.a.a.m.m",
      ].map((r) => r.replace(/[a-z]/g, "h"));
      glow(heart, cx - 3, Y - 13, "rgba(255,90,180,1)");
      glow(word, cx - 9, Y - 5, "rgba(94,242,255,1)");
      sprite(bx, cx - 3, Y - 13, heart, { h: "#ff5ab4" });
      sprite(bx, cx - 9, Y - 5, word, { h: "#5ef2ff" });
      P(bx, "#ffd1ec", cx - 2, Y - 13, 1, 1);
      P(bx, "#d8fcff", cx - 9, Y - 5, 1, 1);
      glint(cx - 4, Y - 12);
      glint(cx + 4, Y - 3);
    }
    if (it === "cattree") {
      ell(bx, X + 8, Y + 15, 7, 1, "rgba(0,0,0,.2)");
      P(bx, "#8a66a0", X + 1, Y + 11, 14, 4);
      P(bx, "#a985bd", X + 1, Y + 11, 14, 1);
      P(bx, "#d9c08a", X + 6, Y - 11, 4, 22);
      for (let j = Y - 10; j < Y + 11; j += 2) P(bx, "#b89a62", X + 6, j, 4, 1);
      P(bx, "#6e4f80", X + 1, Y, 9, 3);
      P(bx, "#a985bd", X + 1, Y, 9, 1);
      P(bx, "#f4f1ea", X + 2, Y + 3, 1, 4);
      P(bx, "#e24b4a", X + 1, Y + 7, 3, 2);
      P(bx, "#6e4f80", X + 4, Y - 12, 11, 3);
      P(bx, "#a985bd", X + 4, Y - 12, 11, 1);
      sprite(
        bx,
        X + 6,
        Y - 20,
        ["o...o...", "oo.oo...", "ooooo...", "okook...", "ooooo..t", ".ooooo.t", ".oooooot"],
        { o: "#e2874c", k: "#1a1a1a", t: "#c96e36" },
      );
      P(bx, "#ffb08a", X + 7, Y - 17, 1, 1);
      P(bx, "#f6b27a", X + 8, Y - 16, 3, 1);
    }
    if (it === "bunkbed") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 29, WW - 3, 3);
      P(bx, "rgba(0,0,0,.22)", X + 3, Y + 8, WW - 6, 21);
      // Cosy corner under the loft: a little desk with a lamp.
      ell(bx, X + 14, Y + 17, 8, 5, "rgba(255,226,150,.18)");
      P(bx, "#5e3a20", X + 6, Y + 18, 18, 7);
      P(bx, "#a8744a", X + 6, Y + 18, 18, 5);
      P(bx, "#c48d5d", X + 6, Y + 18, 18, 1);
      P(bx, "#5e3a20", X + 7, Y + 25, 2, 4);
      P(bx, "#5e3a20", X + 21, Y + 25, 2, 4);
      P(bx, "#fff", X + 9, Y + 19, 6, 3);
      P(bx, "#3d3d45", X + 19, Y + 14, 1, 5);
      P(bx, "#a77de0", X + 17, Y + 13, 5, 2);
      P(bx, "#fff6d6", X + 18, Y + 15, 3, 1);
      // Posts and the loft.
      [X + 1, X + WW - 4].forEach((px) => {
        P(bx, "#4e3019", px, Y - 14, 3, 44);
        P(bx, "#8a5a33", px + 1, Y - 14, 1, 44);
      });
      P(bx, "#4e3019", X + 1, Y - 15, WW - 2, 20);
      P(bx, "#e8e2d6", X + 4, Y - 12, WW - 8, 14);
      P(bx, "#fdfaf2", X + 4, Y - 12, WW - 8, 1);
      P(bx, "#ffffff", X + 5, Y - 10, 8, 9);
      P(bx, "#d8d2c4", X + 5, Y - 2, 8, 1);
      const bl = "#a77de0";
      P(bx, shade(bl, -0.3), X + 16, Y - 12, WW - 20, 15);
      P(bx, bl, X + 16, Y - 12, WW - 20, 13);
      P(bx, shade(bl, 0.4), X + 16, Y - 12, WW - 20, 1);
      P(bx, shade(bl, 0.25), X + 16, Y - 11, 3, 12);
      for (let i = X + 23; i < X + WW - 6; i += 6) P(bx, "#ffe58a", i, Y - 8 + ((i >> 2) % 2) * 4);
      P(bx, "#6e4428", X + 1, Y + 3, WW - 2, 5);
      P(bx, "#8a5a33", X + 1, Y + 3, WW - 2, 1);
      P(bx, "#4e3019", X + 1, Y + 8, WW - 2, 1);
      // String lights on the rail.
      for (let i = 0; i < WW - 8; i += 5) {
        P(bx, "#3d3d45", X + 4 + i, Y + 5 + (i % 2), 5, 1);
        P(
          bx,
          ["#ffd84d", "#ff9ec4", "#7fd1ff", "#9fe0c8"][(i / 5) % 4],
          X + 6 + i,
          Y + 6 + (i % 2),
        );
      }
      // Ladder.
      P(bx, "#8a5a33", X + WW - 13, Y + 8, 2, 22);
      P(bx, "#8a5a33", X + WW - 7, Y + 8, 2, 22);
      for (let j = Y + 11; j < Y + 29; j += 4) P(bx, "#a8744a", X + WW - 13, j, 8, 1);
      glint(X + 12, Y + 5);
      glint(X + 30, Y + 6);
    }
    // ─── Pro ───
    if (it === "aquarium") {
      P(bx, "rgba(0,0,0,.22)", X + 1, Y + 14, WW - 1, 2);
      P(bx, "#2e1c10", X, Y + 3, WW, 12);
      P(bx, "#4e3019", X + 1, Y + 4, WW - 2, 10);
      P(bx, "#f2c14e", X, Y + 3, WW, 1);
      P(bx, "#ffe08a", X + 2, Y + 3, 8, 1);
      for (let i = 1; i < 3; i++) P(bx, "#2e1c10", X + i * 16, Y + 5, 1, 8);
      for (let i = 0; i < 3; i++) P(bx, "#f2c14e", X + i * 16 + 7, Y + 8, 2, 2);
      P(bx, "#9c7a2c", X, Y - 18, WW, 21);
      P(bx, "#1e2a44", X + 1, Y - 17, WW - 2, 19);
      tankWater(X + 2, Y - 15, WW - 4, 17);
      // Coral, a little castle and a treasure chest.
      P(bx, "#ff7a6b", X + 10, Y - 4, 1, 4);
      P(bx, "#ff7a6b", X + 9, Y - 3, 3, 1);
      P(bx, "#ff7a6b", X + 12, Y - 6, 1, 6);
      P(bx, "#ff9ec4", X + 13, Y - 4, 2, 1);
      P(bx, "#b8bcc2", X + 22, Y - 7, 7, 8);
      P(bx, "#8f949a", X + 22, Y - 9, 2, 2);
      P(bx, "#8f949a", X + 27, Y - 9, 2, 2);
      P(bx, "#2a3550", X + 24, Y - 3, 3, 4);
      P(bx, "#e24b4a", X + 25, Y - 12, 1, 3);
      P(bx, "#8a5a33", X + 33, Y - 2, 6, 3);
      P(bx, "#f2c14e", X + 33, Y - 3, 6, 1);
      P(bx, "#ffe08a", X + 35, Y - 4, 2, 1);
      fish(X + 6, Y - 12, "#e2874c");
      fish(X + 30, Y - 11, "#f2c14e", true);
      fish(X + 16, Y - 9, "#5b9cff");
      fish(X + 34, Y - 7, "#ff7aa8", true);
      fish(X + 4, Y - 6, "#3fae8f", true);
      P(bx, "#1b1b1f", X - 1, Y - 20, WW + 2, 3);
      P(bx, "#f2c14e", X - 1, Y - 20, WW + 2, 1);
      P(bx, "#ffe58a", X + 6, Y - 17, WW - 12, 1);
      for (let i = 0; i < 6; i++)
        glint(X + 4 + ((rnd() * (WW - 10)) | 0), Y - 14 + ((rnd() * 12) | 0));
    }
    if (it === "arcade") {
      P(bx, "rgba(0,0,0,.22)", X, Y + 14, 16, 2);
      P(bx, "#1b1440", X + 1, Y - 15, 14, 31);
      P(bx, "#3b2f7a", X + 2, Y - 14, 12, 29);
      P(bx, "#ff5ab4", X + 1, Y - 12, 1, 26);
      P(bx, "#5ef2ff", X + 14, Y - 12, 1, 26);
      P(bx, "#f2c14e", X + 2, Y - 14, 12, 3);
      P(bx, "#ffe08a", X + 3, Y - 13, 3, 1);
      P(bx, "#0b0b12", X + 3, Y - 9, 10, 9);
      P(bx, "#1d1a4a", X + 4, Y - 8, 8, 7);
      sprite(bx, X + 5, Y - 7, ["a...a", ".aaa.", "aa.aa", "aaaaa"], { a: "#7fe08a" });
      P(bx, "#ffd84d", X + 7, Y - 2, 2, 1);
      P(bx, "#5d4fa0", X + 2, Y + 1, 12, 4);
      P(bx, "#e24b4a", X + 4, Y + 2, 2, 2);
      P(bx, "#3fae8f", X + 8, Y + 2, 2, 2);
      P(bx, "#ffd84d", X + 11, Y + 2, 1, 2);
      P(bx, "#2b2258", X + 4, Y + 8, 8, 4);
      P(bx, "#f2c14e", X + 7, Y + 9, 2, 2);
      glint(X + 4, Y - 13);
      glint(X + 9, Y - 6);
    }
    if (it === "fireplace") {
      ell(bx, cx, Y + 15, 15, 4, "rgba(255,150,60,.16)");
      P(bx, "#4a4550", X, Y - 16, 32, 31);
      for (let j = 0; j < 7; j++)
        for (let i = 0; i < 5; i++) {
          const x0 = Math.max(X + 1, X + 1 + i * 8 - (j % 2) * 4);
          const x1 = Math.min(X + 31, X + 8 + i * 8 - (j % 2) * 4);
          if (x1 > x0) P(bx, (i + j) % 2 ? "#7c7782" : "#8f8a94", x0, Y - 15 + j * 4, x1 - x0, 3);
        }
      P(bx, "#5e3a20", X - 2, Y - 18, 36, 4);
      P(bx, "#8a5a33", X - 2, Y - 18, 36, 1);
      P(bx, "#3a2416", X - 2, Y - 15, 36, 1);
      P(bx, "rgba(255,170,80,.3)", X + 5, Y - 9, 22, 21);
      P(bx, "#1b1416", X + 7, Y - 6, 18, 18);
      P(bx, "#1b1416", X + 9, Y - 8, 14, 2);
      P(bx, "#6e4425", X + 9, Y + 8, 14, 3);
      P(bx, "#8a5a33", X + 10, Y + 8, 5, 1);
      P(bx, "#4e3019", X + 15, Y + 9, 1, 2);
      sprite(
        bx,
        X + 9,
        Y - 5,
        [
          "....o.....o...",
          "...oo....oo...",
          "...oyo..ooo.o.",
          "..oyyo.oyyo.oo",
          ".ooyyooyyyoooo",
          ".oyywyoyywyyo.",
          "ooyywwyywwyyoo",
          "oyywwwwwwwwyyo",
          "oyywwwwwwwwyyo",
          ".oyyywwwwyyyo.",
          "..oooyyyyooo..",
          "...oooooooo...",
        ],
        { o: "#e2502a", y: "#ff9a2e", w: "#ffe27a" },
      );
      P(bx, "#8f8a94", X + 3, Y + 11, 26, 4);
      P(bx, "#b8bcc2", X + 3, Y + 11, 26, 1);
      P(bx, "#fdfaf2", X + 3, Y - 22, 2, 4);
      P(bx, "#ffd84d", X + 3, Y - 24, 2, 2);
      P(bx, "#fdfaf2", X + 27, Y - 21, 2, 3);
      P(bx, "#ffd84d", X + 27, Y - 23, 2, 2);
      P(bx, "#c8a24a", X + 12, Y - 25, 8, 7);
      P(bx, "#9fd3ef", X + 13, Y - 24, 6, 5);
      P(bx, "#4fbf6a", X + 13, Y - 21, 6, 2);
      for (let i = 0; i < 4; i++) glint(X + 10 + ((rnd() * 12) | 0), Y - 6 + ((rnd() * 10) | 0));
    }
    if (it === "projector") {
      ell(bx, X + 8, Y + 11, 7, 3, "rgba(170,150,255,.22)");
      ell(bx, X + 8, Y + 13, 5, 1, "rgba(0,0,0,.22)");
      P(bx, "#2a2a30", X + 3, Y + 9, 10, 4);
      P(bx, "#5a5a66", X + 3, Y + 9, 10, 1);
      circ(bx, X + 8, Y + 5, 5, "#1e2a5a");
      P(bx, "#2a2a30", X + 3, Y + 6, 11, 4);
      circ(bx, X + 8, Y + 5, 4, "#2a3a7a");
      P(bx, "#3a4c9a", X + 5, Y + 2, 3, 1);
      (
        [
          [6, 3, "#ffe58a"],
          [10, 4, "#ffffff"],
          [8, 1, "#c9b8ff"],
          [5, 6, "#7fd1ff"],
          [11, 7, "#ffe58a"],
        ] as const
      ).forEach(([dx, dy, c]) => P(bx, c, X + dx, Y + dy));
      // Stars thrown round the room (walls and floor), clipped to the map.
      for (let i = 0; i < 18; i++) {
        const a = rnd() * Math.PI * 2;
        const r = 14 + rnd() * 40;
        const sx = Math.round(X + 8 + Math.cos(a) * r);
        const sy = Math.round(Y + 4 + Math.sin(a) * r * 0.8);
        if (sx > TILE && sy > 4 && sx < (W - 1) * TILE - 3 && sy < (H - 1) * TILE) {
          P(bx, "rgba(201,184,255,.55)", sx + 1, sy);
          sparkles.push([sx, sy, a * 3]);
        }
      }
    }
    if (it === "throne") {
      ell(bx, X + 8, Y + 15, 7, 1, "rgba(0,0,0,.22)");
      P(bx, "#9c7a2c", X + 2, Y - 13, 12, 19);
      P(bx, "#f2c14e", X + 3, Y - 12, 10, 17);
      P(bx, "#7a1820", X + 5, Y - 10, 6, 14);
      P(bx, "#a3202a", X + 5, Y - 9, 6, 13);
      P(bx, "#c83a44", X + 5, Y - 9, 1, 13);
      P(bx, "#9c7a2c", X + 2, Y - 15, 2, 2);
      P(bx, "#9c7a2c", X + 7, Y - 16, 2, 3);
      P(bx, "#9c7a2c", X + 12, Y - 15, 2, 2);
      P(bx, "#f2c14e", X + 2, Y - 15, 1, 1);
      P(bx, "#ffe08a", X + 7, Y - 16, 1, 1);
      P(bx, "#f2c14e", X + 12, Y - 15, 1, 1);
      P(bx, "#5b9cff", X + 7, Y - 12, 2, 2);
      P(bx, "#c9e0ff", X + 7, Y - 12, 1, 1);
      P(bx, "#9c7a2c", X + 1, Y + 3, 14, 9);
      P(bx, "#f2c14e", X + 2, Y + 3, 12, 7);
      P(bx, "#a3202a", X + 3, Y + 3, 10, 5);
      P(bx, "#d0505a", X + 3, Y + 3, 10, 1);
      P(bx, "#9c7a2c", X, Y - 1, 4, 9);
      P(bx, "#9c7a2c", X + 12, Y - 1, 4, 9);
      P(bx, "#f2c14e", X + 1, Y - 1, 2, 8);
      P(bx, "#f2c14e", X + 13, Y - 1, 2, 8);
      P(bx, "#ffe08a", X + 1, Y - 1, 2, 1);
      P(bx, "#ffe08a", X + 13, Y - 1, 2, 1);
      P(bx, "#9c7a2c", X + 2, Y + 12, 2, 3);
      P(bx, "#9c7a2c", X + 12, Y + 12, 2, 3);
      P(bx, "#fff6c8", X + 3, Y - 12, 1, 4);
      glint(X + 3, Y - 15);
      glint(X + 11, Y);
    }
    // ─── Admin (dev studio) ───
    if (it === "devdesk") {
      ell(bx, cx, Y + 13, 22, 3, "rgba(90,209,230,.16)");
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, WW - 3, 2);
      // Sled legs, a PC tower and a cable tray under the top.
      P(bx, ink, X + 2, Y + 8, 3, 7);
      P(bx, c3, X + 3, Y + 8, 1, 6);
      P(bx, ink, X + WW - 5, Y + 8, 3, 7);
      P(bx, c3, X + WW - 4, Y + 8, 1, 6);
      P(bx, c1, X + 12, Y + 8, 22, 3);
      P(bx, c3, X + 13, Y + 10, 20, 1);
      P(bx, ink, X + 35, Y + 7, 8, 8);
      P(bx, c2, X + 36, Y + 8, 6, 6);
      P(bx, violet, X + 37, Y + 9, 1, 4);
      P(bx, cyan, X + 40, Y + 9, 1, 1);
      // Desk top: white, a charcoal edge with a cyan light strip.
      P(bx, ink, X, Y - 2, WW, 11);
      P(bx, w1, X + 1, Y - 1, WW - 2, 6);
      P(bx, w0, X + 1, Y - 1, WW - 2, 1);
      P(bx, c2, X + 1, Y + 5, WW - 2, 3);
      P(bx, c3, X + 1, Y + 5, WW - 2, 1);
      P(bx, cyan, X + 3, Y + 7, WW - 6, 1);
      // Three monitors, the middle one bigger, all showing code.
      const screen = (x: number, y: number, w: number, h: number, n: number) => {
        P(bx, ink, x, y, w, h);
        P(bx, c2, x, y, w, 1);
        P(bx, DEV.screen, x + 1, y + 1, w - 2, h - 3);
        codeLines(x + 1, y + 2, w - 2, h - 5, n);
        P(bx, ink, x + (w >> 1) - 1, y + h, 3, 2);
        P(bx, c2, x + (w >> 1) - 3, y + h + 1, 7, 1);
      };
      screen(X + 2, Y - 13, 13, 10, 1);
      screen(X + WW - 15, Y - 13, 13, 10, 4);
      screen(X + 15, Y - 17, 18, 14, 0);
      P(bx, cyan, X + 23, Y - 4, 2, 1);
      P(bx, "#eafcff", X + 22, Y - 10, 1, 2);
      // Keyboard with a few RGB keys, mouse on a pad, mug and a plant.
      P(bx, "rgba(167,125,224,.35)", X + 16, Y + 4, 17, 1);
      P(bx, ink, X + 17, Y, 15, 4);
      P(bx, c3, X + 18, Y, 13, 1);
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 6; i++) P(bx, c4, X + 18 + i * 2 + j, Y + 1 + j, 1, 1);
      P(bx, cyan, X + 19, Y + 1);
      P(bx, violet, X + 24, Y + 2);
      P(bx, teal, X + 28, Y + 1);
      P(bx, "#ff8a80", X + 21, Y + 2);
      P(bx, c2, X + 34, Y, 7, 4);
      P(bx, w0, X + 36, Y, 2, 3);
      P(bx, g1, X + 36, Y + 2, 2, 1);
      P(bx, w0, X + 6, Y - 1, 4, 4);
      P(bx, g1, X + 9, Y - 1, 1, 4);
      P(bx, "#6e4425", X + 6, Y - 1, 3, 1);
      P(bx, cyan, X + 6, Y + 1, 3, 1);
      P(bx, g1, X + 10, Y, 1, 2);
      P(bx, w0, X + 41, Y - 1, 4, 4);
      P(bx, g1, X + 44, Y - 1, 1, 4);
      circ(bx, X + 43, Y - 3, 2, "#3f8e3b");
      P(bx, "#5aae51", X + 41, Y - 5, 2, 1);
      P(bx, "#5aae51", X + 44, Y - 6, 1, 2);
      glint(X + 17, Y - 15);
      glint(X + 20, Y + 1);
    }
    if (it === "ergochair") {
      ell(bx, X + 8, Y + 14, 6, 1, "rgba(0,0,0,.2)");
      // Five-star base on wheels, gas lift.
      P(bx, ink, X + 3, Y + 12, 10, 2);
      P(bx, c3, X + 4, Y + 12, 8, 1);
      P(bx, ink, X + 2, Y + 14, 2, 1);
      P(bx, ink, X + 7, Y + 14, 2, 1);
      P(bx, ink, X + 12, Y + 14, 2, 1);
      P(bx, g2, X + 7, Y + 9, 2, 3);
      // Mesh back with a headrest.
      P(bx, ink, X + 5, Y - 13, 6, 4);
      P(bx, c2, X + 6, Y - 12, 4, 2);
      P(bx, c4, X + 6, Y - 12, 4, 1);
      P(bx, g3, X + 7, Y - 9, 2, 1);
      P(bx, ink, X + 3, Y - 8, 10, 14);
      P(bx, c2, X + 4, Y - 7, 8, 12);
      for (let j = 0; j < 12; j++)
        for (let i = (j % 2) + 4; i < 12; i += 2) P(bx, c3, X + i, Y - 7 + j, 1, 1);
      P(bx, c4, X + 4, Y - 7, 8, 1);
      P(bx, cyan, X + 5, Y + 1, 6, 1);
      // Seat and arms.
      P(bx, ink, X + 2, Y + 4, 12, 6);
      P(bx, c2, X + 3, Y + 4, 10, 4);
      P(bx, c3, X + 3, Y + 4, 10, 1);
      P(bx, ink, X + 1, Y + 1, 2, 6);
      P(bx, ink, X + 13, Y + 1, 2, 6);
      P(bx, c4, X + 1, Y + 1, 2, 1);
      P(bx, c4, X + 13, Y + 1, 2, 1);
    }
    if (it === "codewall") {
      P(bx, "rgba(0,0,0,.2)", X + 5, Y + 14, 23, 2);
      ell(bx, cx, Y + 6, 14, 6, "rgba(90,209,230,.1)");
      // Slim floor stand.
      P(bx, ink, X + 14, Y + 1, 4, 12);
      P(bx, c3, X + 15, Y + 1, 1, 12);
      P(bx, ink, X + 8, Y + 12, 16, 3);
      P(bx, c3, X + 9, Y + 12, 14, 1);
      // The display. Its screen (the code editor) is exactly
      // fillRect(X + 3, Y - 13, 26, 12): x X+3..X+28, y Y-13..Y-2 inclusive.
      P(bx, ink, X + 1, Y - 15, 30, 17);
      P(bx, c1, X + 2, Y - 14, 28, 15);
      P(bx, c3, X + 2, Y - 14, 28, 1);
      P(bx, cyan, cx - 1, Y, 2, 1);
      P(bx, DEV.screen, X + 3, Y - 13, 26, 12);
      // Tab bar, line numbers, code, a cursor and the status bar.
      P(bx, "#0e0f13", X + 3, Y - 13, 26, 1);
      P(bx, c2, X + 7, Y - 13, 7, 1);
      P(bx, cyan, X + 7, Y - 13, 2, 1);
      P(bx, "#1b1e26", X + 3, Y - 12, 4, 10);
      for (let r = 0; r < 5; r++) P(bx, c4, X + 4 + (r % 2), Y - 11 + r * 2, 2 - (r % 2), 1);
      codeLines(X + 7, Y - 11, 21, 9, 2);
      P(bx, "#eafcff", X + 18, Y - 6, 1, 2);
      P(bx, "#2a2140", X + 3, Y - 2, 26, 1);
      P(bx, violet, X + 3, Y - 2, 5, 1);
      P(bx, cyan, X + 25, Y - 2, 2, 1);
      glint(X + 4, Y - 14);
    }
    if (it === "whiteboard") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 14, 29, 2);
      // Stand on little wheels.
      [X + 4, X + 27].forEach((lx) => {
        P(bx, g3, lx, Y + 2, 1, 11);
        P(bx, g1, lx - 1, Y + 2, 1, 11);
        P(bx, c2, lx - 3, Y + 12, 6, 2);
        P(bx, ink, lx - 3, Y + 14, 1, 1);
        P(bx, ink, lx + 2, Y + 14, 1, 1);
      });
      // Aluminium frame and white board.
      P(bx, g3, X + 1, Y - 17, 30, 20);
      P(bx, g1, X + 1, Y - 17, 30, 1);
      P(bx, w0, X + 2, Y - 16, 28, 17);
      P(bx, "#ffffff", X + 3, Y - 15, 7, 1);
      // An architecture sketch: client -> api -> DB, a cache box, notes.
      const boxAt = (x: number, y: number, w: number, h: number, col: string) => {
        P(bx, col, x, y, w, 1);
        P(bx, col, x, y + h - 1, w, 1);
        P(bx, col, x, y, 1, h);
        P(bx, col, x + w - 1, y, 1, h);
      };
      boxAt(X + 4, Y - 14, 7, 5, cyan);
      P(bx, g2, X + 6, Y - 12, 3, 1);
      boxAt(X + 15, Y - 14, 7, 5, violet);
      P(bx, g2, X + 17, Y - 12, 3, 1);
      P(bx, c3, X + 11, Y - 12, 3, 1);
      P(bx, c3, X + 13, Y - 13, 1, 3);
      boxAt(X + 4, Y - 6, 7, 5, "#f2a03e");
      P(bx, g2, X + 6, Y - 4, 3, 1);
      P(bx, c3, X + 7, Y - 9, 1, 3);
      P(bx, c3, X + 6, Y - 7, 3, 1);
      // Cylinder "DB" (teal).
      P(bx, "#dff4ee", X + 21, Y - 9, 7, 9);
      P(bx, teal, X + 21, Y - 10, 7, 1);
      P(bx, teal, X + 20, Y - 9, 1, 8);
      P(bx, teal, X + 28, Y - 9, 1, 8);
      P(bx, teal, X + 21, Y - 8, 7, 1);
      P(bx, teal, X + 21, Y - 1, 7, 1);
      sprite(bx, X + 21, Y - 7, ["hh.hh.", "h.hh.h", "h.hhh.", "hh.hh."], { h: c3 });
      P(bx, c3, X + 18, Y - 9, 1, 4);
      P(bx, c3, X + 18, Y - 5, 2, 1);
      P(bx, c3, X + 19, Y - 6, 1, 3);
      P(bx, "#e24b4a", X + 12, Y - 4, 5, 1);
      P(bx, "#e24b4a", X + 12, Y - 2, 3, 1);
      // Marker tray.
      P(bx, g3, X + 3, Y + 1, 26, 2);
      P(bx, g1, X + 3, Y + 1, 26, 1);
      P(bx, "#e24b4a", X + 6, Y, 3, 1);
      P(bx, cyan, X + 10, Y, 3, 1);
      P(bx, ink, X + 14, Y, 3, 1);
      P(bx, c2, X + 21, Y - 1, 5, 2);
      P(bx, g1, X + 21, Y + 1, 5, 1);
    }
    if (it === "serverrack") {
      P(bx, "rgba(0,0,0,.22)", X + 2, Y + 14, 13, 2);
      ell(bx, X + 8, Y + 12, 7, 3, "rgba(90,209,230,.12)");
      P(bx, ink, X + 2, Y - 21, 12, 35);
      P(bx, c1, X + 3, Y - 20, 10, 33);
      P(bx, c4, X + 2, Y - 21, 12, 1);
      P(bx, c3, X + 3, Y - 20, 10, 1);
      // Rack units: LEDs, drive bays and vents.
      const led = ["#4fdc7a", cyan, "#4fdc7a", "#f2c14e", cyan, "#4fdc7a", violet];
      for (let u = 0; u < 7; u++) {
        const uy = Y - 18 + u * 4;
        P(bx, c2, X + 4, uy, 8, 3);
        P(bx, c3, X + 4, uy, 8, 1);
        if (u % 3 === 1) {
          for (let i = 0; i < 4; i++) P(bx, ink, X + 5 + i * 2, uy + 1, 1, 2);
        } else {
          P(bx, ink, X + 8, uy + 2, 4, 1);
          P(bx, ink, X + 9, uy + 1, 1, 1);
          P(bx, ink, X + 11, uy + 1, 1, 1);
        }
        P(bx, led[u], X + 5, uy + 1);
        P(bx, led[(u + 2) % led.length], X + 6, uy + 2);
        if (u % 2 === 0) P(bx, led[(u + 3) % led.length], X + 7, uy + 1);
      }
      P(bx, cyan, X + 4, Y - 19, 8, 1);
      P(bx, "rgba(255,255,255,.07)", X + 4, Y - 19, 1, 30);
      P(bx, ink, X + 3, Y + 13, 2, 2);
      P(bx, ink, X + 11, Y + 13, 2, 2);
      glint(X + 4, Y - 17);
      glint(X + 6, Y - 9);
      glint(X + 4, Y + 3);
    }
    if (it === "espresso") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, 30, 2);
      // White counter with an oak top.
      P(bx, g3, X + 1, Y - 5, 30, 20);
      P(bx, oakD, X + 1, Y - 5, 30, 6);
      P(bx, oak, X + 2, Y - 4, 28, 4);
      P(bx, oakL, X + 2, Y - 4, 28, 1);
      P(bx, w1, X + 2, Y + 1, 28, 11);
      P(bx, w0, X + 2, Y + 1, 28, 1);
      P(bx, g1, X + 16, Y + 2, 1, 10);
      P(bx, c3, X + 13, Y + 4, 1, 4);
      P(bx, c3, X + 19, Y + 4, 1, 4);
      P(bx, c2, X + 2, Y + 12, 28, 2);
      // Chrome espresso machine.
      P(bx, ink, X + 4, Y - 18, 13, 15);
      P(bx, "#b8bcc2", X + 5, Y - 17, 11, 13);
      P(bx, "#e4e6ea", X + 5, Y - 17, 11, 1);
      P(bx, "#d9dce1", X + 5, Y - 16, 2, 12);
      P(bx, g3, X + 15, Y - 16, 1, 12);
      P(bx, c2, X + 5, Y - 15, 11, 1);
      P(bx, ink, X + 12, Y - 14, 3, 3);
      P(bx, w0, X + 13, Y - 13);
      P(bx, cyan, X + 6, Y - 13);
      P(bx, c1, X + 6, Y - 10, 7, 5);
      P(bx, g3, X + 7, Y - 10, 4, 2);
      P(bx, ink, X + 3, Y - 9, 5, 1);
      P(bx, w0, X + 8, Y - 7, 3, 2);
      P(bx, g3, X + 6, Y - 5, 8, 1);
      P(bx, "rgba(255,255,255,.45)", X + 9, Y - 21, 1, 2);
      P(bx, "rgba(255,255,255,.3)", X + 10, Y - 23, 1, 2);
      // Two cups and a jar of beans.
      P(bx, g1, X + 18, Y - 2, 5, 1);
      P(bx, w0, X + 19, Y - 5, 3, 3);
      P(bx, "#6e4425", X + 19, Y - 5, 3, 1);
      P(bx, g1, X + 22, Y - 4, 1, 1);
      P(bx, c3, X + 22, Y - 7, 3, 3);
      P(bx, c2, X + 23, Y - 5, 1, 1);
      P(bx, "#6e4425", X + 22, Y - 7, 3, 1);
      P(bx, g2, X + 25, Y - 12, 5, 10);
      P(bx, "#dde7ec", X + 26, Y - 11, 3, 8);
      P(bx, "#5e3a20", X + 26, Y - 8, 3, 5);
      P(bx, "#8a5a33", X + 27, Y - 7);
      P(bx, "#8a5a33", X + 26, Y - 5);
      P(bx, w0, X + 26, Y - 11, 1, 3);
      P(bx, oakD, X + 25, Y - 13, 5, 2);
      P(bx, oak, X + 25, Y - 13, 5, 1);
      glint(X + 5, Y - 16);
    }
    if (it === "adminrug") studioRug(X, Y, WW, o.h * TILE, true);
    if (it === "adminneon") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, 30, 2);
      P(bx, c1, X + 6, Y + 3, 2, 12);
      P(bx, c1, X + 24, Y + 3, 2, 12);
      P(bx, c3, X + 4, Y + 13, 6, 2);
      P(bx, c3, X + 22, Y + 13, 6, 2);
      P(bx, "rgba(90,209,230,.12)", X - 1, Y - 17, 34, 23);
      P(bx, ink, X + 1, Y - 15, 30, 19);
      P(bx, "#1b1c22", X + 2, Y - 14, 28, 17);
      P(bx, c2, X + 2, Y - 14, 28, 1);
      neon(CODE_TAG, cx - 5, Y - 12, cyan, "rgba(90,209,230,.28)");
      [6, 6, 5, 4, 4].forEach((sx, j) => P(bx, violet, cx - 5 + sx, Y - 12 + j));
      const word = [
        ".h..hh..h...h.hhh.h...h",
        "h.h.h.h.hh.hh..h..hh..h",
        "hhh.h.h.h.h.h..h..h.h.h",
        "h.h.h.h.h...h..h..h..hh",
        "h.h.hh..h...h.hhh.h...h",
      ];
      neon(word, cx - 11, Y - 5, w0, "rgba(90,209,230,.22)");
      P(bx, "#eafcff", cx - 3, Y - 12);
      glint(cx - 7, Y - 11);
      glint(cx + 6, Y - 3);
    }
    if (it === "studiobed") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 29, WW - 3, 3);
      P(bx, "rgba(90,209,230,.14)", X + 3, Y + 28, WW - 6, 3);
      // Low charcoal platform.
      P(bx, ink, X + 1, Y + 4, WW - 2, 26);
      P(bx, c2, X + 2, Y + 5, WW - 4, 20);
      P(bx, c1, X + 2, Y + 25, WW - 4, 4);
      P(bx, c3, X + 2, Y + 25, WW - 4, 1);
      P(bx, cyan, X + 4, Y + 28, WW - 8, 1);
      // White sheet, a white and a cyan pillow.
      P(bx, w1, X + 9, Y + 5, WW - 13, 19);
      P(bx, w0, X + 9, Y + 5, WW - 13, 2);
      P(bx, g1, X + 10, Y + 7, 9, 8);
      P(bx, w0, X + 10, Y + 6, 8, 7);
      P(bx, "#2f8fa0", X + 10, Y + 15, 8, 8);
      P(bx, cyan, X + 10, Y + 14, 7, 7);
      P(bx, "#9ae6f2", X + 10, Y + 14, 7, 1);
      // Charcoal duvet with the sheet folded over, a light throw at the foot.
      const dv = c4;
      P(bx, shade(dv, -0.3), X + 21, Y + 5, WW - 25, 22);
      P(bx, dv, X + 21, Y + 5, WW - 25, 18);
      P(bx, shade(dv, 0.3), X + 21, Y + 5, WW - 25, 1);
      P(bx, w0, X + 21, Y + 5, 2, 18);
      P(bx, g1, X + 23, Y + 5, 1, 18);
      P(bx, shade(dv, 0.12), X + 24, Y + 6, 1, 17);
      P(bx, g2, X + WW - 11, Y + 5, 6, 22);
      P(bx, g1, X + WW - 11, Y + 5, 6, 18);
      for (let j = Y + 7; j < Y + 23; j += 2) P(bx, w1, X + WW - 10 + ((j >> 1) % 2) * 2, j, 2, 1);
      P(bx, w0, X + WW - 11, Y + 5, 6, 1);
      // Upholstered headboard with an oak top.
      P(bx, ink, X + 1, Y - 5, 8, 35);
      P(bx, c2, X + 2, Y - 4, 6, 33);
      for (let j = Y; j < Y + 28; j += 4) P(bx, c1, X + 2, j, 6, 1);
      P(bx, oak, X + 2, Y - 4, 6, 2);
      P(bx, oakL, X + 2, Y - 4, 6, 1);
      P(bx, ink, X + WW - 3, Y + 4, 2, 26);
      glint(X + 12, Y + 15);
    }
    if (it === "studiosofa") {
      const c = SOFA;
      P(bx, "rgba(0,0,0,.18)", X + 1, Y + 14, WW - 2, 2);
      P(bx, ink, X + 3, Y + 11, 1, 4);
      P(bx, ink, X + WW - 4, Y + 11, 1, 4);
      P(bx, ink, cx, Y + 11, 1, 3);
      P(bx, shade(c, -0.5), X, Y - 6, WW, 17);
      P(bx, shade(c, -0.15), X + 1, Y - 5, WW - 2, 9);
      P(bx, shade(c, 0.25), X + 1, Y - 5, WW - 2, 1);
      for (let i = 1; i < o.w; i++) P(bx, shade(c, -0.3), X + i * 16, Y - 3, 1, 6);
      P(bx, c, X + 4, Y + 3, WW - 8, 6);
      P(bx, shade(c, 0.3), X + 4, Y + 3, WW - 8, 1);
      for (let i = 1; i < o.w; i++) P(bx, shade(c, -0.3), X + i * 16, Y + 3, 1, 6);
      P(bx, shade(c, -0.3), X + 1, Y + 9, WW - 2, 2);
      P(bx, shade(c, -0.1), X + 1, Y - 1, 3, 11);
      P(bx, shade(c, -0.1), X + WW - 4, Y - 1, 3, 11);
      P(bx, shade(c, 0.25), X + 1, Y - 1, 3, 1);
      P(bx, shade(c, 0.25), X + WW - 4, Y - 1, 3, 1);
      P(bx, g1, X + 5, Y - 4, 7, 6);
      P(bx, w0, X + 5, Y - 4, 7, 5);
      P(bx, "#ffffff", X + 5, Y - 4, 7, 1);
      P(bx, "#2f8fa0", X + WW - 12, Y - 4, 7, 6);
      P(bx, cyan, X + WW - 12, Y - 4, 7, 5);
      P(bx, "#9ae6f2", X + WW - 12, Y - 4, 7, 1);
    }
    if (it === "techshelf") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 14, 30, 2);
      P(bx, ink, X + 3, Y + 11, 1, 4);
      P(bx, ink, X + 28, Y + 11, 1, 4);
      P(bx, g3, X + 1, Y - 16, 30, 28);
      P(bx, w1, X + 2, Y - 15, 28, 26);
      P(bx, w0, X + 2, Y - 15, 28, 1);
      P(bx, "#d5d8de", X + 4, Y - 12, 24, 10);
      P(bx, "#d5d8de", X + 4, Y + 1, 24, 8);
      P(bx, g2, X + 4, Y - 12, 24, 1);
      P(bx, g2, X + 4, Y + 1, 24, 1);
      P(bx, w0, X + 3, Y - 2, 26, 2);
      P(bx, oak, X + 3, Y - 1, 26, 1);
      P(bx, oak, X + 3, Y + 9, 26, 1);
      // Top: white tech books with coloured bands, a little figure, keycap jar.
      const bands = [cyan, "#e24b4a", violet, "#f2c14e", teal];
      for (let i = 0; i < 5; i++) {
        const h = 7 + ((i * 2) % 3);
        const bxx = X + 5 + i * 2;
        P(bx, i === 2 ? c3 : w0, bxx, Y - 2 - h, 2, h);
        P(bx, bands[i], bxx, Y - 2 - h + 1, 2, 2);
        P(bx, g1, bxx + 1, Y - 2 - h + 3, 1, h - 3);
      }
      P(bx, g2, X + 15, Y - 7, 1, 5);
      P(bx, "#2a2a30", X + 18, Y - 10, 3, 2);
      P(bx, "#f2d2b6", X + 18, Y - 8, 3, 2);
      P(bx, violet, X + 17, Y - 6, 5, 2);
      P(bx, violet, X + 18, Y - 4, 3, 1);
      P(bx, c2, X + 18, Y - 3, 1, 1);
      P(bx, c2, X + 20, Y - 3, 1, 1);
      P(bx, g2, X + 23, Y - 10, 5, 8);
      P(bx, "#dde7ec", X + 24, Y - 9, 3, 6);
      P(bx, cyan, X + 24, Y - 6);
      P(bx, "#f2c14e", X + 26, Y - 5);
      P(bx, "#e24b4a", X + 25, Y - 4);
      P(bx, violet, X + 24, Y - 4);
      P(bx, w0, X + 26, Y - 7);
      P(bx, c2, X + 23, Y - 11, 5, 1);
      // Bottom: a tiny retro console with its pad, a stack of books.
      P(bx, g3, X + 5, Y + 3, 10, 6);
      P(bx, g1, X + 5, Y + 3, 10, 5);
      P(bx, w0, X + 5, Y + 3, 10, 1);
      P(bx, c2, X + 6, Y + 5, 8, 1);
      P(bx, "#e24b4a", X + 6, Y + 7, 1, 1);
      P(bx, c3, X + 12, Y + 7, 2, 1);
      P(bx, c2, X + 16, Y + 6, 4, 3);
      P(bx, "#e24b4a", X + 18, Y + 7);
      P(bx, teal, X + 21, Y + 7, 6, 2);
      P(bx, violet, X + 22, Y + 5, 5, 2);
      P(bx, w0, X + 21, Y + 3, 6, 2);
      P(bx, cyan, X + 21, Y + 3, 1, 2);
      // A small cactus on top.
      P(bx, w0, X + 23, Y - 19, 4, 4);
      P(bx, g1, X + 26, Y - 19, 1, 4);
      P(bx, "#3f8e3b", X + 24, Y - 24, 2, 5);
      P(bx, "#3f8e3b", X + 23, Y - 22, 1, 2);
      P(bx, "#3f8e3b", X + 26, Y - 23, 1, 2);
      P(bx, "#5aae51", X + 24, Y - 24, 1, 4);
    }
  };

  /**
   * A dorm piece turned to face right (rot 1): its front is the right edge.
   * leftDown: the piece's rot-0 left end is at the bottom (rot 1); otherwise
   * at the top (rot 3, which paints this mirrored). Tall pieces show a
   * shortened top and the end that faces the viewer.
   */
  const paintSide = (o: Thing, leftDown: boolean) => {
    const X = o.x * TILE;
    const Y = o.y * TILE;
    const WW = o.w * TILE;
    const it = o.item;
    /** y for something at the rot-0 left (or right) end: the top or bottom choice. */
    const leftEnd = (top: number, bottom: number) => (leftDown ? bottom : top);
    const rightEnd = (top: number, bottom: number) => (leftDown ? top : bottom);
    /** A box: outline, top face (with a light edge) and the end face toward the viewer. */
    const box = (
      x: number,
      y: number,
      w: number,
      top: number,
      face: number,
      cols: [string, string, string],
    ) => {
      P(bx, cols[0], x, y, w, top + face);
      P(bx, cols[1], x + 1, y + 1, w - 2, top - 1);
      P(bx, shade(cols[1], 0.2), x + 1, y + 1, w - 2, 1);
      P(bx, cols[2], x + 1, y + top, w - 2, face - 1);
    };
    // ─── Free ───
    if (it === "bed") {
      const bl = "#4a78c2";
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 45, WW - 3, 3);
      P(bx, "#4e3019", X + 1, Y + 2, WW - 2, 44);
      P(bx, "#8a5a33", X + 2, Y + 3, WW - 4, 42);
      P(bx, "#6e4428", X + 2, Y + 41, WW - 4, 4);
      P(bx, "#8a5a33", X + 2, Y + 41, WW - 4, 1);
      const dots = (y0: number, y1: number) => {
        for (let i = X + 7; i < X + WW - 6; i += 6)
          for (let j = y0; j < y1; j += 6) P(bx, shade(bl, 0.2), i + ((j >> 1) % 3), j, 2, 2);
      };
      if (leftDown) {
        // Headboard nearest the viewer (seen from its back), foot at the top.
        P(bx, "#e8e2d6", X + 4, Y + 5, WW - 8, 34);
        P(bx, "#4e3019", X + 1, Y + 1, WW - 2, 4);
        P(bx, "#a8744a", X + 2, Y + 1, WW - 4, 1);
        P(bx, bl, X + 4, Y + 5, WW - 8, 20);
        P(bx, shade(bl, 0.3), X + 4, Y + 5, 3, 20);
        dots(Y + 8, Y + 20);
        P(bx, shade(bl, 0.3), X + 4, Y + 22, WW - 8, 3);
        P(bx, shade(bl, 0.45), X + 4, Y + 22, WW - 8, 1);
        P(bx, shade(bl, -0.3), X + 4, Y + 25, WW - 8, 1);
        P(bx, "#d8d2c4", X + 9, Y + 28, 14, 8);
        P(bx, "#ffffff", X + 9, Y + 27, 13, 7);
        P(bx, "#e8e2d6", X + 12, Y + 30, 6, 1);
        P(bx, "#4e3019", X + 1, Y + 32, WW - 2, 14);
        P(bx, "#a8744a", X + 2, Y + 33, WW - 4, 2);
        P(bx, "#8a5a33", X + 2, Y + 35, WW - 4, 9);
        for (let i = X + 8; i < X + WW - 4; i += 7) P(bx, "#7a4e2c", i, Y + 36, 1, 7);
        P(bx, "#6e4428", X + 2, Y + 43, WW - 4, 1);
      } else {
        // Headboard at the top, blanket over the foot end.
        P(bx, "#e8e2d6", X + 4, Y + 7, WW - 8, 33);
        P(bx, "#d8d2c4", X + 9, Y + 10, 14, 9);
        P(bx, "#ffffff", X + 9, Y + 9, 13, 8);
        P(bx, "#e8e2d6", X + 12, Y + 13, 6, 1);
        P(bx, shade(bl, -0.3), X + 4, Y + 20, WW - 8, 22);
        P(bx, bl, X + 4, Y + 20, WW - 8, 18);
        P(bx, shade(bl, 0.45), X + 4, Y + 20, WW - 8, 1);
        P(bx, shade(bl, 0.3), X + 4, Y + 21, WW - 8, 3);
        dots(Y + 27, Y + 37);
        P(bx, "#4e3019", X + 1, Y + 40, WW - 2, 3);
        P(bx, "#a8744a", X + 2, Y + 40, 2, 1);
        P(bx, "#4e3019", X + 1, Y - 6, WW - 2, 14);
        P(bx, "#a8744a", X + 2, Y - 5, WW - 4, 3);
        P(bx, "#8a5a33", X + 2, Y - 2, WW - 4, 8);
        P(bx, "#6e4428", X + 2, Y + 6, WW - 4, 1);
      }
    }
    if (it === "desk") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 30, 14, 2);
      P(bx, "#5e3a20", X + 1, Y + 1, 14, 30);
      P(bx, "#a8744a", X + 1, Y + 1, 14, 26);
      P(bx, "#c48d5d", X + 1, Y + 1, 2, 26);
      P(bx, "#8a5a33", X + 14, Y + 1, 1, 26);
      const py = leftEnd(Y + 4, Y + 17);
      P(bx, "#fff", X + 5, py, 6, 9);
      P(bx, "#d8d2c4", X + 5, py + 4, 6, 1);
      for (let i = 0; i < 3; i++) {
        P(bx, "#bbb", X + 6 + i * 2, py + 1, 1, 2);
        P(bx, "#bbb", X + 6 + i * 2, py + 6, 1, 2);
      }
      P(bx, "#5b7cfa", X + 9, rightEnd(Y + 12, Y + 15), 4, 4);
      const ly = rightEnd(Y + 3, Y + 19);
      P(bx, "#3d3d45", X + 3, ly + 1, 2, 7);
      P(bx, "#f2c14e", X + 2, ly, 6, 3);
      P(bx, "#ffe9a8", X + 4, ly + 2, 4, 1);
    }
    if (it === "chair") {
      P(bx, "rgba(0,0,0,.15)", X + 3, Y + 13, 10, 2);
      P(bx, "#5e3a20", X + 4, Y + 11, 2, 4);
      P(bx, "#5e3a20", X + 11, Y + 11, 2, 4);
      P(bx, "#5e3a20", X + 3, Y + 4, 11, 8);
      P(bx, "#c0504d", X + 4, Y + 4, 9, 5);
      P(bx, "#d9726e", X + 4, Y + 4, 9, 1);
      P(bx, "#a8744a", X + 4, Y + 9, 9, 2);
      P(bx, "#5e3a20", X + 2, Y - 6, 4, 17);
      P(bx, "#a8744a", X + 3, Y - 5, 2, 15);
      P(bx, "#c48d5d", X + 3, Y - 5, 2, 1);
      P(bx, "#8a5a33", X + 3, Y - 2, 2, 1);
      P(bx, "#8a5a33", X + 3, Y + 1, 2, 1);
    }
    if (it === "rug") {
      const cols = ["#7a3530", "#e2b07a", "#a8423f"];
      const w = WW - 4;
      const h = o.h * TILE - 4;
      P(bx, cols[0], X + 2, Y + 2, w, h);
      P(bx, cols[1], X + 4, Y + 4, w - 4, h - 4);
      P(bx, cols[2], X + 6, Y + 6, w - 8, h - 8);
      for (let j = Y + 10; j < Y + h - 6; j += 8) {
        P(bx, cols[1], X + 8, j, 2, 3);
        P(bx, cols[1], X + w - 6, j, 2, 3);
      }
      P(bx, cols[1], X + WW / 2 - 3, Y + h / 2 + 1, 7, 3);
      P(bx, cols[1], X + WW / 2 - 1, Y + h / 2 - 1, 3, 7);
      for (let i = X + 3; i < X + w + 1; i += 2) {
        P(bx, "#f4ead6", i, Y, 1, 2);
        P(bx, "#f4ead6", i, Y + h + 2, 1, 2);
      }
    }
    if (it === "shelf_small") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 30, 13, 2);
      box(X + 2, Y + 1, 12, 13, 18, ["#4e3019", "#a8744a", "#8a5a33"]);
      P(bx, "#6e4428", X + 3, Y + 14, 10, 1);
      P(bx, "#7a4e2c", X + 5, Y + 17, 6, 10);
      P(bx, "#9c6b42", X + 5, Y + 17, 6, 1);
      // Cubbies peek out on the front (right) edge.
      P(bx, "#2e1c10", X + 12, Y + 16, 1, 5);
      P(bx, "#2e1c10", X + 12, Y + 23, 1, 5);
      const fy = leftEnd(Y - 2, Y + 6);
      P(bx, "#f4f1ea", X + 5, fy, 5, 6);
      P(bx, "#7fa2c8", X + 6, fy + 1, 3, 4);
      P(bx, "#4fbf6a", X + 6, fy + 3, 3, 2);
      const py = rightEnd(Y + 1, Y + 8);
      P(bx, "#a24c27", X + 6, py, 5, 4);
      circ(bx, X + 8, py - 2, 3, "#3f8e3b");
      P(bx, "#5aae51", X + 7, py - 4, 2, 1);
    }
    if (it === "wardrobe") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 29, 14, 2);
      box(X + 2, Y - 12, 12, 14, 28, ["#4e3019", "#a8744a", "#8a5a33"]);
      P(bx, "#6e4428", X + 3, Y + 4, 10, 1);
      P(bx, "#9c6b42", X + 5, Y + 7, 6, 19);
      P(bx, "#b07a46", X + 5, Y + 7, 1, 19);
      P(bx, "#7a4e2c", X + 5, Y + 25, 6, 1);
      P(bx, "#6e4428", X + 12, Y + 3, 1, 26);
      P(bx, "#f2c14e", X + 14, Y + 12, 1, 3);
      P(bx, "#4e3019", X + 3, Y + 29, 3, 2);
      P(bx, "#4e3019", X + 10, Y + 29, 3, 2);
    }
    // ─── Coins ───
    if (it === "sofa") {
      const c = "#3fae8f";
      P(bx, "rgba(0,0,0,.18)", X + 1, Y + 45, 14, 2);
      P(bx, shade(c, -0.5), X, Y - 6, 7, 51);
      P(bx, shade(c, -0.5), X, Y - 3, 16, 48);
      P(bx, shade(c, -0.15), X + 1, Y - 5, 5, 41);
      P(bx, shade(c, 0.25), X + 1, Y - 5, 1, 41);
      for (let i = 1; i < 3; i++) P(bx, shade(c, -0.3), X + 2, Y + i * 13 - 3, 4, 1);
      P(bx, shade(c, -0.1), X + 6, Y - 2, 9, 4);
      P(bx, shade(c, 0.25), X + 6, Y - 2, 9, 1);
      P(bx, shade(c, -0.3), X + 6, Y + 2, 9, 2);
      P(bx, c, X + 6, Y + 4, 8, 32);
      P(bx, shade(c, 0.3), X + 6, Y + 4, 1, 32);
      P(bx, shade(c, -0.3), X + 6, Y + 14, 8, 1);
      P(bx, shade(c, -0.3), X + 6, Y + 25, 8, 1);
      const pillow = (y: number, col: string, hi: string) => {
        P(bx, col, X + 5, y, 5, 6);
        P(bx, hi, X + 5, y, 5, 1);
      };
      pillow(leftEnd(Y + 5, Y + 28), "#f2c14e", "#ffe08a");
      pillow(rightEnd(Y + 5, Y + 28), "#f2b8c8", "#ffd7e2");
      P(bx, shade(c, -0.1), X + 1, Y + 35, 14, 4);
      P(bx, shade(c, 0.25), X + 1, Y + 35, 14, 1);
      P(bx, shade(c, -0.3), X + 1, Y + 39, 14, 5);
      P(bx, "#4e3019", X + 2, Y + 44, 2, 2);
      P(bx, "#4e3019", X + 12, Y + 44, 2, 2);
    }
    if (it === "bookshelf") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 29, 14, 2);
      box(X + 2, Y - 8, 12, 13, 25, ["#4e3019", "#8a5a33", "#6e4428"]);
      P(bx, "#5e3a20", X + 3, Y + 5, 10, 1);
      P(bx, "#5e3a20", X + 3, Y + 17, 10, 1);
      // Book spines peek out on the front (right) edge.
      [Y + 7, Y + 19].forEach((sy, n) => {
        P(bx, "#2e1c10", X + 12, sy, 1, 9);
        for (let j = 0; j < 4; j++)
          P(bx, BOOK_COLORS[(j * 2 + n * 3) % 7], X + 12, sy + 2 + j * 2, 1, 2);
      });
    }
    if (it === "gamingchair") {
      ell(bx, X + 8, Y + 14, 6, 1, "rgba(0,0,0,.2)");
      P(bx, "#2a2a30", X + 3, Y + 13, 10, 1);
      P(bx, "#2a2a30", X + 2, Y + 14, 2, 1);
      P(bx, "#2a2a30", X + 12, Y + 14, 2, 1);
      P(bx, "#5a5a66", X + 7, Y + 10, 2, 4);
      P(bx, "#1b1b1f", X + 5, Y - 1, 8, 2);
      P(bx, "#5a5a66", X + 5, Y - 1, 8, 1);
      P(bx, "#1b1b1f", X + 3, Y + 3, 11, 8);
      P(bx, "#2d2d33", X + 4, Y + 4, 9, 5);
      P(bx, "#e24b4a", X + 4, Y + 4, 9, 1);
      P(bx, "#1b1b1f", X + 2, Y - 10, 5, 19);
      P(bx, "#2d2d33", X + 3, Y - 9, 3, 17);
      P(bx, "#e24b4a", X + 3, Y - 9, 1, 17);
      P(bx, "#f4f1ea", X + 4, Y - 8, 2, 2);
      P(bx, "#1b1b1f", X + 6, Y + 6, 7, 2);
      P(bx, "#5a5a66", X + 6, Y + 6, 7, 1);
    }
    if (it === "fridge") {
      P(bx, "rgba(0,0,0,.2)", X + 3, Y + 14, 12, 2);
      box(X + 3, Y - 11, 10, 6, 20, ["#8a96a3", "#e8eef2", "#dde5ea"]);
      P(bx, "#ffffff", X + 4, Y - 10, 8, 1);
      P(bx, "#c9d3da", X + 11, Y - 5, 1, 19);
      P(bx, "#c9d3da", X + 4, Y + 1, 7, 1);
      P(bx, "#8a96a3", X + 13, Y - 3, 1, 3);
      P(bx, "#8a96a3", X + 13, Y + 3, 1, 6);
      P(bx, "#5a5a66", X + 4, Y + 14, 2, 1);
      P(bx, "#5a5a66", X + 10, Y + 14, 2, 1);
    }
    if (it === "tv") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 29, 14, 2);
      box(X + 2, Y + 5, 12, 14, 11, ["#2a1e1a", "#5e463e", "#3a2a25"]);
      P(bx, "#4a3730", X + 4, Y + 21, 8, 6);
      // The screen, turned a little so its face shows on the right.
      P(bx, "#1b1b1f", X + 4, Y + 11, 8, 3);
      P(bx, "#1b1b1f", X + 5, Y - 12, 7, 24);
      P(bx, "#2d2d33", X + 5, Y - 12, 7, 1);
      P(bx, "#2d3b48", X + 8, Y - 10, 3, 19);
      P(bx, "#3e5163", X + 9, Y - 8, 1, 2);
      P(bx, "#3e5163", X + 9, Y - 4, 1, 1);
      P(bx, "#3fae8f", X + 10, Y + 10, 1, 1);
    }
    if (it === "speaker") {
      P(bx, "rgba(0,0,0,.2)", X + 3, Y + 14, 11, 2);
      box(X + 4, Y - 9, 8, 4, 20, ["#1b1b1f", "#3d3d45", "#2d2d33"]);
      P(bx, "#111", X + 12, Y - 4, 1, 4);
      P(bx, "#111", X + 12, Y + 3, 1, 7);
      P(bx, "#3d3d45", X + 5, Y - 4, 6, 1);
      P(bx, "#3fae8f", X + 11, Y - 7, 1, 1);
    }
    // ─── Plus ───
    if (it === "fishtank") {
      P(bx, "rgba(0,0,0,.2)", X + 1, Y + 30, 15, 2);
      P(bx, "#4e3019", X + 2, Y + 18, 12, 12);
      P(bx, "#6e4428", X + 3, Y + 19, 10, 10);
      P(bx, "#8a5a33", X + 3, Y + 19, 10, 1);
      P(bx, "#2a3550", X + 2, Y - 1, 12, 20);
      tankWater(X + 3, Y + 1, 10, 16);
      fish(X + 5, Y + 6, "#e2874c");
      // Glass top: the water seen from above, two fish.
      P(bx, "#1b1b1f", X + 2, Y - 16, 12, 16);
      P(bx, "#3d3d45", X + 2, Y - 16, 12, 1);
      P(bx, "#4aa3d8", X + 3, Y - 14, 10, 13);
      P(bx, "#7cc8ef", X + 3, Y - 14, 10, 2);
      P(bx, "#ffe58a", X + 12, Y - 13, 1, 10);
      if (!noFish) {
        P(bx, "#f2c14e", X + 5, Y - 10, 2, 3);
        P(bx, "#c9a23e", X + 5, Y - 7, 2, 1);
        P(bx, "#a77de0", X + 9, Y - 6, 2, 3);
        P(bx, "#8a66c0", X + 9, Y - 7, 2, 1);
      }
      glint(X + 4, Y + 3);
      glint(X + 5, Y - 12);
    }
    if (it === "trophy") {
      // Glass sides: the cups show through.
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 29, 14, 2);
      box(X + 2, Y - 13, 12, 13, 30, ["#4e3019", "#8a5a33", "#6e4428"]);
      P(bx, "#2e1c10", X + 4, Y + 2, 8, 11);
      P(bx, "#2e1c10", X + 4, Y + 16, 8, 10);
      cup(X + 8, Y + 13, "#f2c14e");
      P(bx, "#a8744a", X + 3, Y + 13, 10, 2);
      P(bx, "#c0504d", X + 6, Y + 18, 2, 4);
      circ(bx, X + 7, Y + 23, 2, "#f2c14e");
      P(bx, "#ffe08a", X + 6, Y + 22);
      P(bx, "#a8744a", X + 3, Y + 26, 10, 2);
      P(bx, "rgba(255,255,255,.18)", X + 5, Y + 3, 1, 8);
      P(bx, "rgba(255,255,255,.18)", X + 5, Y + 17, 1, 7);
      glint(X + 8, Y + 4);
      glint(X + 6, Y + 21);
    }
    if (it === "deluxedesk") {
      const ly = rightEnd(Y + 4, Y + 18);
      const my = leftEnd(Y + 2, Y + 15);
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 30, 14, 2);
      ell(bx, X + 6, ly + 2, 6, 5, "rgba(255,230,160,.18)");
      P(bx, "#2e1c10", X + 1, Y, 15, 31);
      P(bx, "#5e3a20", X + 2, Y + 1, 12, 25);
      P(bx, "#7a4e2c", X + 2, Y + 1, 2, 25);
      P(bx, "#f2c14e", X + 14, Y, 1, 27);
      P(bx, "#ffe08a", X + 14, Y + 2, 1, 6);
      P(bx, "#f2c14e", X + 1, Y + 26, 15, 1);
      P(bx, "#4e3019", X + 2, Y + 27, 12, 3);
      P(bx, "#f2c14e", X + 7, Y + 28, 3, 1);
      // Keyboard in front of the monitor, screen facing right.
      P(bx, "#8a8a96", X + 8, my, 4, 13);
      P(bx, "#b8bcc2", X + 8, my, 1, 13);
      for (let i = 0; i < 5; i++) P(bx, "#5a5a66", X + 10, my + 2 + i * 2, 1, 1);
      P(bx, "#3d3d45", X + 3, my + 8, 5, 2);
      P(bx, "#3d3d45", X + 3, my - 6, 3, 15);
      P(bx, "#7fd1ff", X + 6, my - 5, 1, 11);
      P(bx, "#ffffff", X + 6, my - 4, 1, 3);
      const gy = rightEnd(Y + 12, Y + 6);
      P(bx, "#fdfaf2", X + 9, gy, 4, 3);
      P(bx, "#c0504d", X + 9, gy, 4, 1);
      P(bx, "#fdfaf2", X + 10, gy + 3, 2, 1);
      P(bx, "#c8a24a", X + 4, ly, 2, 7);
      P(bx, "#c8a24a", X + 2, ly + 6, 6, 2);
      P(bx, "#f2c14e", X + 2, ly - 3, 7, 3);
      P(bx, "#ffe08a", X + 2, ly - 3, 7, 1);
      P(bx, "#fff6d6", X + 3, ly, 5, 1);
      glint(X + 4, ly - 5);
      glint(X + 5, my - 6);
    }
    if (it === "hammock") {
      ell(bx, X + 8, Y + 27, 7, 3, "rgba(0,0,0,.18)");
      const post = (y: number) => {
        P(bx, "#4e3019", X + 6, y, 3, 16);
        P(bx, "#8a5a33", X + 7, y, 1, 16);
        P(bx, "#a8744a", X + 6, y, 3, 1);
      };
      post(Y - 13);
      // Seen from above the cloth is a long oval, gathered at the ends and
      // sagging lower in the middle.
      const n = 43;
      for (let i = 0; i < n; i++) {
        const t = Math.sin((Math.PI * i) / (n - 1));
        const half = 1 + Math.round(t * 5);
        const sy = Y - 11 + i + Math.round(t * 8);
        const col = ["#3fae8f", "#f6f0e0", "#f2c14e"][Math.floor(i / 4) % 3];
        P(bx, shade(col, -0.5), X + 7 - half, sy, half * 2 + 2, 2);
        P(bx, shade(col, -0.2), X + 8 - half, sy, half * 2, 2);
        if (half > 1) P(bx, col, X + 9 - half, sy, half * 2 - 2, 2);
        if (half > 2) P(bx, shade(col, 0.35), X + 9 - half, sy, 1, 2);
        if (i % 2 && half > 2) P(bx, "#f6f0e0", X + 8 + half, sy + 1);
      }
      post(Y + 30);
    }
    if (it === "neonsign") {
      P(bx, "rgba(0,0,0,.2)", X + 3, Y + 30, 11, 2);
      P(bx, "#3d3d45", X + 4, Y + 1, 8, 2);
      P(bx, "#2a2a30", X + 7, Y + 21, 2, 8);
      P(bx, "#3d3d45", X + 4, Y + 28, 8, 2);
      ell(bx, X + 13, Y + 16, 3, 12, "rgba(94,242,255,.12)");
      P(bx, "#0e0e16", X + 4, Y - 13, 6, 35);
      P(bx, "#1b1b28", X + 5, Y - 12, 4, 33);
      P(bx, "#2a2a3a", X + 5, Y - 12, 4, 1);
      P(bx, "rgba(255,90,180,.22)", X + 10, Y - 11, 4, 15);
      P(bx, "rgba(94,242,255,.22)", X + 10, Y + 4, 4, 17);
      // The tubes stand out a little from the board, toward the front.
      for (let j = 0; j < 12; j++) if (j % 4 !== 3) P(bx, "#ff5ab4", X + 10, Y - 10 + j, 2, 1);
      for (let j = 0; j < 15; j++) if (j % 5 !== 4) P(bx, "#5ef2ff", X + 10, Y + 5 + j, 2, 1);
      P(bx, "#ffd1ec", X + 11, Y - 10);
      P(bx, "#d8fcff", X + 11, Y + 5);
      glint(X + 9, Y - 8);
      glint(X + 9, Y + 9);
    }
    if (it === "bunkbed") {
      const bl = "#a77de0";
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 45, WW - 3, 3);
      // Under the loft: shade, a little desk end-on and the lamp's glow.
      P(bx, "rgba(0,0,0,.22)", X + 3, Y + 29, WW - 6, 16);
      ell(bx, X + 16, Y + 36, 9, 5, "rgba(255,226,150,.18)");
      P(bx, "#5e3a20", X + 8, Y + 36, 14, 7);
      P(bx, "#a8744a", X + 8, Y + 36, 14, 4);
      P(bx, "#c48d5d", X + 8, Y + 36, 14, 1);
      P(bx, "#3d3d45", X + 18, Y + 32, 1, 4);
      P(bx, "#a77de0", X + 16, Y + 31, 5, 2);
      P(bx, "#fff6d6", X + 17, Y + 33, 3, 1);
      // The loft.
      P(bx, "#4e3019", X + 1, Y - 17, WW - 2, 47);
      P(bx, "#e8e2d6", X + 4, Y - 14, WW - 12, 36);
      P(bx, "#fdfaf2", X + 4, Y - 14, 1, 36);
      if (leftDown) {
        P(bx, shade(bl, -0.3), X + 4, Y - 14, WW - 12, 24);
        P(bx, bl, X + 4, Y - 14, WW - 12, 22);
        P(bx, shade(bl, 0.25), X + 4, Y + 5, WW - 12, 3);
        P(bx, shade(bl, 0.4), X + 4, Y + 5, WW - 12, 1);
        P(bx, "#d8d2c4", X + 7, Y + 12, 12, 9);
        P(bx, "#ffffff", X + 7, Y + 11, 12, 8);
        for (let j = Y - 11; j < Y + 3; j += 6) P(bx, "#ffe58a", X + 8 + ((j >> 2) % 2) * 8, j);
      } else {
        P(bx, "#d8d2c4", X + 7, Y - 11, 12, 9);
        P(bx, "#ffffff", X + 7, Y - 12, 12, 8);
        P(bx, shade(bl, -0.3), X + 4, Y - 2, WW - 12, 24);
        P(bx, bl, X + 4, Y - 2, WW - 12, 22);
        P(bx, shade(bl, 0.25), X + 4, Y - 2, WW - 12, 3);
        P(bx, shade(bl, 0.4), X + 4, Y - 2, WW - 12, 1);
        for (let j = Y + 5; j < Y + 19; j += 6) P(bx, "#ffe58a", X + 8 + ((j >> 2) % 2) * 8, j);
      }
      P(bx, "#6e4428", X + 2, Y + 24, WW - 4, 5);
      P(bx, "#8a5a33", X + 2, Y + 24, WW - 4, 1);
      // Rail along the front (right) with string lights.
      P(bx, "#4e3019", X + WW - 8, Y - 20, 5, 49);
      P(bx, "#8a5a33", X + WW - 7, Y - 19, 3, 47);
      P(bx, "#a8744a", X + WW - 7, Y - 19, 1, 47);
      for (let j = 0; j < 44; j += 5)
        P(bx, ["#ffd84d", "#ff9ec4", "#7fd1ff", "#9fe0c8"][(j / 5) % 4], X + WW - 3, Y - 17 + j);
      // Near posts.
      [X + 1, X + WW - 4].forEach((px) => {
        P(bx, "#4e3019", px, Y + 24, 3, 22);
        P(bx, "#8a5a33", px + 1, Y + 24, 1, 22);
      });
      // Ladder on the front, at the rot-0 right end.
      const ly = rightEnd(Y - 14, Y + 20);
      P(bx, "#8a5a33", X + WW - 9, ly, 1, 26);
      P(bx, "#8a5a33", X + WW - 4, ly, 1, 26);
      for (let j = ly + 2; j < ly + 26; j += 4) P(bx, "#a8744a", X + WW - 9, j, 6, 1);
      glint(X + WW - 4, Y - 7);
      glint(X + WW - 4, Y + 13);
    }
    // ─── Pro ───
    if (it === "aquarium") {
      P(bx, "rgba(0,0,0,.22)", X + 1, Y + 45, 15, 2);
      P(bx, "#2e1c10", X + 1, Y + 33, 14, 13);
      P(bx, "#4e3019", X + 2, Y + 34, 12, 11);
      P(bx, "#f2c14e", X + 1, Y + 33, 14, 1);
      P(bx, "#f2c14e", X + 7, Y + 38, 2, 2);
      P(bx, "#9c7a2c", X + 1, Y + 12, 14, 22);
      P(bx, "#1e2a44", X + 2, Y + 13, 12, 20);
      tankWater(X + 3, Y + 15, 10, 17);
      fish(X + 5, Y + 20, "#5b9cff");
      // Glass top: water seen from above with fish, gold rim and lid light.
      P(bx, "#1b1b1f", X, Y - 10, 16, 23);
      P(bx, "#f2c14e", X, Y - 10, 16, 1);
      P(bx, "#4aa3d8", X + 2, Y - 8, 12, 19);
      P(bx, "#7cc8ef", X + 2, Y - 8, 12, 2);
      P(bx, "#3b93cb", X + 2, Y + 7, 12, 4);
      (
        [
          [4, -4, "#e2874c"],
          [9, 0, "#f2c14e"],
          [5, 5, "#ff7aa8"],
        ] as const
      ).forEach(([dx, dy, c]) => {
        if (noFish) return;
        P(bx, c, X + dx, Y + dy, 2, 3);
        P(bx, shade(c, -0.25), X + dx, Y + dy + 3, 2, 1);
      });
      P(bx, "#ffe58a", X + 13, Y - 7, 1, 17);
      for (let i = 0; i < 4; i++) glint(X + 3 + ((rnd() * 8) | 0), Y - 6 + ((rnd() * 36) | 0));
    }
    if (it === "arcade") {
      P(bx, "rgba(0,0,0,.22)", X + 1, Y + 14, 15, 2);
      P(bx, "#1b1440", X + 2, Y - 15, 10, 31);
      P(bx, "#1b1440", X + 11, Y - 15, 3, 5);
      P(bx, "#1b1440", X + 11, Y, 4, 5);
      P(bx, "#3b2f7a", X + 3, Y - 14, 8, 29);
      P(bx, "#5d4fa0", X + 3, Y - 14, 8, 1);
      P(bx, "#f2c14e", X + 11, Y - 14, 2, 3);
      P(bx, "#0b0b12", X + 11, Y - 10, 1, 10);
      P(bx, "#1d1a4a", X + 12, Y - 9, 1, 8);
      P(bx, "#5d4fa0", X + 12, Y + 1, 2, 3);
      P(bx, "#e24b4a", X + 12, Y, 1, 1);
      P(bx, "#ffd84d", X + 14, Y, 1, 1);
      P(bx, "#ff5ab4", X + 3, Y - 12, 1, 26);
      P(bx, "#5ef2ff", X + 10, Y - 10, 1, 24);
      sprite(bx, X + 5, Y - 6, ["a...a", ".aaa.", "aa.aa", "aaaaa"], { a: "#7fe08a" });
      P(bx, "#2b2258", X + 5, Y + 8, 4, 4);
      P(bx, "#f2c14e", X + 6, Y + 9, 2, 2);
      glint(X + 5, Y - 13);
      glint(X + 9, Y + 1);
    }
    if (it === "fireplace") {
      ell(bx, X + 13, Y + 22, 4, 9, "rgba(255,150,60,.18)");
      box(X + 2, Y - 10, 12, 10, 30, ["#4a4550", "#7c7782", "#4a4550"]);
      for (let j = 0; j < 7; j++)
        for (let i = 0; i < 3; i++) {
          const x0 = Math.max(X + 3, X + 3 + i * 5 - (j % 2) * 3);
          const x1 = Math.min(X + 13, X + 7 + i * 5 - (j % 2) * 3);
          if (x1 > x0) P(bx, (i + j) % 2 ? "#7c7782" : "#8f8a94", x0, Y + 2 + j * 4, x1 - x0, 3);
        }
      P(bx, "#5e3a20", X + 1, Y - 1, 15, 4);
      P(bx, "#8a5a33", X + 1, Y - 1, 15, 1);
      P(bx, "#3a2416", X + 1, Y + 2, 15, 1);
      // The firebox, seen at a slant on the front (right) side.
      P(bx, "rgba(255,170,80,.3)", X + 7, Y + 7, 8, 20);
      P(bx, "#1b1416", X + 9, Y + 9, 5, 17);
      sprite(
        bx,
        X + 9,
        Y + 13,
        ["..o..", ".oo.o", ".oyoo", "oyyyo", "oywyo", "oywyo", "yywyy", ".ooo."],
        { o: "#e2502a", y: "#ff9a2e", w: "#ffe27a" },
      );
      P(bx, "#6e4425", X + 9, Y + 21, 5, 3);
      P(bx, "#8a5a33", X + 10, Y + 21, 2, 1);
      P(bx, "#8f8a94", X + 7, Y + 26, 9, 4);
      P(bx, "#b8bcc2", X + 7, Y + 26, 9, 1);
      P(bx, "#fdfaf2", X + 4, Y - 9, 2, 4);
      P(bx, "#ffd84d", X + 4, Y - 11, 2, 2);
      P(bx, "#c8a24a", X + 8, Y - 7, 2, 6);
      P(bx, "#9fd3ef", X + 10, Y - 6, 1, 4);
      for (let i = 0; i < 2; i++) glint(X + 9 + ((rnd() * 3) | 0), Y + 12 + ((rnd() * 8) | 0));
    }
    if (it === "throne") {
      ell(bx, X + 8, Y + 15, 7, 1, "rgba(0,0,0,.22)");
      P(bx, "#9c7a2c", X + 5, Y + 12, 2, 3);
      P(bx, "#9c7a2c", X + 12, Y + 12, 2, 3);
      P(bx, "#9c7a2c", X + 5, Y - 1, 9, 3);
      P(bx, "#f2c14e", X + 5, Y - 1, 9, 1);
      P(bx, "#9c7a2c", X + 4, Y + 3, 11, 9);
      P(bx, "#f2c14e", X + 5, Y + 3, 9, 7);
      P(bx, "#a3202a", X + 5, Y + 3, 9, 5);
      P(bx, "#d0505a", X + 5, Y + 3, 9, 1);
      P(bx, "#9c7a2c", X + 1, Y - 13, 5, 25);
      P(bx, "#f2c14e", X + 2, Y - 12, 3, 23);
      P(bx, "#fff6c8", X + 2, Y - 12, 1, 8);
      P(bx, "#a3202a", X + 5, Y - 10, 1, 13);
      P(bx, "#9c7a2c", X + 1, Y - 15, 2, 2);
      P(bx, "#9c7a2c", X + 4, Y - 16, 2, 3);
      P(bx, "#ffe08a", X + 4, Y - 16, 1, 1);
      P(bx, "#5b9cff", X + 3, Y - 9, 1, 2);
      glint(X + 2, Y - 15);
      glint(X + 11, Y + 2);
    }
    // ─── Admin (dev studio) ───
    if (it === "devdesk") {
      ell(bx, X + 13, Y + 21, 4, 19, "rgba(90,209,230,.16)");
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 45, 14, 2);
      // The near sled leg, then the white top with its front (right) edge lit.
      P(bx, ink, X + 2, Y + 42, 2, 4);
      P(bx, ink, X + 12, Y + 42, 2, 4);
      P(bx, c3, X + 2, Y + 42, 12, 1);
      P(bx, ink, X + 1, Y, 15, 43);
      P(bx, w1, X + 2, Y + 1, 11, 39);
      P(bx, w0, X + 2, Y + 1, 1, 39);
      P(bx, c2, X + 13, Y + 1, 2, 39);
      P(bx, cyan, X + 14, Y + 2, 1, 37);
      P(bx, c2, X + 2, Y + 40, 13, 2);
      P(bx, c3, X + 2, Y + 40, 13, 1);
      // Monitors along the back (left) edge, screens toward the front.
      const mon = (y0: number, y1: number, up: number, n: number) => {
        P(bx, c2, X + 3, Y + y1 - 3, 4, 2);
        P(bx, ink, X + 3, Y + y0 - up, 4, y1 - y0 + up - 3);
        P(bx, c3, X + 3, Y + y0 - up, 3, 1);
        P(bx, DEV.screen, X + 6, Y + y0 - up + 1, 2, y1 - y0 + up - 5);
        codeColumn(X + 7, Y + y0 - up + 2, y1 - y0 + up - 7, n);
      };
      if (leftDown) {
        mon(1, 14, 5, 4);
        mon(13, 29, 8, 0);
        mon(28, 40, 5, 1);
      } else {
        mon(1, 14, 5, 1);
        mon(13, 29, 8, 0);
        mon(28, 40, 5, 4);
      }
      // Keyboard, mouse pad, mug and plant on the top.
      P(bx, "rgba(167,125,224,.35)", X + 12, Y + 14, 1, 13);
      P(bx, ink, X + 8, Y + 14, 4, 13);
      P(bx, c3, X + 8, Y + 14, 1, 13);
      for (let j = 0; j < 6; j++) P(bx, c4, X + 9 + (j % 2), Y + 15 + j * 2, 1, 1);
      P(bx, cyan, X + 10, Y + 16);
      P(bx, violet, X + 9, Y + 21);
      P(bx, teal, X + 10, Y + 24);
      const my = rightEnd(Y + 6, Y + 29);
      P(bx, c2, X + 8, my, 4, 6);
      P(bx, w0, X + 9, my + 2, 2, 2);
      const gy = leftEnd(Y + 4, Y + 33);
      P(bx, w0, X + 8, gy, 3, 3);
      P(bx, "#6e4425", X + 9, gy + 1);
      P(bx, g1, X + 11, gy + 1);
      const py = rightEnd(Y + 2, Y + 36);
      P(bx, w0, X + 9, py + 1, 3, 3);
      P(bx, g1, X + 11, py + 1, 1, 3);
      circ(bx, X + 10, py - 1, 2, "#3f8e3b");
      P(bx, "#5aae51", X + 9, py - 3, 1, 2);
      glint(X + 5, Y + 7);
    }
    if (it === "ergochair") {
      ell(bx, X + 8, Y + 14, 6, 1, "rgba(0,0,0,.2)");
      P(bx, ink, X + 3, Y + 12, 10, 2);
      P(bx, c3, X + 4, Y + 12, 8, 1);
      P(bx, ink, X + 2, Y + 14, 2, 1);
      P(bx, ink, X + 12, Y + 14, 2, 1);
      P(bx, g2, X + 7, Y + 9, 2, 3);
      P(bx, ink, X + 3, Y + 3, 11, 6);
      P(bx, c2, X + 4, Y + 4, 9, 3);
      P(bx, c3, X + 4, Y + 4, 9, 1);
      P(bx, ink, X + 3, Y - 13, 4, 3);
      P(bx, c4, X + 4, Y - 12, 2, 1);
      P(bx, g3, X + 4, Y - 10, 1, 1);
      P(bx, ink, X + 2, Y - 9, 5, 17);
      P(bx, c2, X + 3, Y - 8, 3, 15);
      for (let j = 0; j < 15; j += 2) P(bx, c3, X + 3 + ((j >> 1) % 2) * 2, Y - 8 + j, 1, 1);
      P(bx, cyan, X + 5, Y, 1, 3);
      P(bx, ink, X + 6, Y + 1, 7, 2);
      P(bx, c4, X + 6, Y + 1, 7, 1);
      P(bx, ink, X + 9, Y + 3, 1, 2);
    }
    if (it === "codewall") {
      P(bx, "rgba(0,0,0,.2)", X + 3, Y + 29, 11, 2);
      ell(bx, X + 13, Y + 4, 3, 14, "rgba(90,209,230,.12)");
      // Base plate and column under the slim display, screen to the right.
      P(bx, ink, X + 4, Y + 21, 9, 7);
      P(bx, c2, X + 5, Y + 22, 7, 5);
      P(bx, c3, X + 5, Y + 22, 7, 1);
      P(bx, ink, X + 7, Y + 15, 2, 8);
      P(bx, ink, X + 5, Y - 13, 7, 30);
      P(bx, c1, X + 6, Y - 12, 2, 28);
      P(bx, c3, X + 6, Y - 12, 2, 1);
      P(bx, DEV.screen, X + 8, Y - 11, 3, 26);
      P(bx, "#1b1e26", X + 8, Y - 11, 1, 26);
      codeColumn(X + 9, Y - 9, 22, 2);
      P(bx, violet, X + 10, Y + 13, 1, 2);
      glint(X + 7, Y - 12);
    }
    if (it === "whiteboard") {
      P(bx, "rgba(0,0,0,.18)", X + 3, Y + 29, 11, 2);
      // Wheeled feet at both ends, the board edge-on with its face to the right.
      [Y + 3, Y + 26].forEach((fy) => {
        P(bx, g3, X + 8, fy - 6, 1, 6);
        P(bx, c2, X + 5, fy, 7, 2);
        P(bx, ink, X + 5, fy + 2, 1, 1);
        P(bx, ink, X + 11, fy + 2, 1, 1);
      });
      P(bx, g3, X + 6, Y - 16, 6, 36);
      P(bx, g1, X + 7, Y - 15, 2, 34);
      P(bx, w0, X + 9, Y - 15, 2, 34);
      P(bx, g1, X + 6, Y - 16, 6, 1);
      [cyan, violet, teal, "#f2a03e"].forEach((c, n) => P(bx, c, X + 10, Y - 12 + n * 8, 1, 3));
      // Marker tray along the bottom edge.
      P(bx, g3, X + 12, Y - 13, 2, 32);
      P(bx, "#e24b4a", X + 12, Y - 8, 1, 3);
      P(bx, cyan, X + 12, Y - 3, 1, 3);
      P(bx, ink, X + 12, Y + 2, 1, 3);
    }
    if (it === "serverrack") {
      P(bx, "rgba(0,0,0,.22)", X + 3, Y + 14, 12, 2);
      box(X + 3, Y - 21, 10, 6, 28, [ink, c3, c1]);
      P(bx, c4, X + 4, Y - 20, 8, 1);
      for (let j = 0; j < 6; j++) P(bx, c2, X + 5, Y - 12 + j * 4, 6, 1);
      // LEDs on the front (right) edge.
      const led = ["#4fdc7a", cyan, "#4fdc7a", "#f2c14e", cyan, "#4fdc7a", violet];
      for (let u = 0; u < 7; u++) P(bx, led[u], X + 12, Y - 14 + u * 4);
      P(bx, ink, X + 4, Y + 13, 2, 2);
      P(bx, ink, X + 10, Y + 13, 2, 2);
      glint(X + 11, Y - 14);
      glint(X + 11, Y - 2);
    }
    if (it === "espresso") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 30, 14, 2);
      // Counter: oak top seen from above, white end and front (right).
      box(X + 2, Y - 2, 12, 26, 6, [g3, oak, w1]);
      P(bx, oakD, X + 3, Y + 24, 10, 1);
      P(bx, w0, X + 12, Y - 1, 1, 25);
      P(bx, c2, X + 3, Y + 27, 10, 2);
      const machine = () => {
        const my = leftEnd(Y + 1, Y + 15);
        P(bx, ink, X + 3, my - 6, 9, 14);
        P(bx, "#b8bcc2", X + 4, my - 5, 7, 12);
        P(bx, "#e4e6ea", X + 4, my - 5, 7, 1);
        P(bx, "#d9dce1", X + 4, my - 4, 1, 11);
        P(bx, g3, X + 10, my - 5, 1, 12);
        P(bx, c1, X + 10, my + 1, 2, 3);
        P(bx, ink, X + 12, my + 2, 3, 1);
        P(bx, w0, X + 11, my + 5, 2, 2);
        P(bx, cyan, X + 10, my - 3);
      };
      const cups = () => {
        const cy = leftEnd(Y + 11, Y + 4);
        P(bx, w0, X + 6, cy, 3, 3);
        P(bx, "#6e4425", X + 7, cy + 1);
        P(bx, c3, X + 9, cy + 2, 3, 3);
        P(bx, "#6e4425", X + 10, cy + 3);
      };
      const jar = () => {
        const jy = leftEnd(Y + 22, Y + 3);
        P(bx, g2, X + 5, jy - 7, 5, 8);
        P(bx, "#dde7ec", X + 6, jy - 6, 3, 6);
        P(bx, "#5e3a20", X + 6, jy - 4, 3, 4);
        P(bx, "#8a5a33", X + 7, jy - 3);
        P(bx, w0, X + 6, jy - 6, 1, 2);
        P(bx, oakD, X + 5, jy - 8, 5, 2);
        P(bx, oak, X + 5, jy - 8, 5, 1);
      };
      (leftDown ? [jar, cups, machine] : [machine, cups, jar]).forEach((f) => f());
      glint(X + 4, leftEnd(Y - 4, Y + 10));
    }
    if (it === "adminrug") studioRug(X, Y, WW, o.h * TILE, leftDown);
    if (it === "adminneon") {
      P(bx, "rgba(0,0,0,.2)", X + 3, Y + 30, 11, 2);
      P(bx, c3, X + 4, Y + 1, 8, 2);
      P(bx, c1, X + 7, Y + 21, 2, 8);
      P(bx, c3, X + 4, Y + 28, 8, 2);
      ell(bx, X + 13, Y + 6, 3, 14, "rgba(90,209,230,.14)");
      P(bx, ink, X + 4, Y - 13, 6, 35);
      P(bx, "#1b1c22", X + 5, Y - 12, 4, 33);
      P(bx, c2, X + 5, Y - 12, 4, 1);
      // Tubes stand a little off the board, toward the front.
      P(bx, "rgba(90,209,230,.25)", X + 10, Y - 11, 4, 31);
      for (let j = 0; j < 24; j++) if (j % 5 !== 4) P(bx, w0, X + 10, Y - 6 + j);
      for (let j = 0; j < 11; j++) if (j % 4 !== 3) P(bx, cyan, X + 11, Y - 11 + j * 2, 1, 1);
      P(bx, violet, X + 11, Y - 5, 1, 2);
      glint(X + 9, Y - 9);
      glint(X + 9, Y + 11);
    }
    if (it === "studiobed") {
      const dv = c4;
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 45, WW - 3, 3);
      P(bx, ink, X + 1, Y + 3, WW - 2, 43);
      P(bx, c2, X + 2, Y + 4, WW - 4, 37);
      P(bx, c1, X + 2, Y + 41, WW - 4, 4);
      P(bx, c3, X + 2, Y + 41, WW - 4, 1);
      P(bx, cyan, X + 3, Y + 44, WW - 6, 1);
      const pillows = (y: number) => {
        P(bx, g1, X + 5, y + 1, 11, 7);
        P(bx, w0, X + 5, y, 10, 6);
        P(bx, "#2f8fa0", X + 17, y + 1, 10, 7);
        P(bx, cyan, X + 17, y, 9, 6);
        P(bx, "#9ae6f2", X + 17, y, 9, 1);
      };
      const throwAt = (y: number) => {
        P(bx, g2, X + 4, y, WW - 8, 7);
        P(bx, g1, X + 4, y, WW - 8, 6);
        for (let i = X + 5; i < X + WW - 5; i += 2) P(bx, w1, i, y + 1 + ((i >> 1) % 2) * 2, 1, 2);
      };
      const headboard = (y: number) => {
        P(bx, ink, X + 1, y, WW - 2, 14);
        P(bx, c2, X + 2, y + 1, WW - 4, 12);
        for (let i = X + 6; i < X + WW - 4; i += 5) P(bx, c1, i, y + 3, 1, 9);
        P(bx, oak, X + 2, y + 1, WW - 4, 2);
        P(bx, oakL, X + 2, y + 1, WW - 4, 1);
      };
      if (leftDown) {
        // Headboard nearest the viewer (seen from its back), foot at the top.
        P(bx, w1, X + 4, Y + 5, WW - 8, 34);
        P(bx, shade(dv, -0.3), X + 4, Y + 5, WW - 8, 21);
        P(bx, dv, X + 4, Y + 5, WW - 8, 19);
        throwAt(Y + 5);
        P(bx, w0, X + 4, Y + 22, WW - 8, 2);
        P(bx, g1, X + 4, Y + 24, WW - 8, 1);
        pillows(Y + 27);
        headboard(Y + 32);
      } else {
        headboard(Y - 6);
        P(bx, w1, X + 4, Y + 8, WW - 8, 32);
        pillows(Y + 9);
        P(bx, shade(dv, -0.3), X + 4, Y + 19, WW - 8, 22);
        P(bx, dv, X + 4, Y + 19, WW - 8, 19);
        P(bx, w0, X + 4, Y + 19, WW - 8, 2);
        P(bx, g1, X + 4, Y + 21, WW - 8, 1);
        throwAt(Y + 34);
      }
      glint(X + 20, leftEnd(Y + 10, Y + 28));
    }
    if (it === "studiosofa") {
      const c = SOFA;
      P(bx, "rgba(0,0,0,.18)", X + 1, Y + 45, 14, 2);
      P(bx, ink, X + 2, Y + 41, 1, 5);
      P(bx, ink, X + 13, Y + 41, 1, 5);
      P(bx, shade(c, -0.5), X, Y - 5, 6, 47);
      P(bx, shade(c, -0.5), X, Y - 3, 16, 45);
      P(bx, shade(c, -0.15), X + 1, Y - 4, 4, 40);
      P(bx, shade(c, 0.25), X + 1, Y - 4, 1, 40);
      for (let i = 1; i < 3; i++) P(bx, shade(c, -0.3), X + 2, Y + i * 13 - 3, 3, 1);
      P(bx, shade(c, -0.1), X + 5, Y - 2, 10, 3);
      P(bx, shade(c, 0.25), X + 5, Y - 2, 10, 1);
      P(bx, shade(c, -0.3), X + 5, Y + 1, 10, 2);
      P(bx, c, X + 5, Y + 3, 9, 31);
      P(bx, shade(c, 0.3), X + 5, Y + 3, 1, 31);
      P(bx, shade(c, -0.3), X + 5, Y + 13, 9, 1);
      P(bx, shade(c, -0.3), X + 5, Y + 24, 9, 1);
      const pillow = (y: number, col: string, sh: string, hi: string) => {
        P(bx, sh, X + 4, y, 5, 6);
        P(bx, col, X + 4, y, 5, 5);
        P(bx, hi, X + 4, y, 5, 1);
      };
      pillow(leftEnd(Y + 4, Y + 27), w0, g1, "#ffffff");
      pillow(rightEnd(Y + 4, Y + 27), cyan, "#2f8fa0", "#9ae6f2");
      P(bx, shade(c, -0.1), X + 1, Y + 34, 14, 3);
      P(bx, shade(c, 0.25), X + 1, Y + 34, 14, 1);
      P(bx, shade(c, -0.3), X + 1, Y + 37, 14, 4);
    }
    if (it === "techshelf") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 29, 14, 2);
      P(bx, ink, X + 3, Y + 26, 1, 4);
      P(bx, ink, X + 12, Y + 26, 1, 4);
      box(X + 2, Y - 12, 12, 12, 27, [g3, w0, w1]);
      P(bx, oak, X + 3, Y + 12, 9, 1);
      P(bx, g1, X + 3, Y + 1, 9, 1);
      // Books and the console peek out on the front (right) edge.
      [Y + 2, Y + 15].forEach((sy, n) => {
        P(bx, "#d5d8de", X + 12, sy, 1, 9);
        for (let j = 0; j < 4; j++)
          P(
            bx,
            [cyan, w0, violet, "#e24b4a", teal, "#f2c14e"][(j + n * 3) % 6],
            X + 12,
            sy + 1 + j * 2,
            1,
            2,
          );
      });
      const py = rightEnd(Y - 9, Y - 4);
      P(bx, w0, X + 6, py, 4, 3);
      P(bx, g1, X + 9, py, 1, 3);
      P(bx, "#3f8e3b", X + 7, py - 5, 2, 5);
      P(bx, "#5aae51", X + 7, py - 5, 1, 4);
      P(bx, "#3f8e3b", X + 6, py - 3, 1, 2);
    }
  };

  /** A dorm piece turned away (rot 2): seen from behind. */
  const paintBack = (o: Thing) => {
    const X = o.x * TILE;
    const Y = o.y * TILE;
    const WW = o.w * TILE;
    const it = o.item;
    // Beds and the hammock look the same from either side, just mirrored.
    if (it === "bed" || it === "bunkbed" || it === "hammock" || it === "studiobed")
      return mirror(X, WW, () => paintFront(o));
    if (it === "rug" || it === "adminrug") return paintFront(o);
    /** A plain back panel: outline, boards and a light top edge. */
    const panel = (x: number, y: number, w: number, h: number, cols: [string, string, string]) => {
      P(bx, cols[0], x, y, w, h);
      P(bx, cols[1], x + 1, y + 1, w - 2, h - 2);
      for (let i = x + 7; i < x + w - 3; i += 7) P(bx, cols[2], i, y + 3, 1, h - 5);
    };
    if (it === "desk") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 14, 30, 2);
      P(bx, "#5e3a20", X + 1, Y + 11, 30, 4);
      P(bx, "#4e3019", X + 1, Y + 13, 30, 1);
      P(bx, "#a8744a", X + 1, Y + 1, 30, 11);
      P(bx, "#c48d5d", X + 1, Y + 1, 30, 1);
      P(bx, "#fff", X + 18, Y + 2, 9, 6);
      P(bx, "#d8d2c4", X + 22, Y + 2, 1, 6);
      for (let i = 0; i < 3; i++) {
        P(bx, "#bbb", X + 19, Y + 3 + i * 2, 2, 1);
        P(bx, "#bbb", X + 24, Y + 3 + i * 2, 2, 1);
      }
      P(bx, "#5b7cfa", X + 12, Y + 3, 4, 4);
      P(bx, "#3d3d45", X + 6, Y + 5, 2, 6);
      P(bx, "#f2c14e", X + 4, Y + 3, 7, 3);
      P(bx, "#c8a24a", X + 4, Y + 5, 7, 1);
    }
    if (it === "chair") {
      P(bx, "rgba(0,0,0,.15)", X + 3, Y + 13, 10, 2);
      P(bx, "#5e3a20", X + 3, Y + 11, 2, 4);
      P(bx, "#5e3a20", X + 11, Y + 11, 2, 4);
      P(bx, "#c0504d", X + 2, Y + 3, 12, 5);
      P(bx, "#d9726e", X + 2, Y + 3, 12, 1);
      P(bx, "#5e3a20", X + 3, Y - 5, 10, 16);
      P(bx, "#8a5a33", X + 4, Y - 4, 8, 14);
      P(bx, "#a8744a", X + 4, Y - 4, 8, 1);
      P(bx, "#6e4428", X + 4, Y + 1, 8, 1);
      P(bx, "#6e4428", X + 4, Y + 6, 8, 1);
    }
    if (it === "shelf_small") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 14, 30, 2);
      P(bx, "#a24c27", X + 4, Y - 7, 5, 4);
      circ(bx, X + 6, Y - 9, 3, "#3f8e3b");
      P(bx, "#5aae51", X + 6, Y - 11, 2, 1);
      P(bx, "#6e4428", X + 18, Y - 9, 8, 6);
      P(bx, "#4e3019", X + 21, Y - 6, 2, 3);
      panel(X + 1, Y - 4, 30, 19, ["#4e3019", "#7a4e2c", "#6e4428"]);
      P(bx, "#a8744a", X + 2, Y - 3, 28, 2);
    }
    if (it === "wardrobe") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, 30, 2);
      panel(X + 1, Y - 16, 30, 31, ["#4e3019", "#7a4e2c", "#6e4428"]);
      P(bx, "#a8744a", X + 2, Y - 15, 28, 2);
      P(bx, "#6e4428", X + 2, Y - 13, 28, 1);
      P(bx, "#4e3019", X + 3, Y + 14, 3, 2);
      P(bx, "#4e3019", X + 26, Y + 14, 3, 2);
    }
    if (it === "sofa") {
      const c = "#3fae8f";
      P(bx, "rgba(0,0,0,.18)", X + 1, Y + 14, WW - 2, 2);
      // Throw pillows peek over the back.
      P(bx, "#f2b8c8", X + 5, Y - 9, 6, 3);
      P(bx, "#ffd7e2", X + 5, Y - 9, 6, 1);
      P(bx, "#f2c14e", X + WW - 11, Y - 9, 6, 3);
      P(bx, "#ffe08a", X + WW - 11, Y - 9, 6, 1);
      P(bx, shade(c, -0.5), X, Y - 6, WW, 20);
      P(bx, shade(c, -0.15), X + 1, Y - 5, WW - 2, 17);
      P(bx, shade(c, 0.25), X + 1, Y - 5, WW - 2, 1);
      P(bx, shade(c, -0.05), X + 1, Y - 4, WW - 2, 3);
      for (let i = 1; i < o.w; i++) P(bx, shade(c, -0.3), X + i * 16, Y - 1, 1, 10);
      P(bx, shade(c, -0.3), X + 1, Y + 10, WW - 2, 3);
      P(bx, "#4e3019", X + 2, Y + 13, 2, 2);
      P(bx, "#4e3019", X + WW - 4, Y + 13, 2, 2);
    }
    if (it === "bookshelf") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 14, 30, 2);
      panel(X, Y - 8, 32, 24, ["#4e3019", "#6e4428", "#5e3a20"]);
      P(bx, "#8a5a33", X + 1, Y - 7, 30, 1);
    }
    if (it === "gamingchair") {
      ell(bx, X + 8, Y + 14, 6, 1, "rgba(0,0,0,.2)");
      P(bx, "#2a2a30", X + 3, Y + 13, 10, 1);
      P(bx, "#2a2a30", X + 2, Y + 14, 2, 1);
      P(bx, "#2a2a30", X + 12, Y + 14, 2, 1);
      P(bx, "#5a5a66", X + 7, Y + 10, 2, 4);
      P(bx, "#1b1b1f", X + 1, Y + 1, 2, 6);
      P(bx, "#1b1b1f", X + 13, Y + 1, 2, 6);
      P(bx, "#5a5a66", X + 1, Y + 1, 2, 1);
      P(bx, "#5a5a66", X + 13, Y + 1, 2, 1);
      P(bx, "#1b1b1f", X + 3, Y - 9, 10, 19);
      P(bx, "#2d2d33", X + 4, Y - 8, 8, 17);
      P(bx, "#e24b4a", X + 4, Y - 8, 1, 17);
      P(bx, "#e24b4a", X + 11, Y - 8, 1, 17);
      P(bx, "#e24b4a", X + 6, Y - 2, 4, 4);
      P(bx, "#1b1b1f", X + 7, Y - 1, 2, 2);
      P(bx, "#3d3d45", X + 4, Y - 8, 8, 1);
    }
    if (it === "fridge") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, 13, 2);
      P(bx, "#8a96a3", X + 2, Y - 7, 12, 22);
      P(bx, "#d5dde3", X + 3, Y - 6, 10, 20);
      P(bx, "#ffffff", X + 3, Y - 6, 10, 1);
      for (let j = 0; j < 5; j++) P(bx, "#6e7882", X + 5, Y - 2 + j * 3, 6, 1);
      P(bx, "#6e7882", X + 5, Y - 2, 1, 13);
      P(bx, "#6e7882", X + 10, Y - 2, 1, 13);
      P(bx, "#5a5a66", X + 3, Y + 14, 2, 1);
      P(bx, "#5a5a66", X + 11, Y + 14, 2, 1);
    }
    if (it === "tv") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 14, 30, 2);
      P(bx, "#2a1e1a", X + 2, Y + 4, 28, 11);
      P(bx, "#3a2a25", X + 3, Y + 5, 26, 9);
      P(bx, "#5e463e", X + 2, Y + 4, 28, 1);
      P(bx, "#2a1e1a", X + 9, Y + 6, 14, 1);
      P(bx, "#1b1b1f", X + 13, Y + 2, 6, 3);
      P(bx, "#1b1b1f", X + 3, Y - 12, 26, 15);
      P(bx, "#2d2d33", X + 3, Y - 12, 26, 1);
      P(bx, "#26262c", X + 7, Y - 9, 18, 10);
      for (let i = 0; i < 5; i++) P(bx, "#111", X + 10 + i * 3, Y - 7, 1, 4);
      P(bx, "#111", X + 21, Y + 1, 1, 6);
    }
    if (it === "speaker") {
      P(bx, "rgba(0,0,0,.2)", X + 3, Y + 14, 11, 2);
      P(bx, "#1b1b1f", X + 3, Y - 9, 10, 24);
      P(bx, "#2d2d33", X + 4, Y - 8, 8, 22);
      P(bx, "#3d3d45", X + 4, Y - 8, 8, 1);
      circ(bx, X + 8, Y + 1, 2, "#111");
      P(bx, "#5a5a66", X + 6, Y + 8, 4, 3);
      P(bx, "#e24b4a", X + 7, Y + 9, 1, 1);
      P(bx, "#111", X + 8, Y + 9, 1, 1);
    }
    if (it === "fishtank" || it === "aquarium") {
      // The glass looks the same from behind (fish turned round); the
      // stand's back is plain and a filter hangs on the back rim.
      mirror(X, WW, () => paintFront(o));
      const gold = it === "aquarium";
      P(bx, gold ? "#4e3019" : "#6e4428", X + 2, Y + 4, WW - 4, 10);
      P(bx, gold ? "#f2c14e" : "#8a5a33", X + 2, Y + 4, WW - 4, 1);
      P(bx, "#3d3d45", X + 5, Y - (gold ? 18 : 15), 6, 10);
      P(bx, "#5a5a66", X + 5, Y - (gold ? 18 : 15), 6, 1);
      P(bx, "#2a2a30", X + 7, Y - (gold ? 8 : 5), 2, 4);
    }
    if (it === "trophy") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, 30, 2);
      panel(X + 1, Y - 15, 30, 30, ["#4e3019", "#6e4428", "#5e3a20"]);
      P(bx, "#8a5a33", X + 2, Y - 14, 28, 2);
    }
    if (it === "deluxedesk") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, 30, 2);
      ell(bx, X + 7, Y + 6, 6, 4, "rgba(255,230,160,.18)");
      P(bx, "#2e1c10", X + 1, Y + 10, 30, 5);
      P(bx, "#4e3019", X + 2, Y + 11, 28, 3);
      P(bx, "#2e1c10", X, Y, 32, 11);
      P(bx, "#5e3a20", X + 1, Y + 1, 30, 9);
      P(bx, "#7a4e2c", X + 1, Y + 1, 30, 1);
      P(bx, "#f2c14e", X, Y + 10, 32, 1);
      P(bx, "#ffe08a", X + 24, Y + 10, 6, 1);
      P(bx, "#fdfaf2", X + 11, Y + 2, 3, 4);
      P(bx, "#c0504d", X + 11, Y + 2, 3, 1);
      P(bx, "#fdfaf2", X + 10, Y + 3, 1, 2);
      P(bx, "#c8a24a", X + 5, Y + 1, 2, 7);
      P(bx, "#c8a24a", X + 3, Y + 7, 6, 2);
      P(bx, "#f2c14e", X + 3, Y - 2, 7, 3);
      P(bx, "#d9a22a", X + 3, Y, 7, 1);
      P(bx, "#3d3d45", X + 17, Y - 5, 11, 11);
      P(bx, "#2a2a30", X + 19, Y - 3, 7, 6);
      P(bx, "#2a2a30", X + 21, Y + 6, 3, 3);
      glint(X + 4, Y - 4);
      glint(X + 26, Y + 9);
    }
    if (it === "neonsign") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, 30, 2);
      P(bx, "#2a2a30", X + 6, Y + 3, 2, 12);
      P(bx, "#2a2a30", X + 24, Y + 3, 2, 12);
      P(bx, "#3d3d45", X + 4, Y + 13, 6, 2);
      P(bx, "#3d3d45", X + 22, Y + 13, 6, 2);
      // A little light leaks round the edges of the dark back.
      P(bx, "rgba(255,90,180,.22)", X, Y - 16, 32, 21);
      P(bx, "rgba(94,242,255,.18)", X, Y - 6, 32, 11);
      P(bx, "#0e0e16", X + 1, Y - 15, 30, 19);
      P(bx, "#24242e", X + 2, Y - 14, 28, 17);
      P(bx, "#30303c", X + 2, Y - 14, 28, 1);
      P(bx, "#111", X + 8, Y - 6, 16, 1);
      P(bx, "#111", X + 23, Y - 6, 1, 9);
      P(bx, "#3d3d45", X + 13, Y - 10, 6, 4);
    }
    if (it === "arcade") {
      P(bx, "rgba(0,0,0,.22)", X, Y + 14, 16, 2);
      P(bx, "#1b1440", X + 1, Y - 15, 14, 31);
      P(bx, "#2b2258", X + 2, Y - 14, 12, 29);
      P(bx, "#5ef2ff", X + 1, Y - 12, 1, 26);
      P(bx, "#ff5ab4", X + 14, Y - 12, 1, 26);
      P(bx, "#9c7a2c", X + 2, Y - 14, 12, 2);
      for (let j = 0; j < 4; j++) P(bx, "#1b1440", X + 4, Y - 10 + j * 3, 8, 1);
      P(bx, "#3b2f7a", X + 4, Y + 2, 8, 9);
      P(bx, "#5d4fa0", X + 4, Y + 2, 8, 1);
      P(bx, "#c8a24a", X + 10, Y + 5, 1, 2);
      P(bx, "#111", X + 7, Y + 11, 1, 4);
      glint(X + 9, Y - 13);
    }
    if (it === "fireplace") {
      P(bx, "#fdfaf2", X + 3, Y - 22, 2, 4);
      P(bx, "#ffd84d", X + 3, Y - 24, 2, 2);
      P(bx, "#fdfaf2", X + 27, Y - 21, 2, 3);
      P(bx, "#ffd84d", X + 27, Y - 23, 2, 2);
      P(bx, "#6e4425", X + 12, Y - 25, 8, 7);
      P(bx, "#4e3019", X + 15, Y - 22, 2, 2);
      P(bx, "#4a4550", X, Y - 16, 32, 31);
      for (let j = 0; j < 7; j++)
        for (let i = 0; i < 5; i++) {
          const x0 = Math.max(X + 1, X + 1 + i * 8 - (j % 2) * 4);
          const x1 = Math.min(X + 31, X + 8 + i * 8 - (j % 2) * 4);
          if (x1 > x0) P(bx, (i + j) % 2 ? "#7c7782" : "#8f8a94", x0, Y - 15 + j * 4, x1 - x0, 3);
        }
      P(bx, "#5e3a20", X - 2, Y - 18, 36, 4);
      P(bx, "#8a5a33", X - 2, Y - 18, 36, 1);
      P(bx, "#3a2416", X - 2, Y - 15, 36, 1);
      P(bx, "#8f8a94", X + 3, Y + 11, 26, 4);
      P(bx, "#b8bcc2", X + 3, Y + 11, 26, 1);
    }
    if (it === "throne") {
      ell(bx, X + 8, Y + 15, 7, 1, "rgba(0,0,0,.22)");
      P(bx, "#9c7a2c", X, Y - 1, 4, 9);
      P(bx, "#9c7a2c", X + 12, Y - 1, 4, 9);
      P(bx, "#f2c14e", X + 1, Y - 1, 2, 8);
      P(bx, "#f2c14e", X + 13, Y - 1, 2, 8);
      P(bx, "#9c7a2c", X + 2, Y + 12, 2, 3);
      P(bx, "#9c7a2c", X + 12, Y + 12, 2, 3);
      P(bx, "#9c7a2c", X + 2, Y - 13, 12, 26);
      P(bx, "#f2c14e", X + 3, Y - 12, 10, 24);
      P(bx, "#c8a24a", X + 5, Y - 10, 6, 19);
      P(bx, "#9c7a2c", X + 7, Y - 8, 2, 15);
      P(bx, "#9c7a2c", X + 2, Y - 15, 2, 2);
      P(bx, "#9c7a2c", X + 7, Y - 16, 2, 3);
      P(bx, "#9c7a2c", X + 12, Y - 15, 2, 2);
      P(bx, "#f2c14e", X + 13, Y - 15, 1, 1);
      P(bx, "#ffe08a", X + 8, Y - 16, 1, 1);
      P(bx, "#f2c14e", X + 3, Y - 15, 1, 1);
      P(bx, "#fff6c8", X + 12, Y - 12, 1, 4);
      glint(X + 12, Y - 15);
      glint(X + 4, Y + 2);
    }
    // ─── Admin (dev studio) ───
    if (it === "devdesk") {
      ell(bx, X + WW / 2, Y + 13, 22, 3, "rgba(90,209,230,.16)");
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, WW - 3, 2);
      P(bx, ink, X + 2, Y + 8, 3, 7);
      P(bx, c3, X + 3, Y + 8, 1, 6);
      P(bx, ink, X + WW - 5, Y + 8, 3, 7);
      P(bx, c3, X + WW - 4, Y + 8, 1, 6);
      // The PC tower's back (fan) and the cable tray.
      P(bx, ink, X + 5, Y + 7, 8, 8);
      P(bx, c2, X + 6, Y + 8, 6, 6);
      circ(bx, X + 9, Y + 11, 2, c1);
      P(bx, c4, X + 9, Y + 11);
      P(bx, violet, X + 6, Y + 13, 6, 1);
      P(bx, c1, X + 14, Y + 8, 22, 3);
      P(bx, c3, X + 15, Y + 10, 20, 1);
      P(bx, ink, X, Y - 2, WW, 11);
      P(bx, w1, X + 1, Y - 1, WW - 2, 6);
      P(bx, w0, X + 1, Y - 1, WW - 2, 1);
      P(bx, c2, X + 1, Y + 5, WW - 2, 3);
      P(bx, c3, X + 1, Y + 5, WW - 2, 1);
      // Mug and plant (mirrored), then the monitors' backs with the cables.
      P(bx, w0, X + 38, Y - 1, 4, 4);
      P(bx, g1, X + 41, Y - 1, 1, 4);
      P(bx, "#6e4425", X + 39, Y - 1, 3, 1);
      P(bx, g1, X + 37, Y, 1, 2);
      P(bx, w0, X + 3, Y - 1, 4, 4);
      P(bx, g1, X + 6, Y - 1, 1, 4);
      circ(bx, X + 5, Y - 3, 2, "#3f8e3b");
      P(bx, "#5aae51", X + 4, Y - 6, 1, 2);
      const back = (x: number, y: number, w: number, h: number) => {
        P(bx, ink, x + (w >> 1) - 1, y + h, 3, 2);
        P(bx, c2, x + (w >> 1) - 3, y + h + 1, 7, 1);
        P(bx, ink, x, y, w, h);
        P(bx, c2, x + 1, y + 1, w - 2, h - 2);
        P(bx, c3, x + 1, y + 1, w - 2, 1);
        P(bx, c1, x + (w >> 1) - 2, y + (h >> 1) - 1, 4, 4);
        P(bx, c1, x + (w >> 1), y + (h >> 1) + 3, 1, h - (h >> 1) - 3);
      };
      back(X + 2, Y - 13, 13, 10);
      back(X + WW - 15, Y - 13, 13, 10);
      back(X + 15, Y - 17, 18, 14);
      P(bx, c1, X + 24, Y + 5, 1, 4);
      P(bx, c1, X + 8, Y + 5, 1, 3);
      P(bx, c1, X + 40, Y + 5, 1, 3);
      P(bx, cyan, X + 31, Y - 15);
      glint(X + 30, Y - 15);
    }
    if (it === "ergochair") {
      ell(bx, X + 8, Y + 14, 6, 1, "rgba(0,0,0,.2)");
      P(bx, ink, X + 3, Y + 12, 10, 2);
      P(bx, c3, X + 4, Y + 12, 8, 1);
      P(bx, ink, X + 2, Y + 14, 2, 1);
      P(bx, ink, X + 7, Y + 14, 2, 1);
      P(bx, ink, X + 12, Y + 14, 2, 1);
      P(bx, g2, X + 7, Y + 9, 2, 3);
      P(bx, ink, X + 1, Y + 1, 2, 6);
      P(bx, ink, X + 13, Y + 1, 2, 6);
      P(bx, c4, X + 1, Y + 1, 2, 1);
      P(bx, c4, X + 13, Y + 1, 2, 1);
      P(bx, ink, X + 2, Y + 4, 12, 6);
      P(bx, c2, X + 3, Y + 5, 10, 3);
      // Mesh back (seen from behind) on a chrome spine, headrest on top.
      P(bx, ink, X + 3, Y - 8, 10, 16);
      P(bx, c2, X + 4, Y - 7, 8, 14);
      for (let j = 0; j < 14; j++)
        for (let i = (j % 2) + 4; i < 12; i += 2) P(bx, c3, X + i, Y - 7 + j, 1, 1);
      P(bx, g3, X + 7, Y - 9, 2, 14);
      P(bx, g1, X + 7, Y - 9, 1, 14);
      P(bx, cyan, X + 7, Y + 2, 2, 1);
      P(bx, ink, X + 5, Y - 13, 6, 4);
      P(bx, c2, X + 6, Y - 12, 4, 2);
      P(bx, c4, X + 6, Y - 12, 4, 1);
    }
    if (it === "codewall") {
      P(bx, "rgba(0,0,0,.2)", X + 5, Y + 14, 23, 2);
      P(bx, "rgba(90,209,230,.16)", X, Y - 16, 32, 19);
      P(bx, ink, X + 14, Y + 1, 4, 12);
      P(bx, c3, X + 15, Y + 1, 1, 12);
      P(bx, ink, X + 8, Y + 12, 16, 3);
      P(bx, c3, X + 9, Y + 12, 14, 1);
      P(bx, ink, X + 1, Y - 15, 30, 17);
      P(bx, c2, X + 2, Y - 14, 28, 15);
      P(bx, c3, X + 2, Y - 14, 28, 1);
      for (let i = 0; i < 6; i++) P(bx, c1, X + 5 + i * 2, Y - 12, 1, 3);
      for (let i = 0; i < 6; i++) P(bx, c1, X + 16 + i * 2, Y - 12, 1, 3);
      P(bx, c1, X + 11, Y - 7, 10, 6);
      P(bx, c3, X + 12, Y - 6, 8, 1);
      P(bx, ink, X + 15, Y - 1, 2, 2);
      P(bx, cyan, X + 26, Y - 2);
    }
    if (it === "whiteboard") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 14, 29, 2);
      [X + 4, X + 27].forEach((lx) => {
        P(bx, g3, lx, Y + 2, 1, 11);
        P(bx, g1, lx + 1, Y + 2, 1, 11);
        P(bx, c2, lx - 2, Y + 12, 6, 2);
        P(bx, ink, lx - 2, Y + 14, 1, 1);
        P(bx, ink, lx + 3, Y + 14, 1, 1);
      });
      P(bx, g3, X + 1, Y - 17, 30, 20);
      P(bx, g1, X + 1, Y - 17, 30, 1);
      P(bx, "#dcdee3", X + 2, Y - 16, 28, 17);
      P(bx, g1, X + 2, Y - 8, 28, 1);
      P(bx, g1, X + 15, Y - 16, 1, 17);
      P(bx, w0, X + 2, Y - 16, 28, 1);
      P(bx, g2, X + 2, Y, 28, 1);
    }
    if (it === "serverrack") {
      P(bx, "rgba(0,0,0,.22)", X + 2, Y + 14, 13, 2);
      P(bx, ink, X + 2, Y - 21, 12, 35);
      P(bx, c1, X + 3, Y - 20, 10, 33);
      P(bx, c4, X + 2, Y - 21, 12, 1);
      // Perforated rear door, patch cables and the power supplies.
      P(bx, c2, X + 4, Y - 19, 8, 30);
      for (let j = 0; j < 24; j += 2)
        for (let i = 0; i < 4; i++) P(bx, ink, X + 5 + i * 2 + ((j >> 1) % 2), Y - 18 + j);
      P(bx, cyan, X + 4, Y - 15, 1, 9);
      P(bx, violet, X + 5, Y - 13, 1, 10);
      P(bx, "#f2c14e", X + 11, Y - 11, 1, 8);
      P(bx, c1, X + 5, Y + 5, 6, 4);
      P(bx, "#4fdc7a", X + 6, Y + 6);
      P(bx, ink, X + 8, Y + 6, 2, 2);
      P(bx, g3, X + 11, Y - 4, 1, 4);
      P(bx, ink, X + 3, Y + 13, 2, 2);
      P(bx, ink, X + 11, Y + 13, 2, 2);
      glint(X + 5, Y + 6);
    }
    if (it === "espresso") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, 30, 2);
      P(bx, g3, X + 1, Y - 5, 30, 20);
      P(bx, oakD, X + 1, Y - 5, 30, 6);
      P(bx, oak, X + 2, Y - 4, 28, 4);
      P(bx, oakL, X + 2, Y - 4, 28, 1);
      P(bx, g1, X + 2, Y + 1, 28, 11);
      P(bx, w1, X + 2, Y + 1, 28, 1);
      P(bx, g2, X + 11, Y + 2, 1, 10);
      P(bx, g2, X + 21, Y + 2, 1, 10);
      P(bx, c2, X + 2, Y + 12, 28, 2);
      // Jar and cups (mirrored), the machine's back with its water tank.
      P(bx, g2, X + 2, Y - 12, 5, 10);
      P(bx, "#dde7ec", X + 3, Y - 11, 3, 8);
      P(bx, "#5e3a20", X + 3, Y - 8, 3, 5);
      P(bx, "#8a5a33", X + 4, Y - 6);
      P(bx, oakD, X + 2, Y - 13, 5, 2);
      P(bx, oak, X + 2, Y - 13, 5, 1);
      P(bx, c3, X + 7, Y - 7, 3, 3);
      P(bx, "#6e4425", X + 7, Y - 7, 3, 1);
      P(bx, g1, X + 9, Y - 2, 5, 1);
      P(bx, w0, X + 10, Y - 5, 3, 3);
      P(bx, ink, X + 15, Y - 18, 13, 15);
      P(bx, "#b8bcc2", X + 16, Y - 17, 11, 13);
      P(bx, "#e4e6ea", X + 16, Y - 17, 11, 1);
      P(bx, g3, X + 26, Y - 16, 1, 12);
      P(bx, "#cfe2ea", X + 18, Y - 15, 6, 9);
      P(bx, "#7cc0d8", X + 18, Y - 11, 6, 5);
      P(bx, "#ffffff", X + 18, Y - 15, 1, 4);
      P(bx, ink, X + 25, Y - 7, 1, 4);
    }
    if (it === "adminneon") {
      P(bx, "rgba(0,0,0,.2)", X + 2, Y + 14, 30, 2);
      P(bx, c1, X + 6, Y + 3, 2, 12);
      P(bx, c1, X + 24, Y + 3, 2, 12);
      P(bx, c3, X + 4, Y + 13, 6, 2);
      P(bx, c3, X + 22, Y + 13, 6, 2);
      // A little light leaks round the edges of the dark back.
      P(bx, "rgba(90,209,230,.22)", X, Y - 16, 32, 21);
      P(bx, "rgba(167,125,224,.16)", X, Y - 7, 32, 10);
      P(bx, ink, X + 1, Y - 15, 30, 19);
      P(bx, "#24262c", X + 2, Y - 14, 28, 17);
      P(bx, c3, X + 2, Y - 14, 28, 1);
      P(bx, c3, X + 13, Y - 10, 6, 4);
      P(bx, ink, X + 8, Y - 5, 16, 1);
      P(bx, ink, X + 23, Y - 5, 1, 8);
    }
    if (it === "studiosofa") {
      const c = SOFA;
      P(bx, "rgba(0,0,0,.18)", X + 1, Y + 14, WW - 2, 2);
      // Cushions peek over the back (mirrored).
      P(bx, cyan, X + 5, Y - 9, 7, 3);
      P(bx, "#9ae6f2", X + 5, Y - 9, 7, 1);
      P(bx, w0, X + WW - 12, Y - 9, 7, 3);
      P(bx, "#ffffff", X + WW - 12, Y - 9, 7, 1);
      P(bx, shade(c, -0.5), X, Y - 6, WW, 17);
      P(bx, shade(c, -0.15), X + 1, Y - 5, WW - 2, 13);
      P(bx, shade(c, 0.25), X + 1, Y - 5, WW - 2, 1);
      P(bx, shade(c, -0.05), X + 1, Y - 4, WW - 2, 3);
      for (let i = 1; i < o.w; i++) P(bx, shade(c, -0.3), X + i * 16, Y - 1, 1, 8);
      P(bx, shade(c, -0.3), X + 1, Y + 8, WW - 2, 3);
      P(bx, ink, X + 3, Y + 11, 1, 4);
      P(bx, ink, X + WW - 4, Y + 11, 1, 4);
      P(bx, ink, X + WW / 2, Y + 11, 1, 3);
    }
    if (it === "techshelf") {
      P(bx, "rgba(0,0,0,.18)", X + 2, Y + 14, 30, 2);
      P(bx, ink, X + 3, Y + 11, 1, 4);
      P(bx, ink, X + 28, Y + 11, 1, 4);
      P(bx, w0, X + 5, Y - 19, 4, 4);
      P(bx, g1, X + 8, Y - 19, 1, 4);
      P(bx, "#3f8e3b", X + 6, Y - 24, 2, 5);
      P(bx, "#3f8e3b", X + 5, Y - 21, 1, 2);
      P(bx, "#3f8e3b", X + 8, Y - 22, 1, 2);
      P(bx, "#5aae51", X + 7, Y - 24, 1, 4);
      panel(X + 1, Y - 16, 30, 28, [g3, "#dcdee3", g1]);
      P(bx, w0, X + 2, Y - 15, 28, 1);
    }
  };

  /** Dorm furniture, by piece id and facing (Thing.rot). */
  const paintFurniture = (o: Thing) => {
    const rot = ROUND_PIECES.has(o.item ?? "") ? 0 : (o.rot ?? 0);
    noFish = Boolean(o.emptyTank);
    if (rot === 1) paintSide(o, true);
    else if (rot === 3) mirror(o.x * TILE, o.w * TILE, () => paintSide(o, false));
    else if (rot === 2) paintBack(o);
    else paintFront(o);
    noFish = false;
  };

  const paintThing = (o: Thing) => {
    const X = o.x * TILE;
    const Y = o.y * TILE;
    const WW = o.w * TILE;
    if (o.t === "furniture") return paintFurniture(o);
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
    if (o.t === "dormdoor") {
      // Front of the dorm block: brick wall, tiled roof (top layer, so people
      // behind it pass under), two windows with flower boxes, a double door
      // on a stone step and a DORMS plaque.
      const cx = X + WW / 2;
      const HH = o.h * TILE;
      P(bx, "rgba(0,0,0,.2)", X + 1, Y + HH - 2, WW - 2, 3);
      P(bx, "#5a3d2a", X + 1, Y - 2, WW - 2, HH + 1);
      P(bx, "#7a5844", X + 2, Y - 1, WW - 4, HH - 1);
      for (let j = 0; j < (HH - 2) / 4; j++) {
        P(bx, "#664637", X + 2, Y + 2 + j * 4, WW - 4, 1);
        for (let i = X + 2 + (j % 2) * 4; i < X + WW - 2; i += 8)
          P(bx, "#664637", i, Y - 1 + j * 4, 1, 3);
      }
      [X + 4, X + WW - 13].forEach((wx) => {
        P(bx, "#f6f1e7", wx, Y + 6, 9, 9);
        P(bx, "#9fd3ef", wx + 1, Y + 7, 7, 7);
        P(bx, "#c4e6f8", wx + 1, Y + 7, 7, 2);
        P(bx, "#f6f1e7", wx + 4, Y + 7, 1, 7);
        P(bx, "#f6f1e7", wx + 1, Y + 10, 7, 1);
        P(bx, "#6e4425", wx, Y + 15, 9, 3);
        P(bx, "#8a5a33", wx, Y + 15, 9, 1);
        [1, 4, 7].forEach((f, n) => {
          P(bx, "#3f8e3b", wx + f, Y + 13, 1, 2);
          P(bx, n % 2 ? "#ffd84d" : "#ff9ec4", wx + f, Y + 13);
        });
      });
      P(bx, "#4e3019", cx - 8, Y + 9, 16, HH - 11);
      P(bx, "#a8744a", cx - 7, Y + 10, 14, HH - 12);
      P(bx, "#c48d5d", cx - 7, Y + 10, 14, 1);
      P(bx, "#6e4425", cx, Y + 10, 1, HH - 12);
      [cx - 6, cx + 2].forEach((dx) => {
        P(bx, "#9fd3ef", dx, Y + 12, 4, 4);
        P(bx, "#c4e6f8", dx, Y + 12, 4, 1);
        P(bx, "#8a5a33", dx, Y + 18, 4, 6);
      });
      P(bx, "#f2c14e", cx - 2, Y + 19, 1, 2);
      P(bx, "#f2c14e", cx + 1, Y + 19, 1, 2);
      P(bx, "#8f949a", cx - 10, Y + HH - 3, 20, 3);
      P(bx, "#b8bcc2", cx - 10, Y + HH - 3, 20, 1);
      // Plaque over the door.
      P(bx, "#4e3019", cx - 12, Y - 1, 24, 9);
      P(bx, "#8a5a33", cx - 11, Y, 22, 7);
      P(bx, "#a8744a", cx - 11, Y, 22, 1);
      label("DORMS", cx, Y + 6, "board");
      // Roof
      P(ox, "#6e2a24", X - 2, Y - 13, WW + 4, 11);
      for (let j = 0; j < 3; j++)
        for (let i = (j % 2) * 2; i < WW + 3; i += 4)
          P(
            ox,
            j % 2 ? "#a8423f" : "#b8524a",
            X - 2 + i,
            Y - 12 + j * 3,
            Math.min(3, WW + 3 - i),
            2,
          );
      P(ox, "#c86a5a", X - 2, Y - 13, WW + 4, 1);
      P(ox, "#4a1c18", X - 2, Y - 3, WW + 4, 1);
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
    // Walk-on pieces (rugs first) go under the rest; dorm furniture is painted
    // top to bottom so lower pieces overlap the ones behind them. Other things
    // keep the order they were added in.
    const layer = (o: Thing) => (o.walk ? (FLOOR_ITEMS.has(o.item ?? "") ? 0 : 1) : 2);
    const row = (o: Thing) => (o.t === "furniture" ? o.y + o.h : -1);
    [...things].sort((a, b) => layer(a) - layer(b) || row(a) - row(b)).forEach(paintThing);
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
      windows,
    };
  };

  return {
    W,
    H,
    rnd,
    pick,
    bx: realBx,
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
    roomTheme,
    decorThing,
    decor,
    afterThings: (fn: () => void) => afterThings.push(fn),
    finish,
  };
}

type Painted = Pick<
  WorldMap,
  "base" | "over" | "solid" | "seats" | "things" | "crops" | "labels" | "sparkles" | "windows"
>;
export type Kit = ReturnType<typeof createKit>;
