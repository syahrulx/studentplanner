import type { CategoryItems, Fill, Painter } from "./types";

/** The colour of a fill at one pixel (hair fills can be functions for dyes). */
const at = (f: Fill, x: number, y: number): string =>
  typeof f === "function" ? f(x, y) : (f ?? "#2a1b18");

/** Mirror x when seen from behind, so one-sided details swap sides. */
const mx = (p: Painter, x: number, w = 1) => (p.back ? 24 - x - w : x);

/** Rows of [y, firstX, lastX] filled with one fill. */
const rows = (p: Painter, list: number[][], c: Fill) =>
  list.forEach(([y, x0, x1]) => p.R(x0, y, x1 - x0 + 1, 1, c));

/** Inner cap (ciput) colour: cream on dark fabric, a deeper tone on light fabric. */
const ciputColour = (p: Painter) => {
  const c = p.hc;
  if (typeof c !== "string" || c[0] !== "#") return "#f1e6d6";
  const n = parseInt(c.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum < 0.55 ? "#f1e6d6" : p.shade(c, -0.4);
};

/** Outer shape of the hijab: [y, firstX, lastX]. Head part, then the cape. */
const HIJAB_SHAPE = [
  [-1, 8, 15],
  [0, 6, 17],
  [1, 5, 18],
  [2, 4, 19],
  ...Array.from({ length: 14 }, (_, i) => [3 + i, 3, 20]),
  [17, 2, 21],
  [18, 2, 21],
  [19, 2, 21],
  [20, 3, 20],
  [21, 5, 18],
];
/** Oval face opening and the ciput band above it, facing front / three-quarter. */
const FACE_FRONT = [
  [6, 6, 17],
  ...Array.from({ length: 6 }, (_, i) => [7 + i, 5, 18]),
  [13, 6, 17],
  [14, 7, 16],
];
const FACE_SIDE = [
  [6, 8, 18],
  ...Array.from({ length: 6 }, (_, i) => [7 + i, 7, 18]),
  [13, 8, 18],
  [14, 9, 17],
];
const CIPUT_FRONT = [
  [4, 7, 16],
  [5, 6, 17],
];
const CIPUT_SIDE = [
  [4, 9, 17],
  [5, 8, 18],
];

/**
 * Hijab (tudung) in the hair colour: an inner cap band across the forehead,
 * an oval face opening with a fold line round it, a pinned V under the chin,
 * and a soft cape over the shoulders and chest (the same cape from behind).
 * `fabric` is the fill for the cloth (plain, patterned or shimmering);
 * `pin` adds a small silver pin at the V (brooch hijabs draw their own).
 */
const hijab = (p: Painter, fabric: Fill, pin = true) => {
  const { px, R, hS, hH, fx } = p;
  const face = p.back ? [] : fx ? FACE_SIDE : FACE_FRONT;
  const ciput = p.back ? [] : fx ? CIPUT_SIDE : CIPUT_FRONT;
  const inner = [...face, ...ciput];
  const inside = (x: number, y: number) => inner.some(([yy, a, b]) => yy === y && x >= a && x <= b);

  HIJAB_SHAPE.forEach(([y, a, b]) => {
    for (let x = a; x <= b; x++) if (!inside(x, y)) px(x, y, fabric);
  });
  rows(p, ciput, ciputColour(p));

  // Fold line just outside the face opening and ciput.
  if (!p.back)
    for (let y = 3; y <= 15; y++)
      for (let x = 2; x <= 21; x++)
        if (
          !inside(x, y) &&
          (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1))
        )
          px(x, y, hS);

  // Light on the crown, shade down the right and along the hem.
  R(9, -1, 3, 1, hH);
  R(6, 0, 3, 1, hH);
  px(5, 1, hH);
  R(20, 3, 1, 14, hS);
  R(21, 17, 1, 3, hS);
  px(20, 20, hS);
  R(5, 21, 14, 1, hS);
  px(3, 17, hH);
  px(3, 18, hH);
  // Diagonal folds from the shoulders.
  [
    [4, 17],
    [5, 18],
    [6, 19],
    [7, 20],
    [19, 17],
    [18, 18],
    [17, 19],
    [16, 20],
  ].forEach(([x, y]) => px(x, y, hS));

  if (p.back) {
    // Gathered fold down the middle of the back.
    [
      [12, 16],
      [12, 17],
      [11, 18],
      [11, 19],
      [12, 20],
    ].forEach(([x, y]) => px(x, y, hS));
    return;
  }
  // Pinned V under the chin, with a fold falling from its point.
  const cx = 11 + fx;
  [
    [cx - 2, 16],
    [cx - 1, 17],
    [cx + 3, 16],
    [cx + 2, 17],
    [cx, 18],
    [cx + 1, 18],
    [cx, 19],
    [cx + 1, 20],
  ].forEach(([x, y]) => px(x, y, hS));
  if (pin) {
    px(cx, 17, "#e9edf2");
    px(cx + 1, 17, "#c3cad3");
  }
};

