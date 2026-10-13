import type { ItemTier, Plan } from "./avatar";

/**
 * Show-off items: name frames, chat bubble styles, entrance effects (worn,
 * one of each, saved in your look) and emote packs (owned, unlock extra
 * emotes). Everyone in the room sees them, and the server's look pass checks
 * you really own them (migration 202610130002), so they can't be faked.
 *
 * Server item categories: name_frame, chat_bubble, entrance, emote_pack.
 */

export type ShowoffKind = "frame" | "bubble" | "entrance";
/** "admin": special items only RenTaman admins can use (never sold). */
export type ShowoffTier = ItemTier | "admin";
export type ShowoffItem = { id: string; name: string; tier: ShowoffTier; price?: number };

export const SHOWOFF_CATEGORY: Record<ShowoffKind, string> = {
  frame: "name_frame",
  bubble: "chat_bubble",
  entrance: "entrance",
};

export const FRAMES: ShowoffItem[] = [
  { id: "plain", name: "Plain", tier: "free" },
  { id: "leaf", name: "Leafy", tier: "free" },
  { id: "gold", name: "Gold", tier: "coins", price: 120 },
  { id: "ribbon", name: "Ribbon", tier: "coins", price: 120 },
  { id: "wood", name: "Wood Grain", tier: "coins", price: 150 },
  { id: "batik", name: "Batik", tier: "coins", price: 180 },
  { id: "bobatea", name: "Bubble Tea", tier: "coins", price: 220 },
  { id: "glitch", name: "Glitch", tier: "coins", price: 350 },
  { id: "aurora", name: "Aurora Ribbon", tier: "coins", price: 500 },
  { id: "dragonscale", name: "Dragon Scale", tier: "coins", price: 650 },
  { id: "sakura", name: "Sakura", tier: "plus" },
  { id: "neon", name: "Neon", tier: "plus" },
  { id: "galaxy", name: "Galaxy", tier: "pro" },
  { id: "royal", name: "Royal", tier: "pro" },
  { id: "adm_root", name: "Root Access", tier: "admin" },
  { id: "adm_rgb", name: "Neon Overlord", tier: "admin" },
  { id: "adm_crest", name: "Gold Crest", tier: "admin" },
];

export const BUBBLES: ShowoffItem[] = [
  { id: "plain", name: "Default", tier: "free" },
  { id: "mint", name: "Mint", tier: "free" },
  { id: "pastel", name: "Pastel", tier: "coins", price: 60 },
  { id: "comic", name: "Comic", tier: "coins", price: 80 },
  { id: "sticky", name: "Sticky Note", tier: "coins", price: 150 },
  { id: "manga", name: "Manga Panel", tier: "coins", price: 200 },
  { id: "terminal", name: "Retro Terminal", tier: "coins", price: 250 },
  { id: "starlight", name: "Starlight", tier: "coins", price: 400 },
  { id: "fire", name: "Fire", tier: "coins", price: 500 },
  { id: "heart", name: "Sweetheart", tier: "plus" },
  { id: "cloud", name: "Cloud", tier: "plus" },
  { id: "pixelgold", name: "Pixel gold", tier: "pro" },
  { id: "galaxy", name: "Galaxy", tier: "pro" },
  { id: "adm_root", name: "Root Access", tier: "admin" },
  { id: "adm_rgb", name: "Neon Overlord", tier: "admin" },
  { id: "adm_crest", name: "Gold Crest", tier: "admin" },
];

export const ENTRANCES: ShowoffItem[] = [
  { id: "none", name: "None", tier: "free" },
  { id: "poof", name: "Poof", tier: "free" },
  { id: "sparkle", name: "Sparkle burst", tier: "coins", price: 100 },
  { id: "confetti", name: "Confetti Cannon", tier: "coins", price: 250 },
  { id: "wau", name: "Wau Takeoff", tier: "coins", price: 380 },
  { id: "teleport", name: "Teleport Beam", tier: "coins", price: 450 },
  { id: "dragon", name: "Dragon Arrival", tier: "coins", price: 600 },
  { id: "petals", name: "Petal rain", tier: "plus" },
  { id: "bolt", name: "Lightning drop", tier: "pro" },
  { id: "portal", name: "Portal", tier: "pro" },
  { id: "adm_root", name: "Code rain", tier: "admin" },
  { id: "adm_rgb", name: "RGB shockwave", tier: "admin" },
  { id: "adm_crest", name: "Golden beam", tier: "admin" },
];

export const SHOWOFF: Record<ShowoffKind, ShowoffItem[]> = {
  frame: FRAMES,
  bubble: BUBBLES,
  entrance: ENTRANCES,
};
export const SHOWOFF_DEFAULT: Record<ShowoffKind, string> = {
  frame: "plain",
  bubble: "plain",
  entrance: "none",
};

/** One emote in a pack: plays a base pose with its own floating emoji. */
export type PackEmote = {
  key: string;
  label: string;
  emoji: string;
  /** Base pose (see ACTIONS in chat.ts). */
  pose: "wave" | "laugh" | "dance" | "clap" | "cheer" | "cry" | "love" | "think";
};
export type EmotePack = ShowoffItem & { emotes: PackEmote[] };

export const EMOTE_PACKS: EmotePack[] = [
  {
    id: "study",
    name: "Study vibes",
    tier: "free",
    emotes: [
      { key: "study_focus", label: "Focus mode", emoji: "📚", pose: "think" },
      { key: "study_done", label: "Done!", emoji: "✅", pose: "cheer" },
      { key: "study_tired", label: "So tired", emoji: "😴", pose: "cry" },
      { key: "study_brain", label: "Big brain", emoji: "🧠", pose: "clap" },
    ],
  },
  {
    id: "cat",
    name: "Cat pack",
    tier: "coins",
    price: 80,
    emotes: [
      { key: "cat_meow", label: "Meow", emoji: "🐱", pose: "wave" },
      { key: "cat_purr", label: "Purr", emoji: "😽", pose: "love" },
      { key: "cat_hiss", label: "Hiss", emoji: "😾", pose: "laugh" },
      { key: "cat_zoom", label: "Zoomies", emoji: "🐾", pose: "dance" },
    ],
  },
  {
    id: "raya",
    name: "Festive pack",
    tier: "plus",
    emotes: [
      { key: "raya_salam", label: "Salam", emoji: "🤲", pose: "love" },
      { key: "raya_ketupat", label: "Ketupat", emoji: "🌙", pose: "cheer" },
      { key: "raya_angpau", label: "Angpau", emoji: "🧧", pose: "clap" },
      { key: "raya_lights", label: "Pelita", emoji: "🪔", pose: "wave" },
    ],
  },
  {
    id: "hype",
    name: "Hype pack",
    tier: "pro",
    emotes: [
      { key: "hype_fire", label: "On fire", emoji: "🔥", pose: "cheer" },
      { key: "hype_goat", label: "GOAT", emoji: "🐐", pose: "dance" },
      { key: "hype_mic", label: "Mic drop", emoji: "🎤", pose: "wave" },
      { key: "hype_crown", label: "Crowned", emoji: "👑", pose: "love" },
    ],
  },
];
const PACK_EMOTES = new Map(
  EMOTE_PACKS.flatMap((p) => p.emotes.map((e) => [e.key, { ...e, pack: p.id }])),
);
export const packEmote = (key: string) => PACK_EMOTES.get(key);

const tierOk = (tier: ShowoffTier, plan: Plan) =>
  tier === "free" ||
  (tier !== "admin" &&
    (tier === "pro" ? plan === "pro" : tier !== "coins" && (plan === "plus" || plan === "pro")));

/** Can this person use this show-off item (not just try it on)? */
export function canUseShowoff(
  kind: ShowoffKind | "pack",
  id: string,
  w: { plan: Plan; owned: Set<string>; admin?: boolean },
): boolean {
  if (w.admin) return true;
  const list = kind === "pack" ? EMOTE_PACKS : SHOWOFF[kind];
  const item = list.find((i) => i.id === id);
  if (!item) return false;
  const category = kind === "pack" ? "emote_pack" : SHOWOFF_CATEGORY[kind];
  return tierOk(item.tier, w.plan) || w.owned.has(`${category}:${id}`);
}

/** Emote packs this person can use. */
export const usablePacks = (w: { plan: Plan; owned: Set<string>; admin?: boolean }) =>
  EMOTE_PACKS.filter((p) => canUseShowoff("pack", p.id, w));

