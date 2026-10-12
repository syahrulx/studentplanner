import type { CategoryItems, Painter } from "./types";

/*
 * New top items (see types.ts for how drawing works).
 * Torso is x 7–16, y 16–23; arms x 5–6 and 17–18. Tops are drawn after the
 * bottoms, so anything that hangs below y 23 (coat tails, sampin) covers them.
 */

const WHITE = "#f4f1ea";

/** Rough brightness of a #hex colour, 0–255. */
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
};
/** A trim colour that stands out on `c`. */
const trimOn = (c: string) => (lum(c) > 170 ? "#2f3a4a" : WHITE);
/** True for red / pink colours (so we can pick a different accent). */
const isReddish = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r > g + 50 && r > b + 30;
};
/** Shift centre details one pixel in the three-quarter view. */
const mid = (p: Painter) => (p.fx ? 1 : 0);

/** Long sleeves filled with a pattern, shadow on the far side, bare hands. */
const patternArms = (p: Painter, fill: (x: number, y: number) => string, hand?: string) => {
  p.R(5, 16, 2, 7, fill);
  p.R(17, 16, 2, 7, fill);
  p.R(18, 16, 1, 7, (x, y) => p.shade(fill(x, y), -0.2));
  p.R(5, 23, 2, 1, hand ?? p.sk);
  p.R(17, 23, 2, 1, hand ?? p.sk);
};
/** Torso filled with a pattern, with the usual right / bottom shadow. */
const patternTorso = (p: Painter, fill: (x: number, y: number) => string) => {
  p.R(7, 16, 10, 8, fill);
  p.R(16, 16, 1, 8, (x, y) => p.shade(fill(x, y), -0.22));
  p.R(7, 23, 10, 1, (x, y) => p.shade(fill(x, y), -0.22));
};

/** 3×5 digits for the jersey number. */
const DIGITS: Record<string, string[]> = {
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "0": ["###", "#.#", "#.#", "#.#", "###"],
};
const digit = (p: Painter, d: string, x: number, y: number, c: string) =>
  DIGITS[d].forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === "#") p.px(x + i, y + j, c);
    }),
  );

