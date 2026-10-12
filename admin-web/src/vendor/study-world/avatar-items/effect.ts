import type { CategoryItems, FxKit } from "./types";

/**
 * New effect items (see types.ts for how drawing works).
 * Everything moves on the avatar's pixel grid (multiples of k.s) so it stays crisp.
 */

type C = CanvasRenderingContext2D;

/** Snap a screen x / y onto the avatar's pixel grid. */
const sx = (k: FxKit, x: number) => k.X(0) + Math.round((x - k.X(0)) / k.s) * k.s;
const sy = (k: FxKit, y: number) => k.Y(0) + Math.round((y - k.Y(0)) / k.s) * k.s;

/** Repeatable 0–1 "random" number for a seed. */
const rnd = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Fade in over the first 10% and out over the last `out` of a particle's life. */
const fade = (ph: number, out = 0.2) => Math.min(1, ph / 0.1, (1 - ph) / out);

function rect(c: C, x: number, y: number, w: number, h: number, col: string, a = 1) {
  c.globalAlpha = a;
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
}

/* ---------- Bubbles ---------- */

function bubble(c: C, s: number, x: number, y: number, big: boolean, a: number) {
  const ring = "#a9dcff";
  if (big) {
    rect(c, x + s, y + s, 2 * s, 2 * s, "#d8f0ff", a * 0.25);
    rect(c, x + s, y, 2 * s, s, ring, a);
    rect(c, x + s, y + 3 * s, 2 * s, s, ring, a);
    rect(c, x, y + s, s, 2 * s, ring, a);
    rect(c, x + 3 * s, y + s, s, 2 * s, ring, a);
    rect(c, x + s, y + s, s, s, "#ffffff", a);
  } else {
    rect(c, x + s, y, s, s, ring, a);
    rect(c, x, y + s, s, s, ring, a);
    rect(c, x + 2 * s, y + s, s, s, ring, a);
    rect(c, x + s, y + 2 * s, s, s, ring, a);
  }
}

/* ---------- Music notes ---------- */

function note(c: C, s: number, x: number, y: number, col: string, double: boolean, a: number) {
  if (double) {
    rect(c, x + s, y, 4 * s, s, col, a);
    rect(c, x + s, y, s, 4 * s, col, a);
    rect(c, x + 4 * s, y, s, 4 * s, col, a);
    rect(c, x, y + 3 * s, 2 * s, 2 * s, col, a);
    rect(c, x + 3 * s, y + 3 * s, 2 * s, 2 * s, col, a);
  } else {
    rect(c, x + s, y, s, 4 * s, col, a);
    rect(c, x + 2 * s, y + s, s, s, col, a);
    rect(c, x + 3 * s, y + 2 * s, s, s, col, a);
    rect(c, x, y + 3 * s, 2 * s, 2 * s, col, a);
  }
}

/* ---------- Fireflies ---------- */

function fireflies(c: C, k: FxKit, front: boolean) {
  for (let i = 0; i < 6; i++) {
    const a = k.t / (1700 + i * 260) + i * 2.4;
    if (Math.sin(a) >= 0 !== front) continue;
    const x = sx(k, k.X(12) + Math.cos(a) * (11 + (i % 3)) * k.s);
    const y = sy(k, k.Y(4 + (i % 3) * 8) + Math.sin(a * 1.7 + i) * 5 * k.s);
    const p = 0.5 + 0.5 * Math.sin(k.t / 350 + i * 1.9);
    k.glow(x + k.s / 2, y + k.s / 2, 3.5 * k.s, "255,236,120", 0.15 + 0.35 * p);
    rect(c, x, y, k.s, k.s, "#fff7b0", 0.45 + 0.55 * p);
  }
}

/* ---------- Star orbit ---------- */

function starRing(c: C, k: FxKit) {
  const s = k.s;
  const cx = k.X(12);
  const cy = k.Y(20);
  const rx = 13 * s;
  const ry = 3 * s;
  k.orbit(
    5,
    1100,
    (x, y, i) => {
      // A short sparkly trail behind each star.
      const ang = Math.atan2((y - cy) / ry, (x - cx) / rx);
      for (let j = 1; j <= 3; j++) {
        const b = ang - j * 0.16;
        rect(
          c,
          sx(k, cx + Math.cos(b) * rx),
          sy(k, cy + Math.sin(b) * ry),
          s,
          s,
          "#fff1a8",
          0.5 - j * 0.13,
        );
      }
      k.glow(x + s / 2, y + s / 2, 4 * s, "255,214,102", 0.35);
      const tw = 0.75 + 0.25 * Math.sin(k.t / 180 + i * 2);
      k.star(sx(k, x), sy(k, y), s, i % 2 ? "#ffd84d" : "#fff6c8", tw);
    },
    cx,
    cy,
    rx,
    ry,
  );
}

