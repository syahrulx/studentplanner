import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

/**
 * iCloud links to shortcuts Rencana asks students to install.
 *
 * Each link is remote config (a column on `app_config`) so a shortcut can be
 * republished or rotated without an app update. The last known value is
 * cached, so a setup screen renders the right button immediately and still
 * works offline.
 *
 * When nothing is configured the app opens the Shortcuts app instead and the
 * on-screen steps describe how to build the shortcut by hand.
 */

/** Opens the Shortcuts app itself; used until a shortcut link is published. */
export const SHORTCUTS_APP_URL = 'shortcuts://';

export interface ShortcutLink {
  url: string;
  /** False when we fell back to opening the Shortcuts app. */
  isPublished: boolean;
}

export interface ShortcutLinkSource {
  /** Last value we saw, for an instant first paint. Never blocks on the network. */
  getCached(): Promise<ShortcutLink>;
  /**
   * Reads the current link from `app_config` and refreshes the cache.
   * Falls back to the cached value on any network or permission failure.
   */
  fetch(): Promise<ShortcutLink>;
}

const FALLBACK: ShortcutLink = { url: SHORTCUTS_APP_URL, isPublished: false };

/** iCloud share links look like https://www.icloud.com/shortcuts/<id>. */
function isUsableShortcutUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim());
}

function toLink(value: unknown): ShortcutLink | null {
  return isUsableShortcutUrl(value) ? { url: value.trim(), isPublished: true } : null;
}

export function createShortcutLinkSource(column: string, cacheKey: string): ShortcutLinkSource {
  const getCached = async (): Promise<ShortcutLink> => {
    try {
      return toLink(await AsyncStorage.getItem(cacheKey)) ?? FALLBACK;
    } catch {
      return FALLBACK;
    }
  };

  const fetch = async (): Promise<ShortcutLink> => {
    try {
      const { data, error } = await supabase
        .from('app_config')
        .select(column)
        .eq('id', 'default')
        .maybeSingle();

      if (error) return await getCached();

      const link = toLink((data as Record<string, unknown> | null)?.[column]);
      if (link) {
        await AsyncStorage.setItem(cacheKey, link.url).catch(() => {});
        return link;
      }

      // Explicitly cleared upstream — stop offering a link that no longer works.
      await AsyncStorage.removeItem(cacheKey).catch(() => {});
      return FALLBACK;
    } catch {
      return await getCached();
    }
  };

  return { getCached, fetch };
}
