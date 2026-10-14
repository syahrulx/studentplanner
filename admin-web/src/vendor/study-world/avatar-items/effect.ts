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

/* ---------- Lantern spirits ---------- */

/** A little brass pelita (oil lamp) with a flickering flame; (x, y) is its top-left. */
function pelita(c: C, s: number, x: number, y: number, flick: number, a: number) {
  const tip = flick % 3;
  if (tip !== 2) rect(c, x + (tip ? 2 : 0) * s, y - s, s, s, "#ffb13d", a);
  rect(c, x + s, y, s, s, "#ff7a2f", a);
  rect(c, x + s, y + s, s, s, flick % 2 ? "#ffd84d" : "#ffe9a0", a);
  rect(c, x, y + 2 * s, 3 * s, s, "#ff9b3d", a);
  rect(c, x + s, y + 2 * s, s, s, "#fff6c8", a);
  // Brass cup with a lip.
  rect(c, x - s, y + 3 * s, 5 * s, s, "#f2c14e", a);
  rect(c, x, y + 4 * s, 3 * s, s, "#c47a2c", a);
  rect(c, x, y + 4 * s, s, s, "#e9a54d", a);
  rect(c, x + s, y + 5 * s, s, s, "#8f5424", a);
  rect(c, x, y + 6 * s, 3 * s, s, "#6b3b1a", a);
}

/** Five lamps on a tilted ring: low across the front, high behind the head. */
function lanterns(c: C, k: FxKit, front: boolean) {
  const s = k.s;
  const at = (b: number) => [k.X(12 + Math.cos(b) * 11.5), k.Y(12 + Math.sin(b) * 9)];
  for (let i = 0; i < 5; i++) {
    const a = k.t / 1500 + (i * Math.PI * 2) / 5;
    if (Math.sin(a) >= 0 !== front) continue;
    const [lx, ly] = at(a);
    const x = sx(k, lx) - s;
    const y = sy(k, ly + Math.sin(k.t / 420 + i * 1.3) * s) - 3 * s;
    const warm = 0.75 + 0.25 * Math.sin(k.t / 70 + i * 2.1) * Math.sin(k.t / 190 + i);
    // See-through for a moment while passing in front of the body.
    const al = front ? 1 - 0.3 * Math.max(0, 1 - Math.abs(Math.cos(a)) / 0.45) : 0.85;
    k.glow(x + 1.5 * s, y + 2 * s, 7 * s, "255,170,60", (front ? 0.45 : 0.3) * warm);
    // Two embers trailing behind each lamp.
    for (let j = 1; j <= 2; j++) {
      const [ex, ey] = at(a - j * 0.2);
      rect(c, sx(k, ex), sy(k, ey), s, s, j === 1 ? "#ffcf6b" : "#ff9b3d", (0.6 - j * 0.2) * warm);
    }
    pelita(c, s, x, y, Math.floor(k.t / 95 + i * 7), al);
  }
}

/* ---------- Sakura storm ---------- */

const PETALS = ["#ff8fb8", "#ffb7d0", "#ff6fa3", "#ffc9dc"];
/** The same petals in shadow, for the ones passing behind. */
const PETALS_BACK = ["#e0709c", "#e893b3", "#d9578a", "#eaa3bf"];

