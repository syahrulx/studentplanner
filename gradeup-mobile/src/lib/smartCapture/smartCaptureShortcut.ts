import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../supabase';

/**
 * Where the "Add shortcut" button on the Smart automations screen points.
 *
 * The iCloud link for the "Plan from screenshot" shortcut is remote config
 * (`app_config.smart_capture_shortcut_url`) so it can be republished or rotated
 * without an app update. The last known value is cached, so the screen renders
 * the right button immediately and still works offline.
 *
 * When nothing is configured the app opens the Shortcuts app instead — the
 * on-screen steps describe how to build the shortcut by hand.
 */

const CACHE_KEY = 'smart_capture_shortcut_url';

/** Opens the Shortcuts app itself; used until a shortcut link is published. */
export const SHORTCUTS_APP_URL = 'shortcuts://';

export interface ShortcutLink {
  url: string;
  /** False when we fell back to opening the Shortcuts app. */
  isPublished: boolean;
}

const FALLBACK: ShortcutLink = { url: SHORTCUTS_APP_URL, isPublished: false };

/** iCloud share links look like https://www.icloud.com/shortcuts/<id>. */
function isUsableShortcutUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim());
}

function toLink(value: unknown): ShortcutLink | null {
  return isUsableShortcutUrl(value) ? { url: value.trim(), isPublished: true } : null;
}

/** Last value we saw, for an instant first paint. Never blocks on the network. */
export async function getCachedShortcutLink(): Promise<ShortcutLink> {
  try {
    return toLink(await AsyncStorage.getItem(CACHE_KEY)) ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/**
 * Reads the current link from `app_config` and refreshes the cache.
 * Falls back to the cached value on any network or permission failure.
 */
export async function fetchShortcutLink(): Promise<ShortcutLink> {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('smart_capture_shortcut_url')
      .eq('id', 'default')
      .maybeSingle();

    if (error) return await getCachedShortcutLink();

    const link = toLink(data?.smart_capture_shortcut_url);
    if (link) {
      await AsyncStorage.setItem(CACHE_KEY, link.url).catch(() => {});
      return link;
    }

    // Explicitly cleared upstream — stop offering a link that no longer works.
    await AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
    return FALLBACK;
  } catch {
    return await getCachedShortcutLink();
  }
}
