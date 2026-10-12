import type { CategoryItems } from "./types";

/**
 * New pet items (see types.ts for how drawing works).
 * Each pet is drawn into a 14×14 grid facing right; outlines are added for us.
 */

type Q = (x: number, y: number, w: number, h: number, c: string) => void;

const EYE = "#2a1b18";
const BLUSH = "#ffb3c8";

/** Same Q, but everything shifted (used for hops, waddles and hovering). */
const shift =
  (Q: Q, dx: number, dy: number): Q =>
  (x, y, w, h, c) =>
    Q(x + dx, y + dy, w, h, c);

/** True for a short moment every `every` ms (blinks, flaps, tongue flicks). */
const now = (t: number, every: number, len: number, offset = 0) => (t + offset) % every < len;

export const PET: CategoryItems = {
  items: [
    { id: "puppy", name: "Puppy", tier: "free" },
    { id: "bunny", name: "Bunny", tier: "free" },
    { id: "turtle", name: "Turtle", tier: "free" },
    { id: "hamster", name: "Hamster", tier: "coins", price: 120 },
    { id: "frog", name: "Frog", tier: "coins", price: 100 },
    { id: "penguin", name: "Penguin", tier: "plus" },
    { id: "fox", name: "Fox", tier: "plus" },
    { id: "owl", name: "Owl", tier: "plus" },
    { id: "phoenix", name: "Phoenix", tier: "pro" },
    { id: "unicorn", name: "Unicorn", tier: "pro" },
  ],
  draw: {
    puppy: {
      animated: true,
      // Tan pup with a floppy ear, red collar and a wagging tail.
      pet: (Q, t) => {
        const tan = "#d9a066";
        const wag = Math.floor(t / 140) % 2;
        if (wag) Q(1, 5, 1, 3, tan);
        else {
          Q(0, 5, 1, 1, tan);
          Q(1, 6, 1, 2, tan);
        }
        Q(2, 7, 7, 4, tan);
        Q(4, 9, 4, 1, "#f4e3c8");
        Q(3, 11, 2, 2, tan);
        Q(7, 11, 2, 2, tan);
        Q(7, 2, 5, 5, tan);
        Q(11, 5, 2, 2, "#f4e3c8");
        Q(13, 5, 1, 1, EYE);
        Q(7, 3, 2, 4, "#8b5a2b");
        Q(10, 4, 1, 1, now(t, 3200, 140) ? "#b07a45" : EYE);
        Q(7, 7, 3, 1, "#e2574c");
        Q(9, 8, 1, 1, "#f2c14e");
        if (Math.floor(t / 900) % 3 === 0) Q(12, 7, 1, 1, "#ff8fa8");
      },
    },
    bunny: {
      animated: true,
      // White bunny with pink ears that does a little hop now and then.
      pet: (Q0, t) => {
        const Q = shift(Q0, 0, now(t, 1800, 300) ? -1 : 0);
        const fur = "#f4f1ea";
        Q(6, 1, 2, 3, fur);
        Q(9, 1, 2, 3, fur);
        Q(7, 2, 1, 2, "#ffb3d1");
        Q(10, 2, 1, 2, "#ffb3d1");
        Q(3, 7, 4, 1, fur);
        Q(2, 8, 7, 4, fur);
        Q(3, 11, 5, 1, "#e6e0ea");
        Q(1, 8, 2, 2, "#ffffff");
        Q(6, 4, 6, 4, fur);
        Q(9, 5, 1, 1, now(t, 3600, 140, 700) ? "#d8cfd8" : EYE);
        Q(11, 6, 1, 1, "#ff8fa8");
        Q(10, 7, 1, 1, BLUSH);
        Q(3, 12, 2, 1, fur);
        Q(7, 12, 2, 1, fur);
      },
    },
    turtle: {
      animated: true,
      // Green-shelled turtle that slowly pokes its head in and out.
      pet: (Q, t) => {
        const skin = "#9bd17a";
        const out = Math.sin(t / 700) > 0 ? 1 : 0;
        Q(1, 8, 1, 1, skin);
        Q(3, 10, 2, 2, skin);
        Q(8, 10, 2, 2, skin);
        Q(4, 3, 5, 1, "#3f8a4a");
        Q(3, 4, 7, 1, "#3f8a4a");
        Q(2, 5, 9, 4, "#3f8a4a");
        Q(5, 4, 3, 1, "#6cbf5c");
        Q(3, 6, 2, 2, "#6cbf5c");
        Q(6, 6, 2, 2, "#6cbf5c");
        Q(9, 6, 1, 2, "#6cbf5c");
        Q(2, 9, 9, 1, "#d9b26a");
        Q(10 + out, 5, 3, 3, skin);
        Q(11 + out, 5, 1, 1, now(t, 4000, 160) ? skin : EYE);
        Q(12 + out, 7, 1, 1, BLUSH);
      },
    },
    hamster: {
      animated: true,
      // Round golden hamster nibbling a sunflower seed.
      pet: (Q, t) => {
        const fur = "#f0a35e";
        const cream = "#fbeee0";
        const nib = Math.floor(t / 220) % 2;
        Q(4, 3, 1, 1, "#e08a45");
        Q(8, 3, 1, 1, "#e08a45");
        Q(4, 4, 6, 1, fur);
        Q(3, 5, 8, 6, fur);
        Q(4, 11, 6, 1, fur);
        Q(4, 5, 3, 2, "#e08a45");
        Q(4, 8, 4, 3, cream);
        Q(9, 7, 3, 2, cream);
        Q(8, 8, 2, 1 + nib, cream);
        Q(11, 7, 1, 1, "#ff8fa8");
        Q(9, 6, 1, 1, now(t, 3000, 140) ? "#c97a3a" : EYE);
        Q(10, 9, 1, 1, "#ffb3c1");
        Q(11, 9 - nib, 1, 2, "#4a4a4a");
        Q(11, 9 - nib, 1, 1, "#d9d2c0");
        Q(4, 12, 2, 1, "#ffb3c1");
        Q(8, 12, 2, 1, "#ffb3c1");
      },
    },
    frog: {
      animated: true,
      // Smiley green frog: hops, blinks and flicks its tongue.
      pet: (Q0, t) => {
        const p = t % 2600;
        const dy = p < 120 ? -1 : p < 320 ? -2 : p < 440 ? -1 : 0;
        const Q = shift(Q0, 0, dy);
        const green = "#5cc35a";
        const dark = "#3f9a45";
        Q(1, 9, 3, 2, dark);
        Q(0, 11, 3, 1, dark);
        Q(2, 6, 9, 5, green);
        Q(4, 5, 7, 1, green);
        Q(4, 3, 3, 3, green);
        Q(8, 3, 3, 3, green);
        if (now(t, 3600, 140, 1200)) {
          Q(4, 4, 3, 1, dark);
          Q(8, 4, 3, 1, dark);
        } else {
          Q(5, 4, 1, 1, EYE);
          Q(9, 4, 1, 1, EYE);
        }
        Q(3, 6, 1, 1, dark);
        Q(5, 7, 1, 1, dark);
        Q(4, 9, 5, 2, "#d6f2a8");
        Q(7, 8, 4, 1, "#2f7a33");
        Q(10, 7, 1, 1, BLUSH);
        Q(9, 11, 2, 1, dark);
        if (p > 1500 && p < 1700) {
          Q(11, 8, 2, 1, "#ff6f91");
          Q(13, 8, 1, 1, "#ff3d6e");
        }
      },
    },
    penguin: {
      animated: true,
      // Waddling penguin in a striped scarf that flutters, flaps a flipper.
      pet: (Q0, t) => {
        const Q = shift(Q0, Math.floor(t / 400) % 2, 0);
        const black = "#2b2f3a";
        const white = "#f4f6ff";
        const flap = now(t, 1600, 260);
        if (flap) {
          Q(1, 6, 2, 1, black);
          Q(2, 7, 1, 1, black);
        } else Q(2, 7, 1, 3, black);
        Q(5, 1, 4, 1, black);
        Q(4, 2, 6, 4, black);
        Q(3, 6, 8, 5, black);
        Q(4, 11, 6, 1, black);
        Q(5, 2, 1, 1, "#4a5266");
        Q(7, 3, 3, 2, white);
        Q(8, 3, 1, 1, now(t, 3400, 140, 400) ? "#c8ccd8" : EYE);
        Q(9, 4, 1, 1, BLUSH);
        Q(10, 4, 2, 1, "#f28c28");
        Q(6, 7, 4, 4, white);
        Q(4, 6, 7, 1, "#e2574c");
        Q(5, 6, 1, 1, "#ffd84d");
        Q(8, 6, 1, 1, "#ffd84d");
        if (Math.floor(t / 220) % 2) {
          Q(2, 6, 2, 1, "#e2574c");
          Q(1, 7, 1, 1, "#ffd84d");
        } else {
          Q(3, 7, 1, 2, "#e2574c");
          Q(3, 9, 1, 1, "#ffd84d");
        }
        Q(5, 12, 2, 1, "#f28c28");
        Q(8, 12, 2, 1, "#f28c28");
      },
    },
    fox: {
      animated: true,
      // Orange fox with a white-tipped fluffy tail that sways, and dark socks.
      pet: (Q, t) => {
        const orange = "#f2823a";
        const shade = "#d9662a";
        const white = "#fff4e6";
        const dark = "#4a2a1f";
        const w = Math.sin(t / 350) > 0 ? 0 : 1;
        Q(0, 3 + w, 2, 2, white);
        Q(0, 5 + w, 3, 2, orange);
        Q(1, 7 + w, 2, 1, shade);
        Q(3, 6, 6, 4, orange);
        Q(4, 6, 3, 1, "#ff9d5c");
        Q(3, 9, 6, 1, shade);
        Q(7, 7, 2, 2, white);
        [4, 7].forEach((x) => Q(x, 10, 1, 2, dark));
        Q(8, 3, 4, 4, orange);
        const tilt = now(t, 5000, 400, 2500);
        Q(8, 2, 1, 1, orange);
        Q(8, 1, 1, 1, dark);
        Q(11, 2, 1, 1, orange);
        Q(tilt ? 12 : 11, 1, 1, 1, dark);
        Q(9, 6, 3, 1, white);
        Q(12, 5, 1, 1, white);
        Q(13, 5, 1, 1, EYE);
        Q(10, 4, 1, 1, now(t, 3000, 140) ? shade : EYE);
      },
    },
    owl: {
      animated: true,
      // Brainy owl in a graduation cap with a swinging gold tassel.
      pet: (Q, t) => {
        const brown = "#9b6b43";
        const dark = "#7a4f2e";
        const disc = "#f1d9b5";
        const flap = now(t, 2200, 280, 900);
        if (flap) {
          Q(1, 4, 2, 3, dark);
          Q(11, 4, 2, 3, dark);
        }
        Q(4, 3, 6, 1, brown);
        Q(3, 4, 8, 7, brown);
        Q(4, 11, 6, 1, brown);
        if (!flap) {
          Q(2, 6, 1, 4, dark);
          Q(11, 6, 1, 4, dark);
        }
        Q(4, 4, 6, 3, disc);
        if (now(t, 3800, 160, 300)) {
          Q(5, 6, 2, 1, EYE);
          Q(8, 6, 2, 1, EYE);
        } else {
          Q(5, 5, 2, 2, "#ffffff");
          Q(8, 5, 2, 2, "#ffffff");
          Q(6, 6, 1, 1, EYE);
          Q(9, 6, 1, 1, EYE);
        }
        Q(7, 7, 1, 1, "#f2a33a");
        Q(5, 8, 4, 3, "#c9a27a");
        Q(6, 9, 1, 1, "#a9805a");
        Q(8, 10, 1, 1, "#a9805a");
        Q(5, 12, 2, 1, "#f2a33a");
        Q(8, 12, 2, 1, "#f2a33a");
        Q(3, 1, 8, 1, "#2b2f3a");
        Q(5, 2, 4, 1, "#2b2f3a");
        const sw = Math.sin(t / 300) > 0 ? 1 : 0;
        Q(11, 1, 1, 1, "#f2c14e");
        Q(11 + sw, 2, 1, 2, "#f2c14e");
      },
    },
    phoenix: {
      animated: true,
      // Hovering fire bird: flickering crest, wing and tail flames, rising embers.
      pet: (Q0, t) => {
        const Q = shift(Q0, 0, Math.sin(t / 300) > 0 ? 0 : 1);
        const flame = (i: number) =>
          ["#ff3d2e", "#ff7a2f", "#ffb13d", "#ffd84d"][(Math.floor(t / 110) + i) % 4];
        Q(1, 6, 3, 1, flame(0));
        Q(0, 7, 4, 1, flame(1));
        Q(0, 8, 3, 1, flame(2));
        Q(0, 9, 2, 1, flame(3));
        Q(1, 10, 1, 1, flame(1));
        Q(4, 5, 6, 4, "#ff5a3d");
        Q(7, 7, 2, 2, "#ffb13d");
        Q(6, 9, 1, 2, "#ffd84d");
        Q(8, 9, 1, 2, "#ffd84d");
        Q(8, 2, 4, 4, "#ff8a3d");
        Q(9, 0, 1, 2, flame(0));
        Q(8, 1, 1, 1, flame(2));
        Q(10, 1, 1, 1, flame(1));
        Q(10, 3, 1, 1, now(t, 3000, 140) ? "#ff5a3d" : EYE);
        Q(11, 4, 1, 1, "#ffd84d");
        Q(12, 4, 2, 1, "#ffcf4d");
        if (Math.floor(t / 180) % 2) {
          Q(5, 1, 2, 1, flame(3));
          Q(4, 2, 3, 1, flame(2));
          Q(4, 3, 3, 2, "#ff3d2e");
        } else {
          Q(4, 6, 4, 2, "#ff3d2e");
          Q(3, 8, 3, 1, flame(2));
        }
        for (let i = 0; i < 2; i++) {
          const ph = (t / 1000 + i / 2) % 1;
          Q0(1 + i * 2, Math.round(11 - ph * 9), 1, 1, ph < 0.5 ? "#ffd84d" : "#ff7a2f");
        }
      },
    },
    unicorn: {
      animated: true,
      // White unicorn: golden horn, rainbow mane and tail that shift colour.
      pet: (Q, t) => {
        const white = "#fbf8ff";
        const rb = (i: number) => `hsl(${Math.round(t / 8 + i * 45) % 360},90%,70%)`;
        const sw = Math.sin(t / 400) > 0 ? 0 : 1;
        Q(1, 6, 1, 2, rb(1));
        Q(0, 7 + sw, 1, 2, rb(3));
        Q(1, 9 + sw, 1, 1, rb(5));
        Q(2, 6, 8, 4, white);
        Q(3, 9, 6, 1, "#e4ddf2");
        [3, 5, 7, 9].forEach((x) => {
          Q(x, 10, 1, 2, white);
          Q(x, 12, 1, 1, "#b9a7e0");
        });
        Q(8, 4, 2, 3, white);
        Q(9, 2, 4, 4, white);
        Q(12, 4, 2, 2, white);
        Q(13, 5, 1, 1, "#ffc4dc");
        Q(9, 1, 1, 1, white);
        Q(11, 3, 1, 1, now(t, 3400, 140) ? "#e4ddf2" : EYE);
        Q(11, 5, 1, 1, BLUSH);
        Q(11, 1, 1, 1, "#f2c14e");
        Q(12, 0, 1, 1, "#fff1a8");
        Q(10, 1, 1, 1, rb(0));
        Q(8, 2, 1, 2, rb(1));
        Q(7, 4, 1, 1, rb(2));
        Q(7, 5, 1, 1, rb(3));
        Q(7, 6, 1, 1, rb(4));
        if (now(t, 1400, 450)) Q(13, 2, 1, 1, "#fff6c8");
      },
    },
  },
};
