/**
 * Study World avatars (preview).
 *
 * Avatars are drawn from code onto a small 28×38 pixel grid, then scaled up
 * with nearest-neighbour so the pixels stay crisp. The real release should
 * swap this for commissioned or licensed sprite sheets; the item catalogue,
 * tiers and look shape can stay the same.
 */

import { EXTRA_ITEMS, type ExtraItem, type FxKit, type Painter } from "./avatar-items";
/** The action emotes (same keys as ACTIONS in chat.ts; kept here so this file
 *  stays self-contained for the admin website's copy). */
type ActionKey = "wave" | "laugh" | "dance" | "clap" | "cheer" | "cry" | "love" | "think";

/**
 * free: everyone. coins: bought once with coins. plus / pro: included with a
 * Rencana Plus or Pro membership (Pro gets every Plus item too). "premium" is
 * the old one-off tier; it's treated like plus.
 */
export type ItemTier = "free" | "coins" | "plus" | "pro" | "premium";
export type Plan = "free" | "plus" | "pro";
/** Is this tier open to this membership plan? (Coin items also need buying.) */
export const tierOpen = (tier: ItemTier, plan: Plan) =>
  tier === "free" || tier === "coins"
    ? true
    : tier === "pro"
      ? plan === "pro"
      : plan === "plus" || plan === "pro";
export const isMemberTier = (tier: ItemTier) =>
  tier === "plus" || tier === "pro" || tier === "premium";

export type AvatarLook = {
  skin: string;
  eyes: string;
  eyeColor: string;
  hair: string;
  hairColor: string;
  top: string;
  topColor: string;
  bottom: string;
  bottomColor: string;
  shoes: string;
  shoesColor: string;
  head: string;
  face: string;
  back: string;
  pet: string;
  effect: string;
  /** Show-off items (see showoff.ts): name frame, chat bubble, entrance effect. */
  frame?: string;
  bubble?: string;
  entrance?: string;
};

export type ItemCategory =
  | "hair"
  | "eyes"
  | "top"
  | "bottom"
  | "shoes"
  | "head"
  | "face"
  | "back"
  | "pet"
  | "effect";

export type CatalogItem = {
  id: string;
  name: string;
  tier: ItemTier;
  price?: number;
  /** Set from the admin website (see remote.ts). Missing means available. */
  status?: "available" | "coming_soon" | "hidden";
  releaseAt?: string | null;
  featured?: boolean;
  order?: number;
  /** Moving parts (redrawn every few frames). */
  animated?: boolean;
};

/** Can be picked in the shop right now (not coming soon or hidden by an admin). */
export const isOnSale = (item: { status?: string }) => (item.status ?? "available") === "available";

export const CATALOG: Record<ItemCategory, CatalogItem[]> = {
  hair: [
    { id: "short", name: "Short", tier: "free" },
    { id: "spiky", name: "Spiky", tier: "free" },
    { id: "long", name: "Long", tier: "free" },
    { id: "curly", name: "Curly", tier: "free" },
    { id: "bun", name: "Bun", tier: "free" },
    { id: "ponytail", name: "Ponytail", tier: "coins", price: 50 },
    { id: "twintails", name: "Twin tails", tier: "coins", price: 60 },
    { id: "mohawk", name: "Mohawk", tier: "coins", price: 60 },
  ],
  eyes: [
    { id: "round", name: "Round", tier: "free" },
    { id: "happy", name: "Happy", tier: "free" },
    { id: "sleepy", name: "Sleepy", tier: "free" },
    { id: "wink", name: "Wink", tier: "coins", price: 50 },
    { id: "sparkle", name: "Star eyes", tier: "plus" },
    { id: "cat", name: "Cat eyes", tier: "plus" },
  ],
  top: [
    { id: "tee", name: "T-shirt", tier: "free" },
    { id: "hoodie", name: "Hoodie", tier: "free" },
    { id: "uniform", name: "Uniform", tier: "free" },
    { id: "varsity", name: "Varsity", tier: "coins", price: 80 },
    { id: "kimono", name: "Kimono", tier: "plus" },
    { id: "royal", name: "Royal coat", tier: "pro" },
    { id: "neon", name: "Neon jacket", tier: "plus" },
    { id: "astro", name: "Astronaut", tier: "pro" },
  ],
  bottom: [
    { id: "pants", name: "Pants", tier: "free" },
    { id: "shorts", name: "Shorts", tier: "free" },
    { id: "skirt", name: "Skirt", tier: "free" },
    { id: "cargo", name: "Cargo", tier: "coins", price: 50 },
    { id: "starry", name: "Starry", tier: "plus" },
  ],
  shoes: [
    { id: "sneakers", name: "Sneakers", tier: "free" },
    { id: "boots", name: "Boots", tier: "free" },
    { id: "slippers", name: "Slippers", tier: "coins", price: 50 },
    { id: "rocket", name: "Rocket boots", tier: "pro" },
  ],
  head: [
    { id: "none", name: "None", tier: "free" },
    { id: "cap", name: "Cap", tier: "free" },
    { id: "flowers", name: "Flowers", tier: "free" },
    { id: "beanie", name: "Beanie", tier: "coins", price: 50 },
    { id: "phones", name: "Headphones", tier: "coins", price: 60 },
    { id: "catears", name: "Cat ears", tier: "coins", price: 80 },
    { id: "crown", name: "Gold crown", tier: "pro" },
    { id: "halo", name: "Halo", tier: "plus" },
    { id: "wizard", name: "Wizard hat", tier: "plus" },
  ],
  face: [
    { id: "none", name: "None", tier: "free" },
    { id: "glasses", name: "Glasses", tier: "free" },
    { id: "shades", name: "Shades", tier: "coins", price: 50 },
    { id: "hearts", name: "Heart specs", tier: "plus" },
    { id: "visor", name: "Cyber visor", tier: "pro" },
  ],
  back: [
    { id: "none", name: "None", tier: "free" },
    { id: "backpack", name: "Backpack", tier: "free" },
    { id: "guitar", name: "Guitar", tier: "coins", price: 90 },
    { id: "cape", name: "Hero cape", tier: "plus" },
    { id: "wings", name: "Angel wings", tier: "pro" },
    { id: "bat", name: "Bat wings", tier: "plus" },
  ],
  pet: [
    { id: "none", name: "None", tier: "free" },
    { id: "chick", name: "Chick", tier: "free" },
    { id: "cat", name: "Cat", tier: "coins", price: 150 },
    { id: "dragon", name: "Baby dragon", tier: "pro" },
    { id: "ghost", name: "Ghosty", tier: "plus" },
  ],
  effect: [
    { id: "none", name: "None", tier: "free" },
    { id: "sparkle", name: "Gold sparkle", tier: "plus" },
    { id: "hearts", name: "Hearts", tier: "plus" },
    { id: "sakura", name: "Sakura", tier: "plus" },
    { id: "snow", name: "Snowfall", tier: "pro" },
  ],
};

// New items from avatar-items/ (drawn there, listed here so the shop sees them).
(Object.keys(CATALOG) as ItemCategory[]).forEach((category) => {
  EXTRA_ITEMS[category]?.items.forEach((item) => {
    if (CATALOG[category].some((existing) => existing.id === item.id)) return;
    CATALOG[category].push({
      ...item,
      animated: EXTRA_ITEMS[category].draw[item.id]?.animated,
    });
  });
});
/** The plug-in drawing for an item, if it's one of the new ones. */
const extra = (category: ItemCategory, id: string): ExtraItem | undefined =>
  EXTRA_ITEMS[category]?.draw[id];

export const COLORS = {
  skin: ["#fbe0c8", "#f1c8a4", "#dda57e", "#b97a55", "#8d5a3b", "#5e3a26"],
  hair: ["#2a1b18", "#5a3824", "#a8642f", "#e0b04a", "#e8e0d0", "#c45a8a", "#3d4f8f", "#3fae8f"],
  premiumHair: [
    { id: "galaxy", name: "Galaxy dye", tier: "plus" },
    { id: "rainbow", name: "Rainbow dye", tier: "pro" },
  ] as { id: string; name: string; tier: ItemTier; status?: CatalogItem["status"] }[],
  eyes: ["#3b2a24", "#2f5fa8", "#3a8a4a", "#7a4bb0", "#8a5a2a"],
  top: ["#5b7cfa", "#3fae8f", "#e2574c", "#f2c14e", "#a77de0", "#f08aa8", "#f4f1ea", "#2f3a4a"],
  bottom: ["#2f3a4a", "#3d5a80", "#5a4636", "#26262b", "#8a9aa8", "#c0504d"],
  shoes: ["#f4f1ea", "#e2574c", "#2f3a4a", "#3d7fd6", "#f2c14e"],
};

export const DEFAULT_LOOK: AvatarLook = {
  skin: "#f1c8a4",
  eyes: "round",
  eyeColor: "#3b2a24",
  hair: "short",
  hairColor: "#2a1b18",
  top: "hoodie",
  topColor: "#5b7cfa",
  bottom: "pants",
  bottomColor: "#2f3a4a",
  shoes: "sneakers",
  shoesColor: "#f4f1ea",
  head: "none",
  face: "none",
  back: "none",
  pet: "none",
  effect: "none",
  frame: "plain",
  bubble: "plain",
  entrance: "none",
};

/**
 * Admin-only outfits. These ids are deliberately NOT in CATALOG, so the shop
 * never lists them and saved looks drop them for anyone the server doesn't
 * confirm as an admin. Three designs to choose from (preview).
 */