/* ---------- Butterflies ---------- */

const WINGS = [
  ["#ff8fc8", "#ffd1e8", "255,143,200"],
  ["#b48cff", "#e2d4ff", "180,140,255"],
  ["#6fc3ff", "#cdeeff", "111,195,255"],
];

function butterflies(c: C, k: FxKit, front: boolean) {
  const s = k.s;
  for (let i = 0; i < 3; i++) {
    const a = k.t / (2400 + i * 500) + i * 2.1;
    if (Math.sin(a) >= 0 !== front) continue;
    const x = sx(k, k.X(12) + Math.cos(a) * (12 + i) * s);
    const y = sy(k, k.Y(4 + i * 7) + Math.sin(a * 2 + i) * 3 * s);
    const [w1, w2, rgb] = WINGS[i];
    if (front) k.glow(x + s / 2, y, 4 * s, rgb, 0.18);
    if (Math.floor(k.t / 110 + i * 1.7) % 2 === 0) {
      rect(c, x - 2 * s, y - 2 * s, 2 * s, 2 * s, w1);
      rect(c, x + s, y - 2 * s, 2 * s, 2 * s, w1);
      rect(c, x - s, y, s, s, w2);
      rect(c, x + s, y, s, s, w2);
    } else {
      rect(c, x - s, y - 2 * s, s, 2 * s, w1);
      rect(c, x + s, y - 2 * s, s, 2 * s, w1);
    }
    rect(c, x, y - s, s, 3 * s, "#4a3550");
  }
}

/* ---------- Galaxy ---------- */

/** Fixed twinkle spots around the body (grid coords). */
const SKY = [
  [-1, 2],
  [23, 0],
  [1, 14],
  [24, 11],
  [0, 26],
  [22, 25],
  [4, -4],
  [19, -5],
  [25, 19],
  [-2, 20],
];

function nebula(c: C, k: FxKit) {
  const s = k.s;
  const cols = ["#b07cff", "#ff7ad9", "#6fb6ff", "#e6d6ff"];
  k.orbit(
    16,
    2800,
    (x, y, i) => {
      if (i % 4 === 0) k.glow(x, y, 3 * s, "180,120,255", 0.25);
      rect(c, sx(k, x), sy(k, y), s, s, cols[i % 4], 0.75);
    },
    k.X(12),
    k.Y(21),
    14 * s,
    3.5 * s,
  );
  // A tiny ringed planet on a slower, higher orbit.
  k.orbit(
    1,
    4000,
    (x, y) => {
      const px = sx(k, x);
      const py = sy(k, y);
      rect(c, px - s, py + s, 4 * s, s, "#ffe0a8", 0.9);
      rect(c, px, py, 2 * s, 2 * s, "#ffb86b");
      rect(c, px, py, s, s, "#ffe6c4");
    },
    k.X(12),
    k.Y(8),
    15 * s,
    2.5 * s,
  );
}

/* ---------- Lightning ---------- */

function sparks(c: C, k: FxKit, front: boolean) {
  const s = k.s;
  const tick = Math.floor(k.t / 110);
  for (let j = front ? 1 : 0; j < 6; j += 2) {
    if (rnd(tick * 7 + j) < 0.4) continue;
    const ang = rnd(tick * 13 + j) * Math.PI * 2;
    const x = sx(k, k.X(12) + Math.cos(ang) * (10 + rnd(tick + j) * 3) * s);
    const y = sy(k, k.Y(14) + Math.sin(ang) * 15 * s);
    const dir = rnd(tick * 3 + j) < 0.5 ? 1 : -1;
    [0, 1, 0, 1].forEach((o, n) =>
      rect(c, x + o * dir * s, y + n * s, s, s, n === 1 ? "#ffffff" : "#9fdcff", 0.95),
    );
  }
}

function bolt(c: C, k: FxKit) {
  const s = k.s;
  const p = k.t % 2600;
  if (!(p < 70 || (p > 110 && p < 220))) return;
  const seed = Math.floor(k.t / 2600);
  const base = seed % 2 ? 22 : 1;
  k.glow(k.X(base), k.Y(4), 10 * s, "180,225,255", 0.35);
  let off = 0;
  let dir = 1;
  for (let r = 0; r < 20; r++) {
    if (rnd(seed * 17 + r) < 0.3) dir = -dir;
    if (r % 2) off = Math.max(-2, Math.min(2, off + dir));
    const x = k.X(base + off);
    const y = k.Y(r - 5);
    rect(c, x - s, y, 3 * s, s, "#7fd0ff", 0.6);
    rect(c, x, y, s, s, "#ffffff");
  }
}