// ─── Drawing (screen canvas) ────────────────────────────────────────────────

type Ctx = CanvasRenderingContext2D;
function round(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function px(g: Ctx, c: string, x: number, y: number, w = 2, h = 2) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), w, h);
}

/**
 * Draws a name-tag frame behind the name (centre x, top y, width w, height h)
 * and returns the text colour to use.
 */
export function drawNameFrame(
  g: Ctx,
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  fallback: string,
): string {
  const L = x - w / 2;
  const fill = (c: string, stroke?: string, lw = 1.5) => {
    round(g, L, y, w, h, h / 2);
    g.fillStyle = c;
    g.fill();
    if (stroke) {
      g.lineWidth = lw;
      g.strokeStyle = stroke;
      g.stroke();
    }
  };
  switch (id) {
    case "leaf":
      fill("#2f6b45", "#7fd18e");
      px(g, "#7fd18e", L - 3, y + 3, 4, 3);
      px(g, "#4fa56c", L - 1, y + 6, 3, 3);
      px(g, "#7fd18e", L + w - 1, y + 3, 4, 3);
      px(g, "#4fa56c", L + w - 2, y + 6, 3, 3);
      return "#eafbe9";
    case "gold":
      fill("#3a2a05", "#f2c14e", 2);
      px(g, "#ffe58a", L + 4, y + 1, 4, 1);
      return "#f2c14e";
    case "ribbon": {
      fill("#c0396b", "#ffd1e0");
      g.fillStyle = "#ff8fb5";
      g.beginPath();
      g.moveTo(L - 6, y + h / 2);
      g.lineTo(L + 1, y + 2);
      g.lineTo(L + 1, y + h - 2);
      g.fill();
      g.beginPath();
      g.moveTo(L + w + 6, y + h / 2);
      g.lineTo(L + w - 1, y + 2);
      g.lineTo(L + w - 1, y + h - 2);
      g.fill();
      return "#ffffff";
    }
    case "sakura": {
      fill("#d4537e", "#ffd1e0");
      for (let i = 0; i < 3; i++) {
        const fx = L + 6 + ((i * 37 + t / 40) % Math.max(8, w - 12));
        px(g, "#ffe0ec", fx, y - 3 + (i % 2) * (h + 3), 3, 3);
      }
      return "#ffffff";
    }
    case "neon": {
      const pulse = 0.55 + Math.sin(t / 260) * 0.35;
      fill("#0b0f1a", `rgba(0,229,255,${pulse})`, 2);
      px(g, "#ff3d9a", L + 3, y + h / 2 - 1, 3, 2);
      px(g, "#ff3d9a", L + w - 6, y + h / 2 - 1, 3, 2);
      return "#8ff6ff";
    }
    case "galaxy": {
      fill("#26215c", "#7f77dd", 2);
      for (let i = 0; i < 5; i++)
        if (Math.sin(t / 250 + i * 2) > 0.2)
          px(g, "#fff6c8", L + 6 + (i * (w - 12)) / 4, y + 2 + (i % 2) * (h - 6), 2, 2);
      return "#e6e2ff";
    }
    case "royal": {
      fill("#5a1414", "#f2c14e", 2);
      // Little crown on top.
      const cx = x;
      px(g, "#f2c14e", cx - 5, y - 4, 10, 3);
      px(g, "#f2c14e", cx - 5, y - 7, 2, 3);
      px(g, "#f2c14e", cx - 1, y - 8, 2, 4);
      px(g, "#f2c14e", cx + 3, y - 7, 2, 3);
      if (Math.sin(t / 220) > 0.4) px(g, "#ffffff", cx - 1, y - 8, 2, 2);
      return "#ffe58a";
    }
    // ─── Coin frames ───
    case "wood": {
      // A carved plank: warm gradient, wavy grain, a knot and two nails.
      round(g, L, y, w, h, 4);
      const wg = g.createLinearGradient(0, y, 0, y + h);
      wg.addColorStop(0, "#9a6434");
      wg.addColorStop(1, "#6b4020");
      g.fillStyle = wg;
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = "#3a210c";
      g.stroke();
      g.save();
      round(g, L, y, w, h, 4);
      g.clip();
      g.strokeStyle = "rgba(48,26,8,.6)";
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const gy = y + 3.5 + (i * (h - 7)) / 2;
        g.moveTo(L, gy);
        for (let gx = L + 4; gx <= L + w + 4; gx += 4)
          g.lineTo(gx, gy + Math.sin((gx - L) * 0.11 + i * 2.3) * 1.3);
      }
      const kx = L + w * 0.7;
      const ky = y + h * 0.55;
      g.moveTo(kx + 3, ky);
      g.ellipse(kx, ky, 3, 1.4, 0, 0, Math.PI * 2);
      g.stroke();
      g.restore();
      px(g, "rgba(255,225,175,.35)", L + 3, y + 1.5, w - 6, 1);
      const nail = (nx: number) => {
        px(g, "#2a1708", nx, y + h / 2 - 1, 3, 3);
        px(g, "#e8e1d2", nx, y + h / 2 - 1, 2, 2);
      };
      nail(L + 3);
      nail(L + w - 6);
      return "#fff1d6";
    }
    case "batik": {
      // Indigo cloth, gold edge with pucuk rebung (bamboo-shoot) teeth, canting
      // dots and a little bunga (flower) at each end.
      const gold = "#d9a93a";
      const my = Math.round(y + h / 2);
      g.fillStyle = gold;
      g.beginPath();
      for (let tx = L + h / 2 - 1; tx + 4 <= L + w - h / 2 + 1; tx += 6) {
        g.moveTo(tx, y + 0.5);
        g.lineTo(tx + 2, y - 3);
        g.lineTo(tx + 4, y + 0.5);
        g.moveTo(tx, y + h - 0.5);
        g.lineTo(tx + 2, y + h + 3);
        g.lineTo(tx + 4, y + h - 0.5);
      }
      g.fill();
      round(g, L, y, w, h, h / 2);
      g.fill();
      round(g, L + 1.5, y + 1.5, w - 3, h - 3, h / 2 - 1.5);
      g.fillStyle = "#1c2565";
      g.fill();
      g.fillStyle = "rgba(233,189,82,.55)";
      for (let dx = L + h / 2; dx < L + w - h / 2; dx += 4) {
        g.fillRect(Math.round(dx), Math.round(y + 3), 1, 1);
        g.fillRect(Math.round(dx + 2), Math.round(y + h - 4), 1, 1);
      }
      const flower = (fx: number) => {
        const c = Math.round(fx);
        px(g, "#e9bd52", c, my - 3, 1, 2);
        px(g, "#e9bd52", c, my + 2, 1, 2);
        px(g, "#e9bd52", c - 2, my, 1, 1);
        px(g, "#e9bd52", c + 2, my, 1, 1);
        px(g, "#fff3c8", c, my, 1, 1);
      };
      flower(L + 5);
      flower(L + w - 6);
      return "#ffe7a3";
    }
    case "bobatea": {
      // Milk tea with a pink straw, pearls at the bottom, and pearls that
      // float up out of the cup and pop.
      g.fillStyle = "#ff7fa8";
      g.beginPath();
      g.moveTo(L + w - 13, y + 3);
      g.lineTo(L + w - 7, y - 7);
      g.lineTo(L + w - 4, y - 5.5);
      g.lineTo(L + w - 9, y + 3);
      g.fill();
      // Pearls sitting along the bottom, half hidden behind the cup.
      g.fillStyle = "#3a2214";
      g.beginPath();
      for (let bx = L + h / 2 - 1; bx < L + w - h / 2 + 2; bx += 5) {
        g.moveTo(bx + 2, y + h - 0.5);
        g.arc(bx, y + h - 0.5, 2, 0, Math.PI * 2);
      }
      g.fill();
      round(g, L, y, w, h, h / 2);
      const tg = g.createLinearGradient(0, y, 0, y + h);
      tg.addColorStop(0, "#f7e7cf");
      tg.addColorStop(0.45, "#e8c9a0");
      tg.addColorStop(1, "#d3a777");
      g.fillStyle = tg;
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = "#7a4a26";
      g.stroke();
      const pearl = (bx: number, by: number, r: number) => {
        g.beginPath();
        g.arc(bx, by, r, 0, Math.PI * 2);
        g.fillStyle = "#3a2214";
        g.fill();
        g.lineWidth = 0.75;
        g.strokeStyle = "rgba(247,231,207,.8)";
        g.stroke();
        px(g, "rgba(255,255,255,.6)", bx - r * 0.6, by - r * 0.6, 1, 1);
      };
      for (let i = 0; i < 3; i++) {
        const ph = (t / 1600 + i / 3) % 1;
        const bx = L + w * (0.25 + i * 0.25) + Math.sin(t / 300 + i * 2) * 2;
        if (ph < 0.78) {
          g.globalAlpha = Math.min(1, ph * 6);
          pearl(bx, y + 1 - (ph / 0.78) * 9, 1.8);
        } else {
          const q = (ph - 0.78) / 0.22;
          g.globalAlpha = 1 - q;
          g.lineWidth = 1;
          g.strokeStyle = "#f7e7cf";
          g.beginPath();
          g.arc(bx, y - 8, 1.5 + q * 3, 0, Math.PI * 2);
          g.stroke();
        }
        g.globalAlpha = 1;
      }
      return "#4a2a14";
    }
    case "glitch": {
      // Calm dark tag that, every ~1.5s, splits into red/cyan copies with
      // sideways-shifted slices for a moment.
      const cyc = t % 1500;
      const on = cyc < 170 || (cyc > 250 && cyc < 290);
      const j = Math.floor(t / 45);
      if (on) {
        const o = 2 + (j % 2);
        round(g, L - o, y + 1, w, h, h / 2);
        g.fillStyle = "rgba(255,40,90,.75)";
        g.fill();
        round(g, L + o, y - 1, w, h, h / 2);
        g.fillStyle = "rgba(0,229,255,.75)";
        g.fill();
      }
      fill("#0c0e16", on ? "#ffffff" : "rgba(170,190,255,.8)", 1.5);
      for (let sy = y + 2; sy < y + h - 1; sy += 3)
        px(g, "rgba(255,255,255,.05)", L + 3, sy, w - 6, 1);
      // Corner brackets: cyan on the left, pink on the right.
      px(g, "#7df9ff", L + 5, y + 3, 1, h - 6);
      px(g, "#7df9ff", L + 5, y + 3, 2, 1);
      px(g, "#7df9ff", L + 5, y + h - 4, 2, 1);
      px(g, "#ff4d8d", L + w - 6, y + 3, 1, h - 6);
      px(g, "#ff4d8d", L + w - 7, y + 3, 2, 1);
      px(g, "#ff4d8d", L + w - 7, y + h - 4, 2, 1);
      if (on) {
        for (let i = 0; i < 3; i++) {
          const sy = y + 1 + ((j * 5 + i * 6) % (h - 3));
          const off = (((j * 7 + i * 5) % 9) - 4) * 1.5;
          const sw = w * (0.3 + ((i + j) % 3) * 0.2);
          const sx = L + ((i * 31 + j * 17) % Math.max(1, Math.round(w - sw))) + off;
          px(g, "#0c0e16", sx, sy, sw, 2);
          px(g, "#ff2a5a", sx - 2, sy, 2, 2);
          px(g, "#00e5ff", sx + sw, sy, 2, 2);
        }
      }
      return on && j % 2 ? "#7df9ff" : "#f2f6ff";
    }
    case "aurora": {
      // Night-sky tag; northern-lights colours flow along the glowing border
      // and out into two wavy ribbon tails.
      const flow = t / 900;
      const hueAt = (q: number) => 205 + 85 * Math.sin(flow - q * 4.5);
      const grad = g.createLinearGradient(L - 10, y, L + w + 10, y);
      for (let i = 0; i <= 4; i++) grad.addColorStop(i / 4, `hsl(${hueAt(i / 4)},90%,62%)`);
      const mid = hueAt(0.5);
      round(g, L, y, w, h, h / 2);
      g.fillStyle = "#081127";
      g.fill();
      const curtain = g.createLinearGradient(0, y, 0, y + h);
      curtain.addColorStop(0, `hsla(${mid},85%,55%,.32)`);
      curtain.addColorStop(0.7, `hsla(${mid},85%,55%,0)`);
      g.fillStyle = curtain;
      g.fill();
      g.save();
      g.shadowColor = `hsl(${mid},90%,60%)`;
      g.shadowBlur = 7;
      g.lineWidth = 2;
      g.strokeStyle = grad;
      g.stroke();
      g.lineCap = "round";
      for (const dir of [-1, 1]) {
        const sx = dir < 0 ? L + 1 : L + w - 1;
        g.beginPath();
        g.moveTo(sx, y + h / 2);
        for (let i = 1; i <= 4; i++)
          g.lineTo(
            sx + dir * i * 2.2,
            y + h / 2 + Math.sin(t / 220 + i * 1.3 + dir) * 2.2 + i * 0.6,
          );
        g.stroke();
      }
      g.restore();
      return "#eafff7";
    }
    case "dragonscale": {
      // Two bone horns, emerald scales, a gold rim and a shine that sweeps by.
      const mx = (xx: number, dir: number) => (dir < 0 ? xx : L + w - (xx - L));
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.moveTo(mx(L + 4, dir), y + 3);
        g.quadraticCurveTo(mx(L - 4, dir), y - 1, mx(L + 1, dir), y - 9);
        g.quadraticCurveTo(mx(L + 3, dir), y - 2, mx(L + 10, dir), y + 3);
        g.closePath();
        g.fillStyle = "#efe2bd";
        g.fill();
        g.lineWidth = 1;
        g.strokeStyle = "#5c4a22";
        g.stroke();
      }
      fill("#0f3a28", "#d4a73a", 2);
      g.save();
      round(g, L, y, w, h, h / 2);
      g.clip();
      g.strokeStyle = "rgba(120,215,150,.32)";
      g.lineWidth = 1;
      g.beginPath();
      for (let row = 0, sy = y + 1; sy < y + h + 3; row++, sy += 4)
        for (let sx = L + (row % 2 ? 3 : 0); sx < L + w + 3; sx += 6) {
          g.moveTo(sx + 3, sy);
          g.arc(sx, sy, 3, 0, Math.PI);
        }
      g.stroke();
      const sweep = (t / 5) % (w * 2.5);
      if (sweep < w + 12) {
        g.fillStyle = "rgba(210,255,225,.45)";
        g.beginPath();
        g.moveTo(L + sweep, y);
        g.lineTo(L + sweep + 6, y);
        g.lineTo(L + sweep - 2, y + h);
        g.lineTo(L + sweep - 8, y + h);
        g.closePath();
        g.fill();
        g.fillStyle = "rgba(255,255,255,.35)";
        g.fillRect(L + sweep + 8, y, 2, h);
      }
      g.restore();
      // Ruby studs at each end.
      for (const gx of [L + 4, L + w - 7]) {
        px(g, "#7a1410", gx, y + h / 2 - 1.5, 3, 3);
        px(g, "#ff4a3d", gx, y + h / 2 - 1.5, 2, 2);
      }
      return "#f0ffe8";
    }
    // ─── Admin sets (preview) ───
    case "adm_root": {
      // Terminal: black, green border, ">_" on the left, blinking cursor on the
      // right. Drawn a little wider than the name so the signs don't touch it.
      const RL = L - 9;
      const RW = w + 18;
      round(g, RL, y, RW, h, 4);
      g.fillStyle = "#05090a";
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = "#2bd96b";
      g.stroke();
      for (let sy = y + 2; sy < y + h - 1; sy += 3)
        px(g, "rgba(43,217,107,.1)", RL + 1, sy, RW - 2, 1);
      px(g, "#2bd96b", RL + 5, y + h / 2 - 4, 2, 2);
      px(g, "#2bd96b", RL + 7, y + h / 2 - 2, 2, 2);
      px(g, "#2bd96b", RL + 5, y + h / 2, 2, 2);
      px(g, "#2bd96b", RL + 10, y + h / 2 + 2, 5, 1);
      if (Math.floor(t / 500) % 2 === 0) px(g, "#2bd96b", RL + RW - 9, y + 4, 3, h - 8);
      return "#7dff9b";
    }
    case "adm_rgb": {
      // Neon overlord: dark glass, a glowing border that cycles through the rainbow.
      const hue = (t / 12) % 360;
      const grad = g.createLinearGradient(L, y, L + w, y + h);
      grad.addColorStop(0, `hsl(${hue},95%,60%)`);
      grad.addColorStop(0.5, `hsl(${(hue + 120) % 360},95%,60%)`);
      grad.addColorStop(1, `hsl(${(hue + 240) % 360},95%,60%)`);
      g.save();
      g.shadowColor = `hsl(${hue},95%,60%)`;
      g.shadowBlur = 8;
      round(g, L, y, w, h, h / 2);
      g.fillStyle = "rgba(10,10,24,.88)";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = grad;
      g.stroke();
      g.restore();
      // Little diamonds at each end.
      const dm = (cx: number, c: string) => {
        g.fillStyle = c;
        g.beginPath();
        g.moveTo(cx, y + h / 2 - 4);
        g.lineTo(cx + 3, y + h / 2);
        g.lineTo(cx, y + h / 2 + 4);
        g.lineTo(cx - 3, y + h / 2);
        g.closePath();
        g.fill();
      };
      dm(L - 1, `hsl(${hue},95%,65%)`);
      dm(L + w + 1, `hsl(${(hue + 240) % 360},95%,65%)`);
      return "#ffffff";
    }
    case "adm_crest": {
      // Gold crest: ivory with a double gold border, a shield badge and a shine.
      fill("#fffaf0", "#c9971f", 2);
      round(g, L + 2.5, y + 2.5, w - 5, h - 5, h / 2 - 2.5);
      g.lineWidth = 1;
      g.strokeStyle = "rgba(201,151,31,.55)";
      g.stroke();
      // Shine sweeping across now and then.
      const sweep = (t / 6) % (w * 3);
      if (sweep < w) {
        g.save();
        round(g, L, y, w, h, h / 2);
        g.clip();
        g.fillStyle = "rgba(255,255,255,.75)";
        g.beginPath();
        g.moveTo(L + sweep, y);
        g.lineTo(L + sweep + 5, y);
        g.lineTo(L + sweep - 3, y + h);
        g.lineTo(L + sweep - 8, y + h);
        g.closePath();
        g.fill();
        g.restore();
      }
      // Shield badge on the left, sticking out a little.
      const sx = L - 4;
      const sy = y + h / 2 - 7;
      px(g, "#7a5a0c", sx, sy, 11, 9);
      px(g, "#7a5a0c", sx + 1, sy + 9, 9, 2);
      px(g, "#7a5a0c", sx + 3, sy + 11, 5, 2);
      px(g, "#f2c14e", sx + 1, sy + 1, 9, 8);
      px(g, "#f2c14e", sx + 2, sy + 9, 7, 1);
      px(g, "#f2c14e", sx + 4, sy + 10, 3, 2);
      px(g, "#ffffff", sx + 4, sy + 3, 3, 4);
      px(g, "#fff6c8", sx + 2, sy + 2, 2, 1);
      return "#6b4a00";
    }
    default:
      fill(fallback);
      return "#ffffff";
  }
}

