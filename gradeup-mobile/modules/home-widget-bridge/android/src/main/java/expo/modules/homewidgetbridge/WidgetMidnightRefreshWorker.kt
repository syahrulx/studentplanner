package expo.modules.homewidgetbridge

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class WidgetMidnightRefreshWorker(
  context: Context,
  params: WorkerParameters
) : Worker(context, params) {

  override fun doWork(): Result {
    GradeUpTodayWidgetProvider.refreshAllWidgets(applicationContext)
    WidgetRefreshScheduler.scheduleNextMidnight(applicationContext)
    return Result.success()
  }
}