export const ADMIN_OUTFITS = {
  shadow: {
    name: "Shadow Monarch",
    tag: ["#3b1f5e", "#8a3ffc"],
    look: {
      top: "shadow",
      back: "shadow",
      head: "shadow",
      face: "shadow",
      effect: "shadow",
      pet: "wolf",
      bottom: "pants",
      bottomColor: "#26262b",
      shoes: "boots",
      shoesColor: "#2f3a4a",
    },
  },
  ember: {
    name: "Ember Shogun",
    tag: ["#7a141d", "#e2574c"],
    look: {
      top: "ember",
      back: "ember",
      head: "ember",
      face: "ember",
      effect: "ember",
      pet: "kitsune",
      bottom: "pants",
      bottomColor: "#26262b",
      shoes: "boots",
      shoesColor: "#2f3a4a",
    },
  },
  cyber: {
    name: "Cyber Overlord",
    tag: ["#0b3a4a", "#00b8d4"],
    look: {
      top: "cyber",
      back: "cyber",
      head: "cyber",
      face: "cyber",
      effect: "cyber",
      pet: "drone",
      bottom: "pants",
      bottomColor: "#2f3a4a",
      shoes: "boots",
      shoesColor: "#f4f1ea",
    },
  },
} satisfies Record<string, { name: string; tag: [string, string]; look: Partial<AvatarLook> }>;
export type AdminOutfit = keyof typeof ADMIN_OUTFITS;
const ADMIN_IDS = ["shadow", "ember", "cyber"];
/** Admin-only ids per category (never in CATALOG, never in the shop). */
export const ADMIN_ITEMS: Partial<Record<ItemCategory, readonly string[]>> = {
  top: ADMIN_IDS,
  back: ADMIN_IDS,
  head: ADMIN_IDS,
  face: ADMIN_IDS,
  effect: ADMIN_IDS,
  pet: ["wolf", "kitsune", "drone"],
};
const isAdminItem = (category: ItemCategory, id: string) =>
  ADMIN_ITEMS[category]?.includes(id) ?? false;
export const isAdminLook = (look: AvatarLook) =>
  (Object.keys(ADMIN_ITEMS) as ItemCategory[]).some((cat) => isAdminItem(cat, look[cat]));
/** Which admin outfit a look mostly shows (for the name tag colours). */
export function adminOutfitOf(look: AvatarLook): AdminOutfit | null {
  for (const key of [look.top, look.effect, look.head, look.back, look.face])
    if (key in ADMIN_OUTFITS) return key as AdminOutfit;
  if (look.pet === "wolf") return "shadow";
  if (look.pet === "kitsune") return "ember";
  if (look.pet === "drone") return "cyber";
  return null;
}
/** An admin outfit worn over your own face, hair and colours. */
export const wearAdminOutfit = (look: AvatarLook, id: AdminOutfit): AvatarLook =>
  ({ ...look, ...ADMIN_OUTFITS[id].look }) as AvatarLook;
/** Swaps admin-only items for plain defaults (for anyone without access). */
export function withoutAdminItems(look: AvatarLook): AvatarLook {
  if (!isAdminLook(look)) return look;
  const next = { ...look };
  (Object.keys(ADMIN_ITEMS) as ItemCategory[]).forEach((cat) => {
    if (isAdminItem(cat, next[cat])) next[cat] = DEFAULT_LOOK[cat];
  });
  return next;
}

export const GRID_W = 28;
export const GRID_H = 38;
const OX = 2;
export const OY = 5;
const OUTLINE = "#2a1b18";

export function itemOf(category: ItemCategory, id: string) {
  return CATALOG[category].find((item) => item.id === id);
}

export function premiumItemsWorn(look: AvatarLook): string[] {
  const names: string[] = [];
  (Object.keys(CATALOG) as ItemCategory[]).forEach((category) => {
    const item = itemOf(category, look[category]);
    if (item && isMemberTier(item.tier)) names.push(item.name);
  });
  const dye = COLORS.premiumHair.find((d) => d.id === look.hairColor);
  if (dye) names.push(dye.name);
  return names;
}

export const isPremiumLook = (look: AvatarLook) => premiumItemsWorn(look).length > 0;

/** Who's dressing: their membership plan, what they've bought, and whether they're an admin. */
export type Wardrobe = { plan: Plan; owned: Set<string>; admin?: boolean };
/** Can this person wear this item in the world (not just try it on)? */
export function canWear(category: ItemCategory, id: string, w: Wardrobe): boolean {
  if (w.admin) return true;
  const item = itemOf(category, id);
  if (!item) return isAdminItem(category, id) ? false : true;
  if (item.tier === "free") return true;
  if (item.tier === "coins") return w.owned.has(`${category}:${id}`);
  return tierOpen(item.tier, w.plan) || w.owned.has(`${category}:${id}`);
}
export function canWearDye(id: string, w: Wardrobe): boolean {
  const dye = COLORS.premiumHair.find((d) => d.id === id);
  if (!dye || w.admin) return true;
  return tierOpen(dye.tier, w.plan) || w.owned.has(`hair_dye:${id}`);
}
/** Items being tried on that this person can't wear in the world yet. */
export function lockedItemsWorn(look: AvatarLook, w: Wardrobe): CatalogItem[] {
  const locked = (Object.keys(CATALOG) as ItemCategory[])
    .filter((cat) => !canWear(cat, look[cat], w))
    .map((cat) => itemOf(cat, look[cat]))
    .filter((item): item is CatalogItem => Boolean(item));
  const dye = COLORS.premiumHair.find((d) => d.id === look.hairColor);
  if (dye && !canWearDye(dye.id, w)) locked.push({ id: dye.id, name: dye.name, tier: dye.tier });
  return locked;
}
/** The look with anything not wearable swapped for the default. */
export function wearableLook(look: AvatarLook, w: Wardrobe): AvatarLook {
  const next = { ...look };
  (Object.keys(CATALOG) as ItemCategory[]).forEach((cat) => {
    if (!canWear(cat, next[cat], w) && !isAdminItem(cat, next[cat])) next[cat] = DEFAULT_LOOK[cat];
  });
  if (!canWearDye(next.hairColor, w)) next.hairColor = DEFAULT_LOOK.hairColor;
  return next;
}

/** Looks with moving parts need redrawing every few frames; others are cached. */
export const isAnimatedLook = (look: AvatarLook) =>
  look.hairColor === "galaxy" ||
  look.hairColor === "rainbow" ||
  look.top === "neon" ||
  look.bottom === "starry" ||
  look.face === "visor" ||
  look.eyes === "sparkle" ||
  ["cape", "wings", "bat"].includes(look.back) ||
  (Object.keys(CATALOG) as ItemCategory[]).some((cat) => extra(cat, look[cat])?.animated) ||
  isAdminLook(look);

export function randomLook(allowPremium: boolean, random: () => number = Math.random): AvatarLook {
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
  const fromCategory = (category: ItemCategory, noneWeight = 0) => {
    const pool = CATALOG[category].filter(
      (item) => isOnSale(item) && (allowPremium || !isMemberTier(item.tier)),
    );
    if (noneWeight && pool.some((item) => item.id === "none") && random() < noneWeight)
      return "none";
    return pick(pool).id;
  };
  return {
    skin: pick(COLORS.skin),
    eyes: fromCategory("eyes"),
    eyeColor: pick(COLORS.eyes),
    hair: fromCategory("hair"),
    hairColor: allowPremium && random() < 0.15 ? pick(COLORS.premiumHair).id : pick(COLORS.hair),
    top: fromCategory("top"),
    topColor: pick(COLORS.top),
    bottom: fromCategory("bottom"),
    bottomColor: pick(COLORS.bottom),
    shoes: fromCategory("shoes"),
    shoesColor: pick(COLORS.shoes),
    head: fromCategory("head", 0.35),
    face: fromCategory("face", 0.45),
    back: fromCategory("back", 0.45),
    pet: fromCategory("pet", 0.6),
    effect: fromCategory("effect", 0.65),
  };
}