function sakuraStorm(c: C, k: FxKit, front: boolean) {
  const s = k.s;
  const dim = front ? 1 : 0.85;
  // Wind streaks whipping round, wider at the top like a whirlwind.
  for (let j = 0; j < 4; j++) {
    const base = k.t / 260 + j * 1.7;
    const gy = [1, 10, 19, 27][j];
    const rx = [13, 12, 11, 9][j];
    for (let m = 0; m < 12; m++) {
      const b = base - m * 0.09;
      if (Math.sin(b) >= 0 !== front) continue;
      // Streaks in front of the face would hide it.
      if (front && gy < 16 && Math.abs(Math.cos(b)) < 0.7) continue;
      rect(
        c,
        sx(k, k.X(12 + Math.cos(b) * rx)),
        sy(k, k.Y(gy + Math.sin(b) * 2)),
        s,
        s,
        m < 3 ? "#ffe3ee" : "#ffb7d0",
        (0.9 - m * 0.07) * dim,
      );
    }
  }
  // Petals spiralling up and out along three strands.
  for (let i = 0; i < 36; i++) {
    const ph = (k.t / 2400 + i / 36) % 1;
    const a = ph * Math.PI * 5 + ((i % 3) * Math.PI * 2) / 3 + Math.sin(i * 7.3) * 0.35;
    if (Math.sin(a) >= 0 !== front) continue;
    const rx = 5 + ph * 7 + Math.sin(i * 3.1) * 0.8;
    const x = sx(k, k.X(12 + Math.cos(a) * rx));
    const y = sy(k, k.Y(31 - ph * 37 + Math.sin(a) * 2));
    const col = (front ? PETALS : PETALS_BACK)[i % 4];
    // Petals crossing in front of the face are see-through.
    const face = front && Math.abs(Math.cos(a) * rx) < 7 && ph > 0.42 && ph < 0.8;
    const al = fade(ph, 0.2) * (face ? 0.5 : 1);
    const flip = Math.floor(k.t / 120 + i) % 4;
    const tip = front ? "#ffe3ee" : col;
    if (flip === 0) {
      rect(c, x, y, 2 * s, s, col, al);
      rect(c, x + s, y + s, s, s, col, al);
      rect(c, x, y, s, s, tip, al);
    } else if (flip === 1) {
      rect(c, x, y, s, 2 * s, col, al);
      rect(c, x + s, y, s, s, tip, al);
    } else if (flip === 2) rect(c, x, y, 2 * s, s, col, al);
    else rect(c, x, y, s, s, col, al);
  }
}

/* ---------- Trophy aura ---------- */

/** A gold cup; `thin` is the side-on frame while it spins. (x, y) is its top-left. */
function trophy(c: C, s: number, x: number, y: number, thin: boolean) {
  if (thin) {
    rect(c, x + s, y, 3 * s, s, "#ffe27a");
    rect(c, x + s, y + s, 3 * s, 2 * s, "#e0a82e");
    rect(c, x + 2 * s, y + s, s, 2 * s, "#fff3b0");
  } else {
    rect(c, x, y, 5 * s, s, "#ffe27a");
    rect(c, x, y + s, s, 2 * s, "#d99a22");
    rect(c, x + 4 * s, y + s, s, 2 * s, "#d99a22");
    rect(c, x + s, y + s, 3 * s, 2 * s, "#f5c542");
    rect(c, x + s, y + s, s, 2 * s, "#fff3b0");
  }
  rect(c, x + s, y + 3 * s, 3 * s, s, "#e0a82e");
  rect(c, x + 2 * s, y + 4 * s, s, s, "#c98a1e");
  rect(c, x + s, y + 5 * s, 3 * s, s, "#b9821f");
  rect(c, x + (thin ? s : 0), y + 6 * s, (thin ? 3 : 5) * s, s, "#7a4f12");
}

/** A medal on a red-and-blue ribbon; `thin` while it spins. */
function medal(c: C, s: number, x: number, y: number, thin: boolean) {
  rect(c, x, y, s, s, "#e2574c");
  rect(c, x + 3 * s, y, s, s, "#4f8de0");
  rect(c, x + s, y + s, s, s, "#e2574c");
  rect(c, x + 2 * s, y + s, s, s, "#4f8de0");
  if (thin) {
    rect(c, x + s, y + 2 * s, 2 * s, 4 * s, "#d99a22");
    rect(c, x + s, y + 2 * s, s, 3 * s, "#ffe27a");
    return;
  }
  rect(c, x + s, y + 2 * s, 2 * s, s, "#ffe27a");
  rect(c, x, y + 3 * s, 4 * s, 2 * s, "#f5c542");
  rect(c, x + s, y + 3 * s, s, s, "#fff3b0");
  rect(c, x + 3 * s, y + 3 * s, s, 2 * s, "#d99a22");
  rect(c, x + s, y + 5 * s, 2 * s, s, "#b9821f");
}

