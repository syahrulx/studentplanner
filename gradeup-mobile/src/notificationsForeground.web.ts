// Web no-op for the foreground notification handler.
//
// On native this module calls `Notifications.setNotificationHandler(...)` as a
// startup side effect (imported from app/_layout.tsx). expo-notifications has no
// equivalent foreground handler on web, so this stub intentionally does nothing
// to keep the web bundle from touching native notification APIs at load time.
export {};
