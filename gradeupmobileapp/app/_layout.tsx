import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '../src/context/AppContext';

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="import-whatsapp" />
        <Stack.Screen name="ai-extraction" />
        <Stack.Screen name="task-details" />
        <Stack.Screen name="add-task" />
        <Stack.Screen name="stress-map" />
        <Stack.Screen name="weekly-summary" />
        <Stack.Screen name="groups" />
        <Stack.Screen name="notes-list" />
        <Stack.Screen name="notes-editor" />
        <Stack.Screen name="quiz-config" />
        <Stack.Screen name="quiz-mode-selection" />
        <Stack.Screen name="match-lobby" />
        <Stack.Screen name="quiz-gameplay" />
        <Stack.Screen name="results-page" />
        <Stack.Screen name="leaderboard" />
        <Stack.Screen name="flashcard-review" />
        <Stack.Screen name="ai-page" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </AppProvider>
  );
}
