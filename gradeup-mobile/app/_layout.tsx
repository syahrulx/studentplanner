import FontAwesome from '@expo/vector-icons/FontAwesome';
import { ThemeProvider, DefaultTheme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppProvider } from '@/src/context/AppContext';
import { CommunityProvider } from '@/src/context/CommunityContext';
import { useTheme } from '@/hooks/useTheme';

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
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const data = response?.notification.request.content.data as { type?: string } | undefined;
      if (data?.type === 'revision') {
        setTimeout(() => router.push('/revision-due'), 100);
      }
    });
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string } | undefined;
      if (data?.type === 'revision') {
        router.push('/revision-due');
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <AppProvider>
      <CommunityProvider>
        <ThemeAwareLayout />
      </CommunityProvider>
    </AppProvider>
  );
}

function ThemeAwareLayout() {
  const theme = useTheme();
  const navTheme = {
    ...DefaultTheme,
    dark: false,
    colors: {
      ...DefaultTheme.colors,
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
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile-settings" />
        <Stack.Screen name="add-subject" />
        <Stack.Screen name="community" />
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
