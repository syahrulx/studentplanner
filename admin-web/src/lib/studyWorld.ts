import { supabase } from './supabase';
import { useEffect, useState } from 'react';
import { CATALOG as ART_CATALOG, COLORS as ART_COLORS, DEFAULT_LOOK, type AvatarLook } from '../vendor/study-world/avatar';
import { isMapId } from '../vendor/study-world/maps';
import { BUBBLES, EMOTE_PACKS, ENTRANCES, FRAMES } from '../vendor/study-world/showoff';
import { FURNITURE, ROOM_THEMES } from '../vendor/study-world/maps/dorm';

/**
 * Study World (Rencana website, /app/world) admin data.
 *
 * Items, maps, coin packs and settings are small config tables: admins write
 * them directly and RLS checks is_admin(); a trigger stamps who changed what.
 * Bans, reports, avatars and the log go through admin_study_world_* RPCs.
 * Schema: gradeup-mobile/supabase/migrations/20261012000001_study_world_admin.sql
 */

export type ItemStatus = 'available' | 'coming_soon' | 'hidden';
/**
 * free = everyone; coins = bought with coins; plus / pro = free with a Rencana
 * Plus / Pro membership (Pro also gets every Plus item); premium = old value,
 * treated like plus by the website; admin = only RenTaman admins can use it
 * (never sold).
 */
export type ItemTier = 'free' | 'coins' | 'plus' | 'pro' | 'premium' | 'admin';

export const TIER_LABEL: Record<ItemTier, string> = {
  free: 'Free',
  coins: 'Coins',
  plus: 'Plus members',
  pro: 'Pro members',
  premium: 'Premium (old, same as Plus)',
  admin: 'Admins only',
};

export const AVATAR_CATEGORIES = ['hair', 'eyes', 'top', 'bottom', 'shoes', 'head', 'face', 'back', 'pet', 'effect'] as const;
/** Shown to others in the room: frame around your name, chat bubble style, entrance effect, extra emotes. */
export const SHOWOFF_CATEGORIES = ['name_frame', 'chat_bubble', 'entrance', 'emote_pack'] as const;
/** Dorm room pieces and wall/floor looks. */
export const ROOM_CATEGORIES = ['furniture', 'room_theme'] as const;
export const ITEM_CATEGORIES = [...AVATAR_CATEGORIES, 'hair_dye', ...SHOWOFF_CATEGORIES, 'drink', 'snack', ...ROOM_CATEGORIES] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  hair: 'Hair', eyes: 'Eyes', top: 'Top', bottom: 'Bottom', shoes: 'Shoes', head: 'Head', face: 'Face',
  back: 'Back', pet: 'Pet', effect: 'Effect', hair_dye: 'Hair dye', drink: 'Café drink', snack: 'Café snack',
  name_frame: 'Name frame', chat_bubble: 'Chat bubble', entrance: 'Entrance', emote_pack: 'Emote pack',
  furniture: 'Dorm furniture', room_theme: 'Dorm theme',
};

/**
 * Item keys the website can draw, read from the copy of its drawing code in
 * src/vendor/study-world (refresh with scripts/sync-study-world-art.mjs). Any
 * other avatar key needs pixel art added to the website first; until then the
 * website shows it as "coming soon". Café items are emoji, so any key works.
 */
export const DRAWN_KEYS: Partial<Record<ItemCategory, readonly string[]>> = {
  ...Object.fromEntries(AVATAR_CATEGORIES.map((cat) => [cat, ART_CATALOG[cat].map((item) => item.id)])),
  hair_dye: ART_COLORS.premiumHair.map((dye) => dye.id),
  name_frame: FRAMES.map((i) => i.id),
  chat_bubble: BUBBLES.map((i) => i.id),
  entrance: ENTRANCES.map((i) => i.id),
  emote_pack: EMOTE_PACKS.map((i) => i.id),
  furniture: FURNITURE.map((f) => f.id),
  room_theme: ROOM_THEMES.map((t) => t.id),
};
/** The website has a built map for this key. */
export const hasMapArt = (key: string) => isMapId(key);

