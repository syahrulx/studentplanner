import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_HAS_SEEN_TUTORIAL = 'hasSeenTutorial';

export async function getHasSeenTutorial(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(KEY_HAS_SEEN_TUTORIAL);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setHasSeenTutorial(value: boolean): Promise<void> {
  try {
    if (value) {
      await AsyncStorage.setItem(KEY_HAS_SEEN_TUTORIAL, 'true');
    } else {
      await AsyncStorage.removeItem(KEY_HAS_SEEN_TUTORIAL);
    }
  } catch {}
}