export const EFFECT: CategoryItems = {
  items: [
    { id: "bubbles", name: "Bubbles", tier: "free" },
    { id: "leaves", name: "Leaves", tier: "free" },
    { id: "notes", name: "Music notes", tier: "free" },
    { id: "fireflies", name: "Fireflies", tier: "coins", price: 80 },
    { id: "confetti", name: "Confetti", tier: "coins", price: 100 },
    { id: "starorbit", name: "Star orbit", tier: "plus" },
    { id: "raincloud", name: "Rain cloud", tier: "plus" },
    { id: "butterflies", name: "Butterflies", tier: "plus" },
    { id: "galaxy", name: "Galaxy aura", tier: "pro" },
    { id: "lightning", name: "Lightning", tier: "pro" },
  ],
  draw: {
    bubbles: {
      animated: true,
      // Soap bubbles drifting up from the legs and popping near the head.
      fxFront: (c, k) =>
        k.particles(6, 3200, (i, ph) => {
          const x = sx(k, k.X(1 + ((i * 7) % 21)) + Math.sin(ph * 7 + i) * 1.5 * k.s);
          const y = sy(k, k.Y(26 - ph * 30));
          bubble(c, k.s, x, y, i % 3 === 0, 0.85 * fade(ph, 0.15));
        }),
    },
    leaves: {
      animated: true,
      // Green leaves swaying down past the avatar.
      fxFront: (c, k) =>
        k.particles(6, 4200, (i, ph) => {
          const s = k.s;
          const x = sx(k, k.X(((i * 37) % 26) - 1) + Math.sin(ph * 5 + i) * 2.5 * s);
          const y = sy(k, k.Y(ph * 38 - 6));
          const col = ["#7cc96b", "#4fa84a", "#a8d86a"][i % 3];
          const a = fade(ph, 0.15);
          if (Math.floor(ph * 8 + i) % 2) {
            rect(c, x, y, 2 * s, s, col, a);
            rect(c, x + s, y + s, 2 * s, s, col, a);
            rect(c, x, y, s, s, "#3d8a3a", a);
          } else {
            rect(c, x + s, y, 2 * s, s, col, a);
            rect(c, x + s, y + s, s, s, col, a);
            rect(c, x, y + s, s, s, "#3d8a3a", a);
          }
        }),
    },
    notes: {
      animated: true,
      // Little ♪ and ♫ notes floating up beside the head.
      fxFront: (c, k) =>
        k.particles(4, 2800, (i, ph) => {
          const side = i % 2 ? 1 : -1;
          const base = i % 2 ? k.X(20) : k.X(0);
          const x = sx(k, base + (Math.sin(ph * 6 + i) * 2 + side * ph * 2) * k.s);
          const y = sy(k, k.Y(10 - ph * 16));
          const col = ["#a77de0", "#ff6fae", "#5aa9e6", "#ff9b3d"][i % 4];
          note(c, k.s, x, y, col, i % 3 === 2, fade(ph, 0.3));
        }),
    },
    fireflies: {
      animated: true,
      // Soft glowing dots wandering around, some passing behind the avatar.
      fxBehind: (c, k) => fireflies(c, k, false),
      fxFront: (c, k) => fireflies(c, k, true),
    },
    confetti: {
      animated: true,
      // Colourful bits tumbling down.
      fxFront: (c, k) =>
        k.particles(10, 2600, (i, ph) => {
          const s = k.s;
          const x = sx(k, k.X(((i * 29) % 26) - 1) + Math.sin(ph * 6 + i * 1.3) * 2 * s);
          const y = sy(k, k.Y(ph * 38 - 6));
          const col = ["#ff5a7a", "#ffd84d", "#4fc3f7", "#7ed957", "#b48cff"][i % 5];
          const a = fade(ph, 0.2);
          const flip = Math.floor(k.t / 150 + i) % 3;
          if (flip === 0) rect(c, x, y, 2 * s, s, col, a);
          else if (flip === 1) rect(c, x, y, s, 2 * s, col, a);
          else rect(c, x, y, s, s, col, a);
        }),
    },
    starorbit: {
      animated: true,
      // Five glowing stars with sparkly trails circling the waist.
      fxBehind: (c, k) => starRing(c, k),
      fxFront: (c, k) => {
        starRing(c, k);
        k.particles(3, 1800, (i, ph) =>
          k.star(
            k.X([1, 21, 3][i]),
            k.Y([4, 9, 15][i]),
            Math.max(1, Math.round(k.s / 2)),
            "#fff6c8",
            Math.sin(ph * Math.PI) * 0.9,
          ),
        );
      },
    },
    raincloud: {
      animated: true,
      // A tiny smiling cloud beside the head, sprinkling a gentle drizzle.
      fxFront: (c, k) => {
        const s = k.s;
        const L = k.X(15);
        const T = k.Y(-6) + (Math.sin(k.t / 600) > 0 ? 0 : s);
        k.particles(5, 900, (i, ph) => {
          const x = k.X(16 + ((i * 3) % 8));
          const y = T + 4 * s + Math.round(ph * 9) * s;
          rect(c, x, y, s, 2 * s, "#7cc8ff", 0.85 * (1 - ph));
          if (ph > 0.85) {
            rect(c, x - s, y + s, s, s, "#bfe6ff", 0.6);
            rect(c, x + s, y + s, s, s, "#bfe6ff", 0.6);
          }
        });
        rect(c, L + 2 * s, T, 3 * s, s, "#ffffff", 0.95);
        rect(c, L + 6 * s, T, 2 * s, s, "#ffffff", 0.95);
        rect(c, L + s, T + s, 8 * s, s, "#f4f8ff", 0.95);
        rect(c, L, T + 2 * s, 10 * s, s, "#f4f8ff", 0.95);
        rect(c, L + s, T + 3 * s, 8 * s, s, "#cfdcf2", 0.95);
        const blink = k.t % 3000 < 140;
        rect(c, L + 3 * s, T + s, s, blink ? s / 2 : s, "#5a6b8a");
        rect(c, L + 6 * s, T + s, s, blink ? s / 2 : s, "#5a6b8a");
        rect(c, L + 4 * s, T + 2 * s, 2 * s, s, "#5a6b8a");
        rect(c, L + 2 * s, T + 2 * s, s, s, "#ffb3c8");
        rect(c, L + 7 * s, T + 2 * s, s, s, "#ffb3c8");
      },
    },
    butterflies: {
      animated: true,
      // Three butterflies fluttering around, flying behind and in front.
      fxBehind: (c, k) => butterflies(c, k, false),
      fxFront: (c, k) => butterflies(c, k, true),
    },
    galaxy: {
      animated: true,
      // Purple-blue space glow, twinkling stars, a shooting star and a nebula ring.
      fxBehind: (c, k) => {
        const s = k.s;
        const cx = k.X(12);
        k.glow(cx, k.Y(15), 18 * s, "76,48,170", 0.26 + Math.sin(k.t / 700) * 0.05);
        k.glow(cx + Math.sin(k.t / 1300) * 3 * s, k.Y(20), 12 * s, "40,110,230", 0.18);
        k.glow(cx - 5 * s, k.Y(8), 8 * s, "200,80,220", 0.12 + Math.sin(k.t / 900) * 0.05);
        SKY.forEach(([gx, gy], j) => {
          const tw = Math.sin(k.t / (380 + j * 40) + j * 2.3);
          if (tw <= 0) return;
          if (j % 3 === 0) k.star(k.X(gx), k.Y(gy), Math.max(1, Math.round(s / 2)), "#ffffff", tw);
          else rect(c, k.X(gx), k.Y(gy), s, s, "#dfe6ff", tw);
        });
        const p = (k.t % 4200) / 700;
        if (p < 1) {
          const hx = k.X(Math.round(-1 + p * 24));
          const hy = k.Y(Math.round(-4 + p * 8));
          for (let j = 0; j < 5; j++)
            rect(c, hx - j * 3 * s, hy - j * s, 3 * s, s, "#e6ecff", (1 - j / 5) * (1 - p));
        }
        nebula(c, k);
      },
      fxFront: (c, k) => {
        nebula(c, k);
        k.particles(3, 2400, (i, ph) =>
          rect(
            c,
            k.X([2, 22, 12][i]),
            k.Y([6, 16, 29][i]),
            k.s,
            k.s,
            "#ffffff",
            Math.sin(ph * Math.PI),
          ),
        );
      },
    },
    lightning: {
      animated: true,
      // Flickering blue-white glow, crackling sparks, fast orbs and a bolt now and then.
      fxBehind: (c, k) => {
        const s = k.s;
        const flash = k.t % 2600 < 220 ? 0.1 : 0;
        k.glow(
          k.X(12),
          k.Y(15),
          17 * s,
          "110,190,255",
          0.12 + rnd(Math.floor(k.t / 80)) * 0.06 + flash,
        );
        sparks(c, k, false);
        k.orbit(
          4,
          380,
          (x, y) => rect(c, sx(k, x), sy(k, y), s, s, "#bfe9ff", 0.9),
          k.X(12),
          k.Y(20),
          12 * s,
          3 * s,
        );
      },
      fxFront: (c, k) => {
        const s = k.s;
        sparks(c, k, true);
        k.orbit(
          4,
          380,
          (x, y) => {
            k.glow(x + s / 2, y + s / 2, 3 * s, "150,210,255", 0.3);
            rect(c, sx(k, x), sy(k, y), s, s, "#ffffff");
          },
          k.X(12),
          k.Y(20),
          12 * s,
          3 * s,
        );
        bolt(c, k);
      },
    },
  },
};
