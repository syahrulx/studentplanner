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
  },
};
