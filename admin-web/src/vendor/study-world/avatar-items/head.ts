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

/** Pick a colour from a list by v in 0–1 (for glows that pulse in steps). */
const step = (list: string[], v: number) =>
  list[Math.min(list.length - 1, Math.max(0, Math.floor(v * list.length)))];

/**
 * A little picture from strings: each character is a key in `pal`, "." is
 * empty. (x0, y0) is the top-left; `flip` mirrors it to the other side of the
 * body (x → 23 − x), for the second wing, horn or tuft.
 */
const art = (
  p: Painter,
  pic: string[],
  x0: number,
  y0: number,
  pal: Record<string, string>,
  flip = false,
) =>
  pic.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      const c = pal[ch];
      if (c) p.px(flip ? 23 - (x0 + i) : x0 + i, y0 + j, c);
    }),
  );

/** Copper and teal plates for the forge visor; the slit glows in these steps. */
const FORGE = {
  cu: "#b8673a",
  cuL: "#e3955c",
  cuS: "#8a4a26",
  cuD: "#5c2e16",
  te: "#2a9d92",
  teL: "#6adccf",
  teD: "#1a6660",
};
const FORGE_GLOW = ["#2bb5a8", "#46d2c3", "#78eadd", "#b5fcf3"];
/** 0–1 breathing pulse of the forge visor's glow. */
const forgePulse = (t: number) => (Math.sin(t / 380) + 1) / 2;

/** Round teal disc at the ear of the forge visor, its core pulsing. */
const forgeDisc = (p: Painter, x: number, core: string) => {
  p.R(x, 9, 2, 3, FORGE.te);
  p.px(x, 9, FORGE.teL);
  p.px(x + 1, 11, FORGE.teD);
  p.px(x, 10, core);
  p.px(x + 1, 10, core);
};

/** Silver for the winged helm, with a slate-blue brow band. */
const SILVER = {
  c: "#cdd5de",
  l: "#f4f7fa",
  s: "#97a2af",
  d: "#69737f",
  band: "#4f6f96",
  bandL: "#7193bb",
  bandD: "#36506f",
};
/** Left wing of the winged helm (x −2 to 4, y −5 to 2): layered feathers sweeping up and out. */
const WING = [
  "W......",
  "WWW....",
  "SMWWW..",
  ".WSMWW.",
  ".WWWSMW",
  "..SMWWW",
  "..WWWSW",
  "...SMWW",
];

/** Owl cowl: dark plum feathers, a grey facial disc and amber eye rings. */
const OWL = {
  p: "#3e2747",
  pL: "#5d3f6b",
  pS: "#2a1731",
  g: "#8f8a99",
  gL: "#c2bdc9",
  gS: "#615c6b",
  am: "#e8962e",
  amL: "#ffcf6e",
  beak: "#4a4552",
  beakL: "#7a7486",
};
/** Plum with rows of small feather scallops (a light tip over a dark edge). */
const plumage: Fill = (x, y) => {
  const band = Math.floor((y + 12) / 3);
  const k = (x + (band % 2) * 2 + 40) % 4;
  const r = (y + 12) % 3;
  return r === 0 && k === 1 ? OWL.pL : OWL.p;
};
/** Left ear tuft: a rounded clump of feathers with grey tips (x 2–8, y −5 to −1). */
const TUFT = [".gGg...", "gGLLg..", "gLppL..", ".Lpppp.", "..ppppp"];
const TUFT_UP = ["gGg....", "gGLLg..", "gLppL..", ".Lpppp.", "..ppppp"];

/** Moss-green ranger hood. */
const MOSS = {
  c: "#5e7d3a",
  l: "#7f9e4e",
  s: "#435c28",
  d: "#2c3d1a",
  line: "#3b3023",
};
/** Hood outline [y, firstX, lastX]: crown, sides, then a short shoulder mantle. */
const HOOD_SHAPE = [
  [-2, 9, 15],
  [-1, 7, 17],
  [0, 6, 18],
  [1, 5, 19],
  ...Array.from({ length: 15 }, (_, i) => [2 + i, 4, 19]),
  [16, 3, 20],
  [17, 4, 19],
];
/** Face opening of the hood, facing front / three-quarter. */
const HOOD_FRONT = [
  [4, 7, 16],
  ...Array.from({ length: 9 }, (_, i) => [5 + i, 6, 17]),
  [14, 7, 16],
  [15, 8, 15],
];
const HOOD_SIDE = [
  [4, 9, 17],
  ...Array.from({ length: 9 }, (_, i) => [5 + i, 8, 18]),
  [14, 9, 17],
  [15, 10, 16],
];