export const TOP: CategoryItems = {
  items: [
    { id: "polo", name: "Polo", tier: "free" },
    { id: "sweater", name: "Sweater", tier: "free" },
    { id: "bajumelayu", name: "Baju Melayu", tier: "free" },
    { id: "kurung", name: "Baju kurung", tier: "free" },
    { id: "flannel", name: "Flannel", tier: "free" },
    { id: "jersey", name: "Jersey", tier: "coins", price: 60 },
    { id: "denim", name: "Denim jacket", tier: "coins", price: 80 },
    { id: "labcoat", name: "Lab coat", tier: "plus" },
    { id: "leather", name: "Leather jacket", tier: "plus" },
    { id: "sailor", name: "Sailor top", tier: "plus" },
    { id: "galaxyhoodie", name: "Galaxy hoodie", tier: "pro" },
    { id: "knight", name: "Knight armour", tier: "pro" },
  ],
  draw: {
    polo: {
      draw: (p) => {
        const { R, px, tc, tS } = p;
        const collar = p.shade(tc, 0.3);
        p.torso(tc);
        p.armsShort(tc);
        R(5, 19, 2, 1, tS);
        R(17, 19, 2, 1, tS);
        if (p.back) {
          R(8, 16, 8, 1, collar);
          return;
        }
        const m = mid(p);
        // Collar flaps either side of a short button placket.
        R(9, 16, 2, 1, collar);
        R(13, 16, 2, 1, collar);
        px(10, 17, collar);
        px(13, 17, collar);
        R(11, 16, 2, 1, p.skS);
        R(11 + m, 17, 1, 3, tS);
        px(12 + m, 17, trimOn(tc));
        px(12 + m, 19, trimOn(tc));
      },
    },
    sweater: {
      draw: (p) => {
        const { R, px, tc, tS } = p;
        const knit = p.shade(tc, -0.1);
        const light = p.shade(tc, 0.28);
        p.torso(tc);
        p.armsLong(tc);
        // Knit rows: every other row has a soft stitch texture.
        [17, 21].forEach((y) => {
          for (let x = 7; x < 16; x++) if ((x + y) % 2 === 0) px(x, y, knit);
        });
        // Zigzag band across the chest and sleeves.
        for (let x = 7; x < 16; x++) px(x, 19 - (x % 2), light);
        [5, 6, 17].forEach((x) => px(x, 19 - (x % 2), light));
        // Ribbed hem and cuffs.
        R(7, 22, 10, 2, tS);
        for (let x = 7; x < 17; x += 2) px(x, 22, p.shade(tc, -0.34));
        R(5, 22, 2, 1, tS);
        R(17, 22, 2, 1, tS);
        if (!p.back) R(9, 16, 6, 1, tS);
        else R(8, 16, 8, 1, tS);
      },
    },
    bajumelayu: {
      draw: (p) => {
        const { R, px, tc, tS, gold } = p;
        p.torso(tc);
        p.armsLong(tc);
        R(5, 22, 2, 1, tS);
        R(17, 22, 2, 1, tS);
        // Stand collar (cekak musang).
        R(9, 16, 6, 1, tS);
        if (!p.back) {
          const m = mid(p);
          R(11, 16, 2, 1, p.skS);
          R(11 + m, 17, 2, 4, p.shade(tc, 0.12));
          px(12 + m, 17, gold);
          px(12 + m, 19, gold);
        }
        // Short sampin wrapped at the waist, songket diamonds in gold.
        const base = isReddish(tc) ? "#1f3a6b" : "#7a1f3d";
        const baseS = p.shade(base, -0.3);
        R(7, 21, 10, 5, base);
        R(7, 21, 10, 1, baseS);
        R(16, 22, 1, 4, baseS);
        R(7, 25, 10, 1, gold);
        [8, 11, 14].forEach((cx) => {
          px(cx, 22, gold);
          px(cx - 1, 23, gold);
          px(cx + 1, 23, gold);
          px(cx, 24, gold);
          px(cx, 23, p.shade(base, 0.3));
        });
        if (!p.back) R(13, 22, 1, 3, baseS);
      },
    },
    kurung: {
      draw: (p) => {
        const { R, px, tc, tS } = p;
        const light = p.shade(tc, 0.25);
        p.torso(tc);
        p.armsLong(tc);
        // Loose sleeves that widen a little at the wrist.
        R(4, 21, 1, 2, tc);
        R(19, 21, 1, 2, tS);
        R(5, 22, 2, 1, tS);
        R(17, 22, 2, 1, tS);
        // Long body down over the hips.
        R(7, 23, 10, 1, tc);
        R(6, 24, 12, 2, tc);
        R(16, 23, 2, 3, tS);
        R(6, 25, 12, 1, tS);
        // Tiny floral dots.
        [
          [8, 18],
          [14, 20],
          [10, 22],
          [15, 17],
          [9, 24],
          [13, 24],
        ].forEach(([x, y]) => px(x, y, light));
        if (!p.back) {
          // Simple round neckline with a short slit.
          R(10, 16, 4, 1, p.skS);
          R(11, 17, 2, 1, p.skS);
          px(8, 24, tS);
          px(15, 24, tS);
        }
      },
    },
    flannel: {
      draw: (p) => {
        const { R, px, tc, tS } = p;
        const dark = p.shade(tc, -0.42);
        const check = (x: number, y: number) => {
          const v = x % 3 === 0;
          const h = y % 3 === 0;
          return v && h ? dark : v || h ? tS : tc;
        };
        patternTorso(p, check);
        patternArms(p, check);
        R(5, 22, 2, 1, dark);
        R(17, 22, 2, 1, dark);
        if (p.back) {
          R(7, 16, 10, 1, tS);
          return;
        }
        // Open shirt over a plain tee.
        const tee = lum(tc) > 200 ? "#2f3a4a" : WHITE;
        R(10, 16, 4, 8, tee);
        R(13, 16, 1, 8, p.shade(tee, -0.15));
        R(11, 16, 2, 1, p.skS);
        R(9, 16, 1, 2, tS);
        R(14, 16, 1, 2, tS);
        px(10, 17, tc);
        px(13, 17, tc);
      },
    },
    jersey: {
      draw: (p) => {
        const { R, px, tc } = p;
        const trim = trimOn(tc);
        p.torso(tc);
        p.armsShort(tc);
        R(5, 19, 2, 1, trim);
        R(17, 19, 2, 1, trim);
        R(7, 17, 1, 6, p.shade(tc, 0.18));
        if (!p.back) {
          // V-neck with a trim edge, number on the chest.
          px(10, 16, trim);
          R(11, 16, 2, 1, p.skS);
          px(13, 16, trim);
          digit(p, "1", 8, 18, trim);
          digit(p, "0", 12, 18, trim);
        } else {
          R(9, 16, 6, 1, trim);
          digit(p, "1", 8, 17, trim);
          digit(p, "0", 12, 17, trim);
        }
      },
    },
    denim: {
      draw: (p) => {
        const { R, px, tc } = p;
        const D = "#4f78a8";
        const DD = "#36597f";
        const DL = "#86abd3";
        const copper = "#c98a3a";
        p.torso(D);
        p.armsLong(D);
        R(5, 22, 2, 1, DL);
        R(17, 22, 2, 1, DL);
        R(7, 23, 10, 1, DD);
        R(7, 22, 10, 1, DL);
        if (p.back) {
          R(8, 16, 8, 1, DL);
          R(7, 18, 10, 1, DD);
          R(9, 19, 1, 3, DD);
          R(14, 19, 1, 3, DD);
          return;
        }
        // Open front showing the shirt underneath (top colour).
        R(11, 16, 2, 7, tc);
        R(11, 16, 2, 1, p.skS);
        // Collar.
        R(9, 16, 2, 1, DL);
        R(13, 16, 2, 1, DL);
        px(10, 17, DL);
        px(13, 17, DL);
        // Chest pockets with flaps and copper studs.
        R(8, 19, 2, 1, DL);
        R(8, 20, 2, 1, DD);
        R(14, 19, 2, 1, DL);
        R(14, 20, 2, 1, DD);
        px(8, 19, copper);
        px(15, 19, copper);
        px(10, 21, copper);
        px(13, 21, copper);
      },
    },
    labcoat: {
      draw: (p) => {
        const { R, px, tc } = p;
        const W = "#f6f7f9";
        const WS = "#d3d8df";
        p.torso(W);
        p.armsLong(W);
        R(16, 16, 1, 8, WS);
        R(18, 16, 1, 7, WS);
        R(5, 22, 2, 1, WS);
        R(17, 22, 2, 1, WS);
        if (p.back) {
          // Coat tails all the way across, with a back belt and vent.
          R(7, 23, 10, 4, W);
          R(16, 23, 1, 4, WS);
          R(9, 21, 6, 1, WS);
          px(9, 21, "#aab2bd");
          px(14, 21, "#aab2bd");
          R(11, 23, 2, 4, WS);
          R(7, 26, 10, 1, WS);
          return;
        }
        // Coat tails either side, legs show in the middle.
        R(7, 23, 3, 4, W);
        R(14, 23, 3, 4, W);
        R(16, 23, 1, 4, WS);
        R(7, 26, 3, 1, WS);
        R(14, 26, 3, 1, WS);
        // Coloured shirt and tie in the open front.
        R(10, 16, 4, 8, W);
        R(11, 16, 2, 7, tc);
        R(11, 16, 2, 1, p.shade(tc, 0.3));
        px(11, 17, p.shade(tc, -0.35));
        R(11, 18, 1, 4, p.shade(tc, -0.35));
        // Lapels.
        px(10, 16, WS);
        px(13, 16, WS);
        px(10, 17, WS);
        px(13, 17, WS);
        R(10, 18, 1, 6, WS);
        // Breast pocket with pens, an ID badge, lower pockets, a little shine.
        R(14, 19, 2, 1, WS);
        px(14, 17, "#2f5fa8");
        px(14, 18, "#3d7fd6");
        px(15, 17, "#b3262f");
        px(15, 18, "#e24b4a");
        R(8, 18, 2, 1, "#3d7fd6");
        px(8, 19, "#ffffff");
        px(9, 19, "#c3cad3");
        R(8, 21, 2, 1, WS);
        R(14, 21, 2, 1, WS);
        px(8, 17, "#ffffff");
        px(5, 17, "#ffffff");
      },
    },
    leather: {
      draw: (p) => {
        const { R, px, tc } = p;
        const L = "#26232a";
        const LS = "#18161b";
        const sheen = "#4d4856";
        const shine = "#7a7486";
        const zip = "#c9d0d8";
        p.torso(L);
        p.armsLong(L);
        R(16, 16, 1, 8, LS);
        R(18, 16, 1, 7, LS);
        // Zips at the cuffs, belt at the hem.
        px(5, 22, zip);
        px(18, 22, zip);
        R(7, 22, 10, 2, LS);
        // Sheen on the sleeves.
        R(5, 17, 1, 3, sheen);
        px(5, 17, shine);
        R(17, 17, 1, 2, sheen);
        if (p.back) {
          R(7, 16, 10, 1, sheen);
          R(7, 18, 10, 1, LS);
          R(9, 19, 1, 2, sheen);
          px(9, 19, shine);
          return;
        }
        px(9, 22, zip);
        // Wide lapels, tee showing at the neck.
        R(10, 16, 3, 2, tc);
        R(10, 16, 3, 1, p.skS);
        R(8, 16, 2, 2, sheen);
        R(13, 16, 3, 1, sheen);
        px(13, 17, sheen);
        // Off-centre zip and a zipped chest pocket.
        R(13, 18, 1, 4, zip);
        px(13, 18, "#ffffff");
        R(8, 19, 3, 1, zip);
        // Sheen down the chest.
        R(8, 18, 1, 3, sheen);
        px(8, 18, shine);
        px(15, 19, sheen);
      },
    },
    sailor: {
      draw: (p) => {
        const { R, px } = p;
        // Collar in the top colour (navy if that's too pale to show on white).
        const tc = lum(p.tc) > 200 ? "#2f4f8f" : p.tc;
        const tS = p.shade(tc, -0.22);
        const body = WHITE;
        const bodyS = "#d8d2c6";
        const stripe = "#ffffff";
        const rib = isReddish(tc) ? "#f2c14e" : "#e24b4a";
        const ribS = p.shade(rib, -0.25);
        p.torso(body);
        p.armsShort(body);
        R(16, 16, 1, 8, bodyS);
        R(7, 23, 10, 1, bodyS);
        // Sleeve bands in the collar colour with a white stripe.
        R(5, 18, 2, 2, tc);
        R(17, 18, 2, 2, tc);
        R(5, 18, 2, 1, stripe);
        R(17, 18, 2, 1, stripe);
        if (p.back) {
          // Big square collar flap with a white border stripe.
          R(8, 16, 8, 5, tc);
          R(9, 19, 6, 1, stripe);
          R(9, 16, 1, 3, stripe);
          R(14, 16, 1, 3, stripe);
          R(8, 20, 8, 1, tS);
          return;
        }
        // Sailor collar coming down into a V.
        R(7, 16, 3, 1, tc);
        R(14, 16, 3, 1, tc);
        R(10, 16, 4, 1, p.skS);
        R(8, 17, 3, 1, tc);
        R(13, 17, 3, 1, tc);
        px(7, 17, stripe);
        px(16, 17, stripe);
        px(9, 18, tc);
        px(14, 18, tc);
        // Ribbon bow with tails.
        R(10, 18, 4, 1, rib);
        R(11, 18, 2, 1, ribS);
        px(11, 19, rib);
        px(12, 19, rib);
        px(10, 20, rib);
        px(13, 20, rib);
        px(10, 18, p.shade(rib, 0.3));
        // Little gold anchor pin.
        px(15, 21, p.gold);
        px(15, 20, p.gold);
      },
    },
    galaxyhoodie: {
      animated: true,
      draw: (p) => {
        const { R, px, t } = p;
        const space = (x: number, y: number) => {
          if ((x * 7 + y * 13) % 11 === 0 && Math.sin(t / 240 + x * 1.3 + y) > 0.25)
            return "#ffffff";
          if ((x * 5 + y * 3) % 13 === 0 && Math.sin(t / 310 + x + y * 2) > 0.4) return "#9fd8ff";
          if ((x * 3 + y * 5) % 9 < 2) return "#5a2f9a"; // nebula wisps
          return y < 18 ? "#2b1d5c" : y < 21 ? "#33247a" : "#1d2a66";
        };
        patternTorso(p, space);
        patternArms(p, space);
        R(5, 22, 2, 1, "#1a1240");
        R(17, 22, 2, 1, "#1a1240");
        R(7, 23, 10, 1, "#1a1240");
        if (p.back) {
          // Hood lying on the back.
          R(7, 16, 10, 3, (x, y) => p.shade(space(x, y), -0.25));
          R(8, 18, 8, 1, "#1a1240");
          return;
        }
        // Hood around the neck, gold drawstrings, pocket.
        R(6, 15, 12, 2, "#1f1548");
        px(8, 16, "#ffffff");
        R(10, 17, 1, 3, "#ffd76a");
        R(13, 17, 1, 3, "#ffd76a");
        px(10, 20, Math.sin(t / 200) > 0 ? "#fff6c8" : "#ffd76a");
        px(13, 20, Math.sin(t / 200) > 0 ? "#ffd76a" : "#fff6c8");
        R(9, 21, 6, 2, (x, y) => p.shade(space(x, y), -0.3));
        // Tiny ringed planet on the chest.
        R(14, 18, 2, 2, "#ff9ecf");
        px(14, 18, "#ffd1e6");
        px(13, 19, "#ffd76a");
        px(16, 18, "#ffd76a");
        // A shooting star now and then.
        const s = Math.floor(t / 70) % 48;
        if (s < 9) {
          const x = 7 + s;
          const y = 17 + Math.floor(s / 3);
          px(x, y, "#ffffff");
          if (s > 0) px(x - 1, y, "#bfe6ff");
          if (s > 1) px(x - 2, y, "#6a7fd0");
        }
      },
    },
    knight: {
      animated: true,
      draw: (p) => {
        const { R, px, t, gold } = p;
        const steel = "#c9d1db";
        const steelS = "#8d97a5";
        const steelD = "#5d6673";
        const steelL = "#eef3f8";
        const goldS = "#c99a1e";
        const crest = "#2f4fa8";
        p.torso(steel);
        p.armsLong(steel, steelD);
        R(16, 16, 1, 8, steelS);
        R(18, 16, 1, 7, steelS);
        // Arm plates with elbow cops.
        R(5, 19, 2, 1, steelD);
        R(17, 19, 2, 1, steelD);
        px(5, 20, steelL);
        R(5, 22, 2, 1, gold);
        R(17, 22, 2, 1, gold);
        // Plate lines and gold trim.
        R(7, 21, 10, 1, steelS);
        R(9, 16, 6, 1, gold);
        R(7, 23, 10, 1, gold);
        // Tassets over the hips.
        R(7, 24, 4, 2, steel);
        R(13, 24, 4, 2, steel);
        R(7, 25, 4, 1, goldS);
        R(13, 25, 4, 1, goldS);
        R(16, 24, 1, 1, steelS);
        // Pauldrons.
        R(4, 15, 4, 3, steel);
        R(16, 15, 4, 3, steel);
        R(19, 15, 1, 3, steelS);
        R(4, 17, 4, 1, gold);
        R(16, 17, 4, 1, gold);
        px(5, 15, steelL);
        px(17, 15, steelL);
        if (p.back) {
          R(11, 17, 2, 4, steelS);
          R(8, 18, 1, 3, steelL);
          return;
        }
        // Polished highlight and a small crest shield.
        R(8, 17, 1, 3, steelL);
        const m = mid(p);
        R(10 + m, 18, 4, 2, crest);
        R(11 + m, 20, 2, 1, crest);
        R(11 + m, 18, 2, 3, gold);
        R(10 + m, 19, 4, 1, gold);
        // A glint slides across the breastplate every couple of seconds.
        const g = Math.floor(t / 60) % 40;
        if (g < 16)
          for (let y = 17; y <= 22; y++) {
            const x = 7 + g - (y - 17);
            if (x >= 7 && x <= 15) px(x, y, "#ffffff");
            if (x + 1 >= 7 && x + 1 <= 15) px(x + 1, y, steelL);
          }
      },
    },
  },
};
