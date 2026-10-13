import type { CategoryItems, FxKit, Painter } from "./types";

/** New shoes items (see types.ts for how drawing works). */

const WHITE = "#f4f1ea";
/** Light-up sole colours (hex for the grid, rgb for the screen glow). */
const LIGHTS = ["#ff4f9a", "#ffd84d", "#4fe08a", "#4fc3ff", "#b07bff"];
const LIGHTS_RGB = ["255,79,154", "255,216,77", "79,224,138", "79,195,255", "176,123,255"];
const FLAME = ["#e24b4a", "#ff9b3d", "#ffd84d"];

/** Shoes are drawn at grid x 7 (left foot) and 13 (right foot). */
const isLeft = (x: number) => x < 12;
/** First column of the leg above this shoe (legs are 3 wide). */
const legX = (x: number) => (isLeft(x) ? x + 1 : x);
/** The outer side of the shoe (away from the other foot). */
const outer = (x: number) => (isLeft(x) ? x : x + 3);
/** Is this foot lifted in the walk cycle? */
const lifted = (p: Painter, x: number) => Boolean(isLeft(x) ? p.lUp : p.rUp);
/** Screen x of the middle of each shoe. */
const feetX = (k: FxKit) => [k.X(9), k.X(15)];

export const SHOES: CategoryItems = {
  items: [
    { id: "loafers", name: "Loafers", tier: "free" },
    { id: "sandals", name: "Sandals", tier: "free" },
    { id: "hightops", name: "High-tops", tier: "free" },
    { id: "rainboots", name: "Rain boots", tier: "coins", price: 40 },
    { id: "platform", name: "Platforms", tier: "coins", price: 60 },
    { id: "hoversneakers", name: "Hoverboard Sneakers", tier: "coins", price: 220 },
    { id: "mechaboots", name: "Mecha Boots", tier: "coins", price: 300 },
    { id: "lightup", name: "Light-up sneakers", tier: "plus" },
    { id: "skates", name: "Roller skates", tier: "plus" },
    { id: "ballet", name: "Ballet flats", tier: "plus" },
    { id: "cloud", name: "Cloud shoes", tier: "pro" },
    { id: "flameboots", name: "Flame boots", tier: "pro" },
  ],
  draw: {
    loafers: {
      shoe: (p, x, y) => {
        p.R(x, y, 4, 1, p.sc);
        p.R(x, y + 1, 4, 1, p.shade(p.sc, -0.5));
        // Saddle strap across the top, and a shine on the toe.
        p.R(x + 1, y, 2, 1, p.scD);
        p.px(outer(x), y, p.scL);
      },
    },
    sandals: {
      shoe: (p, x, y) => {
        // Bare foot with toes showing, a strap over it and one round the ankle.
        p.R(x, y, 4, 1, p.sk);
        p.R(x + 1, y, 2, 1, p.sc);
        p.px(outer(x), y, p.skS);
        p.R(x, y + 1, 4, 1, p.scD);
        p.R(legX(x), y - 1, 3, 1, p.sc);
        p.px(legX(x) + 1, y - 1, p.scL);
      },
    },
    hightops: {
      shoe: (p, x, y) => {
        const w = p.sc === WHITE ? "#cfc9bd" : WHITE;
        p.R(x, y - 2, 4, 3, p.sc);
        p.R(isLeft(x) ? x + 3 : x, y - 2, 1, 2, p.scD);
        // Laces, ankle patch, white toe cap and sole.
        p.px(x + 1, y - 2, w);
        p.px(x + 2, y - 1, w);
        p.px(outer(x), y - 1, w);
        p.R(x + 1, y, 2, 1, w);
        p.R(x, y + 1, 4, 1, w);
      },
    },
    rainboots: {
      shoe: (p, x, y) => {
        const c = p.sc;
        p.R(x, y - 3, 4, 4, c);
        p.R(x, y - 3, 4, 1, p.shade(c, -0.18));
        p.R(x + 3, y - 2, 1, 3, p.scD);
        p.R(x, y + 1, 4, 1, p.shade(c, -0.5));
        // Glossy streak down the front and a shiny toe.
        p.R(x + 1, y - 2, 1, 2, p.shade(c, 0.55));
        p.px(x + 1, y - 2, "#ffffff");
        p.px(x + 2, y, p.scL);
      },
    },
    platform: {
      shoe: (p, x, y) => {
        const sole = p.sc === WHITE ? "#2f3a4a" : WHITE;
        p.R(x, y - 1, 4, 2, p.sc);
        p.R(x, y - 1, 4, 1, p.scD);
        p.px(outer(x), y - 1, p.gold);
        p.px(x + 1, y, p.scL);
        // Extra-thick two-tone sole.
        p.R(x, y + 1, 4, 2, sole);
        p.R(x, y + 2, 4, 1, p.shade(sole, sole === WHITE ? -0.15 : 0.15));
      },
    },
    lightup: {
      animated: true,
      shoe: (p, x, y) => {
        p.R(x, y, 4, 1, p.sc);
        p.px(x + 1, y, p.scD);
        p.px(x + 2, y, p.scL);
        // The sole lights chase along in cycling colours.
        const step = Math.floor(p.t / 140) + (isLeft(x) ? 0 : 2);
        for (let i = 0; i < 4; i++) p.px(x + i, y + 1, LIGHTS[(step + i) % LIGHTS.length]);
        p.px(isLeft(x) ? x + 3 : x, y, LIGHTS[(step + 3) % LIGHTS.length]);
      },
      fxBehind: (_c, k) => {
        const step = Math.floor(k.t / 140);
        feetX(k).forEach((x, i) =>
          k.glow(x, k.Y(31), 4 * k.s, LIGHTS_RGB[(step + i * 2) % LIGHTS_RGB.length], 0.45),
        );
      },
    },
    hoversneakers: {
      animated: true,
      shoe: (p, x, y) => {
        const up = lifted(p, x);
        const w = p.sc === WHITE ? "#cfc9bd" : WHITE;
        // The glow breathes, and flares on the foot that is pushing off.
        const pulse = (Math.sin(p.t / 260) + 1) / 2;
        const glow = p.hsl(186, 100, 52 + pulse * 18 + (up ? 12 : 0));
        const glowD = p.hsl(192, 100, 34 + pulse * 10 + (up ? 8 : 0));
        // Chunky upper: laces, inner-side shadow, a heel tab light.
        p.R(x, y - 1, 4, 2, p.sc);
        p.R(isLeft(x) ? x + 3 : x, y - 1, 1, 2, p.scD);
        p.px(x + 1, y - 1, w);
        p.px(x + 2, y - 1, w);
        p.px(x + 1, y, p.scL);
        p.px(outer(x), y - 1, glow);
        // Thick white sole with a light window, then the hover pad underneath.
        p.R(x, y + 1, 4, 1, "#eef3f8");
        p.px(outer(x), y + 1, "#c3cad3");
        p.R(x + 1, y + 1, 2, 1, glow);
        p.R(x, y + 2, 4, 1, glowD);
        p.R(x + 1, y + 2, 2, 1, up || pulse > 0.6 ? "#e8ffff" : glow);
      },
      fxFront: (c, k) => {
        if (k.seated) return;
        const pulse = (Math.sin(k.t / 260) + 1) / 2;
        feetX(k).forEach((x) => {
          k.glow(x, k.Y(32), 5 * k.s, "79,230,255", 0.25 + pulse * 0.2);
          // A thin beam of light under each pad.
          c.globalAlpha = 0.25 + pulse * 0.25;
          c.fillStyle = "#8ff6ff";
          c.fillRect(x - k.s, k.Y(32), 2 * k.s, k.s / 2);
        });
        c.globalAlpha = 1;
      },
    },
    mechaboots: {
      animated: true,
      shoe: (p, x, y) => {
        const steel = "#9aa5b4";
        const steelL = "#dce4ee";
        const steelS = "#677283";
        const dark = "#2f343d";
        const sole = "#1f2228";
        // Column i counted from the outer side of the boot (-1 sticks out).
        const at = (i: number) => (isLeft(x) ? x + i : x + 3 - i);
        // Both boots vent together for a moment every few seconds.
        const vent = p.t % 3600 < 650;
        const led = (Math.sin(p.t / 300) + 1) / 2;
        // Knee rim, a shin band in the shoe colour, then the shin plate.
        p.R(x, y - 3, 4, 1, steel);
        p.px(at(1), y - 3, steelL);
        p.px(at(3), y - 3, steelS);
        p.R(x, y - 2, 4, 1, p.sc);
        p.px(at(1), y - 2, p.scL);
        p.px(at(3), y - 2, p.scD);
        p.R(x, y - 1, 4, 1, steel);
        p.px(at(3), y - 1, steelS);
        // Two vent slits on the outer side; they glow hot when venting.
        p.px(at(0), y - 2, vent ? "#fff1d0" : dark);
        p.px(at(0), y - 1, vent ? "#ffb347" : "#4a2a26");
        // A status light on the shin (a piston from behind).
        p.px(at(2), y - 1, p.back ? steelS : p.hsl(186, 100, 52 + led * 30));
        // Chunky foot armour, one pixel wider on the outside.
        p.R(x, y, 4, 1, steel);
        p.px(at(-1), y, steelS);
        p.px(at(1), y, steelL);
        p.px(at(3), y, steelS);
        // Heavy tread sole.
        p.R(x, y + 1, 4, 1, sole);
        p.px(at(-1), y + 1, sole);
        p.px(at(2), y + 1, dark);
      },
      fxFront: (c, k) => {
        if (k.seated) return;
        const s = k.s;
        const ms = k.t % 3600;
        // A soft glow round each shin light.
        const led = (Math.sin(k.t / 300) + 1) / 2;
        [k.X(9) + s / 2, k.X(14) + s / 2].forEach((x) =>
          k.glow(x, k.Y(28.5), 2.5 * s, "79,230,255", 0.12 + led * 0.18),
        );
        if (ms >= 900) return;
        // A little puff of steam out of the side vents, in chunky pixels.
        const q = ms / 900;
        (
          [
            [k.X(7), -1],
            [k.X(17), 1],
          ] as const
        ).forEach(([vx, dir]) => {
          for (let i = 0; i < 3; i++) {
            const d = Math.min(1, q * 1.4 - i * 0.2);
            if (d <= 0) continue;
            const size = Math.round(1 + d * 1.5) * s;
            const x = vx + dir * Math.round(d * 3 + i) * s - (dir < 0 ? size : 0);
            const y = k.Y(27.5) - Math.round(d * 1.5 + i * 0.5) * s - size / 2;
            c.globalAlpha = Math.max(0, 0.9 * (1 - q) - i * 0.15);
            c.fillStyle = i === 0 ? "#ffffff" : "#e3e9f0";
            c.fillRect(Math.round(x), Math.round(y), size, size);
          }
        });
        c.globalAlpha = 1;
      },
    },
    skates: {
      shoe: (p, x, y) => {
        const w = p.sc === WHITE ? "#cfc9bd" : WHITE;
        p.R(x, y - 2, 4, 3, p.sc);
        p.px(outer(x), y - 2, p.scL);
        p.px(x + 1, y - 2, w);
        p.px(x + 2, y - 1, w);
        p.R(x, y, 4, 1, p.scD);
        // Metal plate with two bright wheels underneath.
        p.R(x, y + 1, 4, 1, "#c3cad3");
        p.px(x + 1, y + 1, "#e9edf2");
        p.px(x, y + 2, "#ff4f9a");
        p.px(x + 3, y + 2, "#ff4f9a");
      },
    },
    ballet: {
      shoe: (p, x, y) => {
        const rib = p.sc === WHITE ? "#ff9ec4" : p.scL;
        p.R(x, y, 4, 1, p.sc);
        p.R(x, y + 1, 4, 1, p.shade(p.sc, -0.18));
        p.px(outer(x), y, "#ffffff");
        // Little bow on the toe, ribbons crossed up the ankle.
        p.R(x + 1, y, 2, 1, rib);
        const l = legX(x);
        p.px(l, y - 3, rib);
        p.px(l + 2, y - 3, rib);
        p.px(l + 1, y - 2, rib);
        p.px(l, y - 1, rib);
        p.px(l + 2, y - 1, rib);
      },
    },
    cloud: {
      animated: true,
      shoe: (p, x, y) => {
        const puff = Math.sin(p.t / 320 + x) > 0;
        const left = isLeft(x);
        const cl = left ? x - 1 : x;
        // A soft little slipper resting on a cloud.
        p.R(x, y, 4, 1, p.sc);
        p.px(x + 1, y, p.scL);
        p.R(cl, y + 1, 5, 1, "#f4f8ff");
        p.R(cl + 1, y + 2, 3, 1, "#d7e3f7");
        p.px(cl + 1, y + 1, "#ffffff");
        p.px(cl + 3, y + 1, "#ffffff");
        // The cloud puffs out on its outer side.
        const ox = left ? cl - 1 : cl + 5;
        p.px(left ? cl : cl + 4, y, "#f4f8ff");
        if (puff) {
          p.px(ox, y + 1, "#e8f0ff");
          p.px(left ? cl - 1 : cl + 5, y, "#ffffff");
        }
        // A wisp left behind when this foot lifts.
        if (lifted(p, x)) p.R(cl + 1, y + 3, 3, 1, "#e8f0ff");
      },
      fxBehind: (c, k) => {
        const s = k.s;
        feetX(k).forEach((x) => k.glow(x, k.Y(31), 5 * s, "220,235,255", 0.5));
        k.particles(6, 2600, (i, ph) => {
          const side = i % 2 ? 1 : -1;
          const base = feetX(k)[i % 2];
          const x = base + side * (2 + ph * 7) * s;
          const y = k.Y(31) - (i % 3) * s - ph * 2 * s;
          c.globalAlpha = (1 - ph) * 0.85;
          c.fillStyle = "#ffffff";
          c.fillRect(x, y, 2 * s, s);
          c.fillRect(x + s / 2, y - s, s, s);
        });
        c.globalAlpha = 1;
      },
    },
    flameboots: {
      animated: true,
      shoe: (p, x, y) => {
        const b = "#2a2430";
        p.R(x, y - 2, 4, 3, b);
        p.R(x, y - 2, 4, 1, p.sc);
        p.px(outer(x), y - 1, "#4a4352");
        p.R(x, y + 1, 4, 1, "#16121b");
        // Flickering flame decal and a glowing ember in the sole.
        const f = Math.floor(p.t / 110 + x) % 3;
        p.px(x + 1, y, FLAME[f]);
        p.px(x + 2, y, FLAME[(f + 1) % 3]);
        p.px(isLeft(x) ? x + 2 : x + 1, y - 1, FLAME[(f + 2) % 3]);
        p.px(x + 1, y + 1, Math.floor(p.t / 200) % 2 ? "#ff6a2a" : "#ff9b3d");
      },
      fxBehind: (c, k) => {
        const s = k.s;
        const pulse = 0.4 + Math.sin(k.t / 200) * 0.12;
        feetX(k).forEach((x) => k.glow(x, k.Y(30), 6 * s, "255,110,40", pulse));
        // Flame tongues licking up both sides of each boot.
        [6, 11, 12, 17].forEach((col, i) => {
          const h = 2 + ((Math.floor(k.t / 90) + i * 2) % 3);
          const bottom = k.Y(31);
          c.fillStyle = "#e24b4a";
          c.fillRect(k.X(col), bottom - h * s, s, h * s);
          c.fillStyle = "#ff9b3d";
          c.fillRect(k.X(col), bottom - (h - 1) * s, s, (h - 1) * s);
          c.fillStyle = "#ffd84d";
          c.fillRect(k.X(col), bottom - s, s, s);
        });
      },
      fxFront: (c, k) => {
        if (k.seated) return;
        const s = k.s;
        // Embers rising off the boots.
        k.particles(8, 1100, (i, ph) => {
          const x = feetX(k)[i % 2] + (((i * 3) % 5) - 2) * s + Math.sin(ph * 6 + i) * s;
          const y = k.Y(31) - ph * 11 * s;
          c.globalAlpha = 1 - ph;
          c.fillStyle = ph < 0.35 ? "#ffd84d" : ph < 0.7 ? "#ff9b3d" : "#e24b4a";
          c.fillRect(x, y, s, s);
        });
        c.globalAlpha = 1;
      },
    },
  },
};
