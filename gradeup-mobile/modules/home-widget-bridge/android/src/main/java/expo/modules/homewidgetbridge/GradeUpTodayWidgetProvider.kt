package expo.modules.homewidgetbridge

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import androidx.work.WorkManager
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale

open class GradeUpTodayWidgetProvider : AppWidgetProvider() {
  protected enum class ContentMode { TASKS, CLASSES, BOTH }
  protected enum class LayoutMode { SMALL, LONG }

  protected open fun contentMode(): ContentMode = ContentMode.BOTH
  protected open fun layoutMode(): LayoutMode = LayoutMode.LONG

  override fun onEnabled(context: Context) {
    super.onEnabled(context)
    try {
      WidgetRefreshScheduler.scheduleNextMidnight(context.applicationContext)
    } catch (e: Exception) {
      Log.w(TAG, "onEnabled: midnight scheduler skipped", e)
    }
  }

  override fun onDisabled(context: Context) {
    try {
      WorkManager.getInstance(context.applicationContext).cancelUniqueWork(WidgetRefreshScheduler.UNIQUE_WORK_NAME)
    } catch (e: Exception) {
      Log.w(TAG, "onDisabled: cancel work failed", e)
    }
    super.onDisabled(context)
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    try {
      writeDebug(context, "onUpdate", JSONObject().put("appWidgetCount", appWidgetIds.size))
      val json = readSnapshotJson(context)
      val views = buildRemoteViews(context, json, contentMode(), layoutMode())
      appWidgetManager.updateAppWidget(appWidgetIds, views)
    } catch (e: Throwable) {
      Log.e(TAG, "onUpdate failed", e)
      try {
        val fallback = buildErrorRemoteViews(context, e.message, layoutMode())
        appWidgetManager.updateAppWidget(appWidgetIds, fallback)
      } catch (e2: Exception) {
        Log.e(TAG, "fallback widget update failed", e2)
      }
    }
  }

