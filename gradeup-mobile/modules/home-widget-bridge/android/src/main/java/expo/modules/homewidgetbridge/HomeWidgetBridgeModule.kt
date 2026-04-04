package expo.modules.homewidgetbridge

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HomeWidgetBridgeModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("HomeWidgetBridge")

    Function("updateSnapshot") { json: String ->
      val ctx = appContext.reactContext ?: return@Function
      val prefs = ctx.getSharedPreferences(GradeUpTodayWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
      prefs.edit().putString(GradeUpTodayWidgetProvider.PREFS_KEY_JSON, json).apply()
      GradeUpTodayWidgetProvider.refreshAllWidgets(ctx)
      WidgetRefreshScheduler.scheduleNextMidnight(ctx.applicationContext)
    }
  }
}
