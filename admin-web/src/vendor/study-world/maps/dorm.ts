import { TILE, createKit, type SeatKind, type WorldMap } from "./kit";

/**
 * Dorm rooms: each player's own room in RenCity, decorated with furniture.
 * The furniture list and room themes live here (plain data, also used by the
 * admin website); the drawing of each piece is in kit.ts (paintThing,
 * t === "furniture", by item id). The server keeps what's placed where
 * (migration 202610130003) and checks sizes, limits and ownership.
 */

export type DormTier = "free" | "coins" | "plus" | "pro";
export type DormSize = "small" | "medium" | "large";

/** Inside floor size (tiles) and how many pieces may be placed, by plan. */
export const DORM_SIZES: Record<DormSize, { w: number; h: number; limit: number }> = {
  small: { w: 10, h: 8, limit: 15 },
  medium: { w: 12, h: 9, limit: 30 },
  large: { w: 14, h: 10, limit: 50 },
};
export const dormSizeFor = (plan: "free" | "plus" | "pro", admin = false): DormSize =>
  admin || plan === "pro" ? "large" : plan === "plus" ? "medium" : "small";

export type Furniture = {
  id: string;
  name: string;
  tier: DormTier;
  price?: number;
  /** Footprint in tiles. */
  w: number;
  h: number;
  /** Sit spots relative to the piece's top-left (tile offsets). */
  seats?: { dx: number; dy: number; kind: SeatKind }[];
  /** Flat on the floor: you can walk over it (rugs). */
  floor?: boolean;
  /** What pressing E next to it does. */
  use?: "arcade" | "focus" | "tank" | "trophy" | "music" | "lamp";
};

export const FURNITURE: Furniture[] = [
  // Free
  { id: "bed", name: "Bed", tier: "free", w: 3, h: 2 },
  {
    id: "desk",
    name: "Study desk",
    tier: "free",
    w: 2,
    h: 1,
    seats: [{ dx: 0, dy: 1, kind: "chair" }],
    use: "focus",
  },
  {
    id: "chair",
    name: "Chair",
    tier: "free",
    w: 1,
    h: 1,
    seats: [{ dx: 0, dy: 0, kind: "chair" }],
  },
  { id: "plant", name: "Plant", tier: "free", w: 1, h: 1 },
  { id: "rug", name: "Rug", tier: "free", w: 3, h: 2, floor: true },
  { id: "lamp", name: "Floor lamp", tier: "free", w: 1, h: 1, use: "lamp" },
  { id: "shelf_small", name: "Small shelf", tier: "free", w: 2, h: 1 },
  { id: "wardrobe", name: "Wardrobe", tier: "free", w: 2, h: 1 },
  // Coins
  {
    id: "beanbag",
    name: "Beanbag",
    tier: "coins",
    price: 60,
    w: 1,
    h: 1,
    seats: [{ dx: 0, dy: 0, kind: "sofa" }],
  },
  {
    id: "sofa",
    name: "Sofa",
    tier: "coins",
    price: 120,
    w: 3,
    h: 1,
    seats: [
      { dx: 0, dy: 0, kind: "sofa" },
      { dx: 1, dy: 0, kind: "sofa" },
      { dx: 2, dy: 0, kind: "sofa" },
    ],
  },
  { id: "bookshelf", name: "Bookshelf", tier: "coins", price: 80, w: 2, h: 1 },
  { id: "lavalamp", name: "Lava lamp", tier: "coins", price: 40, w: 1, h: 1 },
  {
    id: "gamingchair",
    name: "Gaming chair",
    tier: "coins",
    price: 90,
    w: 1,
    h: 1,
    seats: [{ dx: 0, dy: 0, kind: "chair" }],
  },
  { id: "fridge", name: "Mini fridge", tier: "coins", price: 70, w: 1, h: 1 },
  { id: "rug_round", name: "Round rug", tier: "coins", price: 50, w: 3, h: 2, floor: true },
  { id: "tv", name: "TV", tier: "coins", price: 120, w: 2, h: 1 },
  { id: "speaker", name: "Speaker", tier: "coins", price: 60, w: 1, h: 1, use: "music" },
  // Plus
  { id: "fishtank", name: "Fish tank", tier: "plus", w: 2, h: 1, use: "tank" },
  { id: "trophy", name: "Trophy shelf", tier: "plus", w: 2, h: 1, use: "trophy" },
  {
    id: "deluxedesk",
    name: "Deluxe desk",
    tier: "plus",
    w: 2,
    h: 1,
    seats: [{ dx: 0, dy: 1, kind: "chair" }],
    use: "focus",
  },
  {
    id: "hammock",
    name: "Hammock",
    tier: "plus",
    w: 3,
    h: 1,
    seats: [{ dx: 1, dy: 0, kind: "sofa" }],
  },
  { id: "neonsign", name: "Neon sign", tier: "plus", w: 2, h: 1 },
  { id: "cattree", name: "Cat tree", tier: "plus", w: 1, h: 1 },
  { id: "bunkbed", name: "Loft bed", tier: "plus", w: 3, h: 2 },
  // Pro
  { id: "aquarium", name: "Grand aquarium", tier: "pro", w: 3, h: 1, use: "tank" },
  { id: "arcade", name: "Mini arcade", tier: "pro", w: 1, h: 1, use: "arcade" },
  { id: "fireplace", name: "Fireplace", tier: "pro", w: 2, h: 1 },
  { id: "projector", name: "Star projector", tier: "pro", w: 1, h: 1 },
  {
    id: "throne",
    name: "Gold throne",
    tier: "pro",
    w: 1,
    h: 1,
    seats: [{ dx: 0, dy: 0, kind: "chair" }],
  },
];
export const furnitureOf = (id: string) => FURNITURE.find((f) => f.id === id);

