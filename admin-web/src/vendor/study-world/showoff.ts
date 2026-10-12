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
export type ShowoffItem = { id: string; name: string; tier: ItemTier; price?: number };

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
  { id: "sakura", name: "Sakura", tier: "plus" },
  { id: "neon", name: "Neon", tier: "plus" },
  { id: "galaxy", name: "Galaxy", tier: "pro" },
  { id: "royal", name: "Royal", tier: "pro" },
];

export const BUBBLES: ShowoffItem[] = [
  { id: "plain", name: "Default", tier: "free" },
  { id: "mint", name: "Mint", tier: "free" },
  { id: "pastel", name: "Pastel", tier: "coins", price: 60 },
  { id: "comic", name: "Comic", tier: "coins", price: 80 },
  { id: "heart", name: "Sweetheart", tier: "plus" },
  { id: "cloud", name: "Cloud", tier: "plus" },
  { id: "pixelgold", name: "Pixel gold", tier: "pro" },
  { id: "galaxy", name: "Galaxy", tier: "pro" },
];

export const ENTRANCES: ShowoffItem[] = [
  { id: "none", name: "None", tier: "free" },
  { id: "poof", name: "Poof", tier: "free" },
  { id: "sparkle", name: "Sparkle burst", tier: "coins", price: 100 },
  { id: "petals", name: "Petal rain", tier: "plus" },
  { id: "bolt", name: "Lightning drop", tier: "pro" },
  { id: "portal", name: "Portal", tier: "pro" },
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

const tierOk = (tier: ItemTier, plan: Plan) =>
  tier === "free" ||
  (tier === "pro" ? plan === "pro" : tier !== "coins" && (plan === "plus" || plan === "pro"));

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
    default:
      body("#ffffff", "rgba(42,27,24,.5)");
      return "#2a1b18";
  }
}

/** How long an entrance effect plays. */
export const ENTRANCE_MS = 2200;

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