export function hasDrawing(category: ItemCategory, key: string): boolean {
  const known = DRAWN_KEYS[category];
  return known ? known.includes(key) : true;
}

export type WorldItem = {
  id: string;
  category: ItemCategory;
  item_key: string;
  name: string;
  description: string | null;
  emoji: string | null;
  tier: ItemTier;
  price_coins: number | null;
  price_myr: number | null;
  status: ItemStatus;
  release_at: string | null;
  featured: boolean;
  sort_order: number;
  updated_at: string;
};

export type WorldMap = {
  map_key: string;
  name: string;
  description: string | null;
  status: ItemStatus;
  pro_only: boolean;
  room_limit: number;
  sort_order: number;
  updated_at: string;
};

export type CoinPack = {
  id: string;
  name: string;
  coins: number;
  bonus_coins: number;
  price_myr: number;
  status: ItemStatus;
  best_value: boolean;
  sort_order: number;
  /**
   * Website migration 202610140006: false hides FPX in checkout for this pack
   * (Curlec's FPX fee is at least RM1). Missing before that migration runs.
   */
  fpx_allowed?: boolean;
  updated_at: string;
};

export type WorldSettings = {
  world_open: boolean;
  closed_message: string | null;
  chat_enabled: boolean;
  shop_enabled: boolean;
  reports_enabled: boolean;
  starter_coins: number;
  premium_monthly_myr: number | null;
  premium_yearly_myr: number | null;
  announcement: string | null;
  updated_at: string;
};

export type WorldOverview = {
  players: number;
  players_7d: number;
  active_bans: number;
  open_reports: number;
  items_available: number;
  items_coming_soon: number;
  items_hidden: number;
  maps_available: number;
};

export type WorldPlayer = {
  user_id: string;
  nickname: string;
  show_real_name: boolean;
  look: Record<string, unknown>;
  updated_at: string;
  name: string | null;
  email: string | null;
  banned: boolean;
  ban_reason: string | null;
  ban_expires_at: string | null;
  report_count: number;
  total_count: number;
};

export type WorldBan = {
  id: string;
  user_id: string;
  nickname: string | null;
  name: string | null;
  email: string | null;
  reason: string;
  expires_at: string | null;
  created_at: string;
  banned_by_email: string | null;
  lifted_at: string | null;
  lift_reason: string | null;
  active: boolean;
};

export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';
export type WorldReport = {
  id: string;
  created_at: string;
  reason: string;
  details: string | null;
  map_key: string | null;
  room: string | null;
  status: ReportStatus;
  admin_note: string | null;
  handled_at: string | null;
  reporter_id: string | null;
  reporter_nickname: string | null;
  reporter_email: string | null;
  reported_user_id: string | null;
  reported_nickname: string | null;
  nickname_matches: { user_id: string; nickname: string; email: string | null; name: string | null }[];
};

export type WorldLogEntry = {
  id: string;
  created_at: string;
  admin_email: string | null;
  action: string;
  target_user_id: string | null;
  target: string | null;
  reason: string | null;
  details: Record<string, unknown>;
};

export const REPORT_REASON_LABEL: Record<string, string> = {
  harassment: 'Harassment',
  spam: 'Spam',
  inappropriate_name: 'Bad nickname',
  inappropriate_avatar: 'Bad avatar',
  cheating: 'Cheating',
  contact_sharing: 'Sharing contact details',
  other: 'Other',
};

/** Turns "relation does not exist" into a clear "run the SQL first" message. */
function explain(error: { code?: string; message?: string } | null): Error | null {
  if (!error) return null;
  const msg = error.message ?? 'Request failed';
  if (
    error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || error.code === '42883' ||
    /does not exist|could not find the (table|function)/i.test(msg)
  ) {
    return new Error(
      'RenTaman (RenTaman) tables are not in the database yet. Run the website migration 202610120001_study_world_profiles.sql, then gradeup-mobile/supabase/migrations/20261012000001_study_world_admin.sql in the Supabase SQL Editor.',
    );
  }
  return new Error(msg);
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args ?? {});
  const err = explain(error);
  if (err) throw err;
  return data as T;
}