/** Small repeating flowers over the hair colour. */
const floral =
  (p: Painter): Fill =>
  (x, y) => {
    const centre = (cx: number, cy: number) => {
      const yy = cy + 10;
      return yy % 5 === 2 && (cx + 3 * (Math.floor(yy / 5) % 2) + 60) % 6 === 2;
    };
    if (centre(x, y)) return "#ffd84d";
    if (centre(x - 1, y) || centre(x + 1, y) || centre(x, y - 1) || centre(x, y + 1))
      return "#ffc2d6";
    return at(p.hc, x, y);
  };

/** Satin fabric with a soft light band sliding across it. */
const silk =
  (p: Painter): Fill =>
  (x, y) => {
    const base = at(p.hc, x, y);
    const pos = ((p.t / 28) % 55) - 6;
    const d = Math.abs(x + y * 0.5 - pos);
    const hex = base[0] === "#";
    if (d < 1) return hex ? p.shade(base, 0.45) : "#ffffff";
    if (d < 2.2) return hex ? p.shade(base, 0.2) : base;
    return base;
  };

/** Flower with four petals around a centre. */
const flower = (p: Painter, x: number, y: number, petal: string, mid: string) => {
  p.px(x, y - 1, petal);
  p.px(x - 1, y, petal);
  p.px(x + 1, y, petal);
  p.px(x, y + 1, p.shade(petal, -0.15));
  p.px(x, y, mid);
};

/** Four-point star; `lit` makes it flash white. */
const bigStar = (p: Painter, lit: boolean) => {
  const c = "#ffd84d";
  p.R(11, -5, 2, 4, c);
  p.R(10, -4, 4, 2, c);
  p.R(11, -4, 2, 2, lit ? "#ffffff" : "#fff6c8");
  if (lit) {
    p.px(11, -5, "#ffffff");
    p.px(10, -4, "#ffffff");
  }
};

