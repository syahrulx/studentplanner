import type { CategoryItems, Fill, Painter } from "./types";

/** The colour of a fill at one pixel (hair fills can be functions for dyes). */
const at = (f: Fill, x: number, y: number): string =>
  typeof f === "function" ? f(x, y) : (f ?? "#2a1b18");

/**
 * x for hair on the far (right) side of the head. In the three-quarter view
 * the right eye sits at x 17–18, so far-side locks move out one pixel.
 */
const far = (p: Painter, x: number) => x + (p.fx ? 1 : 0);

/** Rows of [y, firstX, lastX] filled with one fill. */
const rows = (p: Painter, list: number[][], c: Fill) =>
  list.forEach(([y, x0, x1]) => p.R(x0, y, x1 - x0 + 1, 1, c));

/** A two-pixel plait from y0 to y1; it shifts by `shift` from y 15 (over the shoulder). */
const plait = (p: Painter, x: number, y0: number, y1: number, shift: number) => {
  for (let y = y0; y <= y1; y++) {
    const xx = y < 15 ? x : x + shift;
    p.px(xx, y, y % 2 ? p.hc : p.hS);
    p.px(xx + 1, y, y % 2 ? p.hS : p.hc);
    if (y % 2 === 0) p.px(xx, y, p.hH);
  }
};

/** Afro texture: rows of little curls (a highlight with a shadow under it). */
const curls =
  (p: Painter): Fill =>
  (x, y) => {
    const band = Math.floor((y + 12) / 3);
    const cx = (x + (band % 2) * 2 + 40) % 4;
    const cy = (y + 12) % 3;
    if (cy === 0 && cx === 1) return at(p.hH, x, y);
    if (cy === 1 && cx === 2) return at(p.hS, x, y);
    return at(p.hc, x, y);
  };

const AFRO = [
  [-5, 8, 15],
  [-4, 6, 17],
  [-3, 4, 19],
  [-2, 3, 20],
  [-1, 2, 21],
  [0, 1, 22],
  [1, 1, 22],
  [2, 1, 22],
  [3, 1, 22],
  [4, 1, 22],
  [5, 1, 22],
  [6, 1, 22],
  [7, 1, 22],
  [8, 1, 22],
  [9, 1, 22],
  [10, 2, 21],
  [11, 2, 21],
  [12, 3, 20],
  [13, 5, 18],
];

/** Long straight hair hanging behind (both views). */
const longBack = (p: Painter, end: number) => {
  const { R, hc, hS } = p;
  R(3, 6, 18, end - 5, hc);
  R(4, 5, 16, 1, hc);
  R(3, 6, 1, end - 5, hS);
  R(20, 6, 1, end - 5, hS);
};

/** Small red ribbon bow; drawn on the other side when seen from behind. */
const ribbon = (p: Painter) => {
  const m = (x: number) => (p.back ? 23 - x : x);
  const red = "#e24b4a";
  [14, 15, 17, 18].forEach((x) => p.R(m(x), 0, 1, 3, red));
  p.px(m(16), 1, "#a3202a");
  p.px(m(14), 0, "#ff8a8a");
  p.px(m(17), 0, "#ff8a8a");
  p.px(m(15), 3, "#b3262f");
  p.px(m(17), 3, "#b3262f");
};

/** Flame tongues on top of the head; the tips flicker orange to yellow. */
const FLAME = ["#e2412f", "#ff7a2f", "#ff9b3d", "#ffc23d", "#ffe36a", "#fff6c8"];
const flames = (p: Painter) => {
  const tongues = [
    [6, 3],
    [9, 5],
    [12, 6],
    [15, 5],
    [17, 3],
  ];
  tongues.forEach(([cx, h0], i) => {
    const flick = Math.sin(p.t / 120 + i * 1.7);
    const h = h0 + (flick > 0.3 ? 1 : 0);
    const sway = ((Math.floor(p.t / 140) + i) % 3) - 1;
    for (let r = 0; r < h; r++) {
      const f = r / h;
      const w = f < 0.4 ? 3 : f < 0.75 ? 2 : 1;
      const x = cx - (w === 3 ? 1 : 0) + (r >= h - 2 ? sway : 0);
      const y = 1 - r;
      let c: Fill = p.hc;
      if (f >= 0.4) {
        const k = Math.round((f - 0.4) * 6 + (flick + 1) * 1.2);
        c = FLAME[Math.min(FLAME.length - 1, Math.max(0, k))];
      }
      p.R(x, y, w, 1, c);
    }
    p.px(cx, 1, p.hH);
  });
};

