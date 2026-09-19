import { Platform } from 'react-native';

/**
 * Start the Mapbox map engine before `@rnmapbox/maps` is imported (Android only).
 *
 * Mapbox no longer starts itself at process start — `plugins/withLazyMapboxInit.js`
 * removes its AndroidX App Startup entries, which is what kept the map engine out of
 * background process starts and fixed the ANR. The engine has to be started explicitly
 * instead, and it must happen before the import: `@rnmapbox/maps` reads native constants
 * at import time (`RNMBXModule.StyleURL`), and those touch `com.mapbox.maps.Style`, which
 * throws when the SDK has not been initialised.
 *
 * Returns the initializer class name on success, or null when Mapbox could not be started
 * (Expo Go, iOS, web, or a Mapbox version whose initializer is named differently). On null
 * the caller should still try the import; failing that, the map falls back to its placeholder.
 */
export function ensureMapboxNativeInit(): string | null {
  if (Platform.OS !== 'android') return null;
  try {
    const { requireNativeModule } = require('expo-modules-core') as typeof import('expo-modules-core');
    return requireNativeModule<{ ensureInitialized: () => string | null }>(
      'MapboxLazyInit',
    ).ensureInitialized();
  } catch {
    // Module missing (Expo Go, or a build made before this module existed).
    return null;
  }
}
