import { createShortcutLinkSource } from '../shortcutLink';

export { SHORTCUTS_APP_URL, type ShortcutLink } from '../shortcutLink';

/**
 * Where the "Add shortcut" button on the Smart automations screen points: the
 * iCloud link for the "Plan from screenshot" shortcut, stored in
 * `app_config.smart_capture_shortcut_url`. See src/lib/shortcutLink.ts.
 */
const source = createShortcutLinkSource('smart_capture_shortcut_url', 'smart_capture_shortcut_url');

export const getCachedShortcutLink = source.getCached;
export const fetchShortcutLink = source.fetch;
