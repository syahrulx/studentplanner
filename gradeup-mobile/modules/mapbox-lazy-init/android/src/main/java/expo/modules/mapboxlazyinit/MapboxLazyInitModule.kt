package expo.modules.mapboxlazyinit

import android.util.Log
import androidx.startup.AppInitializer
import androidx.startup.Initializer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Starts the Mapbox map engine on demand, so it does not load during process start.
 *
 * `withLazyMapboxInit` removes Mapbox's AndroidX App Startup entries from the merged
 * manifest, which stops `System.loadLibrary` running inside
 * `ActivityThread.handleBindApplication` on every process start — including the headless
 * background starts used for a notification or a widget refresh, where it caused ANRs.
 *
 * Mapbox does not then start itself on first touch: it throws. So the same initializer is
 * run here through the documented AndroidX hook, `AppInitializer.initializeComponent`,
 * before any Mapbox class is touched from JavaScript.
 *
 * The initializer class lives in Mapbox's Maven artifact, not in node_modules, so it is
 * reached by reflection: this module builds without the Mapbox dependency, and the names
 * below stay in step with the ones the plugin removes.
 */
class MapboxLazyInitModule : Module() {
  companion object {
    private const val TAG = "MapboxLazyInit"

    /** Tried in order; the first one present wins. Keep in step with withLazyMapboxInit.js. */
    private val MAPS_INITIALIZERS = listOf(
      "com.mapbox.maps.loader.MapboxMapsInitializer",
      "com.mapbox.maps.MapboxMapsInitializer",
    )

    @Volatile
    private var initializedBy: String? = null
  }

  override fun definition() = ModuleDefinition {
    Name("MapboxLazyInit")

    // Synchronous on purpose: JavaScript must be able to complete this before it
    // requires @rnmapbox/maps, whose import reads native constants that touch Mapbox.
    Function("ensureInitialized") {
      ensureInitialized()
    }
  }

  /** Class name that initialised Mapbox, or null when none of the candidates worked. */
  private fun ensureInitialized(): String? {
    initializedBy?.let { return it }

    val context = appContext.reactContext?.applicationContext ?: run {
      Log.w(TAG, "No application context yet; Mapbox not initialised.")
      return null
    }
    val appInitializer = AppInitializer.getInstance(context)

    for (name in MAPS_INITIALIZERS) {
      try {
        val raw = Class.forName(name)
        if (!Initializer::class.java.isAssignableFrom(raw)) {
          Log.w(TAG, "$name is not an androidx.startup.Initializer; skipping.")
          continue
        }
        // initializeComponent infers its type parameter from the argument, and a
        // star projection gives it nothing to infer from. The initialised object
        // is discarded, so Any is as good a T as the real one.
        @Suppress("UNCHECKED_CAST")
        val cls = raw as Class<out Initializer<Any>>
        appInitializer.initializeComponent(cls)
        Log.i(TAG, "Mapbox initialised on demand via $name")
        initializedBy = name
        return name
      } catch (_: ClassNotFoundException) {
        // Expected for whichever name this Mapbox version does not ship.
      } catch (t: Throwable) {
        Log.w(TAG, "initializeComponent($name) failed: ${t.javaClass.simpleName}: ${t.message}")
      }
    }

    Log.w(TAG, "No Mapbox initializer could be started; the map will fall back to the placeholder.")
    return null
  }
}
