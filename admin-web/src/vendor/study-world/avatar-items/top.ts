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
  "7": ["###", "..#", "..#", ".#.", ".#."],
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
    { id: "forgearmor", name: "Forge Armor Suit", tier: "coins", price: 300 },
    { id: "nightsuit", name: "Night Suit", tier: "coins", price: 220 },
    { id: "solarsuit", name: "Solar Suit", tier: "coins", price: 220 },
    { id: "rangertunic", name: "Ranger Tunic", tier: "coins", price: 180 },
    { id: "trooparmor", name: "Trooper Armor", tier: "coins", price: 260 },
    { id: "moonhaori", name: "Wave Haori", tier: "coins", price: 260 },
    { id: "pilotsuit", name: "Pilot Suit", tier: "coins", price: 240 },
    { id: "academyrobe", name: "Academy Robe", tier: "coins", price: 220 },
    { id: "captaincoat", name: "Captain Coat", tier: "coins", price: 250 },
    { id: "shrinerobe", name: "Shrine Robe", tier: "coins", price: 220 },
    { id: "flightsuit", name: "Flight Suit", tier: "coins", price: 220 },
    { id: "racesuit", name: "Race Suit", tier: "coins", price: 220 },
    { id: "tacticalvest", name: "Tactical Vest", tier: "coins", price: 220 },
    { id: "trainerjacket", name: "Trainer Jacket", tier: "coins", price: 180 },
    { id: "neontrench", name: "Neon Trench", tier: "coins", price: 300 },
    { id: "stagedress", name: "Stage Dress", tier: "coins", price: 250 },
    { id: "roninkimono", name: "Ronin Kimono", tier: "coins", price: 220 },
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
    forgearmor: {
      animated: true,
      draw: (p) => {
        const { R, px, t } = p;
        const cu = "#b8693a";
        const cuL = "#e3a06a";
        const cuS = "#8c4a29";
        const cuD = "#5c2f1c";
        const te = "#2aa79b";
        const teL = "#8ff0e4";
        const teS = "#1b746d";
        const under = "#2c2f38";
        // The core (and the back vents) breathe slowly.
        const pulse = (Math.sin(t / 320) + 1) / 2;
        p.torso(cu);
        p.armsLong(cu, cuD);
        R(16, 16, 1, 8, cuS);
        R(18, 16, 1, 7, cuS);
        // Round shoulder plates with a teal rim.
        R(4, 15, 3, 3, cu);
        R(17, 15, 3, 3, cu);
        R(19, 15, 1, 3, cuS);
        px(4, 15, cuL);
        px(5, 15, cuL);
        px(17, 15, cuL);
        R(4, 17, 3, 1, te);
        R(17, 17, 3, 1, teS);
        // Teal elbow bands and dark gauntlet cuffs.
        R(5, 20, 2, 1, te);
        R(17, 20, 2, 1, teS);
        px(5, 19, cuL);
        R(6, 18, 1, 2, cuS);
        px(6, 21, cuS);
        R(5, 22, 2, 1, cuD);
        R(17, 22, 2, 1, cuD);
        // Neck seal, plate seams and a teal belt.
        R(9, 16, 6, 1, under);
        R(7, 21, 10, 1, cuS);
        R(7, 23, 10, 1, teS);
        [9, 14].forEach((x) => px(x, 22, cuS));
        if (p.back) {
          // Spine plate with two vents that glow with the core.
          const vent = p.hsl(174, 75, 30 + pulse * 28);
          R(11, 17, 2, 4, cuS);
          px(11, 17, cuD);
          R(8, 18, 2, 2, teS);
          R(14, 18, 2, 2, teS);
          px(8, 19, vent);
          px(9, 19, vent);
          px(14, 19, vent);
          px(15, 19, vent);
          px(8, 17, cuL);
          return;
        }
        const m = mid(p);
        // Teal chest plate edges and a polished highlight.
        R(8, 20, 2, 1, te);
        R(14, 20, 2, 1, teS);
        R(8, 17, 1, 2, cuL);
        px(8, 22, cuL);
        px(12 + m, 23, teL);
        // The round core: a dark rim that lights up at the top of each pulse.
        const rim = pulse > 0.72 ? te : teS;
        [
          [11, 17],
          [12, 17],
          [10, 18],
          [13, 18],
          [10, 19],
          [13, 19],
          [11, 20],
          [12, 20],
        ].forEach(([x, y]) => px(x + m, y, rim));
        R(11 + m, 18, 2, 2, p.hsl(174, 85, 48 + pulse * 26));
        px(11 + m, 18, pulse > 0.55 ? "#ffffff" : teL);
      },
    },
    nightsuit: {
      animated: true,
      draw: (p) => {
        const { R, px, t } = p;
        const ch = "#2f2d38";
        const chS = "#211f28";
        const chL = "#47434f";
        const pl = "#6a2f66";
        const plL = "#93509a";
        const plS = "#47204a";
        const owl = "#cbb8de";
        const belt = "#56505f";
        const brass = "#d6ac4a";
        p.torso(ch);
        p.armsLong(ch, pl);
        R(16, 16, 1, 8, chS);
        R(18, 16, 1, 7, chS);
        // Plum shoulders, then plum gauntlets with little feather fins.
        R(5, 16, 2, 2, pl);
        R(17, 16, 2, 2, plS);
        px(5, 16, plL);
        R(5, 20, 2, 3, pl);
        R(17, 20, 1, 3, pl);
        R(18, 20, 1, 3, plS);
        px(4, 20, pl);
        px(4, 21, plS);
        px(19, 20, plS);
        px(19, 21, plS);
        px(5, 20, plL);
        // Plum collar and side panels.
        R(8, 16, 8, 1, pl);
        R(7, 17, 1, 5, pl);
        R(16, 17, 1, 5, plS);
        // Utility belt: pouches either side of a brass buckle.
        R(7, 22, 10, 1, belt);
        const pouch = "#3f3a48";
        if (p.back) {
          R(8, 16, 8, 2, pl);
          R(9, 18, 6, 1, pl);
          R(10, 19, 4, 1, plS);
          // Folded wing shapes down the back.
          px(9, 20, chL);
          px(14, 20, chL);
          px(10, 21, chL);
          px(13, 21, chL);
          R(8, 22, 2, 2, pouch);
          R(11, 22, 2, 2, pouch);
          R(14, 22, 2, 2, pouch);
          px(11, 22, brass);
          return;
        }
        const m = mid(p);
        R(10, 16, 4, 1, p.skS);
        R(8, 22, 2, 2, pouch);
        R(14 + m, 22, 2, 2, pouch);
        px(8, 22, brass);
        px(15 + m, 22, brass);
        R(11 + m, 22, 2, 1, brass);
        px(12 + m, 22, "#a8822e");
        // The owl emblem: ear tufts, two round eyes that blink now and then, a beak.
        const blink = t % 4200 < 160;
        const eye = blink ? owl : "#ffd25a";
        const o = 9 + m;
        px(o, 17, owl);
        px(o + 5, 17, owl);
        R(o, 18, 6, 2, owl);
        px(o + 1, 19, eye);
        px(o + 4, 19, eye);
        R(o + 1, 20, 4, 1, owl);
        R(o + 2, 20, 2, 1, "#e09a2c");
        R(o + 2, 21, 2, 1, owl);
      },
    },
    solarsuit: {
      animated: true,
      draw: (p) => {
        const { R, px, t } = p;
        const W = "#f7f5ef";
        const WS = "#d6d0c2";
        const gold = "#f2c14e";
        const goldS = "#c9952a";
        const sun = "#f28c28";
        const sunL = "#ffd84d";
        p.torso(W);
        p.armsLong(W, gold);
        R(16, 16, 1, 8, WS);
        R(18, 16, 1, 7, WS);
        // Gold shoulder caps, gold-edged cuffs and gloves.
        R(5, 16, 2, 1, gold);
        R(17, 16, 2, 1, goldS);
        R(5, 22, 2, 1, goldS);
        R(17, 22, 2, 1, goldS);
        // High gold collar and a gold belt.
        R(9, 16, 6, 1, gold);
        R(7, 22, 10, 1, gold);
        R(16, 22, 1, 1, goldS);
        // Side seams so the arms read apart from the body.
        R(7, 17, 1, 5, WS);
        // The rays take turns to shine: straight ones, then the diagonals.
        const turn = Math.floor(t / 420) % 2;
        const straight = turn ? sunL : gold;
        const diag = turn ? gold : sunL;
        /** Sun emblem 8 wide from x = o: a round disc with a bright middle, and rays. */
        const sunAt = (o: number) => {
          R(o + 3, 17, 2, 1, sun);
          R(o + 2, 18, 4, 2, sun);
          R(o + 3, 20, 2, 1, sun);
          R(o + 3, 18, 2, 2, sunL);
          px(o + 3, 18, "#fff6c8");
          R(o, 18, 1, 2, straight);
          R(o + 7, 18, 1, 2, straight);
          R(o + 3, 21, 2, 1, straight);
          px(o + 1, 17, diag);
          px(o + 6, 17, diag);
          px(o + 1, 20, diag);
          px(o + 6, 20, diag);
        };
        if (p.back) {
          // The same sun between the shoulders.
          sunAt(8);
          return;
        }
        const m = mid(p);
        R(11 + m, 22, 2, 1, sun);
        sunAt(8 + m);
      },
    },
    rangertunic: {
      draw: (p) => {
        const { R, px } = p;
        const moss = "#5f7f3a";
        const mossL = "#82a552";
        const mossS = "#456029";
        const mossD = "#33461e";
        const lea = "#7a4a26";
        const leaL = "#a06838";
        const leaD = "#55311a";
        const buckle = "#d9b44a";
        p.torso(moss);
        p.armsLong(moss);
        R(16, 16, 1, 8, mossS);
        // Leather bracers on the forearms.
        R(5, 21, 2, 2, lea);
        R(17, 21, 1, 2, lea);
        R(18, 21, 1, 2, leaD);
        px(5, 21, leaL);
        px(5, 22, leaD);
        // A short mantle over the shoulders.
        R(5, 16, 14, 2, mossS);
        R(6, 15, 12, 1, mossD);
        px(5, 16, mossL);
        R(18, 16, 1, 2, mossD);
        // Tunic skirt over the hips (split in the front), with a notched hem.
        const m = mid(p);
        const split = (x: number) => !p.back && (x === 11 + m || x === 12 + m);
        for (let x = 6; x <= 17; x++) {
          if (x > 6 && x < 17) px(x, 23, x === 16 ? mossS : moss);
          if (split(x)) continue;
          px(x, 24, x >= 16 ? mossS : moss);
          px(x, 25, [6, 8, 10, 13, 15, 17].includes(x) ? mossD : mossS);
        }
        // Leather belt.
        R(7, 22, 10, 1, lea);
        R(16, 22, 1, 1, leaD);
        if (p.back) {
          // The hood lying on the back, coming to a point.
          R(8, 17, 8, 2, mossD);
          R(9, 19, 6, 1, mossD);
          R(10, 20, 4, 1, mossD);
          R(11, 21, 2, 1, mossD);
          R(9, 17, 6, 1, mossS);
          R(11, 22, 2, 1, leaD);
          return;
        }
        // The split's edge.
        px(11 + m, 23, mossS);
        px(12 + m, 23, mossS);
        // Laced neck and a leaf clasp holding the mantle.
        R(10, 16, 4, 1, p.skS);
        px(12 + m, 19, leaL);
        px(11 + m, 20, leaL);
        px(12 + m, 21, leaL);
        // Leaf clasp: a bright leaf on a little gold stem.
        px(11 + m, 17, "#c4e88a");
        px(12 + m, 17, "#a8d070");
        px(11 + m, 18, "#a8d070");
        px(10 + m, 18, buckle);
        // Belt buckle and a small pouch.
        R(10 + m, 22, 2, 1, buckle);
        px(10 + m, 22, "#a8822e");
        R(14, 22, 2, 2, leaL);
        px(14, 23, lea);
        px(8, 18, mossL);
        px(8, 19, mossL);
      },
    },
    trooparmor: {
      animated: true,
      draw: (p) => {
        const { R, px, t } = p;
        const W = "#eef1f4";
        const WS = "#c5ccd6";
        const WD = "#9aa4b2";
        const sl = "#4b5668";
        const slD = "#333b48";
        const gold = "#e2b23f";
        // Slate undersuit and gloves.
        p.torso(sl);
        p.armsLong(sl, slD);
        R(16, 16, 1, 8, slD);
        R(18, 16, 1, 7, slD);
        // White shoulder plates and forearm plates.
        R(4, 15, 3, 3, W);
        R(17, 15, 3, 3, W);
        R(19, 15, 1, 3, WS);
        R(4, 17, 3, 1, WD);
        R(17, 17, 3, 1, WD);
        R(5, 20, 2, 2, W);
        R(17, 20, 1, 2, W);
        R(18, 20, 1, 2, WS);
        // Belt with white boxes.
        R(7, 22, 10, 1, slD);
        R(8, 22, 2, 1, WS);
        R(14, 22, 2, 1, WS);
        // A lamp on one shoulder (the same shoulder from behind) blinks.
        const on = t % 1200 < 260;
        px(p.back ? 5 : 18, 15, on ? "#ff8f1f" : "#6b5a58");
        if (p.back) {
          // Back plate with a power pack.
          R(8, 16, 8, 5, W);
          R(15, 16, 1, 5, WS);
          R(9, 17, 6, 4, WD);
          R(10, 18, 4, 2, sl);
          px(10, 18, "#6c788c");
          R(8, 21, 8, 1, gold);
          return;
        }
        const m = mid(p);
        // White chest plate edged with the gold trim stripe.
        R(8, 16, 8, 5, W);
        R(15, 16, 1, 5, WS);
        R(10, 16, 4, 1, slD);
        R(8, 20, 8, 1, gold);
        R(15, 20, 1, 1, "#b58a2a");
        // Vents and a centre ridge.
        R(9, 18, 2, 1, WD);
        R(13 + m, 18, 2, 1, WD);
        R(11 + m, 17, 1, 3, WS);
        px(9, 17, "#ffffff");
        // Ab plates under the chest.
        R(9, 21, 2, 1, WS);
        R(13, 21, 2, 1, WS);
        R(11 + m, 22, 2, 1, WD);
      },
    },
    moonhaori: {
      animated: true,
      draw: (p) => {
        const { R, px, t } = p;
        const uni = "#23232f";
        const uniS = "#17171f";
        const ind = "#2c3d8c";
        const indD = "#1f2b66";
        const indL = "#4d63b8";
        const foam = "#eef2fb";
        // Rows of white wave arcs (like fish scales) on indigo, every four
        // rows, drifting slowly sideways; each arc has a light glint inside.
        const shift = Math.floor(t / 450);
        const arc = [2, 1, 0, 0, 1, 2];
        const wave = (x: number, y: number) => {
          const u = (x + shift + 60) % 6;
          const k = (y - 16 - arc[u] + 40) % 4;
          const c = k === 0 ? foam : k === 1 && (u === 2 || u === 3) ? indL : ind;
          return x === 16 || x === 19 ? p.shade(c, -0.18) : c;
        };
        // The dark uniform underneath.
        p.torso(uni);
        // Wide haori sleeves and bare hands.
        R(4, 16, 3, 7, wave);
        R(17, 16, 3, 7, wave);
        R(4, 22, 3, 1, indD);
        R(17, 22, 3, 1, indD);
        R(5, 23, 2, 1, p.sk);
        R(17, 23, 2, 1, p.sk);
        if (p.back) {
          // One long back panel down past the hips.
          R(7, 16, 10, 10, wave);
          R(7, 25, 10, 1, indD);
          R(8, 16, 8, 1, indD);
          return;
        }
        const m = mid(p);
        // Open front: the haori hangs down each side past the hips.
        R(7, 16, 3, 10, wave);
        R(14, 16, 3, 10, wave);
        R(9, 16, 1, 10, indD);
        R(14, 16, 1, 10, indD);
        R(7, 25, 3, 1, indD);
        R(14, 25, 3, 1, indD);
        // Uniform: stand collar, gold buttons, a white belt.
        R(10, 16, 4, 1, uniS);
        R(11, 16, 2, 1, p.skS);
        px(11 + m, 18, "#d9b44a");
        px(11 + m, 20, "#d9b44a");
        R(10, 22, 4, 1, "#e8e4da");
        R(13, 22, 1, 1, "#c9c3b5");
      },
    },
    pilotsuit: {
      animated: true,
      draw: (p) => {
        const { R, px, t } = p;
        const W = "#f4f2f8";
        const WS = "#d4cfe0";
        const vi = "#7a4fd8";
        const viS = "#56339f";
        const viD = "#3a2470";
        // Seams glow lilac, with a brighter pulse running down from the shoulders.
        const seam = (y: number) =>
          p.hsl(282, 100, 62 + 26 * Math.max(0, Math.cos((y - 16) * 0.7 - t / 140)));
        p.torso(W);
        p.armsLong(W, vi);
        R(16, 16, 1, 8, WS);
        R(18, 16, 1, 7, WS);
        // Violet forearms and gloves.
        R(5, 21, 2, 2, vi);
        R(17, 21, 1, 2, vi);
        R(18, 21, 1, 2, viS);
        // Violet sides and hips.
        R(7, 17, 1, 7, vi);
        R(16, 17, 1, 7, viS);
        R(7, 22, 10, 2, vi);
        R(16, 22, 1, 2, viS);
        // Glowing seams along the arms, down the sides and round the waist.
        [18, 19, 20].forEach((y) => {
          px(5, y, seam(y));
          px(18, y, seam(y));
          px(8, y, seam(y));
          px(15, y, seam(y));
        });
        R(8, 21, 8, 1, seam(21));
        if (p.back) {
          // Violet spine with glowing nodes.
          R(9, 16, 6, 1, viD);
          R(11, 17, 2, 4, vi);
          [17, 19].forEach((y) => R(11, y, 2, 1, seam(y)));
          return;
        }
        const m = mid(p);
        // Neck ring, a small violet V and a glowing chest node.
        R(9, 16, 6, 1, viS);
        R(10, 16, 4, 1, viD);
        R(10, 17, 4, 1, vi);
        R(11, 18, 2, 1, vi);
        px(11 + m, 18, seam(18));
        px(9, 17, WS);
      },
    },
    academyrobe: {
      draw: (p) => {
        const { R, px } = p;
        const robe = "#27262f";
        const robeS = "#18171e";
        const robeL = "#403f4d";
        const te = "#1fa09b";
        const teS = "#15716d";
        const sil = "#cfd6df";
        const silS = "#97a2b0";
        const shirt = "#f4f1ea";
        const shirtS = "#d6d0c4";
        // Scarf stripes: teal and silver in blocks of two.
        const stripe = (n: number) => (Math.floor(n / 2) % 2 ? sil : te);
        p.torso(robe);
        p.armsLong(robe);
        R(16, 16, 1, 8, robeS);
        R(18, 16, 1, 7, robeS);
        px(5, 17, robeL);
        px(5, 18, robeL);
        // Bell sleeves that open wide at the wrist, lined in teal.
        R(4, 20, 1, 2, robe);
        R(19, 20, 1, 2, robeS);
        R(4, 22, 3, 1, te);
        R(17, 22, 3, 1, teS);
        if (p.back) {
          // One long panel down past the hips, with the hood lying on it.
          R(7, 24, 10, 3, robe);
          R(6, 25, 1, 2, robe);
          R(17, 25, 1, 2, robeS);
          R(16, 24, 1, 3, robeS);
          R(6, 26, 12, 1, robeS);
          R(8, 17, 8, 2, robeL);
          R(9, 19, 6, 1, robeL);
          R(10, 20, 4, 1, robeL);
          R(11, 21, 2, 1, robeL);
          R(9, 17, 6, 1, teS);
          R(8, 16, 8, 1, stripe);
          return;
        }
        const m = mid(p);
        // Open front: long robe panels either side, legs show in the middle.
        R(6, 24, 4, 3, robe);
        R(14, 24, 4, 3, robe);
        R(17, 24, 1, 3, robeS);
        R(6, 26, 4, 1, robeS);
        R(14, 26, 4, 1, robeS);
        R(9, 17, 1, 10, robeL);
        R(14, 17, 1, 10, robeL);
        // White shirt underneath.
        R(10, 16, 4, 8, shirt);
        R(13, 16, 1, 8, shirtS);
        R(10, 23, 4, 1, shirtS);
        // Scarf round the neck, one striped end hanging down with a fringe.
        R(9, 16, 6, 1, stripe);
        R(11 + m, 17, 2, 6, (_x, y) => stripe(y - 1));
        px(11 + m, 23, silS);
        px(12 + m, 23, sil);
        // Our crest on the chest: a little owl (ears, gold eyes) over a gold star.
        R(14, 18, 3, 3, teS);
        px(14, 18, sil);
        px(16, 18, sil);
        px(14, 19, "#ffd25a");
        px(15, 19, sil);
        px(16, 19, "#ffd25a");
        px(15, 20, p.gold);
      },
    },
    captaincoat: {
      draw: (p) => {
        const { R, px } = p;
        const bu = "#7c1f30";
        const buS = "#5a1522";
        const buL = "#a3354a";
        const buD = "#3e0d17";
        const gold = "#e8b93f";
        const goldS = "#b8892a";
        const W = "#f8f4ec";
        const WS = "#ddd4c4";
        const sash = "#2f5f9a";
        const sashS = "#1f416d";
        p.torso(bu);
        p.armsLong(bu);
        R(16, 16, 1, 8, buS);
        R(18, 16, 1, 7, buS);
        px(5, 17, buL);
        // Gold shoulder boards with a little fringe.
        R(4, 15, 3, 1, gold);
        R(17, 15, 3, 1, goldS);
        px(4, 16, goldS);
        px(19, 16, goldS);
        // Wide turned-back cuffs: gold braid, a button and a lace ruffle.
        R(4, 20, 3, 2, buD);
        R(17, 20, 3, 2, buD);
        R(4, 20, 3, 1, gold);
        R(17, 20, 3, 1, goldS);
        px(5, 21, gold);
        px(18, 21, goldS);
        R(5, 22, 2, 1, W);
        R(17, 22, 2, 1, WS);
        // Sash round the waist.
        R(7, 21, 10, 2, sash);
        R(7, 21, 10, 1, p.shade(sash, 0.18));
        R(16, 21, 1, 2, sashS);
        if (p.back) {
          // Long tails with a centre vent and two gold buttons.
          R(7, 24, 10, 3, bu);
          R(6, 25, 1, 2, bu);
          R(17, 25, 1, 2, buS);
          R(16, 24, 1, 3, buS);
          R(11, 23, 2, 4, buS);
          R(6, 26, 12, 1, goldS);
          R(8, 16, 8, 1, buD);
          px(10, 23, gold);
          px(13, 23, gold);
          return;
        }
        // Coat tails either side of the open front, gold-edged.
        R(6, 24, 4, 3, bu);
        R(14, 24, 4, 3, bu);
        R(17, 24, 1, 3, buS);
        R(6, 26, 4, 1, goldS);
        R(14, 26, 4, 1, goldS);
        // White shirt with a ruffled front: frills that stick out every other row.
        R(10, 16, 4, 8, WS);
        R(11, 16, 2, 1, p.skS);
        R(11, 17, 2, 4, W);
        R(10, 18, 4, 1, "#ffffff");
        R(10, 20, 4, 1, "#ffffff");
        // Gold piping down both front edges and a dark collar.
        R(9, 16, 1, 11, gold);
        R(14, 16, 1, 11, goldS);
        R(7, 16, 2, 1, buD);
        R(15, 16, 2, 1, buD);
        px(8, 17, buL);
        // Two rows of gold buttons.
        [18, 20].forEach((y) => {
          px(8, y, gold);
          px(15, y, goldS);
        });
        // The sash crosses the shirt and knots at the hip; its ends hang down.
        R(10, 21, 4, 2, sash);
        R(10, 21, 4, 1, p.shade(sash, 0.18));
        R(7, 22, 2, 2, sashS);
        px(7, 22, sash);
        R(7, 24, 1, 2, sash);
        px(8, 24, sashS);
      },
    },
    shrinerobe: {
      draw: (p) => {
        const { R, px } = p;
        const W = "#f8f6f1";
        const WS = "#dcd5c8";
        const WD = "#b9b0a0";
        const red = "#d8262e";
        const redS = "#a31c22";
        p.torso(W);
        R(16, 16, 1, 8, WS);
        R(7, 23, 10, 1, WS);
        // Wide square sleeves, edged with a thin red cord.
        R(4, 16, 3, 7, W);
        R(17, 16, 3, 7, W);
        R(19, 16, 1, 7, WS);
        R(18, 18, 1, 4, WS);
        px(4, 19, WS);
        px(4, 20, WS);
        R(4, 22, 3, 1, red);
        R(17, 22, 3, 1, redS);
        R(5, 23, 2, 1, p.sk);
        R(17, 23, 2, 1, p.sk);
        // The cords' ends hang off the outer corners.
        px(4, 23, red);
        px(19, 23, redS);
        if (p.back) {
          R(9, 16, 6, 1, WS);
          R(11, 17, 2, 6, WS);
          return;
        }
        const m = mid(p);
        // Crossed collar (left over right) with a thin red under-collar.
        R(10, 16, 4, 1, p.skS);
        px(11, 17, p.skS);
        px(9, 16, WD);
        px(14, 16, WD);
        px(10, 17, red);
        px(13, 16, red);
        px(12, 17, red);
        px(12, 18, WD);
        px(13, 19, WD);
        R(13 + m, 20, 1, 4, WD);
        // Thin red ties tied in a small bow on the chest.
        px(10 + m, 20, red);
        px(11 + m, 20, redS);
        px(12 + m, 20, red);
        px(10 + m, 21, redS);
        px(12 + m, 21, redS);
      },
    },
    flightsuit: {
      animated: true,
      draw: (p) => {
        const { R, px, t } = p;
        const O = "#e8772c";
        const OS = "#b85a1e";
        const OL = "#ffa25e";
        const W = "#f2f2ee";
        const WS = "#c9cdd3";
        const gr = "#5d6573";
        const grL = "#9aa3b1";
        const grD = "#3a404b";
        const blu = "#2f5fc4";
        const star = "#ffd23f";
        p.torso(O);
        p.armsLong(O, grD);
        R(16, 16, 1, 8, OS);
        R(18, 16, 1, 7, OS);
        px(6, 20, OL);
        // Ribbed cuffs.
        R(5, 22, 2, 1, gr);
        R(17, 22, 2, 1, grD);
        // Blue shoulder patch with our yellow star; a pen pocket on the other arm.
        R(5, 17, 2, 2, blu);
        px(5, 17, star);
        px(17, 18, W);
        px(17, 19, OS);
        // White harness: shoulder straps, a chest strap and a waist strap,
        // with leg straps going on down over the hips.
        R(7, 23, 10, 1, W);
        R(16, 23, 1, 1, WS);
        if (p.back) {
          R(9, 16, 6, 1, grD);
          R(9, 17, 1, 6, W);
          R(14, 17, 1, 6, WS);
          R(10, 19, 4, 1, W);
          R(11, 18, 2, 3, WS);
          px(9, 24, W);
          px(14, 24, WS);
          return;
        }
        const m = mid(p);
        R(10, 16, 4, 1, p.skS);
        px(9, 16, OS);
        px(14, 16, OS);
        R(9, 17, 1, 6, W);
        R(14, 17, 1, 6, WS);
        R(9, 19, 6, 1, W);
        R(14, 19, 1, 1, WS);
        px(9, 24, W);
        px(14, 24, WS);
        // Buckle with a status light that blinks green now and then.
        R(11 + m, 19, 2, 1, grL);
        px(12 + m, 19, t % 1800 < 220 ? "#8dff9a" : "#2f9a4a");
        // Name tag above the strap.
        R(10 + m, 17, 2, 1, W);
        px(11 + m, 17, WS);
        // Ribbed hoses: one from the buckle into the waist, one down the side.
        px(11 + m, 20, gr);
        px(11 + m, 21, grL);
        px(12 + m, 22, gr);
        px(8, 20, gr);
        px(8, 21, grL);
        px(8, 22, gr);
      },
    },
    racesuit: {
      draw: (p) => {
        const { R, px } = p;
        const rd = "#d8262e";
        const rdS = "#a51b22";
        const W = "#f6f6f2";
        const WS = "#d2d2ce";
        const blk = "#26262c";
        const yel = "#ffd23f";
        const blu = "#2f6fd6";
        // Red body, white sleeves with a red stripe, black gloves.
        p.torso(rd);
        p.armsLong(W, blk);
        R(16, 16, 1, 8, rdS);
        R(5, 16, 2, 1, rd);
        R(17, 16, 2, 1, rdS);
        R(5, 17, 1, 5, rd);
        R(18, 17, 1, 5, rdS);
        R(5, 22, 2, 1, blk);
        R(17, 22, 2, 1, blk);
        // White waistband over a dark belt line.
        R(7, 22, 10, 1, W);
        R(16, 22, 1, 1, WS);
        R(7, 23, 10, 1, blk);
        if (p.back) {
          R(9, 16, 6, 1, blk);
          digit(p, "7", 10, 17, W);
          R(14, 17, 2, 1, yel);
          return;
        }
        const m = mid(p);
        // High racing collar and a short zip.
        R(9, 16, 6, 1, blk);
        px(11 + m, 17, WS);
        // Sponsor-style blocks (just shapes) and the number on the chest.
        R(8 + m, 18, 3, 1, yel);
        px(10 + m, 18, blk);
        R(8 + m, 20, 3, 1, W);
        px(9 + m, 20, blu);
        digit(p, "7", 13, 17, W);
      },
    },
    tacticalvest: {
      draw: (p) => {
        const { R, px } = p;
        const sh = "#737882";
        const shS = "#585d66";
        const ol = "#5f6d3a";
        const olS = "#47522b";
        const olL = "#7d8c4f";
        const olD = "#333b1f";
        // Grey long-sleeve shirt with dark gloves and olive elbow pads.
        p.torso(sh);
        p.armsLong(sh, "#3b3d34");
        R(5, 22, 2, 1, shS);
        R(17, 22, 2, 1, shS);
        R(5, 19, 2, 2, olS);
        R(17, 19, 2, 2, olD);
        // The plate carrier: shoulder straps, plate and side cummerbund.
        R(8, 16, 2, 1, ol);
        R(14, 16, 2, 1, ol);
        R(7, 17, 10, 7, ol);
        R(16, 17, 1, 7, olS);
        R(7, 23, 10, 1, olS);
        // Webbing rows.
        for (let x = 8; x < 16; x++) if (x % 2) px(x, 18, olS);
        if (p.back) {
          // Drag handle, webbing and a flat hydration pouch.
          R(10, 16, 4, 1, olD);
          R(9, 19, 6, 4, olS);
          R(9, 19, 6, 1, olL);
          R(11, 20, 2, 1, olD);
          return;
        }
        const m = mid(p);
        R(10, 16, 4, 1, shS);
        R(11, 16, 2, 1, p.skS);
        // A small patch with our yellow star.
        R(10 + m, 17, 3, 1, olD);
        px(11 + m, 17, "#ffd23f");
        // Three magazine pouches with flaps and snaps.
        [8, 11, 14].forEach((x) => {
          R(x, 20, 2, 3, ol);
          R(x, 20, 2, 1, olL);
          px(x, 21, olL);
          px(x + 1, 22, olS);
        });
        R(10, 20, 1, 3, olD);
        R(13, 20, 1, 3, olD);
        px(9, 20, olD);
        px(12, 20, olD);
        px(15, 20, olD);
      },
    },
    trainerjacket: {
      draw: (p) => {
        const { R, px } = p;
        const te = "#1fa39f";
        const teS = "#167975";
        const teL = "#5fd0c8";
        const W = "#f4f6f2";
        const WS = "#cfd6d4";
        const blk = "#25262c";
        const star = "#ffd23f";
        const starS = "#d9a91c";
        // Black tee with short sleeves, teal wristbands.
        p.torso(blk);
        p.armsShort(blk);
        R(5, 22, 2, 1, te);
        R(17, 22, 2, 1, teS);
        // The sleeveless jacket: white yoke over the shoulders, teal body.
        R(7, 16, 10, 8, te);
        R(7, 16, 10, 3, W);
        R(16, 16, 1, 3, WS);
        R(16, 19, 1, 5, teS);
        R(7, 19, 10, 1, teS);
        R(7, 23, 10, 1, W);
        R(16, 23, 1, 1, WS);
        px(8, 20, teL);
        if (p.back) {
          R(9, 16, 6, 1, WS);
          R(11, 20, 2, 3, teS);
          return;
        }
        const m = mid(p);
        // Open front showing the tee, with a white collar.
        R(11 + m, 16, 2, 8, blk);
        R(11, 16, 2, 1, p.skS);
        R(9, 16, 2, 1, WS);
        R(13, 16, 2, 1, WS);
        px(10 + m, 17, WS);
        px(13 + m, 17, WS);
        // Pocket slit, and our yellow star badge on the chest.
        R(14, 21, 2, 1, teS);
        px(8, 20, star);
        px(7, 21, star);
        px(8, 21, "#fff1a6");
        px(9, 21, star);
        px(7, 22, starS);
        px(9, 22, starS);
      },
    },
    neontrench: {
      animated: true,
      draw: (p) => {
        const { R, px, t } = p;
        const B = "#18181f";
        const BS = "#0e0e13";
        const BL = "#2c2c37";
        // The edge lines breathe slowly: magenta brightens as cyan dims.
        const k = (Math.sin(t / 650) + 1) / 2;
        const mag = p.hsl(312, 100, 42 + k * 26);
        const cy = p.hsl(186, 100, 66 - k * 22);
        // A bright spark runs down the front edges every few seconds.
        const run = Math.floor(t / 80) % 40;
        const edge = (y: number) => (run === y - 16 ? "#ffffff" : cy);
        p.torso(B);
        p.armsLong(B, "#24242c");
        R(16, 16, 1, 8, BS);
        R(18, 16, 1, 7, BS);
        px(5, 17, BL);
        px(5, 18, BL);
        // Glowing cuffs and shoulder seams.
        R(5, 22, 2, 1, cy);
        R(17, 22, 2, 1, cy);
        px(5, 16, mag);
        px(18, 16, mag);
        // Belt.
        R(7, 22, 10, 1, BS);
        if (p.back) {
          R(7, 24, 10, 4, B);
          R(6, 25, 1, 3, B);
          R(17, 25, 1, 3, BS);
          R(16, 24, 1, 4, BS);
          R(11, 23, 2, 4, BS);
          R(11, 23, 1, 4, edge(20));
          R(6, 27, 12, 1, mag);
          R(8, 16, 8, 1, BL);
          R(8, 17, 8, 1, mag);
          return;
        }
        const m = mid(p);
        // Long tails either side of the open front.
        R(6, 24, 4, 4, B);
        R(14, 24, 4, 4, B);
        R(17, 24, 1, 4, BS);
        R(6, 27, 4, 1, mag);
        R(14, 27, 4, 1, mag);
        // Dark shirt inside with a little circuit line.
        R(10, 16, 4, 7, "#23232d");
        R(11, 16, 2, 1, p.skS);
        px(11 + m, 18, cy);
        px(11 + m, 19, "#1d6f7a");
        px(12 + m, 20, cy);
        // Lapels, then the glowing front edges all the way down.
        R(7, 16, 3, 1, BL);
        R(14, 16, 3, 1, BL);
        px(9, 17, BL);
        px(14, 17, BL);
        for (let y = 16; y <= 27; y++) {
          px(9, y, edge(y));
          px(14, y, edge(y));
        }
        // Belt buckle.
        px(8, 22, mag);
      },
    },
    stagedress: {
      animated: true,
      draw: (p) => {
        const { R, px, t } = p;
        const pk = "#ff7eb6";
        const pkS = "#e0569a";
        const pkL = "#ffb3d6";
        const W = "#fff7fb";
        const WS = "#f0d6e6";
        const rib = "#e8246e";
        const ribS = "#b0174f";
        // Sequins: a scatter of spots that twinkle white one at a time.
        const sequin = (x: number, y: number, c: string) => {
          if ((x * 3 + y * 5) % 11 !== 0) return c;
          return Math.sin(t / 160 + x * 1.9 + y * 2.7) > 0.75 ? "#ffffff" : pkL;
        };
        // Bodice.
        R(7, 16, 10, 6, (x, y) => sequin(x, y, x === 16 ? pkS : pk));
        // Puffy white sleeves trimmed in pink, bare arms, frilly wrist cuffs.
        R(4, 16, 3, 2, W);
        R(17, 16, 3, 2, W);
        R(19, 16, 1, 2, WS);
        px(4, 16, "#ffffff");
        R(4, 18, 3, 1, pk);
        R(17, 18, 3, 1, pkS);
        R(5, 19, 2, 3, p.sk);
        R(17, 19, 2, 3, p.sk);
        R(18, 19, 1, 3, p.skS);
        R(5, 22, 2, 1, W);
        R(17, 22, 2, 1, WS);
        px(4, 22, WS);
        px(19, 22, WS);
        R(5, 23, 2, 1, p.sk);
        R(17, 23, 2, 1, p.sk);
        // White waistband, then a tiered skirt: pink, a white frill, pink, lace.
        R(7, 21, 10, 1, W);
        R(16, 21, 1, 1, WS);
        R(7, 22, 10, 2, (x, y) => sequin(x, y, x === 16 ? pkS : pk));
        R(6, 24, 12, 1, W);
        R(17, 24, 1, 1, WS);
        R(5, 25, 14, 1, pk);
        R(18, 25, 1, 1, pkS);
        [9, 12, 15].forEach((x) => {
          px(x, 22, pkS);
          px(x, 23, pkS);
          px(x - 1, 25, pkS);
        });
        for (let x = 5; x < 19; x += 2) px(x, 26, x > 16 ? WS : W);
        if (p.back) {
          // Laced back and a rose bow at the waist with long tails.
          [17, 19].forEach((y) => {
            px(11, y, W);
            px(12, y + 1, W);
          });
          [18, 20].forEach((y) => {
            px(11, y, pkS);
            px(12, y - 1, pkS);
          });
          R(9, 21, 2, 2, rib);
          R(13, 21, 2, 2, ribS);
          R(11, 21, 2, 1, ribS);
          px(9, 21, p.shade(rib, 0.35));
          px(11, 22, rib);
          px(12, 23, ribS);
          px(11, 24, rib);
          R(8, 16, 8, 1, W);
          return;
        }
        const m = mid(p);
        // Sweetheart neckline with a white frill edge.
        R(10, 16, 4, 1, p.skS);
        R(8, 16, 2, 1, W);
        R(14, 16, 2, 1, W);
        // A small rose ribbon bow at the neck with short tails.
        px(10 + m, 17, rib);
        px(13 + m, 17, rib);
        R(10 + m, 18, 4, 1, rib);
        px(10 + m, 18, p.shade(rib, 0.35));
        R(11 + m, 17, 2, 2, ribS);
        px(11 + m, 19, rib);
        px(12 + m, 20, ribS);
        // A twinkling star gem on the waistband.
        const shine = Math.floor(t / 100) % 20 < 2;
        px(12 + m, 21, shine ? "#ffffff" : p.gold);
      },
      fxFront: (_c, k) => {
        if (k.seated) return;
        // Stage twinkles: little stars that pop in and out around the skirt.
        [
          [4.5, 21],
          [19.5, 23],
          [5, 26.5],
        ].forEach(([gx, gy], i) => {
          const a = Math.sin(k.t / 260 + i * 2.1);
          if (a > 0.2) k.star(k.X(gx), k.Y(gy), k.s / 2, i === 1 ? "#ffd1ea" : "#ffffff", a);
        });
      },
    },
    roninkimono: {
      draw: (p) => {
        const { R, px } = p;
        const ind = "#3b4775";
        const indS = "#2b345a";
        const indL = "#56649a";
        const indD = "#1f2642";
        const gy = "#9a9ea6";
        const gyS = "#71757e";
        const rope = "#c9a764";
        const ropeS = "#957640";
        const stitch = "#d8dce6";
        // Faded, worn cloth: a few lighter spots scattered over the indigo.
        const worn = (x: number, y: number) => {
          const c = (x * 5 + y * 3) % 11 === 0 ? indL : ind;
          return x === 16 || x === 19 ? p.shade(c, -0.18) : c;
        };
        R(7, 16, 10, 9, worn);
        R(7, 24, 10, 1, indS);
        // Loose sleeves with the grey under-layer showing at the opening.
        R(4, 16, 3, 7, worn);
        R(17, 16, 3, 7, worn);
        R(4, 22, 3, 1, gy);
        R(17, 22, 3, 1, gyS);
        R(4, 23, 1, 1, indS);
        R(19, 23, 1, 1, indD);
        R(5, 23, 2, 1, p.sk);
        R(17, 23, 2, 1, p.sk);
        // A frayed hem over the hips.
        for (let x = 7; x < 17; x++) if (x % 3 !== 1) px(x, 25, x === 16 ? indD : indS);
        // A rope belt, twisted in two tones.
        R(7, 21, 10, 2, (x, y) => ((x + y) % 2 ? rope : ropeS));
        if (p.back) {
          R(9, 16, 6, 1, gy);
          // A mended patch with white stitches, and the rope's knot.
          R(9, 17, 3, 3, indL);
          px(9, 17, stitch);
          px(11, 17, stitch);
          px(9, 19, stitch);
          px(11, 19, stitch);
          R(11, 21, 2, 2, ropeS);
          return;
        }
        const m = mid(p);
        // Crossed collar: skin at the neck, the grey under-layer, then the overlap.
        R(10, 16, 4, 1, p.skS);
        px(11, 17, p.skS);
        px(9, 16, gy);
        px(14, 16, gy);
        px(10, 17, gy);
        px(12, 17, gy);
        px(13, 16, gyS);
        px(12, 18, indD);
        px(13, 19, indD);
        px(13 + m, 20, indD);
        R(13 + m, 23, 1, 2, indD);
        // A mended patch on the chest and a tear on the far sleeve.
        R(8, 18, 2, 2, indL);
        px(8, 18, stitch);
        px(9, 19, stitch);
        px(18, 19, indD);
        px(18, 20, indS);
        // Rope knot at the hip with the ends hanging down.
        R(9, 21, 2, 2, rope);
        px(10, 22, ropeS);
        px(9, 23, rope);
        px(10, 24, ropeS);
        px(9, 25, rope);
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
