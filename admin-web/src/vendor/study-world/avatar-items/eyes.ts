import type { CategoryItems, Painter } from "./types";

/*
 * New eyes items (see types.ts for how drawing works).
 *
 * Eyes are only drawn in the front / three-quarter view. The two built-in eye
 * spots are x = 7+fx and 15+fx (2 wide), rows 9–11. Bigger 3-wide eyes use
 * wideL / wideR so they stay mirror-even facing front and don't poke past the
 * edge of the face (x 18) in the three-quarter view.
 */

const WHITE = "#ffffff";

/** The two normal eye spots (left, right). */
const spots = (p: Painter) => [7 + p.fx, 15 + p.fx];
/** Left x of a 3-wide eye: left eye grows outwards, right eye stays on the face. */
const wideL = (p: Painter) => 6 + p.fx;
const wideR = (p: Painter) => (p.fx ? 16 : 15);
const wides = (p: Painter) => [wideL(p), wideR(p)];

/** Hue (0–360) of a #hex colour; falls back to blue for anything else. */
function hueOf(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 210;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (!d) return 210;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Blend two #hex colours (k = 0 gives a, 1 gives b). */
function mix(a: string, b: string, k: number) {
  const ca = parseInt(a.replace("#", ""), 16);
  const cb = parseInt(b.replace("#", ""), 16);
  if (Number.isNaN(ca) || Number.isNaN(cb)) return b;
  const ch = (s: number) =>
    Math.round(((ca >> s) & 255) * (1 - k) + ((cb >> s) & 255) * k)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** hsl() → #hex, so the result can be blended with mix(). */
function hslHex(h: number, s: number, l: number) {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) =>
    Math.round((L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${f(0)}${f(8)}${f(4)}`;
}

export const EYES: CategoryItems = {
  items: [
    { id: "big", name: "Big eyes", tier: "free" },
    { id: "smile", name: "Smiling", tier: "free" },
    { id: "focus", name: "Focused", tier: "free" },
    { id: "lashes", name: "Lashes", tier: "free" },
    { id: "teary", name: "Teary", tier: "coins", price: 30 },
    { id: "sly", name: "Sly", tier: "coins", price: 40 },
    { id: "hearteyes", name: "Heart eyes", tier: "plus" },
    { id: "anime", name: "Anime shine", tier: "plus" },
    { id: "dizzy", name: "Swirl eyes", tier: "plus" },
    { id: "glow", name: "Glowing eyes", tier: "pro" },
    { id: "rainbow", name: "Rainbow eyes", tier: "pro" },
  ],
  draw: {
    // Larger, rounder eyes: 3 wide, 4 tall, one big shine.
    big: {
      draw: (p) => {
        wides(p).forEach((x) => {
          p.R(x, 8, 3, 1, p.ink);
          p.R(x, 9, 3, 3, p.ec);
          p.R(x, 11, 3, 1, p.shade(p.ec, 0.22));
          p.px(x + 1, 10, p.shade(p.ec, -0.3));
          p.px(x, 9, WHITE);
          p.px(x + 2, 11, WHITE);
        });
      },
    },

    // Closed, pointy happy ^ ^ (sharper than the built-in rounded "happy").
    smile: {
      noBlink: true,
      draw: (p) => {
        wides(p).forEach((x) => {
          p.px(x - 1, 11, p.ink);
          p.px(x, 10, p.ink);
          p.px(x + 1, 9, p.ink);
          p.px(x + 2, 10, p.ink);
          if (x + 3 <= 19) p.px(x + 3, 11, p.ink);
        });
      },
    },

    // Determined: pupils toward the middle, brows angled down by the nose.
    focus: {
      draw: (p) => {
        const [a, b] = spots(p);
        [a, b].forEach((x) => {
          p.R(x, 9, 2, 3, p.ec);
          p.R(x, 9, 2, 1, p.ink);
          p.px(x, 10, WHITE);
        });
        // Pupils look inward a little.
        p.px(a + 1, 11, p.shade(p.ec, -0.35));
        p.px(b, 11, p.shade(p.ec, -0.35));
        // Brows slope down into the lids by the nose (kept at row 8 so
        // fringes don't hide them).
        p.R(a, 8, 2, 1, p.ink);
        p.px(a + 2, 9, p.ink);
        p.R(b, 8, 2, 1, p.ink);
        p.px(b - 1, 9, p.ink);
      },
    },

    // Round eyes with flicked lashes at the outer corners.
    lashes: {
      draw: (p) => {
        const [a, b] = spots(p);
        [a, b].forEach((x) => {
          p.R(x, 9, 2, 3, p.ec);
          p.R(x, 9, 2, 1, p.ink);
          p.px(x, 10, WHITE);
          p.px(x + 1, 11, p.shade(p.ec, 0.25));
        });
        p.px(a - 1, 9, p.ink);
        p.px(a - 1, 8, p.ink);
        p.px(a, 8, p.ink);
        p.px(b + 2, 9, p.ink);
        p.px(b + 1, 8, p.ink);
        if (b + 2 <= 18) p.px(b + 2, 8, p.ink);
      },
    },

    // Watery eyes: a wobbling shine, a wet lower rim and a tear at the corner.
    teary: {
      animated: true,
      draw: (p) => {
        const [a, b] = spots(p);
        const wob = Math.sin(p.t / 260) > 0;
        [a, b].forEach((x) => {
          p.R(x, 9, 2, 3, p.ec);
          p.R(x, 9, 2, 1, p.ink);
          p.R(x, 11, 2, 1, "#9fd8ff");
          p.px(wob ? x : x + 1, 10, WHITE);
          p.px(wob ? x + 1 : x, 11, "#e8f8ff");
        });
        // Tears gather at the outer corners, then roll a pixel down.
        const drop = Math.floor(p.t / 700) % 3;
        p.px(a - 1, 11 + (drop === 2 ? 1 : 0), "#8fd3ff");
        if (drop > 0) p.px(b + 2, 11, "#8fd3ff");
      },
    },

    // Half-lidded smirk: heavy lids, eyes glancing sideways, one brow.
    sly: {
      draw: (p) => {
        const [a, b] = spots(p);
        [a, b].forEach((x) => {
          p.R(x, 9, 2, 1, p.skS);
          p.R(x, 10, 2, 1, p.ink);
          p.R(x, 11, 2, 1, p.ec);
          p.px(x + 1, 11, p.shade(p.ec, -0.35));
        });
        p.px(a - 1, 10, p.ink);
        if (b + 2 <= 18) p.px(b + 2, 10, p.ink);
        // One arched brow (row 8, so fringes don't hide it) for the smirk.
        p.R(b, 8, 2, 1, p.ink);
        if (b + 2 <= 18) p.px(b + 2, 9, p.ink);
      },
    },

    // Beating pink hearts with a shine.
    hearteyes: {
      animated: true,
      draw: (p) => {
        const beat = Math.sin(p.t / 170) > 0.4;
        const c = beat ? "#ff3d8b" : "#ff5f9e";
        const dk = "#d42a6f";
        wides(p).forEach((x, i) => {
          p.px(x, 8, c);
          p.px(x + 2, 8, c);
          p.R(x, 9, 3, 1, c);
          p.R(x, 10, 3, 1, c);
          p.px(x + 1, 11, dk);
          p.px(x + 2, 10, dk);
          p.px(x, 9, "#ffd1e8");
          // Fill the dip on the beat so the heart "swells".
          if (beat) p.px(x + 1, 8, c);
          // Tiny sparkle that hops between the eyes.
          if (Math.sin(p.t / 300 + i * 3) > 0.7) p.px(x + 1, 8, "#fff6fb");
        });
      },
    },

    // Big sparkly anime eyes: dark-to-light gradient, pupil, two shines, lashes.
    anime: {
      animated: true,
      draw: (p) => {
        const top = p.shade(p.ec, -0.32);
        const low = p.shade(p.ec, 0.3);
        const twinkle = Math.sin(p.t / 380) > 0.5;
        const [l, r] = wides(p);
        [l, r].forEach((x) => {
          p.R(x, 8, 3, 1, p.ink);
          p.R(x, 9, 3, 1, top);
          p.R(x, 10, 3, 1, p.ec);
          p.R(x, 11, 3, 1, low);
          p.px(x + 1, 10, p.shade(p.ec, -0.5));
          // Big shine top-left, small shine bottom-right.
          p.px(x, 9, WHITE);
          p.px(x + 2, 10, twinkle ? WHITE : "#eaf6ff");
          p.px(x + 1, 11, p.shade(p.ec, 0.5));
        });
        // Lash wings.
        p.px(l - 1, 8, p.ink);
        p.px(l - 1, 9, p.ink);
        if (r + 3 <= 18) {
          p.px(r + 3, 8, p.ink);
          p.px(r + 3, 9, p.ink);
        }
        if (twinkle) p.px(l, 7, "#fff6c8");
      },
    },

    // Spinning cartoon swirls.
    dizzy: {
      animated: true,
      draw: (p) => {
        // The 8 cells around the middle of a 3×3 block, clockwise.
        const ring: [number, number][] = [
          [0, 0],
          [1, 0],
          [2, 0],
          [2, 1],
          [2, 2],
          [1, 2],
          [0, 2],
          [0, 1],
        ];
        const k = Math.floor(p.t / 90) % 8;
        wides(p).forEach((x, e) => {
          p.R(x, 9, 3, 3, WHITE);
          p.R(x, 8, 3, 1, p.ink);
          ring.forEach(([dx, dy], i) => {
            // Each eye spins the opposite way for extra dizziness.
            const j = (e ? k - i + 16 : i - k + 16) % 8;
            if (j < 3) p.px(x + dx, 9 + dy, p.ink);
            else if (j < 5) p.px(x + dx, 9 + dy, p.ec);
          });
          p.px(x + 1, 10, p.ink);
        });
      },
    },

    // Eyes that glow in their own colour, with a pulsing halo on the skin.
    glow: {
      animated: true,
      draw: (p) => {
        const h = hueOf(p.ec);
        const core = hslHex(h, 100, 86);
        const mid = hslHex(h, 95, 62);
        const pulse = 0.35 + 0.2 * Math.sin(p.t / 240);
        const halo = mix(p.sk, mid, pulse);
        const halo2 = mix(p.sk, mid, pulse * 0.5);
        spots(p).forEach((x) => {
          // Halo around the eye (skipped where it would leave the face).
          // Strongest beside the middle of the eye, fading at the corners.
          for (let y = 9; y <= 11; y++) {
            const c = y === 10 ? halo : halo2;
            p.px(x - 1, y, c);
            if (x + 2 <= 18) p.px(x + 2, y, c);
          }
          p.R(x, 8, 2, 1, halo2);
          p.R(x, 12, 2, 1, halo2);
          // The eye itself.
          p.R(x, 9, 2, 3, mid);
          p.R(x, 10, 2, 1, core);
          p.px(x, 9, WHITE);
        });
        // A spark drifts up off the near eye now and then.
        const ph = (p.t / 1400) % 1;
        if (ph < 0.5) p.px(spots(p)[0] - 1, 8 - Math.floor(ph * 6), core);
      },
    },

    // Iris colour cycles through the rainbow.
    rainbow: {
      animated: true,
      draw: (p) => {
        const base = p.t / 9;
        const [l, r] = wides(p);
        [l, r].forEach((x, e) => {
          p.R(x, 8, 3, 1, p.ink);
          for (let y = 9; y <= 11; y++)
            for (let i = 0; i < 3; i++)
              p.px(x + i, y, p.hsl((base + y * 28 + i * 14 + e * 40) % 360, 85, 50 + (y - 9) * 9));
          p.px(x + 1, 10, p.hsl((base + 180) % 360, 70, 22));
          p.px(x, 9, WHITE);
          p.px(x + 2, 11, "#fff6c8");
        });
        p.px(l - 1, 8, p.ink);
        if (r + 3 <= 18) p.px(r + 3, 8, p.ink);
      },
    },
  },
};
