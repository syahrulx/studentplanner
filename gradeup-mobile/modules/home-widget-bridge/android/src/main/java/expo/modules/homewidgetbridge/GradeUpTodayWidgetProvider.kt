package expo.modules.homewidgetbridge

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.widget.RemoteViews
import androidx.work.WorkManager
import org.json.JSONArray
import org.json.JSONObject

class GradeUpTodayWidgetProvider : AppWidgetProvider() {

  override fun onEnabled(context: Context) {
    super.onEnabled(context)
    WidgetRefreshScheduler.scheduleNextMidnight(context.applicationContext)
  }

  override fun onDisabled(context: Context) {
    WorkManager.getInstance(context.applicationContext).cancelUniqueWork(WidgetRefreshScheduler.UNIQUE_WORK_NAME)
    super.onDisabled(context)
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    val json = readSnapshotJson(context)
    val views = buildRemoteViews(context, json)
    appWidgetManager.updateAppWidget(appWidgetIds, views)
  }

  companion object {
    const val PREFS_NAME = "gradeup_home_widget_v1"
    const val PREFS_KEY_JSON = "snapshot_json"

    private const val DL_HOME = "rencana:///(tabs)"
    private const val DL_PLANNER = "rencana:///(tabs)/planner"
    private const val DL_TIMETABLE = "rencana:///(tabs)/timetable"

    private const val REQ_ROOT = 0x4750_5055
    private const val REQ_HOME = 0x4750_5048
    private const val REQ_PLANNER = 0x4750_5050
    private const val REQ_TIMETABLE = 0x4750_5054

    fun refreshAllWidgets(context: Context) {
      val mgr = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, GradeUpTodayWidgetProvider::class.java)
      val ids = mgr.getAppWidgetIds(component)
      if (ids.isEmpty()) return
      val json = readSnapshotJson(context)
      val views = buildRemoteViews(context, json)
      mgr.updateAppWidget(ids, views)
    }

    private fun readSnapshotJson(context: Context): String? {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      return prefs.getString(PREFS_KEY_JSON, null)
    }

    private fun buildRemoteViews(context: Context, raw: String?): RemoteViews {
      val rv = RemoteViews(context.packageName, R.layout.widget_gradeup_today)
      val json = parseJson(raw)

      if (json == null) {
        rv.setTextViewText(R.id.widget_greeting, "Rencana")
        rv.setTextViewText(R.id.widget_tasks, "Open the app to load your schedule.")
        rv.setTextViewText(R.id.widget_classes, "")
        attachLaunchClicks(context, rv)
        return rv
      }

      if (!json.optBoolean("signedIn", false)) {
        rv.setTextViewText(R.id.widget_greeting, "Rencana")
        rv.setTextViewText(R.id.widget_tasks, "Sign in in the app to see today’s tasks and classes.")
        rv.setTextViewText(R.id.widget_classes, "")
        attachLaunchClicks(context, rv)
        return rv
      }

      val today = WidgetRefreshScheduler.localTodayISO()
      val snapDate = json.optString("dateISO").trim().take(10)
      val stale = snapDate.length == 10 && snapDate != today

      val greeting = json.optString("greeting", "Rencana")
      rv.setTextViewText(R.id.widget_greeting, greeting)

      if (stale) {
        rv.setTextViewText(
          R.id.widget_tasks,
          "It’s a new day. Open Rencana to refresh today’s tasks and classes."
        )
        rv.setTextViewText(R.id.widget_classes, "")
        attachDeepLinkClicks(context, rv, DeepLinkMode.ALL_HOME)
        return rv
      }

      val tasksText = formatTasks(json.optJSONArray("tasks"))
      val classesText = formatClasses(json.optJSONArray("classes"))

      if (tasksText.isEmpty() && classesText.isEmpty()) {
        rv.setTextViewText(R.id.widget_tasks, "Nothing scheduled for today. Enjoy the break.")
        rv.setTextViewText(R.id.widget_classes, "")
      } else {
        rv.setTextViewText(R.id.widget_tasks, tasksText)
        rv.setTextViewText(R.id.widget_classes, classesText)
      }

      attachDeepLinkClicks(context, rv, DeepLinkMode.SECTIONS)
      return rv
    }

