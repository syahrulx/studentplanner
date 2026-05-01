import * as Notifications from 'expo-notifications';
import { getAttendanceCheckinPopupEnabled } from './storage';

// Register once at app startup so local notifications (attendance, tasks, revision) still show
// banners/alerts while the app is in the foreground. Without this, iOS/Android often suppress the "popup".
//
// We special-case the 5-minutes-before-class attendance check-in: when the user turns off
// "Class check-in popup" in Settings → Notifications we must suppress the foreground banner /
// alert / sound, but still let the notification be delivered. The notification request remains
// scheduled, so it shows up in the in-app Notification Manager (which reads from
// `Notifications.getAllScheduledNotificationsAsync()`) and in the OS notification center.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = (notification?.request?.content?.data ?? {}) as Record<string, unknown>;
    if (data?.type === 'attendance_checkin') {
      const popupOn = await getAttendanceCheckinPopupEnabled().catch(() => true);
      if (!popupOn) {
        return {
          shouldShowAlert: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: false,
          // Keep the entry in the OS notification list so the user can tap it later;
          // only the immediate banner/popup is suppressed.
          shouldShowList: true,
        };
      }
    }

    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});
