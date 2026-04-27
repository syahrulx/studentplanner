import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';

export default function OAuth2Redirect() {
  const theme = useTheme();
  
  useEffect(() => {
    // This screen is a sinkhole for the Expo Router deep link.
    // When the OAuth proxy redirects to rencana://oauth2redirect, 
    // Expo Router navigates here. We just immediately pop back so 
    // the previous screen (which is waiting for the auth promise) can continue.
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
