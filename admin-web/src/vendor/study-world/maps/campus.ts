import { TILE, createKit, type WorldMap } from "./kit";

/**
 * Campus: a 48×32 outdoor map with a pond, quiz deck, fenced plaza with stump
 * seats, a small library, café, garden rows and a picnic area.
 */
export function createCampusMap(): WorldMap {
  const k = createKit(48, 32, 11);
  const { P, bx, fill, building, seat, thing, label } = k;

  k.pond(9, 7.5, 5.4, 3.3);
  fill(19, 4, 28, 9, "k");
  fill(17, 13, 30, 24, "d");
  fill(23, 10, 24, 12, "p");
  fill(23, 25, 24, 28, "p");
  fill(15, 18, 16, 19, "p");
  fill(31, 18, 32, 19, "p");
  fill(15, 6, 18, 7, "p");
  fill(29, 6, 36, 7, "p");
  fill(17, 28, 30, 28, "p");
  building(3, 13, 14, 24, "L", [
    [14, 18],
    [14, 19],
  ]);
  building(33, 13, 44, 24, "C", [
    [33, 18],
    [33, 19],
  ]);
  k.cropRow(18, 29, 27, [23, 24]);
  k.cropRow(18, 29, 29);
  for (let x = 16; x <= 31; x++)
    if (x < 23 || x > 24) {
      k.fence(x, 12, "h");
      k.fence(x, 25, "h");
    }
  for (let y = 13; y <= 24; y++)
    if (y < 18 || y > 19) {
      k.fence(16, y, "v");
      k.fence(31, y, "v");
    }
  k.borderTrees();
  k.tree(
    [2, 11],
    [15, 2],
    [31, 2],
    [44, 10],
    [2, 27],
    [14, 28],
    [33, 28],
    [45, 27],
    [16, 9],
    [30, 10],
    [12, 2],
    [41, 29],
    [5, 29],
    [38, 10],
    [46, 2],
    [46, 30],
  );
  k.bush(
    [17, 11],
    [30, 11],
    [21, 11],
    [26, 11],
    [17, 26],
    [30, 26],
    [5, 12],
    [12, 12],
    [35, 11],
    [42, 11],
    [19, 10],
    [28, 10],
  );
  k.rock([4, 4], [13, 11], [43, 3], [20, 30], [10, 27], [36, 27]);
  k.lamp([22, 10], [25, 10], [15, 17], [32, 17], [15, 20], [32, 20], [22, 26], [25, 26]);

  seat(8, 12, "bench");
  seat(9, 12, "bench");
  [4, 6, 8, 10, 12].forEach((x) => thing("shelf", x, 14, 2, 1));
  (
    [
      [5, 17],
      [9, 17],
      [5, 20],
      [9, 20],
    ] as const
  ).forEach(([x, y]) => {
    thing("desk", x, y, 2, 1);
    seat(x, y + 1, "lib");
    seat(x + 1, y + 1, "lib");
  });
  thing("pot", 4, 23);
  thing("pot", 13, 23);
  thing("pot", 13, 15);
  thing("counter", 35, 15, 7, 1);
  thing("tv", 42, 14, 2, 1);
  (
    [
      [36, 19],
      [40, 19],
      [36, 22],
      [40, 22],
    ] as const
  ).forEach(([x, y]) => {
    thing("table", x, y);
    seat(x - 1, y, "cafe");
    seat(x + 1, y, "cafe");
  });
  thing("pot", 34, 23);
  thing("pot", 43, 23);
  thing("pot", 43, 17);
  seat(42, 20, "sofa");
  seat(43, 20, "sofa");
  [18, 20, 22, 25, 27, 29].forEach((x) => [15, 18, 21].forEach((y) => seat(x, y, "stump")));
  thing("board", 21, 2, 6, 2);
  thing("notice", 34, 3, 3, 2);
  (
    [
      [37, 7],
      [41, 7],
    ] as const
  ).forEach(([x, y]) => {
    thing("picnic", x, y, 2, 1);
    [
      [0, -1],
      [1, -1],
      [0, 1],
      [1, 1],
    ].forEach(([dx, dy]) => seat(x + dx, y + dy, "bench"));
  });

  thing("bin", 15, 9);
  // Fish market by the pond: sells ultra rare fish (see BagPanel market mode).
  thing("market", 16, 4, 3, 1);
  // Weekly leaderboards, next to the event notice board.
  thing("ranks", 38, 3, 3, 2);
  thing("bin", 32, 10);
  k.rug(6, 22, 11, 23, ["#9c3d3d", "#c8a24a", "#8a3232"]);
  // Quiz deck O and X
  k.decor(() => {
    const O = [21.5 * TILE, 7 * TILE + 8];
    const X = [26.5 * TILE, 7 * TILE + 8];
    for (let a = 0; a < 360; a += 3)
      for (let r = 13; r <= 16; r++)
        P(
          bx,
          "#3d7fd6",
          Math.round(O[0] + Math.cos(a / 57.3) * r),
          Math.round(O[1] + Math.sin(a / 57.3) * r),
        );
    for (let i = -13; i <= 13; i++)
      for (let t = -1; t <= 2; t++) {
        P(bx, "#d64545", X[0] + i + t, X[1] + i);
        P(bx, "#d64545", X[0] + i + t, X[1] - i);
      }
  });
  label("LIBRARY", 9 * TILE, 13 * TILE + 11, "wall");
  label("CAFÉ", 39 * TILE, 13 * TILE + 11, "wall");
  label("QUIET ZONE", 9 * TILE, 16 * TILE + 2, "small");
  label("GARDEN", 24 * TILE, 30 * TILE + 10, "small");
  label("FISH MARKET", 17.5 * TILE, 5 * TILE + 10, "small");
  label("LEADERBOARD", 39.5 * TILE, 2 * TILE + 6, "small");

  return k.finish({
    id: "campus",
    spawn: [23.5 * TILE, 11 * TILE + 12],
    roam: [17, 10, 30, 25],
    quiz: { o: [19, 4, 23, 9], x: [24, 4, 28, 9] },
    bg: "#1f3b24",
    npcs: 23,
  });
}