/** Yellow hard hat. */
const HAT = { c: "#f2c230", l: "#ffe383", s: "#cc9a1c", d: "#8f6a10" };
/** The miner's lamp flickers between these (index from a cheap hash of time). */
const LAMP = ["#fff6c8", "#ffffff", "#ffefa6", "#fff6c8", "#ffe28a", "#ffffff"];
const lampLit = (t: number) => LAMP[(Math.floor(t / 90) * 7) % LAMP.length];
/** True for a moment every couple of seconds: the lamp dips. */
const lampDip = (t: number) => t % 2300 < 90;

/** White and slate armour for the trooper helmet, with a gold visor. */
const TROOP = {
  w: "#eef1f4",
  wL: "#ffffff",
  wS: "#c4cbd3",
  sl: "#56636f",
  slL: "#7a8794",
  slD: "#3a434d",
  v: "#d6a239",
  vL: "#f6d77a",
  vS: "#a8781f",
  vD: "#7a5512",
};

/** Teal cloth band and the brushed steel plate of the cloud headband. */
const BAND = { c: "#2f7f86", l: "#4fa9ae", s: "#1f5a60" };
const PLATE = { c: "#c9d1da", l: "#eef2f6", s: "#8e99a6", d: "#5f6a77" };

/**
 * One cloth tail running out from (x0, y0) in direction dir (−1 left, 1
 * right): a wave travels down it and grows towards the tip.
 */
const clothTail = (
  p: Painter,
  x0: number,
  y0: number,
  dir: number,
  len: number,
  droop: number,
  phase: number,
) => {
  let prev = y0;
  for (let i = 0; i < len; i++) {
    const a = p.t / 150 - i * 0.8 + phase;
    const y = y0 + Math.round(i * droop + Math.sin(a) * 1.3 * (i / len));
    const x = x0 + i * dir;
    for (let yy = Math.min(prev, y) + 1; yy < Math.max(prev, y); yy++) p.px(x, yy, BAND.c);
    p.px(x, y, Math.cos(a) > 0.3 ? BAND.l : BAND.c);
    if (i < len - 1) p.px(x, y + 1, BAND.s);
    prev = y;
  }
};

