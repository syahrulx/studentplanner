import * as Notifications from 'expo-notifications';

// Register once at app startup so local notifications (attendance, tasks, revision) still show
// banners/alerts while the app is in the foreground. Without this, iOS/Android often suppress the "popup".
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
