import { supabase } from './supabase';

/**
 * Study World economy for the admin website: wallets, bags, coin history,
 * leaderboards. Every call is an admin RPC (is_admin() checked on the server);
 * the economy tables themselves can't be read directly.
 *
 * Website migration 202610120003_study_world_economy.sql (tables + one-player
 * RPCs) and gradeup-mobile migration 20261012000004_study_world_economy_admin.sql
 * (wallet list + leaderboards with accounts).
 */

export type Rarity = 'common' | 'rare' | 'ultra';

/** Same list as study_world_fish_species (seeded by the website migration). */
export const FISH: Record<string, { name: string; rarity: Rarity }> = {
  minnow: { name: 'Silver Minnow', rarity: 'common' },
  tilapia: { name: 'Tilapia', rarity: 'common' },
  carp: { name: 'River Carp', rarity: 'common' },
  koi: { name: 'Golden Koi', rarity: 'rare' },
  toman: { name: 'Toman', rarity: 'rare' },
  gourami: { name: 'Giant Gourami', rarity: 'rare' },
  starkoi: { name: 'Star Koi', rarity: 'ultra' },
  thunder: { name: 'Thunder Catfish', rarity: 'ultra' },
  dragon: { name: 'Dragon Arowana', rarity: 'ultra' },
};

export const BOARDS = [
  { id: 'coins', label: 'Richest', unit: 'coins', admin: true },
  { id: 'biggest_fish', label: 'Biggest fish', unit: 'kg' },
  { id: 'fish_caught', label: 'Most fish', unit: 'fish' },
  { id: 'collection', label: 'Collection', unit: 'species' },
  { id: 'harvests', label: 'Harvests', unit: 'harvests' },
  { id: 'quiz_correct', label: 'Quiz', unit: 'correct' },
  { id: 'trash_thrown', label: 'Clean-up', unit: 'trash' },
] as const;
export type BoardId = (typeof BOARDS)[number]['id'];

export type EconomyOverview = {
  players_with_wallet: number;
  coins_in_wallets: number;
  fish_in_bags: number;
  ultra_in_bags: number;
  coins_from_fishing_7d: number;
  coins_from_sales_7d: number;
};

export type WalletRow = {
  user_id: string;
  nickname: string | null;
  name: string | null;
  email: string | null;
  coins: number;
  worms: number;
  trash: number;
  fish_in_bag: number;
  ultra_in_bag: number;
  items_owned: number;
  last_active: string | null;
  total_count: number;
};

export type BoardRow = { rank: number; user_id: string; nickname: string | null; email: string | null; value: number };

export type PlayerEconomy = {
  state: {
    coins: number;
    worms: number;
    trash: number;
    use_worm: boolean;
    held_fish: string | null;
    boost_until: string | null;
    last_cast_at: string | null;
    created_at: string;
  } | null;
  fish: { id: string; species: string; weight_kg: number; worm: boolean; caught_at: string }[];
  owned: string[];
  ledger: { id: number; delta: number; balance: number; reason: string; detail: string | null; created_at: string }[];
};

function explain(error: { code?: string; message?: string } | null): Error | null {
  if (!error) return null;
  const msg = error.message ?? 'Request failed';
  if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01' || /could not find the function|does not exist/i.test(msg)) {
    return new Error(
      'The RenCity economy is not in the database yet. Run the website migration 202610120003_study_world_economy.sql, then gradeup-mobile/supabase/migrations/20261012000004_study_world_economy_admin.sql, in the Supabase SQL Editor.',
    );
  }
  return new Error(msg);
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  const err = explain(error);
  if (err) throw err;
  return data as T;
}

export const getEconomyOverview = () => rpc<EconomyOverview>('admin_study_world_economy_overview');

export const listWallets = (query: string, sort: 'coins' | 'fish' | 'recent', limit: number, offset: number) =>
  rpc<WalletRow[]>('admin_study_world_wallets', { p_query: query || null, p_sort: sort, p_limit: limit, p_offset: offset });

export const getLeaderboard = (board: BoardId, limit = 50) =>
  rpc<BoardRow[]>('admin_study_world_leaderboard', { p_board: board, p_limit: limit });

export const getPlayerEconomy = (userId: string) => rpc<PlayerEconomy>('admin_study_world_economy', { p_user: userId });

/** Give (positive) or take (negative) coins. Returns the new balance. */
export const adjustCoins = (userId: string, delta: number, reason: string) =>
  rpc<number>('admin_study_world_adjust_coins', { p_user: userId, p_delta: delta, p_reason: reason });
