import { TILE, createKit, type WorldMap } from "./kit";

/**
 * Classroom: rows of desks facing a blackboard, O and X quiz mats at the
 * front, group-study tables at the back, lockers and a snack machine.
 */
export function createClassroomMap(): WorldMap {
  const k = createKit(30, 22, 37);
  const { P, bx, seat, thing, label } = k;

  k.room("F", [14, 15]);
  k.window(2, 1, 3);
  k.window(25, 1, 3);
  thing("blackboard", 10, 1, 10, 2);
  thing("clock", 22, 1, 1, 2);
  k.sign(6, 0, 3, "3B");

  thing("tdesk", 3, 4, 3, 1);
  thing("globe", 7, 4);
  thing("shelf", 24, 4, 2, 1);
  thing("pot", 1, 3);
  thing("pot", 28, 3);
  thing("pot", 1, 15);
  thing("pot", 28, 15);

  // Quiz mats: stand on O (true) or X (false).
  k.decor(() => {
    const mat = (x0: number, col: string, dark: string) => {
      P(bx, dark, x0 * TILE + 2, 4 * TILE + 2, 5 * TILE - 4, 3 * TILE - 4);
      P(bx, col, x0 * TILE + 4, 4 * TILE + 4, 5 * TILE - 8, 3 * TILE - 8);
    };
    mat(9, "#cfe0fb", "#3d7fd6");
    mat(16, "#fbd3d3", "#d64545");
    const O = [11.5 * TILE, 5.5 * TILE];
    for (let a = 0; a < 360; a += 3)
      for (let r = 9; r <= 12; r++)
        P(
          bx,
          "#3d7fd6",
          Math.round(O[0] + Math.cos(a / 57.3) * r),
          Math.round(O[1] + Math.sin(a / 57.3) * r),
        );
    const X = [18.5 * TILE, 5.5 * TILE];
    for (let i = -10; i <= 10; i++)
      for (let t = -1; t <= 1; t++) {
        P(bx, "#d64545", X[0] + i + t, X[1] + i);
        P(bx, "#d64545", X[0] + i + t, X[1] - i);
      }
  });

  // Desks with a chair behind each, in two blocks with an aisle.
  [8, 11, 14].forEach((y) =>
    [4, 6, 8, 10, 18, 20, 22, 24].forEach((x) => {
      thing("sdesk", x, y);
      seat(x, y + 1, "chair");
    }),
  );

  // Group study at the back.
  [6, 11, 18, 23].forEach((x) => {
    thing("table", x, 18);
    seat(x - 1, 18, "cafe");
    seat(x + 1, 18, "cafe");
  });
  k.rug(4, 17, 13, 19, ["#3d5f8f", "#c8a24a", "#4a6fa5"]);
  k.rug(16, 17, 25, 19, ["#3d5f8f", "#c8a24a", "#4a6fa5"]);

  thing("locker", 2, 20, 5, 1);
  thing("vending", 26, 20);
  thing("notice", 21, 20, 3, 1);
  thing("bin", 27, 20);
  label("GROUP STUDY", 15 * TILE, 16 * TILE + 10, "small");

  return k.finish({
    id: "classroom",
    spawn: [14.5 * TILE + 8, 19 * TILE + 12],
    roam: [1, 4, 28, 19],
    quiz: { o: [9, 4, 13, 6], x: [16, 4, 20, 6] },
    bg: "#2b2118",
    npcs: 18,
  });
}
