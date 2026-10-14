/**
 * Café food effects. Each drink or snack works for 24 hours; you can have one
 * drink and one snack going at once, and a new one replaces the old one of
 * the same kind. The server (migration 202610140003, study_world_food_effect)
 * holds the same list and applies the fishing and garden effects itself; this
 * copy is for walking speed, the bite timer and the menu text.
 */

export type FoodKind = "drink" | "snack";
/** Percent bonuses: walk speed, how much sooner fish bite, how much faster plants grow. */
export type FoodEffect = { speed: number; fish: number; garden: number };

export const FOOD_HOURS = 24;

export const FOOD_EFFECTS: Record<string, FoodEffect> = {
  // Drinks
  "teh-tarik": { speed: 15, fish: 0, garden: 0 },
  "iced-latte": { speed: 25, fish: 0, garden: 0 },
  "hot-chocolate": { speed: 0, fish: 0, garden: 25 },
  matcha: { speed: 25, fish: 25, garden: 0 },
  // Snacks
  cookie: { speed: 0, fish: 15, garden: 0 },
  "fruit-cup": { speed: 0, fish: 0, garden: 15 },
  crisps: { speed: 10, fish: 0, garden: 0 },
  onigiri: { speed: 10, fish: 15, garden: 0 },
};

/** "Walk 25% faster · fish bite 25% sooner" */
export function describeFood(key: string): string {
  const e = FOOD_EFFECTS[key];
  if (!e) return "A treat.";
  const parts = [
    e.speed ? `Walk ${e.speed}% faster` : "",
    e.fish ? `fish bite ${e.fish}% sooner` : "",
    e.garden ? `plants grow ${e.garden}% faster` : "",
  ].filter(Boolean);
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type ActiveFood = { kind: FoodKind; key: string; until: number };

/** The drink and snack still working at `now` (ms). */
export const activeFoods = (foods: ActiveFood[], now = Date.now()) =>
  foods.filter((f) => f.until > now && FOOD_EFFECTS[f.key]);

/** Total bonuses from the food still working at `now`. */
export function foodTotals(foods: ActiveFood[], now = Date.now()): FoodEffect {
  return activeFoods(foods, now).reduce(
    (sum, f) => {
      const e = FOOD_EFFECTS[f.key];
      return { speed: sum.speed + e.speed, fish: sum.fish + e.fish, garden: sum.garden + e.garden };
    },
    { speed: 0, fish: 0, garden: 0 },
  );
}

/** Seconds between catches (the server's rule: 10 s, shorter with food, never under 5 s). */
export const castWaitSeconds = (fishBonus: number) => Math.max(5, 10 * (1 - fishBonus / 100));

/** "21h left" / "35m left" */
export function timeLeft(until: number, now = Date.now()): string {
  const mins = Math.max(0, Math.round((until - now) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h left` : `${mins}m left`;
}
