import { Stack } from 'expo-router';

export default function CommunityLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="friend-profile" />
      <Stack.Screen name="add-friend" />
      <Stack.Screen name="circles" />
      <Stack.Screen name="circle-detail" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="set-status" />
    </Stack>
  );
}