export function shade(hex: string, amount: number): string {
  if (typeof hex !== "string" || hex[0] !== "#") return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const target = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  r = Math.round((target - r) * p + r);
  g = Math.round((target - g) * p + g);
  b = Math.round((target - b) * p + b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Very dark hex colours (a darker shade wouldn't show on them). */
const isDark = (hex: string) => {
  if (typeof hex !== "string" || hex[0] !== "#") return false;
  const n = parseInt(hex.slice(1), 16);
  return (n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 < 60;
};

const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h)},${s}%,${l}%)`;

type Fill = string | ((x: number, y: number) => string) | null;
type Grid = (string | null)[][];

export type Facing = "f" | "b" | "l" | "r";

/**
 * An action emote being played: which one, and ms since it started.
 * "sleep": lying in a dorm bed (eyes shut whatever the eye style).
 */
export type AvatarPose = { kind: ActionKey | "sleep"; t: number };

type Pt = readonly [number, number];
/** A posed arm: the 2×2 elbow and hand blocks (top-left corners, body coords). */
type ArmPose = { el: Pt; hd: Pt };
type PoseSpec = {
  /** Arms left out keep the top's own arm. l is screen-left (x 5–6). */
  l?: ArmPose;
  r?: ArmPose;
  eyes?: "arc" | "sad" | "heart" | "heartSmall" | "up" | "shut";
  mouth?: "smile" | "grin" | "laugh" | "open" | "frown" | "hmm";
  tears?: boolean;
};
/** The same point on the other side of the body (for 2-wide blocks). */
const mirrorPt = ([x, y]: Pt): Pt => [22 - x, y];
const mirrorArm = (a: ArmPose): ArmPose => ({ el: mirrorPt(a.el), hd: mirrorPt(a.hd) });

/** Where the arms go and what the face does, p ms into an action. */
function poseSpec(kind: AvatarPose["kind"], p: number, fx: number): PoseSpec {
  const tick = (ms: number) => Math.floor(p / ms) % 2;
  switch (kind) {
    case "sleep":
      return { eyes: "shut" };
    case "wave":
      // Arm up beside the head, the hand swinging left and right.
      return { r: { el: [19, 13], hd: [19 + tick(200), 6] }, eyes: "arc", mouth: "smile" };
    case "laugh": {
      // Holding the belly, shoulders shaking.
      const s = tick(110);
      return {
        l: { el: [5, 20], hd: [8, 21 - s] },
        r: { el: [17, 20], hd: [14, 20 + s] },
        eyes: "arc",
        mouth: tick(140) ? "laugh" : "grin",
      };
    }
    case "dance": {
      // One arm points up, the other down; they swap on the beat.
      const up: ArmPose = { el: [3, 12], hd: [2, 7] };
      const down: ArmPose = { el: [5, 19], hd: [4, 22] };
      return tick(360)
        ? { l: down, r: mirrorArm(up), mouth: "grin" }
        : { l: up, r: mirrorArm(down), mouth: "grin" };
    }
    case "clap": {
      const shut = p % 320 < 130;
      return {
        l: { el: [5, 20], hd: [shut ? 10 : 8, 18] },
        r: { el: [17, 20], hd: [shut ? 12 : 14, 18] },
        eyes: "arc",
        mouth: "smile",
      };
    }
    case "cheer": {
      // Arms straight up while in the air (WorldCanvas does the jump), bent on landing.
      const k = Math.sin(p / 230) > 0 ? 0 : 2;
      return {
        l: { el: [3, 12], hd: [3, 3 + k] },
        r: { el: [19, 12], hd: [19, 3 + k] },
        mouth: "open",
      };
    }
    case "cry": {
      // Fists rubbing the cheeks, one up while the other is down.
      const s = tick(170);
      return {
        l: { el: [4, 14], hd: [5, 12 - s] },
        r: { el: [18, 14], hd: [17 + (fx ? 1 : 0), 11 + s] },
        eyes: "sad",
        mouth: "frown",
        tears: true,
      };
    }
    case "love":
      return {
        l: { el: [5, 20], hd: [10, 17] },
        r: { el: [17, 20], hd: [12, 17] },
        eyes: tick(260) ? "heartSmall" : "heart",
        mouth: "smile",
      };
    case "think":
      // Hand on the chin, the other arm across the belly.
      return {
        l: { el: [5, 20], hd: [14, 21] },
        r: { el: [17, 20], hd: [11 + fx, 14] },
        eyes: "up",
        mouth: "hmm",
      };
    default:
      return {};
  }
}

/**
 * Draws one avatar frame into a colour grid.
 * frame: 0–3 walk cycle (0 and 2 lift a foot, 1 and 3 are passing poses).
 * dir: "r" is a three-quarter view; draw it mirrored for "l".
 * pose: an action emote being played (arms and face move); none by default.
 */
export function buildAvatar(
  look: AvatarLook,
  t: number,
  frame: number,
  blink: boolean,
  dir: Exclude<Facing, "l">,
  pose?: AvatarPose | null,
): Grid {
  const grid: Grid = Array.from({ length: GRID_H }, () => Array<string | null>(GRID_W).fill(null));
  // While a pose is being set up, marks the pixels the top draws.
  let touched: boolean[][] | null = null;
  const R = (x: number, y: number, w: number, h: number, c: Fill) => {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const X = x + i + OX;
        const Y = y + j + OY;
        if (X >= 0 && Y >= 0 && X < GRID_W && Y < GRID_H) {
          grid[Y][X] = typeof c === "function" ? c(x + i, y + j) : c;
          if (touched) touched[Y][X] = true;
        }
      }
  };
  const px = (x: number, y: number, c: Fill) => R(x, y, 1, 1, c);

  const back = dir === "b";
  const fx = dir === "r" ? 2 : 0;
  const ps = pose ? poseSpec(pose.kind, Math.max(0, pose.t), fx) : null;
  const L = look;
  const sk = L.skin;
  const skS = shade(sk, -0.13);
  const hc: Fill =
    L.hairColor === "galaxy"
      ? (x, y) =>
          (x * 7 + y * 13) % 11 === 0 && Math.sin(t / 260 + x * 1.7) > 0.2
            ? "#ffffff"
            : y < 1
              ? "#6b4fd0"
              : y < 6
                ? "#4a39b0"
                : "#2c5cc9"
      : L.hairColor === "rainbow"
        ? (x, y) => hsl((x * 14 + y * 9 + t / 7) % 360, 78, 62)
        : L.hairColor;
  const hS: Fill = typeof hc === "function" ? hc : shade(hc as string, -0.28);
  const hH: Fill = typeof hc === "function" ? hc : shade(hc as string, 0.28);
  const tc = L.topColor;
  const tS = shade(tc, -0.22);
  const bc = L.bottomColor;
  const bS = shade(bc, -0.22);
  const sc = L.shoesColor;
  const lUp = frame === 0 ? 1 : 0;
  const rUp = frame === 2 ? 1 : 0;

  const legs = (c: Fill, cS: Fill) => {
    R(8, 24, 8, 2, c);
    R(8, 26 - lUp, 3, 3, c);
    R(13, 26 - rUp, 3, 3, c);
    R(15, 24, 1, 2, cS);
    R(10, 26 - lUp, 1, 3, cS);
    R(15, 26 - rUp, 1, 3, cS);
  };
  const torso = (c: string) => {
    R(7, 16, 10, 8, c);
    R(16, 16, 1, 8, shade(c, -0.22));
    R(7, 23, 10, 1, shade(c, -0.22));
  };
  const armsShort = (c: string) => {
    R(5, 16, 2, 4, c);
    R(17, 16, 2, 4, c);
    R(5, 20, 2, 3, sk);
    R(17, 20, 2, 3, sk);
    R(5, 23, 2, 1, skS);
    R(17, 23, 2, 1, skS);
  };
  const armsLong = (c: string, hand?: string) => {
    R(5, 16, 2, 7, c);
    R(17, 16, 2, 7, c);
    R(18, 16, 1, 7, shade(c, -0.2));
    R(5, 23, 2, 1, hand ?? sk);
    R(17, 23, 2, 1, hand ?? sk);
  };
  const cap = () => {
    R(7, 1, 10, 1, hc);
    R(6, 2, 12, 1, hc);
    R(5, 3, 14, 3, hc);
    R(8, 2, 3, 1, hH);
    R(7, 3, 2, 1, hH);
    R(18, 4, 1, 3, hS);
  };
  const gold = "#f2c14e";
  const P: Painter = {
    R,
    px,
    back,
    fx,
    t,
    frame,
    lUp,
    rUp,
    sk,
    skS,
    hc,
    hS,
    hH,
    tc,
    tS,
    bc,
    bS,
    sc,
    scD: shade(sc, -0.3),
    scL: shade(sc, 0.3),
    ec: L.eyeColor,
    gold,
    ink: "#2a1b18",
    shade,
    hsl,
    torso,
    armsShort,
    armsLong,
    legs,
    cap,
  };
  const xHair = extra("hair", L.hair);
  const xBack = extra("back", L.back);
  const xHead = extra("head", L.head);
  const hairHidden = Boolean(xHead?.hidesHair);

  const backItems = () => {
    if (L.back === "cape") {
      const sway = Math.round(Math.sin(t / 260));
      R(5, 17, 14, 10, "#b3262f");
      R(4 + sway, 27, 16, 2, "#b3262f");
      R(5, 27, 14, 1, "#8f1e25");
      R(5, 16, 14, 1, "#8f1e25");
      if (back) R(11, 17, 2, 9, "#9a2029");
    }
    if (L.back === "wings" || L.back === "bat") {
      const f = Math.sin(t / 170) > 0 ? 0 : -1;
      const col = L.back === "wings" ? "#ffffff" : "#3a2a4a";
      const line = L.back === "wings" ? "#d6e2f2" : "#5a4370";
      [
        [3, 5],
        [1, 5],
        [0, 5],
        [0, 5],
        [1, 5],
        [2, 5],
        [0, 4],
        [1, 4],
        [2, 4],
      ].forEach((r, i) => {
        R(r[0], 13 + i + f, r[1] - r[0] + 1, 1, col);
        R(23 - r[1], 13 + i + f, r[1] - r[0] + 1, 1, col);
      });
      [
        [2, 15],
        [1, 17],
        [2, 20],
      ].forEach(([x, y]) => {
        R(x, y + f, 3, 1, line);
        R(23 - x - 2, y + f, 3, 1, line);
      });
      if (back) {
        R(6, 16, 2, 6, col);
        R(16, 16, 2, 6, col);
      }
    }
    if (L.back === "shadow") {
      // Tattered cape with a purple lining; the hem ripples.
      const coat = "#1a1426";
      R(4, 15, 16, 11, coat);
      for (let x = 3; x <= 20; x++) {
        const end = 27 + ((x * 7) % 3) + Math.round(Math.sin(t / 260 + x * 0.6));
        R(x, 26, 1, end - 25, coat);
      }
      if (!back) {
        R(4, 17, 1, 9, "#3b1f5e");
        R(19, 17, 1, 9, "#3b1f5e");
      } else {
        const glow = Math.sin(t / 260) > 0 ? "#b06bff" : "#8a3ffc";
        R(11, 17, 2, 9, "#3b1f5e");
        px(11, 19, glow);
        px(12, 19, glow);
        px(10, 20, glow);
        px(13, 20, glow);
        px(11, 21, glow);
        px(12, 21, glow);
      }
    }
    if (L.back === "ember") {
      // Battle banner on a pole behind the right shoulder, and a katana.
      const wave = Math.round(Math.sin(t / 250));
      R(19, 3, 1, 15, "#3a2a25");
      R(20, 3 + wave, 4, 7, "#b3262f");
      R(20, 3 + wave, 4, 1, "#7a141d");
      R(21, 5 + wave, 2, 2, "#ffd76a");
      R(2, 12, 2, 5, "#2a1b18");
      px(2, 12, "#ffd76a");
      R(1, 16, 4, 1, "#ffd76a");
      if (back)
        for (let i = 0; i < 10; i++) {
          px(5 + i, 13 + i, "#e9edf2");
          if ((i + Math.floor(t / 90)) % 3 === 0) px(5 + i, 12 + i, "#ff9b3d");
        }
    }
    if (L.back === "cyber") {
      // Floating wing panels that hover beside the body.
      const h = Math.round(Math.sin(t / 300));
      (
        [
          [0, 13, 4, 3],
          [-1, 17, 4, 3],
          [0, 21, 3, 2],
        ] as const
      ).forEach(([x, y, w, hh], i) => {
        const yy = y + (i === 1 ? -h : h);
        R(x, yy, w, hh, "#eef2f7");
        R(x, yy + hh - 1, w, 1, "#00e5ff");
        R(23 - x - w + 1, yy, w, hh, "#eef2f7");
        R(23 - x - w + 1, yy + hh - 1, w, 1, "#00e5ff");
      });
      if (back) {
        R(8, 17, 3, 6, "#c3cad3");
        R(13, 17, 3, 6, "#c3cad3");
        R(8, 22, 3, 1, Math.floor(t / 100) % 2 ? "#00e5ff" : "#8ff6ff");
        R(13, 22, 3, 1, Math.floor(t / 100) % 2 ? "#00e5ff" : "#8ff6ff");
      }
    }
    if (L.back === "backpack") {
      if (back) {
        R(6, 16, 12, 9, "#e2874c");
        R(6, 16, 12, 1, "#f0a066");
        R(8, 19, 8, 4, "#c96f35");
        R(8, 19, 8, 1, "#9a5228");
      } else {
        R(4, 17, 16, 8, "#e2874c");
        R(4, 24, 16, 1, "#b8642f");
      }
    }
    if (L.back === "guitar") {
      R(18, 13, 2, 9, "#6e4425");
      R(17, 20, 5, 6, "#d9873a");
      R(18, 22, 3, 2, "#6e4425");
      R(17, 12, 4, 2, "#3a2a25");
      if (back) for (let i = 0; i < 8; i++) px(8 + i, 16 + i, "#3a2a25");
    }
  };
  const backHair = () => {
    if (L.hair === "long") {
      if (back) {
        R(4, 5, 16, 13, hc);
        R(5, 18, 14, 1, hS);
        R(4, 5, 1, 13, hS);
        R(19, 5, 1, 13, hS);
        [7, 11, 15].forEach((x) => R(x, 8, 1, 9, hS));
      } else {
        R(4, 5, 16, 15, hc);
        R(4, 5, 1, 15, hS);
        R(19, 5, 1, 15, hS);
      }
    }
    if (L.hair === "twintails") {
      R(0, 7, 4, 11, hc);
      R(20, 7, 4, 11, hc);
      R(1, 18, 2, 2, hc);
      R(21, 18, 2, 2, hc);
      R(0, 7, 1, 11, hS);
      R(23, 7, 1, 11, hS);
      px(3, 8, "#e24b4a");
      px(20, 8, "#e24b4a");
    }
    if (L.hair === "ponytail") {
      if (back) {
        R(10, 4, 4, 13, hc);
        R(13, 4, 1, 13, hS);
        R(10, 5, 4, 1, "#3d7fd6");
      } else {
        R(19, 3, 3, 13, hc);
        R(21, 3, 1, 13, hS);
        R(19, 4, 3, 1, "#3d7fd6");
      }
    }
  };
  if (!back) {
    backItems();
    xBack?.behind?.(P);
    if (!hairHidden) {
      backHair();
      xHair?.behind?.(P);
    }
  }

  if (L.bottom === "pants") legs(bc, bS);
  if (L.bottom === "cargo") {
    legs(bc, bS);
    R(8, 26 - lUp, 1, 2, bS);
    R(13, 26 - rUp, 1, 2, bS);
  }
  if (L.bottom === "starry")
    legs(
      (x, y) =>
        (x * 5 + y * 3) % 7 === 0 && Math.sin(t / 300 + x + y) > 0 ? "#fff6c8" : "#25245a",
      "#1b1a45",
    );
  if (L.bottom === "shorts") {
    R(8, 24, 8, 3, bc);
    R(15, 24, 1, 3, bS);
    R(8, 27 - lUp, 3, 2, sk);
    R(13, 27 - rUp, 3, 2, sk);
    R(10, 27 - lUp, 1, 2, skS);
    R(15, 27 - rUp, 1, 2, skS);
  }
  extra("bottom", L.bottom)?.draw?.(P);
  if (L.bottom === "skirt") {
    R(7, 23, 10, 2, bc);
    R(6, 25, 12, 2, bc);
    [8, 11, 14].forEach((x) => R(x, 25, 1, 2, bS));
    R(8, 27 - lUp, 3, 2, sk);
    R(13, 27 - rUp, 3, 2, sk);
  }

  // Every shoe style uses the chosen shoe colour.
  const scD = shade(sc, -0.3);
  const scL = shade(sc, 0.3);
  const shoes: Record<string, (x: number, y: number) => void> = {
    sneakers: (x, y) => {
      R(x, y, 4, 2, sc);
      R(x, y + 1, 4, 1, sc === "#f4f1ea" ? "#cfc9bd" : "#f4f1ea");
      px(x + 1, y, scD);
    },
    boots: (x, y) => {
      R(x, y - 1, 4, 3, sc);
      R(x, y + 1, 4, 1, scD);
      px(x + 1, y - 1, scL);
      px(x + 2, y, scD);
    },
    slippers: (x, y) => {
      R(x, y, 4, 2, scL);
      R(x, y, 4, 1, sc);
      px(x + 3, y + 1, scD);
    },
    rocket: (x, y) => {
      R(x, y - 1, 4, 3, "#c3cad3");
      R(x, y, 4, 1, sc === "#f4f1ea" ? "#e24b4a" : sc);
      R(x, y + 1, 4, 1, "#8a94a0");
    },
  };
  const xShoe = extra("shoes", L.shoes)?.shoe;
  const shoe =
    shoes[L.shoes] ?? (xShoe ? (x: number, y: number) => xShoe(P, x, y) : shoes.sneakers);
  shoe(7, 29 - lUp);
  shoe(13, 29 - rUp);

  // For a pose, remember what was behind the arms before the top drew them.
  const preTop = ps ? grid.map((row) => row.slice()) : null;
  if (ps) touched = grid.map((row) => row.map(() => false));
  switch (L.top) {
    case "tee":
      torso(tc);
      armsShort(tc);
      if (!back) {
        R(10, 16, 4, 1, skS);
        R(8, 18, 3, 2, shade(tc, 0.18));
      }
      break;
    case "hoodie":
      torso(tc);
      armsLong(tc);
      if (back) R(7, 16, 10, 3, tS);
      else {
        R(6, 15, 12, 2, tS);
        R(10, 17, 1, 3, "#f4f1ea");
        R(13, 17, 1, 3, "#f4f1ea");
        R(9, 21, 6, 2, tS);
      }
      break;
    case "uniform":
      torso("#f4f1ea");
      armsShort("#f4f1ea");
      R(16, 16, 1, 8, "#d8d2c6");
      R(7, 23, 10, 1, "#d8d2c6");
      if (!back) {
        px(10, 16, "#d8d2c6");
        px(13, 16, "#d8d2c6");
        R(11, 17, 2, 1, tc);
        R(11, 18, 2, 5, tc);
        px(12, 22, tS);
      } else R(9, 16, 6, 1, "#d8d2c6");
      break;
    case "varsity":
      torso(tc);
      armsLong("#f4f1ea");
      R(5, 22, 2, 1, tc);
      R(17, 22, 2, 1, tc);
      R(7, 16, 10, 1, tS);
      if (!back) {
        R(11, 16, 2, 8, "#2a2a30");
        R(8, 18, 2, 3, "#f4f1ea");
      } else {
        R(10, 18, 4, 3, "#f4f1ea");
        R(11, 19, 2, 1, tc);
      }
      break;
    case "kimono":
      torso(tc);
      R(3, 16, 4, 6, tc);
      R(17, 16, 4, 6, tc);
      R(20, 16, 1, 6, tS);
      R(5, 22, 2, 1, sk);
      R(17, 22, 2, 1, sk);
      R(7, 20, 10, 2, gold);
      R(7, 21, 10, 1, "#c99a1e");
      [
        [8, 17],
        [15, 18],
        [9, 22],
        [15, 22],
        [4, 18],
        [19, 19],
        [5, 17],
      ].forEach(([x, y]) => px(x, y, "#ffd1dc"));
      if (!back) {
        R(10, 16, 1, 3, "#f4f1ea");
        R(13, 16, 1, 3, "#f4f1ea");
        px(11, 18, "#f4f1ea");
        px(12, 18, "#f4f1ea");
      } else {
        R(10, 18, 4, 4, gold);
        px(11, 19, "#c99a1e");
        px(12, 20, "#c99a1e");
      }
      break;
    case "royal":
      torso("#6a2fb0");
      armsLong("#6a2fb0");
      R(5, 16, 2, 1, gold);
      R(17, 16, 2, 1, gold);
      R(7, 23, 10, 1, gold);
      R(5, 22, 2, 1, gold);
      R(17, 22, 2, 1, gold);
      if (!back) {
        R(11, 16, 2, 8, gold);
        [18, 20, 22].forEach((y) => px(12, y, "#fff6c8"));
      } else R(7, 16, 10, 1, gold);
      break;
    case "neon":
      torso("#1d1d2b");
      armsLong("#1d1d2b");
      R(7, 18, 10, 1, hsl((t / 5) % 360, 95, 60));
      R(7, 21, 10, 1, hsl((t / 5 + 120) % 360, 95, 60));
      R(5, 19, 2, 1, hsl((t / 5 + 240) % 360, 95, 60));
      R(17, 19, 2, 1, hsl((t / 5 + 240) % 360, 95, 60));
      break;
    case "shadow": {
      // Long black coat with glowing purple runes and a silver clasp.
      const coat = "#1a1426";
      const glow = Math.sin(t / 260) > 0 ? "#b06bff" : "#8a3ffc";
      torso(coat);
      armsLong(coat, "#2a2236");
      R(6, 15, 12, 1, "#110d1a");
      px(6, 14, "#110d1a");
      px(17, 14, "#110d1a");
      R(7, 23, 3, 4, coat);
      R(14, 23, 3, 4, coat);
      R(5, 22, 2, 1, glow);
      R(17, 22, 2, 1, glow);
      if (!back) {
        R(11, 16, 2, 7, "#2a2236");
        R(10, 17, 4, 1, "#c3cad3");
        [
          [9, 18],
          [9, 19],
          [8, 20],
          [14, 18],
          [14, 19],
          [15, 20],
        ].forEach(([x, y]) => px(x, y, glow));
      } else {
        R(11, 18, 2, 3, glow);
        px(10, 19, glow);
        px(13, 19, glow);
      }
      break;
    }
    case "ember": {
      // Red lacquered samurai armour with big shoulder guards.
      const red = "#a3202a";
      const black = "#1d1d22";
      torso(red);
      armsLong("#7a141d", "#2a1b18");
      [17, 19, 21].forEach((y) => R(7, y, 10, 1, black));
      [8, 15].forEach((x) => [18, 20].forEach((y) => px(x, y, "#ffd76a")));
      R(3, 15, 4, 5, red);
      R(17, 15, 4, 5, red);
      [16, 18].forEach((y) => {
        R(3, y, 4, 1, black);
        R(17, y, 4, 1, black);
      });
      R(3, 19, 4, 1, "#ffd76a");
      R(17, 19, 4, 1, "#ffd76a");
      R(6, 23, 12, 3, red);
      [8, 11, 14].forEach((x) => R(x, 23, 1, 3, black));
      R(6, 25, 12, 1, "#ffd76a");
      if (!back) {
        R(10, 16, 4, 1, "#ffd76a");
        R(11, 20, 2, 1, "#ffd76a");
      }
      break;
    }
    case "cyber": {
      // White tech suit; a bright pulse runs along the neon circuit.
      const k = "#20232b";
      const cy = "#00e5ff";
      torso("#eef2f7");
      armsLong("#eef2f7", k);
      R(7, 16, 10, 1, k);
      R(7, 18, 2, 5, k);
      R(15, 18, 2, 5, k);
      R(5, 19, 2, 1, cy);
      R(17, 19, 2, 1, cy);
      if (!back) {
        R(9, 21, 6, 1, cy);
        R(9, 18, 1, 3, cy);
        R(14, 18, 1, 3, cy);
        px(9 + (Math.floor(t / 110) % 6), 21, "#ffffff");
        R(11, 17, 2, 2, cy);
        px(11, 17, "#ffffff");
      } else {
        R(9, 17, 6, 6, k);
        R(11, 17, 2, 6, cy);
      }
      break;
    }
    case "astro":
      torso("#e9edf2");
      armsLong("#e9edf2", "#c3cad3");
      R(7, 23, 10, 1, "#c3cad3");
      if (!back) {
        R(9, 18, 6, 4, "#c3cad3");
        px(10, 19, "#e24b4a");
        px(12, 19, "#3d7fd6");
        px(10, 20, gold);
        px(13, 20, "#3fae8f");
        px(8, 17, "#3d7fd6");
      } else {
        R(8, 16, 8, 6, "#c3cad3");
        R(9, 17, 2, 4, "#8a94a0");
        R(13, 17, 2, 4, "#8a94a0");
      }
      break;
    default:
      extra("top", L.top)?.draw?.(P);
  }
  // Pose: read each arm's colours from what the top drew (works for any top),
  // then take the arm away. The posed arms are drawn at the very end.
  type ArmPaint = { sleeve: string; hand: string; cuff: string | null; short: boolean };
  const at = (g: Grid, x: number, y: number) => g[y + OY]?.[x + OX] ?? null;
  const topDrew = touched;
  touched = null;
  const drawnByTop = (x: number, y: number) =>
    topDrew?.[y + OY]?.[x + OX] ? at(grid, x, y) : null;
  const armPaint = (cols: number[]): ArmPaint => {
    const count = new Map<string, number>();
    let bare = 0;
    cols.forEach((x) => {
      for (let y = 16; y <= 22; y++) {
        const c = drawnByTop(x, y);
        if (!c) continue;
        if (c === sk || c === skS) bare += y >= 20 ? 1 : 0;
        else count.set(c, (count.get(c) ?? 0) + 1);
      }
    });
    let sleeve = sk;
    let best = 0;
    count.forEach((n, c) => {
      if (n > best) {
        best = n;
        sleeve = c;
      }
    });
    const h = drawnByTop(cols[0], 23);
    const hand = !h || h === sleeve || h === skS ? sk : h;
    const c22 = drawnByTop(cols[0], 22);
    const cuff = c22 && c22 !== sleeve && c22 !== sk && c22 !== skS && c22 !== hand ? c22 : null;
    return { sleeve, hand, cuff, short: bare >= cols.length * 2 };
  };
  const paintL = ps?.l ? armPaint([5, 6]) : null;
  const paintR = ps?.r ? armPaint([17]) : null;
  const clearArm = (x0: number, x1: number) => {
    if (!preTop || !topDrew) return;
    for (let y = 18 + OY; y <= 23 + OY; y++)
      for (let x = x0 + OX; x <= x1 + OX; x++) if (topDrew[y][x]) grid[y][x] = preTop[y][x];
  };
  if (paintL) clearArm(2, 6);
  if (paintR) clearArm(17, 21);
  // Seen from behind, anything drawn after this (head, hair, bags) hides the arms.
  const afterTop = ps && back ? grid.map((row) => row.slice()) : null;

  if (back) {
    backItems();
    xBack?.behind?.(P);
  } else {
    xBack?.front?.(P);
    if (L.back === "backpack") {
      R(8, 16, 1, 7, "#9a5228");
      R(15, 16, 1, 7, "#9a5228");
    }
    if (L.back === "guitar") for (let i = 0; i < 8; i++) px(8 + i, 16 + i, "#3a2a25");
    if (L.back === "cape") {
      px(8, 16, gold);
      px(15, 16, gold);
    }
  }

  // Head
  R(7, 2, 10, 1, sk);
  R(6, 3, 12, 1, sk);
  R(5, 4, 14, 10, sk);
  R(6, 14, 12, 1, sk);
  R(7, 15, 10, 1, sk);
  R(18, 5, 1, 8, skS);
  R(7, 15, 10, 1, skS);
  R(4, 9, 1, 3, sk);
  R(19, 9, 1, 3, skS);

  if (!back) {
    const ec = L.eyeColor;
    const d = "#2a1b18";
    const eyeRound = (x: number) => {
      R(x, 9, 2, 3, ec);
      R(x, 9, 2, 1, d);
      px(x, 10, "#fff");
    };
    const eyeArc = (x: number) => {
      px(x - 1, 10, d);
      px(x, 9, d);
      px(x + 1, 9, d);
      px(x + 2, 10, d);
    };
    const a = 7 + fx;
    const b = 15 + fx;
    const xEyes = extra("eyes", L.eyes);
    const pe = ps?.eyes;
    if (pe === "arc") {
      eyeArc(a);
      eyeArc(b);
    } else if (pe === "sad") {
      // Shut, with the outer corners drooping.
      R(a, 10, 2, 1, d);
      px(a - 1, 11, d);
      R(b, 10, 2, 1, d);
      px(b + 2, 11, d);
    } else if (pe === "heart" || pe === "heartSmall") {
      const c = "#ff4f9a";
      // The far eye in the 3/4 view stays on the face.
      [a - 1, Math.min(b - 1, 14)].forEach((x) => {
        if (pe === "heart") {
          px(x + 1, 8, c);
          px(x + 3, 8, c);
          R(x, 9, 5, 1, c);
          R(x + 1, 10, 3, 1, c);
          px(x + 2, 11, c);
          px(x + 1, 9, "#ffd1e8");
        } else {
          px(x + 1, 9, c);
          px(x + 3, 9, c);
          R(x + 1, 10, 3, 1, c);
          px(x + 2, 11, c);
        }
      });
    } else if (pe === "shut") {
      // Asleep: closed, curved down like a contented smile.
      [a, b].forEach((x) => {
        px(x - 1, 9, d);
        R(x, 10, 2, 1, d);
        px(x + 2, 9, d);
      });
    } else if (pe === "up") {
      // Glancing up and to the side.
      [a - 1, b - 1].forEach((x) => {
        R(x, 8, 2, 3, ec);
        R(x, 8, 2, 1, d);
        px(x + 1, 9, "#fff");
      });
    } else if (blink && L.eyes !== "happy" && !xEyes?.noBlink) {
      R(a, 10, 2, 1, d);
      R(b, 10, 2, 1, d);
    } else if (L.eyes === "round") {
      eyeRound(a);
      eyeRound(b);
    } else if (L.eyes === "happy") {
      eyeArc(a);
      eyeArc(b);
    } else if (L.eyes === "sleepy") {
      R(a - 1, 10, 4, 1, d);
      R(b - 1, 10, 4, 1, d);
    } else if (L.eyes === "wink") {
      eyeRound(a);
      eyeArc(b);
    } else if (L.eyes === "sparkle") {
      [a - 1, b - 1].forEach((x) => {
        R(x, 8, 4, 4, ec);
        R(x, 8, 4, 1, d);
        px(x, 9, "#fff");
        px(x + 2, 10, "#fff");
        px(x + 1, 11, shade(ec, 0.4));
        if (Math.sin(t / 200 + x) > 0.3) px(x + 3, 8, "#fff6c8");
      });
    } else if (xEyes?.draw) {
      xEyes.draw(P);
    } else if (L.eyes === "cat") {
      [a, b].forEach((x) => {
        R(x - 1, 9, 4, 3, gold);
        R(x, 9, 2, 3, "#3a8a4a");
        R(x, 9, 1, 3, d);
        R(x - 1, 9, 4, 1, d);
        px(x + 1, 10, "#fff");
      });
    }
    R(6 + fx, 12, 2, 1, "#f4a3a3");
    if (!fx) R(16, 12, 2, 1, "#f4a3a3");
    const m = "#8a3b33";
    const mx = 10 + fx; // left end of a 4-wide mouth
    switch (ps?.mouth) {
      case "smile":
        px(mx, 13, m);
        R(mx + 1, 14, 2, 1, m);
        px(mx + 3, 13, m);
        break;
      case "grin":
        R(mx, 13, 4, 1, m);
        R(mx + 1, 14, 2, 1, m);
        break;
      case "laugh":
        R(mx, 13, 4, 2, m);
        R(mx + 1, 14, 2, 1, "#e2574c");
        break;
      case "open":
        R(mx + 1, 13, 2, 2, m);
        break;
      case "frown":
        px(mx, 14, m);
        R(mx + 1, 13, 2, 1, m);
        px(mx + 3, 14, m);
        break;
      case "hmm":
        R(mx, 13, 2, 1, m);
        break;
      default:
        R(11 + fx, 13, 2, 1, m);
    }
  }

  const hs = L.hair;
  const hairTops = () => {
    if (hs === "spiky") {
      R(8, -1, 2, 2, hc);
      R(11, -2, 2, 3, hc);
      R(14, -1, 2, 2, hc);
      R(6, 0, 2, 2, hc);
      R(16, 0, 2, 2, hc);
      px(11, -2, hH);
    }
    if (hs === "curly") {
      [5, 8, 11, 14, 17].forEach((x) => R(x - 1, 0, 3, 2, hc));
      R(4, 3, 2, 9, hc);
      R(18, 3, 2, 9, hc);
    }
    if (hs === "mohawk") {
      R(10, -3, 4, 9, hc);
      R(10, -3, 4, 1, hH);
      R(11, -2, 1, 6, hH);
    }
    if (hs === "bun") {
      R(8, -3, 8, 1, hc);
      R(7, -2, 10, 3, hc);
      px(9, -2, hH);
      px(10, -2, hH);
      R(8, 0, 8, 1, "#e24b4a");
    }
  };
  if (hairHidden) {
    // A head item (e.g. a hijab) covers all the hair.
  } else if (back) {
    if (hs === "mohawk") {
      R(5, 3, 14, 11, hS);
      hairTops();
    } else {
      cap();
      hairTops();
      R(5, 4, 14, 10, hc);
      R(5, 13, 14, 1, hS);
      R(6, 6, 1, 6, hH);
      if (hs !== "bun") R(11, 4, 1, 8, hS);
    }
    backHair();
    xHair?.behind?.(P);
    xHair?.draw?.(P);
  } else {
    xHair?.draw?.(P);
    if (hs === "short" || hs === "bun" || hs === "twintails") {
      cap();
      R(5, 6, 4, 2, hc);
      R(9, 6, 2, 1, hc);
      R(11, 6, 4, 2, hc);
      R(15, 6, 4, 1, hc);
      R(17, 7, 2, 3, hc);
      R(5, 8, 1, 2, hc);
    }
    if (hs === "spiky") {
      cap();
      R(5, 6, 3, 2, hc);
      px(8, 6, hc);
      R(10, 6, 3, 2, hc);
      px(13, 6, hc);
      R(15, 6, 3, 2, hc);
      R(18, 6, 1, 4, hc);
      R(5, 8, 1, 2, hc);
    }
    if (hs === "long") {
      cap();
      R(5, 6, 14, 2, hc);
      R(4, 6, 2, 13, hc);
      R(18, 6, 2, 13, hc);
      R(4, 6, 1, 13, hS);
      R(19, 6, 1, 13, hS);
      R(5, 6, 14, 1, hH);
    }
    if (hs === "curly") {
      cap();
      R(6, 6, 2, 2, hc);
      R(9, 6, 2, 1, hc);
      R(12, 6, 2, 2, hc);
      R(15, 6, 2, 1, hc);
    }
    if (hs === "ponytail") {
      cap();
      R(5, 6, 9, 2, hc);
      R(5, 8, 2, 1, hc);
      R(17, 6, 2, 3, hc);
    }
    if (hs === "mohawk") {
      R(5, 4, 14, 2, hS);
      R(5, 6, 2, 3, hS);
      R(17, 6, 2, 3, hS);
    }
    hairTops();
    // Side-view patch for the built-in styles (new styles draw their own side).
    if (fx && !xHair) R(5, 4, 3, 9, hc);
  }

  const H = L.head;
  if (H === "cap") {
    const cc = "#e2574c";
    R(6, 0, 12, 2, cc);
    R(5, 2, 14, 4, cc);
    R(7, 1, 3, 1, shade(cc, 0.3));
    if (!back) {
      R(4 + fx, 6, 16, 1, shade(cc, -0.3));
      px(11 + fx, 3, "#fff");
      px(12 + fx, 3, "#fff");
    } else R(9, 5, 6, 1, shade(cc, -0.3));
  }
  if (H === "beanie") {
    R(6, -1, 12, 2, "#3d7fd6");
    R(5, 1, 14, 5, "#3d7fd6");
    R(5, 5, 14, 1, "#2f63ad");
    for (let x = 6; x < 18; x += 2) R(x, 2, 1, 3, "#5b93e6");
    R(10, -3, 4, 2, "#f4f1ea");
  }
  if (H === "phones") {
    R(6, -1, 12, 1, "#2f2f38");
    R(5, 0, 1, 3, "#2f2f38");
    R(18, 0, 1, 3, "#2f2f38");
    R(3, 7, 3, 5, "#2f2f38");
    R(18, 7, 3, 5, "#2f2f38");
    R(4, 8, 1, 3, "#e2574c");
    R(19, 8, 1, 3, "#e2574c");
  }
  if (H === "catears") {
    const ce = "#2a2a30";
    px(6, -2, ce);
    R(5, -1, 3, 1, ce);
    R(5, 0, 4, 2, ce);
    px(17, -2, ce);
    R(16, -1, 3, 1, ce);
    R(15, 0, 4, 2, ce);
    if (!back) {
      px(6, -1, "#f4a3a3");
      px(6, 0, "#f4a3a3");
      px(17, -1, "#f4a3a3");
      px(17, 0, "#f4a3a3");
    }
  }
  if (H === "flowers") {
    (
      [
        [5, "#ff9ec4"],
        [8, "#ffd84d"],
        [11, "#ffffff"],
        [14, "#b8a2ff"],
        [17, "#ff9ec4"],
      ] as const
    ).forEach(([x, c]) => {
      R(x, 1, 2, 2, c);
      px(x, 1, "#f4a02a");
    });
    R(5, 3, 14, 1, "#4f8f3a");
  }
  if (H === "crown") {
    R(7, -1, 10, 3, gold);
    [7, 11, 12, 16].forEach((x) => R(x, -3, 1, 2, gold));
    R(7, 1, 10, 1, "#c99a1e");
    px(9, 0, "#e24b4a");
    px(12, 0, "#3d7fd6");
    px(14, 0, "#3fae8f");
    px(8, -1, "#fff6c8");
  }
  if (H === "shadow") {
    // A deep hood that hides the hair and frames the face.
    const hood = "#1a1426";
    const hoodS = "#0e0a16";
    R(6, -1, 12, 1, hood);
    R(5, 0, 14, 5, hood);
    R(4, 3, 2, 12, hood);
    R(18, 3, 2, 12, hood);
    R(4, 4, 1, 11, hoodS);
    R(19, 4, 1, 11, hoodS);
    R(11, -2, 2, 1, hood);
    if (!back) {
      R(6, 5, 12, 2, hoodS);
      R(6, 4, 12, 1, "#3b1f5e");
    } else R(5, 0, 14, 15, hood);
  }
  if (H === "ember") {
    // Kabuto helmet with a gold crescent crest.
    const m = "#1d1d22";
    R(6, 0, 12, 1, m);
    R(5, 1, 14, 4, m);
    R(5, 1, 14, 1, "#3a3a44");
    R(3, 4, 4, 3, m);
    R(17, 4, 4, 3, m);
    R(3, 6, 4, 1, "#a3202a");
    R(17, 6, 4, 1, "#a3202a");
    R(5, 5, 14, 1, "#ffd76a");
    for (let i = 0; i < 5; i++) {
      px(10 - i, -1 - i, "#ffd76a");
      px(13 + i, -1 - i, "#ffd76a");
      if (i < 4) {
        px(10 - i, -i, "#d9a22a");
        px(13 + i, -i, "#d9a22a");
      }
    }
    R(11, -1, 2, 2, "#e24b4a");
    px(11, -1, "#ffb3b3");
    if (back) {
      R(4, 5, 16, 5, m);
      R(4, 7, 16, 1, "#a3202a");
    }
  }
  if (H === "cyber") {
    // Headset with ear pieces and a blinking antenna.
    R(6, 1, 12, 1, "#20232b");
    R(3, 7, 2, 5, "#eef2f7");
    R(19, 7, 2, 5, "#eef2f7");
    px(3, 9, "#00e5ff");
    px(20, 9, "#00e5ff");
    R(20, 1, 1, 6, "#c3cad3");
    px(20, 0, Math.floor(t / 400) % 2 ? "#ff3d6e" : "#00e5ff");
  }
  if (H === "wizard") {
    R(4, 3, 16, 1, "#3a2480");
    R(6, 1, 12, 2, "#4b2fa0");
    R(8, -1, 8, 2, "#4b2fa0");
    R(9, -3, 6, 2, "#5b3bb8");
    R(10, -5, 4, 2, "#5b3bb8");
    R(6, 2, 12, 1, gold);
    px(10, 0, gold);
    px(13, -2, "#fff6c8");
  }

  xHead?.draw?.(P);

  const F = L.face;
  if (!back) {
    if (F === "glasses") {
      const gl = "#2a1b18";
      [6 + fx, 14 + fx].forEach((x) => {
        R(x, 8, 4, 1, gl);
        R(x, 12, 4, 1, gl);
        R(x, 9, 1, 3, gl);
        R(x + 3, 9, 1, 3, gl);
      });
      R(10 + fx, 9, 4, 1, gl);
    }
    if (F === "shades") {
      R(6 + fx, 9, 4, 3, "#1d1d2b");
      R(14 + fx, 9, 4, 3, "#1d1d2b");
      R(10 + fx, 9, 4, 1, "#1d1d2b");
      px(7 + fx, 9, "#5a5a7a");
    }
    if (F === "hearts") {
      [5 + fx, 14 + fx].forEach((x) => {
        const c = "#ff4f9a";
        px(x + 1, 8, c);
        px(x + 3, 8, c);
        R(x, 9, 5, 1, c);
        R(x + 1, 10, 3, 1, c);
        px(x + 2, 11, c);
        px(x + 1, 9, "#ffd1e8");
      });
    }
    if (F === "shadow") {
      const g = Math.sin(t / 220) > 0 ? "#e2c4ff" : "#b06bff";
      [7 + fx, 15 + fx].forEach((x) => {
        R(x, 9, 2, 2, "#8a3ffc");
        px(x, 9, g);
      });
    }
    if (F === "ember") {
      R(6 + fx, 12, 12, 3, "#7a141d");
      R(6 + fx, 12, 12, 1, "#a3202a");
      [9, 11, 13].forEach((x) => px(x + fx, 13, "#e9e2d0"));
      R(10 + fx, 14, 4, 1, "#1d1d22");
    }
    if (F === "cyber") {
      R(5, 8, 14, 4, "#0b0f1a");
      R(5, 8, 14, 1, "#20232b");
      R(5, 8 + (Math.floor(t / 110) % 4), 14, 1, "#00e5ff");
      px(6 + (Math.floor(t / 70) % 12), 9, "#ffffff");
      R(4, 9, 1, 2, "#c3cad3");
      R(19, 9, 1, 2, "#c3cad3");
    }
    if (F === "visor") {
      R(5, 8, 14, 4, "#1aa9c9");
      R(5, 8, 14, 1, "#0f6f86");
      R(5, 9 + (Math.floor(t / 140) % 3), 14, 1, "#c8fbff");
    }
    extra("face", F)?.draw?.(P);
  } else if (F === "visor") R(5, 9, 14, 2, "#0f6f86");
  else if (F === "cyber") R(5, 9, 14, 1, "#20232b");

  if (ps && pose) {
    // Posed arms: 2×2 blocks from the shoulder to the elbow to the hand.
    const base = grid.map((row) => row.slice());
    const put = (x: number, y: number, c: string) => {
      const X = x + OX;
      const Y = y + OY;
      if (X < 0 || Y < 0 || X >= GRID_W || Y >= GRID_H) return;
      const under = base[Y][X];
      if (afterTop) {
        // From behind: the body, head, hair and back items cover the arm.
        if ((x >= 7 && x <= 16 && y >= 16) || under !== afterTop[Y][X]) return;
        grid[Y][X] = c;
      } else if (c === sk && (under === sk || under === skS))
        // A bare hand over the face: a shade darker so it still reads.
        grid[Y][X] = shade(sk, -0.22);
      else if (under === c && !(y <= 17 && (x <= 6 || x >= 17) && y >= 16))
        // An arm over a shirt, hood or cape of the same colour (not at the
        // shoulder it grows from): a fold shade, lighter on very dark cloth.
        grid[Y][X] = shade(c, isDark(c) ? 0.2 : -0.22);
      else grid[Y][X] = c;
    };
    const block = ([x, y]: Pt, c: string) => {
      put(x, y, c);
      put(x + 1, y, c);
      put(x, y + 1, c);
      put(x + 1, y + 1, c);
    };
    const path = (a: Pt, b: Pt): Pt[] => {
      const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) || 1;
      return Array.from(
        { length: n + 1 },
        (_, i): Pt => [
          Math.round(a[0] + ((b[0] - a[0]) * i) / n),
          Math.round(a[1] + ((b[1] - a[1]) * i) / n),
        ],
      );
    };
    const drawArm = (shoulder: Pt, arm: ArmPose, paint: ArmPaint) => {
      const fore = path(arm.el, arm.hd).slice(1, -1);
      const all = [...path(shoulder, arm.el), ...fore];
      all.forEach((pt, i) => {
        // Short sleeves stop near the shoulder, like armsShort.
        let c = paint.short && i >= 3 ? sk : paint.sleeve;
        if (paint.cuff && !paint.short && fore.length && i === all.length - 1) c = paint.cuff;
        block(pt, c);
      });
      block(arm.hd, paint.hand);
    };
    if (ps.l && paintL) drawArm([5, 16], ps.l, paintL);
    if (ps.r && paintR) drawArm([17, 16], ps.r, paintR);
    if (ps.tears && !back)
      [8 + fx, 15 + fx].forEach((x, i) => {
        R(x, 11, 1, 2, "#a8dcf5");
        px(x, 13 + (Math.floor(pose.t / 90 + i * 3) % 6), "#7cc8ef");
      });
  }

  return grid;
}

/** Paints a colour grid onto a canvas with an automatic dark outline. */
export function paintGrid(grid: Grid, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  ctx.clearRect(0, 0, w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = grid[y][x];
      if (v) {
        ctx.fillStyle = v;
        ctx.fillRect(x, y, 1, 1);
      } else if (
        (y > 0 && grid[y - 1][x]) ||
        (y < h - 1 && grid[y + 1][x]) ||
        (x > 0 && grid[y][x - 1]) ||
        (x < w - 1 && grid[y][x + 1])
      ) {
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(x, y, 1, 1);
      }
    }
}

export function buildPet(type: string, t: number): Grid {
  const grid: Grid = Array.from({ length: 14 }, () => Array<string | null>(14).fill(null));
  const Q = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++)
        if (y + j >= 0 && y + j < 14 && x + i >= 0 && x + i < 14) grid[y + j][x + i] = c;
  };
  extra("pet", type)?.pet?.(Q, t);
  if (type === "chick") {
    Q(3, 6, 7, 5, "#ffd84d");
    Q(4, 3, 5, 4, "#ffd84d");
    Q(7, 4, 1, 1, "#2a1b18");
    Q(9, 5, 2, 1, "#f28c28");
    Q(4, 8, 3, 1, "#f2c14e");
    Q(5, 11, 1, 2, "#f28c28");
    Q(8, 11, 1, 2, "#f28c28");
  }
  if (type === "cat") {
    Q(2, 7, 8, 4, "#9aa0a6");
    Q(3, 3, 6, 5, "#9aa0a6");
    Q(3, 2, 1, 1, "#9aa0a6");
    Q(8, 2, 1, 1, "#9aa0a6");
    Q(4, 5, 1, 1, "#2a1b18");
    Q(7, 5, 1, 1, "#2a1b18");
    Q(5, 6, 2, 1, "#f4a3a3");
    Q(10, 5 + (Math.sin(t / 300) > 0 ? 0 : 1), 1, 5, "#9aa0a6");
    Q(4, 8, 4, 2, "#c8ccd0");
  }
  if (type === "dragon") {
    const f = Math.sin(t / 150) > 0 ? 0 : 1;
    Q(3, 6, 6, 5, "#4fbf6a");
    Q(5, 2, 5, 5, "#4fbf6a");
    Q(5, 1, 1, 1, "#f2c14e");
    Q(9, 1, 1, 1, "#f2c14e");
    Q(8, 3, 1, 1, "#2a1b18");
    Q(4, 8, 4, 2, "#cdeec0");
    Q(1, 4 + f, 2, 3, "#a77de0");
    Q(0, 5 + f, 1, 2, "#a77de0");
    Q(1, 9, 2, 2, "#4fbf6a");
    if (t % 2400 < 350) {
      Q(10, 4, 2, 1, "#ff9b3d");
      Q(12, 4, 1, 1, "#ffd84d");
    }
  }
  if (type === "ghost") {
    Q(3, 2, 7, 9, "#f4f6ff");
    Q(2, 4, 9, 6, "#f4f6ff");
    Q(3, 11, 2, 1, "#f4f6ff");
    Q(6, 11, 2, 1, "#f4f6ff");
    Q(9, 11, 1, 1, "#f4f6ff");
    Q(5, 5, 1, 2, "#2a1b18");
    Q(8, 5, 1, 2, "#2a1b18");
    Q(6, 8, 2, 1, "#ff9ec4");
  }
  if (type === "wolf") {
    // Shadow wolf with glowing eyes and a purple flame tail.
    const f = Math.sin(t / 300) > 0 ? 0 : 1;
    Q(2, 6, 8, 4, "#2f2a3a");
    Q(3, 7, 6, 1, "#3d3650");
    Q(8, 3, 4, 4, "#2f2a3a");
    Q(8, 2, 1, 1, "#2f2a3a");
    Q(11, 2, 1, 1, "#2f2a3a");
    Q(12, 5, 2, 2, "#3d3650");
    Q(13, 5, 1, 1, "#111111");
    Q(10, 4, 1, 1, "#c78bff");
    [3, 5, 8, 9].forEach((x) => Q(x, 10, 1, 2, "#2f2a3a"));
    Q(0, 5 + f, 3, 2, "#8a3ffc");
    Q(1, 4 + f, 1, 1, "#c78bff");
  }
  if (type === "kitsune") {
    // White fox with three flickering fire tails.
    const flame = (i: number) => ["#ff5a3d", "#ff9b3d", "#ffd84d"][(Math.floor(t / 110) + i) % 3];
    Q(0, 3, 3, 2, flame(0));
    Q(0, 6, 3, 2, flame(1));
    Q(1, 9, 2, 2, flame(2));
    Q(3, 6, 6, 4, "#f4f1ea");
    Q(8, 3, 4, 4, "#f4f1ea");
    Q(8, 2, 1, 1, "#f4f1ea");
    Q(11, 2, 1, 1, "#f4f1ea");
    Q(8, 3, 1, 1, "#e2574c");
    Q(11, 3, 1, 1, "#e2574c");
    Q(12, 5, 2, 1, "#f4f1ea");
    Q(13, 5, 1, 1, "#2a1b18");
    Q(10, 4, 1, 1, "#e2574c");
    Q(9, 6, 2, 1, "#e2574c");
    [4, 7].forEach((x) => Q(x, 10, 1, 2, "#f4f1ea"));
  }
  if (type === "drone") {
    // Little robot orb with a moving eye and a blinking antenna.
    Q(5, 3, 4, 1, "#eef2f7");
    Q(4, 4, 6, 6, "#eef2f7");
    Q(5, 10, 4, 1, "#c3cad3");
    Q(5, 6, 4, 2, "#20232b");
    Q(5 + (Math.floor(t / 500) % 3), 6, 1, 2, "#00e5ff");
    Q(7, 1, 1, 2, "#c3cad3");
    Q(7, 0, 1, 1, Math.floor(t / 400) % 2 ? "#ff3d6e" : "#00e5ff");
    Q(3, 6, 1, 2, "#00e5ff");
    Q(10, 6, 1, 2, "#00e5ff");
  }
  return grid;
}

function star(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  col: string,
  a: number,
) {
  c.globalAlpha = a;
  c.fillStyle = col;
  c.fillRect(x, y - s, s, s * 3);
  c.fillRect(x - s, y, s * 3, s);
  c.globalAlpha = 1;
}

function heart(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  col: string,
  a: number,
) {
  c.globalAlpha = a;
  c.fillStyle = col;
  [
    [0, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [1, 2],
  ].forEach(([i, j]) => c.fillRect(x + i * s, y + j * s, s, s));
  c.globalAlpha = 1;
}

/** Calls draw for each of n points circling the feet; front/back by depth. */
function orbit(
  n: number,
  t: number,
  speed: number,
  front: boolean,
  draw: (x: number, y: number, i: number) => void,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
) {
  for (let i = 0; i < n; i++) {
    const a = t / speed + (i * Math.PI * 2) / n;
    if (Math.sin(a) >= 0 !== front) continue;
    draw(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, i);
  }
}
function glow(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rgb: string,
  a: number,
) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
function diamond(c: CanvasRenderingContext2D, x: number, y: number, s: number, col: string) {
  c.fillStyle = col;
  c.fillRect(x - s / 2, y - 2 * s, s, 4 * s);
  c.fillRect(x - 1.5 * s, y - s, 3 * s, 2 * s);
  c.fillStyle = "rgba(255,255,255,.8)";
  c.fillRect(x - s / 2, y - 1.5 * s, s / 2, s);
}

/** Admin auras. front=false draws the parts behind the avatar. */
function adminAura(
  c: CanvasRenderingContext2D,
  look: AvatarLook,
  ox: number,
  oy: number,
  s: number,
  t: number,
  front: boolean,
  seated = false,
) {
  const cx = ox + 14 * s;
  const feet = oy + (OY + 31) * s;
  const mid = oy + 20 * s;
  if (look.effect === "shadow") {
    if (!front) {
      glow(c, cx, mid, 18 * s, "138,63,252", 0.22 + Math.sin(t / 500) * 0.06);
      // Ground shadow only when standing (it would cover the chair).
      if (!seated) {
        c.globalAlpha = 0.45;
        c.fillStyle = "#1a0f2e";
        c.beginPath();
        c.ellipse(cx, feet, 12 * s, 3.4 * s, 0, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1;
      }
    }
    orbit(
      3,
      t,
      900,
      front,
      (x, y, i) => diamond(c, x, y - (10 + i * 3) * s, s, i % 2 ? "#8a3ffc" : "#b06bff"),
      cx,
      mid,
      13 * s,
      3 * s,
    );
    if (front)
      for (let i = 0; i < 7; i++) {
        const ph = (t / 2600 + i / 7) % 1;
        c.globalAlpha = (1 - ph) * 0.35;
        c.fillStyle = i % 2 ? "#3b1f5e" : "#1a1426";
        const r = (2 + ph * 3) * s;
        c.beginPath();
        c.arc(
          ox + (4 + ((i * 41) % 20)) * s + Math.sin(ph * 6 + i) * 2 * s,
          feet - ph * 30 * s,
          r,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    c.globalAlpha = 1;
  }
  if (look.effect === "ember") {
    if (!front) glow(c, cx, mid, 18 * s, "255,120,40", 0.22 + Math.sin(t / 300) * 0.06);
    orbit(
      12,
      t,
      1400,
      front,
      (x, y, i) => {
        const h = (2 + ((Math.floor(t / 90) + i) % 3)) * s;
        c.fillStyle = "#ff5a3d";
        c.fillRect(x - s, y - h, 2 * s, h);
        c.fillStyle = "#ffd84d";
        c.fillRect(x - s / 2, y - h / 2, s, h / 2);
      },
      cx,
      feet,
      12 * s,
      3.2 * s,
    );
    if (front)
      for (let i = 0; i < 9; i++) {
        const ph = (t / 1800 + i / 9) % 1;
        c.globalAlpha = 1 - ph;
        c.fillStyle = i % 3 ? "#ff9b3d" : "#ffd84d";
        c.fillRect(
          ox + (3 + ((i * 37) % 22)) * s + Math.sin(ph * 8 + i) * 2 * s,
          feet - ph * 36 * s,
          s,
          s,
        );
      }
    c.globalAlpha = 1;
  }
  if (look.effect === "cyber") {
    if (!front) {
      glow(c, cx, mid, 17 * s, "0,229,255", 0.16 + Math.sin(t / 400) * 0.05);
      if (!seated) {
        c.strokeStyle = "rgba(0,229,255,.55)";
        c.lineWidth = s / 2;
        c.beginPath();
        c.ellipse(cx, feet, 12 * s, 3.4 * s, 0, 0, Math.PI * 2);
        c.stroke();
      }
    }
    // Hologram halo above the head.
    orbit(
      10,
      t,
      700,
      front,
      (x, y) => {
        c.fillStyle = "#8ff6ff";
        c.fillRect(x - s / 2, y - s / 2, s, s);
      },
      cx,
      oy + (OY - 6) * s,
      7 * s,
      1.8 * s,
    );
    // Two drones circling.
    orbit(
      2,
      t,
      1200,
      front,
      (x, y, i) => {
        const yy = y - (8 + i * 6) * s;
        c.fillStyle = "#c3cad3";
        c.fillRect(x - 1.5 * s, yy - s, 3 * s, 2 * s);
        c.fillStyle = Math.floor(t / 300 + i) % 2 ? "#ff3d6e" : "#00e5ff";
        c.fillRect(x - s / 2, yy - s / 2, s, s);
      },
      cx,
      mid,
      14 * s,
      3 * s,
    );
    if (front)
      for (let i = 0; i < 8; i++) {
        const ph = (t / 2000 + i / 8) % 1;
        c.globalAlpha = (1 - ph) * 0.9;
        c.fillStyle = "#00e5ff";
        c.fillRect(ox + (3 + ((i * 43) % 22)) * s, feet - ph * 34 * s, s, (i % 2 ? 1 : 2) * s);
      }
    c.globalAlpha = 1;
  }
}

const WORN: ItemCategory[] = [
  "hair",
  "eyes",
  "top",
  "bottom",
  "shoes",
  "head",
  "face",
  "back",
  "effect",
];
/** Runs the screen effects of every new item being worn. */
function extraFx(
  c: CanvasRenderingContext2D,
  look: AvatarLook,
  ox: number,
  oy: number,
  s: number,
  t: number,
  front: boolean,
  seated: boolean,
  motion?: AvatarMotion,
) {
  // Hair effects (flames, sparkles) don't show when a hijab covers the hair.
  const hairHidden = Boolean(extra("head", look.head)?.hidesHair);
  const items = WORN.filter((cat) => !(cat === "hair" && hairHidden))
    .map((cat) => extra(cat, look[cat]))
    .filter((item): item is ExtraItem => Boolean(front ? item?.fxFront : item?.fxBehind));
  if (!items.length) return;
  const k: FxKit = {
    X: (gx) => ox + (gx + OX) * s,
    Y: (gy) => oy + (gy + OY) * s,
    s,
    t,
    seated,
    moving: motion?.moving,
    dir: motion?.dir,
    star: (x, y, size, col, a) => star(c, x, y, size, col, a),
    heart: (x, y, size, col, a) => heart(c, x, y, size, col, a),
    glow: (x, y, r, rgb, a) => glow(c, x, y, r, rgb, a),
    orbit: (n, speed, draw, cx, cy, rx, ry) => orbit(n, t, speed, front, draw, cx, cy, rx, ry),
    particles: (n, ms, draw) => {
      for (let i = 0; i < n; i++) draw(i, (t / ms + i / n) % 1);
    },
  };
  items.forEach((item) => {
    c.save();
    (front ? item.fxFront : item.fxBehind)?.(c, k);
    c.restore();
  });
}

/** How the avatar is moving, for effects that react to it (all optional). */
export type AvatarMotion = { moving?: boolean; dir?: Facing };

/**
 * Glows drawn behind the avatar. (ox, oy) is the sprite's top-left on screen.
 * seated: sitting or in bed, so ground rings and foot effects are left out.
 */
export function drawEffectsBehind(
  c: CanvasRenderingContext2D,
  look: AvatarLook,
  ox: number,
  oy: number,
  s: number,
  t: number,
  seated = false,
  motion?: AvatarMotion,
) {
  if (look.head === "halo") {
    c.globalAlpha = (0.55 + Math.sin(t / 300) * 0.25) * 0.4;
    c.fillStyle = "#ffe58a";
    c.beginPath();
    c.ellipse(ox + 14 * s, oy + (OY - 4) * s, 7.5 * s, 2.6 * s, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
  }
  adminAura(c, look, ox, oy, s, t, false, seated);
  extraFx(c, look, ox, oy, s, t, false, seated, motion);
  if (look.effect === "sparkle" && !seated) {
    c.globalAlpha = 0.2;
    c.fillStyle = "#f2c14e";
    c.beginPath();
    c.ellipse(ox + 14 * s, oy + (OY + 31) * s, 10 * s, 2.5 * s, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
  }
}

/** Halo, sparkles, flames and particle effects drawn in front of the avatar. */
export function drawEffectsFront(
  c: CanvasRenderingContext2D,
  look: AvatarLook,
  ox: number,
  oy: number,
  s: number,
  t: number,
  seated = false,
  motion?: AvatarMotion,
) {
  if (look.head === "halo") {
    c.strokeStyle = "#f2c14e";
    c.lineWidth = s;
    c.beginPath();
    c.ellipse(ox + 14 * s, oy + (OY - 4) * s, 6 * s, 1.6 * s, 0, 0, Math.PI * 2);
    c.stroke();
  }
  if (look.head === "crown") {
    const a = Math.sin(t / 220);
    if (a > 0.4) star(c, ox + (OX + 6) * s, oy + (OY - 4) * s, Math.max(1, s / 2), "#fff6c8", a);
  }
  if (look.shoes === "rocket" && !seated) {
    const flicker = Math.floor(t / 90) % 2;
    [OX + 7, OX + 13].forEach((x) => {
      c.fillStyle = "#ff9b3d";
      c.fillRect(ox + (x + 1) * s, oy + (OY + 31) * s, 2 * s, (2 + flicker) * s);
      c.fillStyle = "#ffd84d";
      c.fillRect(ox + (x + 1) * s, oy + (OY + 31) * s, 2 * s, s);
    });
  }
  const particles = (n: number, fn: (i: number, phase: number) => void) => {
    for (let i = 0; i < n; i++) fn(i, (t / 2200 + i / n) % 1);
  };
  if (look.effect === "sparkle")
    particles(8, (i, ph) =>
      star(
        c,
        ox + (4 + ((i * 53) % 22)) * s,
        oy + (36 - ph * 36) * s,
        Math.max(1, s / 2),
        i % 2 ? "#f2c14e" : "#fff6c8",
        1 - ph,
      ),
    );
  if (look.effect === "hearts")
    particles(6, (i, ph) =>
      heart(
        c,
        ox + (3 + ((i * 41) % 22)) * s,
        oy + (34 - ph * 34) * s,
        Math.max(1, Math.round(s / 2)),
        i % 2 ? "#ff4f9a" : "#ff9ec4",
        1 - ph,
      ),
    );
  if (look.effect === "sakura")
    particles(8, (i, ph) => {
      const x = ox + (((i * 37) % 28) + Math.sin(ph * 6 + i) * 3) * s;
      const y = oy + (ph * 40 - 2) * s;
      c.fillStyle = "#ffb7d0";
      c.fillRect(x, y, 2 * s, s);
      c.fillStyle = "#ffe0ec";
      c.fillRect(x, y, s, s);
    });
  adminAura(c, look, ox, oy, s, t, true, seated);
  extraFx(c, look, ox, oy, s, t, true, seated, motion);
  if (look.effect === "snow")
    particles(9, (i, ph) => {
      c.fillStyle = "#ffffff";
      c.fillRect(
        ox + (((i * 31) % 28) + Math.sin(ph * 5 + i) * 2) * s,
        oy + (ph * 40 - 2) * s,
        s,
        s,
      );
    });
}
