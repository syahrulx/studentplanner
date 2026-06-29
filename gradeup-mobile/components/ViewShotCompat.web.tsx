import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import html2canvas from 'html2canvas';

export type ExportImageFormat = 'png' | 'jpg';
export type ExportResult = 'saved' | 'denied' | 'error';

type ExportCanvasProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  format: ExportImageFormat;
  quality: number;
};

/**
 * Web capture surface: a plain react-native-web View (renders a DOM <div>). The
 * forwarded ref resolves to the underlying DOM element, which html2canvas snapshots.
 */
export const ExportCanvas = React.forwardRef<View, ExportCanvasProps>(
  ({ children, style }, ref) => (
    <View ref={ref} style={style}>
      {children}
    </View>
  ),
);
ExportCanvas.displayName = 'ExportCanvas';

/** Capture the canvas with html2canvas and trigger a browser download. */
export async function saveExportCanvas(
  ref: unknown,
  opts: { format: ExportImageFormat; quality: number },
): Promise<ExportResult> {
  try {
    const el = ref as unknown as HTMLElement | null;
    if (!el || typeof (el as any).getBoundingClientRect !== 'function') return 'error';
    const canvas = await html2canvas(el, { backgroundColor: null, useCORS: true, scale: 2 });
    const mime = opts.format === 'jpg' ? 'image/jpeg' : 'image/png';
    const dataUrl = canvas.toDataURL(mime, opts.format === 'jpg' ? opts.quality : 1);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `timetable.${opts.format === 'jpg' ? 'jpg' : 'png'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return 'saved';
  } catch {
    return 'error';
  }
}
