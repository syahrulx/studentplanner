import { TILE, createKit, type WorldMap } from "./kit";

/**
 * Garden: crop plots to water and harvest, a fountain plaza, a greenhouse
 * full of potted plants, a pond and picnic tables.
 */
export function createGardenMap(): WorldMap {
  const k = createKit(44, 30, 97);
  const { fill, seat, thing, label } = k;

  k.borderTrees();
  fill(2, 14, 41, 15, "p");
  fill(21, 2, 22, 27, "p");
  fill(17, 11, 26, 18, "p");
  thing("fountain", 21, 14, 2, 2);
  [12, 13, 16, 17].forEach((y) => {
    seat(18, y, "bench");
    seat(25, y, "bench");
  });
  k.lamp([17, 11], [26, 11], [17, 18], [26, 18], [9, 13], [34, 13], [20, 6], [23, 23]);

  // Crop plots: water them to grow, harvest when ripe.
  [4, 6, 8].forEach((y) => k.cropRow(3, 16, y));
  [20, 22, 24].forEach((y) => k.cropRow(27, 40, y));
  label("WATER PLANTS · HARVEST", 9.5 * TILE + 8, 3 * TILE + 8, "small");
  k.flowerBed(3, 11, 15, 11);
  k.flowerBed(33, 18, 40, 18);
  k.flowerBed(3, 18, 4, 19);

  // Greenhouse
  k.building(28, 3, 39, 10, "t", [
    [33, 10],
    [34, 10],
  ]);
  [30, 32, 35, 37].forEach((x) => {
    thing("pot", x, 5);
    thing("pot", x, 8);
  });
  label("GREENHOUSE", 33.5 * TILE + 8, 3 * TILE + 11, "wall");

  // Pond and picnic
  k.pond(10.5, 23, 5, 3);
  seat(4, 20, "bench");
  seat(5, 20, "bench");
  k.rock([16, 21], [3, 26]);
  thing("picnic", 29, 17, 2, 1);
  [29, 30].forEach((x) => {
    seat(x, 16, "bench");
    seat(x, 18, "bench");
  });
  thing("notice", 23, 2, 3, 2);
  thing("bin", 17, 24);
  thing("bin", 19, 11);
  // Weekly leaderboards (press E to open).
  thing("ranks", 30, 12, 3, 2);
  label("LEADERBOARD", 31.5 * TILE, 11 * TILE + 6, "small");
  k.bush([2, 9], [17, 3], [26, 3], [19, 26], [41, 12], [26, 26]);
  k.tree([24, 8], [19, 21], [39, 27], [2, 16]);

  return k.finish({
    id: "garden",
    spawn: [21.5 * TILE + 8, 21 * TILE + 12],
    roam: [2, 10, 41, 27],
    bg: "#1f3b24",
    npcs: 18,
  });
}
