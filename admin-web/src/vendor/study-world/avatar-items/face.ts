import type { CategoryItems, Painter } from "./types";

/*
 * New face items (see types.ts for how drawing works).
 *
 * Face items are drawn last, over the eyes, cheeks and mouth, front and
 * three-quarter view only. Eyes sit at x = 7+fx and 15+fx (2 wide, rows 9–11),
 * cheeks on row 12, mouth on row 13 at x 11+fx. The face is x 5–18 down to
 * row 13, x 6–17 on row 14 and x 7–16 on row 15; onFace() keeps things that
 * should stay on the skin from poking past the edge in the three-quarter view.
 */

const onFace = (x: number, y: number) =>
  y >= 2 &&
  y <= 15 &&
  x >= (y >= 15 ? 7 : y >= 14 ? 6 : 5) &&
  x <= (y >= 15 ? 16 : y >= 14 ? 17 : 18);

/** A pixel that's only drawn if it lands on the face. */
const dot = (p: Painter, x: number, y: number, c: string) => {
  if (onFace(x, y)) p.px(x, y, c);
};

/** A round lens frame around the eye at x (2 wide eye, rows 9–11). */
const ring = (p: Painter, x: number, c: string, hi: string) => {
  dot(p, x, 8, hi);
  dot(p, x + 1, 8, c);
  for (let y = 9; y <= 11; y++) {
    dot(p, x - 1, y, c);
    dot(p, x + 2, y, c);
  }
  dot(p, x, 12, c);
  dot(p, x + 1, 12, c);
};

/** Blend two #hex colours: k = 0 gives a, k = 1 gives b. */
const mix = (a: string, b: string, k: number) => {
  if (a[0] !== "#" || b[0] !== "#") return b;
  const A = parseInt(a.slice(1), 16);
  const B = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((A >> s) & 255) * (1 - k) + ((B >> s) & 255) * k);
  return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`;
};

/** A #hex colour from hue, saturation and lightness (0–360, 0–100, 0–100). */
const hslHex = (h: number, s: number, l: number) => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `#${((1 << 24) + (f(0) << 16) + (f(8) << 8) + f(4)).toString(16).slice(1)}`;
};

/**
 * One fluttering scarf tail running left from (x0, y0): a wave travels down
 * it and grows towards the tip. Two pixels thick, narrowing to one at the end.
 */
const scarfTail = (
  p: Painter,
  x0: number,
  y0: number,
  len: number,
  droop: number,
  phase: number,
  col: { c: string; s: string; l: string },
) => {
  let prev = y0;
  for (let i = 0; i < len; i++) {
    const a = p.t / 140 - i * 0.75 + phase;
    const y = y0 + Math.round(i * droop + Math.sin(a) * 1.4 * (i / len));
    const x = x0 - i;
    // Keep the tail joined up when the wave jumps more than a pixel.
    for (let yy = Math.min(prev, y) + 1; yy < Math.max(prev, y); yy++) p.px(x, yy, col.c);
    const tip = i === len - 1;
    p.px(x, y, Math.cos(a) > 0.2 ? col.l : col.c);
    if (!tip) p.px(x, y + 1, Math.cos(a) > 0.2 ? col.c : col.s);
    prev = y;
  }
};

