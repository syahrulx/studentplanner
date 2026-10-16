import {
  buildAvatar,
  buildPet,
  itemOf,
  ADMIN_ITEMS,
  CATALOG,
  DEFAULT_LOOK,
  GRID_H,
  GRID_W,
  type AvatarLook,
  type ItemCategory,
} from '../vendor/rentaman/avatar';

/**
 * A student's RenTaman avatar, as saved on rencana.app, drawn in the app.
 *
 * The drawing code is the website's own (src/vendor/rentaman, copied by
 * scripts/sync-rentaman-avatar.js), so the avatar looks the same here.
 * Read-only: the app never changes a look. Only the picture is shown: no item
 * names, prices or shop, which keeps it clear of store rules on outside
 * purchases.
 */

/** Same dark outline the website paints around every avatar (paintGrid). */
const OUTLINE = '#2a1b18';

/**
 * The saved look over the defaults. An item this build does not know yet
 * (the website added it later) falls back to the default for that slot rather
 * than drawing nothing or throwing.
 */
export function safeLook(saved: Partial<AvatarLook>): AvatarLook {
  const look = { ...DEFAULT_LOOK, ...saved } as AvatarLook;
  for (const cat of Object.keys(CATALOG) as ItemCategory[]) {
    const id = (look as Record<string, unknown>)[cat];
    const known = CATALOG[cat].some((item) => item.id === id) || (ADMIN_ITEMS[cat]?.includes(String(id)) ?? false);
    if (id != null && !known) {
      (look as Record<string, unknown>)[cat] = (DEFAULT_LOOK as Record<string, unknown>)[cat];
    }
  }
  return look;
}

/** One horizontal bar of same-coloured pixels. */
export type PixelRun = { x: number; y: number; w: number; color: string };

/**
 * The avatar as runs of pixels, outline included, ready to draw with plain
 * Views (React Native has no canvas). Joining same-coloured neighbours keeps
 * it to a few hundred Views instead of 1,064.
 */
export function avatarRuns(look: AvatarLook, blink: boolean, t = 0): PixelRun[] {
  let grid: (string | null)[][];
  try {
    grid = buildAvatar(look, t, 1, blink, 'f');
  } catch {
    grid = buildAvatar(DEFAULT_LOOK, t, 1, blink, 'f');
  }
  return gridRuns(grid);
}

/** The pet that follows the avatar in the game (14 x 14), or [] if none. */
export function petRuns(look: AvatarLook, t = 0): PixelRun[] {
  if (!look.pet || look.pet === 'none') return [];
  try {
    return gridRuns(buildPet(look.pet, t));
  } catch {
    return [];
  }
}

export const PET_GRID = { w: 14, h: 14 };

/**
 * True when something worn moves on its own (swaying, glowing, a pet): those
 * are redrawn a few times a second, like the game does. Everything else only
 * blinks, so a still outfit costs nothing.
 */
export function lookIsAnimated(look: AvatarLook): boolean {
  if (look.pet && look.pet !== 'none') return true;
  if (look.effect && look.effect !== 'none') return true;
  return (Object.keys(CATALOG) as ItemCategory[]).some((cat) => {
    const id = (look as Record<string, unknown>)[cat];
    return typeof id === 'string' && itemOf(cat, id)?.animated === true;
  });
}

function gridRuns(grid: (string | null)[][]): PixelRun[] {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const colorAt = (x: number, y: number): string | null => {
    const v = grid[y][x];
    if (v) return v;
    const near =
      (y > 0 && grid[y - 1][x]) || (y < h - 1 && grid[y + 1][x]) || (x > 0 && grid[y][x - 1]) || (x < w - 1 && grid[y][x + 1]);
    return near ? OUTLINE : null;
  };
  const runs: PixelRun[] = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const c = colorAt(x, y);
      if (!c) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < w && colorAt(end, y) === c) end++;
      runs.push({ x, y, w: end - x, color: c });
      x = end;
    }
  }
  return runs;
}

export const AVATAR_GRID = { w: GRID_W, h: GRID_H };

/** The part of the grid an avatar actually covers (outline included), in grid pixels. */
export type AvatarBounds = { x: number; y: number; w: number; h: number };

/**
 * Where the avatar really is inside its 28 x 38 grid. A plain outfit leaves
 * the top third empty (room for hats), so drawing the whole grid at one size
 * made plain avatars look small beside ones with tall hats. Sizing by these
 * bounds makes every avatar stand the same height. One pixel of margin on
 * each side leaves room for parts that sway.
 */
export function avatarBounds(look: AvatarLook): AvatarBounds {
  const runs = [...avatarRuns(look, false, 0), ...avatarRuns(look, true, 0)];
  if (runs.length === 0) return { x: 0, y: 0, w: GRID_W, h: GRID_H };
  let minX = GRID_W, minY = GRID_H, maxX = 0, maxY = 0;
  for (const r of runs) {
    minX = Math.min(minX, r.x);
    maxX = Math.max(maxX, r.x + r.w);
    minY = Math.min(minY, r.y);
    maxY = Math.max(maxY, r.y + 1);
  }
  minX = Math.max(0, minX - 1);
  minY = Math.max(0, minY - 1);
  maxX = Math.min(GRID_W, maxX + 1);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
