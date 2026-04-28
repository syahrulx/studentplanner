import '@/src/notificationsForeground';
import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';

export default function CommunityLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Avoid a solid black card behind the first screen (e.g. cold open from a link)
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="friend-profile" />
      <Stack.Screen name="add-friend" />
      <Stack.Screen name="circles" />
      <Stack.Screen name="circle-detail" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="create-post" />
      <Stack.Screen name="post-detail" />
      <Stack.Screen name="request-authority" />
    </Stack>
  );
}