/** Twinkling star pixels; big ones flash as little plus signs. */
const twinkle = (p: Painter, spots: number[][]) =>
  spots.forEach(([x, y, big], i) => {
    const v = Math.sin(p.t / 260 + i * 1.9);
    if (v > 0.8 && big) {
      p.px(x - 1, y, "#ffe58a");
      p.px(x + 1, y, "#ffe58a");
      p.px(x, y - 1, "#ffe58a");
      p.px(x, y + 1, "#ffe58a");
      p.px(x, y, "#ffffff");
    } else if (v > 0.35) p.px(x, y, v > 0.7 ? "#ffffff" : "#fff6c8");
  });

/** New hair items (see types.ts for how drawing works). */
export const HAIR: CategoryItems = {
  items: [
    { id: "bob", name: "Bob", tier: "free" },
    { id: "braids", name: "Braids", tier: "free" },
    { id: "afro", name: "Afro", tier: "free" },
    { id: "sidepart", name: "Side part", tier: "coins", price: 50 },
    { id: "wolfcut", name: "Wolf cut", tier: "coins", price: 60 },
    { id: "wavy", name: "Wavy long", tier: "plus" },
    { id: "spacebuns", name: "Space buns", tier: "plus" },
    { id: "hime", name: "Hime cut", tier: "plus" },
    { id: "flame", name: "Flame tips", tier: "pro" },
    { id: "starlight", name: "Starlight", tier: "pro" },
  ],
  draw: {
    bob: {
      draw: (p) => {
        const { R, px, hc, hS } = p;
        if (p.back) {
          R(3, 5, 2, 9, hc);
          R(19, 5, 2, 9, hc);
          R(3, 5, 1, 9, hS);
          R(20, 5, 1, 9, hS);
          R(4, 14, 16, 1, hS);
          return;
        }
        p.cap();
        // Blunt fringe with a soft dip.
        R(5, 6, 14, 1, hc);
        R(5, 7, 4, 1, hc);
        R(10, 7, 5, 1, hc);
        R(16, 7, 3, 1, hc);
        // Rounded sides down to the chin.
        const rx = far(p, 18);
        R(3, 4, 3, 10, hc);
        R(rx, 4, 3, 10, hc);
        R(3, 4, 1, 10, hS);
        R(rx + 2, 4, 1, 10, hS);
        px(4, 14, hS);
        px(5, 14, hS);
        px(rx, 14, hS);
        px(rx + 1, 14, hS);
      },
    },
    braids: {
      draw: (p) => {
        const { R, px, hc, hS } = p;
        if (p.back) {
          // The plaits go forward over the shoulders.
          R(4, 6, 2, 4, hc);
          R(18, 6, 2, 4, hc);
          plait(p, 4, 10, 16, 1);
          plait(p, 18, 10, 16, -1);
          return;
        }
        p.cap();
        // Middle parting and fringe swept to both sides.
        R(11, 2, 2, 4, hS);
        R(5, 6, 6, 1, hc);
        R(13, 6, 6, 1, hc);
        px(5, 7, hc);
        px(18, 7, hc);
        const rx = far(p, 18);
        R(4, 6, 2, 4, hc);
        R(rx, 6, 2, 4, hc);
        plait(p, 4, 10, 18, 1);
        plait(p, rx, 10, 18, -1);
        // Hair ties and tufts.
        [5, rx - 1].forEach((x) => {
          R(x, 19, 2, 1, "#e24b4a");
          R(x, 20, 2, 1, hc);
          px(x, 21, hS);
          px(x + 1, 21, hS);
        });
      },
    },
    afro: {
      behind: (p) => rows(p, AFRO, curls(p)),
      draw: (p) => {
        if (p.back) {
          p.R(5, 13, 14, 1, p.hS);
          return;
        }
        p.cap();
        const tex = curls(p);
        rows(
          p,
          AFRO.filter(([y]) => y <= 4),
          tex,
        );
        // Rounded hairline and sideburns.
        p.R(5, 5, 3, 1, tex);
        p.R(16, 5, 3, 1, tex);
        p.R(5, 6, 1, 3, tex);
        p.R(18, 6, 1, 3, tex);
      },
    },
    sidepart: {
      draw: (p) => {
        const { R, px, hc, hS, hH } = p;
        // A little lift on top of the swept side.
        R(9, 0, 7, 1, hc);
        if (p.back) {
          R(15, 1, 1, 3, hS);
          return;
        }
        p.cap();
        R(8, 1, 1, 3, hS);
        R(10, 0, 3, 1, hH);
        px(13, 1, hH);
        px(14, 2, hH);
        // Fringe swept to the right.
        R(5, 6, 3, 1, hc);
        R(5, 7, 1, 2, hc);
        R(9, 6, 10, 1, hc);
        R(13, 7, 6, 1, hc);
        px(17, 8, hc);
        px(12, 7, hS);
        px(16, 8, hS);
        R(far(p, 18), 6, 1, 3, hc);
      },
    },
    wolfcut: {
      behind: (p) => {
        const { R, hc, hS } = p;
        if (p.back) {
          // Shaggy mullet over the nape.
          R(4, 12, 16, 3, hc);
          [
            [5, 2],
            [7, 1],
            [8, 2],
            [10, 1],
            [11, 3],
            [12, 2],
            [14, 1],
            [15, 2],
            [17, 1],
            [18, 2],
          ].forEach(([x, n]) => R(x, 15, 1, n, hc));
          [6, 9, 13, 16].forEach((x) => R(x, 12, 1, 3, hS));
          return;
        }
        R(4, 12, 16, 4, hc);
        R(4, 15, 1, 2, hS);
        R(19, 15, 1, 2, hS);
      },
      draw: (p) => {
        const { R, px, hc, hS, hH } = p;
        const rx = p.back ? 18 : far(p, 18);
        // Choppy volume on top.
        px(7, 0, hc);
        R(9, -1, 2, 2, hc);
        R(12, -1, 2, 2, hc);
        px(15, 0, hc);
        px(10, -1, hH);
        // Layered sides with flicks.
        R(3, 5, 3, 8, hc);
        R(rx, 5, 3, 8, hc);
        R(3, 5, 1, 8, hS);
        R(rx + 2, 5, 1, 8, hS);
        px(2, 7, hc);
        px(2, 11, hS);
        px(4, 13, hc);
        px(rx + 3, 7, hc);
        px(rx + 3, 11, hS);
        px(rx + 1, 13, hc);
        if (p.back) return;
        p.cap();
        // Uneven fringe: column lengths from x 5 to 18.
        [3, 3, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1, 2, 3].forEach((n, i) => {
          R(5 + i, 6, 1, n, hc);
          if (n > 1) px(5 + i, 5 + n, hS);
        });
      },
    },
    wavy: {
      behind: (p) => {
        const { R, px, hc, hS, hH } = p;
        longBack(p, 18);
        for (let x = 3; x <= 20; x++) {
          const end = 19 + [0, 1, 2, 1][x % 4];
          R(x, 19, 1, end - 18, hc);
          px(x, end, hS);
        }
        if (p.back)
          for (let y = 6; y <= 19; y++) {
            const w = Math.round(Math.sin(y * 0.8));
            [6, 11, 16].forEach((x) => px(x + w, y, hS));
            if (y % 4 === 1) [8, 13].forEach((x) => R(x + w, y, 2, 1, hH));
          }
      },
      draw: (p) => {
        const { R, px, hc, hS, hH } = p;
        // Pearl clip (on the other side from behind).
        const m = (x: number) => (p.back ? 23 - x : x);
        if (p.back) {
          [
            [4, 6],
            [5, 5],
            [6, 4],
          ].forEach(([x, y], i) => px(m(x), y, i === 1 ? "#ffffff" : "#f4ecdc"));
          return;
        }
        p.cap();
        R(7, 2, 3, 1, hH);
        // Curtain fringe from a middle part.
        R(5, 6, 6, 1, hc);
        R(13, 6, 6, 1, hc);
        R(5, 7, 3, 1, hc);
        R(16, 7, 3, 1, hc);
        px(5, 8, hc);
        px(18, 8, hc);
        // Wavy side locks falling over the shoulders.
        const shift = p.fx ? 1 : 0;
        for (let y = 6; y <= 20; y++) {
          const w = (y >> 1) % 2;
          const lx = (y < 14 ? 3 : 4) + w;
          const rx = 23 - lx - 1 + shift;
          R(lx, y, 2, 1, hc);
          R(rx, y, 2, 1, hc);
          px(w ? lx + 1 : lx, y, hS);
          px(w ? rx : rx + 1, y, hS);
          if (y % 4 === 1) {
            px(lx + 1 - w, y, hH);
            px(rx + w, y, hH);
          }
        }
        [
          [4, 6],
          [5, 5],
          [6, 4],
        ].forEach(([x, y], i) => px(x, y, i === 1 ? "#ffffff" : "#f4ecdc"));
      },
    },
    spacebuns: {
      draw: (p) => {
        const { R, px, hc, hS, hH } = p;
        const bun = (bx: number) => {
          const by = -3;
          R(bx + 1, by, 3, 1, hc);
          R(bx, by + 1, 5, 3, hc);
          R(bx + 1, by + 4, 3, 1, hS);
          px(bx + 4, by + 2, hS);
          px(bx + 2, by + 2, hS);
          px(bx + 3, by + 1, hS);
          px(bx + 1, by + 1, hH);
          px(bx + 2, by, hH);
          // Pink scrunchie round the base.
          R(bx, by + 3, 5, 1, "#ff9ec4");
          px(bx + 1, by + 3, "#ffd1e3");
          px(bx + 4, by + 3, "#e57aa5");
        };
        if (!p.back) {
          p.cap();
          // Short fringe and wispy face-framing strands.
          R(6, 6, 4, 1, hc);
          R(11, 6, 3, 1, hc);
          R(15, 6, 3, 1, hc);
          px(6, 7, hc);
          px(11, 7, hc);
          px(16, 7, hc);
          R(5, 6, 1, 6, hc);
          R(far(p, 18), 6, 1, 6, hc);
          px(5, 11, hS);
          px(far(p, 18), 11, hS);
          // Little gold star clip.
          px(13, 1, "#f2c14e");
          R(12, 2, 3, 1, "#f2c14e");
          px(13, 3, "#f2c14e");
          px(13, 2, "#fff6c8");
        }
        bun(5);
        bun(14);
      },
    },
    hime: {
      behind: (p) => {
        const { R, hS, hH } = p;
        longBack(p, 19);
        R(4, 19, 16, 1, hS);
        if (p.back) {
          [7, 11, 16].forEach((x) => R(x, 8, 1, 11, hS));
          R(6, 6, 4, 1, hH);
          R(14, 6, 4, 1, hH);
        }
      },
      draw: (p) => {
        const { R, px, hc, hS, hH } = p;
        if (!p.back) {
          p.cap();
          // Shiny "angel ring" band.
          R(7, 3, 4, 1, hH);
          R(13, 3, 3, 1, hH);
          // Straight blunt bangs.
          R(5, 6, 14, 2, hc);
          [7, 10, 13, 16].forEach((x) => px(x, 7, hS));
          // Side locks cut at the chin.
          const rx = far(p, 18);
          R(4, 6, 2, 9, hc);
          R(rx, 6, 2, 9, hc);
          R(4, 6, 1, 8, hS);
          R(rx + 1, 6, 1, 8, hS);
          R(4, 14, 2, 1, hS);
          R(rx, 14, 2, 1, hS);
          px(5, 9, hH);
          px(rx, 9, hH);
        }
        ribbon(p);
      },
    },
    flame: {
      animated: true,
      draw: (p) => {
        const { R, px, hc, hS } = p;
        if (!p.back) {
          p.cap();
          // Spiky fringe.
          R(5, 6, 3, 2, hc);
          px(8, 6, hc);
          R(10, 6, 3, 2, hc);
          px(13, 6, hc);
          R(15, 6, 3, 2, hc);
          [6, 11, 16].forEach((x) => px(x, 7, hS));
          R(5, 8, 1, 2, hc);
          R(far(p, 18), 6, 1, 4, hc);
        }
        flames(p);
      },
      fxFront: (c, k) =>
        k.particles(5, 1500, (i, ph) => {
          c.globalAlpha = (1 - ph) * 0.85;
          c.fillStyle = ph < 0.4 ? "#ffe36a" : "#ff7a2f";
          const x = k.X(6 + ((i * 5) % 12) + Math.sin(ph * 6 + i) * 0.8);
          c.fillRect(Math.round(x), Math.round(k.Y(-2 - ph * 7)), k.s, k.s);
          c.globalAlpha = 1;
        }),
    },
    starlight: {
      animated: true,
      behind: (p) => {
        const { R, px, hc, hS, hH } = p;
        longBack(p, 19);
        // Flowing ends that ripple.
        for (let x = 3; x <= 20; x++) {
          const end = 20 + Math.round(Math.sin(p.t / 420 + x * 0.55) + 1);
          R(x, 20, 1, end - 19, hc);
          px(x, end, hS);
        }
        if (p.back) {
          [6, 9, 14, 17].forEach((x) => R(x, 7, 1, 13, hS));
          R(7, 6, 3, 1, hH);
          R(14, 6, 3, 1, hH);
          twinkle(p, [
            [5, 9, 1],
            [8, 14, 1],
            [12, 8, 0],
            [11, 17, 1],
            [15, 12, 0],
            [18, 16, 1],
            [16, 20, 0],
            [7, 19, 0],
          ]);
        } else
          twinkle(p, [
            [3, 15, 0],
            [20, 12, 0],
            [4, 20, 0],
            [19, 21, 0],
          ]);
      },
      draw: (p) => {
        const { R, px, hc, hS, hH } = p;
        const gold = "#f2c14e";
        // Crescent moon clip (on the other side from behind).
        const m = (x: number) => (p.back ? 23 - x : x);
        const moon = () => {
          px(m(7), 3, gold);
          px(m(6), 4, gold);
          px(m(6), 5, gold);
          px(m(7), 6, "#c99a1e");
          px(m(6), 3, "#fff6c8");
        };
        if (p.back) {
          moon();
          return;
        }
        p.cap();
        // Soft fringe swept from the left.
        R(5, 6, 5, 1, hc);
        R(12, 6, 7, 1, hc);
        R(5, 7, 2, 1, hc);
        R(14, 7, 5, 1, hc);
        px(17, 8, hc);
        // Long side locks; the ends drift.
        const rx = far(p, 18);
        const drift = Math.round(Math.sin(p.t / 420));
        R(3, 6, 3, 10, hc);
        R(rx, 6, 3, 10, hc);
        R(3 + drift, 16, 2, 4, hc);
        R(rx + 1 + drift, 16, 2, 4, hc);
        R(3, 6, 1, 10, hS);
        R(rx + 2, 6, 1, 10, hS);
        px(3 + drift, 19, hS);
        px(rx + 2 + drift, 19, hS);
        px(5, 8, hH);
        px(rx, 8, hH);
        twinkle(p, [
          [4, 10, 1],
          [rx + 1, 13, 1],
          [4 + drift, 17, 0],
          [rx + 1 + drift, 18, 0],
          [10, 2, 0],
          [15, 4, 0],
        ]);
        moon();
      },
      fxFront: (_c, k) =>
        k.particles(3, 2600, (i, ph) =>
          k.star(
            Math.round(k.X(i % 2 ? 21 : 2)),
            Math.round(k.Y(6 + ph * 14)),
            Math.max(1, Math.round(k.s / 2)),
            "#fff6c8",
            Math.sin(ph * Math.PI) * 0.8,
          ),
        ),
    },
  },
};