export const getWorldOverview = () => rpc<WorldOverview>('admin_study_world_overview');

export async function listWorldItems(): Promise<WorldItem[]> {
  const { data, error } = await supabase
    .from('study_world_items')
    .select('*')
    .order('category')
    .order('sort_order')
    .order('name');
  const err = explain(error);
  if (err) throw err;
  return (data ?? []) as WorldItem[];
}

export type WorldItemInput = Omit<WorldItem, 'id' | 'updated_at'>;

export async function saveWorldItem(id: string | null, input: WorldItemInput): Promise<void> {
  const row = { ...input, price_coins: input.tier === 'coins' ? input.price_coins : input.price_coins ?? null };
  const { error } = id
    ? await supabase.from('study_world_items').update(row).eq('id', id)
    : await supabase.from('study_world_items').insert(row);
  const err = explain(error);
  if (err) throw err;
}

export async function setWorldItemsStatus(ids: string[], status: ItemStatus): Promise<number> {
  if (!ids.length) return 0;
  const { data, error } = await supabase.from('study_world_items').update({ status }).in('id', ids).select('id');
  const err = explain(error);
  if (err) throw err;
  return data?.length ?? 0;
}

export async function deleteWorldItem(id: string): Promise<void> {
  const { error } = await supabase.from('study_world_items').delete().eq('id', id);
  const err = explain(error);
  if (err) throw err;
}

export async function listWorldMaps(): Promise<WorldMap[]> {
  const { data, error } = await supabase.from('study_world_maps').select('*').order('sort_order');
  const err = explain(error);
  if (err) throw err;
  return (data ?? []) as WorldMap[];
}

export async function saveWorldMap(map: Omit<WorldMap, 'updated_at'>, isNew: boolean): Promise<void> {
  const { error } = isNew
    ? await supabase.from('study_world_maps').insert(map)
    : await supabase.from('study_world_maps').update(map).eq('map_key', map.map_key);
  const err = explain(error);
  if (err) throw err;
}

export async function listCoinPacks(): Promise<CoinPack[]> {
  const { data, error } = await supabase.from('study_world_coin_packs').select('*').order('sort_order');
  const err = explain(error);
  if (err) throw err;
  return (data ?? []) as CoinPack[];
}

export async function saveCoinPack(id: string | null, pack: Omit<CoinPack, 'id' | 'updated_at'>): Promise<void> {
  const { error } = id
    ? await supabase.from('study_world_coin_packs').update(pack).eq('id', id)
    : await supabase.from('study_world_coin_packs').insert(pack);
  const err = explain(error);
  if (err) throw err;
}

export async function deleteCoinPack(id: string): Promise<void> {
  const { error } = await supabase.from('study_world_coin_packs').delete().eq('id', id);
  const err = explain(error);
  if (err) throw err;
}

// ─── Coin purchases (website migration 202610130010_rencity_coin_purchases.sql) ───

/** The coin conversion rate and switches (one row). */
export type CoinConfig = {
  /** Coins per RM1. Null: each pack's own `coins` is used. */
  coins_per_myr: number | null;
  purchases_enabled: boolean;
  /** Most one player may spend on coins per month (Malaysia time). Null: no limit. */
  monthly_limit_myr: number | null;
  updated_at: string | null;
};

export type CoinOrderStatus = 'created' | 'paid' | 'partially_refunded' | 'refunded';

export type CoinOrder = {
  id: string;
  /** Null once the player's account is deleted (the record is kept). */
  user_id: string | null;
  pack_name: string;
  price_myr: number;
  coins_per_myr: number | null;
  coins: number;
  status: CoinOrderStatus;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  refunded_sen: number;
  coins_reclaimed: number;
  coins_unrecovered: number;
  created_at: string;
  paid_at: string | null;
  /** From 202610140006: how it was paid ("card", "fpx", "wallet", ...). */
  payment_method?: string | null;
  /** From 202610140006: false if the pack hid FPX at checkout. */
  fpx_allowed?: boolean;
};