/** Where the four prizes hover (grid x, y): beside the head and the legs. */
const PRIZES = [
  [0.5, 4],
  [23.5, 7],
  [0.5, 18],
  [22.5, 21],
];

function trophies(c: C, k: FxKit) {
  const s = k.s;
  PRIZES.forEach(([gx, gy], i) => {
    const x = sx(k, k.X(gx + Math.sin(k.t / 1300 + i * 2) * 0.7)) - 2 * s;
    const y = sy(k, k.Y(gy + Math.sin(k.t / 650 + i * 1.7) * 1.2)) - 3 * s;
    const spin = (k.t + i * 900) % 3600 < 240;
    k.glow(x + 2.5 * s, y + 3 * s, 5 * s, "255,210,90", 0.35);
    if (i % 3 === 0) trophy(c, s, x, y, spin);
    else medal(c, s, x, y, spin);
    // A glint sweeping across now and then.
    const g = (k.t + i * 650) % 2600;
    if (g < 360)
      k.star(
        x + (i % 3 === 0 ? 4 : 3) * s,
        y + (i % 3 === 0 ? 1 : 3) * s,
        Math.max(1, Math.round(s / 2)),
        "#ffffff",
        Math.sin((g / 360) * Math.PI),
      );
  });
}

/** Gold dust circling the waist (both sides, by depth). */
function goldDust(c: C, k: FxKit) {
  k.orbit(
    10,
    1700,
    (x, y, i) => rect(c, sx(k, x), sy(k, y), k.s, k.s, i % 2 ? "#ffe27a" : "#fff6c8", 0.85),
    k.X(12),
    k.Y(20),
    12 * k.s,
    3 * k.s,
  );
}

/* ---------- Black hole ---------- */

/**
 * The swirling portal behind the avatar, drawn cell by cell on the grid:
 * a dark void, a bright shimmering accretion ring just outside the body,
 * and purple spiral arms fading out beyond it.
 */
function vortex(c: C, k: FxKit) {
  const s = k.s;
  const CX = 12;
  const CY = 12.5;
  const RX = 14;
  const RY = 17.5;
  for (let gy = -5; gy < 30; gy++)
    for (let gx = -2; gx < 26; gx++) {
      const dx = (gx + 0.5 - CX) / RX;
      const dy = (gy + 0.5 - CY) / RY;
      const r = Math.hypot(dx, dy);
      if (r > 1) continue;
      const ang = Math.atan2(dy, dx);
      // Spiral arms that wind in towards the middle and turn over time.
      const arm = Math.sin(ang * 3 + Math.log(r + 0.04) * 6 + k.t / 260);
      if (r < 0.73) {
        const swirl = arm > 0.4 && r > 0.3;
        rect(c, k.X(gx), k.Y(gy), s, s, swirl ? "#2b0f5c" : "#0b0418", 0.92);
      } else if (r < 0.8) {
        const sh = Math.sin(ang * 4 - k.t / 150);
        const col = sh > 0.55 ? "#ffffff" : sh > -0.35 ? "#f5d2ff" : "#c88cff";
        rect(c, k.X(gx), k.Y(gy), s, s, col);
      } else if (r < 0.85) {
        rect(c, k.X(gx), k.Y(gy), s, s, arm > 0 ? "#b47aff" : "#7d3fe0", 0.95);
      } else if (arm > -0.25) {
        const col = arm > 0.75 ? "#e6ccff" : arm > 0.3 ? "#a86bff" : "#5a24b8";
        rect(c, k.X(gx), k.Y(gy), s, s, col, Math.min(0.95, (1 - r) / 0.1));
      }
    }
  // Sparks pulled in along the spiral to the ring.
  k.particles(8, 1900, (i, ph) => {
    const r = 1.05 - ph * 0.25;
    const ang = i * 0.8 - ph * 2.6 - k.t / 1500;
    rect(
      c,
      sx(k, k.X(CX + Math.cos(ang) * r * RX)),
      sy(k, k.Y(CY + Math.sin(ang) * r * RY)),
      s,
      s,
      i % 2 ? "#ffffff" : "#ffb8f0",
      fade(ph, 0.25),
    );
  });
}

