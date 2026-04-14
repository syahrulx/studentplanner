package expo.modules.homewidgetbridge

import android.content.Context
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class HomeWidgetBridgeModule : Module() {
  companion object {
    private const val TAG = "GradeUpWidget"
  }

  override fun definition() = ModuleDefinition {
    Name("HomeWidgetBridge")

    Function("updateSnapshot") { json: String ->
      val ctx = appContext.reactContext ?: return@Function
      val prefs = ctx.getSharedPreferences(GradeUpTodayWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
      val debug = JSONObject()
        .put("event", "updateSnapshot")
        .put("timestamp", System.currentTimeMillis())
        .put("jsonLength", json.length)

      try {
        val parsed = JSONObject(json)
        debug.put("dateISO", parsed.optString("dateISO", ""))
        debug.put("signedIn", parsed.optBoolean("signedIn", false))
        debug.put("tasksCount", parsed.optJSONArray("tasks")?.length() ?: 0)
        debug.put("classesCount", parsed.optJSONArray("classes")?.length() ?: 0)
      } catch (_: Exception) {
        debug.put("parseError", true)
      }

      prefs.edit()
        .putString(GradeUpTodayWidgetProvider.PREFS_KEY_JSON, json)
        .putString(GradeUpTodayWidgetProvider.PREFS_KEY_DEBUG, debug.toString())
        .apply()

      Log.d(TAG, "updateSnapshot $debug")
      GradeUpTodayWidgetProvider.refreshAllWidgets(ctx)
      WidgetRefreshScheduler.scheduleNextMidnight(ctx.applicationContext)
    }

    Function("getDebugSnapshot") {
      val ctx = appContext.reactContext ?: return@Function null
      val prefs = ctx.getSharedPreferences(GradeUpTodayWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
      prefs.getString(GradeUpTodayWidgetProvider.PREFS_KEY_DEBUG, null)
    }
  }
}
