package expo.modules.homewidgetbridge

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.Calendar
import java.util.Locale
import java.util.concurrent.TimeUnit

object WidgetRefreshScheduler {
  const val UNIQUE_WORK_NAME = "gradeup_widget_midnight_refresh"

  fun scheduleNextMidnight(context: Context) {
    val delayMs = msUntilNextLocalMidnight()
    if (delayMs <= 0L) return

    val request = OneTimeWorkRequestBuilder<WidgetMidnightRefreshWorker>()
      .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
      .build()

    WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
      UNIQUE_WORK_NAME,
      ExistingWorkPolicy.REPLACE,
      request
    )
  }

  private fun msUntilNextLocalMidnight(): Long {
    val now = Calendar.getInstance()
    val next = Calendar.getInstance().apply {
      add(Calendar.DAY_OF_YEAR, 1)
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    return next.timeInMillis - now.timeInMillis
  }

  fun localTodayISO(): String {
    val cal = Calendar.getInstance()
    val y = cal.get(Calendar.YEAR)
    val m = cal.get(Calendar.MONTH) + 1
    val d = cal.get(Calendar.DAY_OF_MONTH)
    return String.format(Locale.US, "%04d-%02d-%02d", y, m, d)
  }
}
