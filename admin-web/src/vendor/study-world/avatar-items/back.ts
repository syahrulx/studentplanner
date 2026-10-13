import type { CategoryItems, Fill, Painter } from "./types";

/** New back items (see types.ts for how drawing works). */

/**
 * Side items hang on the avatar's right in front view; from behind that side
 * appears on the left, so `m` mirrors an x (of width w) in the back view.
 */
const mirror =
  (p: Painter) =>
  (x: number, w = 1) =>
    p.back ? 24 - x - w : x;
/** One pixel on both sides (wings). */
const both = (p: Painter, x: number, y: number, c: Fill) => {
  p.px(x, y, c);
  p.px(23 - x, y, c);
};
/** One row [x0, x1] on the left and its mirror on the right. */
const wingRow = (p: Painter, y: number, x0: number, x1: number, c: Fill) => {
  p.R(x0, y, x1 - x0 + 1, 1, c);
  p.R(23 - x1, y, x1 - x0 + 1, 1, c);
};
/** Distance from the nearest outer edge of the grid (same on both wings). */
const edge = (x: number) => Math.min(x, 23 - x);
/** "r,g,b" for a bright hue, for screen glows. */
const hueRgb = (h: number) => {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round((0.6 - 0.4 * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return `${f(0)},${f(8)},${f(4)}`;
};
/** A strap running diagonally across the chest/back. */
const sash = (p: Painter, fromX: number, dir: 1 | -1, len: number, c: string) => {
  for (let i = 0; i < len; i++) p.px(fromX + i * dir, 16 + i, c);
};

const BUTTERFLY_UP: [number, number, number][] = [
  [10, 2, 4],
  [11, 1, 5],
  [12, 0, 6],
  [13, 0, 6],
  [14, 0, 6],
  [15, 1, 6],
  [16, 2, 6],
];
const BUTTERFLY_LOW: [number, number, number][] = [
  [17, 3, 6],
  [18, 2, 6],
  [19, 1, 6],
  [20, 1, 5],
  [21, 2, 4],
];
const FAIRY_UP: [number, number, number][] = [
  [6, 1, 2],
  [7, 0, 3],
  [8, 0, 4],
  [9, 0, 4],
  [10, 1, 4],
  [11, 1, 5],
  [12, 2, 5],
  [13, 3, 6],
  [14, 4, 6],
];
const FAIRY_LOW: [number, number, number][] = [
  [16, 3, 6],
  [17, 2, 6],
  [18, 1, 5],
  [19, 1, 4],
  [20, 2, 3],
];
/** Dragon wing columns x -2…6: top and bottom row of each. */
const DRAGON_TOP = [4, 5, 6, 7, 8, 9, 10, 11, 12];
const DRAGON_BOTTOM = [12, 15, 18, 16, 20, 18, 22, 20, 23];
/** Rainbow wing columns x -2…6. */
const RAINBOW_TOP = [12, 10, 9, 9, 10, 11, 12, 13, 14];
const RAINBOW_BOTTOM = [16, 19, 18, 21, 20, 22, 21, 22, 21];

/** Stable pseudo-random number for a pixel (star fields). */
const hash = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

/** Wau bulan wing columns x -2…6: [top, bottom] (left wing; mirrored). */
const WAU_WING: [number, number][] = [
  [5, 8],
  [6, 11],
  [7, 13],
  [8, 14],
  [8, 15],
  [9, 15],
  [9, 16],
  [10, 16],
  [10, 16],
];
/** Crescent-moon tail columns x 2…11: [top, bottom] (left half; mirrored). */
const WAU_TAIL: [number, number][] = [
  [20, 22],
  [21, 24],
  [22, 25],
  [23, 27],
  [24, 28],
  [25, 28],
  [26, 29],
  [26, 29],
  [27, 29],
  [27, 29],
];
/** Flowers painted on each wing: centre x, y (before swaying). */
const WAU_FLOWERS: [number, number][] = [[1, 11]];

/** One bushy fox tail grown from (rx, ry), pointing `base` radians from straight up. */
const foxTail = (p: Painter, rx: number, ry: number, base: number, len: number, ph: number) => {
  const n = Math.ceil(len * 2);
  const wave = Math.sin(p.t / 460 + ph);
  const pts: { x: number; y: number; r: number; u: number }[] = [];
  let x = rx;
  let y = ry;
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    // Out to the side first, then curling up; the tip waves the most.
    const a = base * (1 - 0.6 * u * u) + wave * 0.3 * u;
    const r =
      u < 0.6 ? 0.6 + 1.5 * Math.sin(((u / 0.6) * Math.PI) / 2) : 2.1 - ((u - 0.6) / 0.4) * 0.9;
    pts.push({ x, y, r, u });
    x += Math.sin(a) * 0.5;
    y -= Math.cos(a) * 0.5;
  }
  const x0 = Math.floor(Math.min(...pts.map((q) => q.x - q.r)));
  const x1 = Math.ceil(Math.max(...pts.map((q) => q.x + q.r)));
  const y0 = Math.floor(Math.min(...pts.map((q) => q.y - q.r)));
  const y1 = Math.ceil(Math.max(...pts.map((q) => q.y + q.r)));
  const flick = Math.sin(p.t / 150 + ph * 3) > 0.2;
  for (let Y = y0; Y <= y1; Y++)
    for (let X = x0; X <= x1; X++) {
      const cx = X + 0.5;
      const cy = Y + 0.5;
      // Signed distance to the tail's edge (negative inside).
      let sd = Infinity;
      let bp = pts[0];
      pts.forEach((q) => {
        const d = Math.hypot(cx - q.x, cy - q.y) - q.r;
        if (d < sd) {
          sd = d;
          bp = q;
        }
      });
      if (sd > 0) continue;
      const rim = sd > -0.7;
      const low = cy > bp.y + 0.3;
      let c: string;
      if (bp.u > 0.86) c = rim ? "#7fe3ff" : flick ? "#ffffff" : "#d4fbff";
      else if (bp.u > 0.7) c = rim ? "#ecd2aa" : "#fff3de";
      else if (rim) c = "#c4621f";
      else c = low ? "#f08a36" : sd < -1.2 ? "#ffc477" : "#ffa64d";
      p.px(X, Y, c);
    }
};

/** The nine fox tails: angle from straight up (radians) and length. */
const FOX_ANGLE = [-1.95, -1.5, -1.05, -0.6, 0, 0.6, 1.05, 1.5, 1.95];
const FOX_LEN = [13, 15, 17, 18, 15, 18, 17, 15, 13];

/** Is the pixel centre (x, y) inside triangle a-b-c? */
const inTri = (
  x: number,
  y: number,
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
) => {
  const s = (p: readonly [number, number], q: readonly [number, number]) =>
    (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const d1 = s(a, b);
  const d2 = s(b, c);
  const d3 = s(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
/** Which side of the line a→b the point is on (sign only). */
const sideOf = (x: number, y: number, a: readonly [number, number], b: readonly [number, number]) =>
  (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);

/** A floating gem (3 wide, 5 tall) with its top centre at (cx, y). */
const crystal = (p: Painter, cx: number, y: number) => {
  // The gem pulses brighter, as if it is breathing light.
  const bright = Math.sin(p.t / 260) > 0.3;
  p.px(cx, y, "#ffffff");
  p.R(cx - 1, y + 1, 1, 4, bright ? "#f0feff" : "#bff8ff");
  p.R(cx, y + 1, 1, 4, bright ? "#8ff6ff" : "#5fe3f5");
  p.R(cx + 1, y + 1, 1, 4, bright ? "#3fb8e6" : "#2c9ccf");
  p.px(cx, y + 3, bright ? "#5fe3f5" : "#3fb8e6");
  p.px(cx, y + 5, "#1f78b0");
  if (bright) p.px(cx - 1, y + 1, "#ffffff");
  // Sparkles circling the gem, twinkling in turn.
  for (let i = 0; i < 3; i++) {
    const a = p.t / 520 + (i * Math.PI * 2) / 3;
    if (Math.sin(p.t / 170 + i * 1.9) < 0) continue;
    p.px(
      cx + Math.round(Math.cos(a) * 3),
      y + 3 + Math.round(Math.sin(a) * 3),
      i ? "#bff8ff" : "#ffffff",
    );
  }
};

/** A little star: a white centre, plus soft arms when `big`. */
const sparkle = (p: Painter, x: number, y: number, big: boolean, c: string) => {
  if (big) {
    p.px(x - 1, y, c);
    p.px(x + 1, y, c);
    p.px(x, y - 1, c);
    p.px(x, y + 1, c);
  }
  p.px(x, y, big ? "#ffffff" : c);
};

export const BACK: CategoryItems = {
  items: [
    { id: "tote", name: "Tote bag", tier: "free" },
    { id: "umbrella", name: "Umbrella", tier: "free" },
    { id: "bookbag", name: "Book bag", tier: "free" },
    { id: "skateboard", name: "Skateboard", tier: "coins", price: 80 },
    { id: "violin", name: "Violin", tier: "coins", price: 90 },
    { id: "butterfly", name: "Butterfly wings", tier: "plus" },
    { id: "jetpack", name: "Jetpack", tier: "plus" },
    { id: "fairy", name: "Fairy wings", tier: "plus" },
    { id: "dragonwings", name: "Dragon wings", tier: "pro" },
    { id: "rainbowwings", name: "Rainbow wings", tier: "pro" },
    { id: "paperwings", name: "Paper Plane Wings", tier: "coins", price: 320 },
    { id: "waukite", name: "Wau Kite Wings", tier: "coins", price: 380 },
    { id: "crystalstaff", name: "Crystal Staff", tier: "coins", price: 420 },
    { id: "foxtails", name: "Spirit Fox Tails", tier: "coins", price: 550 },
    { id: "cosmiccape", name: "Cosmic Cape", tier: "coins", price: 600 },
  ],
  draw: {
    tote: {
      behind: (p) => {
        const m = mirror(p);
        const bag = "#efe3c8";
        const bagS = "#d6c7a5";
        const strap = "#b0835a";
        p.R(m(21), 17, 1, 2, strap);
        p.R(m(18, 5), 19, 5, 6, bag);
        p.R(m(18, 5), 24, 5, 1, bagS);
        p.R(m(22), 19, 1, 5, bagS);
        // A little printed heart.
        p.px(m(19), 21, "#e2574c");
        p.px(m(21), 21, "#e2574c");
        p.R(m(19, 3), 22, 3, 1, "#e2574c");
        p.px(m(20), 23, "#e2574c");
        if (p.back) sash(p, 9, -1, 4, strap);
      },
      front: (p) => sash(p, 14, 1, 4, "#b0835a"),
    },
    umbrella: {
      behind: (p) => {
        const m = mirror(p);
        const wood = "#8a5530";
        // Hooked handle and shaft.
        p.R(m(1, 3), 10, 3, 1, wood);
        p.R(m(1), 11, 1, 2, wood);
        p.R(m(3), 11, 1, 4, wood);
        // Folded canopy with a strap, tapering to a metal tip.
        p.px(m(3), 15, "#2f63ad");
        p.R(m(2, 3), 16, 3, 8, "#3d7fd6");
        p.R(m(p.back ? 4 : 2), 16, 1, 8, "#5b93e6");
        p.R(m(p.back ? 2 : 4), 16, 1, 8, "#2f63ad");
        p.R(m(2, 3), 19, 3, 1, "#f2c14e");
        p.R(m(3), 24, 1, 2, "#3d7fd6");
        p.px(m(3), 26, "#c3cad3");
        if (p.back) sash(p, 8, 1, 7, "#2f3a4a");
      },
      front: (p) => sash(p, 15, -1, 7, "#2f3a4a"),
    },
    bookbag: {
      behind: (p) => {
        const m = mirror(p);
        const lea = "#a0612f";
        const leaD = "#7d4622";
        // Books peeking out of the top.
        p.R(m(2), 17, 1, 3, "#e24b4a");
        p.R(m(3), 18, 1, 2, "#3d7fd6");
        p.px(m(3), 18, "#f4f1ea");
        p.R(m(4), 17, 1, 3, "#3fae8f");
        // Satchel with a flap and a gold buckle.
        p.R(m(1, 6), 20, 6, 6, lea);
        p.R(m(1, 6), 20, 6, 3, leaD);
        p.px(m(1), 21, "#c07a42");
        p.px(m(3), 22, p.gold);
        p.R(m(1, 6), 25, 6, 1, leaD);
        if (p.back) sash(p, 8, 1, 8, leaD);
      },
      front: (p) => sash(p, 15, -1, 8, "#7d4622"),
    },
    skateboard: {
      behind: (p) => {
        const deck = "#3fae8f";
        const stripe = "#f2c14e";
        const wheel = "#ffd84d";
        const truck = "#c3cad3";
        if (p.back) {
          // Strapped flat to the back: underside graphic and four wheels.
          p.R(10, 12, 4, 16, deck);
          p.R(11, 28, 2, 1, deck);
          p.R(10, 13, 1, 15, p.shade(deck, 0.2));
          p.px(11, 21, stripe);
          p.px(12, 21, "#e2574c");
          [17, 25].forEach((y) => {
            p.R(10, y, 4, 1, truck);
            p.R(9, y - 1, 1, 2, wheel);
            p.R(14, y - 1, 1, 2, wheel);
          });
          p.R(8, 19, 8, 1, "#2f3a4a");
          p.R(8, 23, 8, 1, "#2f3a4a");
          return;
        }
        // Standing up behind the right shoulder.
        p.px(20, 10, deck);
        p.R(19, 11, 3, 17, deck);
        p.px(20, 28, deck);
        p.R(21, 11, 1, 17, p.shade(deck, -0.2));
        p.R(19, 14, 3, 1, stripe);
        p.R(19, 24, 3, 1, stripe);
        p.px(20, 19, "#ffffff");
        p.R(22, 12, 1, 2, wheel);
        p.R(22, 25, 1, 2, wheel);
      },
      front: (p) => {
        p.R(8, 16, 1, 5, "#2f3a4a");
        p.R(15, 16, 1, 5, "#2f3a4a");
        p.px(8, 18, "#c3cad3");
        p.px(15, 18, "#c3cad3");
      },
    },
    violin: {
      behind: (p) => {
        const m = mirror(p);
        const c = "#5a2433";
        const cL = "#7a3346";
        const cD = "#3e1822";
        // Violin-shaped case: narrow neck end, upper bout, waist, lower bout.
        p.R(m(2, 2), 10, 2, 6, c);
        p.R(m(1, 4), 16, 4, 4, c);
        p.R(m(1, 3), 20, 3, 1, c);
        p.R(m(0, 5), 21, 5, 5, c);
        p.R(m(1, 3), 26, 3, 1, cD);
        p.R(m(p.back ? 3 : 2), 11, 1, 4, cL);
        p.R(m(p.back ? 4 : 1), 17, 1, 2, cL);
        p.R(m(p.back ? 4 : 0), 22, 1, 3, cL);
        // Zip line, gold clasps and a carry handle.
        p.R(m(2), 16, 1, 9, "#c9a77a");
        p.px(m(2), 18, p.gold);
        p.px(m(2), 23, p.gold);
        p.px(m(4), 23, "#2a1b18");
        p.px(m(3), 21, "#ffffff");
        if (p.back) sash(p, 8, 1, 8, cD);
      },
      front: (p) => sash(p, 15, -1, 8, "#3e1822"),
    },
    butterfly: {
      animated: true,
      behind: (p) => {
        // Gentle flap: the outer edge folds in now and then.
        const f = Math.sin(p.t / 260) > 0.3 ? 1 : 0;
        const upper: Fill = (x) => {
          const d = edge(x);
          return d <= 1 ? "#ff4f9a" : d <= 3 ? "#ff9b3d" : "#ffd84d";
        };
        const lower: Fill = (x) => (edge(x) <= 2 ? "#7b6cff" : "#4fc3ff");
        BUTTERFLY_UP.forEach(([y, a, b]) => wingRow(p, y + f, a + f, b, upper));
        BUTTERFLY_LOW.forEach(([y, a, b]) => wingRow(p, y, a + f, b, lower));
        both(p, 1 + f, 12 + f, "#ffffff");
        both(p, 2 + f, 14 + f, "#ffffff");
        both(p, 3, 19, "#ffd84d");
        if (Math.sin(p.t / 180) > 0.6) both(p, 3, 12 + f, "#fff6c8");
        if (p.back) {
          wingRow(p, 16, 7, 9, upper);
          wingRow(p, 17, 7, 8, upper);
          wingRow(p, 18, 7, 8, lower);
          wingRow(p, 19, 7, 9, lower);
        }
      },
    },
    jetpack: {
      animated: true,
      behind: (p) => {
        const steel = "#c3cad3";
        const steelD = "#8a94a0";
        const blink = Math.floor(p.t / 250) % 2;
        if (p.back) {
          p.R(5, 15, 14, 9, steel);
          p.R(5, 15, 14, 1, "#e9edf2");
          p.R(9, 17, 6, 5, steelD);
          p.px(10, 18, blink ? "#00e5ff" : "#ff3d6e");
          p.px(13, 18, blink ? "#ff3d6e" : "#00e5ff");
          p.R(10, 20, 4, 1, "#4a5260");
        } else p.R(2, 15, 20, 1, steelD);
        // Twin thrusters with nozzles and fins.
        [2, 19].forEach((x) => {
          p.R(x, 13, 3, 1, steel);
          p.R(x, 14, 3, 11, "#e24b4a");
          p.R(x, 14, 1, 11, "#ff7a74");
          p.R(x + 2, 14, 1, 11, "#a3202a");
          p.R(x, 18, 3, 1, steel);
          p.px(x + 1, 16, blink ? "#00e5ff" : "#8ff6ff");
          p.R(x, 25, 3, 1, "#4a5260");
          p.px(x + 1, 26, "#4a5260");
          p.px(x === 2 ? 1 : 22, 23, steel);
          p.px(x === 2 ? 1 : 22, 24, steel);
        });
      },
      front: (p) => {
        p.R(8, 16, 1, 7, "#2f3a4a");
        p.R(15, 16, 1, 7, "#2f3a4a");
        p.R(8, 19, 8, 1, "#2f3a4a");
        p.R(11, 19, 2, 1, "#c3cad3");
      },
      fxBehind: (c, k) => {
        const s = k.s;
        const flick = Math.floor(k.t / 80) % 3;
        [2, 19].forEach((x) => {
          k.glow(k.X(x + 1.5), k.Y(28), 4 * s, "255,150,60", 0.4);
          c.fillStyle = "#e24b4a";
          c.fillRect(k.X(x), k.Y(27), 3 * s, (2 + flick) * s);
          c.fillStyle = "#ff9b3d";
          c.fillRect(k.X(x), k.Y(27), 3 * s, (1 + flick) * s);
          c.fillStyle = "#ffd84d";
          c.fillRect(k.X(x + 1), k.Y(27), s, (1 + (flick % 2)) * s);
          c.fillStyle = "#ffffff";
          c.fillRect(k.X(x + 1), k.Y(27), s, s);
        });
      },
    },
    fairy: {
      animated: true,
      behind: (p) => {
        // Quick flutter: the upper wings lift and narrow.
        const f = Math.floor(p.t / 140) % 2;
        const fill: Fill = (x, y) => ((x + y) % 3 === 0 ? "#cfe6ff" : "#eef8ff");
        FAIRY_UP.forEach(([y, a, b]) => wingRow(p, y - f, a + f, b, fill));
        FAIRY_UP.forEach(([y, a]) => both(p, a + f, y - f, "#d9c8ff"));
        FAIRY_LOW.forEach(([y, a, b]) => wingRow(p, y, a, b, "#f3e8ff"));
        FAIRY_LOW.forEach(([y, a]) => both(p, a, y, "#e2d0ff"));
        // Twinkling sparkle pixels.
        (
          [
            [1, 8 - f],
            [3, 11 - f],
            [2, 18],
            [2, 7 - f],
          ] as const
        ).forEach(([x, y], i) => {
          if (Math.sin(p.t / 170 + i * 2.1) > 0.35) both(p, x + (y < 16 ? f : 0), y, "#ffffff");
        });
        if (p.back) {
          wingRow(p, 15, 7, 8, "#eef8ff");
          wingRow(p, 16, 7, 8, "#f3e8ff");
          wingRow(p, 17, 7, 7, "#f3e8ff");
        }
      },
      fxFront: (_c, k) => {
        const size = Math.max(1, k.s / 2);
        k.particles(6, 2000, (i, ph) => {
          const x = i % 2 ? k.X(21 - (i % 3)) : k.X(2 + (i % 3));
          const y = k.Y(8 + ph * 16);
          k.star(x, y, size, i % 3 ? "#fff6c8" : "#e2d0ff", Math.sin(ph * Math.PI));
        });
      },
    },
    dragonwings: {
      animated: true,
      behind: (p) => {
        const mem = "#7a1f2e";
        const memL = "#9a2a3a";
        const bone = "#3a1418";
        const boneL = "#55202a";
        const glowC = Math.sin(p.t / 300) > 0 ? "#ff8a3d" : "#ffc04d";
        const lift = Math.sin(p.t / 480);
        for (let i = 0; i < DRAGON_TOP.length; i++) {
          const x = i - 2;
          const dy = Math.round((lift * (6 - x)) / 4);
          const top = DRAGON_TOP[i] - dy;
          const bot = DRAGON_BOTTOM[i] - dy;
          for (let y = top; y <= bot; y++) {
            let col = y - top < 3 ? memL : mem;
            if (x === 0 || x === 2 || x === 4) col = boneL;
            if (y === top) col = bone;
            if (y === bot) col = glowC;
            both(p, x, y, col);
          }
          if (x === -2) both(p, x, top - 1, "#f4f1ea");
        }
        if (p.back) {
          p.R(6, 15, 3, 6, mem);
          p.R(15, 15, 3, 6, mem);
          p.R(7, 15, 1, 6, bone);
          p.R(16, 15, 1, 6, bone);
        }
      },
      fxBehind: (_c, k) => {
        const a = 0.2 + Math.sin(k.t / 300) * 0.08;
        k.glow(k.X(1), k.Y(15), 9 * k.s, "255,110,50", a);
        k.glow(k.X(23), k.Y(15), 9 * k.s, "255,110,50", a);
      },
    },
    rainbowwings: {
      animated: true,
      behind: (p) => {
        const t = p.t;
        const lift = Math.sin(t / 260);
        const hue = (x: number, y: number) => (t / 6 + edge(x) * 8 + y * 22) % 360;
        for (let i = 0; i < RAINBOW_TOP.length; i++) {
          const x = i - 2;
          const dy = Math.round((lift * (6 - x)) / 4);
          const top = RAINBOW_TOP[i] - dy;
          const bot = RAINBOW_BOTTOM[i] - dy;
          for (let y = top; y <= bot; y++) {
            // Soft coverts at the top, longer feathers with separations below.
            const light = y === top ? 86 : y - top < 3 ? 78 : x % 2 === 0 ? 62 : 70;
            both(p, x, y, p.hsl(hue(x, y + dy), 82, light));
          }
          if ((x * 7 + Math.floor(t / 150)) % 9 === 0)
            both(p, x, top + 2 + ((x * 5 + 8) % 4), "#ffffff");
        }
        if (p.back) {
          const root: Fill = (x, y) => p.hsl(hue(x, y), 88, 74);
          p.R(6, 15, 3, 6, root);
          p.R(15, 15, 3, 6, root);
        }
      },
      fxBehind: (_c, k) => {
        const h = (k.t / 6) % 360;
        k.glow(k.X(1), k.Y(15), 9 * k.s, hueRgb(h), 0.2);
        k.glow(k.X(23), k.Y(15), 9 * k.s, hueRgb(h + 120), 0.2);
      },
      fxFront: (_c, k) => {
        const size = Math.max(1, k.s / 2);
        k.particles(6, 2200, (i, ph) => {
          const x = i % 2 ? k.X(23 - (i % 3) * 2) : k.X((i % 3) * 2);
          const y = k.Y(9 + ph * 14);
          const col = `hsl(${Math.round((k.t / 6 + i * 60) % 360)},90%,75%)`;
          k.star(x, y, size, col, Math.sin(ph * Math.PI));
        });
      },
    },
    paperwings: {
      animated: true,
      behind: (p) => {
        // Folded from lined notebook paper; the tips rise and fall slowly.
        const lift = Math.round(Math.sin(p.t / 700) * 2);
        const tip: [number, number] = [-2.5, 8.5 - lift];
        const outer: [number, number] = [-1.5, 13.5 - lift];
        const top: [number, number] = [8, 12];
        const bottom: [number, number] = [8, 22.5];
        const crease: [number, number] = [8, 16.5];
        const keel: [number, number] = [8, 20.5];
        for (let y = 4; y <= 22; y++)
          for (let x = -2; x <= 7; x++) {
            const cx = x + 0.5;
            const cy = y + 0.5;
            if (!inTri(cx, cy, top, tip, bottom) && !inTri(cx, cy, tip, outer, bottom)) continue;
            const above = sideOf(cx, cy, tip, crease);
            let c: string;
            if (Math.abs(above) < 5) c = "#a9b8cc";
            else if (above < 0) c = x === 4 ? "#f3b0b0" : y % 2 ? "#fbfcff" : "#d3e2f6";
            else c = sideOf(cx, cy, outer, keel) > 0 ? "#c4cfdd" : "#e8edf5";
            both(p, x, y, c);
          }
        if (p.back) {
          // Paper clips holding the wings on.
          both(p, 8, 15, "#c3cad3");
          both(p, 8, 16, "#8a94a0");
          both(p, 8, 17, "#c3cad3");
        }
      },
    },
    waukite: {
      animated: true,
      behind: (p) => {
        const red = "#d8343c";
        const redD = "#a8222c";
        const gold = "#f2c14e";
        const bamboo = "#d8b06a";
        // The kite rocks in the wind: one wing lifts as the other dips.
        const sway = Math.sin(p.t / 650);
        // A painted flower on each wing, and a blue stripe along the feathers.
        const motif = (x: number, y: number, bot: number) => {
          for (const [fx, fy] of WAU_FLOWERS) {
            if (x === fx && y === fy) return "#ffd84d";
            if (Math.abs(x - fx) + Math.abs(y - fy) === 1) return "#fff3dc";
          }
          return y === bot - 1 && x > 2 ? "#4f86e8" : null;
        };
        [1, -1].forEach((side) => {
          WAU_WING.forEach(([top, bot], i) => {
            const x = i - 2;
            const dy = Math.round((sway * side * (6 - x)) / 5);
            const X = side === 1 ? x : 23 - x;
            for (let y = top; y <= bot; y++) {
              const c =
                y === top
                  ? gold
                  : y === bot
                    ? redD
                    : y === bot - 1
                      ? "#2f5fc4"
                      : (motif(x, y, top) ?? red);
              p.px(X, y - dy, c);
            }
            // Ribbon tassel fluttering under the wing tip.
            if (x === -1) {
              const flap = Math.floor(p.t / 240 + (side > 0 ? 0 : 1)) % 2;
              p.px(X, bot + 1 - dy, "#ff4f9a");
              p.px(X - side * flap, bot + 2 - dy, gold);
            }
          });
        });
        // Crescent-moon tail, swinging a little as the wings rock.
        const tx = Math.round(sway * 0.9);
        WAU_TAIL.forEach(([top, bot], i) => {
          const x = i + 2;
          for (let y = top; y <= bot; y++) {
            const c =
              y === top ? gold : y === bot ? redD : x === 11 && y === top + 1 ? "#ffd84d" : red;
            p.px(x + tx, y, c);
            p.px(23 - x + tx, y, c);
          }
        });
        if (p.back) {
          // The bamboo frame: a spar across the shoulders and the spine.
          wingRow(p, 11, 7, 8, gold);
          wingRow(p, 12, 7, 8, red);
          wingRow(p, 13, 7, 8, red);
          wingRow(p, 14, 7, 8, redD);
          p.R(7, 16, 10, 1, bamboo);
          p.R(11, 16, 2, 11, bamboo);
          p.R(12, 17, 1, 10, "#b08a4a");
          p.R(11, 16, 2, 1, "#8a5530");
          p.R(11, 21, 2, 1, "#b08a4a");
        }
      },
    },
    crystalstaff: {
      animated: true,
      behind: (p) => {
        const wood = "#7a4a2a";
        const woodL = "#a26a3c";
        const bob = Math.round(Math.sin(p.t / 420));
        if (p.back) {
          // Strapped across the back, the gem over the right shoulder.
          sash(p, 8, 1, 8, "#3a2a4a");
          for (let y = 10; y <= 28; y++) {
            const x = Math.round(20.5 - (y - 10) * 0.55);
            const wrap = y === 13 || y === 14;
            p.px(x, y, wrap ? "#5b8ff0" : y === 28 ? "#c3cad3" : woodL);
            p.px(x + 1, y, wrap ? "#3d6fd0" : y === 28 ? "#8a94a0" : wood);
          }
          p.px(20, 8, p.gold);
          p.px(22, 8, p.gold);
          p.R(20, 9, 3, 1, p.gold);
          crystal(p, 21, bob - 1);
          return;
        }
        for (let y = 10; y <= 29; y++) {
          const x = 2 + Math.floor((y - 10) / 4);
          const wrap = y === 12 || y === 13;
          p.px(x, y, wrap ? "#3d6fd0" : y === 29 ? "#c3cad3" : y % 4 === 1 ? woodL : wood);
        }
        p.px(1, 8, p.gold);
        p.px(3, 8, p.gold);
        p.R(1, 9, 3, 1, p.gold);
        crystal(p, 2, bob - 1);
      },
      front: (p) => sash(p, 15, -1, 7, "#3a2a4a"),
    },
    foxtails: {
      animated: true,
      behind: (p) => {
        // Nine tails fanning out, outer ones first so the middle sits on top.
        const lean = p.fx && !p.back ? -0.14 : 0;
        const rx = 12 - (p.back ? 0 : p.fx * 0.5);
        [0, 8, 1, 7, 2, 6, 3, 5, 4].forEach((i) =>
          foxTail(p, rx, 23, FOX_ANGLE[i] + lean, FOX_LEN[i], i * 0.7),
        );
      },
      fxBehind: (_c, k) => {
        const a = 0.16 + Math.sin(k.t / 380) * 0.06;
        k.glow(k.X(12), k.Y(17), 12 * k.s, "255,170,90", a * 0.8);
        k.glow(k.X(1), k.Y(15), 6 * k.s, "150,235,255", a);
        k.glow(k.X(23), k.Y(15), 6 * k.s, "150,235,255", a);
      },
      fxFront: (_c, k) => {
        // Fox-fire wisps drifting up from the tail tips.
        const size = Math.max(1, k.s / 2);
        k.particles(4, 2600, (i, ph) => {
          const x =
            i % 2
              ? k.X(22 - (i % 3) + Math.sin(ph * 6) * 0.8)
              : k.X(2 + (i % 3) - Math.sin(ph * 6) * 0.8);
          const y = k.Y(16 - ph * 12);
          k.glow(x, y, 2 * k.s, "150,235,255", 0.35 * Math.sin(ph * Math.PI));
          k.star(x, y, size, "#d4fbff", Math.sin(ph * Math.PI));
        });
      },
    },
    cosmiccape: {
      animated: true,
      behind: (p) => {
        const t = p.t;
        const walking = p.frame !== 1;
        // Three-quarter view: the cape streams out behind (to the left).
        const trail = p.fx > 0 && !p.back;
        const base = (y: number) =>
          y <= 15 ? 6 : y === 16 ? 5 : y < 20 ? 4 : y >= 24 && walking ? 2 : 3;
        const left = (y: number) =>
          base(y) -
          (trail && y > 18
            ? Math.max(
                0,
                Math.round((y - 18) * (walking ? 0.3 : 0.16) + Math.sin(t / 260 + y * 0.5) * 0.6),
              )
            : 0);
        const right = (y: number) => 23 - base(y);
        const hem = (x: number) =>
          Math.min(
            31,
            29 +
              Math.round(Math.sin(t / 280 + x * 0.55) * (walking ? 1.2 : 0.7)) -
              (trail && x < 6 ? Math.round((6 - x) * (walking ? 0.5 : 0.25)) : 0),
          );
        const inside = (x: number, y: number) =>
          y >= 15 && y <= hem(x) && x >= left(y) && x <= right(y);
        // Starfield lining: stars drift slowly and twinkle over a shifting nebula.
        const space = (x: number, y: number) => {
          const h = hash(x + Math.floor(t / 900), y + Math.floor(t / 1400));
          if (h % 13 === 0) {
            const tw = Math.sin(t / 230 + (h % 97));
            return tw > 0.5 ? "#ffffff" : tw > -0.3 ? "#fff6c8" : "#8f86d6";
          }
          const n =
            Math.sin(x * 0.55 + y * 0.35 + t / 1800) + Math.sin(y * 0.5 - x * 0.25 - t / 2600);
          return n > 1.1 ? "#4a2a8f" : n > 0.2 ? "#2d2275" : n > -0.9 ? "#1f1a5c" : "#161447";
        };
        for (let y = 15; y <= 31; y++)
          for (let x = left(y); x <= right(y); x++) {
            if (y > hem(x)) continue;
            let c: string;
            if (y === hem(x)) c = "#e9c46a";
            else if (y <= 16) c = "#2a1f6e";
            else if (x === left(y) || x === right(y)) c = "#3b2a8a";
            else c = space(x, y);
            p.px(x, y, c);
          }
        // Now and then a shooting star streaks across.
        const sh = (t % 2600) / 520;
        if (sh < 1) {
          const hx = Math.round(6 + sh * 11);
          const hy = Math.round(18 + sh * 7);
          (
            [
              [0, 0, "#ffffff"],
              [-1, -1, "#d9d2ff"],
              [-2, -1, "#a99cff"],
            ] as const
          ).forEach(([dx, dy, c]) => {
            if (inside(hx + dx, hy + dy) && hy + dy < hem(hx + dx)) p.px(hx + dx, hy + dy, c);
          });
        }
        // A short sparkle trail while walking.
        if (walking)
          for (let i = 0; i < 3; i++) {
            const age = (p.frame + i) % 3;
            const c = age === 1 ? "#fff6c8" : "#a99cff";
            if (trail) sparkle(p, 1 - age - i, 22 + i * 3 + age, age === 0, c);
            else if (p.back) sparkle(p, 7 + i * 4 + age, 31 - (age % 2), age === 0, c);
            else {
              sparkle(p, 1 - (age % 2), 31 - i * 3 - age, age === 0, c);
              sparkle(p, 22 + (age % 2), 30 - i * 3 - age, age === 0, c);
            }
          }
      },
      front: (p) => {
        // Star brooches pinning the cape at the shoulders.
        p.px(8, 16, "#ffd84d");
        p.px(15, 16, "#ffd84d");
      },
      fxBehind: (_c, k) => {
        k.glow(k.X(12), k.Y(23), 12 * k.s, "120,90,255", 0.16 + Math.sin(k.t / 420) * 0.05);
      },
    },
  },
};