export const FACE: CategoryItems = {
  items: [
    { id: "roundglasses", name: "Round glasses", tier: "free" },
    { id: "freckles", name: "Freckles", tier: "free" },
    { id: "mask", name: "Face mask", tier: "free" },
    { id: "bandaid", name: "Plaster", tier: "free" },
    { id: "monocle", name: "Monocle", tier: "coins", price: 50 },
    { id: "blush", name: "Blush stickers", tier: "coins", price: 50 },
    { id: "starstickers", name: "Star stickers", tier: "plus" },
    { id: "gamer", name: "Gamer visor", tier: "plus" },
    { id: "catwhiskers", name: "Whiskers", tier: "plus" },
    { id: "holo", name: "Holo glasses", tier: "pro" },
    { id: "kitsunemask", name: "Fox mask", tier: "pro" },
    { id: "ninjascarf", name: "Ninja Scarf", tier: "coins", price: 220 },
    { id: "holomask", name: "Holo Mask", tier: "coins", price: 280 },
  ],
  draw: {
    // Round tortoiseshell frames with a little bridge.
    roundglasses: {
      draw: (p) => {
        const fr = "#6b3f24";
        const a = 7 + p.fx;
        const b = 15 + p.fx;
        ring(p, a, fr, "#a8693c");
        ring(p, b, fr, "#a8693c");
        p.R(a + 3, 9, b - a - 4, 1, fr);
        // Arms back to the ears.
        dot(p, a - 2, 9, fr);
        if (!p.fx) dot(p, b + 3, 9, fr);
      },
    },

    // Light dots across both cheeks and the nose.
    freckles: {
      draw: (p) => {
        const c = p.shade(p.sk, -0.3);
        const f = p.fx;
        [
          [6, 12],
          [8, 12],
          [7, 13],
          [10, 12],
          [13, 12],
          [15, 12],
          [17, 12],
          [16, 13],
        ].forEach(([x, y]) => dot(p, x + f, y, c));
      },
    },

    // Pale blue surgical mask over the nose and mouth, with ear loops.
    mask: {
      draw: (p) => {
        const base = "#cfe8f2";
        const top = "#eef8fc";
        const pleat = "#a6cde0";
        const l = 6 + p.fx;
        const w = Math.min(12, 19 - l);
        p.R(l, 11, w, 3, base);
        p.R(l, 11, w, 1, top);
        p.R(l + 1, 12, w - 2, 1, pleat);
        const l14 = l + 1;
        p.R(l14, 14, Math.min(10, 18 - l14), 1, base);
        p.R(l14 + 1, 14, Math.min(8, 17 - l14 - 1), 1, pleat);
        // Nose wire and ear loops.
        p.R(l + 4, 11, 4, 1, "#ffffff");
        dot(p, l - 1, 10, top);
        dot(p, l - 1, 11, top);
        if (!p.fx) {
          dot(p, l + w, 10, top);
          dot(p, l + w, 11, top);
        }
      },
    },

    // A small diagonal plaster on the cheek.
    bandaid: {
      draw: (p) => {
        const tan = "#f3c99a";
        const pad = "#d9935c";
        const x = 5 + p.fx;
        p.R(x + 1, 12, 3, 1, tan);
        p.R(x, 13, 3, 1, tan);
        p.px(x + 2, 12, pad);
        p.px(x + 1, 13, pad);
        p.px(x + 3, 12, "#ffe4c4");
      },
    },

    // Gold monocle on one eye with a little chain hanging down.
    monocle: {
      draw: (p) => {
        const g = p.gold;
        const gD = p.shade(p.gold, -0.3);
        const x = 7 + p.fx;
        ring(p, x, g, "#fff3b0");
        // Chain: alternating links curling down off the cheek.
        p.px(x - 1, 12, gD);
        p.px(x - 1, 13, g);
        p.px(x - 2, 14, gD);
        p.px(x - 2, 15, g);
        p.px(x - 1, 16, gD);
      },
    },

    // Pink cheek stickers with anime blush lines.
    blush: {
      draw: (p) => {
        const pink = "#ff8fb4";
        const sticker = (x: number) => {
          // A soft oval sticker with a shine and a darker rim underneath.
          p.R(x, 12, 4, 1, pink);
          p.R(x + 1, 13, 2, 1, "#f2709c");
          p.px(x + 1, 12, "#ffe0ea");
        };
        sticker(5 + p.fx);
        if (!p.fx) sticker(15);
      },
    },

    // Twinkling star stickers on both cheeks and a sparkle by the eye.
    starstickers: {
      animated: true,
      draw: (p) => {
        const star = (cx: number, cy: number, c: string, phase: number) => {
          const on = Math.sin(p.t / 230 + phase) > -0.2;
          const arm = on ? c : p.shade(c, -0.18);
          dot(p, cx, cy - 1, arm);
          dot(p, cx - 1, cy, arm);
          dot(p, cx + 1, cy, arm);
          dot(p, cx, cy + 1, arm);
          dot(p, cx, cy, on ? "#ffffff" : c);
        };
        star(6 + p.fx, 13, "#ff7fbf", 0);
        star(17, 13, "#ffd34d", 2.2);
        // Little glint that pops beside the eyes.
        if (Math.sin(p.t / 170) > 0.6) dot(p, 5 + p.fx, 8, "#fff6c8");
        if (Math.sin(p.t / 170 + 2) > 0.6) dot(p, 18, 8, "#bfe9ff");
      },
    },

    // Sleek black visor with a sweeping RGB light strip.
    gamer: {
      animated: true,
      draw: (p) => {
        const glass = "#151527";
        p.R(5, 8, 14, 1, "#2b2b3a");
        p.R(5, 9, 14, 2, glass);
        for (let x = 5; x <= 18; x++) p.px(x, 11, p.hsl((x * 26 - p.t / 4 + 3600) % 360, 95, 58));
        // Reflection streak gliding across the glass.
        const g = 5 + (Math.floor(p.t / 90) % 18);
        if (g <= 18) p.px(g, 9, "#6a6a8a");
        if (g + 1 <= 18) p.px(g + 1, 9, "#3a3a55");
        // Eye glints behind the glass.
        p.R(7 + p.fx, 10, 2, 1, "#2e3b6e");
        p.R(15 + p.fx, 10, 2, 1, "#2e3b6e");
        // Ear pieces.
        p.R(4, 9, 1, 3, "#2b2b3a");
        p.px(4, 10, p.hsl((p.t / 4) % 360, 95, 60));
        if (!p.fx) {
          p.R(19, 9, 1, 3, "#2b2b3a");
          p.px(19, 10, p.hsl((p.t / 4 + 180) % 360, 95, 60));
        }
      },
    },

    // Pink cat nose, whiskers that twitch, and a tiny fang.
    catwhiskers: {
      animated: true,
      draw: (p) => {
        const f = p.fx;
        const wc = "#6b4a42";
        // Nose with a shine.
        p.R(11 + f, 12, 2, 1, "#ff8fa8");
        p.px(11 + f, 12, "#ffc6d3");
        // Swap the plain mouth for a little cat smile with a fang.
        const m = "#8a3b33";
        p.R(11 + f, 13, 2, 1, p.sk);
        p.px(10 + f, 13, m);
        p.px(13 + f, 13, m);
        p.px(11 + f, 14, m);
        p.px(12 + f, 14, "#ffffff");
        // Whiskers twitch for a moment every couple of seconds.
        const tw = p.t % 2200 < 160 ? 1 : 0;
        // Two whiskers per cheek (rows 12 and 14, a gap between so they
        // don't blur into a smudge); the outer tip flicks up on a twitch.
        const side = (x0: number, dir: number) => {
          dot(p, x0, 12, wc);
          dot(p, x0 + dir, 12, wc);
          dot(p, x0 + dir * 2, 12 - tw, wc);
          dot(p, x0, 14, wc);
          dot(p, x0 + dir, 14, wc);
        };
        side(7 + f, -1);
        side(16 + f, 1);
      },
    },

    // Holographic lenses: shifting colours, a scan line and a silver frame.
    holo: {
      animated: true,
      draw: (p) => {
        const silver = "#dfe6f0";
        const scan = 9 + (Math.floor(p.t / 120) % 4);
        const lens = (x: number, w: number) => {
          p.R(x, 8, w, 1, silver);
          for (let y = 9; y <= 11; y++)
            for (let i = 0; i < w; i++) {
              const h = ((x + i) * 22 + y * 30 + p.t / 6) % 360;
              p.px(x + i, y, y === scan ? "#f4fdff" : p.hsl(h, 85, 70));
            }
          // The eyes show through as darker shapes.
          if (scan !== 10)
            p.R(x + 1, 10, Math.min(2, w - 1), 1, p.hsl((p.t / 6 + 200) % 360, 60, 38));
          // Sparkle on the frame corner.
          if (Math.sin(p.t / 260 + x) > 0.7) p.px(x, 8, "#ffffff");
        };
        const a = 6 + p.fx;
        // The far lens is narrower in the three-quarter view.
        const b = 14 + p.fx;
        const bw = Math.min(4, 19 - b);
        lens(a, 4);
        lens(b, bw);
        p.R(a + 4, 9, b - a - 4, 1, silver);
        p.px(a - 1, 9, silver);
        if (!p.fx) p.px(b + 4, 9, silver);
      },
    },

    // White kitsune mask pushed to the side of the head, tied on with a red cord.
    kitsunemask: {
      draw: (p) => {
        const W = "#fbf8f2";
        const S = "#ddd5c8";
        const Rd = "#d8323c";
        const Rk = "#a81f2a";
        const K = "#2a1b18";
        const G = p.gold;
        const ox = p.fx;
        const oy = -1;
        // Cord running over the head to the other side.
        p.R(ox + 8, 4, 18 - (ox + 8) + 1, 1, Rd);
        p.px(ox + 12, 4, Rk);
        // Each row of the mask, 8 wide ('.' = empty).
        const rows = [
          "W......W",
          "WR....RW",
          "WRWWWWRW",
          "WWWRRWWS",
          "WKKWWKKS",
          "RWWWWWWR",
          ".WWWWWS.",
          "..WWWS..",
          "...KK...",
        ];
        const col: Record<string, string> = { W, S, R: Rd, K };
        rows.forEach((row, y) =>
          [...row].forEach((ch, x) => {
            if (ch !== ".") p.px(ox + x, oy + y, col[ch]);
          }),
        );
        // Gold dot in the forehead flame, red flicks under the eye slits,
        // red whisker stripes on the snout.
        p.px(ox + 3, oy + 2, G);
        p.px(ox + 4, oy + 2, G);
        p.px(ox + 1, oy + 5, Rk);
        p.px(ox + 6, oy + 5, Rk);
        p.px(ox + 2, oy + 6, Rd);
        p.px(ox + 5, oy + 6, Rd);
        // Tassel with a gold bead hanging off the mask.
        p.px(ox + 2, oy + 8, Rd);
        p.px(ox + 2, oy + 9, Rd);
        p.px(ox + 2, oy + 10, G);
        p.px(ox + 2, oy + 11, Rk);
      },
    },

    // Ninja scarf pulled up over the nose, knotted behind with long tails
    // that stream out and flutter.
    ninjascarf: {
      animated: true,
      draw: (p) => {
        const f = p.fx;
        const col = { c: "#c8283a", s: "#8e1a28", l: "#ec4a5a" };
        const { c, s, l } = col;
        // The wrap over the lower face (face shape: rows 12–15) and the neck.
        p.R(5, 12, 14, 2, c);
        p.R(6, 14, 12, 1, c);
        p.R(7, 15, 10, 1, c);
        p.R(6, 12, 12, 1, l);
        p.R(7, 16, 10, 1, s);
        p.R(8, 16, 8, 1, (x) => (x % 3 ? c : s));
        // Over the nose, then soft folds falling from it.
        p.R(11 + f, 12, 2, 1, "#ff7a86");
        dot(p, 10 + f, 14, s);
        dot(p, 9 + f, 15, s);
        dot(p, 14 + f, 14, s);
        dot(p, 15 + f, 15, s);
        // Shade on the far side.
        p.R(18, 12, 1, 2, s);
        p.px(17, 14, s);
        p.px(16, 15, s);
        // Knot behind the neck and two tails trailing off it.
        const kx = f ? 4 : 5;
        const ky = f ? 13 : 14;
        p.R(kx - 1, ky, 2, 2, c);
        p.px(kx - 1, ky, l);
        p.px(kx, ky + 1, s);
        scarfTail(p, kx - 2, ky + 1, f ? 5 : 4, f ? 0.6 : 0.9, 1.9, col);
        scarfTail(p, kx - 2, ky - 1, f ? 6 : 5, f ? 0.15 : 0.35, 0, col);
      },
    },

    // See-through sci-fi visor across the eyes: a tint that drifts between
    // cyan and violet, a scan line rolling down and a shimmer sweeping across.
    holomask: {
      animated: true,
      draw: (p) => {
        const f = p.fx;
        const { t } = p;
        const tint = hslHex(190 + 24 * Math.sin(t / 900), 95, 62);
        const glass = mix(p.sk, tint, 0.62);
        const rim = "#e6f6ff";
        const rimS = "#93adc0";
        const scan = 8 + (Math.floor(t / 85) % 7);
        const pos = ((t / 24) % 56) - 10;
        const a = 7 + f;
        const b = 15 + f;
        const eye = (x: number, y: number) => {
          for (const e of [a, b]) {
            if (x === e && y === 10) return mix("#ffffff", tint, 0.45);
            if (x >= e && x <= e + 1 && y === 9) return mix(p.ink, tint, 0.5);
            if (x >= e && x <= e + 1 && y >= 10 && y <= 11) return mix(p.ec, tint, 0.48);
          }
          return null;
        };
        const lens = (x: number, y: number) => {
          let c = eye(x, y) ?? glass;
          const d = Math.abs(x - f + (y - 8) * 0.7 - pos);
          if (d < 1) c = mix(c, "#ffffff", 0.55);
          else if (d < 2) c = mix(c, "#ffffff", 0.22);
          if (y === scan) c = mix(c, "#f2ffff", 0.5);
          dot(p, x, y, c);
        };
        // Lens: three rows across the eyes, a lower edge dipping round the nose.
        const left = f ? 7 : 5;
        for (let y = 9; y <= 11; y++) for (let x = left; x <= 18; x++) lens(x, y);
        for (let x = left + 1; x <= 17 + (f ? 1 : 0); x++)
          if (x < 11 + f || x > 12 + f) lens(x, 12);
        // Frame along the top, emitters at the temples that pulse.
        p.R(left, 8, 19 - left, 1, rim);
        p.px(18, 8, rimS);
        const pulse = Math.sin(t / 240) > 0 ? "#ffffff" : tint;
        if (f) {
          p.R(5, 8, 2, 4, rimS);
          p.px(5, 8, rim);
          p.px(6, 9, pulse);
          p.px(6, 10, tint);
        } else {
          p.R(4, 8, 1, 4, rimS);
          p.R(19, 8, 1, 4, rimS);
          p.px(4, 9, pulse);
          p.px(19, 9, pulse);
        }
        // A HUD bracket locks onto the far eye now and then.
        if (t % 2600 < 700 && (t % 2600 < 350 || Math.floor(t / 90) % 2)) {
          const hud = "#d4feff";
          [
            [b - 1, 9],
            [b + 2, 9],
            [b - 1, 11],
            [b + 2, 11],
          ].forEach(([x, y]) => dot(p, x, y, hud));
        }
      },
    },
  },
};
