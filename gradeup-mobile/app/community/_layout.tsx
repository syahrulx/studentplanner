import { Stack } from 'expo-router';

export default function CommunityLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="study-buddy" />
      <Stack.Screen name="merit" />
      <Stack.Screen name="music" />
    </Stack>
  );
}
