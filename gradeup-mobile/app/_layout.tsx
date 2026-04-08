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

import { AppProvider } from '@/src/context/AppContext';
import { CommunityProvider } from '@/src/context/CommunityContext';
import { QuizProvider } from '@/src/context/QuizContext';
import { useTheme, useThemeId } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';

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
      const nav = (fn: () => void) => delayed ? setTimeout(fn, 100) : fn();
      switch (data.type) {
        case 'revision':
          nav(() => router.push('/revision-due')); break;
        case 'quiz_invite':
          if (data.sessionId) nav(() => router.push({ pathname: '/match-lobby', params: { sessionId: data.sessionId } } as any)); break;
        case 'task_reminder':
        case 'task_overdue':
          if (data.taskId) nav(() => router.push({ pathname: '/task-details', params: { id: data.taskId } } as any)); break;
        case 'shared_task':
          nav(() => router.push('/(tabs)/community' as any)); break;
        case 'classroom_sync':
          nav(() => router.push('/(tabs)/planner' as any)); break;
        case 'weekly_summary':
          nav(() => router.push('/(tabs)/planner' as any)); break;
        case 'study_complete':
          nav(() => router.push('/study-timer' as any)); break;
      }
    };

    Notifications.getLastNotificationResponseAsync().then((response) => {
      handleNotificationData(response?.notification.request.content.data as Record<string, any> | undefined, true);
    });
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationData(response.notification.request.content.data as Record<string, any> | undefined);
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
        <Stack.Screen name="community" />
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