const COIN_MIGRATION_MISSING =
  'Coin purchases are not in the database yet. Run the website migration 202610130010_rencity_coin_purchases.sql in the Supabase SQL Editor.';
const isMissing = (error: { code?: string; message?: string }) =>
  error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message ?? '');

/**
 * Coins a player gets for a pack (before any order is made). Mirrors
 * study_world_coin_pack_base, which uses exact decimals: work in sen and
 * hundredths of a coin, because 19.9 * 50 in floating point is 994.999…
 * (floor 994) while the server gives 995.
 */
export function packCoins(pack: Pick<CoinPack, 'coins' | 'bonus_coins' | 'price_myr'>, rate: number | null) {
  const base =
    rate == null
      ? Math.max(0, pack.coins)
      : Math.floor((Math.round(Number(pack.price_myr) * 100) * Math.round(rate * 100)) / 10000);
  return { base, total: base + Math.max(0, pack.bonus_coins ?? 0) };
}

export async function getCoinConfig(): Promise<CoinConfig | null> {
  const { data, error } = await supabase.from('study_world_coin_config').select('*').eq('id', true).maybeSingle();
  if (error) throw isMissing(error) ? new Error(COIN_MIGRATION_MISSING) : new Error(error.message);
  if (!data) return null;
  return {
    coins_per_myr: data.coins_per_myr == null ? null : Number(data.coins_per_myr),
    purchases_enabled: data.purchases_enabled !== false,
    monthly_limit_myr: data.monthly_limit_myr == null ? null : Number(data.monthly_limit_myr),
    updated_at: data.updated_at ?? null,
  };
}

export async function saveCoinConfig(patch: Omit<CoinConfig, 'updated_at'>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('study_world_coin_config')
    .upsert(
      { id: true, ...patch, updated_at: new Date().toISOString(), updated_by: auth.user?.id ?? null },
      { onConflict: 'id' },
    );
  if (error) throw isMissing(error) ? new Error(COIN_MIGRATION_MISSING) : new Error(error.message);
}

/** Newest coin orders first (admins can read all of them). */
export async function listCoinOrders(limit = 50): Promise<CoinOrder[]> {
  const { data, error } = await supabase
    .from('study_world_coin_orders')
    // '*': newer columns (payment_method, fpx_allowed) show up once their migration has run.
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw isMissing(error) ? new Error(COIN_MIGRATION_MISSING) : new Error(error.message);
  return (data ?? []) as CoinOrder[];
}

export async function getWorldSettings(): Promise<WorldSettings | null> {
  const { data, error } = await supabase.from('study_world_settings').select('*').eq('id', true).maybeSingle();
  const err = explain(error);
  if (err) throw err;
  return (data as WorldSettings | null) ?? null;
}

export async function saveWorldSettings(patch: Partial<Omit<WorldSettings, 'updated_at'>>): Promise<void> {
  const { error } = await supabase.from('study_world_settings').upsert({ id: true, ...patch }, { onConflict: 'id' });
  const err = explain(error);
  if (err) throw err;
}

export const listWorldPlayers = (query: string, filter: 'all' | 'banned' | 'reported', limit: number, offset: number) =>
  rpc<WorldPlayer[]>('admin_study_world_players', { p_query: query || null, p_filter: filter, p_limit: limit, p_offset: offset });

export const banWorldPlayer = (userId: string, reason: string, days: number | null) =>
  rpc<string>('admin_study_world_ban', { p_user_id: userId, p_reason: reason, p_days: days });

export const unbanWorldPlayer = (userId: string, reason: string) =>
  rpc<number>('admin_study_world_unban', { p_user_id: userId, p_reason: reason });