/** "r,g,b" of a bright colour at hue h (for glows that follow an LED). */
const hueRgb = (h: number) => {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (0.62 - 0.38 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `${f(0)},${f(8)},${f(4)}`;
};

/** Hue of the neko headset LEDs: a rainbow that flows along the strip. */
const ledHue = (t: number, i: number) => (t / 6 + i * 14) % 360;

/** Steel for the knight helm. */
const STEEL = { c: "#c3ccd6", l: "#eef3f8", s: "#8b96a3", d: "#5d6773", slit: "#1b1f27" };

/**
 * Knight helm plume: a red feather crest that arcs over the top and drapes
 * down one side (screen right facing front; behind the head in the
 * three-quarter view). The lower end sways and the tip lags behind.
 */
const plume = (p: Painter) => {
  const { t } = p;
  const flip = p.back || p.fx > 0;
  const put = (x: number, y: number, c: string) => p.px(flip ? 23 - x : x, y, c);
  const red = "#d8323c";
  const light = "#ff6b6b";
  const dark = "#9a1f26";
  const s = Math.round(Math.sin(t / 320));
  const s2 = Math.round(1.4 * Math.sin(t / 320 - 0.7));
  // [y, firstX, lastX, sway]
  const body: [number, number, number, number][] = [
    [-5, 11, 15, 0],
    [-4, 10, 17, 0],
    [-3, 10, 18, 0],
    [-2, 17, 19, s],
    [-1, 18, 20, s],
    [0, 19, 20, s2],
    [1, 20, 20, s2],
  ];
  body.forEach(([y, a, b, d]) => {
    for (let x = a; x <= b; x++) {
      // Feather barbs: every third pixel a shade darker.
      const barb = (x + y * 2 + 30) % 3 === 0;
      put(x + d, y, barb ? dark : red);
    }
  });
  // Light along the top of the arc, shade under it.
  [11, 12, 13].forEach((x) => put(x, -5, light));
  put(10, -4, light);
  put(16, -4, light);
  [13, 14].forEach((x) => put(x, -3, dark));
  put(17 + s, -2, dark);
  put(20 + s2, 1, dark);
  // A sheen that runs along the feathers now and then.
  const spine = [
    [11, -4],
    [12, -5],
    [13, -5],
    [14, -5],
    [15, -4],
    [16, -3],
    [17, -3],
    [18 + s, -2],
    [19 + s, -1],
  ];
  const k = Math.floor(t / 70) % (spine.length + 18);
  if (k < spine.length) put(spine[k][0], spine[k][1], "#ffc4c4");
  // Gold socket holding the plume.
  p.R(10, -2, 4, 1, STEEL.s);
  p.R(11, -2, 2, 1, p.gold);
  p.px(11, -2, "#fff1b8");
};

/** New head items (see types.ts for how drawing works). */
export const HEAD: CategoryItems = {
  items: [
    { id: "hijab", name: "Hijab", tier: "free" },
    { id: "hijabfloral", name: "Floral hijab", tier: "plus" },
    { id: "hijabsilk", name: "Silk hijab", tier: "pro" },
    { id: "songkok", name: "Songkok", tier: "free" },
    { id: "bandana", name: "Bandana", tier: "free" },
    { id: "headband", name: "Headband", tier: "free" },
    { id: "beret", name: "Beret", tier: "coins", price: 50 },
    { id: "bucket", name: "Bucket hat", tier: "coins", price: 60 },
    { id: "grad", name: "Graduation cap", tier: "plus" },
    { id: "flowercrown", name: "Flower crown", tier: "plus" },
    { id: "bunny", name: "Bunny ears", tier: "plus" },
    { id: "starcrown", name: "Star crown", tier: "pro" },
    { id: "horns", name: "Devil horns", tier: "pro" },
    { id: "songkok2", name: "Songkok Emas", tier: "coins", price: 150 },
    { id: "champband", name: "Champion Headband", tier: "coins", price: 160 },
    { id: "nekoheadset", name: "Neko Headset", tier: "coins", price: 250 },
    { id: "knighthelm", name: "Knight Helm", tier: "coins", price: 260 },
  ],
  draw: {
    hijab: {
      hidesHair: true,
      draw: (p) => hijab(p, p.hc),
    },
    hijabfloral: {
      hidesHair: true,
      draw: (p) => {
        hijab(p, floral(p), false);
        if (p.back) return;
        // Flower brooch pinning the V under the chin.
        const x = 11 + p.fx;
        p.px(x, 16, p.gold);
        p.px(x - 1, 17, p.gold);
        p.px(x + 1, 17, p.gold);
        p.px(x, 18, "#c99a1e");
        p.px(x, 17, "#ffffff");
      },
    },
    hijabsilk: {
      hidesHair: true,
      animated: true,
      draw: (p) => {
        hijab(p, silk(p), false);
        if (p.back) return;
        // Gold brooch pinning the V, with a jewel that catches the light.
        const x = 11 + p.fx;
        const lit = Math.sin(p.t / 300) > 0.6;
        p.R(x - 1, 16, 3, 3, p.gold);
        p.px(x - 1, 16, "#fff6c8");
        p.px(x + 1, 18, "#c99a1e");
        p.px(x, 17, lit ? "#ffffff" : "#3fae8f");
        if (lit) p.px(x + 1, 16, "#ffffff");
      },
    },
    songkok: {
      draw: (p) => {
        const { R, px } = p;
        const v = "#1c1c22";
        R(6, -2, 12, 1, "#2e2e3a");
        R(5, -1, 14, 6, v);
        R(5, 4, 14, 1, "#111116");
        R(18, -1, 1, 5, "#111116");
        // Velvet sheen.
        R(mx(p, 7), -1, 1, 4, "#3a3a48");
        px(mx(p, 8), -1, "#3a3a48");
        R(mx(p, 8, 3), -2, 3, 1, "#454556");
      },
    },
    bandana: {
      draw: (p) => {
        const { R, px } = p;
        const red = "#d63a3a";
        const dark = "#a82828";
        const dots: Fill = (x, y) =>
          y % 2 === 0 && (x + (y % 4 ? 2 : 0)) % 4 === 1 ? "#ffffff" : red;
        rows(
          p,
          [
            [0, 7, 16],
            [1, 6, 17],
          ],
          dots,
        );
        R(5, 2, 14, 4, dots);
        R(5, 5, 14, 1, dark);
        R(18, 2, 1, 3, dark);
        R(8, 0, 3, 1, "#ef6b6b");
        if (p.back) {
          // Knot and tails at the back.
          R(10, 5, 4, 2, red);
          R(11, 5, 2, 1, dark);
          [
            [10, 7],
            [9, 8],
            [9, 9],
            [13, 7],
            [14, 8],
            [14, 9],
          ].forEach(([x, y]) => px(x, y, red));
          px(9, 10, dark);
          px(14, 10, dark);
        } else {
          // Tails peeking out behind the head.
          R(19, 4, 2, 1, red);
          px(20, 5, dark);
        }
      },
    },
    headband: {
      draw: (p) => {
        const { R } = p;
        const c = "#ff6fa8";
        R(7, 1, 10, 1, "#ffb3cf");
        R(6, 2, 12, 1, c);
        R(5, 3, 1, 3, c);
        R(18, 3, 1, 3, "#d94a86");
        R(17, 2, 1, 1, "#d94a86");
        R(8, 1, 2, 1, "#ffe0ec");
      },
    },
    beret: {
      draw: (p) => {
        const { R, px } = p;
        const c = "#c7365f";
        const m = (x: number, y: number, w: number, h: number, col: string) =>
          R(mx(p, x, w), y, w, h, col);
        m(8, -2, 9, 1, c);
        m(6, -1, 14, 1, c);
        m(5, 0, 16, 1, c);
        m(5, 1, 15, 1, c);
        m(5, 2, 14, 1, "#962646");
        m(17, 1, 3, 1, "#962646");
        m(9, -2, 4, 1, "#e05a80");
        m(7, -1, 2, 1, "#e05a80");
        px(mx(p, 12), -3, "#962646");
      },
    },
    bucket: {
      draw: (p) => {
        const { R, px } = p;
        const c = "#d9c08a";
        const dark = "#b39a63";
        R(7, -2, 10, 1, c);
        R(6, -1, 12, 3, c);
        R(6, 2, 12, 1, "#6e5a3a");
        R(4, 3, 16, 1, c);
        R(3, 4, 18, 1, c);
        px(3, 5, dark);
        px(20, 5, dark);
        R(3, 4, 18, 1, (x) => (x % 2 ? c : dark));
        R(mx(p, 8, 3), -2, 3, 1, "#ecd8a8");
        R(mx(p, 7), -1, 1, 2, "#ecd8a8");
        R(mx(p, 17), -1, 1, 3, dark);
      },
    },
    grad: {
      animated: true,
      draw: (p) => {
        const { R, px, t } = p;
        const top = "#34343f";
        const gold = p.gold;
        // Cap and flat board.
        R(6, 0, 12, 4, "#1b1b21");
        R(6, 3, 12, 1, "#111116");
        R(6, -3, 12, 1, top);
        R(3, -2, 18, 1, top);
        R(5, -1, 14, 1, "#15151a");
        // A glint slides across the board now and then.
        const g = Math.floor(t / 80) % 45;
        if (g < 18) px(3 + g, -2, "#6a6a80");
        // Button and a swaying tassel.
        R(11, -3, 2, 1, gold);
        const sway = Math.round(Math.sin(t / 350));
        R(mx(p, 13, 6), -3, 6, 1, gold);
        px(mx(p, 19), -2, gold);
        px(mx(p, 19), -1, gold);
        px(mx(p, 19), 0, gold);
        px(mx(p, 19 + sway), 1, gold);
        px(mx(p, 19 + sway), 2, "#c99a1e");
        R(mx(p, 19 + sway, 2), 3, 2, 3, gold);
        px(mx(p, 20 + sway), 4, "#c99a1e");
        px(mx(p, 19 + sway), 5, "#c99a1e");
      },
    },
    flowercrown: {
      draw: (p) => {
        const { R, px } = p;
        const leaf = "#4f8f3a";
        const leafL = "#7cc35a";
        R(5, 3, 14, 1, leaf);
        [6, 10, 13, 17].forEach((x) => px(x, 4, leafL));
        [7, 16].forEach((x) => px(x, 1, leafL));
        px(10, 0, leaf);
        px(13, 0, leaf);
        (
          [
            [5, 2, "#ff9ec4", "#f4a02a"],
            [8, 1, "#ffffff", "#f4a02a"],
            [11, 0, "#ffd84d", "#e2874c"],
            [14, 1, "#b8a2ff", "#ffd84d"],
            [17, 2, "#ff9ec4", "#f4a02a"],
          ] as const
        ).forEach(([x, y, petal, mid]) => flower(p, x + (x === 11 ? 1 : 0), y, petal, mid));
        px(12, -1, "#fff6c8");
        if (p.back) {
          // Ribbons trailing down from the back.
          R(10, 4, 1, 6, "#ffd1e3");
          R(13, 4, 1, 6, "#c9b8ff");
          px(9, 10, "#ffd1e3");
          px(14, 10, "#c9b8ff");
          R(11, 3, 2, 2, "#ff9ec4");
        }
      },
    },
    bunny: {
      animated: true,
      draw: (p) => {
        const { R } = p;
        const w = "#f7f4ee";
        const s = "#d9d3c7";
        const pink = "#ffb3c8";
        const m = (x: number, y: number, ww: number, h: number, col: string) =>
          R(mx(p, x, ww), y, ww, h, col);
        // Headband.
        R(6, 1, 12, 1, w);
        R(17, 1, 1, 1, s);
        // Upright ear.
        m(6, -4, 3, 6, w);
        m(7, -5, 1, 1, w);
        m(8, -3, 1, 4, s);
        if (!p.back) m(7, -3, 1, 4, pink);
        // Floppy ear that perks up now and then.
        if (p.t % 2800 < 280) {
          m(15, -4, 3, 6, w);
          m(16, -5, 1, 1, w);
          m(17, -3, 1, 4, s);
          if (!p.back) m(16, -3, 1, 4, pink);
        } else {
          m(15, -1, 3, 3, w);
          m(16, -3, 3, 2, w);
          m(19, -2, 2, 2, w);
          m(17, -1, 1, 2, s);
          m(19, -1, 2, 1, s);
          if (!p.back) {
            m(16, -1, 1, 2, pink);
            m(17, -3, 2, 1, pink);
          }
        }
        // Little bow at the base of the ear.
        m(9, 1, 1, 1, "#ff6fa8");
        m(10, 0, 1, 2, "#ff9ec4");
      },
    },
    starcrown: {
      animated: true,
      draw: (p) => {
        const { R, px, t, gold } = p;
        R(6, -1, 12, 3, gold);
        R(6, -1, 12, 1, "#ffe28a");
        R(6, 1, 12, 1, "#c99a1e");
        // Gems.
        px(8, 0, "#e24b4a");
        R(11, 0, 2, 1, "#3d7fd6");
        px(15, 0, "#3fae8f");
        if (Math.sin(t / 500) > 0.5) px(11, 0, "#bfe0ff");
        // Star tips that twinkle.
        [7, 16].forEach((x, i) => {
          const lit = Math.sin(t / 220 + i * 2.1) > 0.5;
          const c = "#ffd84d";
          px(x, -4, lit ? "#ffffff" : c);
          px(x - 1, -3, c);
          px(x + 1, -3, c);
          px(x, -2, c);
          px(x, -3, lit ? "#ffffff" : "#fff6c8");
        });
        bigStar(p, Math.sin(t / 220 + 4.2) > 0.5);
      },
      fxFront: (_c, k) =>
        (
          [
            [7.5, -2.5, 0],
            [12, -3, 2],
            [16.5, -2.5, 1],
          ] as const
        ).forEach(([x, y, i]) => {
          const v = Math.sin(k.t / 220 + i * 2.1);
          k.glow(
            k.X(x),
            k.Y(y),
            (i === 2 ? 3.5 : 2.5) * k.s,
            "255,226,120",
            0.18 + 0.22 * Math.max(0, v),
          );
        }),
    },
    horns: {
      animated: true,
      draw: (p) => {
        const { px, t } = p;
        const red = "#c8202f";
        const dark = "#8a1520";
        const tip = Math.sin(t / 260) > 0 ? "#ff6b5a" : "#ffb0a0";
        [false, true].forEach((right) => {
          const m = (x: number) => (right ? 23 - x : x);
          [
            [7, 1],
            [8, 1],
            [9, 1],
            [7, 0],
            [8, 0],
            [6, -1],
            [7, -1],
          ].forEach(([x, y]) => px(m(x), y, red));
          px(m(6), -2, tip);
          px(m(6), -1, "#ff5a5a");
          px(m(8), 0, dark);
          px(m(9), 1, dark);
        });
      },
      fxBehind: (_c, k) => {
        const a = 0.22 + 0.16 * Math.sin(k.t / 260);
        [7, 17].forEach((x) => k.glow(k.X(x), k.Y(0), 3.5 * k.s, "255,60,60", a));
      },
      fxFront: (_c, k) => {
        const a = Math.max(0, Math.sin(k.t / 260)) * 0.35;
        [6.5, 17.5].forEach((x) => k.glow(k.X(x), k.Y(-1.5), 1.4 * k.s, "255,140,110", a));
      },
    },
    // Black velvet songkok with a gold embroidered band and a gold motif.
    songkok2: {
      draw: (p) => {
        const { R, px, fx, gold } = p;
        const v = "#1d1d26";
        const vS = "#111117";
        const vH = "#363648";
        const gD = "#c99a1e";
        const gL = "#fff1b8";
        // Oval top and the velvet body.
        R(6, -3, 12, 1, "#2a2a37");
        R(5, -2, 14, 5, v);
        R(mx(p, 8, 4), -3, 4, 1, "#47475b");
        // Velvet sheen down one side, shade down the other.
        R(mx(p, 7), -2, 1, 4, vH);
        px(mx(p, 8), -2, vH);
        px(mx(p, 6), -1, "#2a2a37");
        R(18, -2, 1, 5, vS);
        // Gold band round the bottom: embroidered stitches over a darker edge.
        R(5, 3, 14, 1, (x) => ((x + 1) % 3 === 0 ? gL : gold));
        R(5, 4, 14, 1, gD);
        px(18, 3, gD);
        px(18, 4, "#9c7414");
        if (p.back) return;
        // Small gold motif at the front: a diamond with a bright centre.
        const c = 11 + fx;
        R(c, -1, 2, 1, gold);
        R(c - 1, 0, 4, 1, gold);
        R(c, 1, 2, 1, gD);
        px(c, 0, gL);
        px(c + 1, 0, "#e24b4a");
        px(c - 1, 0, gD);
        px(c + 2, 0, gD);
        px(c, -1, gL);
      },
    },
    // Sporty terry sweatband with a little flame tag on one side.
    champband: {
      animated: true,
      draw: (p) => {
        const { R, px, t } = p;
        const red = "#e2412f";
        const redL = "#ff7d6b";
        const redS = "#a8261c";
        const white = "#fbf8f2";
        R(5, 3, 14, 3, red);
        R(5, 4, 14, 1, white);
        R(5, 5, 14, 1, redS);
        R(mx(p, 9, 3), 3, 3, 1, redL);
        // Shade on the far side.
        px(18, 3, redS);
        px(18, 4, "#d9d3c7");
        // Navy badge on the side with a gold edge, a flame stitched on it.
        const m = (x: number, y: number, w: number, h: number, c: string) =>
          R(mx(p, x, w), y, w, h, c);
        m(3, 2, 5, 4, "#1f2a4d");
        m(3, 2, 5, 1, "#33416f");
        m(7, 3, 1, 2, "#151d38");
        m(3, 6, 5, 1, p.gold);
        m(7, 6, 1, 1, "#c99a1e");
        // The flame flickers: its tip dances and the colours shift.
        const flick = Math.sin(t / 110);
        const sway = Math.round(Math.sin(t / 170));
        const hot = flick > 0.2;
        m(4, 5, 3, 1, "#e2412f");
        m(5, 5, 1, 1, hot ? "#ff9b3d" : "#ff7a2f");
        m(4, 4, 3, 1, "#ff7a2f");
        m(5, 4, 1, 1, hot ? "#fff1a0" : "#ffd84d");
        m(5, 3, 1, 1, hot ? "#ffd84d" : "#ffb13d");
        m(5 + sway, 3, 1, 1, "#ffb13d");
        m(5 + sway, 2, 1, 1, hot ? "#fff6c8" : "#ffd84d");
        if (flick > 0.6) m(5 + Math.max(0, sway), 1, 1, 1, "#ffe36a");
      },
    },
    // White over-ear headset with cat ears; the LED strips run a rainbow.
    nekoheadset: {
      animated: true,
      draw: (p) => {
        const { R, px, t, fx } = p;
        const shell = "#f6f3fb";
        const shellS = "#cfc6e0";
        const shellD = "#a99cc4";
        const pad = "#3b3350";
        const led = (i: number) => p.hsl(ledHue(t, i), 95, 62);
        // Band over the head.
        R(6, 0, 12, 1, shell);
        R(7, 0, 3, 1, "#ffffff");
        R(16, 0, 2, 1, shellS);
        R(5, 1, 1, 6, shell);
        R(18, 1, 1, 6, shellS);
        // Cat ears on the band; an LED strip lines the inside.
        [false, true].forEach((right) => {
          const e = (x: number) => (right ? 23 - x : x);
          const inner = (x: number, y: number, i: number) =>
            px(e(x), y, p.back ? shellS : led(i + (right ? 4 : 0)));
          px(e(7), -4, shell);
          px(e(6), -3, shell);
          px(e(8), -3, right ? shellS : shell);
          px(e(5), -2, shell);
          px(e(9), -2, right ? shellD : shellS);
          R(5, -1, 5, 1, shell);
          R(14, -1, 5, 1, shell);
          inner(7, -3, 0);
          inner(6, -2, 1);
          inner(7, -2, 2);
          inner(8, -2, 3);
        });
        px(9, -1, shellS);
        px(18, -1, shellS);
        if (fx && !p.back) {
          // Three-quarter view: the near cup faces us with an LED ring,
          // the far one peeks out behind the head.
          R(4, 7, 4, 6, shell);
          [
            [5, 7],
            [6, 7],
            [7, 8],
            [7, 9],
            [7, 10],
            [7, 11],
            [6, 12],
            [5, 12],
            [4, 11],
            [4, 10],
            [4, 9],
            [4, 8],
          ].forEach(([x, y], i) => px(x, y, led(i)));
          R(5, 8, 2, 4, shell);
          px(5, 8, "#ffffff");
          R(6, 9, 1, 3, shellS);
          R(5, 6, 2, 1, shellS);
          R(19, 7, 2, 5, shellS);
          px(20, 9, led(6));
          px(20, 10, led(7));
          return;
        }
        // Cups: cushion against the head, LED strip on the outside.
        [false, true].forEach((right) => {
          const e = (x: number) => (right ? 23 - x : x);
          R(right ? 18 : 3, 7, 3, 6, shell);
          px(e(5), 7, pad);
          px(e(5), 12, pad);
          R(e(5), 8, 1, 4, pad);
          for (let y = 8; y <= 11; y++) px(e(3), y, led(y + (right ? 6 : 0)));
          px(e(4), 7, right ? shellS : "#ffffff");
          px(e(4), 12, shellS);
          px(e(3), 7, right ? shellD : shellS);
          px(e(3), 12, right ? shellD : shellS);
          if (right) R(19, 8, 1, 4, shellS);
        });
      },
      fxFront: (_c, k) =>
        [7.5, 16.5].forEach((x, i) =>
          k.glow(k.X(x), k.Y(-2), 3 * k.s, hueRgb(ledHue(k.t, i * 4 + 2)), 0.22),
        ),
    },
    // Silver knight helm with a raised visor, cheek guards and a red plume.
    knighthelm: {
      animated: true,
      draw: (p) => {
        const { R, px, t, fx } = p;
        const { c, l, s, d, slit } = STEEL;
        if (p.back) {
          // The helm covers the back of the head down to a flared neck guard.
          rows(
            p,
            [
              [-1, 7, 16],
              [0, 6, 17],
              ...Array.from({ length: 9 }, (_, i) => [1 + i, 5, 18]),
              [10, 4, 19],
            ],
            c,
          );
          R(4, 11, 16, 1, s);
          R(5, 6, 14, 1, s);
          R(11, -1, 1, 7, l);
          R(12, -1, 1, 7, s);
          R(6, 1, 1, 4, l);
          R(18, 1, 1, 9, s);
          [7, 16].forEach((x) => px(x, 6, p.gold));
          [6, 10, 13, 17].forEach((x) => px(x, 10, d));
          plume(p);
          return;
        }
        // Dome.
        rows(
          p,
          [
            [-1, 7, 16],
            [0, 6, 17],
            [1, 5, 18],
            [2, 5, 18],
          ],
          c,
        );
        px(8, -1, l);
        R(7, 0, 2, 1, l);
        R(6, 1, 1, 2, l);
        px(17, 0, s);
        R(18, 1, 1, 2, s);
        // Raised ridge down the middle.
        const rx = 11 + (fx ? 1 : 0);
        R(rx, -1, 1, 4, l);
        R(rx + 1, -1, 1, 4, s);
        // A glint sweeps across the dome every few seconds.
        const g = Math.floor(t / 55) % 60;
        if (g < 14) {
          px(5 + g, 1, "#ffffff");
          if (g > 1 && g < 13) px(6 + g, 0, "#ffffff");
        }
        // Visor pushed up on the forehead: two eye slits and a nose bar.
        R(5, 3, 14, 1, l);
        R(5, 4, 14, 2, c);
        R(5, 6, 14, 1, s);
        R(18, 3, 1, 4, s);
        R(7 + fx, 4, 4, 1, slit);
        R(13 + fx, 4, Math.min(4, 18 - (13 + fx)), 1, slit);
        R(7 + fx, 5, 4, 1, d);
        R(13 + fx, 5, Math.min(4, 18 - (13 + fx)), 1, d);
        px(5, 5, p.gold);
        px(18, 5, "#c99a1e");
        // Cheek guards.
        if (fx) {
          R(4, 6, 3, 7, c);
          R(4, 6, 1, 7, s);
          px(5, 7, l);
          px(5, 9, p.gold);
          R(5, 13, 2, 1, s);
          R(19, 6, 1, 6, d);
        } else {
          R(4, 6, 2, 7, c);
          R(4, 6, 1, 7, s);
          px(5, 7, l);
          px(5, 13, s);
          R(18, 6, 2, 7, c);
          R(19, 6, 1, 7, d);
          px(18, 13, d);
        }
        plume(p);
      },
    },
  },
};