  companion object {
    private const val TAG = "GradeUpWidget"
    const val PREFS_NAME = "gradeup_home_widget_v1"
    const val PREFS_KEY_JSON = "snapshot_json"
    const val PREFS_KEY_DEBUG = "debug_snapshot"

    private const val DL_HOME = "rencana:///"
    private const val DL_PLANNER = "rencana:///planner"
    private const val DL_TIMETABLE = "rencana:///timetable"

    private const val REQ_ROOT = 0x4750_5055
    private const val REQ_HOME = 0x4750_5048
    private const val REQ_PLANNER = 0x4750_5050
    private const val REQ_TIMETABLE = 0x4750_5054

    fun refreshAllWidgets(context: Context) {
      val mgr = AppWidgetManager.getInstance(context)
      val providers = listOf(
        Pair(GradeUpTodayWidgetProvider::class.java, Pair(ContentMode.BOTH, LayoutMode.LONG)),
        Pair(GradeUpLongTasksWidgetProvider::class.java, Pair(ContentMode.TASKS, LayoutMode.LONG)),
        Pair(GradeUpLongClassesWidgetProvider::class.java, Pair(ContentMode.CLASSES, LayoutMode.LONG)),
        Pair(GradeUpSmallBothWidgetProvider::class.java, Pair(ContentMode.BOTH, LayoutMode.SMALL)),
        Pair(GradeUpSmallTasksWidgetProvider::class.java, Pair(ContentMode.TASKS, LayoutMode.SMALL)),
        Pair(GradeUpSmallClassesWidgetProvider::class.java, Pair(ContentMode.CLASSES, LayoutMode.SMALL))
      )
      for ((providerClass, config) in providers) {
        val ids = mgr.getAppWidgetIds(ComponentName(context, providerClass))
        if (ids.isEmpty()) continue
        try {
          writeDebug(context, "refreshAllWidgets", JSONObject()
            .put("provider", providerClass.simpleName)
            .put("appWidgetCount", ids.size))
          val json = readSnapshotJson(context)
          val views = buildRemoteViews(context, json, config.first, config.second)
          mgr.updateAppWidget(ids, views)
        } catch (e: Throwable) {
          Log.e(TAG, "refreshAllWidgets failed for ${providerClass.simpleName}", e)
          try {
            mgr.updateAppWidget(ids, buildErrorRemoteViews(context, e.message, config.second))
          } catch (e2: Exception) {
            Log.e(TAG, "refreshAllWidgets fallback failed for ${providerClass.simpleName}", e2)
          }
        }
      }
    }

    private fun readSnapshotJson(context: Context): String? {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      return prefs.getString(PREFS_KEY_JSON, null)
    }

    // ─── Main render ──────────────────────────────────────────────

    private fun buildRemoteViews(
      context: Context,
      raw: String?,
      contentMode: ContentMode,
      layoutMode: LayoutMode
    ): RemoteViews {
      val rv = RemoteViews(
        context.packageName,
        if (layoutMode == LayoutMode.SMALL) R.layout.widget_gradeup_small else R.layout.widget_gradeup_today
      )
      val json = parseJson(raw)
      val theme = json?.optJSONObject("theme")
      applyThemeColors(rv, theme, layoutMode)
      // Apply app-selected theme colors best-effort.
      // Any color action failures are swallowed to keep the widget load-safe.

      // ── No snapshot yet ──
      if (json == null) {
        writeDebug(context, "buildRemoteViews", JSONObject().put("state", "no_snapshot_json"))
        showMessage(rv, "Open the app to load your schedule.", layoutMode)
        rv.setTextViewText(R.id.widget_title, "Rencana")
        rv.setTextViewText(R.id.widget_date, "")
        rv.setTextViewText(R.id.widget_count, "")
        attachLaunchClicks(context, rv)
        return rv
      }

      // ── Signed out ──
      if (!json.optBoolean("signedIn", false)) {
        writeDebug(context, "buildRemoteViews", JSONObject().put("state", "signed_out"))
        showMessage(rv, "Sign in to see today's tasks and classes.", layoutMode)
        rv.setTextViewText(R.id.widget_title, "Rencana")
        rv.setTextViewText(R.id.widget_date, "")
        rv.setTextViewText(R.id.widget_count, "")
        attachLaunchClicks(context, rv)
        return rv
      }

      // ── Compute date label ──
      val today = WidgetRefreshScheduler.localTodayISO()
      val snapDate = json.optString("dateISO").trim().take(10)
      val stale = snapDate.length == 10 && snapDate != today

      val dateLabel = formatDateLabel(snapDate)
      rv.setTextViewText(R.id.widget_title, "Today")
      rv.setTextViewText(R.id.widget_date, dateLabel)

      // ── Stale data ──
      if (stale) {
        writeDebug(context, "buildRemoteViews", JSONObject()
          .put("state", "stale_snapshot").put("snapDate", snapDate).put("today", today))
        showMessage(rv, "It's a new day! Open Rencana to refresh.", layoutMode)
        rv.setTextViewText(R.id.widget_count, "")
        attachDeepLinkClicks(context, rv, DeepLinkMode.ALL_HOME)
        return rv
      }

      // ── Normal render ──
      val tasks = json.optJSONArray("tasks") ?: JSONArray()
      val classes = json.optJSONArray("classes") ?: JSONArray()
      val displayTasks = if (contentMode == ContentMode.CLASSES) JSONArray() else tasks
      val displayClasses = if (contentMode == ContentMode.TASKS) JSONArray() else classes
      val totalCount = displayTasks.length() + displayClasses.length()

      writeDebug(context, "buildRemoteViews", JSONObject()
        .put("state", "rendered")
        .put("layoutMode", layoutMode.name)
        .put("contentMode", contentMode.name)
        .put("tasksCount", displayTasks.length())
        .put("classesCount", displayClasses.length()))

      rv.setTextViewText(R.id.widget_count, totalCount.toString())

      if (totalCount == 0) {
        showMessage(rv, "Nothing scheduled for today. Enjoy!", layoutMode)
        attachDeepLinkClicks(context, rv, DeepLinkMode.SECTIONS)
        return rv
      }

      if (layoutMode == LayoutMode.SMALL) {
        rv.setViewVisibility(R.id.widget_message, View.GONE)
        rv.setViewVisibility(R.id.widget_small_content, View.VISIBLE)
        rv.setViewVisibility(R.id.widget_small_dual_row, View.GONE)
        rv.setViewVisibility(R.id.widget_small_primary, View.VISIBLE)
        rv.setViewVisibility(R.id.widget_small_secondary, View.VISIBLE)
        rv.setViewVisibility(R.id.widget_small_label, View.VISIBLE)
        when (contentMode) {
          ContentMode.TASKS -> {
            rv.setTextViewText(R.id.widget_small_label, "TASKS")
            rv.setTextViewText(R.id.widget_small_primary, nearestTaskDetail(displayTasks))
            rv.setTextViewText(R.id.widget_small_secondary, "")
            rv.setViewVisibility(R.id.widget_small_secondary, View.GONE)
          }
          ContentMode.CLASSES -> {
            rv.setTextViewText(R.id.widget_small_label, "CLASSES")
            rv.setTextViewText(R.id.widget_small_primary, nearestClassPrimary(displayClasses))
            rv.setTextViewText(R.id.widget_small_secondary, nearestClassSecondary(displayClasses))
            if (nearestClassSecondary(displayClasses).isEmpty()) {
              rv.setViewVisibility(R.id.widget_small_secondary, View.GONE)
            }
          }
          ContentMode.BOTH -> {
            rv.setViewVisibility(R.id.widget_small_label, View.GONE)
            rv.setViewVisibility(R.id.widget_small_primary, View.GONE)
            rv.setViewVisibility(R.id.widget_small_secondary, View.GONE)
            rv.setViewVisibility(R.id.widget_small_dual_row, View.VISIBLE)
            rv.setTextViewText(R.id.widget_small_tasks_value, nearestTaskDetail(displayTasks))
            rv.setTextViewText(R.id.widget_small_classes_value, nearestClassPrimary(displayClasses))
          }
        }
        attachDeepLinkClicks(context, rv, DeepLinkMode.SECTIONS)
        return rv
      }

      // Show columns, hide message
      rv.setViewVisibility(R.id.widget_message, View.GONE)
      rv.setViewVisibility(R.id.widget_columns, View.VISIBLE)

      // Tasks column
      rv.setTextViewText(R.id.widget_tasks_count, displayTasks.length().toString())
      if (displayTasks.length() == 0) {
        rv.setTextViewText(R.id.widget_tasks_content, "All done!")
      } else {
        rv.setTextViewText(R.id.widget_tasks_content, buildTasksPlain(displayTasks))
      }

      // Classes column
      rv.setTextViewText(R.id.widget_classes_count, displayClasses.length().toString())
      if (displayClasses.length() == 0) {
        rv.setTextViewText(R.id.widget_classes_content, "Free!")
      } else {
        rv.setTextViewText(R.id.widget_classes_content, buildClassesPlain(displayClasses))
      }

      if (contentMode == ContentMode.TASKS) {
        rv.setTextViewText(R.id.widget_tasks_label, "TASK")
        rv.setTextViewText(R.id.widget_tasks_content, buildTasksHorizontal(displayTasks))
        rv.setViewVisibility(R.id.widget_classes_column, View.GONE)
        rv.setViewVisibility(R.id.widget_tasks_column, View.VISIBLE)
      } else if (contentMode == ContentMode.CLASSES) {
        rv.setTextViewText(R.id.widget_classes_label, "CLASS")
        rv.setTextViewText(R.id.widget_classes_content, buildClassesHorizontal(displayClasses))
        rv.setViewVisibility(R.id.widget_tasks_column, View.GONE)
        rv.setViewVisibility(R.id.widget_classes_column, View.VISIBLE)
      } else {
        rv.setViewVisibility(R.id.widget_tasks_column, View.VISIBLE)
        rv.setViewVisibility(R.id.widget_classes_column, View.VISIBLE)
      }

      attachDeepLinkClicks(context, rv, DeepLinkMode.SECTIONS)
      return rv
    }

    // ─── Plain text (RemoteViews + Spans breaks on some devices → "Can't load widget") ──

    private fun buildTasksPlain(arr: JSONArray): String {
      val sb = StringBuilder()
      val n = minOf(arr.length(), 4)
      for (i in 0 until n) {
        val t = arr.optJSONObject(i) ?: continue
        val title = t.optString("title", "").trim()
        if (title.isEmpty()) continue
        val accentType = t.optString("accent", "default")
        val subtitle = t.optString("subtitle", "").trim()
        if (sb.isNotEmpty()) sb.append('\n')
        sb.append("• ").append(title)
        val statusText = when (accentType) {
          "overdue" -> "Overdue"
          "today" -> "Due today"
          else -> subtitle
        }
        if (statusText.isNotEmpty()) {
          sb.append('\n').append("  ").append(statusText)
        }
      }
      return if (sb.isEmpty()) "—" else sb.toString()
    }

    private fun buildClassesPlain(arr: JSONArray): String {
      val sb = StringBuilder()
      val n = minOf(arr.length(), 4)
      for (i in 0 until n) {
        val c = arr.optJSONObject(i) ?: continue
        val start = c.optString("startTime", "").trim()
        val label = c.optString("label", "").trim()
        val location = c.optString("location", "").trim()
        if (start.isEmpty() && label.isEmpty()) continue
        if (sb.isNotEmpty()) sb.append('\n')
        if (start.isNotEmpty()) {
          sb.append(start)
          if (label.isNotEmpty()) sb.append("  ")
        }
        if (label.isNotEmpty()) sb.append(label)
        val loc = if (location.isNotEmpty()) location else "—"
        sb.append('\n').append(loc)
      }
      return if (sb.isEmpty()) "—" else sb.toString()
    }

    private fun buildTasksCompact(arr: JSONArray): String {
      val n = minOf(arr.length(), 2)
      if (n == 0) return "All done!"
      val sb = StringBuilder()
      for (i in 0 until n) {
        val t = arr.optJSONObject(i) ?: continue
        val title = t.optString("title", "").trim()
        if (title.isEmpty()) continue
        if (sb.isNotEmpty()) sb.append('\n')
        sb.append("• ").append(title)
      }
      return if (sb.isEmpty()) "All done!" else sb.toString()
    }

    private fun buildClassesCompact(arr: JSONArray): String {
      val n = minOf(arr.length(), 2)
      if (n == 0) return "Free!"
      val sb = StringBuilder()
      for (i in 0 until n) {
        val c = arr.optJSONObject(i) ?: continue
        val start = c.optString("startTime", "").trim()
        val label = c.optString("label", "").trim()
        val line = listOf(start, label).filter { it.isNotEmpty() }.joinToString(" ")
        if (line.isEmpty()) continue
        if (sb.isNotEmpty()) sb.append('\n')
        sb.append(line)
      }
      return if (sb.isEmpty()) "Free!" else sb.toString()
    }

    private fun nearestTaskDetail(arr: JSONArray): String {
      if (arr.length() == 0) return "No task"
      val t = arr.optJSONObject(0) ?: return "No task"
      val title = t.optString("title", "").trim()
      val subtitle = t.optString("subtitle", "").trim()
      if (title.isEmpty() && subtitle.isEmpty()) return "No task"
      return listOf(title, subtitle).filter { it.isNotEmpty() }.joinToString(" - ")
    }

    private fun nearestClassPrimary(arr: JSONArray): String {
      if (arr.length() == 0) return "No class"
      val c = arr.optJSONObject(0) ?: return "No class"
      val start = c.optString("startTime", "").trim()
      val label = c.optString("label", "").trim()
      val line = listOf(start, label).filter { it.isNotEmpty() }.joinToString(" ")
      return if (line.isEmpty()) "No class" else line
    }

    private fun nearestClassSecondary(arr: JSONArray): String {
      if (arr.length() == 0) return ""
      val c = arr.optJSONObject(0) ?: return ""
      return c.optString("location", "").trim()
    }

    private fun buildTasksHorizontal(arr: JSONArray): String {
      val sb = StringBuilder()
      val n = minOf(arr.length(), 4)
      for (i in 0 until n) {
        val t = arr.optJSONObject(i) ?: continue
        val title = t.optString("title", "").trim()
        if (title.isEmpty()) continue
        val subtitle = t.optString("subtitle", "").trim()
        if (sb.isNotEmpty()) sb.append('\n')
        sb.append("• ").append(title)
        if (subtitle.isNotEmpty()) sb.append(" - ").append(subtitle)
      }
      return if (sb.isEmpty()) "All done!" else sb.toString()
    }

    private fun buildClassesHorizontal(arr: JSONArray): String {
      val sb = StringBuilder()
      val n = minOf(arr.length(), 4)
      for (i in 0 until n) {
        val c = arr.optJSONObject(i) ?: continue
        val start = c.optString("startTime", "").trim()
        val label = c.optString("label", "").trim()
        val location = c.optString("location", "").trim()
        val base = listOf(start, label).filter { it.isNotEmpty() }.joinToString(" ")
        if (base.isEmpty() && location.isEmpty()) continue
        if (sb.isNotEmpty()) sb.append('\n')
        sb.append("• ").append(base.ifEmpty { "Class" })
        if (location.isNotEmpty()) sb.append(" @ ").append(location)
      }
      return if (sb.isEmpty()) "Free!" else sb.toString()
    }

    private fun applyThemeColors(rv: RemoteViews, th: JSONObject?, layoutMode: LayoutMode) {
      if (th == null) return
      val accent = parseHexColor(th.optString("primary", ""))
      val textPrimary = parseHexColor(th.optString("text", ""))
      val textSecondary = parseHexColor(th.optString("textSecondary", ""))
      val background = parseHexColor(th.optString("background", ""))

      // Apply only known-safe properties; failures are ignored to protect widget rendering.
      try {
        if (background != null) {
          rv.setInt(R.id.widget_root, "setBackgroundColor", background)
        }
      } catch (_: Throwable) {
      }

      fun applyTextColor(id: Int, color: Int?) {
        if (color == null) return
        try {
          rv.setTextColor(id, color)
        } catch (_: Throwable) {
        }
      }

      applyTextColor(R.id.widget_title, textPrimary)
      applyTextColor(R.id.widget_date, accent ?: textSecondary)
      applyTextColor(R.id.widget_count, accent ?: textPrimary)
      applyTextColor(R.id.widget_message, textSecondary)

      if (layoutMode == LayoutMode.SMALL) {
        applyTextColor(R.id.widget_small_label, textSecondary)
        applyTextColor(R.id.widget_small_primary, textPrimary)
        applyTextColor(R.id.widget_small_secondary, textSecondary)
        applyTextColor(R.id.widget_small_tasks_title, textSecondary)
        applyTextColor(R.id.widget_small_tasks_value, textPrimary)
        applyTextColor(R.id.widget_small_classes_title, textSecondary)
        applyTextColor(R.id.widget_small_classes_value, textPrimary)
      } else {
        applyTextColor(R.id.widget_tasks_label, accent ?: textSecondary)
        applyTextColor(R.id.widget_tasks_count, textSecondary)
        applyTextColor(R.id.widget_tasks_content, textPrimary)
        applyTextColor(R.id.widget_classes_label, accent ?: textSecondary)
        applyTextColor(R.id.widget_classes_count, textSecondary)
        applyTextColor(R.id.widget_classes_content, textPrimary)
        if (accent != null) {
          try {
            rv.setTextColor(R.id.widget_divider, accent)
          } catch (_: Throwable) {
          }
        }
      }
    }

    private fun parseHexColor(raw: String?): Int? {
      val value = raw?.trim().orEmpty()
      if (value.isEmpty() || !value.startsWith("#")) return null
      return try {
        Color.parseColor(value)
      } catch (_: Throwable) {
        null
      }
    }

    /**
     * Safe fallback when [buildRemoteViews] throws (must be callable from [onUpdate]).
     */
    private fun buildErrorRemoteViews(
      context: Context,
      @Suppress("UNUSED_PARAMETER") err: String?,
      layoutMode: LayoutMode
    ): RemoteViews {
      val rv = RemoteViews(
        context.packageName,
        if (layoutMode == LayoutMode.SMALL) R.layout.widget_gradeup_small else R.layout.widget_gradeup_today
      )
      if (layoutMode == LayoutMode.SMALL) {
        rv.setViewVisibility(R.id.widget_small_content, View.GONE)
      } else {
        rv.setViewVisibility(R.id.widget_columns, View.GONE)
      }
      rv.setViewVisibility(R.id.widget_message, View.VISIBLE)
      rv.setTextViewText(R.id.widget_message, "Open Rencana to load the widget.")
      rv.setTextViewText(R.id.widget_title, "Rencana")
      rv.setTextViewText(R.id.widget_date, "")
      rv.setTextViewText(R.id.widget_count, "")
      attachLaunchClicks(context, rv)
      return rv
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private fun showMessage(rv: RemoteViews, msg: String, layoutMode: LayoutMode) {
      if (layoutMode == LayoutMode.SMALL) {
        rv.setViewVisibility(R.id.widget_small_content, View.GONE)
      } else {
        rv.setViewVisibility(R.id.widget_columns, View.GONE)
      }
      rv.setViewVisibility(R.id.widget_message, View.VISIBLE)
      rv.setTextViewText(R.id.widget_message, msg)
    }

    private fun formatDateLabel(dateISO: String): String {
      if (dateISO.length < 10) return ""
      return try {
        val parts = dateISO.split("-")
        val y = parts[0].toInt()
        val m = parts[1].toInt()
        val d = parts[2].toInt()
        val cal = Calendar.getInstance().apply {
          set(Calendar.YEAR, y)
          set(Calendar.MONTH, m - 1)
          set(Calendar.DAY_OF_MONTH, d)
        }
        val dayNames = arrayOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
        val monthNames = arrayOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
        val dow = cal.get(Calendar.DAY_OF_WEEK) - 1
        "${dayNames[dow]}, ${monthNames[m - 1]} $d"
      } catch (_: Exception) {
        dateISO
      }
    }

    private enum class DeepLinkMode { SECTIONS, ALL_HOME }

    private fun parseJson(raw: String?): JSONObject? {
      if (raw.isNullOrBlank()) return null
      return try { JSONObject(raw) } catch (_: Exception) { null }
    }

    // ─── Click handling ──────────────────────────────────────────

    private fun pendingIntentFlags(): Int {
      return PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_IMMUTABLE else 0
    }

    private fun deepLinkPendingIntent(context: Context, url: String, requestCode: Int): PendingIntent? {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      return PendingIntent.getActivity(context, requestCode, intent, pendingIntentFlags())
    }

    private fun launchPendingIntent(context: Context, requestCode: Int): PendingIntent? {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      return PendingIntent.getActivity(context, requestCode, launch, pendingIntentFlags())
    }

    private fun attachLaunchClicks(context: Context, rv: RemoteViews) {
      val pi = launchPendingIntent(context, REQ_ROOT) ?: return
      rv.setOnClickPendingIntent(R.id.widget_root, pi)
    }

    private fun attachDeepLinkClicks(context: Context, rv: RemoteViews, mode: DeepLinkMode) {
      val home = deepLinkPendingIntent(context, DL_HOME, REQ_HOME)
      val planner = if (mode == DeepLinkMode.SECTIONS)
        deepLinkPendingIntent(context, DL_PLANNER, REQ_PLANNER) else home
      val timetable = if (mode == DeepLinkMode.SECTIONS)
        deepLinkPendingIntent(context, DL_TIMETABLE, REQ_TIMETABLE) else home
      val root = home ?: launchPendingIntent(context, REQ_ROOT)

      writeDebug(context, "attachDeepLinkClicks", JSONObject()
        .put("mode", mode.name)
        .put("homeIntent", home != null)
        .put("plannerIntent", planner != null)
        .put("timetableIntent", timetable != null))

      root?.let { rv.setOnClickPendingIntent(R.id.widget_root, it) }
      home?.let { rv.setOnClickPendingIntent(R.id.widget_title, it) }
      (planner ?: home)?.let { rv.setOnClickPendingIntent(R.id.widget_tasks_content, it) }
      (timetable ?: home)?.let { rv.setOnClickPendingIntent(R.id.widget_classes_content, it) }
    }

    // ─── Debug ───────────────────────────────────────────────────

    private fun writeDebug(context: Context, event: String, payload: JSONObject) {
      try {
        val snapshot = JSONObject()
          .put("event", event)
          .put("timestamp", System.currentTimeMillis())
          .put("payload", payload)
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(PREFS_KEY_DEBUG, snapshot.toString()).apply()
        Log.d(TAG, snapshot.toString())
      } catch (e: Exception) {
        Log.e(TAG, "writeDebug failed", e)
      }
    }
  }
}

class GradeUpSmallTasksWidgetProvider : GradeUpTodayWidgetProvider() {
  override fun contentMode() = ContentMode.TASKS
  override fun layoutMode() = LayoutMode.SMALL
}

class GradeUpSmallClassesWidgetProvider : GradeUpTodayWidgetProvider() {
  override fun contentMode() = ContentMode.CLASSES
  override fun layoutMode() = LayoutMode.SMALL
}

class GradeUpSmallBothWidgetProvider : GradeUpTodayWidgetProvider() {
  override fun contentMode() = ContentMode.BOTH
  override fun layoutMode() = LayoutMode.SMALL
}

class GradeUpLongTasksWidgetProvider : GradeUpTodayWidgetProvider() {
  override fun contentMode() = ContentMode.TASKS
  override fun layoutMode() = LayoutMode.LONG
}

class GradeUpLongClassesWidgetProvider : GradeUpTodayWidgetProvider() {
  override fun contentMode() = ContentMode.CLASSES
  override fun layoutMode() = LayoutMode.LONG
}
