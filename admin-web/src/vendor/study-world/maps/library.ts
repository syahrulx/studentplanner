import { TILE, createKit, type WorldMap } from "./kit";

/**
 * Library: walls of shelves, a returns desk, quiet desks with focus timers,
 * book aisles and a reading corner.
 */
export function createLibraryMap(): WorldMap {
  const k = createKit(34, 24, 71);
  const { seat, thing, label } = k;

  k.room("L", [16, 17]);
  k.window(11, 1, 2);
  k.window(21, 1, 2);
  k.sign(14, 0, 6, "LIBRARY");
  thing("clock", 17, 1, 1, 2);
  [2, 4, 6, 8, 24, 26, 28, 30].forEach((x) => thing("shelf", x, 3, 2, 1));
  thing("pot", 1, 4);
  thing("pot", 32, 4);

  thing("returns", 14, 5, 5, 1);
  thing("globe", 20, 5);

  // Quiet desks: sitting down starts a 25 minute focus timer.
  [
    [3, 8],
    [7, 8],
    [11, 8],
    [3, 12],
    [7, 12],
    [11, 12],
  ].forEach(([x, y]) => {
    thing("desk", x, y, 2, 1);
    seat(x, y + 1, "lib");
    seat(x + 1, y + 1, "lib");
  });
  label("QUIET ZONE", 8 * TILE, 7 * TILE + 8, "small");

  // Book aisles
  [8, 11, 14].forEach((y) => [21, 23, 25, 27, 29].forEach((x) => thing("shelf", x, y, 2, 1)));

  // Reading corner
  k.rug(2, 17, 10, 21, ["#7a3530", "#c8a24a", "#9c3d3d"]);
  [3, 4, 8, 9].forEach((x) => seat(x, 18, "sofa"));
  thing("table", 6, 20);
  seat(5, 20, "cafe");
  seat(7, 20, "cafe");
  label("READING CORNER", 6 * TILE + 8, 16 * TILE + 12, "small");

  [
    [22, 18],
    [27, 18],
  ].forEach(([x, y]) => {
    thing("desk", x, y, 2, 1);
    seat(x, y + 1, "lib");
    seat(x + 1, y + 1, "lib");
  });
  thing("bin", 30, 22);
  thing("pot", 1, 22);
  thing("pot", 32, 22);

  return k.finish({
    id: "library",
    spawn: [16.5 * TILE + 8, 21 * TILE + 12],
    roam: [1, 4, 32, 21],
    bg: "#2b2118",
    npcs: 18,
  });
}