export const listWorldBans = (includePast: boolean) =>
  rpc<WorldBan[]>('admin_study_world_bans', { p_include_past: includePast });

export const fixWorldAvatar = (userId: string, resetLook: boolean, newNickname: string, reason: string) =>
  rpc<boolean>('admin_study_world_fix_avatar', {
    p_user_id: userId,
    p_reset_look: resetLook,
    p_new_nickname: newNickname || null,
    p_reason: reason,
  });

export const listWorldReports = (status: ReportStatus | 'all' | 'open') =>
  rpc<WorldReport[]>('admin_study_world_reports', { p_status: status });

export const updateWorldReport = (id: string, status: ReportStatus, note: string) =>
  rpc<boolean>('admin_study_world_update_report', { p_id: id, p_status: status, p_note: note || null });

export const listWorldLog = (limit = 150) => rpc<WorldLogEntry[]>('admin_study_world_log', { p_limit: limit });

/** A saved look as stored in the database, made safe to draw (missing parts use the default). */
export function toLook(raw: Record<string, unknown> | null | undefined): AvatarLook {
  const look = { ...DEFAULT_LOOK };
  if (!raw) return look;
  (Object.keys(DEFAULT_LOOK) as (keyof AvatarLook)[]).forEach((key) => {
    const value = raw[key];
    if (typeof value === 'string' && value) look[key] = value;
  });
  return look;
}

export type PlayerDetail = {
  world: { nickname: string; look: Record<string, unknown>; show_real_name: boolean; updated_at: string } | null;
  account: {
    name: string | null;
    email: string | null;
    student_id: string | null;
    university_id: string | null;
    university_name: string | null;
    country: string | null;
    device_platform: string | null;
    status: string | null;
    subscription_plan: string | null;
    subscription_status: string | null;
    subscription_expires_at: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
  } | null;
  bans: { id: string; reason: string; expires_at: string | null; created_at: string; banned_by_email: string | null; lifted_at: string | null; lift_reason: string | null; active: boolean }[];
  reports_against: { id: string; created_at: string; reason: string; details: string | null; status: ReportStatus; reported_nickname: string | null; map_key: string | null; room: string | null; by_account: boolean }[];
  reports_sent: { id: string; created_at: string; reason: string; status: ReportStatus; reported_nickname: string | null }[];
  admin_actions: { id: string; created_at: string; action: string; reason: string | null; admin_email: string | null }[];
};

export async function getPlayerDetail(userId: string): Promise<PlayerDetail> {
  const { data, error } = await supabase.rpc('admin_study_world_player_detail', { p_user_id: userId });
  if (error && (error.code === 'PGRST202' || /could not find the function/i.test(error.message))) {
    throw new Error('Player details need one more SQL file: gradeup-mobile/supabase/migrations/20261012000002_study_world_player_detail.sql. Run it in the Supabase SQL Editor.');
  }
  const err = explain(error);
  if (err) throw err;
  return data as PlayerDetail;
}

/** Same channel name as the website (Rencana.-main src/lib/study-world/remote.ts). */
const PRESENCE_CHANNEL = 'study-world-presence';

export type LiveCounts = {
  connected: boolean;
  /** The channel refused us (not signed in as admin, or Realtime policies missing). */
  unavailable?: boolean;
  total: number;
  byMap: Record<string, { total: number; rooms: Record<string, number> }>;
};

/**
 * Live count of real people inside Study World, per map and room. The website
 * sends only { map, room } per open tab — no account, nickname or name — so
 * this can count people but not say who they are.
 */
// One shared subscription however many parts of the page show the count.
let liveLatest: LiveCounts = { connected: false, total: 0, byMap: {} };
const liveListeners = new Set<(c: LiveCounts) => void>();
let liveChannel: ReturnType<typeof supabase.channel> | null = null;

