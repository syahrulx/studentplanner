import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';

export type ExportImageFormat = 'png' | 'jpg';
export type ExportResult = 'saved' | 'denied' | 'error';

type ExportCanvasProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  format: ExportImageFormat;
  quality: number;
};

/**
 * Off-screen capture surface. Native uses react-native-view-shot; the web variant
 * (ViewShotCompat.web.tsx) renders a plain View and captures it with html2canvas.
 */
export const ExportCanvas = React.forwardRef<ViewShot, ExportCanvasProps>(
  ({ children, style, format, quality }, ref) => (
    <ViewShot ref={ref} options={{ format, quality, result: 'tmpfile' }} style={style}>
      {children}
    </ViewShot>
  ),
);
ExportCanvas.displayName = 'ExportCanvas';

/** Capture the canvas and save it to the device photo library. */
export async function saveExportCanvas(
  ref: ViewShot | null,
  opts: { format: ExportImageFormat; quality: number },
): Promise<ExportResult> {
  try {
    // writeOnly: only add/save access (avoids READ_MEDIA_* under Play policy).
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    if (status !== 'granted') return 'denied';
    if (!ref) return 'error';
    const uri = await captureRef(ref, {
      format: opts.format,
      quality: opts.format === 'jpg' ? opts.quality : 1,
      result: 'tmpfile',
    });
    await MediaLibrary.saveToLibraryAsync(uri);
    return 'saved';
  } catch {
    return 'error';
  }
}
