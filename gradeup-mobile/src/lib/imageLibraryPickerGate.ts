import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/**
 * Run Expo’s image-library permission request before opening the picker.
 *
 * - iOS: may show the Photos permission prompt.
 * - Android 13+: uses the system photo picker; manifest does not include broad
 *   READ_MEDIA_IMAGES/READ_MEDIA_VIDEO (required for Play policy). The system
 *   may not list the app under Settings → Photos and videos as “allowed” for
 *   full library access — that is expected.
 * - Android 12 and below: may prompt for legacy storage access as needed.
 */
export async function ensureImageLibraryAccessForPicker(): Promise<boolean> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return true;
  }
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}
