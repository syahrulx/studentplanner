import { NativeModules } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type PickedAvatar = { data: string; mime?: string };

function isPickerCancelled(err: unknown): boolean {
  const e = err as { message?: string; code?: string };
  return !!(
    e?.code === 'E_PICKER_CANCELLED'
    || e?.message?.toLowerCase().includes('cancel')
  );
}

/** Native crop picker — only available in dev/TestFlight builds, not Expo Go. */
function hasNativeCropPicker(): boolean {
  return !!NativeModules.RNCImageCropPicker;
}

async function pickWithNativeCropper(): Promise<PickedAvatar | null> {
  // Lazy require so Expo Go doesn't crash at import time.
  const ImageCropPicker = require('react-native-image-crop-picker').default;
  const result = await ImageCropPicker.openPicker({
    width: 800,
    height: 800,
    cropping: true,
    cropperCircleOverlay: true,
    includeBase64: true,
    mediaType: 'photo',
  });
  if (!result?.data) return null;
  return { data: result.data, mime: result.mime };
}

async function pickWithExpoPicker(): Promise<PickedAvatar | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
    base64: true,
  });
  if (picked.canceled || !picked.assets?.[0]?.base64) return null;
  const asset = picked.assets[0];
  return { data: asset.base64, mime: asset.mimeType ?? 'image/jpeg' };
}

/** Pick a square avatar image. Uses native crop UI when available, Expo picker in Expo Go. */
export async function pickAvatarImage(): Promise<PickedAvatar | null> {
  try {
    if (hasNativeCropPicker()) return await pickWithNativeCropper();
    return await pickWithExpoPicker();
  } catch (err) {
    if (isPickerCancelled(err)) return null;
    throw err;
  }
}
