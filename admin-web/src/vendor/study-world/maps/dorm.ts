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
  use?: FurnitureUse;
};
export type FurnitureUse =
  | "arcade"
  | "focus"
  | "tank"
  | "trophy"
  | "music"
  | "light"
  | "plant"
  | "read"
  | "wardrobe"
  | "fridge"
  | "tv"
  | "pet";

export const FURNITURE: Furniture[] = [
  // Free
  {
    id: "bed",
    name: "Bed",
    tier: "free",
    w: 3,
    h: 2,
    seats: [
      { dx: 1, dy: 1, kind: "sofa" },
      { dx: 2, dy: 1, kind: "sofa" },
    ],
  },
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
  { id: "plant", name: "Plant", tier: "free", w: 1, h: 1, use: "plant" },
  { id: "rug", name: "Rug", tier: "free", w: 3, h: 2, floor: true },
  { id: "lamp", name: "Floor lamp", tier: "free", w: 1, h: 1, use: "light" },
  { id: "shelf_small", name: "Small shelf", tier: "free", w: 2, h: 1, use: "read" },
  { id: "wardrobe", name: "Wardrobe", tier: "free", w: 2, h: 1, use: "wardrobe" },
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
  { id: "bookshelf", name: "Bookshelf", tier: "coins", price: 80, w: 2, h: 1, use: "read" },
  { id: "lavalamp", name: "Lava lamp", tier: "coins", price: 40, w: 1, h: 1, use: "light" },
  {
    id: "gamingchair",
    name: "Gaming chair",
    tier: "coins",
    price: 90,
    w: 1,
    h: 1,
    seats: [{ dx: 0, dy: 0, kind: "chair" }],
  },
  { id: "fridge", name: "Mini fridge", tier: "coins", price: 70, w: 1, h: 1, use: "fridge" },
  { id: "rug_round", name: "Round rug", tier: "coins", price: 50, w: 3, h: 2, floor: true },
  { id: "tv", name: "TV", tier: "coins", price: 120, w: 2, h: 1, use: "tv" },
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
  { id: "neonsign", name: "Neon sign", tier: "plus", w: 2, h: 1, use: "light" },
  { id: "cattree", name: "Cat tree", tier: "plus", w: 1, h: 1, use: "pet" },
  {
    id: "bunkbed",
    name: "Loft bed",
    tier: "plus",
    w: 3,
    h: 2,
    seats: [
      { dx: 1, dy: 1, kind: "sofa" },
      { dx: 2, dy: 1, kind: "sofa" },
    ],
  },
  // Pro
  { id: "aquarium", name: "Grand aquarium", tier: "pro", w: 3, h: 1, use: "tank" },
  { id: "arcade", name: "Mini arcade", tier: "pro", w: 1, h: 1, use: "arcade" },
  { id: "fireplace", name: "Fireplace", tier: "pro", w: 2, h: 1, use: "light" },
  { id: "projector", name: "Star projector", tier: "pro", w: 1, h: 1, use: "light" },
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

/** Pieces that look the same from every side, so they don't turn. */
const ROUND = new Set([
  "plant",
  "lamp",
  "lavalamp",
  "rug_round",
  "beanbag",
  "projector",
  "cattree",
]);
export const canRotate = (id: string) => !ROUND.has(id);
export type Facing = 0 | 1 | 2 | 3;
/** 0 front (faces down), 1 faces right, 2 faces up (back to you), 3 faces left. */
export const FACING_NAMES = ["front", "right", "back", "left"] as const;
export const nextFacing = (r: number): Facing => (((r | 0) + 1) % 4) as Facing;
export const cleanFacing = (id: string, r: unknown): Facing =>
  canRotate(id) && (r === 1 || r === 2 || r === 3) ? r : 0;

/** Footprint of a piece turned to facing r (sideways swaps width and height). */
export const footprint = (f: { w: number; h: number }, r: number) =>
  r === 1 || r === 3 ? { w: f.h, h: f.w } : { w: f.w, h: f.h };

const DIRS = ["f", "r", "b", "l"] as const;
/**
 * Seat spots of a turned piece (tile offsets from its top-left) and which way
 * the seated player faces: in sofas/chairs you face where the piece faces; at
 * a desk you face the desk.
 */
export function seatsFor(f: Furniture, r: number, sitIn: boolean) {
  const { w, h } = f;
  return (f.seats ?? []).map((s) => {
    const [dx, dy] =
      r === 1
        ? [s.dy, w - 1 - s.dx]
        : r === 2
          ? [w - 1 - s.dx, h - 1 - s.dy]
          : r === 3
            ? [h - 1 - s.dy, s.dx]
            : [s.dx, s.dy];
    const face = DIRS[sitIn ? r : (r + 2) % 4];
    return { dx, dy, kind: s.kind, face };
  });
}

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

export type PlacedFurniture = { id: string; item: string; x: number; y: number; r?: number };
export type DormLayout = {
  size: DormSize;
  theme: string;
  items: PlacedFurniture[];
  /** The owner has caught fish: tanks are drawn empty and real fish swim in them. */
  fish?: { species: string; kg: number }[];
};

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
  const seatFaces: { x: number; y: number; face: "f" | "b" | "l" | "r" }[] = [];
  // Rugs first so other pieces sit on top of them.
  const sorted = [...layout.items].sort(
    (a, b) => Number(!furnitureOf(a.item)?.floor) - Number(!furnitureOf(b.item)?.floor),
  );
  sorted.forEach((p) => {
    const f = furnitureOf(p.item);
    if (!f) return;
    const r = cleanFacing(f.id, p.r);
    const { w, h } = footprint(f, r);
    if (p.x < floor.x0 || p.y < floor.y0 || p.x + w - 1 > floor.x1 || p.y + h - 1 > floor.y1)
      return;
    // Rugs, and pieces you sit in (chairs, sofas, beds), are drawn but not
    // walls: you walk onto them. Their seats draw nothing extra ("dorm").
    const sitIn = Boolean(f.seats?.length) && f.seats!.every((s) => s.dy < f.h);
    const placed =
      f.floor || sitIn
        ? k.decorThing("furniture", p.x, p.y, w, h, p.item)
        : thing("furniture", p.x, p.y, w, h);
    placed.item = p.item;
    placed.rot = r;
    // Real fish are drawn live only on front-facing tanks.
    if (layout.fish?.length && f.use === "tank" && r === 0) placed.emptyTank = true;
    seatsFor(f, r, sitIn).forEach((s) => {
      const sx = p.x + s.dx;
      const sy = p.y + s.dy;
      if (sx < floor.x0 || sx > floor.x1 || sy < floor.y0 || sy > floor.y1) return;
      seat(sx, sy, sitIn ? "dorm" : s.kind);
      seatFaces.push({ x: sx, y: sy, face: s.face });
    });
  });
  const map = k.finish({
    id: "dorm",
    spawn: [door * TILE + 8, (H - 2) * TILE + 12],
    roam: [floor.x0, floor.y0, floor.x1, floor.y1],
    bg: "#1c1a24",
    npcs: 0,
  });
  seatFaces.forEach(({ x, y, face }) => {
    const s = [...map.seats.values()].find((seat) => seat.x === x && seat.y === y);
    if (s) s.face = face;
  });
  return map;
}
