// App entry. The class check-in background task has to be defined before
// anything else so Android can run it with the app closed
// (see src/tasks/attendanceActionTask.ts); then the normal Expo Router entry.
import './src/tasks/attendanceActionTask';
import 'expo-router/entry';
