/**
 * Expo config plugin: stop the Mapbox Android SDK loading itself at process start.
 *
 * Mapbox registers with AndroidX App Startup, so `androidx.startup.InitializationProvider`
 * loads Mapbox's native map engine during `ActivityThread.handleBindApplication` — i.e. every
 * time Android creates the app process, including the headless background starts used to
 * deliver a notification or refresh a home-screen widget. Loading a map engine for a job that
 * will never draw a map is pure cost, and on a slow or dozing device it has been long enough
 * for Android to declare the app unresponsive:
 *
 *   ActivityThread.handleBindApplication
 *     androidx.startup.InitializationProvider.onCreate
 *       com.mapbox.common.BaseMapboxInitializer.create
 *         com.mapbox.maps.loader.MapboxMapsInitializerImpl.create
 *           MapboxLibraryLoader.load → System.loadLibrary → dlopen → blocked
 *
 * Removing these entries does NOT leave Mapbox to start on first use — it throws instead
 * (build 158 shipped that way, and the Community tab fell back to its placeholder). The
 * missing half is `modules/mapbox-lazy-init`, which runs the same initializer through
 * `AppInitializer.initializeComponent` before community.tsx imports @rnmapbox/maps. Ship the
 * two together.
 *
 * Note none of this can be verified without an Android build: the classes live in Mapbox's
 * Maven artifact, not in node_modules. Confirm the Community map still renders before shipping.
 *
 * Only the Mapbox entries are removed. The provider itself stays — WorkManager registers here
 * too, and the home-screen widget's midnight refresh depends on it.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const TOOLS_NS = 'http://schemas.android.com/tools';

// Only the maps initializer is removed: that is the one that reaches
// MapboxLibraryLoader.load → System.loadLibrary, per the ANR stack. The common initializer
// (com.mapbox.common.MapboxSDKCommonInitializer) is deliberately left alone — it is cheap,
// and MapboxMapsInitializer declares it as a dependency, so AndroidX still runs it first
// when mapbox-lazy-init starts the maps one.
//
// The exact entry name lives in Mapbox's AAR and cannot be read from here, so both plausible
// names are listed. `tools:node="remove"` against an entry that was never merged is a no-op,
// which makes over-listing safe — but it also means a wrong list fails silently. Keep this in
// step with MAPS_INITIALIZERS in MapboxLazyInitModule.kt, which re-runs the same class.
const MAPBOX_INITIALIZERS = [
  'com.mapbox.maps.loader.MapboxMapsInitializer',
  'com.mapbox.maps.MapboxMapsInitializer',
];

module.exports = function withLazyMapboxInit(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults;

    // `tools:node` is inert unless the namespace is declared on <manifest>.
    manifest.manifest.$ = manifest.manifest.$ ?? {};
    if (!manifest.manifest.$['xmlns:tools']) {
      manifest.manifest.$['xmlns:tools'] = TOOLS_NS;
    }

    const application = manifest.manifest.application?.[0];
    if (!application) {
      throw new Error('withLazyMapboxInit: no <application> node in AndroidManifest.xml');
    }

    application.provider = application.provider ?? [];
    let provider = application.provider.find(
      (p) => p.$?.['android:name'] === 'androidx.startup.InitializationProvider',
    );

    if (!provider) {
      // Merge onto the library-supplied provider rather than declaring a new one.
      provider = {
        $: {
          'android:name': 'androidx.startup.InitializationProvider',
          'android:authorities': '${applicationId}.androidx-startup',
          'android:exported': 'false',
          'tools:node': 'merge',
        },
      };
      application.provider.push(provider);
    } else {
      provider.$['tools:node'] = 'merge';
    }

    provider['meta-data'] = provider['meta-data'] ?? [];
    for (const name of MAPBOX_INITIALIZERS) {
      const already = provider['meta-data'].some((m) => m.$?.['android:name'] === name);
      if (already) continue;
      provider['meta-data'].push({
        $: { 'android:name': name, 'tools:node': 'remove' },
      });
    }

    return androidConfig;
  });
};
