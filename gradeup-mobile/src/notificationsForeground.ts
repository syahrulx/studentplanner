import * as Notifications from 'expo-notifications';
import { getAttendanceCheckinPopupEnabled } from './storage';

// Register once at app startup so local notifications (attendance, tasks, revision) still show
// banners/alerts while the app is in the foreground. Without this, iOS/Android often suppress the "popup".
//
// We special-case the 5-minutes-before-class attendance check-in: with the toggle off
// nothing new is scheduled (see `attendanceNotifications`), but builds before that change
// left silent check-ins pending on device. Drop those entirely rather than letting them
// surface after the user already said no.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = (notification?.request?.content?.data ?? {}) as Record<string, unknown>;
    if (data?.type === 'attendance_checkin') {
      const checkinsOn = await getAttendanceCheckinPopupEnabled().catch(() => true);
      if (!checkinsOn) {
        return {
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: false,
          shouldShowList: false,
        };
      }
    }

    return {
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});
