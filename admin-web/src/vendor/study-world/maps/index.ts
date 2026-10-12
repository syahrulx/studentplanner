import { createCafeMap } from "./cafe";
import { createCampusMap } from "./campus";
import { createClassroomMap } from "./classroom";
import { createGardenMap } from "./garden";
import type { MapId, WorldMap } from "./kit";
import { createLibraryMap } from "./library";

export * from "./kit";

const BUILDERS: Record<MapId, () => WorldMap> = {
  campus: createCampusMap,
  classroom: createClassroomMap,
  cafe: createCafeMap,
  library: createLibraryMap,
  garden: createGardenMap,
};

export const isMapId = (id: string): id is MapId => id in BUILDERS;

export function createWorldMap(id: string): WorldMap {
  return (isMapId(id) ? BUILDERS[id] : createCampusMap)();
}