/** White and violet for the horned pilot headset. */
const PILOT = {
  w: "#f5f4fa",
  wS: "#d2cfe2",
  wD: "#a6a1bf",
  v: "#7b52d9",
  vL: "#a98cff",
  vD: "#54369e",
};
/** Left horn fin (x 3–7, y −4 to −1), swept up and out from the band. */
const FIN = ["L.....", "VL....", "VWW...", ".VWWW.", "..VWWW"];

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
    { id: "forgevisor", name: "Forge Visor", tier: "coins", price: 220 },
    { id: "wingedhelm", name: "Winged Helm", tier: "coins", price: 220 },
    { id: "owlcowl", name: "Owl Cowl", tier: "coins", price: 240 },
    { id: "rangerhood", name: "Ranger Hood", tier: "coins", price: 150 },
    { id: "minerhelmet", name: "Miner Lamp Helmet", tier: "coins", price: 150 },
    { id: "troopvisor", name: "Trooper Helmet", tier: "coins", price: 260 },
    { id: "cloudband", name: "Cloud Headband", tier: "coins", price: 150 },
    { id: "pilothorns", name: "Horned Headset", tier: "coins", price: 200 },
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
    // Copper tech helmet with teal plates: a crest down the middle, one
    // glowing teal slit across the eyes and glowing discs at the ears. The
    // mouth and chin stay open. The glow breathes slowly and a bright spark
    // runs along the slit.
    forgevisor: {
      hidesHair: true,
      animated: true,
      draw: (p) => {
        const { R, px, t, fx } = p;
        const F = FORGE;
        const pulse = forgePulse(t);
        const core = step(FORGE_GLOW, pulse);
        rows(
          p,
          [
            [-2, 8, 15],
            [-1, 6, 17],
            [0, 5, 18],
            ...Array.from({ length: 8 }, (_, i) => [1 + i, 4, 19]),
          ],
          F.cu,
        );
        // Light on the crown, shade down the far side.
        R(7, -1, 3, 1, F.cuL);
        R(6, 0, 2, 1, F.cuL);
        R(5, 1, 1, 3, F.cuL);
        px(18, 0, F.cuS);
        R(19, 1, 1, 8, F.cuS);
        // Crest down the middle.
        const cx = 11 + (fx ? 1 : 0);
        R(cx, -3, 2, 1, F.cuL);
        R(cx, -2, 1, 8, F.cuL);
        R(cx + 1, -2, 1, 8, F.cuS);
        if (p.back) {
          // The shell covers the back of the head; a vent glows at the nape.
          rows(
            p,
            Array.from({ length: 6 }, (_, i) => [9 + i, 4, 19]),
            F.cu,
          );
          R(cx, 6, 1, 4, F.cuL);
          R(cx + 1, 6, 1, 4, F.cuS);
          R(4, 2, 2, 10, F.te);
          R(18, 2, 2, 10, F.te);
          R(4, 2, 2, 1, F.teL);
          R(18, 2, 2, 1, F.teL);
          R(19, 3, 1, 9, F.teD);
          R(7, 11, 10, 2, F.cuD);
          [8, 10, 13, 15].forEach((x) => px(x, 11, core));
          R(4, 14, 16, 1, F.cuS);
          R(6, 15, 12, 1, F.cuD);
          forgeDisc(p, 3, core);
          forgeDisc(p, 19, core);
          return;
        }
        // Teal temple plates (one big plate on the near side in the 3/4 view).
        if (fx) {
          R(4, 2, 4, 6, F.te);
          R(4, 2, 4, 1, F.teL);
          R(7, 3, 1, 5, F.teD);
        } else {
          R(4, 2, 2, 5, F.te);
          R(18, 2, 2, 5, F.te);
          R(4, 2, 2, 1, F.teL);
          R(18, 2, 2, 1, F.teL);
          R(19, 3, 1, 4, F.teD);
        }
        // Brow ridge and the frame round the slit.
        R(4, 7, 16, 1, F.cuS);
        R(4, 8, 16, 1, F.cuD);
        R(4, 11, 16, 1, F.cuD);
        const left = 5 + fx;
        const right = fx ? 19 : 18;
        R(4, 9, left - 4, 2, F.cu);
        if (!fx) R(19, 9, 1, 2, F.cuS);
        // The slit: bright on top, a step dimmer underneath, a spark running along.
        R(left, 9, right - left + 1, 1, core);
        R(left, 10, right - left + 1, 1, step(FORGE_GLOW, pulse * 0.55));
        const run = left + (Math.floor(t / 55) % 36);
        if (run <= right) {
          px(run, 9, "#effffc");
          px(run, 10, FORGE_GLOW[3]);
        }
        // Cheek plates hugging the jaw.
        if (fx) {
          R(4, 12, 4, 2, F.cu);
          R(6, 14, 2, 1, F.cuS);
          R(7, 12, 1, 2, F.cuS);
          px(5, 12, F.teL);
          forgeDisc(p, 5, core);
        } else {
          R(4, 12, 2, 2, F.cu);
          R(18, 12, 2, 2, F.cuS);
          px(5, 14, F.cuS);
          px(18, 14, F.cuD);
          forgeDisc(p, 3, core);
          forgeDisc(p, 19, core);
        }
      },
      fxFront: (_c, k) => {
        const a = 0.08 + 0.24 * forgePulse(k.t);
        [4, 20].forEach((x) => k.glow(k.X(x), k.Y(10.5), 2.6 * k.s, "90,232,214", a));
      },
    },
    // Silver helm with a slate-blue brow band and a little gold sun, a nose
    // guard, cheek guards and mail at the back. Small feathered wings sweep
    // up from the sides; they twitch now and then and their tips spark.
    wingedhelm: {
      hidesHair: true,
      animated: true,
      draw: (p) => {
        const { R, px, t, fx } = p;
        const S = SILVER;
        rows(
          p,
          [[-2, 8, 15], [-1, 6, 17], ...Array.from({ length: 5 }, (_, i) => [i, 5, 18])],
          S.c,
        );
        // Light on the dome, shade down the far side, a ridge down the middle.
        R(8, -2, 3, 1, S.l);
        R(6, -1, 2, 1, S.l);
        R(5, 0, 1, 3, S.l);
        R(18, 0, 1, 5, S.s);
        px(17, -1, S.s);
        const cx = 11 + (fx ? 1 : 0);
        R(cx, -2, 1, 7, S.l);
        R(cx + 1, -2, 1, 7, S.s);
        // Brow band with rivets.
        R(4, 5, 16, 2, S.band);
        R(4, 5, 16, 1, S.bandL);
        R(19, 5, 1, 2, S.bandD);
        [6, 9, 15, 18].forEach((x) => px(x, 6, S.l));
        if (p.back) {
          // Mail hangs from the band over the back of the neck.
          rows(
            p,
            Array.from({ length: 8 }, (_, i) => [7 + i, 4, 19]),
            (x, y) => ((x + y) % 2 ? "#8e98a5" : "#b9c2cc"),
          );
          R(4, 14, 16, 1, S.d);
          R(cx, -2, 1, 7, S.l);
        } else {
          // Gold sun on the band.
          R(cx, 5, 2, 2, p.gold);
          px(cx, 5, "#fff1b8");
          px(cx + 1, 6, "#c99a1e");
          // Nose guard.
          R(cx, 7, 2, 2, S.c);
          px(cx + 1, 7, S.s);
          px(cx + 1, 8, S.s);
          R(cx, 9, 1, 3, S.c);
          px(cx, 11, S.s);
          // Cheek guards.
          if (fx) {
            R(4, 7, 4, 7, S.c);
            R(4, 7, 1, 7, S.s);
            px(5, 8, S.l);
            px(6, 8, S.l);
            R(5, 13, 3, 1, S.s);
            R(19, 7, 1, 5, S.d);
          } else {
            R(4, 7, 3, 6, S.c);
            R(17, 7, 3, 6, S.c);
            R(4, 7, 1, 6, S.s);
            px(5, 8, S.l);
            R(19, 7, 1, 6, S.d);
            R(5, 13, 2, 1, S.s);
            R(17, 13, 2, 1, S.d);
          }
        }
        // Wings: they twitch down a pixel now and then; the tips spark.
        const flap = t % 3100 < 220 ? 1 : 0;
        const spark = t % 2700 < 170;
        [false, true].forEach((flip) => {
          art(p, WING, -2, -5 + flap, { W: "#ffffff", M: "#e1e7ef", S: "#b3becb" }, flip);
          if (!spark) return;
          const m = (x: number) => (flip ? 23 - x : x);
          px(m(-2), -5 + flap, "#ffffff");
          px(m(-1), -4 + flap, "#bff2ff");
          px(m(0), -5 + flap, "#fff6a8");
          px(m(-2), -3 + flap, "#fff6a8");
        });
      },
      fxFront: (_c, k) => {
        if (k.t % 2700 >= 170) return;
        [-1, 25].forEach((x) => k.glow(k.X(x), k.Y(-4), 2.8 * k.s, "200,240,255", 0.55));
      },
    },
    // Night cowl with owl feathers: dark plum scallops, rounded feather tufts
    // on top, a grey facial disc with a V brow and a little beak, and amber
    // rings round the eyes that glint now and then. Mouth and chin stay open.
    owlcowl: {
      hidesHair: true,
      animated: true,
      draw: (p) => {
        const { R, px, t, fx } = p;
        const O = OWL;
        const eyes = [7 + fx, 15 + fx];
        const open = p.back
          ? []
          : fx
            ? [
                [13, 9, 18],
                [14, 9, 17],
                [15, 10, 16],
              ]
            : [
                [13, 7, 16],
                [14, 7, 16],
                [15, 8, 15],
              ];
        const hole = (x: number, y: number) =>
          open.some(([yy, a, b]) => yy === y && x >= a && x <= b) ||
          (!p.back && y >= 9 && y <= 11 && eyes.some((e) => x >= e && x <= e + 1));
        [
          [-1, 7, 16],
          [0, 6, 17],
          [1, 5, 18],
          ...Array.from({ length: 14 }, (_, i) => [2 + i, 4, 19]),
        ].forEach(([y, a, b]) => {
          for (let x = a; x <= b; x++) if (!hole(x, y)) px(x, y, plumage);
        });
        R(4, 16, 16, 1, O.pS);
        R(19, 2, 1, 14, O.pS);
        // Tufts: rounded feather clumps; one ruffles up now and then.
        const ruffle = t % 3000 < 220;
        const pal = { g: O.g, G: O.gL, L: O.pL, p: O.p };
        art(p, ruffle ? TUFT_UP : TUFT, 2, -5, pal);
        art(p, t % 3000 > 1500 && t % 3000 < 1720 ? TUFT_UP : TUFT, 2, -5, pal, true);
        if (p.back) {
          // Grey chevrons down the back of the cowl.
          for (let i = 0; i < 5; i++) {
            px(11 - i, 4 + i, O.gS);
            px(12 + i, 4 + i, O.gS);
            px(11 - i, 8 + i, O.g);
            px(12 + i, 8 + i, O.g);
          }
          return;
        }
        // Grey facial discs round each eye (corners trimmed).
        eyes.forEach((e) => {
          for (let y = 8; y <= 12; y++)
            for (let x = e - 2; x <= Math.min(19, e + 3); x++) {
              const corner = (y === 8 || y === 12) && (x === e - 2 || x === e + 3);
              if (!corner && !hole(x, y)) px(x, y, y === 12 ? O.gS : O.g);
            }
          px(e - 1, 8, O.gL);
        });
        // V brow from the outer corners down to the beak.
        const f = fx;
        [
          [5, 7],
          [6, 7],
          [7, 7],
          [8, 7],
          [9, 8],
          [10, 8],
          [11, 9],
          [12, 9],
          [13, 8],
          [14, 8],
          [15, 7],
          [16, 7],
          [17, 7],
          [18, 7],
        ].forEach(([x, y]) => {
          if (x + f <= 19) px(x + f, y, O.pS);
        });
        R(11 + f, 10, 2, 1, O.p);
        // Little hooked beak over the nose.
        R(11 + f, 11, 2, 2, O.beak);
        px(11 + f, 11, O.beakL);
        // Amber rings round the eyes; they brighten in turn and glint.
        eyes.forEach((e, i) => {
          const ring = Math.sin(t / 520 + i * 1.6) > 0.3 ? O.amL : O.am;
          R(e, 8, 2, 1, ring);
          R(e, 12, 2, 1, O.am);
          R(e - 1, 9, 1, 3, ring);
          if (e + 2 <= 19) R(e + 2, 9, 1, 3, O.am);
          if ((t + i * 900) % 2600 < 240) px(e + 1, 8, "#fff6d6");
        });
      },
    },
    // Moss-green hood with a short mantle over the shoulders. A bit of fringe
    // (in the hair colour) shows at the forehead; the hood's point droops at
    // the back. A leaf charm on the clasp sways and glints now and then.
    rangerhood: {
      hidesHair: true,
      animated: true,
      draw: (p) => {
        const { R, px, t, fx } = p;
        const M = MOSS;
        const open = p.back ? [] : fx ? HOOD_SIDE : HOOD_FRONT;
        const inside = (x: number, y: number) =>
          open.some(([yy, a, b]) => yy === y && x >= a && x <= b);
        HOOD_SHAPE.forEach(([y, a, b]) => {
          for (let x = a; x <= b; x++) if (!inside(x, y)) px(x, y, M.c);
        });
        // Light on the crown, shade down the far side and along the hem.
        R(10, -2, 3, 1, M.l);
        R(8, -1, 2, 1, M.l);
        px(7, 0, M.l);
        px(6, 1, M.l);
        R(19, 2, 1, 14, M.s);
        R(4, 17, 16, 1, M.s);
        px(3, 16, M.l);
        // Folds falling to the shoulders.
        [
          [5, 14],
          [5, 15],
          [18, 14],
          [18, 15],
          [7, 16],
          [16, 16],
        ].forEach(([x, y]) => px(x, y, M.s));
        if (p.back) {
          // Seam down the middle and the hood's point drooping below the mantle.
          R(11, -2, 1, 18, M.s);
          R(11, 18, 2, 1, M.c);
          px(12, 18, M.s);
          px(11, 19, M.s);
          return;
        }
        // The point of the hood, drooping behind.
        if (fx) {
          R(4, -1, 3, 1, M.c);
          R(2, 0, 4, 1, M.c);
          R(2, 1, 3, 1, M.s);
          px(2, 2, M.s);
        } else {
          R(15, -2, 2, 1, M.s);
          px(17, -1, M.s);
        }
        // Dark lining just outside the face opening.
        for (let y = 3; y <= 16; y++)
          for (let x = 3; x <= 20; x++)
            if (
              !inside(x, y) &&
              (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1))
            )
              px(x, y, M.line);
        // A little fringe peeking out under the hood.
        const a = fx ? 9 : 7;
        const b = fx ? 17 : 16;
        R(a, 4, b - a + 1, 1, p.hc);
        R(a - 1, 5, b - a + 3 - (fx ? 1 : 0), 1, p.hc);
        [0, 1, 3, 4, 5, 8, 9, 11].forEach((i) => {
          if (a - 1 + i <= 18) px(a - 1 + i, 6, p.hc);
        });
        px(a - 1, 7, p.hS);
        px(a + 4, 7, p.hS);
        R(a + 1, 4, 2, 1, p.hH);
        // Brass clasp and the swaying leaf charm.
        const c = 11 + fx;
        R(c, 16, 2, 1, "#c99a3e");
        px(c, 16, "#f2d27a");
        const sway = Math.round(Math.sin(t / 420));
        const lx = c + (sway > 0 ? 1 : 0);
        px(lx, 17, "#a57a2a");
        px(lx, 18, "#9ccc5a");
        R(lx - 1, 19, 3, 1, "#7fb447");
        px(lx + sway, 20, "#5d9a35");
        px(lx, 19, "#4f8a2c");
        if (t % 2600 < 200) px(lx, 18, "#eaffc8");
      },
    },
    // Chunky yellow hard hat with a raised ridge and a wide brim. The lamp on
    // the front flickers; from the side it throws a small cone of light.
    minerhelmet: {
      animated: true,
      draw: (p) => {
        const { R, px, t, fx } = p;
        const H = HAT;
        rows(
          p,
          [[-3, 8, 15], [-2, 6, 17], ...Array.from({ length: 6 }, (_, i) => [i - 1, 5, 18])],
          H.c,
        );
        // Wide brim, a bit longer at the front in the 3/4 view.
        R(3, 4, fx ? 20 : 18, 1, H.c);
        R(3, 5, fx ? 20 : 18, 1, H.s);
        px(3, 5, H.d);
        px(fx ? 22 : 20, 5, H.d);
        R(4, 4, 3, 1, H.l);
        // Light on the dome, shade down the far side, a few scuffs.
        R(8, -3, 2, 1, H.l);
        R(6, -2, 2, 1, H.l);
        R(5, -1, 1, 3, H.l);
        R(18, -1, 1, 5, H.s);
        px(17, -2, H.s);
        px(7, 2, H.s);
        px(16, 0, H.s);
        // Raised ridge over the top.
        const rx = mx(p, 10 + fx, 4);
        R(rx, -4, 4, 1, H.c);
        R(rx, -4, 2, 1, H.l);
        R(rx, -3, 1, 6, H.l);
        R(rx + 3, -3, 1, 6, H.s);
        const lit = lampDip(t) ? "#cdb979" : lampLit(t);
        if (p.back) {
          // Battery pack on the back strap, its little light blinking.
          R(5, 2, 14, 1, "#3b3f48");
          R(10, 1, 4, 3, "#3b3f48");
          R(10, 1, 4, 1, "#5b616d");
          px(12, 2, t % 1600 < 500 ? "#62e07a" : "#2a5a33");
          return;
        }
        if (fx) {
          // Lamp on the front of the hat, the beam spreading forward.
          R(15, -1, 4, 3, "#3b3f48");
          R(15, -1, 4, 1, "#5b616d");
          R(19, -1, 1, 2, lit);
          px(17, 0, "#2a2d34");
          if (!lampDip(t)) {
            const shift = Math.floor(t / 120);
            [
              [20, -1, 0],
              [21, -2, 1],
              [22, -2, 1],
              [23, -3, 2],
              [24, -3, 2],
              [25, -4, 3],
            ].forEach(([x, y0, y1]) => {
              for (let y = y0; y <= y1; y++)
                px(
                  x,
                  y,
                  y === Math.round((y0 + y1) / 2) && (x + shift) % 2 ? "#fffbe6" : "#fff0b3",
                );
            });
          }
          return;
        }
        // Lamp facing us: dark housing, bright lens, a bracket under it.
        R(10, -1, 4, 3, "#3b3f48");
        R(10, -1, 4, 1, "#5b616d");
        R(11, -1, 2, 2, lit);
        px(11, -1, lampDip(t) ? lit : "#ffffff");
        R(11, 2, 2, 1, "#5b616d");
      },
      fxFront: (_c, k) => {
        if (lampDip(k.t)) return;
        const f = 0.85 + 0.15 * Math.sin(k.t / 70);
        // Sit the glow on the lamp when we know which way the avatar faces
        // (the side views' lamp is at the front edge; from behind it's hidden).
        const x = k.dir === "r" ? 20 : k.dir === "l" ? 4 : 12;
        const a = k.dir === "b" ? 0.18 : 0.42;
        k.glow(k.X(x), k.Y(0.5), 4.5 * k.s, "255,236,160", a * f);
      },
    },
    // Sealed space helmet: white shell, slate trim, a wide gold visor with a
    // reflection sweeping across it, ear pods and a small antenna whose tip
    // blinks. From behind: a slate band and a vented life-support box.
    troopvisor: {
      hidesHair: true,
      animated: true,
      draw: (p) => {
        const { R, px, t, fx } = p;
        const T = TROOP;
        rows(
          p,
          [
            [-2, 8, 15],
            [-1, 6, 17],
            [0, 5, 18],
            ...Array.from({ length: 12 }, (_, i) => [1 + i, 4, 19]),
            [13, 5, 18],
            [14, 6, 17],
          ],
          T.w,
        );
        R(7, 15, 10, 1, T.slD);
        // Light on the dome, shade down the far side and along the bottom.
        R(8, -2, 3, 1, T.wL);
        R(6, -1, 2, 1, T.wL);
        R(5, 0, 1, 3, T.wL);
        px(18, 0, T.wS);
        R(19, 1, 1, 12, T.wS);
        px(18, 13, T.wS);
        R(6, 14, 12, 1, T.wS);
        // Slate stripe over the crown and the brow band.
        const cx = 11 + (fx ? 1 : 0);
        R(cx, -2, 2, 7, T.sl);
        px(cx, -2, T.slL);
        R(4, 5, 16, 1, T.sl);
        R(4, 6, 16, 1, T.slD);
        // Antenna by the near ear (other side from behind); its tip blinks.
        const ax = mx(p, 3);
        R(ax, -3, 1, 9, T.slL);
        px(ax, -4, t % 1400 < 380 ? "#ff6b6b" : "#7a2b33");
        if (p.back) {
          // Vented life-support box over the back of the neck.
          R(8, 8, 8, 5, T.sl);
          R(8, 8, 8, 1, T.slL);
          R(9, 10, 6, 1, T.slD);
          R(9, 12, 6, 1, T.slD);
          px(15, 9, t % 1400 < 380 ? "#7dffb0" : "#2f6f4a");
          R(3, 8, 2, 4, T.sl);
          R(19, 8, 2, 4, T.sl);
          return;
        }
        // Gold visor: rounded corners, a light top, a horizon line, a dark rim.
        const left = 5 + fx;
        const right = fx ? 19 : 18;
        const pos = ((t / 28) % 60) - 10;
        for (let y = 7; y <= 12; y++)
          for (let x = left; x <= right; x++) {
            if ((y === 7 || y === 12) && (x === left || x === right)) continue;
            let c = y === 7 ? T.vL : y === 10 ? T.vS : y === 12 ? T.vD : T.v;
            if (y === 8 && x < left + 4) c = T.vL;
            const d = Math.abs(x - left + (y - 7) * 0.8 - pos);
            if (d < 0.8) c = "#fff8dc";
            else if (d < 1.6 && y !== 12) c = T.vL;
            px(x, y, c);
          }
        // Breathing vent under the visor.
        R(10 + fx, 13, 4, 2, T.sl);
        px(10 + fx, 13, T.slD);
        px(12 + fx, 13, T.slD);
        px(11 + fx, 14, T.slD);
        px(13 + fx, 14, T.slD);
        // Ear pods (one big pod on the near side in the 3/4 view).
        if (fx) {
          R(4, 7, 3, 6, T.sl);
          R(4, 7, 3, 1, T.slL);
          px(5, 9, T.slL);
          px(5, 10, T.wS);
        } else {
          R(3, 7, 2, 5, T.sl);
          R(19, 7, 2, 5, T.sl);
          px(3, 7, T.slL);
          px(19, 7, T.slL);
          px(20, 9, T.slD);
        }
      },
    },
    // Ninja-style forehead plate of brushed steel with an etched cloud, on a
    // teal cloth band knotted at the back. The tails flutter in the wind and
    // a glint slides across the plate now and then.
    cloudband: {
      animated: true,
      draw: (p) => {
        const { R, px, t, fx } = p;
        const B = BAND;
        R(5, 4, 14, 2, B.c);
        R(5, 5, 14, 1, B.s);
        R(18, 4, 1, 2, B.s);
        if (p.back) {
          // Knot in the middle, two tails blowing off to one side together.
          R(10, 3, 3, 3, B.c);
          R(10, 3, 3, 1, B.l);
          px(12, 5, B.s);
          [
            [9, 6, 5],
            [11, 6, 3],
          ].forEach(([x0, y0, n], i) => {
            for (let j = 0; j < n; j++) {
              const sway = j >= 2 ? Math.round(Math.sin(t / 200 - j * 0.6 + i)) : 0;
              const x = x0 - Math.floor(j / 2) + sway;
              R(x, y0 + j, 2, 1, j === n - 1 ? B.s : B.c);
              px(x + 1, y0 + j, B.s);
            }
          });
          return;
        }
        // Steel plate with an etched cloud.
        const x0 = 8 + fx;
        R(x0, 3, 8, 4, PLATE.c);
        R(x0, 3, 8, 1, PLATE.l);
        R(x0, 6, 8, 1, PLATE.s);
        R(x0 + 7, 3, 1, 4, PLATE.s);
        px(x0 + 2, 4, PLATE.d);
        R(x0 + 4, 4, 2, 1, PLATE.d);
        R(x0 + 1, 5, 6, 1, PLATE.d);
        px(x0 + 4, 4, PLATE.s);
        // A glint slides across the plate now and then.
        const g = Math.floor(t / 60) % 55;
        if (g < 8) {
          px(x0 + g, 3, "#ffffff");
          if (g > 0) px(x0 + g - 1, 4, "#ffffff");
        }
        if (fx) {
          // Knot at the back of the head, tails streaming behind.
          R(3, 3, 2, 3, B.c);
          px(3, 3, B.l);
          clothTail(p, 2, 4, -1, 5, 0.35, 0);
          clothTail(p, 2, 5, -1, 4, 0.8, 1.9);
        } else {
          // Tails peeking out from behind the head.
          clothTail(p, 19, 4, 1, 4, 0.3, 0);
          clothTail(p, 19, 5, 1, 3, 0.9, 1.9);
        }
      },
    },
    // Mecha-pilot headset in white and violet: a band over the head with two
    // small horn fins swept back, ear pieces with a blinking light, and a mic
    // reaching to the mouth.
    pilothorns: {
      animated: true,
      draw: (p) => {
        const { R, px, t, fx } = p;
        const P = PILOT;
        const led = t % 1300 < 420 ? "#7dffc8" : "#2f6f5a";
        const finPal = { L: t % 2600 < 160 ? "#ffffff" : P.vL, V: P.v, W: P.w };
        // Band over the head, down to the ear pieces.
        R(8, -1, 8, 1, P.w);
        R(9, -1, 3, 1, "#ffffff");
        R(8, 0, 8, 1, P.v);
        R(6, 0, 2, 1, P.w);
        R(16, 0, 2, 1, P.wS);
        px(5, 1, P.w);
        px(18, 1, P.wS);
        R(5, 2, 1, 5, P.v);
        R(18, 2, 1, 5, P.vD);
        art(p, FIN, 2, -5, finPal);
        art(p, FIN, 2, -5, finPal, true);
        if (fx && !p.back) {
          // Near ear piece faces us with a violet ring; the far one peeks out.
          R(4, 7, 4, 6, P.w);
          R(4, 7, 4, 1, P.vL);
          R(4, 12, 4, 1, P.vD);
          R(4, 8, 1, 4, P.v);
          R(7, 8, 1, 4, P.vD);
          R(5, 9, 2, 2, P.wS);
          px(5, 9, led);
          R(19, 8, 2, 4, P.wS);
          px(20, 9, P.v);
          // Mic boom to the mouth.
          px(8, 12, P.vD);
          R(9, 13, 2, 1, P.vD);
          px(11, 13, "#2a2a35");
          return;
        }
        // Ear pieces: violet outer panel with a light, cushion against the head.
        [false, true].forEach((right) => {
          const e = (x: number) => (right ? 23 - x : x);
          R(right ? 18 : 3, 7, 3, 6, P.w);
          R(e(3), 8, 1, 4, P.v);
          px(e(3), 7, P.vL);
          px(e(3), 12, P.vD);
          R(e(5), 8, 1, 4, right ? P.wD : P.wS);
          px(e(3), 9, led);
          if (right) R(20, 8, 1, 4, P.vD);
        });
        if (p.back) {
          R(6, 12, 12, 1, P.v);
          R(6, 12, 12, 1, (x) => (x % 3 ? P.v : P.vD));
          return;
        }
        // Mic boom to the mouth.
        px(6, 13, P.vD);
        R(7, 13, 2, 1, P.vD);
        px(9, 13, "#2a2a35");
      },
    },
  },
};
