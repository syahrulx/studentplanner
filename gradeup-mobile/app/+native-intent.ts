import { enqueueCapture } from '@/src/lib/smartCapture/captureInboxStore';

/**
 * expo-router hands every incoming URL through here before it becomes a route.
 *
 * Smart Capture URLs (`rencana://expo-sharing` from the share extension /
 * ACTION_SEND, and `rencana://smart-capture` from anything we trigger
 * ourselves) are swallowed: the capture goes into the inbox and
 * `SmartCaptureLauncher` opens the sheet once the app is genuinely ready.
 *
 * Navigating straight to `/smart-capture` would race the auth gate in
 * app/(auth)/_layout.tsx, whose `<Redirect href="/(tabs)" />` replaces whatever
 * is focused — the same bounce that reset-password had to work around — and
 * would lose the capture entirely when the user is signed out.
 *
 * Keep this module dependency-light: it is evaluated while expo-router builds
 * its linking config, before the root layout mounts.
 */

// React Native's URL polyfill has no `hostname`, so parse the parts by hand.
const URL_PARTS = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)[^?#]*(?:\?([^#]*))?/i;

const SHARE_HOSTS = new Set(['expo-sharing', 'smart-capture']);

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string | null {
  try {
    const match = URL_PARTS.exec(path);
    const host = match?.[1]?.toLowerCase();
    if (!host || !SHARE_HOSTS.has(host)) return path;

    const query = match?.[2] ?? '';
    const source = /(?:^|&)source=back_tap(?:&|$)/.test(query) ? 'back_tap' : 'share';
    enqueueCapture({ source });
    // `null` means "do not navigate": on a cold start the app opens at its
    // normal route, on a warm one it stays where it is. Either way the launcher
    // takes it from here.
    return null;
  } catch {
    return path;
  }
}