export type RoomTheme = { id: string; name: string; tier: DormTier; price?: number };
/** Wall and floor looks (drawn in kit.ts room themes). */
export const ROOM_THEMES: RoomTheme[] = [
  { id: "cozy", name: "Cozy wood", tier: "free" },
  { id: "mint", name: "Mint", tier: "free" },
  { id: "night", name: "Night sky", tier: "plus" },
  { id: "cafe", name: "Café", tier: "plus" },
  { id: "sakura", name: "Sakura", tier: "pro" },
  { id: "galaxy", name: "Galaxy", tier: "pro" },
];

export type PlacedFurniture = { id: string; item: string; x: number; y: number };
export type DormLayout = { size: DormSize; theme: string; items: PlacedFurniture[] };

/** Map size for a dorm: inside floor plus the 3-tile back wall and walls round it. */
export const dormMapSize = (size: DormSize) => ({
  W: DORM_SIZES[size].w + 2,
  H: DORM_SIZES[size].h + 4,
});
/** Floor tiles furniture may sit on (inside the walls, not the door row). */
export const dormFloor = (size: DormSize) => {
  const { W, H } = dormMapSize(size);
  return { x0: 1, y0: 3, x1: W - 2, y1: H - 3 };
};

/** Builds the room with the placed furniture. Pieces off the floor are skipped. */
export function createDormMap(layout: DormLayout): WorldMap {
  const { W, H } = dormMapSize(layout.size);
  const k = createKit(W, H, 61);
  const { seat, thing } = k;
  const door = Math.floor(W / 2);
  k.room("F", [door]);
  k.roomTheme(layout.theme);
  k.window(2, 1, 2);
  k.window(W - 4, 1, 2);
  const floor = dormFloor(layout.size);
  // Rugs first so other pieces sit on top of them.
  const sorted = [...layout.items].sort(
    (a, b) => Number(!furnitureOf(a.item)?.floor) - Number(!furnitureOf(b.item)?.floor),
  );
  sorted.forEach((p) => {
    const f = furnitureOf(p.item);
    if (!f) return;
    if (p.x < floor.x0 || p.y < floor.y0 || p.x + f.w - 1 > floor.x1 || p.y + f.h - 1 > floor.y1)
      return;
    // Rugs, and pieces you sit in (chairs, sofas, beanbags), are drawn but
    // not walls: you walk onto them. Their seats draw nothing extra ("dorm").
    const sitIn = Boolean(f.seats?.length) && f.seats!.every((s) => s.dy < f.h);
    if (f.floor || sitIn) k.decorThing("furniture", p.x, p.y, f.w, f.h, p.item);
    else {
      const placed = thing("furniture", p.x, p.y, f.w, f.h);
      placed.item = p.item;
    }
    f.seats?.forEach((s) => {
      const sx = p.x + s.dx;
      const sy = p.y + s.dy;
      if (sy > floor.y1) return;
      seat(sx, sy, sitIn ? "dorm" : s.kind);
    });
  });
  return k.finish({
    id: "dorm",
    spawn: [door * TILE + 8, (H - 2) * TILE + 12],
    roam: [floor.x0, floor.y0, floor.x1, floor.y1],
    bg: "#1c1a24",
    npcs: 0,
  });
}
