import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';

/**
 * Safe landing screen for the `rencana://oauth2redirect` deep link.
 *
 * On iOS, Google OAuth redirects through the reversed-client-id scheme,
 * so this screen is rarely hit. On Android, the new flow (v7+) no longer
 * uses browser redirects for Classroom at all, so this is purely a safety
 * net in case old builds or edge cases fire the deep link.
 *
 * Behaviour: show a brief spinner, then navigate back to wherever the
 * user came from (or to the main tabs if there's no history).
 */
export default function OAuth2Redirect() {
  const theme = useTheme();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={theme.primary} />
    </View>
  );
}