    private enum class DeepLinkMode {
      SECTIONS,
      ALL_HOME
    }

    private fun parseJson(raw: String?): JSONObject? {
      if (raw.isNullOrBlank()) return null
      return try {
        JSONObject(raw)
      } catch (_: Exception) {
        null
      }
    }

    private fun formatTasks(arr: JSONArray?): String {
      if (arr == null || arr.length() == 0) return ""
      val sb = StringBuilder()
      sb.append("Tasks\n")
      val n = minOf(arr.length(), 6)
      for (i in 0 until n) {
        val t = arr.optJSONObject(i) ?: continue
        val title = t.optString("title", "").trim()
        if (title.isEmpty()) continue
        val accent = t.optString("accent", "default")
        val prefix = when (accent) {
          "overdue" -> "⚠ "
          else -> "• "
        }
        val sub = t.optString("subtitle", "").trim()
        sb.append(prefix).append(title)
        if (sub.isNotEmpty()) sb.append(" · ").append(sub)
        sb.append('\n')
      }
      return sb.toString().trimEnd()
    }

    private fun formatClasses(arr: JSONArray?): String {
      if (arr == null || arr.length() == 0) return ""
      val sb = StringBuilder()
      sb.append("Classes\n")
      val n = minOf(arr.length(), 6)
      for (i in 0 until n) {
        val c = arr.optJSONObject(i) ?: continue
        val start = c.optString("startTime", "").trim()
        val end = c.optString("endTime", "").trim()
        val label = c.optString("label", "").trim()
        val loc = c.optString("location", "").trim()
        if (start.isEmpty() && label.isEmpty()) continue
        sb.append(start)
        if (end.isNotEmpty()) sb.append("–").append(end)
        if (label.isNotEmpty()) sb.append(" ").append(label)
        if (loc.isNotEmpty()) sb.append(" · ").append(loc)
        sb.append('\n')
      }
      return sb.toString().trimEnd()
    }

    private fun pendingIntentFlags(): Int {
      return PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          PendingIntent.FLAG_IMMUTABLE
        } else {
          0
        }
    }

    private fun deepLinkPendingIntent(context: Context, url: String, requestCode: Int): PendingIntent? {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
        setPackage(context.packageName)
        addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_SINGLE_TOP
        )
      }
      return PendingIntent.getActivity(context, requestCode, intent, pendingIntentFlags())
    }

    private fun launchPendingIntent(context: Context, requestCode: Int): PendingIntent? {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: return null
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      return PendingIntent.getActivity(context, requestCode, launch, pendingIntentFlags())
    }

    private fun attachLaunchClicks(context: Context, rv: RemoteViews) {
      val pi = launchPendingIntent(context, REQ_ROOT) ?: return
      rv.setOnClickPendingIntent(R.id.widget_root, pi)
      rv.setOnClickPendingIntent(R.id.widget_greeting, pi)
      rv.setOnClickPendingIntent(R.id.widget_tasks, pi)
      rv.setOnClickPendingIntent(R.id.widget_classes, pi)
    }

    private fun attachDeepLinkClicks(context: Context, rv: RemoteViews, mode: DeepLinkMode) {
      val home = deepLinkPendingIntent(context, DL_HOME, REQ_HOME)
      val planner = if (mode == DeepLinkMode.SECTIONS) {
        deepLinkPendingIntent(context, DL_PLANNER, REQ_PLANNER)
      } else {
        home
      }
      val timetable = if (mode == DeepLinkMode.SECTIONS) {
        deepLinkPendingIntent(context, DL_TIMETABLE, REQ_TIMETABLE)
      } else {
        home
      }
      val root = home ?: launchPendingIntent(context, REQ_ROOT)

      root?.let { rv.setOnClickPendingIntent(R.id.widget_root, it) }
      home?.let { rv.setOnClickPendingIntent(R.id.widget_greeting, it) }
      (planner ?: home)?.let { rv.setOnClickPendingIntent(R.id.widget_tasks, it) }
      (timetable ?: home)?.let { rv.setOnClickPendingIntent(R.id.widget_classes, it) }
    }
  }
}
