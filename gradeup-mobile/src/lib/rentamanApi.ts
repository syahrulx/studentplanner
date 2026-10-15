import { supabase } from './supabase';
import { safeLook } from './rentamanAvatar';
import type { AvatarLook } from '../vendor/rentaman/avatar';

/** `shown`: the student switched "Show my RenTaman avatar" on. Off by default. */
export type RentamanAvatar = { nickname: string; look: AvatarLook; shown: boolean };

/**
 * Asks rentaman_avatar_for (migration 20261015000003), which also honours the
 * student's "RenTaman avatar" hide switch. Until that migration runs, falls
 * back to reading the table directly, which only ever returns your own row.
 */
export async function fetchRentamanAvatar(userId: string): Promise<RentamanAvatar | null> {
  const rpc = await supabase.rpc('rentaman_avatar_for', { p_user_id: userId }).maybeSingle();
  let row = rpc.data as { nickname?: unknown; look?: unknown; shown?: unknown } | null;
  if (rpc.error) {
    const code = (rpc.error as { code?: string }).code;
    // PGRST202 / 42883: the function isn't there yet.
    if (code !== 'PGRST202' && code !== '42883') throw rpc.error;
    const direct = await supabase.from('study_world_profiles').select('nickname, look').eq('user_id', userId).maybeSingle();
    if (direct.error) {
      // 42P01 / PGRST205: the RenTaman tables are not in this database.
      const c = (direct.error as { code?: string }).code;
      if (c === '42P01' || c === 'PGRST205') return null;
      throw direct.error;
    }
    row = direct.data as typeof row;
  }
  if (!row || !row.look || typeof row.look !== 'object') return null;
  return {
    nickname: String(row.nickname ?? '').trim(),
    look: safeLook(row.look as Partial<AvatarLook>),
    // Missing before migration 20261015000004: treat as off.
    shown: row.shown === true,
  };
}

/** Turns the student's own "Show my RenTaman avatar" switch on or off. */
export async function setRentamanShown(userId: string, shown: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ rentaman_shown: shown }).eq('id', userId);
  if (error) throw error;
}
