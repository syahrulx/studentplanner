import { TILE, createKit, type WorldMap } from "./kit";

/**
 * Café: a counter and menu, tables, a lo-fi TV corner with sofas and a piano,
 * and two arcade machines.
 */
export function createCafeMap(): WorldMap {
  const k = createKit(32, 22, 53);
  const { seat, thing, label } = k;

  k.room("C", [15, 16]);
  k.window(12, 1, 3);
  k.window(19, 1, 2);
  thing("menu", 8, 1, 3, 2);
  k.sign(12, 0, 5, "CAFÉ");
  thing("notice", 22, 1, 3, 2);

  thing("counter", 2, 3, 6, 1);
  thing("pot", 1, 3);
  thing("pot", 30, 3);
  thing("pot", 1, 19);
  thing("pot", 30, 19);

  // Lo-fi corner
  k.rug(21, 5, 29, 9, ["#5a3d6b", "#e2b07a", "#6f4c84"]);
  thing("tv", 24, 4, 2, 1);
  thing("piano", 28, 5, 2, 1);
  [22, 23, 24, 25, 26].forEach((x) => seat(x, 8, "sofa"));
  label("LO-FI CORNER", 25 * TILE, 10 * TILE + 12, "small");

  [
    [5, 8],
    [10, 8],
    [15, 8],
    [5, 13],
    [10, 13],
    [15, 13],
    [20, 13],
  ].forEach(([x, y]) => {
    thing("table", x, y);
    seat(x - 1, y, "cafe");
    seat(x + 1, y, "cafe");
  });

  // Window bar along the bottom
  [4, 5, 6, 7, 8].forEach((x) => seat(x, 19, "cafe"));
  k.decor(() => {
    k.P(k.bx, "#6e4425", 3 * TILE + 8, 20 * TILE + 1, 6 * TILE, 5);
    k.P(k.bx, "#a8744a", 3 * TILE + 8, 20 * TILE + 1, 6 * TILE, 2);
  });

  thing("arcade", 26, 14);
  thing("arcade", 28, 14);
  label("ARCADE", 27.5 * TILE, 12 * TILE + 12, "small");
  k.rug(25, 15, 29, 17, ["#2b2258", "#f2c14e", "#3b2f7a"]);

  return k.finish({
    id: "cafe",
    spawn: [15.5 * TILE + 8, 19 * TILE + 12],
    roam: [1, 4, 30, 19],
    bg: "#2b2118",
    npcs: 18,
  });
}