function startLive() {
  // Private channel: Realtime only lets in signed-in players while the world is
  // open, and admins (website migration 202610120010_study_world_private_channels.sql).
  // The admin only listens; it never announces itself, so it isn't counted.
  const channel = supabase.channel(PRESENCE_CHANNEL, { config: { private: true } });
  liveChannel = channel;
  const publish = (next: LiveCounts) => {
    liveLatest = next;
    liveListeners.forEach((fn) => fn(next));
  };
  const recount = () => {
    const byMap: LiveCounts['byMap'] = {};
    let total = 0;
    Object.values(channel.presenceState()).forEach((entries) => {
      // One entry per open tab; the newest wins if a tab re-tracked.
      const entry = (entries as { map?: unknown; room?: unknown }[]).at(-1);
      if (!entry || typeof entry.map !== 'string') return;
      const room = typeof entry.room === 'string' ? entry.room : 'Unknown room';
      // Private rooms are not shown in the admin (older website builds still sent them).
      if (/^private room/i.test(room)) return;
      const slot = (byMap[entry.map] ??= { total: 0, rooms: {} });
      slot.total += 1;
      slot.rooms[room] = (slot.rooms[room] ?? 0) + 1;
      total += 1;
    });
    publish({ connected: true, total, byMap });
  };
  channel.on('presence', { event: 'sync' }, recount);
  // Hand Realtime the admin's current sign-in so the private channel lets us in.
  void supabase.realtime.setAuth().finally(() => {
    if (liveChannel !== channel) return;
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') recount();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')
        publish({ ...liveLatest, connected: false, unavailable: status === 'CHANNEL_ERROR' });
    });
  });
}

export function useLiveCounts(): LiveCounts {
  const [counts, setCounts] = useState<LiveCounts>(liveLatest);
  useEffect(() => {
    liveListeners.add(setCounts);
    if (!liveChannel) startLive();
    return () => {
      liveListeners.delete(setCounts);
      if (liveListeners.size === 0 && liveChannel) {
        void supabase.removeChannel(liveChannel);
        liveChannel = null;
        liveLatest = { connected: false, total: 0, byMap: {} };
      }
    };
  }, []);
  return counts;
}

// ─── Chat filter words ───────────────────────────────────────────────────────
// Schema: gradeup-mobile/supabase/migrations/20261012000003_study_world_chat_words.sql
// Only single normalised words are stored: never who wrote them or the message.

export type ChatWordStatus = 'pending' | 'blocked' | 'safe';
export const CHAT_WORD_CATEGORIES = ['profanity', 'sexual', 'hate', 'harassment', 'contact', 'other'] as const;
export type ChatWordCategory = (typeof CHAT_WORD_CATEGORIES)[number];
export type ChatWord = {
  word: string;
  status: ChatWordStatus;
  category: ChatWordCategory | null;
  hits: number;
  first_seen: string;
  last_seen: string;
  note: string | null;
  reviewed_at: string | null;
};

function chatWordsError(error: { code?: string; message?: string } | null): Error | null {
  const err = explain(error);
  if (err && /not in the database yet/.test(err.message))
    return new Error('The chat word list is not in the database yet. Run gradeup-mobile/supabase/migrations/20261012000003_study_world_chat_words.sql in the Supabase SQL Editor.');
  return err;
}

export async function listChatWords(): Promise<ChatWord[]> {
  const { data, error } = await supabase
    .from('study_world_chat_words')
    .select('word,status,category,hits,first_seen,last_seen,note,reviewed_at')
    .order('last_seen', { ascending: false })
    .limit(2000);
  const err = chatWordsError(error);
  if (err) throw err;
  return (data ?? []) as ChatWord[];
}

export async function saveChatWord(word: string, status: ChatWordStatus, category: ChatWordCategory | null, note: string | null): Promise<void> {
  const { error } = await supabase
    .from('study_world_chat_words')
    .upsert({ word, status, category, note }, { onConflict: 'word' });
  const err = chatWordsError(error);
  if (err) throw err;
}

export async function deleteChatWord(word: string): Promise<void> {
  const { error } = await supabase.from('study_world_chat_words').delete().eq('word', word);
  const err = chatWordsError(error);
  if (err) throw err;
}
