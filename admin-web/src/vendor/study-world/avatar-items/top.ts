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
    { id: "puffer", name: "Streetwear Puffer", tier: "coins", price: 150 },
    { id: "songket", name: "Baju Melayu Songket", tier: "coins", price: 180 },
    { id: "kebaya", name: "Batik Kebaya", tier: "coins", price: 180 },
    { id: "magicalgirl", name: "Magical Girl Dress", tier: "coins", price: 250 },
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
    puffer: {
      draw: (p) => {
        const { R, px, tc } = p;
        const c = tc;
        const cL = p.shade(c, 0.22);
        const cS = p.shade(c, -0.2);
        const cD = p.shade(c, -0.4);
        const gloss = p.shade(c, 0.6);
        const zip = "#c9d0d8";
        // Puff rows: a lit top, the body, then a stitched seam (every 3 rows).
        const quilt = (x: number, y: number) => {
          const k = (y - 17) % 3;
          const col = k === 0 ? cL : k === 1 ? c : cS;
          return x === 16 || x >= 18 ? p.shade(col, -0.16) : col;
        };
        // Chunky sleeves, one pixel wider on the outside, pinched at the seams.
        R(5, 16, 2, 6, quilt);
        R(17, 16, 2, 6, quilt);
        [17, 18, 20, 21].forEach((y) => {
          px(4, y, quilt(4, y));
          px(19, y, quilt(19, y));
        });
        R(5, 16, 2, 1, c);
        R(17, 16, 2, 1, p.shade(c, -0.16));
        // Ribbed cuffs and bare hands.
        R(5, 22, 2, 1, cD);
        R(17, 22, 2, 1, cD);
        R(5, 23, 2, 1, p.sk);
        R(17, 23, 2, 1, p.sk);
        // Quilted body with a ribbed hem.
        R(7, 16, 10, 7, quilt);
        R(7, 23, 10, 1, cD);
        // Funnel collar standing up around the neck.
        R(6, 15, 12, 1, cS);
        R(7, 16, 10, 1, cL);
        R(16, 16, 1, 1, c);
        // Glossy shine on the puffs.
        px(8, 17, gloss);
        px(9, 17, cL);
        px(8, 20, gloss);
        px(4, 17, gloss);
        px(5, 20, gloss);
        px(17, 17, cL);
        if (p.back) {
          px(11, 16, trimOn(c));
          px(12, 16, trimOn(c));
          px(14, 20, gloss);
          return;
        }
        const m = mid(p);
        // Zip up the middle with a pull tab, hand-pocket slits and a chest tag.
        R(11 + m, 16, 1, 7, (_x, y) => (y % 2 ? zip : "#8d97a5"));
        px(12 + m, 17, zip);
        px(12 + m, 18, "#8d97a5");
        px(9, 21, cD);
        px(14 + m, 21, cD);
        px(14 + m, 18, trimOn(c));
      },
    },
    songket: {
      animated: true,
      draw: (p) => {
        const { R, px, tc, gold, t } = p;
        const goldS = "#c99a1e";
        const goldL = "#fff1b0";
        const light = p.shade(tc, 0.16);
        // Sampin cloth: deep maroon, or navy when the baju is red.
        const base = isReddish(tc) ? "#1b3263" : "#6e1733";
        const baseS = p.shade(base, -0.3);
        const dot = p.shade(base, 0.35);
        p.torso(tc);
        p.armsLong(tc);
        R(5, 17, 1, 4, light);
        // Gold-edged cuffs.
        R(5, 22, 2, 1, gold);
        R(17, 22, 1, 1, gold);
        R(18, 22, 1, 1, goldS);
        // Stand collar (cekak musang) piped in gold.
        R(9, 16, 6, 1, gold);
        if (!p.back) {
          const m = mid(p);
          R(11, 16, 2, 1, p.skS);
          px(10, 16, goldS);
          px(13, 16, goldS);
          // Front placket with three gold studs.
          R(11 + m, 17, 2, 4, light);
          R(11 + m, 17, 1, 4, p.shade(tc, 0.28));
          [17, 19].forEach((y) => px(12 + m, y, gold));
          px(12 + m, 18, goldS);
        }
        // A glint of light runs along the gold threads every few seconds.
        const g = Math.floor(t / 70) % 48;
        const shine = (x: number, y: number) => g < 16 && Math.abs(x - (5 + g) + (y - 21)) < 1;
        // Songket weave: gold diamonds with a bright centre on the dark cloth.
        const weave = (x: number, y: number) => {
          let col = base;
          const d = (x - 8 + 40) % 4;
          if (y === 21 || y === 25) col = x % 2 ? gold : goldS;
          else if (y === 23) col = d === 0 ? goldL : d === 2 ? base : gold;
          else if (d === 0) col = gold;
          else if (d === 2 && y === 22) col = dot;
          if (shine(x, y) && (col === gold || col === goldS)) col = goldL;
          return x === 16 ? p.shade(col, -0.22) : col;
        };
        R(7, 21, 10, 5, weave);
        // The wrap's overlapping edge.
        if (!p.back) R(13, 22, 1, 3, baseS);
      },
    },
    kebaya: {
      animated: true,
      draw: (p) => {
        const { R, px, tc, t } = p;
        const tS = p.shade(tc, -0.22);
        const petal = lum(tc) > 170 ? p.shade(tc, -0.42) : p.shade(tc, 0.55);
        const core = isReddish(tc) ? p.gold : "#d8455a";
        const leaf = p.shade(tc, -0.35);
        const lace = "#fbf3e2";
        const laceS = "#e2d6bf";
        // Batik flowers in a staggered 5×4 repeat, with a little leaf.
        const batik = (x: number, y: number) => {
          const row = Math.floor((y - 16) / 4);
          const u = (x + row * 3 + 40) % 5;
          const v = (y - 16) % 4;
          if (v === 1 && u === 1) return core;
          if ((v === 1 && (u === 0 || u === 2)) || ((v === 0 || v === 2) && u === 1)) return petal;
          if (v === 3 && u === 3) return leaf;
          return tc;
        };
        patternTorso(p, batik);
        patternArms(p, batik);
        // Fitted waist shading and lace cuffs.
        R(7, 20, 1, 3, (x, y) => p.shade(batik(x, y), -0.12));
        R(5, 22, 2, 1, (x) => (x % 2 ? lace : laceS));
        R(17, 22, 2, 1, (x) => (x % 2 ? laceS : lace));
        // Hip-length body ending in a scalloped lace hem.
        R(7, 23, 10, 1, batik);
        R(16, 23, 1, 1, tS);
        R(7, 24, 10, 1, (x) => (x % 2 ? lace : laceS));
        [7, 9, 11, 13, 15].forEach((x) => px(x + 1, 25, x === 15 ? laceS : lace));
        if (p.back) {
          R(9, 16, 6, 1, tS);
          return;
        }
        const m = mid(p);
        // V neckline edged in lace, front opening with kerongsang brooches.
        R(10, 16, 4, 1, p.skS);
        R(11 + m, 17, 1, 1, p.skS);
        px(9, 16, lace);
        px(14, 16, lace);
        px(10 + m, 17, lace);
        px(12 + m, 17, lace);
        R(11 + m, 18, 1, 6, lace);
        const twinkle = Math.floor(t / 110) % 30;
        [18, 20, 22].forEach((y, i) => {
          px(11 + m, y, twinkle === i * 2 ? "#ffffff" : p.gold);
          px(12 + m, y, i === 1 ? "#d8455a" : "#c99a1e");
        });
      },
    },
    magicalgirl: {
      animated: true,
      draw: (p) => {
        const { R, px, t, hsl } = p;
        // Dress colour (pink if the chosen colour is too pale to show).
        const main = lum(p.tc) > 215 ? "#f08aa8" : p.tc;
        const mainS = p.shade(main, -0.22);
        const mainL = p.shade(main, 0.35);
        const W = "#fff6fb";
        const WS = "#e9d6e4";
        const rib = isReddish(main) && lum(main) < 160 ? "#ff8fc8" : "#e8245e";
        const ribS = p.shade(rib, -0.28);
        const ribL = p.shade(rib, 0.4);
        // White bodice with shading on the far side.
        p.torso(W);
        R(16, 16, 1, 6, WS);
        // Puffy sleeves, a white band, bare arms and long white gloves.
        R(4, 16, 3, 3, main);
        R(17, 16, 3, 3, main);
        px(4, 16, mainL);
        px(5, 16, mainL);
        px(4, 17, mainL);
        px(18, 16, mainL);
        R(4, 18, 3, 1, mainS);
        R(17, 18, 3, 1, p.shade(mainS, -0.12));
        R(19, 16, 1, 2, mainS);
        R(5, 19, 2, 1, rib);
        R(17, 19, 2, 1, ribS);
        R(5, 20, 2, 2, p.sk);
        R(17, 20, 2, 2, p.sk);
        R(18, 20, 1, 2, p.skS);
        R(5, 22, 2, 2, W);
        R(17, 22, 2, 2, W);
        R(18, 22, 1, 2, WS);
        // Waist band, then a flared skirt in the dress colour.
        R(7, 21, 10, 1, mainS);
        R(7, 22, 10, 2, main);
        R(6, 24, 12, 1, main);
        R(5, 25, 14, 1, W);
        R(16, 22, 1, 2, mainS);
        R(17, 24, 1, 1, mainS);
        [9, 12, 15].forEach((x) => R(x, 22, 1, 3, mainS));
        px(8, 22, mainL);
        px(6, 24, mainL);
        // The hem twinkles: glitter on the skirt, rainbow lights on the frill.
        for (let x = 5; x < 19; x++) {
          const s = Math.sin(t / 170 + x * 2.3);
          if (s > 0.82) px(x, 25, hsl((x * 40 + t / 6) % 360, 90, 72));
          else if (x % 2 === 0) px(x, 25, WS);
          const g = Math.sin(t / 130 + x * 1.7 + 1);
          if (x > 5 && x < 18 && g > 0.9) px(x, 24, "#ffffff");
          if (x > 6 && x < 17 && Math.sin(t / 210 + x * 3.1) > 0.93) px(x, 23, "#fff6a8");
        }
        if (p.back) {
          // A big bow at the back of the waist with long tails.
          R(8, 20, 3, 2, rib);
          R(13, 20, 3, 2, rib);
          R(11, 20, 2, 2, ribS);
          px(8, 20, ribL);
          R(10, 22, 1, 3, rib);
          R(13, 22, 1, 3, ribS);
          R(8, 16, 8, 1, main);
          return;
        }
        const m = mid(p);
        // Neckline with a collar trim in the dress colour.
        R(10, 16, 4, 1, p.skS);
        R(8, 16, 2, 1, main);
        R(14, 16, 2, 1, main);
        // The big chest ribbon: two loops, a jewel knot and tails.
        R(8 + m, 17, 2, 3, rib);
        R(14 + m, 17, 2, 3, rib);
        R(10 + m, 18, 4, 1, rib);
        px(10 + m, 17, rib);
        px(13 + m, 17, rib);
        px(8 + m, 17, ribL);
        px(9 + m, 18, ribS);
        px(14 + m, 18, ribS);
        R(8 + m, 19, 2, 1, ribS);
        R(14 + m, 19, 2, 1, ribS);
        // Jewel in the knot: a heart that catches the light.
        const shine = Math.floor(t / 90) % 24 < 3;
        R(11 + m, 18, 2, 1, "#ffd84d");
        px(11 + m, 17, shine ? "#ffffff" : "#fff1a6");
        px(12 + m, 17, "#ffd84d");
        px(11 + m, 19, "#e0a92a");
        px(12 + m, 19, "#e0a92a");
        // Ribbon tails over the skirt.
        R(10 + m, 20, 1, 2, rib);
        R(13 + m, 20, 1, 2, ribS);
        px(9 + m, 22, rib);
        px(14 + m, 22, ribS);
      },
      fxFront: (_c, k) => {
        if (k.seated) return;
        // Tiny star sparkles drifting up off the hem.
        k.particles(4, 1700, (i, ph) => {
          const x = k.X([6, 15, 9, 17][i]) + (i % 2 ? 1 : -1) * ph * 2 * k.s;
          const y = k.Y(25.5) - ph * 6 * k.s;
          const col = ["#fff6a8", "#ffffff", "#ffc4e6", "#bfe6ff"][i];
          k.star(Math.round(x), Math.round(y), k.s / 2, col, Math.sin(ph * Math.PI) * 0.9);
        });
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