/** Rocks and sparks on a tilted orbit round the waist; front/back by depth. */
function debris(c: C, k: FxKit, front: boolean) {
  const s = k.s;
  for (let i = 0; i < 9; i++) {
    const lane = i % 3;
    const a = k.t / (700 + lane * 260) + i * 2.4;
    if (Math.sin(a) >= 0 !== front) continue;
    const rx = 11 + lane * 1.2;
    const at = (b: number) => [k.X(12 + Math.cos(b) * rx), k.Y(17 + Math.sin(b) * 3.5)];
    for (let j = 2; j >= 1; j--) {
      const [tx, ty] = at(a - j * 0.12);
      rect(c, sx(k, tx), sy(k, ty), s, s, "#c99bff", 0.45 - j * 0.15);
    }
    const [x, y] = at(a);
    const px = sx(k, x);
    const py = sy(k, y);
    const col = ["#ffffff", "#ffb8f0", "#b892ff"][lane];
    if (front && lane === 0) k.glow(px + s / 2, py + s / 2, 3 * s, "220,170,255", 0.35);
    rect(c, px, py, s, s, col);
    if (i % 4 === 0) rect(c, px + s, py, s, s, "#6b4a9e");
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
    { id: "lanterns", name: "Lantern Spirits", tier: "coins", price: 450 },
    { id: "sakurastorm", name: "Sakura Storm", tier: "coins", price: 480 },
    { id: "trophyaura", name: "Trophy Aura", tier: "coins", price: 400 },
    { id: "blackhole", name: "Black Hole", tier: "coins", price: 800 },
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
    lanterns: {
      animated: true,
      // Raya pelita lamps circling on a tilted ring, flames flickering with a warm glow.
      fxBehind: (c, k) => {
        k.glow(k.X(12), k.Y(14), 16 * k.s, "255,160,60", 0.1 + Math.sin(k.t / 600) * 0.03);
        lanterns(c, k, false);
      },
      fxFront: (c, k) => {
        lanterns(c, k, true);
        k.particles(5, 2400, (i, ph) =>
          rect(
            c,
            sx(k, k.X([2, 21, 6, 17, 12][i]) + Math.sin(ph * 6 + i) * k.s),
            sy(k, k.Y(22 - ph * 26)),
            k.s,
            k.s,
            i % 2 ? "#ffcf6b" : "#ff9b3d",
            0.8 * fade(ph, 0.4),
          ),
        );
      },
    },
    sakurastorm: {
      animated: true,
      // A whirlwind of sakura petals and wind streaks spiralling up round the avatar.
      fxBehind: (c, k) => {
        k.glow(k.X(12), k.Y(16), 16 * k.s, "255,170,205", 0.16);
        sakuraStorm(c, k, false);
      },
      fxFront: (c, k) => sakuraStorm(c, k, true),
    },
    trophyaura: {
      animated: true,
      // Gold trophies and medals hovering round the avatar, spinning and glinting in turn.
      fxBehind: (c, k) => {
        k.glow(k.X(12), k.Y(15), 15 * k.s, "255,200,80", 0.14 + Math.sin(k.t / 500) * 0.04);
        goldDust(c, k);
      },
      fxFront: (c, k) => {
        goldDust(c, k);
        trophies(c, k);
        k.particles(4, 2200, (i, ph) =>
          rect(
            c,
            sx(k, k.X([3, 20, 8, 15][i])),
            sy(k, k.Y(24 - ph * 22)),
            k.s,
            k.s,
            i % 2 ? "#ffe27a" : "#fff6c8",
            Math.sin(ph * Math.PI),
          ),
        );
      },
    },
    blackhole: {
      animated: true,
      // A swirling purple vortex with a bright accretion ring behind the avatar,
      // sparks spiralling in and debris orbiting round the waist.
      fxBehind: (c, k) => {
        k.glow(k.X(12), k.Y(13), 20 * k.s, "120,50,220", 0.3 + Math.sin(k.t / 500) * 0.06);
        vortex(c, k);
        debris(c, k, false);
      },
      fxFront: (c, k) => debris(c, k, true),
    },
  },
};