/**
 * Draws a speech bubble (centre x, top y, width w, height h) with its tail and
 * returns the text colour.
 */
export function drawBubble(
  g: Ctx,
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
): string {
  const L = x - w / 2;
  const tail = (c: string) => {
    g.beginPath();
    g.moveTo(x - 4, y + h);
    g.lineTo(x + 4, y + h);
    g.lineTo(x, y + h + 5);
    g.closePath();
    g.fillStyle = c;
    g.fill();
  };
  const body = (c: string, stroke: string, r = 8, lw = 1) => {
    round(g, L, y, w, h, r);
    g.fillStyle = c;
    g.fill();
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
    tail(c);
  };
  switch (id) {
    case "mint":
      body("#dff7ec", "#3fae8f");
      return "#0f4f3c";
    case "pastel":
      body("#e6e2ff", "#9b93ec", h / 2);
      return "#3c3489";
    case "comic":
      body("#fff3c4", "#2a1b18", 3, 2);
      return "#2a1b18";
    case "heart": {
      body("#ffe0ec", "#ff6fa3", h / 2);
      g.fillStyle = "#ff6fa3";
      g.font = "10px system-ui,sans-serif";
      g.fillText("♥", L + w - 4, y + 2 + Math.sin(t / 300) * 2);
      return "#8a1f47";
    }
    case "cloud": {
      body("#ffffff", "#b5d4f4", h / 2);
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(L + 8 + i * 9, y + 1, 5, Math.PI, 0);
        g.fillStyle = "#ffffff";
        g.fill();
      }
      return "#0c447c";
    }
    case "pixelgold":
      g.fillStyle = "#412402";
      g.fillRect(L - 2, y - 2, w + 4, h + 4);
      g.fillStyle = "#ef9f27";
      g.fillRect(L, y, w, h);
      g.fillStyle = "#fac775";
      g.fillRect(L, y, w, 3);
      tail("#ef9f27");
      return "#412402";
    case "galaxy": {
      body("#1d1846", "#7f77dd", 8, 1.5);
      for (let i = 0; i < 4; i++)
        if (Math.sin(t / 230 + i * 1.7) > 0.3)
          px(g, "#fff6c8", L + 5 + (i * (w - 10)) / 3, y + 2 + (i % 2) * (h - 5), 2, 2);
      return "#e6e2ff";
    }
    // ─── Coin bubbles ───
    case "sticky": {
      // A slightly tilted yellow sticky note held on by a strip of tape.
      g.save();
      g.translate(x, y + h / 2);
      g.rotate(-0.04);
      g.translate(-x, -(y + h / 2));
      g.fillStyle = "rgba(0,0,0,.22)";
      g.fillRect(L + 1.5, y + 2, w, h);
      g.fillStyle = "#ffe766";
      g.fillRect(L, y, w, h);
      g.fillStyle = "#f3d44a";
      g.fillRect(L, y, w, 2);
      g.beginPath();
      g.moveTo(L + w, y + h - 5);
      g.lineTo(L + w - 5, y + h);
      g.lineTo(L + w - 5, y + h - 5);
      g.closePath();
      g.fillStyle = "#e0bd32";
      g.fill();
      g.beginPath();
      g.moveTo(x - 4, y + h - 0.5);
      g.lineTo(x + 3, y + h - 0.5);
      g.lineTo(x - 2, y + h + 5);
      g.closePath();
      g.fillStyle = "#ffe766";
      g.fill();
      g.restore();
      g.save();
      g.translate(x, y);
      g.rotate(0.08);
      g.fillStyle = "rgba(225,238,245,.78)";
      g.fillRect(-10, -3.5, 20, 6);
      g.fillStyle = "rgba(255,255,255,.55)";
      g.fillRect(-10, -3.5, 20, 1);
      g.restore();
      return "#4a3a00";
    }
    case "manga": {
      // Square comic panel, thick black border, speed lines bursting out.
      const step = Math.floor(t / 110);
      const n = 20;
      const cy = y + h / 2;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ((i * 7 + step) % 3) * 0.05;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        if (sa > 0.8) continue; // leave room for the tail
        const len = 3 + ((i * 5 + step * 3) % 4) * 1.5;
        const r0x = w / 2 + 3;
        const r0y = h / 2 + 3;
        g.moveTo(x + ca * r0x, cy + sa * r0y);
        g.lineTo(x + ca * (r0x + len), cy + sa * (r0y + len));
      }
      g.lineCap = "round";
      g.lineWidth = 2.5;
      g.strokeStyle = "rgba(255,255,255,.85)";
      g.stroke();
      g.lineWidth = 1;
      g.strokeStyle = "#111111";
      g.stroke();
      g.lineCap = "butt";
      g.fillStyle = "#ffffff";
      g.fillRect(L, y, w, h);
      g.lineWidth = 2;
      g.strokeStyle = "#111111";
      g.strokeRect(L, y, w, h);
      // Screentone dots in the corner.
      for (let i = 0; i < 3; i++)
        for (let j2 = 0; j2 <= i; j2++)
          px(g, "#b9b9b9", L + w - 4 - j2 * 2, y + h - 4 - (i - j2) * 2, 1, 1);
      g.beginPath();
      g.moveTo(x - 5, y + h - 1);
      g.lineTo(x + 2, y + h + 7);
      g.lineTo(x + 3, y + h - 1);
      g.closePath();
      g.fillStyle = "#ffffff";
      g.fill();
      g.beginPath();
      g.moveTo(x - 5, y + h + 1);
      g.lineTo(x + 2, y + h + 7);
      g.lineTo(x + 3, y + h + 1);
      g.lineWidth = 2;
      g.stroke();
      return "#111111";
    }
    case "terminal": {
      // Amber CRT: bezel, dark screen, scanlines, a rolling glow and a cursor.
      round(g, L - 1, y - 1, w + 2, h + 2, 4);
      g.fillStyle = "#3a2e22";
      g.fill();
      round(g, L + 1, y + 1, w - 2, h - 2, 3);
      g.fillStyle = "#140d04";
      g.fill();
      for (let sy = y + 2; sy < y + h - 1; sy += 2)
        px(g, "rgba(255,176,0,.07)", L + 1, sy, w - 2, 1);
      const band = y + 1 + ((t / 45) % (h - 4));
      px(g, "rgba(255,190,60,.1)", L + 1, band, w - 2, 2);
      // ">" prompt and blinking block cursor in the side padding.
      const my = Math.round(y + h / 2);
      px(g, "#ffb000", L + 2, my - 2, 1, 1);
      px(g, "#ffb000", L + 3, my - 1, 1, 1);
      px(g, "#ffb000", L + 2, my, 1, 1);
      if (Math.floor(t / 530) % 2 === 0) px(g, "#ffb000", L + w - 5, y + 4, 2, h - 8);
      tail("#3a2e22");
      return "#ffb000";
    }
    case "starlight": {
      // Deep blue night bubble with a soft glow and stars drifting inside.
      round(g, L, y, w, h, 8);
      const sg = g.createLinearGradient(0, y, 0, y + h);
      sg.addColorStop(0, "#0a1440");
      sg.addColorStop(1, "#1b2c78");
      g.save();
      g.shadowColor = "rgba(120,150,255,.85)";
      g.shadowBlur = 7;
      g.fillStyle = sg;
      g.fill();
      g.restore();
      g.lineWidth = 1.2;
      g.strokeStyle = "#8aa2ff";
      g.stroke();
      tail("#1b2c78");
      const span = Math.max(4, w - 8);
      for (let i = 0; i < 9; i++) {
        const off = (i * 23 + t / (70 + i * 9)) % span;
        const sx = L + 4 + off;
        // Rows: along the top, along the bottom, and dimmer ones in the middle.
        const band = i % 3;
        const sy =
          (band === 0 ? y + 2.5 : band === 1 ? y + h - 3.5 : y + h / 2) +
          Math.sin(t / 600 + i) * 0.8;
        const tw = Math.sin(t / 260 + i * 2.1);
        if (tw < -0.3) continue;
        const edge = Math.min(1, off / 6, (span - off) / 6);
        g.globalAlpha = Math.max(0, Math.min(1, 0.45 + tw * 0.55) * edge * (band === 2 ? 0.5 : 1));
        const c = i % 4 === 0 ? "#fff3b0" : "#ffffff";
        px(g, c, sx, sy, 1, 1);
        if (tw > 0.75 && band === 0) {
          px(g, c, sx - 1, sy, 3, 1);
          px(g, c, sx, sy - 1, 1, 3);
        }
      }
      g.globalAlpha = 1;
      const arm = 1 + Math.round((0.5 + 0.5 * Math.sin(t / 380)) * 2);
      const bx = Math.round(L + w - 5);
      const by = Math.round(y);
      px(g, "#fff6c8", bx - arm, by, arm * 2 + 1, 1);
      px(g, "#fff6c8", bx, by - arm, 1, arm * 2 + 1);
      return "#eef1ff";
    }
    case "fire": {
      // Ember bubble with flames flickering along the top and sparks rising.
      const flames = (grow: number, color: string) => {
        g.fillStyle = color;
        g.beginPath();
        for (let fx = L + 4, i = 0; fx < L + w - 3; fx += 5, i++) {
          const f = 0.55 + 0.45 * Math.sin(t / 85 + i * 1.9) * Math.sin(t / 140 + i * 0.7);
          const fh = (3 + f * 5) * grow;
          const sway = Math.sin(t / 120 + i) * 1.2;
          g.moveTo(fx - 3.2 * grow, y + 3);
          g.quadraticCurveTo(fx - 2 * grow, y - fh * 0.4, fx + sway, y - fh);
          g.quadraticCurveTo(fx + 2 * grow, y - fh * 0.4, fx + 3.2 * grow, y + 3);
        }
        g.fill();
      };
      g.save();
      g.shadowColor = "rgba(255,110,20,.9)";
      g.shadowBlur = 8;
      flames(1, "#ff5a14");
      g.restore();
      flames(0.6, "#ffd23f");
      round(g, L, y, w, h, 8);
      const fg = g.createLinearGradient(0, y, 0, y + h);
      fg.addColorStop(0, "#3b0a04");
      fg.addColorStop(1, "#7a1c06");
      g.fillStyle = fg;
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = "#ff7a1a";
      g.stroke();
      tail("#7a1c06");
      for (let i = 0; i < 4; i++) {
        const ph = (t / 900 + i / 4) % 1;
        g.globalAlpha = 1 - ph;
        px(
          g,
          i % 2 ? "#ffb347" : "#ffe08a",
          L + w * (0.15 + 0.23 * i) + Math.sin(t / 200 + i * 3) * 2,
          y - 3 - ph * 12,
          1,
          1,
        );
      }
      g.globalAlpha = 1;
      return "#ffe2b0";
    }
    // ─── Admin sets (preview) ───
    case "adm_root": {
      // A terminal window: title bar with three dots, green text.
      g.fillStyle = "#05090a";
      g.fillRect(L, y - 5, w, h + 5);
      g.fillStyle = "#1a2124";
      g.fillRect(L, y - 5, w, 5);
      px(g, "#ff5f57", L + 3, y - 4, 2, 2);
      px(g, "#febc2e", L + 7, y - 4, 2, 2);
      px(g, "#28c840", L + 11, y - 4, 2, 2);
      g.strokeStyle = "#2bd96b";
      g.lineWidth = 1;
      g.strokeRect(L + 0.5, y - 4.5, w - 1, h + 4);
      tail("#05090a");
      return "#7dff9b";
    }
    case "adm_rgb": {
      const hue = (t / 12) % 360;
      const grad = g.createLinearGradient(L, y, L + w, y + h);
      grad.addColorStop(0, `hsl(${hue},95%,60%)`);
      grad.addColorStop(0.5, `hsl(${(hue + 120) % 360},95%,60%)`);
      grad.addColorStop(1, `hsl(${(hue + 240) % 360},95%,60%)`);
      g.save();
      g.shadowColor = `hsl(${(hue + 120) % 360},95%,60%)`;
      g.shadowBlur = 8;
      round(g, L, y, w, h, 8);
      g.fillStyle = "rgba(10,10,24,.9)";
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = grad;
      g.stroke();
      g.restore();
      tail("rgba(10,10,24,.9)");
      return "#ffffff";
    }
    case "adm_crest": {
      body("#fffaf0", "#c9971f", 8, 1.5);
      round(g, L + 2, y + 2, w - 4, h - 4, 6);
      g.lineWidth = 0.75;
      g.strokeStyle = "rgba(201,151,31,.5)";
      g.stroke();
      // Small shield in the top-right corner.
      const sx = L + w - 6;
      const sy = y - 4;
      px(g, "#7a5a0c", sx, sy, 7, 6);
      px(g, "#7a5a0c", sx + 1, sy + 6, 5, 1);
      px(g, "#7a5a0c", sx + 2, sy + 7, 3, 1);
      px(g, "#f2c14e", sx + 1, sy + 1, 5, 5);
      px(g, "#f2c14e", sx + 2, sy + 6, 3, 1);
      if (Math.sin(t / 300) > 0.6) px(g, "#ffffff", sx + 2, sy + 2, 1, 1);
      return "#5a3e00";
    }
    default:
      body("#ffffff", "rgba(42,27,24,.5)");
      return "#2a1b18";
  }
}

