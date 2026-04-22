import '@/src/notificationsForeground';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { ThemeProvider, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppProvider } from '@/src/context/AppContext';
import { CommunityProvider } from '@/src/context/CommunityContext';
import { QuizProvider } from '@/src/context/QuizContext';
import { useTheme, useThemeId } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';
import {
  attendanceOccurrenceKey,
  getAnsweredOccurrenceSet,
  handleAttendanceNotificationResponse,
} from '@/src/attendanceRecording';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(auth)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();


export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);


  if (!loaded) {
    return null;
  }


  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootLayoutNav />
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  useEffect(() => {
    const handleNotificationData = (data: Record<string, any> | undefined, delayed?: boolean) => {
      if (!data?.type) return;
      const nav = (fn: () => void) => (delayed ? setTimeout(fn, 100) : fn());
      switch (data.type) {
        case 'revision':
          nav(() => router.push('/revision-due'));
          break;
        case 'quiz_invite':
          if (data.sessionId) nav(() => router.push({ pathname: '/match-lobby', params: { sessionId: data.sessionId } } as any));
          break;
        case 'task_reminder':
        case 'task_overdue':
          if (data.taskId) nav(() => router.push({ pathname: '/task-details', params: { id: data.taskId } } as any));
          break;
        case 'shared_task':
        case 'shared_task_response':
        case 'shared_task_completed':
          nav(() => router.push('/community/notifications' as any));
          break;
        case 'reaction':
          nav(() => router.push('/community/notifications' as any));
          break;
        case 'friend_request':
          nav(() => router.push({ pathname: '/community/add-friend', params: { tab: 'incoming' } } as any));
          break;
        case 'friend_accepted':
          if (data.friendId) {
            nav(() => router.push({ pathname: '/community/friend-profile', params: { id: data.friendId } } as any));
          } else {
            nav(() => router.push('/community/notifications' as any));
          }
          break;
        case 'circle_invitation':
          nav(() => router.push('/community/notifications' as any));
          break;
        case 'circle_invitation_response':
          if (data.circleId) {
            nav(() => router.push({ pathname: '/community/circle-detail', params: { id: data.circleId } } as any));
          } else {
            nav(() => router.push('/community/circles' as any));
          }
          break;
        case 'broadcast': {
          // Admin broadcast. Honour a caller-supplied `data.route` (absolute pathname)
          // and/or `data.params` (flat object of string params) — falls back to the
          // community notifications screen. We only allow absolute paths within the
          // app to avoid opening arbitrary URLs from a push payload.
          const rawRoute = typeof data.route === 'string' ? data.route.trim() : '';
          const safeRoute = rawRoute.startsWith('/') ? rawRoute : '/community/notifications';
          const rawParams = (data.params && typeof data.params === 'object') ? data.params : null;
          const params: Record<string, string> = {};
          if (rawParams) {
            for (const [k, v] of Object.entries(rawParams)) {
              if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                params[k] = String(v);
              }
            }
          }
          nav(() =>
            Object.keys(params).length > 0
              ? router.push({ pathname: safeRoute, params } as any)
              : router.push(safeRoute as any),
          );
          break;
        }
        case 'community_reaction': {
          const msg = String(data.message || '').toLowerCase();
          const isFriendRequestTap = data.reactionType === '👋' && msg.includes('friend request');
          if (isFriendRequestTap) {
            nav(() => router.push({ pathname: '/community/add-friend', params: { tab: 'incoming' } } as any));
          } else {
            nav(() => router.push('/(tabs)/community' as any));
          }
          break;
        }
        case 'classroom_sync':
          nav(() => router.push('/(tabs)/planner' as any));
          break;
        case 'weekly_summary':
          nav(() => router.push('/(tabs)/planner' as any));
          break;
        case 'study_complete':
          nav(() => router.push('/study-timer' as any));
          break;
        case 'attendance_checkin': {
          // Banner tap should open the in-app notification manager where the user can answer
          // and the item will auto-disappear after recording. We guard here because
          // `getLastNotificationResponseAsync()` keeps returning the last tap across app
          // launches — without these checks the Notification Manager would open on every
          // cold start and inject a stale "Class check-in" card earlier than T−5.
          const timetableEntryId = String((data as any)?.timetableEntryId ?? '').trim();
          const scheduledStartAt = String((data as any)?.scheduledStartAt ?? '').trim();
          const startMs = Date.parse(scheduledStartAt);
          const nowMs = Date.now();
          // Only treat the tap as live if the class hasn't passed more than ~90 min ago
          // and isn't more than ~30 min in the future (T−5 fires 5 min before, so allow a small lead).
          const isFresh =
            Number.isFinite(startMs) &&
            startMs - 30 * 60_000 <= nowMs &&
            nowMs <= startMs + 90 * 60_000;
          void (async () => {
            try {
              if (!timetableEntryId || !scheduledStartAt || !isFresh) return;
              const answered = await getAnsweredOccurrenceSet().catch(() => new Set<string>());
              if (answered.has(attendanceOccurrenceKey(timetableEntryId, scheduledStartAt))) return;
              nav(() =>
                router.push({
                  pathname: '/community/notifications',
                  params: {
                    fromAttendanceTap: '1',
                    timetableEntryId,
                    scheduledStartAt,
                    subjectCode: String((data as any)?.subjectCode ?? ''),
                    subjectName: String((data as any)?.subjectName ?? ''),
                    subjectKey: String((data as any)?.subjectKey ?? ''),
                    displaySubject: String((data as any)?.displaySubject ?? ''),
                    fireAtMs: String((data as any)?.fireAtMs ?? ''),
                  },
                } as any),
              );
              await AsyncStorage.setItem(
                'lastAttendanceTapV1',
                JSON.stringify({
                  type: 'attendance_checkin',
                  timetableEntryId,
                  scheduledStartAt,
                  subjectCode: String((data as any)?.subjectCode ?? ''),
                  subjectName: String((data as any)?.subjectName ?? ''),
                  subjectKey: String((data as any)?.subjectKey ?? ''),
                  displaySubject: String((data as any)?.displaySubject ?? ''),
                  fireAtMs: String((data as any)?.fireAtMs ?? ''),
                  savedAt: new Date().toISOString(),
                }),
              ).catch(() => {});
            } finally {
              // Prevent the same tap from being re-handled on the next cold start.
              void Notifications.clearLastNotificationResponseAsync().catch(() => {});
            }
          })();
          break;
        }
      }
    };

    Notifications.getLastNotificationResponseAsync().then(async (response) => {
      if (!response) return;
      const attendance = await handleAttendanceNotificationResponse(response).catch(() => ({ handled: false as const }));
      if (attendance.handled && attendance.defaultTapData) {
        handleNotificationData(attendance.defaultTapData, true);
        return;
      }
      if (!attendance.handled) {
        handleNotificationData(response.notification.request.content.data as Record<string, any> | undefined, true);
      }
    });
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      void (async () => {
        const attendance = await handleAttendanceNotificationResponse(response).catch(() => ({ handled: false as const }));
        if (attendance.handled) {
          if (attendance.defaultTapData) handleNotificationData(attendance.defaultTapData);
          return;
        }
        handleNotificationData(response.notification.request.content.data as Record<string, any> | undefined);
      })();
    });
    return () => sub.remove();
  }, []);

  return (
    <AppProvider>
      <CommunityProvider>
        <QuizProvider>
          <ThemeAwareLayout />
        </QuizProvider>
      </CommunityProvider>
    </AppProvider>
  );
}

function ThemeAwareLayout() {
  const theme = useTheme();
  const themeId = useThemeId();
  const isDark = isDarkTheme(themeId);
  const navBase = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...navBase,
    dark: isDark,
    colors: {
      ...navBase.colors,
      primary: theme.primary,
      background: theme.background,
      card: theme.card,
      text: theme.text,
      border: theme.border,
      notification: theme.accent,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="subscription-plans" />
        <Stack.Screen name="settings" />
        <Stack.Screen
          name="timetable-import"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="classroom-sync" />
        <Stack.Screen name="add-subject" />
        <Stack.Screen name="auto-share-settings" />
        <Stack.Screen name="community" />
        <Stack.Screen name="legal" />
        <Stack.Screen name="study-timer" />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        <Stack.Screen 
          name="ai-chat" 
          options={{ 
            presentation: 'transparentModal', 
            animation: 'fade',
            headerShown: false 
          }} 
        />
      </Stack>
    </ThemeProvider>
  );
}
