package expo.modules.homewidgetbridge

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StyleSpan
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import androidx.work.WorkManager
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale

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
    writeDebug(context, "onUpdate", JSONObject().put("appWidgetCount", appWidgetIds.size))
    val json = readSnapshotJson(context)
    val views = buildRemoteViews(context, json)
    appWidgetManager.updateAppWidget(appWidgetIds, views)
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

    // ── Default theme colors (light) ──
    private const val DEFAULT_ACCENT  = "#2563eb"
    private const val DEFAULT_DANGER  = "#dc2626"
    private const val DEFAULT_WARNING = "#d97706"
    private const val DEFAULT_TEXT    = "#0f172a"
    private const val DEFAULT_MUTED   = "#64748b"
    private const val DEFAULT_BG      = "#ffffff"
    private const val DEFAULT_DIVIDER = "#e2e8f0"

    fun refreshAllWidgets(context: Context) {
      val mgr = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, GradeUpTodayWidgetProvider::class.java)
      val ids = mgr.getAppWidgetIds(component)
      if (ids.isEmpty()) return
      writeDebug(context, "refreshAllWidgets", JSONObject().put("appWidgetCount", ids.size))
      val json = readSnapshotJson(context)
      val views = buildRemoteViews(context, json)
      mgr.updateAppWidget(ids, views)
    }

    private fun readSnapshotJson(context: Context): String? {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      return prefs.getString(PREFS_KEY_JSON, null)
    }

    // ─── Main render ──────────────────────────────────────────────

    private fun buildRemoteViews(context: Context, raw: String?): RemoteViews {
      val rv = RemoteViews(context.packageName, R.layout.widget_gradeup_today)
      val json = parseJson(raw)

      // Extract theme
      val th = json?.optJSONObject("theme")
      val accent  = safeColor(th?.optString("primary"), DEFAULT_ACCENT)
      val danger  = safeColor(th?.optString("danger"), DEFAULT_DANGER)
      val warning = safeColor(th?.optString("warning"), DEFAULT_WARNING)
      val textPri = safeColor(th?.optString("text"), DEFAULT_TEXT)
      val textSec = safeColor(th?.optString("textSecondary"), DEFAULT_MUTED)
      val bg      = safeColor(th?.optString("background"), DEFAULT_BG)
      val divider = safeColor(th?.optString("border"), DEFAULT_DIVIDER)
      val dividerAlpha = Color.argb(40, Color.red(divider), Color.green(divider), Color.blue(divider))

      // Apply base theme colors
      try {
        rv.setInt(R.id.widget_root, "setBackgroundColor", bg)
        rv.setInt(R.id.widget_title, "setTextColor", textPri)
        rv.setInt(R.id.widget_date, "setTextColor", accent)
        rv.setInt(R.id.widget_count, "setTextColor", accent)
        rv.setInt(R.id.widget_divider, "setBackgroundColor", dividerAlpha)
        rv.setInt(R.id.widget_col_divider, "setBackgroundColor", dividerAlpha)
        rv.setInt(R.id.widget_tasks_label, "setTextColor", accent)
        rv.setInt(R.id.widget_classes_label, "setTextColor", accent)
        rv.setInt(R.id.widget_tasks_count, "setTextColor", textSec)
        rv.setInt(R.id.widget_classes_count, "setTextColor", textSec)
        rv.setInt(R.id.widget_message, "setTextColor", textSec)
      } catch (_: Exception) { /* some OEMs may not support all calls */ }

      // ── No snapshot yet ──
      if (json == null) {
        writeDebug(context, "buildRemoteViews", JSONObject().put("state", "no_snapshot_json"))
        showMessage(rv, "Open the app to load your schedule.")
        rv.setTextViewText(R.id.widget_title, "Rencana")
        rv.setTextViewText(R.id.widget_date, "")
        rv.setTextViewText(R.id.widget_count, "")
        attachLaunchClicks(context, rv)
        return rv
      }

      // ── Signed out ──
      if (!json.optBoolean("signedIn", false)) {
        writeDebug(context, "buildRemoteViews", JSONObject().put("state", "signed_out"))
        showMessage(rv, "Sign in to see today's tasks and classes.")
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
        showMessage(rv, "It's a new day! Open Rencana to refresh.")
        rv.setTextViewText(R.id.widget_count, "")
        attachDeepLinkClicks(context, rv, DeepLinkMode.ALL_HOME)
        return rv
      }

      // ── Normal render ──
      val tasks = json.optJSONArray("tasks") ?: JSONArray()
      val classes = json.optJSONArray("classes") ?: JSONArray()
      val totalCount = tasks.length() + classes.length()

      writeDebug(context, "buildRemoteViews", JSONObject()
        .put("state", "rendered").put("tasksCount", tasks.length()).put("classesCount", classes.length()))

      rv.setTextViewText(R.id.widget_count, totalCount.toString())

      if (totalCount == 0) {
        showMessage(rv, "Nothing scheduled for today. Enjoy! 🎉")
        attachDeepLinkClicks(context, rv, DeepLinkMode.SECTIONS)
        return rv
      }

      // Show columns, hide message
      rv.setViewVisibility(R.id.widget_message, View.GONE)
      rv.setViewVisibility(R.id.widget_columns, View.VISIBLE)

      // Tasks column
      rv.setTextViewText(R.id.widget_tasks_count, tasks.length().toString())
      if (tasks.length() == 0) {
        rv.setTextViewText(R.id.widget_tasks_content, buildMutedText("All done! 🎉", textSec))
      } else {
        rv.setTextViewText(R.id.widget_tasks_content,
          buildTasksSpannable(tasks, textPri, textSec, accent, danger, warning))
      }

      // Classes column
      rv.setTextViewText(R.id.widget_classes_count, classes.length().toString())
      if (classes.length() == 0) {
        rv.setTextViewText(R.id.widget_classes_content, buildMutedText("Free! 🎉", textSec))
      } else {
        rv.setTextViewText(R.id.widget_classes_content,
          buildClassesSpannable(classes, textPri, textSec, accent))
      }

      attachDeepLinkClicks(context, rv, DeepLinkMode.SECTIONS)
      return rv
    }

    // ─── Rich text builders ──────────────────────────────────────

    private fun buildTasksSpannable(
      arr: JSONArray, textPri: Int, textSec: Int, accent: Int, danger: Int, warning: Int
    ): SpannableStringBuilder {
      val sb = SpannableStringBuilder()
      val n = minOf(arr.length(), 4)
      for (i in 0 until n) {
        val t = arr.optJSONObject(i) ?: continue
        val title = t.optString("title", "").trim()
        if (title.isEmpty()) continue
        val accentType = t.optString("accent", "default")
        val subtitle = t.optString("subtitle", "").trim()

        if (sb.isNotEmpty()) sb.append("\n")

        // Colored dot
        val dotColor = when (accentType) {
          "overdue" -> danger
          "today" -> warning
          else -> accent
        }
        val dotStart = sb.length
        sb.append("●  ")
        sb.setSpan(ForegroundColorSpan(dotColor), dotStart, dotStart + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        sb.setSpan(RelativeSizeSpan(0.5f), dotStart, dotStart + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)

        // Title (bold)
        val titleStart = sb.length
        sb.append(title)
        sb.setSpan(StyleSpan(Typeface.BOLD), titleStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        sb.setSpan(ForegroundColorSpan(textPri), titleStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)

        // Status text or subtitle
        val statusText = when (accentType) {
          "overdue" -> "Overdue"
          "today" -> "Due today"
          else -> subtitle
        }
        if (statusText.isNotEmpty()) {
          sb.append("\n")
          val subStart = sb.length
          // Add left-padding to align with title (after dot)
          sb.append("     ")
          sb.append(statusText)
          val statusColor = when (accentType) {
            "overdue" -> danger
            "today" -> warning
            else -> textSec
          }
          sb.setSpan(ForegroundColorSpan(statusColor), subStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
          sb.setSpan(RelativeSizeSpan(0.75f), subStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
          if (accentType == "overdue" || accentType == "today") {
            sb.setSpan(StyleSpan(Typeface.BOLD), subStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
          }
        }
      }
      return sb
    }

    private fun buildClassesSpannable(
      arr: JSONArray, textPri: Int, textSec: Int, accent: Int
    ): SpannableStringBuilder {
      val sb = SpannableStringBuilder()
      val n = minOf(arr.length(), 4)
      for (i in 0 until n) {
        val c = arr.optJSONObject(i) ?: continue
        val start = c.optString("startTime", "").trim()
        val label = c.optString("label", "").trim()
        val location = c.optString("location", "").trim()
        if (start.isEmpty() && label.isEmpty()) continue

        if (sb.isNotEmpty()) sb.append("\n")

        // Time (bold accent)
        if (start.isNotEmpty()) {
          val timeStart = sb.length
          sb.append(start)
          sb.setSpan(StyleSpan(Typeface.BOLD), timeStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
          sb.setSpan(ForegroundColorSpan(accent), timeStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
          sb.setSpan(RelativeSizeSpan(0.9f), timeStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
          sb.append("  ")
        }

        // Label (bold)
        if (label.isNotEmpty()) {
          val labelStart = sb.length
          sb.append(label)
          sb.setSpan(StyleSpan(Typeface.BOLD), labelStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
          sb.setSpan(ForegroundColorSpan(textPri), labelStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }

        // Location (small muted)
        val loc = if (location.isNotEmpty()) location else "—"
        sb.append("\n")
        val locStart = sb.length
        sb.append(loc)
        sb.setSpan(ForegroundColorSpan(textSec), locStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        sb.setSpan(RelativeSizeSpan(0.7f), locStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
      }
      return sb
    }

    private fun buildMutedText(text: String, color: Int): SpannableStringBuilder {
      val sb = SpannableStringBuilder(text)
      sb.setSpan(ForegroundColorSpan(color), 0, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
      return sb
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private fun showMessage(rv: RemoteViews, msg: String) {
      rv.setViewVisibility(R.id.widget_columns, View.GONE)
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

    private fun safeColor(hex: String?, fallback: String): Int {
      val h = hex?.trim() ?: return Color.parseColor(fallback)
      if (h.length < 4 || !h.startsWith("#")) return Color.parseColor(fallback)
      return try { Color.parseColor(h) } catch (_: Exception) { Color.parseColor(fallback) }
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