/** How long an entrance effect plays. */
export const ENTRANCE_MS = 2200;

// ─── Coin entrances ─────────────────────────────────────────────────────────

/** Small pixel art, grouped by colour so each colour is one fill. */
type PixelArt = { w: number; layers: [string, number[]][] };
function pixelArt(rows: string[], pal: Record<string, string>): PixelArt {
  const by = new Map<string, number[]>();
  rows.forEach((row, yy) =>
    [...row].forEach((ch, xx) => {
      const c = pal[ch];
      if (!c) return;
      let a = by.get(c);
      if (!a) by.set(c, (a = []));
      a.push(xx, yy);
    }),
  );
  return { w: rows[0].length, layers: [...by.entries()] };
}
function drawArt(g: Ctx, art: PixelArt, x: number, y: number, s: number, flip = false) {
  for (const [c, pts] of art.layers) {
    g.fillStyle = c;
    g.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      const ax = flip ? art.w - 1 - pts[i] : pts[i];
      g.rect(x + ax * s, y + pts[i + 1] * s, s + 0.4, s + 0.4);
    }
    g.fill();
  }
}

const CONFETTI = ["#ff4d6d", "#ffd23f", "#3ddc97", "#4cc9f0", "#b388ff", "#ff9f1c"];

/** Two party poppers fire confetti up and over you; it flutters down. */
function drawConfetti(g: Ctx, cx: number, fy: number, s: number, p: number, k: number) {
  const fade = k > 0.75 ? (1 - k) / 0.25 : 1;
  for (const side of [-1, 1]) {
    const ox = cx + side * 20 * s;
    const oy = fy - 2 * s;
    const tilt = -side * 0.5;
    const mx = ox + Math.sin(tilt) * 8 * s;
    const my = oy - Math.cos(tilt) * 8 * s;
    if (p < 800) {
      g.globalAlpha = Math.min(1, (800 - p) / 300);
      g.save();
      g.translate(ox, oy);
      g.rotate(tilt);
      g.fillStyle = "#ffd23f";
      g.beginPath();
      g.moveTo(0, s);
      g.lineTo(-3 * s, -8 * s);
      g.lineTo(3 * s, -8 * s);
      g.closePath();
      g.fill();
      g.fillStyle = "#ff4d6d";
      g.fillRect(-2.2 * s, -5.5 * s, 4.4 * s, 1.4 * s);
      g.fillRect(-1.2 * s, -2.5 * s, 2.4 * s, 1.2 * s);
      g.restore();
    }
    if (p < 260) {
      g.globalAlpha = 1 - p / 260;
      g.fillStyle = "#fff6c8";
      g.beginPath();
      g.arc(mx, my, (2 + p / 35) * s, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = fade;
    for (let i = 0; i < 30; i++) {
      const seed = (i * 73 + (side > 0 ? 29 : 0)) % 97;
      const tt = p / 1000 - (i % 4) * 0.03;
      if (tt < 0) continue;
      const v = 85 + (seed % 55);
      const th = 0.05 + ((seed % 23) / 23) * 0.85;
      const vx = -side * Math.sin(th) * v * 0.55;
      const vy = -Math.cos(th) * v;
      // Linear drag: shoots up fast, then drifts down slowly.
      const e = 1 - Math.exp(-2.2 * tt);
      const X = mx + ((vx * e) / 2.2 + Math.sin(tt * 7 + seed) * 2 * Math.min(1, tt)) * s;
      const Y = my + (20 * tt + ((vy - 20) * e) / 2.2) * s;
      const flip = Math.abs(Math.cos(tt * 9 + seed));
      g.fillStyle = CONFETTI[(i + seed) % CONFETTI.length];
      g.fillRect(X - flip * 1.25 * s, Y - s, Math.max(0.6, flip * 2.5) * s, 2 * s);
    }
  }
}

const WAU = pixelArt(
  [
    ".........K.........",
    "........KYK........",
    "........KYK........",
    "KK......KYK......KK",
    "KRK....KRYRK....KRK",
    "KRRKK.KRRYRRK.KKRRK",
    ".KRRRKKRWYWRKKRRRK.",
    ".KRRRRRRWYWRRRRRRK.",
    "..KRRRRRRYRRRRRRK..",
    "...KKRRRRYRRRRKK...",
    ".....KKKRYRKKK.....",
    "........KYK........",
    "...K....KYK....K...",
    "..KTK..KTYTK..KTK..",
    "..KTTKKTTYTTKKTTK..",
    "...KTTTTTGTTTTTK...",
    "....KKTTTTTTTKK....",
    "......KKKKKKK......",
  ],
  { K: "#2a1b18", Y: "#ffd23f", R: "#e63946", W: "#ffffff", T: "#1fa2a8", G: "#ffd23f" },
);

/** A wau bulan (moon kite) swoops low past you and soars off, string trailing. */
function drawWau(g: Ctx, cx: number, fy: number, s: number, p: number, k: number) {
  const u = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
  const at = (q: number) => {
    const a = (1 - q) * (1 - q);
    const b = 2 * q * (1 - q);
    const c = q * q;
    return [
      a * (cx - 38 * s) + b * (cx - 2 * s) + c * (cx + 30 * s),
      a * (fy - 34 * s) + b * (fy + 18 * s) + c * (fy - 78 * s),
    ];
  };
  const fade = Math.min(1, k / 0.08, (1 - k) / 0.15);
  // Gusts of wind at your feet as you appear.
  if (k < 0.45) {
    g.globalAlpha = (1 - k / 0.45) * 0.8;
    g.strokeStyle = "#ffffff";
    g.lineWidth = Math.max(1, s * 0.6);
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const r = (6 + i * 4 + k * 20) * s;
      const a0 = k * 6 + i * 2;
      g.moveTo(cx + Math.cos(a0) * r, fy - 3 * s + Math.sin(a0) * r * 0.35);
      g.ellipse(cx, fy - 3 * s, r, r * 0.35, 0, a0, a0 + 1.6);
    }
    g.stroke();
  }
  const [kx, ky] = at(u);
  const [px2, py2] = at(Math.max(0, u - 0.02));
  // Tilts a little into the swoop (small angles keep the pixel art crisp).
  const ang =
    Math.max(-0.25, Math.min(0.25, Math.atan2(kx - px2, py2 - ky + 0.001) * 0.4)) +
    Math.sin(p / 160) * 0.05;
  const ks = s * 1.2;
  // String trailing back along the path, with a gentle wave.
  g.globalAlpha = fade * 0.9;
  g.strokeStyle = "rgba(255,255,255,.9)";
  g.lineWidth = Math.max(1, s * 0.4);
  g.beginPath();
  g.moveTo(kx - Math.sin(ang) * 9 * ks, ky + Math.cos(ang) * 9 * ks);
  for (let j = 1; j <= 10; j++) {
    const [sx, sy] = at(Math.max(0, u - j * 0.03));
    g.lineTo(sx + Math.sin(p / 140 + j) * j * 0.4 * s, sy + 9 * ks + j * 1.2 * s);
  }
  g.stroke();
  g.globalAlpha = fade;
  g.save();
  g.translate(kx, ky);
  g.rotate(ang);
  drawArt(g, WAU, -9.5 * ks, -9 * ks, ks);
  // Little rumbai tassels fluttering from the wing tips.
  for (const tx of [-9.5, 8.5]) {
    const wv = Math.sin(p / 90 + tx) * ks;
    g.fillStyle = "#ffd23f";
    g.fillRect(tx * ks + wv * 0.4, -3 * ks, ks, 2 * ks);
    g.fillStyle = "#e63946";
    g.fillRect(tx * ks + wv, -1 * ks, ks, 2 * ks);
  }
  g.restore();
}

/** A sci-fi beam: you assemble from glowing slices, rings pulse at your feet. */
function drawTeleport(g: Ctx, cx: number, fy: number, s: number, p: number, k: number) {
  const top = fy - 90 * s;
  const beam = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.2);
  const reach = Math.min(1, k / 0.1);
  // Glowing pad under your feet.
  g.globalAlpha = Math.min(1, k / 0.05) * (k < 0.8 ? 1 : (1 - k) / 0.2);
  g.fillStyle = "rgba(110,235,255,.3)";
  g.strokeStyle = "#6ff0ff";
  g.lineWidth = Math.max(1, s * 0.7);
  g.beginPath();
  g.ellipse(cx, fy, 11 * s, 3.6 * s, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  if (beam > 0) {
    const bw = (10 + Math.sin(p / 60) * 0.8) * s * beam;
    const by1 = top + (fy - top) * reach;
    const bg = g.createLinearGradient(cx - bw, 0, cx + bw, 0);
    bg.addColorStop(0, "rgba(80,220,255,0)");
    bg.addColorStop(0.5, "rgba(170,245,255,.55)");
    bg.addColorStop(1, "rgba(80,220,255,0)");
    // Drawn in steps so it fades out towards the top; dims once you're in.
    const dim = beam * (k < 0.55 ? 1 : 0.55);
    const seg = (by1 - top) / 14;
    for (let i = 0; i < 14; i++) {
      g.globalAlpha = dim * Math.min(1, (i + 1) / 9);
      g.fillStyle = bg;
      g.fillRect(cx - bw, top + i * seg, bw * 2, seg + 0.5);
      g.fillStyle = "rgba(255,255,255,.7)";
      g.fillRect(cx - s * beam, top + i * seg, 2 * s * beam, seg + 0.5);
    }
    for (let i = 0; i < 10; i++) {
      const ph = (p / 700 + i / 10) % 1;
      g.globalAlpha = (1 - ph) * beam;
      g.fillStyle = i % 2 ? "#ffffff" : "#8ff6ff";
      g.fillRect(cx + (((i * 7) % 9) - 4) * 1.8 * s, fy - ph * 70 * s, s, s);
    }
  }
  // The avatar "assembles": slices covering it vanish from the feet up.
  const rows = 18;
  for (let r = 0; r < rows; r++) {
    const order = (rows - 1 - r + ((r * 7) % 5) * 0.9) / (rows + 4);
    const rv = 0.12 + order * 0.5;
    if (k > rv + 0.07) continue;
    const gone = k > rv ? (k - rv) / 0.07 : 0;
    const jit = gone ? 0 : (((r * 13 + Math.floor(p / 50)) % 7) - 3) * s;
    const wid = (17 + ((r * 5) % 5)) * s * (1 - gone);
    g.globalAlpha = 0.92 * (1 - gone * 0.5);
    g.fillStyle = gone ? "#ffffff" : r % 2 ? "#7ff0ff" : "#3fc8f0";
    g.fillRect(cx - wid / 2 + jit, fy - 36 * s + r * 2 * s, wid, 1.6 * s);
  }
  // Rings pulse out from the pad.
  g.lineWidth = Math.max(1, s * 0.8);
  for (const born of [0, 0.22, 0.44, 0.66]) {
    const q = (k - born) / 0.3;
    if (q < 0 || q > 1) continue;
    g.globalAlpha = 1 - q;
    g.strokeStyle = born === 0.66 ? "#ffffff" : "#6ff0ff";
    g.beginPath();
    g.ellipse(cx, fy, (6 + q * 18) * s, (2 + q * 6) * s, 0, 0, Math.PI * 2);
    g.stroke();
  }
}

const DRAGON_PAL = {
  R: "#e2483a",
  D: "#8a1f1a",
  Y: "#ffcf5a",
  T: "#ffcf5a",
  M: "#7a1f3d",
  L: "#ff8a65",
  E: "#ffffff",
  H: "#f3e6c0",
};
const DRAGON = [
  pixelArt(
    [
      "......MM........",
      ".....MLLM.......",
      "....MLLLM.......",
      "....MLLLLM..HH..",
      ".....MLLRRDRRRH.",
      "......DRRRRRRERR",
      "T....DRRRRRRRRDD",
      "RD..DRRRRYYRD...",
      ".RRRRRYYYYRD....",
      "...DRRDDRRD.....",
      "...DD...DD......",
    ],
    DRAGON_PAL,
  ),
  pixelArt(
    [
      "................",
      "................",
      "................",
      "............HH..",
      "..........DRRRH.",
      "......DRRRRRRERR",
      "T....DRRRRRRRRDD",
      "RD..DRMLLLLMRD..",
      ".RRRRRMLLLLMD...",
      "...DRRDMLLMD....",
      "...DD...MMD.....",
    ],
    DRAGON_PAL,
  ),
];

/** A little dragon circles you, breathes fire at your feet, and flies off. */
function drawDragon(g: Ctx, cx: number, fy: number, s: number, p: number, k: number) {
  const cy = fy - 18 * s;
  const rx = 24 * s;
  const ry = 9 * s;
  const thEnd = -Math.PI / 4;
  const endX = cx + Math.cos(thEnd) * rx;
  const endY = cy + Math.sin(thEnd) * ry - 6 * s;
  let dx: number;
  let dy: number;
  let face = -1;
  let size = 1;
  let alpha = 1;
  if (k < 0.5) {
    const e = 1 - (1 - k / 0.5) ** 2;
    const th = thEnd - 3 * Math.PI * (1 - e);
    const m = 1 + 1.6 * (1 - e) ** 2;
    dx = cx + Math.cos(th) * rx * m;
    dy = cy + Math.sin(th) * ry * m - (1 - e) * 30 * s - 6 * s * e;
    face = Math.sin(th) <= 0 ? 1 : -1;
    size = 0.85 + 0.15 * Math.sin(th);
    alpha = Math.min(1, k / 0.06);
  } else if (k < 0.66) {
    dx = endX;
    dy = endY + Math.sin(p / 150) * 1.5 * s;
  } else {
    const q = (k - 0.66) / 0.34;
    dx = endX + q * q * 50 * s;
    dy = endY - q * q * 60 * s;
    face = 1;
    alpha = 1 - q;
  }
  // Ring of fire at your feet, expanding and fading.
  if (k > 0.58) {
    const q = (k - 0.58) / 0.42;
    const e = 1 - (1 - q) ** 3;
    const frx = (8 + 30 * e) * s;
    const fry = frx * 0.36;
    g.globalAlpha = (1 - q) * 0.22;
    g.fillStyle = "#ff7a1a";
    g.beginPath();
    g.ellipse(cx, fy, frx, fry, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = Math.min(1, (1 - q) * 1.6);
    for (const [grow, color] of [
      [1, "#ff5a14"],
      [0.55, "#ffd23f"],
    ] as const) {
      g.fillStyle = color;
      g.beginPath();
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const bx = cx + Math.cos(a) * frx;
        const by = fy + Math.sin(a) * fry;
        // Skip the back of the ring where it would cover your legs.
        if (Math.sin(a) < 0 && Math.abs(bx - cx) < 9 * s) continue;
        const flick = 0.6 + 0.4 * Math.sin(p / 70 + i * 2.3);
        const fh = (4 + 4 * flick) * s * (1 - q * 0.5) * grow;
        const fw = 2.2 * s * (1 - q * 0.3) * grow;
        g.moveTo(bx - fw, by);
        g.quadraticCurveTo(bx - fw * 0.6, by - fh * 0.5, bx + Math.sin(p / 90 + i) * s, by - fh);
        g.quadraticCurveTo(bx + fw * 0.6, by - fh * 0.5, bx + fw, by);
      }
      g.fill();
    }
    for (let i = 0; i < 8; i++) {
      const ph = (q * 2 + i / 8) % 1;
      const a = i * 0.8;
      g.globalAlpha = (1 - ph) * (1 - q);
      g.fillStyle = i % 2 ? "#ffb347" : "#ffe08a";
      g.fillRect(cx + Math.cos(a) * frx * 0.9, fy + Math.sin(a) * fry - ph * 16 * s, s, s);
    }
  }
  const art = DRAGON[Math.floor(p / 110) % 2];
  const ss = s * size * 1.25;
  const ax = dx - (art.w * ss) / 2;
  const ay = dy - 5.5 * ss;
  // Fire breath from the mouth down to your feet.
  if (k > 0.48 && k < 0.66) {
    const env = Math.min(1, (k - 0.48) / 0.04, (0.66 - k) / 0.04);
    const mx = ax + 0.5 * ss;
    const my = ay + 5.5 * ss;
    const tx = cx + 2 * s;
    const ty = fy - 3 * s;
    for (let i = 0; i < 14; i++) {
      const ph = (p / 260 + i / 14) % 1;
      const r = (1 + ph * 2.5) * s;
      g.globalAlpha = env * (1 - ph * 0.4);
      g.fillStyle = ph < 0.3 ? "#fff3a0" : ph < 0.65 ? "#ffb02e" : "#ff5a1f";
      g.fillRect(
        mx + (tx - mx) * ph + Math.sin(p / 40 + i * 2) * ph * 2 * s - r / 2,
        my + (ty - my) * ph - r / 2,
        r,
        r,
      );
    }
  }
  g.globalAlpha = alpha;
  drawArt(g, art, ax, ay, ss, face < 0);
}

/**
 * Draws an entrance effect around feet point (cx, fy), s = screen pixel size,
 * p = ms since the player arrived. Draw it in front of the avatar.
 */
export function drawEntrance(g: Ctx, id: string, cx: number, fy: number, s: number, p: number) {
  if (id === "none" || p < 0 || p > ENTRANCE_MS) return;
  const k = p / ENTRANCE_MS;
  g.save();
  if (id === "poof") {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = (4 + k * 18) * s;
      g.globalAlpha = 1 - k;
      g.fillStyle = "#f4f1ea";
      g.fillRect(cx + Math.cos(a) * r, fy - 10 * s + Math.sin(a) * r * 0.5, 3 * s, 3 * s);
    }
  }
  if (id === "sparkle") {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + k * 2;
      const r = (6 + k * 16) * s;
      g.globalAlpha = 1 - k;
      g.fillStyle = i % 2 ? "#f2c14e" : "#ffffff";
      const x = cx + Math.cos(a) * r;
      const y = fy - 16 * s + Math.sin(a) * r * 0.6;
      g.fillRect(x, y - s, s, 3 * s);
      g.fillRect(x - s, y, 3 * s, s);
    }
  }
  if (id === "petals") {
    for (let i = 0; i < 14; i++) {
      const ph = (k * 1.4 + i / 14) % 1;
      g.globalAlpha = 1 - k;
      g.fillStyle = i % 2 ? "#ffb7d0" : "#ffe0ec";
      g.fillRect(
        cx - 22 * s + ((i * 37) % 44) * s + Math.sin(ph * 6) * 2 * s,
        fy - 44 * s + ph * 44 * s,
        2 * s,
        s,
      );
    }
  }
  if (id === "bolt") {
    if (p < 600 && Math.floor(p / 80) % 2 === 0) {
      g.fillStyle = "#fff6a8";
      g.fillRect(cx - s, fy - 60 * s, 2 * s, 30 * s);
      g.fillRect(cx - 4 * s, fy - 32 * s, 2 * s, 14 * s);
      g.fillRect(cx - s, fy - 20 * s, 2 * s, 12 * s);
    }
    g.globalAlpha = Math.max(0, 0.5 - k * 0.5);
    g.fillStyle = "#7fd3ff";
    g.beginPath();
    g.ellipse(cx, fy, (8 + k * 10) * s, (2 + k * 2) * s, 0, 0, Math.PI * 2);
    g.fill();
  }
  if (id === "portal") {
    const open = Math.min(1, k * 3) * (k > 0.75 ? (1 - k) * 4 : 1);
    g.globalAlpha = 0.85;
    g.strokeStyle = "#a77de0";
    g.lineWidth = 2 * s;
    g.beginPath();
    g.ellipse(cx, fy - 1 * s, 12 * s * open, 4 * s * open, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "#00e5ff";
    g.beginPath();
    g.ellipse(cx, fy - 1 * s, 8 * s * open, 2.5 * s * open, 0, 0, Math.PI * 2);
    g.stroke();
  }
  if (id === "confetti") drawConfetti(g, cx, fy, s, p, k);
  if (id === "wau") drawWau(g, cx, fy, s, p, k);
  if (id === "teleport") drawTeleport(g, cx, fy, s, p, k);
  if (id === "dragon") drawDragon(g, cx, fy, s, p, k);
  // ─── Admin sets (preview) ───
  if (id === "adm_root") {
    // Code rain falls around you, then a scan line sweeps up as you appear.
    for (let c = 0; c < 9; c++) {
      const colX = cx + (c - 4) * 5 * s;
      const speed = 0.7 + ((c * 37) % 5) / 10;
      const head = (k * speed * 1.6 + ((c * 13) % 7) / 10) % 1;
      for (let j = 0; j < 6; j++) {
        const yy = fy - 50 * s + (head * 56 - j * 4) * s;
        if (yy > fy || yy < fy - 52 * s) continue;
        g.globalAlpha = (1 - j / 6) * (1 - k * 0.8);
        g.fillStyle = j === 0 ? "#d6ffe0" : "#2bd96b";
        g.fillRect(colX, yy, 2 * s, 2 * s);
      }
    }
    if (k > 0.45 && k < 0.85) {
      const sy = fy - ((k - 0.45) / 0.4) * 40 * s;
      g.globalAlpha = 0.8;
      g.fillStyle = "#7dff9b";
      g.fillRect(cx - 14 * s, sy, 28 * s, s);
    }
  }
  if (id === "adm_rgb") {
    // Three RGB shockwave rings, with glitch slices at the start.
    for (let i = 0; i < 3; i++) {
      const kk = k - i * 0.12;
      if (kk < 0 || kk > 1) continue;
      g.globalAlpha = (1 - kk) * 0.9;
      g.strokeStyle = `hsl(${(i * 120 + p / 6) % 360},95%,60%)`;
      g.lineWidth = 2 * s;
      g.beginPath();
      g.ellipse(cx, fy - s, (6 + kk * 26) * s, (2 + kk * 8) * s, 0, 0, Math.PI * 2);
      g.stroke();
    }
    if (p < 700) {
      for (let i = 0; i < 5; i++) {
        if (Math.floor(p / 70 + i) % 3) continue;
        g.globalAlpha = 0.7;
        g.fillStyle = `hsl(${(i * 72 + p / 3) % 360},95%,60%)`;
        const off = (((i * 7 + Math.floor(p / 70)) % 9) - 4) * 2 * s;
        g.fillRect(cx - 14 * s + off, fy - (8 + i * 7) * s, 28 * s, 2 * s);
      }
    }
  }
  if (id === "adm_crest") {
    // A golden beam of light comes down, gold sparkles fall, a shield flashes.
    const beam = k < 0.6 ? Math.min(1, k * 4) : Math.max(0, (1 - k) / 0.4);
    const grad = g.createLinearGradient(cx, fy - 70 * s, cx, fy);
    grad.addColorStop(0, "rgba(255,229,138,0)");
    grad.addColorStop(1, "rgba(255,229,138,.7)");
    g.globalAlpha = beam;
    g.fillStyle = grad;
    g.fillRect(cx - 9 * s, fy - 70 * s, 18 * s, 70 * s);
    g.globalAlpha = beam * 0.6;
    g.fillStyle = "#fff6c8";
    g.fillRect(cx - 3 * s, fy - 70 * s, 6 * s, 70 * s);
    for (let i = 0; i < 12; i++) {
      const ph = (k * 1.3 + i / 12) % 1;
      g.globalAlpha = 1 - k;
      g.fillStyle = i % 3 ? "#f2c14e" : "#ffffff";
      const x = cx - 16 * s + ((i * 29) % 32) * s;
      const yy = fy - 56 * s + ph * 56 * s;
      g.fillRect(x, yy - s, s, 3 * s);
      g.fillRect(x - s, yy, 3 * s, s);
    }
    if (k > 0.35 && k < 0.7) {
      g.globalAlpha = 1 - Math.abs(k - 0.52) / 0.18;
      const sx = cx - 5 * s;
      const sy = fy - 50 * s;
      g.fillStyle = "#f2c14e";
      g.fillRect(sx, sy, 10 * s, 8 * s);
      g.fillRect(sx + s, sy + 8 * s, 8 * s, 2 * s);
      g.fillRect(sx + 3 * s, sy + 10 * s, 4 * s, 2 * s);
      g.fillStyle = "#ffffff";
      g.fillRect(sx + 4 * s, sy + 2 * s, 2 * s, 5 * s);
    }
  }
  g.restore();
}

/** The look with any show-off item you can't use yet swapped for the default. */
export function wearableShowoffLook<L extends Partial<Record<ShowoffKind, string>>>(
  look: L,
  w: { plan: Plan; owned: Set<string>; admin?: boolean },
): L {
  const next = { ...look };
  (Object.keys(SHOWOFF) as ShowoffKind[]).forEach((kind) => {
    const id = next[kind];
    if (id && !canUseShowoff(kind, id, w)) next[kind] = SHOWOFF_DEFAULT[kind] as L[typeof kind];
  });
  return next;
}
