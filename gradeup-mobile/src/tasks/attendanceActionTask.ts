import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { handleAttendanceNotificationResponse } from '../attendanceRecording';

/**
 * Android: the Present / Absent / Class cancelled buttons on a class check-in.
 *
 * Those buttons don't open the app (opensAppToForeground: false). On Android
 * such a press goes only to a registered background task when the app is in
 * the background or closed, and none was registered, so every press was lost
 * and the notification stayed put (student report, Oct 2026). iOS hands the
 * press to the normal response listener, which already handles it.
 *
 * This module must be imported by the app entry (index.ts) so the task is
 * defined before Android starts the JS bundle in the background to run it.
 */
export const ATTENDANCE_ACTION_TASK = 'rencana-attendance-action';

TaskManager.defineTask<Notifications.NotificationTaskPayload>(ATTENDANCE_ACTION_TASK, async ({ data }) => {
  try {
    if (!data || typeof data !== 'object' || !('actionIdentifier' in data)) return;
    // Records the answer (or queues it when offline) and removes the
    // notification. Anything that is not a check-in is ignored.
    await handleAttendanceNotificationResponse(data as Notifications.NotificationResponse);
  } catch {
    // A background task has nobody to show an error to; the check-in stays
    // in the shade and can be answered in the app.
  }
});

if (Platform.OS === 'android') {
  Notifications.registerTaskAsync(ATTENDANCE_ACTION_TASK).catch(() => {});
}
