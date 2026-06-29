import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Read a file reference as a base64 string (without the `data:...;base64,` prefix).
 *
 * - Native: uses expo-file-system on the local file URI.
 * - Web: `expo-file-system` can't read `blob:`/`file:` object URLs produced by
 *   browser file inputs, so we fetch the URI and decode the Blob with FileReader.
 *
 * This keeps the many image/PDF upload helpers identical across platforms.
 */
export async function readUriAsBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.onloadend = () => {
        const result = String(reader.result || '');
        const commaIdx = result.indexOf(',');
        // strip the leading `data:<mime>;base64,` so callers get raw base64
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      };
      reader.readAsDataURL(blob);
    });
  }
  return await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
}
