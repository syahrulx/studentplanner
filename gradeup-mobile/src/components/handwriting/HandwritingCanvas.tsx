import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  PointerType,
  type GestureStateChangeEvent,
  type GestureType,
  type GestureUpdateEvent,
  type PanGestureHandlerEventPayload,
} from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { WebView } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';
import type {
  HandwritingPage,
  HandwritingElement,
  HandwritingPoint,
  HandwritingStroke,
  HandwritingTool,
  HandwritingToolSettings,
} from '@/src/lib/handwritingTypes';
import { getNoteAttachmentUrl } from '@/src/lib/noteStorage';

type PanEvent =
  | GestureStateChangeEvent<PanGestureHandlerEventPayload>
  | GestureUpdateEvent<PanGestureHandlerEventPayload>;

interface Props {
  page: HandwritingPage;
  tool: HandwritingTool;
  color: string;
  width: number;
  fingerDrawing: boolean;
  settings: HandwritingToolSettings;
  simultaneousGestures?: GestureType[];
  disabled?: boolean;
  transparentBackground?: boolean;
  onChange: (strokes: HandwritingStroke[]) => void;
  onElementsChange?: (elements: HandwritingElement[]) => void;
  onCommit: (previousStrokes: HandwritingStroke[]) => void;
  onToolGestureEnd?: (tool: HandwritingTool) => void;
  onStylusDoubleTap?: () => void;
  onConvertSelection?: (captureDataUri: string, bounds: NormalizedBounds, strokes: HandwritingStroke[]) => void;
}

type ResizeCorner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
type ElementFrame = { x: number; y: number; width: number; height: number };

function PageElement({
  element,
  selected,
  editable,
  canvasWidth,
  canvasHeight,
  onSelect,
  onMove,
  onResize,
}: {
  element: HandwritingElement;
  selected: boolean;
  editable: boolean;
  canvasWidth: number;
  canvasHeight: number;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (frame: ElementFrame) => void;
}) {
  const [remoteUri, setRemoteUri] = useState<string | null>(null);
  const [previewFrame, setPreviewFrame] = useState<ElementFrame | null>(null);
  const startRef = useRef<ElementFrame>({ x: element.x, y: element.y, width: element.width, height: element.height });
  useEffect(() => {
    let active = true;
    if (!element.storagePath) { setRemoteUri(null); return; }
    void getNoteAttachmentUrl(element.storagePath).then(({ url }) => {
      if (active) setRemoteUri(url ?? null);
    });
    return () => { active = false; };
  }, [element.storagePath]);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => editable,
    onMoveShouldSetPanResponder: (_event, gesture) => editable && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
    onPanResponderGrant: () => {
      startRef.current = { x: element.x, y: element.y, width: element.width, height: element.height };
      onSelect();
    },
    onPanResponderRelease: (_event, gesture) => {
      onMove(
        Math.max(0, Math.min(1 - element.width, startRef.current.x + gesture.dx / Math.max(1, canvasWidth))),
        Math.max(0, Math.min(1 - element.height, startRef.current.y + gesture.dy / Math.max(1, canvasHeight))),
      );
    },
  }), [canvasHeight, canvasWidth, editable, element.height, element.width, element.x, element.y, onMove, onSelect]);
  const resizeResponders = useMemo(() => {
    const frameForGesture = (corner: ResizeCorner, dxPixels: number, dyPixels: number): ElementFrame => {
      const start = startRef.current;
      const dx = dxPixels / Math.max(1, canvasWidth);
      const dy = dyPixels / Math.max(1, canvasHeight);
      const minWidth = 0.06;
      const minHeight = 0.04;
      const originalRight = start.x + start.width;
      const originalBottom = start.y + start.height;
      const movesLeft = corner === 'topLeft' || corner === 'bottomLeft';
      const movesTop = corner === 'topLeft' || corner === 'topRight';
      const left = movesLeft
        ? Math.max(0, Math.min(originalRight - minWidth, start.x + dx))
        : start.x;
      const right = movesLeft
        ? originalRight
        : Math.min(1, Math.max(start.x + minWidth, originalRight + dx));
      const top = movesTop
        ? Math.max(0, Math.min(originalBottom - minHeight, start.y + dy))
        : start.y;
      const bottom = movesTop
        ? originalBottom
        : Math.min(1, Math.max(start.y + minHeight, originalBottom + dy));
      return { x: left, y: top, width: right - left, height: bottom - top };
    };
    const create = (corner: ResizeCorner) => PanResponder.create({
      onStartShouldSetPanResponder: () => editable,
      onMoveShouldSetPanResponder: () => editable,
      onPanResponderGrant: () => {
        startRef.current = { x: element.x, y: element.y, width: element.width, height: element.height };
        setPreviewFrame(startRef.current);
        onSelect();
      },
      onPanResponderMove: (_event, gesture) => {
        setPreviewFrame(frameForGesture(corner, gesture.dx, gesture.dy));
      },
      onPanResponderRelease: (_event, gesture) => {
        const next = frameForGesture(corner, gesture.dx, gesture.dy);
        setPreviewFrame(null);
        onResize(next);
      },
      onPanResponderTerminate: () => setPreviewFrame(null),
    });
    return {
      topLeft: create('topLeft'),
      topRight: create('topRight'),
      bottomLeft: create('bottomLeft'),
      bottomRight: create('bottomRight'),
    };
  }, [canvasHeight, canvasWidth, editable, element.height, element.width, element.x, element.y, onResize, onSelect]);
  const uri = remoteUri || element.localUri;
  const frame = previewFrame ?? element;
  return (
    <View
      {...(editable ? responder.panHandlers : {})}
      style={{
        position: 'absolute', left: frame.x * canvasWidth, top: frame.y * canvasHeight,
        width: frame.width * canvasWidth, height: frame.height * canvasHeight,
        transform: [{ rotate: `${element.rotation ?? 0}deg` }],
        borderWidth: selected ? 1.5 : 0, borderColor: '#2563eb', borderStyle: 'dashed',
      }}
    >
      <Pressable style={styles.fill} onPress={editable ? onSelect : undefined}>
        {element.type === 'text' ? (
          <Text style={{ color: element.color ?? '#111827', fontSize: Math.max(10, (element.fontSize ?? 0.025) * canvasHeight) }}>
            {element.text}
          </Text>
        ) : uri ? (
          <Image source={{ uri }} style={styles.fill} resizeMode="contain" accessibilityLabel="Inserted note image" />
        ) : (
          <View style={[styles.fill, styles.missingImage]}><Text style={styles.missingImageText}>Image unavailable</Text></View>
        )}
      </Pressable>
      {selected && editable ? (Object.keys(resizeResponders) as ResizeCorner[]).map((corner) => (
        <View
          key={corner}
          {...resizeResponders[corner].panHandlers}
          style={[styles.elementResizeHandle, styles[corner]]}
        >
          <View style={styles.resizeDot} />
        </View>
      )) : null}
    </View>
  );
}

function clampPoint(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function pointFromEvent(event: PanEvent, width: number, height: number): HandwritingPoint {
  return {
    x: clampPoint(event.x / Math.max(1, width)),
    y: clampPoint(event.y / Math.max(1, height)),
    pressure: event.stylusData?.pressure,
  };
}

interface PixelPoint {
  x: number;
  y: number;
  pressure: number;
}

function pixelPoints(
  stroke: HandwritingStroke,
  canvasWidth: number,
  canvasHeight: number,
): PixelPoint[] {
  return stroke.points.map((point) => ({
    x: point.x * canvasWidth,
    y: point.y * canvasHeight,
    pressure: Math.max(0.05, Math.min(1, point.pressure ?? 0.5)),
  }));
}

/**
 * Chaikin corner cutting keeps the writer's intent while removing the small
 * angular hooks produced by sparse touch/stylus events.
 */
function softenPoints(points: PixelPoint[], passes: number): PixelPoint[] {
  let result = points;
  for (let pass = 0; pass < passes; pass += 1) {
    if (result.length < 3) return result;
    const next: PixelPoint[] = [result[0]];
    for (let index = 0; index < result.length - 1; index += 1) {
      const a = result[index];
      const b = result[index + 1];
      next.push({
        x: a.x * 0.75 + b.x * 0.25,
        y: a.y * 0.75 + b.y * 0.25,
        pressure: a.pressure * 0.75 + b.pressure * 0.25,
      });
      next.push({
        x: a.x * 0.25 + b.x * 0.75,
        y: a.y * 0.25 + b.y * 0.75,
        pressure: a.pressure * 0.25 + b.pressure * 0.75,
      });
    }
    next.push(result[result.length - 1]);
    result = next;
  }
  return result;
}

function number(value: number): string {
  return value.toFixed(2);
}

function continuousPath(points: PixelPoint[], smoothing: number): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${number(points[0].x)} ${number(points[0].y)}`;

  // Fast mode follows the input closely. Balanced and Smooth progressively
  // soften corners, but all modes remain one joined vector path.
  const softened = smoothing >= 0.68
    ? softenPoints(points, 2)
    : smoothing >= 0.3
      ? softenPoints(points, 1)
      : points;
  if (smoothing < 0.3 || softened.length < 3) {
    return softened
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${number(point.x)} ${number(point.y)}`)
      .join(' ');
  }

  let path = `M ${number(softened[0].x)} ${number(softened[0].y)}`;
  for (let index = 1; index < softened.length - 1; index += 1) {
    const point = softened[index];
    const next = softened[index + 1];
    path += ` Q ${number(point.x)} ${number(point.y)} ${number((point.x + next.x) / 2)} ${number((point.y + next.y) / 2)}`;
  }
  const last = softened[softened.length - 1];
  path += ` T ${number(last.x)} ${number(last.y)}`;
  return path;
}

function averagePressure(points: PixelPoint[]): number {
  if (!points.length) return 0.5;
  return points.reduce((sum, point) => sum + point.pressure, 0) / points.length;
}

function pressureSegments(
  points: PixelPoint[],
  color: string,
  baseWidth: number,
  opacity: number,
  sensitivity: number,
  widthBoost = 1,
): string {
  if (points.length < 2) return '';
  return points.slice(1).map((point, index) => {
    const previous = points[index];
    const pressure = Math.max(0.08, (previous.pressure + point.pressure) / 2);
    const width = Math.max(0.6, baseWidth * widthBoost * (1 + (pressure - 0.5) * sensitivity));
    return `<path d="M ${number(previous.x)} ${number(previous.y)} L ${number(point.x)} ${number(point.y)}" fill="none" stroke="${color}" stroke-width="${number(width)}" stroke-opacity="${number(opacity)}" stroke-linecap="round"/>`;
  }).join('');
}

function svgAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function strokeSvgMarkup(
  stroke: HandwritingStroke,
  canvasWidth: number,
  canvasHeight: number,
): string {
  const points = pixelPoints(stroke, canvasWidth, canvasHeight);
  if (!points.length) return '';
  const smoothing = stroke.smoothing ?? 0.45;
  const path = continuousPath(points, smoothing);
  const pressure = averagePressure(points);
  const first = points[0];
  const last = points[points.length - 1];
  const strokeColor = svgAttribute(stroke.color);
  const strokeId = svgAttribute(stroke.id);

  if (stroke.tool === 'highlighter') {
    const markerWidth = Math.max(5, stroke.width * 2.8);
    return points.length === 1
      ? `<g id="stroke-${strokeId}"><circle cx="${number(first.x)}" cy="${number(first.y)}" r="${number(markerWidth / 2)}" fill="${strokeColor}" opacity="${stroke.opacity}"/></g>`
      : `<g id="stroke-${strokeId}"><path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${number(markerWidth)}" stroke-opacity="${stroke.opacity}" stroke-linecap="square" stroke-linejoin="round"/></g>`;
  }

  if (stroke.tool === 'pencil') {
    const softness = stroke.pencilSoftness ?? 0.5;
    const pencilWidth = Math.max(0.8, stroke.width * (0.58 + softness * 0.28));
    const opacity = Math.max(0.2, stroke.opacity);
    if (points.length === 1) {
      return `<g id="stroke-${strokeId}"><circle cx="${number(first.x)}" cy="${number(first.y)}" r="${number(pencilWidth / 2)}" fill="${strokeColor}" opacity="${number(opacity * 0.78)}"/></g>`;
    }
    return [
      `<g id="stroke-${strokeId}">`,
      `<path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${number(pencilWidth * 1.35)}" stroke-opacity="${number(opacity * (0.08 + softness * 0.08))}" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${number(pencilWidth)}" stroke-opacity="${number(opacity * 0.66)}" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${number(Math.max(0.35, pencilWidth * 0.38))}" stroke-opacity="${number(Math.min(0.38, opacity * (0.2 + softness * 0.15)))}" stroke-linecap="round" stroke-linejoin="round" transform="translate(0.28 0.18)"/>`,
      '</g>',
    ].join('');
  }

  const style = stroke.penStyle ?? 'fountain';
  const sensitivity = style === 'ball' ? 0 : (stroke.pressureSensitivity ?? 0.5);
  const pressureMultiplier = 1 + (pressure - 0.5) * sensitivity * (style === 'brush' ? 1.5 : 0.85);
  const styleMultiplier = style === 'ball' ? 0.82 : style === 'brush' ? 1.3 : 1;
  const penWidth = Math.max(0.75, stroke.width * styleMultiplier * pressureMultiplier);
  const roundEndpoints = !stroke.taperedEnds;
  const lineCap = roundEndpoints ? 'round' : 'butt';

  return [
    `<g id="stroke-${strokeId}">`,
    style === 'brush'
      ? pressureSegments(points, strokeColor, stroke.width, 0.16, sensitivity * 1.8, 1.7)
      : '',
    style === 'ball'
      ? `<path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${number(penWidth)}" stroke-opacity="${stroke.opacity}" stroke-linecap="round" stroke-linejoin="round"/>`
      : pressureSegments(points, strokeColor, stroke.width * styleMultiplier, stroke.opacity, sensitivity * (style === 'brush' ? 1.9 : 1.05)),
    roundEndpoints
      ? `<circle cx="${number(first.x)}" cy="${number(first.y)}" r="${number(penWidth / 2)}" fill="${strokeColor}" opacity="${stroke.opacity}"/><circle cx="${number(last.x)}" cy="${number(last.y)}" r="${number(penWidth / 2)}" fill="${strokeColor}" opacity="${stroke.opacity}"/>`
      : '',
    '</g>',
  ].join('');
}

const INK_DOCUMENT = `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
      svg { display: block; width: 100%; height: 100%; overflow: visible; }
    </style>
  </head>
  <body><svg id="ink" xmlns="http://www.w3.org/2000/svg"></svg></body>
</html>`;

function Rule({
  left,
  top,
  width,
  height,
  color,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
}) {
  return <View style={{ position: 'absolute', left, top, width, height, backgroundColor: color }} />;
}

function PageTemplate({
  template,
  width,
  height,
  transparent,
}: {
  template: HandwritingPage['template'];
  width: number;
  height: number;
  transparent: boolean;
}) {
  if (transparent) return null;
  const dark = template === 'dark';
  const backgroundColor = dark ? '#151922' : '#ffffff';
  const ruleColor = dark ? '#3d4658' : '#d7dce5';
  const rules = [];

  if (template === 'ruled' || template === 'grid' || template === 'cornell' || template === 'dark') {
    for (let y = 34; y < height; y += 30) {
      rules.push(<Rule key={`h-${y}`} left={0} top={y} width={width} height={StyleSheet.hairlineWidth} color={ruleColor} />);
    }
  }
  if (template === 'grid') {
    for (let x = 30; x < width; x += 30) {
      rules.push(<Rule key={`v-${x}`} left={x} top={0} width={StyleSheet.hairlineWidth} height={height} color={ruleColor} />);
    }
  }
  if (template === 'dots') {
    for (let x = 24; x < width; x += 24) {
      for (let y = 24; y < height; y += 24) {
        rules.push(
          <View
            key={`d-${x}-${y}`}
            style={{ position: 'absolute', left: x - 1, top: y - 1, width: 2, height: 2, borderRadius: 1, backgroundColor: '#c7cdd8' }}
          />,
        );
      }
    }
  }
  if (template === 'cornell') {
    rules.push(
      <Rule key="cornell-v" left={width * 0.28} top={0} width={1} height={height} color="#e87878" />,
      <Rule key="cornell-h" left={0} top={height * 0.82} width={width} height={1} color="#c7cdd8" />,
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor }]} pointerEvents="none">
      {rules}
    </View>
  );
}

function WritingGuideOverlay({
  guide,
  width,
  height,
}: {
  guide: HandwritingToolSettings['writingGuide'];
  width: number;
  height: number;
}) {
  if (guide === 'off') return null;
  const marks = [];
  if (guide === 'baseline') {
    for (let y = 44; y < height; y += 44) {
      marks.push(
        <View
          key={`guide-${y}`}
          style={{ position: 'absolute', left: 12, right: 12, top: y, borderTopWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(37,99,235,0.2)' }}
        />,
      );
    }
  } else {
    for (let x = -height; x < width; x += 54) {
      marks.push(
        <View
          key={`slant-${x}`}
          style={{ position: 'absolute', left: x, top: 0, width: 1, height: height * 1.5, backgroundColor: 'rgba(37,99,235,0.13)', transform: [{ rotate: '-12deg' }] }}
        />,
      );
    }
  }
  return <View style={StyleSheet.absoluteFill} pointerEvents="none">{marks}</View>;
}

interface NormalizedBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function boundsFromPoints(a: HandwritingPoint, b: HandwritingPoint): NormalizedBounds {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

function boundsForSelected(strokes: HandwritingStroke[], ids: Set<string>): NormalizedBounds | null {
  const points = strokes.filter((stroke) => ids.has(stroke.id)).flatMap((stroke) => stroke.points);
  if (!points.length) return null;
  return points.reduce<NormalizedBounds>((bounds, point) => ({
    left: Math.min(bounds.left, point.x),
    top: Math.min(bounds.top, point.y),
    right: Math.max(bounds.right, point.x),
    bottom: Math.max(bounds.bottom, point.y),
  }), { left: 1, top: 1, right: 0, bottom: 0 });
}

function strokeIntersectsBounds(stroke: HandwritingStroke, bounds: NormalizedBounds): boolean {
  return stroke.points.some((point) => (
    point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom
  ));
}

function pointInsideBounds(point: HandwritingPoint, bounds: NormalizedBounds): boolean {
  return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
}

function clampStrokePoint(point: HandwritingPoint): HandwritingPoint {
  return { ...point, x: clampPoint(point.x), y: clampPoint(point.y) };
}

export function HandwritingInkPreview({
  page,
  width,
  height,
  transparentBackground = false,
}: {
  page: HandwritingPage;
  width: number;
  height: number;
  transparentBackground?: boolean;
}) {
  const markup = useMemo(
    () => page.strokes.map((stroke) => strokeSvgMarkup(stroke, width, height)).join(''),
    [height, page.strokes, width],
  );
  const source = useMemo(() => ({ html: INK_DOCUMENT.replace(
    '<svg id="ink" xmlns="http://www.w3.org/2000/svg"></svg>',
    `<svg id="ink" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${markup}</svg>`,
  ) }), [height, markup, width]);
  return (
    <View style={{ width, height, overflow: 'hidden', backgroundColor: transparentBackground ? 'transparent' : page.template === 'dark' ? '#151922' : '#fff' }} pointerEvents="none">
      <PageTemplate template={page.template} width={width} height={height} transparent={transparentBackground} />
      <WebView source={source} style={StyleSheet.absoluteFill} pointerEvents="none" scrollEnabled={false} />
      {(page.elements ?? []).map((element) => (
        <PageElement key={element.id} element={element} selected={false} editable={false} canvasWidth={width} canvasHeight={height} onSelect={() => {}} onMove={() => {}} />
      ))}
    </View>
  );
}

function isNearlyStraight(points: HandwritingPoint[]): boolean {
  if (points.length < 3) return false;
  const first = points[0];
  const last = points[points.length - 1];
  const length = Math.hypot(last.x - first.x, last.y - first.y);
  if (length < 0.035) return false;
  const denominator = Math.max(0.0001, length);
  const meanDistance = points.reduce((sum, point) => (
    sum + Math.abs(
      (last.y - first.y) * point.x -
      (last.x - first.x) * point.y +
      last.x * first.y - last.y * first.x
    ) / denominator
  ), 0) / points.length;
  return meanDistance < 0.008;
}

function distanceToSegment(point: HandwritingPoint, start: HandwritingPoint, end: HandwritingPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const denominator = dx * dx + dy * dy;
  if (denominator <= 0.0000001) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function simplifyPoints(points: HandwritingPoint[], epsilon = 0.018): HandwritingPoint[] {
  if (points.length < 3) return points;
  let largest = 0;
  let largestIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(points[index], points[0], points[points.length - 1]);
    if (distance > largest) {
      largest = distance;
      largestIndex = index;
    }
  }
  if (largest <= epsilon) return [points[0], points[points.length - 1]];
  const left = simplifyPoints(points.slice(0, largestIndex + 1), epsilon);
  const right = simplifyPoints(points.slice(largestIndex), epsilon);
  return [...left.slice(0, -1), ...right];
}

/** Correct a held gesture while preserving the original stroke as one undoable item. */
function recognizedShapePoints(points: HandwritingPoint[]): HandwritingPoint[] | null {
  if (points.length < 3) return null;
  if (isNearlyStraight(points)) return [points[0], points[points.length - 1]];

  const first = points[0];
  const last = points[points.length - 1];
  const closed = Math.hypot(first.x - last.x, first.y - last.y) < 0.075;
  if (!closed) return null;

  const bounds = points.reduce<NormalizedBounds>((value, point) => ({
    left: Math.min(value.left, point.x), top: Math.min(value.top, point.y),
    right: Math.max(value.right, point.x), bottom: Math.max(value.bottom, point.y),
  }), { left: 1, top: 1, right: 0, bottom: 0 });
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  if (width < 0.035 || height < 0.035) return null;

  const simplified = simplifyPoints([...points, first], Math.max(0.012, Math.min(width, height) * 0.11));
  const cornerCount = Math.max(0, simplified.length - 1);
  if (cornerCount === 3) {
    const top = { x: (bounds.left + bounds.right) / 2, y: bounds.top };
    const bottomRight = { x: bounds.right, y: bounds.bottom };
    const bottomLeft = { x: bounds.left, y: bounds.bottom };
    return [top, bottomRight, bottomLeft, top];
  }
  if (cornerCount === 4) {
    const topLeft = { x: bounds.left, y: bounds.top };
    const topRight = { x: bounds.right, y: bounds.top };
    const bottomRight = { x: bounds.right, y: bounds.bottom };
    const bottomLeft = { x: bounds.left, y: bounds.bottom };
    return [topLeft, topRight, bottomRight, bottomLeft, topLeft];
  }

  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  return Array.from({ length: 49 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 48;
    return { x: centerX + Math.cos(angle) * width / 2, y: centerY + Math.sin(angle) * height / 2 };
  });
}

export default function HandwritingCanvas({
  page,
  tool,
  color,
  width: selectedWidth,
  fingerDrawing,
  settings,
  simultaneousGestures,
  disabled = false,
  transparentBackground = false,
  onChange,
  onCommit,
  onElementsChange,
  onToolGestureEnd,
  onStylusDoubleTap,
  onConvertSelection,
}: Props) {
  const canvasRef = useRef<View>(null);
  const inkWebViewRef = useRef<WebView>(null);
  const sizeRef = useRef({ width: 1, height: 1 });
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [displayStrokes, setDisplayStrokes] = useState(page.strokes);
  const [displayElements, setDisplayElements] = useState(page.elements ?? []);
  const strokesRef = useRef(page.strokes);
  const activeStrokeIdRef = useRef<string | null>(null);
  const gestureAcceptedRef = useRef(false);
  const beforeGestureRef = useRef<HandwritingStroke[]>([]);
  const gestureStartedAtRef = useRef(0);
  const gestureWasStylusRef = useRef(false);
  const lastStylusTapRef = useRef<{ at: number; before: HandwritingStroke[] } | null>(null);
  const lassoStartRef = useRef<HandwritingPoint | null>(null);
  const selectionOriginRef = useRef<HandwritingStroke[]>([]);
  const selectionModeRef = useRef<'select' | 'move' | 'resize'>('select');
  const selectionStartBoundsRef = useRef<NormalizedBounds | null>(null);
  const selectionResizeCornerRef = useRef<ResizeCorner | null>(null);
  const elementMoveRef = useRef<{ id: string; start: HandwritingPoint; x: number; y: number } | null>(null);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<Set<string>>(new Set());
  const [selectionBounds, setSelectionBounds] = useState<NormalizedBounds | null>(null);
  const [lassoBounds, setLassoBounds] = useState<NormalizedBounds | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [capturingSelection, setCapturingSelection] = useState(false);
  const pendingLiveStrokeRef = useRef<HandwritingStroke | null>(null);
  const liveFrameRef = useRef<number | null>(null);

  useEffect(() => {
    strokesRef.current = page.strokes;
    setDisplayStrokes(page.strokes);
  }, [page.strokes]);

  useEffect(() => { setDisplayElements(page.elements ?? []); }, [page.elements]);

  useEffect(() => {
    setSelectedStrokeIds(new Set());
    setSelectionBounds(null);
    setLassoBounds(null);
    setSelectedElementId(null);
  }, [page.id]);

  const clearSelection = useCallback(() => {
    setSelectedStrokeIds(new Set());
    setSelectionBounds(null);
    setLassoBounds(null);
    setSelectedElementId(null);
    lassoStartRef.current = null;
    elementMoveRef.current = null;
  }, []);

  useEffect(() => {
    if (tool !== 'lasso') clearSelection();
  }, [clearSelection, tool]);

  const handleCanvasTap = useCallback((x: number, y: number) => {
    if (tool !== 'lasso') return;

    // The selection command strip lives at the top of the paper. Let its
    // Pressables finish without the canvas simultaneously dropping selection.
    const tappedStrokeActions = selectedStrokeIds.size > 0 && y <= 52;
    const tappedElementActions = Boolean(selectedElementId) && y <= 52 && x <= 248;
    if (tappedStrokeActions || tappedElementActions) return;

    const point = {
      x: clampPoint(x / Math.max(1, sizeRef.current.width)),
      y: clampPoint(y / Math.max(1, sizeRef.current.height)),
    };
    const hitElement = [...displayElements].reverse().find((element) => (
      point.x >= element.x
      && point.x <= element.x + element.width
      && point.y >= element.y
      && point.y <= element.y + element.height
    ));
    if (hitElement) {
      setSelectedElementId(hitElement.id);
      setSelectedStrokeIds(new Set());
      setSelectionBounds(null);
      return;
    }
    if (selectionBounds && selectedStrokeIds.size > 0 && pointInsideBounds(point, selectionBounds)) return;
    clearSelection();
  }, [clearSelection, displayElements, selectedElementId, selectedStrokeIds, selectionBounds, tool]);

  const updateElement = useCallback((elementId: string, update: Partial<HandwritingElement>) => {
    const next = displayElements.map((element) => element.id === elementId
      ? { ...element, ...update, updatedAt: new Date().toISOString() }
      : element);
    setDisplayElements(next);
    onElementsChange?.(next);
  }, [displayElements, onElementsChange]);

  const elementAction = useCallback((kind: 'smaller' | 'larger' | 'rotateLeft' | 'rotateRight' | 'duplicate' | 'delete') => {
    if (!selectedElementId || !onElementsChange) return;
    const elements = displayElements;
    const selected = elements.find((element) => element.id === selectedElementId);
    if (!selected) return;
    if (kind === 'delete') {
      setDisplayElements(elements.filter((element) => element.id !== selectedElementId));
      onElementsChange(elements.filter((element) => element.id !== selectedElementId));
      setSelectedElementId(null);
      return;
    }
    if (kind === 'duplicate') {
      const copy = { ...selected, id: `he_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, x: clampPoint(selected.x + 0.03), y: clampPoint(selected.y + 0.03), updatedAt: new Date().toISOString() };
      setDisplayElements([...elements, copy]);
      onElementsChange([...elements, copy]);
      setSelectedElementId(copy.id);
      return;
    }
    const scale = kind === 'smaller' ? 0.9 : kind === 'larger' ? 1.1 : 1;
    updateElement(selectedElementId, {
      width: Math.max(0.08, Math.min(0.9, selected.width * scale)),
      height: Math.max(0.04, Math.min(0.9, selected.height * scale)),
      rotation: (selected.rotation ?? 0) + (kind === 'rotateLeft' ? -15 : kind === 'rotateRight' ? 15 : 0),
    });
  }, [displayElements, onElementsChange, selectedElementId, updateElement]);

  const renderInk = useCallback(() => {
    const markup = displayStrokes
      .map((stroke) => strokeSvgMarkup(stroke, canvasSize.width, canvasSize.height))
      .join('');
    inkWebViewRef.current?.injectJavaScript(`
      (function () {
        var ink = document.getElementById('ink');
        if (!ink) return;
        ink.setAttribute('viewBox', '0 0 ${canvasSize.width} ${canvasSize.height}');
        ink.innerHTML = ${JSON.stringify(markup)};
      })();
      true;
    `);
  }, [canvasSize.height, canvasSize.width, displayStrokes]);

  const renderLiveStroke = useCallback((stroke: HandwritingStroke) => {
    pendingLiveStrokeRef.current = stroke;
    if (liveFrameRef.current != null) return;
    liveFrameRef.current = requestAnimationFrame(() => {
      liveFrameRef.current = null;
      const latest = pendingLiveStrokeRef.current;
      if (!latest) return;
      const markup = strokeSvgMarkup(latest, sizeRef.current.width, sizeRef.current.height);
      inkWebViewRef.current?.injectJavaScript(`
        (function () {
          var ink = document.getElementById('ink');
          if (!ink) return;
          var previous = document.getElementById(${JSON.stringify(`stroke-${latest.id}`)});
          var holder = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          holder.innerHTML = ${JSON.stringify(markup)};
          var next = holder.firstElementChild;
          if (!next) return;
          if (previous) previous.replaceWith(next); else ink.appendChild(next);
        })();
        true;
      `);
    });
  }, []);

  useEffect(() => () => {
    if (liveFrameRef.current != null) cancelAnimationFrame(liveFrameRef.current);
  }, []);

  useEffect(() => {
    renderInk();
  }, [renderInk]);

  const acceptsPointer = (event: PanEvent): boolean => (
    !disabled &&
    (event.pointerType === PointerType.STYLUS || fingerDrawing || tool === 'lasso')
  );

  const eraseAt = (point: HandwritingPoint) => {
    const radius = settings.eraserStyle === 'precision'
      ? settings.eraserSize * 0.55
      : settings.eraserSize;
    let changed = false;
    const isHit = (candidate: HandwritingPoint) => {
      const dx = candidate.x - point.x;
      const dy = candidate.y - point.y;
      return dx * dx + dy * dy <= radius * radius;
    };
    const next = strokesRef.current.flatMap((stroke) => {
      if (settings.eraseHighlighterOnly && stroke.tool !== 'highlighter') return [stroke];
      if (!stroke.points.some(isHit)) return [stroke];
      changed = true;
      if (settings.eraserStyle === 'stroke') return [];

      const chunks: HandwritingPoint[][] = [];
      let chunk: HandwritingPoint[] = [];
      stroke.points.forEach((candidate) => {
        if (isHit(candidate)) {
          if (chunk.length) chunks.push(chunk);
          chunk = [];
        } else {
          chunk.push(candidate);
        }
      });
      if (chunk.length) chunks.push(chunk);
      return chunks
        .filter((points) => points.length > 1)
        .map((points, index) => ({ ...stroke, id: `${stroke.id}_e${index}`, points }));
    });
    if (changed) {
      strokesRef.current = next;
      setDisplayStrokes(next);
    }
  };

  const startGesture = (event: GestureStateChangeEvent<PanGestureHandlerEventPayload>) => {
    gestureAcceptedRef.current = acceptsPointer(event);
    if (!gestureAcceptedRef.current) return;
    beforeGestureRef.current = strokesRef.current;
    gestureStartedAtRef.current = Date.now();
    gestureWasStylusRef.current = event.pointerType === PointerType.STYLUS;
    const point = pointFromEvent(event, sizeRef.current.width, sizeRef.current.height);
    if (tool === 'lasso') {
      const hitElement = [...displayElements].reverse().find((element) => point.x >= element.x && point.x <= element.x + element.width && point.y >= element.y && point.y <= element.y + element.height);
      if (hitElement) {
        setSelectedElementId(hitElement.id);
        setSelectedStrokeIds(new Set());
        setSelectionBounds(null);
        elementMoveRef.current = { id: hitElement.id, start: point, x: hitElement.x, y: hitElement.y };
        return;
      }
      setSelectedElementId(null);
      lassoStartRef.current = point;
      selectionOriginRef.current = strokesRef.current;
      selectionStartBoundsRef.current = selectionBounds;
      selectionResizeCornerRef.current = null;
      if (selectionBounds) {
        const corners: Array<[ResizeCorner, number, number]> = [
          ['topLeft', selectionBounds.left, selectionBounds.top],
          ['topRight', selectionBounds.right, selectionBounds.top],
          ['bottomLeft', selectionBounds.left, selectionBounds.bottom],
          ['bottomRight', selectionBounds.right, selectionBounds.bottom],
        ];
        const nearest = corners
          .map(([corner, x, y]) => ({ corner, distance: Math.hypot(point.x - x, point.y - y) }))
          .sort((a, b) => a.distance - b.distance)[0];
        if (nearest && nearest.distance < 0.05) {
          selectionModeRef.current = 'resize';
          selectionResizeCornerRef.current = nearest.corner;
        } else if (pointInsideBounds(point, selectionBounds)) {
          selectionModeRef.current = 'move';
        } else {
          selectionModeRef.current = 'select';
          setSelectedStrokeIds(new Set());
          setSelectionBounds(null);
          setLassoBounds(boundsFromPoints(point, point));
        }
      } else {
        selectionModeRef.current = 'select';
        setSelectedStrokeIds(new Set());
        setSelectionBounds(null);
        setLassoBounds(boundsFromPoints(point, point));
      }
      return;
    }
    if (tool === 'eraser') {
      eraseAt(point);
      return;
    }

    const stroke: HandwritingStroke = {
      id: `hs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tool,
      color,
      width: selectedWidth,
      opacity: tool === 'highlighter'
        ? settings.markerOpacity
        : tool === 'pencil'
          ? settings.pencilOpacity
          : 1,
      penStyle: settings.penStyle,
      smoothing: settings.smoothing,
      stabilization: settings.stabilization,
      pressureSensitivity: settings.pressureSensitivity,
      tipSharpness: settings.tipSharpness,
      taperedEnds: settings.taperedEnds,
      pencilSoftness: settings.pencilSoftness,
      writingStyle: settings.writingStyle,
      points: [point],
    };
    activeStrokeIdRef.current = stroke.id;
    const next = [...strokesRef.current, stroke];
    strokesRef.current = next;
    renderLiveStroke(stroke);
  };

  const updateGesture = (event: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
    if (!gestureAcceptedRef.current) return;
    const rawPoint = pointFromEvent(event, sizeRef.current.width, sizeRef.current.height);
    if (tool === 'lasso') {
      const start = lassoStartRef.current;
      const movingElement = elementMoveRef.current;
      if (movingElement) {
        const next = displayElements.map((element) => element.id === movingElement.id ? {
          ...element,
          x: clampPoint(movingElement.x + rawPoint.x - movingElement.start.x),
          y: clampPoint(movingElement.y + rawPoint.y - movingElement.start.y),
        } : element);
        setDisplayElements(next);
        return;
      }
      if (!start) return;
      if (selectionModeRef.current === 'select') {
        setLassoBounds(boundsFromPoints(start, rawPoint));
        return;
      }
      const startBounds = selectionStartBoundsRef.current;
      if (!startBounds || !selectedStrokeIds.size) return;
      const dx = rawPoint.x - start.x;
      const dy = rawPoint.y - start.y;
      const selectionWidth = Math.max(0.001, startBounds.right - startBounds.left);
      const selectionHeight = Math.max(0.001, startBounds.bottom - startBounds.top);
      const corner = selectionResizeCornerRef.current ?? 'bottomRight';
      const movesLeft = corner === 'topLeft' || corner === 'bottomLeft';
      const movesTop = corner === 'topLeft' || corner === 'topRight';
      const minSize = 0.015;
      const targetLeft = selectionModeRef.current === 'resize' && movesLeft
        ? Math.max(0, Math.min(startBounds.right - minSize, startBounds.left + dx))
        : startBounds.left;
      const targetRight = selectionModeRef.current === 'resize' && !movesLeft
        ? Math.min(1, Math.max(startBounds.left + minSize, startBounds.right + dx))
        : startBounds.right;
      const targetTop = selectionModeRef.current === 'resize' && movesTop
        ? Math.max(0, Math.min(startBounds.bottom - minSize, startBounds.top + dy))
        : startBounds.top;
      const targetBottom = selectionModeRef.current === 'resize' && !movesTop
        ? Math.min(1, Math.max(startBounds.top + minSize, startBounds.bottom + dy))
        : startBounds.bottom;
      const scaleX = (targetRight - targetLeft) / selectionWidth;
      const scaleY = (targetBottom - targetTop) / selectionHeight;
      const next = selectionOriginRef.current.map((stroke) => {
        if (!selectedStrokeIds.has(stroke.id)) return stroke;
        return {
          ...stroke,
          points: stroke.points.map((candidate) => clampStrokePoint({
            ...candidate,
            x: selectionModeRef.current === 'move'
              ? candidate.x + dx
              : targetLeft + (candidate.x - startBounds.left) * scaleX,
            y: selectionModeRef.current === 'move'
              ? candidate.y + dy
              : targetTop + (candidate.y - startBounds.top) * scaleY,
          })),
        };
      });
      strokesRef.current = next;
      setDisplayStrokes(next);
      setSelectionBounds(boundsForSelected(next, selectedStrokeIds));
      return;
    }
    if (tool === 'eraser') {
      eraseAt(rawPoint);
      return;
    }
    const activeId = activeStrokeIdRef.current;
    if (!activeId) return;
    const activeStroke = strokesRef.current.find((stroke) => stroke.id === activeId);
    const lastPoint = activeStroke?.points[activeStroke.points.length - 1];
    const stabilization = activeStroke?.stabilization ?? settings.stabilization;
    const point = lastPoint
      ? {
        ...rawPoint,
        x: lastPoint.x + (rawPoint.x - lastPoint.x) * Math.min(
          0.96,
          1 - stabilization * 0.62 + Math.hypot(rawPoint.x - lastPoint.x, rawPoint.y - lastPoint.y) * 12,
        ),
        y: lastPoint.y + (rawPoint.y - lastPoint.y) * Math.min(
          0.96,
          1 - stabilization * 0.62 + Math.hypot(rawPoint.x - lastPoint.x, rawPoint.y - lastPoint.y) * 12,
        ),
      }
      : rawPoint;
    if (lastPoint) {
      const dx = point.x - lastPoint.x;
      const dy = point.y - lastPoint.y;
      if (dx * dx + dy * dy < 0.000004) return;
    }
    const next = strokesRef.current.map((stroke) => (
      stroke.id === activeId ? { ...stroke, points: [...stroke.points, point] } : stroke
    ));
    strokesRef.current = next;
    const liveStroke = next.find((stroke) => stroke.id === activeId);
    if (liveStroke) renderLiveStroke(liveStroke);
  };

  const finishGesture = () => {
    const acceptedTool = gestureAcceptedRef.current ? tool : null;
    if (gestureAcceptedRef.current && tool === 'lasso') {
      if (elementMoveRef.current) {
        onElementsChange?.(displayElements.map((element) => ({ ...element, updatedAt: element.id === elementMoveRef.current?.id ? new Date().toISOString() : element.updatedAt })));
        elementMoveRef.current = null;
        gestureAcceptedRef.current = false;
        return;
      }
      if (selectionModeRef.current === 'select' && lassoBounds) {
        const ids = new Set(
          strokesRef.current
            .filter((stroke) => strokeIntersectsBounds(stroke, lassoBounds))
            .map((stroke) => stroke.id),
        );
        setSelectedStrokeIds(ids);
        setSelectionBounds(boundsForSelected(strokesRef.current, ids));
        setLassoBounds(null);
      } else if (beforeGestureRef.current !== strokesRef.current) {
        onCommit(beforeGestureRef.current);
        onChange(strokesRef.current);
      }
      lassoStartRef.current = null;
      selectionStartBoundsRef.current = null;
      selectionResizeCornerRef.current = null;
      gestureAcceptedRef.current = false;
      return;
    }
    const activeStroke = activeStrokeIdRef.current
      ? strokesRef.current.find((stroke) => stroke.id === activeStrokeIdRef.current)
      : undefined;
    if (
      gestureAcceptedRef.current && gestureWasStylusRef.current && settings.stylusDoubleTap &&
      tool !== 'eraser' && tool !== 'lasso' && activeStroke?.points.length === 1 &&
      Date.now() - gestureStartedAtRef.current < 220
    ) {
      const previousTap = lastStylusTapRef.current;
      if (previousTap && Date.now() - previousTap.at < 420) {
        strokesRef.current = previousTap.before;
        setDisplayStrokes(previousTap.before);
        onCommit(previousTap.before);
        onChange(previousTap.before);
        lastStylusTapRef.current = null;
        activeStrokeIdRef.current = null;
        gestureAcceptedRef.current = false;
        onStylusDoubleTap?.();
        return;
      }
      lastStylusTapRef.current = { at: Date.now(), before: beforeGestureRef.current };
    }
    if (gestureAcceptedRef.current && beforeGestureRef.current !== strokesRef.current) {
      if (tool === 'highlighter' && settings.straightMarker && activeStrokeIdRef.current) {
        strokesRef.current = strokesRef.current.map((stroke) => {
          if (stroke.id !== activeStrokeIdRef.current || stroke.points.length < 2) return stroke;
          return { ...stroke, points: [stroke.points[0], stroke.points[stroke.points.length - 1]] };
        });
        setDisplayStrokes(strokesRef.current);
      }
      if (
        tool !== 'eraser' &&
        tool !== 'highlighter' &&
        settings.shapeAssist &&
        Date.now() - gestureStartedAtRef.current >= 260 &&
        activeStrokeIdRef.current
      ) {
        strokesRef.current = strokesRef.current.map((stroke) => {
          if (stroke.id !== activeStrokeIdRef.current) return stroke;
          const corrected = recognizedShapePoints(stroke.points);
          return corrected ? { ...stroke, points: corrected } : stroke;
        });
      }
      setDisplayStrokes(strokesRef.current);
      onCommit(beforeGestureRef.current);
      onChange(strokesRef.current);
    }
    if (acceptedTool) onToolGestureEnd?.(acceptedTool);
    activeStrokeIdRef.current = null;
    gestureAcceptedRef.current = false;
  };

  const cancelGesture = () => {
    if (gestureAcceptedRef.current) {
      strokesRef.current = beforeGestureRef.current;
      setDisplayStrokes(beforeGestureRef.current);
    }
    activeStrokeIdRef.current = null;
    lassoStartRef.current = null;
    selectionStartBoundsRef.current = null;
    selectionResizeCornerRef.current = null;
    elementMoveRef.current = null;
    setLassoBounds(null);
    gestureAcceptedRef.current = false;
  };

  const pan = useMemo(() => {
    const gesture = Gesture.Pan()
      .enabled(!disabled)
      // Wait for a real one-pointer stroke before creating ink. If a second
      // finger lands first, this gesture fails and the parent paper pans/zooms.
      .minDistance(1)
      .maxPointers(1)
      .manualActivation(true)
      .onTouchesDown((event, stateManager) => {
        if (tool === 'lasso' && selectedStrokeIds.size > 0 && event.allTouches[0]?.y != null && event.allTouches[0].y <= 52) {
          stateManager.fail();
          return;
        }
        // Lasso waits for actual movement. This leaves a stationary touch free
        // to become the outside-tap gesture that releases a selection.
        if (tool === 'lasso') return;
        if (event.pointerType === PointerType.STYLUS || fingerDrawing) {
          stateManager.activate();
          return;
        }
        stateManager.fail();
      })
      .onTouchesMove((event, stateManager) => {
        if (tool === 'lasso' && event.numberOfTouches === 1) stateManager.activate();
      })
      .onStart((event) => {
        runOnJS(startGesture)(event);
      })
      .onUpdate((event) => {
        runOnJS(updateGesture)(event);
      })
      .onEnd(() => {
        runOnJS(finishGesture)();
      })
      .onFinalize(() => {
        runOnJS(cancelGesture)();
      })
      .cancelsTouchesInView(false);
    if (simultaneousGestures?.length) gesture.simultaneousWithExternalGesture(...simultaneousGestures);
    return gesture;
  }, [disabled, fingerDrawing, tool, color, selectedWidth, settings, simultaneousGestures, onChange, onCommit, onElementsChange, onToolGestureEnd, onStylusDoubleTap, selectedStrokeIds, selectionBounds, lassoBounds, displayElements, renderLiveStroke]);

  const tap = useMemo(() => Gesture.Tap()
    .enabled(!disabled && tool === 'lasso')
    .maxDistance(8)
    .maxDuration(300)
    .onEnd((event, success) => {
      if (success) runOnJS(handleCanvasTap)(event.x, event.y);
    }), [disabled, handleCanvasTap, tool]);

  const canvasGesture = useMemo(() => Gesture.Exclusive(pan, tap), [pan, tap]);

  const updateSelection = (kind: 'left' | 'right' | 'up' | 'down' | 'smaller' | 'larger' | 'rotateLeft' | 'rotateRight' | 'recolor' | 'thinner' | 'thicker' | 'duplicate' | 'delete') => {
    if (!selectedStrokeIds.size || !selectionBounds) return;
    const previous = strokesRef.current;
    if (kind === 'delete') {
      const next = previous.filter((stroke) => !selectedStrokeIds.has(stroke.id));
      strokesRef.current = next;
      setDisplayStrokes(next);
      setSelectedStrokeIds(new Set());
      setSelectionBounds(null);
      onCommit(previous);
      onChange(next);
      return;
    }
    if (kind === 'duplicate') {
      const created = previous
        .filter((stroke) => selectedStrokeIds.has(stroke.id))
        .map((stroke) => ({
          ...stroke,
          id: `hs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          points: stroke.points.map((point) => clampStrokePoint({ ...point, x: point.x + 0.025, y: point.y + 0.025 })),
        }));
      const ids = new Set(created.map((stroke) => stroke.id));
      const next = [...previous, ...created];
      strokesRef.current = next;
      setDisplayStrokes(next);
      setSelectedStrokeIds(ids);
      setSelectionBounds(boundsForSelected(next, ids));
      onCommit(previous);
      onChange(next);
      return;
    }
    if (kind === 'recolor' || kind === 'thinner' || kind === 'thicker') {
      const next = previous.map((stroke) => selectedStrokeIds.has(stroke.id) ? {
        ...stroke,
        ...(kind === 'recolor' ? { color } : {}),
        ...(kind === 'thinner' ? { width: Math.max(1, stroke.width - 1) } : {}),
        ...(kind === 'thicker' ? { width: Math.min(14, stroke.width + 1) } : {}),
      } : stroke);
      strokesRef.current = next;
      setDisplayStrokes(next);
      onCommit(previous);
      onChange(next);
      return;
    }
    const dx = kind === 'left' ? -0.012 : kind === 'right' ? 0.012 : 0;
    const dy = kind === 'up' ? -0.012 : kind === 'down' ? 0.012 : 0;
    const scale = kind === 'smaller' ? 0.9 : kind === 'larger' ? 1.1 : 1;
    const centerX = (selectionBounds.left + selectionBounds.right) / 2;
    const centerY = (selectionBounds.top + selectionBounds.bottom) / 2;
    const rotation = kind === 'rotateLeft' ? -Math.PI / 12 : kind === 'rotateRight' ? Math.PI / 12 : 0;
    const next = previous.map((stroke) => selectedStrokeIds.has(stroke.id) ? {
      ...stroke,
      points: stroke.points.map((point) => clampStrokePoint({
        ...point,
        x: centerX + ((point.x - centerX) * Math.cos(rotation) - (point.y - centerY) * Math.sin(rotation)) * scale + dx,
        y: centerY + ((point.x - centerX) * Math.sin(rotation) + (point.y - centerY) * Math.cos(rotation)) * scale + dy,
      })),
    } : stroke);
    strokesRef.current = next;
    setDisplayStrokes(next);
    setSelectionBounds(boundsForSelected(next, selectedStrokeIds));
    onCommit(previous);
    onChange(next);
  };

  const convertSelection = async () => {
    if (!canvasRef.current || !selectionBounds || !selectedStrokeIds.size || !onConvertSelection) return;
    try {
      setCapturingSelection(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const capture = await captureRef(canvasRef, { format: 'png', quality: 0.92, result: 'data-uri' });
      onConvertSelection(
        capture,
        selectionBounds,
        strokesRef.current.filter((stroke) => selectedStrokeIds.has(stroke.id)),
      );
    } catch {
      // The parent shows provider/user-facing errors; capture failures leave ink untouched.
    } finally {
      setCapturingSelection(false);
    }
  };

  return (
    <GestureDetector gesture={canvasGesture}>
      <View
        ref={canvasRef}
        style={styles.fill}
        collapsable={false}
        onLayout={(event) => {
          sizeRef.current = {
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          };
          setCanvasSize(sizeRef.current);
        }}
      >
        <PageTemplate
          template={page.template}
          width={canvasSize.width}
          height={canvasSize.height}
          transparent={transparentBackground}
        />
        <WritingGuideOverlay guide={settings.writingGuide} width={canvasSize.width} height={canvasSize.height} />
        <WebView
          ref={inkWebViewRef}
          source={{ html: INK_DOCUMENT }}
          originWhitelist={['*']}
          style={styles.inkWebView}
          containerStyle={styles.inkWebView}
          pointerEvents="none"
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          javaScriptEnabled
          onLoadEnd={renderInk}
        />
        {displayElements.map((element) => (
          <PageElement
            key={element.id}
            element={element}
            selected={tool === 'lasso' && element.id === selectedElementId}
            editable={!disabled && tool === 'lasso'}
            canvasWidth={canvasSize.width}
            canvasHeight={canvasSize.height}
            onSelect={() => { setSelectedElementId(element.id); setSelectedStrokeIds(new Set()); setSelectionBounds(null); }}
            onMove={(x, y) => updateElement(element.id, { x, y })}
            onResize={(frame) => updateElement(element.id, frame)}
          />
        ))}
        {!capturingSelection && tool === 'lasso' && (lassoBounds || selectionBounds) ? (
          <View
            pointerEvents="none"
            style={[
              styles.selectionBox,
              {
                left: (lassoBounds ?? selectionBounds)!.left * canvasSize.width,
                top: (lassoBounds ?? selectionBounds)!.top * canvasSize.height,
                width: Math.max(8, ((lassoBounds ?? selectionBounds)!.right - (lassoBounds ?? selectionBounds)!.left) * canvasSize.width),
                height: Math.max(8, ((lassoBounds ?? selectionBounds)!.bottom - (lassoBounds ?? selectionBounds)!.top) * canvasSize.height),
              },
            ]}
          />
        ) : null}
        {!capturingSelection && tool === 'lasso' && !lassoBounds && selectionBounds && selectedStrokeIds.size > 0
          ? ([
            ['topLeft', selectionBounds.left, selectionBounds.top],
            ['topRight', selectionBounds.right, selectionBounds.top],
            ['bottomLeft', selectionBounds.left, selectionBounds.bottom],
            ['bottomRight', selectionBounds.right, selectionBounds.bottom],
          ] as Array<[ResizeCorner, number, number]>).map(([corner, x, y]) => (
            <View
              key={`lasso-${corner}`}
              pointerEvents="none"
              style={[
                styles.lassoResizeHandle,
                { left: x * canvasSize.width - 15, top: y * canvasSize.height - 15 },
              ]}
            >
              <View style={styles.resizeDot} />
            </View>
          ))
          : null}
        {!capturingSelection && tool === 'lasso' && selectedStrokeIds.size > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectionActions} contentContainerStyle={styles.selectionActionsContent}>
            {([
              ['←', 'left'], ['↑', 'up'], ['↓', 'down'], ['→', 'right'],
              ['−', 'smaller'], ['＋', 'larger'], ['↶', 'rotateLeft'], ['↷', 'rotateRight'],
              ['●', 'recolor'], ['╱', 'thinner'], ['━', 'thicker'], ['⧉', 'duplicate'], ['×', 'delete'],
            ] as const).map(([label, action]) => (
              <Pressable key={action} onPress={() => updateSelection(action)} style={styles.selectionActionButton}>
                <Text style={[styles.selectionActionText, action === 'delete' && styles.selectionDeleteText]}>{label}</Text>
              </Pressable>
            ))}
            {onConvertSelection ? (
              <Pressable onPress={() => { void convertSelection(); }} style={[styles.selectionActionButton, styles.selectionTextButton]}>
                <Text style={styles.selectionTextLabel}>Text</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        ) : null}
        {!capturingSelection && tool === 'lasso' && selectedElementId ? (
          <View style={[styles.selectionActions, styles.elementActions]}>
            {([['−', 'smaller'], ['＋', 'larger'], ['↶', 'rotateLeft'], ['↷', 'rotateRight'], ['⧉', 'duplicate'], ['×', 'delete']] as const).map(([label, action]) => (
              <Pressable key={action} onPress={() => elementAction(action)} style={styles.selectionActionButton}>
                <Text style={[styles.selectionActionText, action === 'delete' && styles.selectionDeleteText]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  inkWebView: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  selectionBox: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#2563eb',
    backgroundColor: 'rgba(37,99,235,0.05)',
  },
  selectionActions: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 8,
    minHeight: 38,
    borderRadius: 12,
    padding: 4,
    backgroundColor: 'rgba(15,23,42,0.92)',
    maxHeight: 42,
  },
  selectionActionsContent: { alignItems: 'center', paddingHorizontal: 2, gap: 3 },
  selectionActionButton: { width: 32, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  selectionActionText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  selectionDeleteText: { color: '#f87171' },
  selectionTextButton: { width: 46 },
  selectionTextLabel: { color: '#93c5fd', fontSize: 11, fontWeight: '900' },
  elementActions: { flexDirection: 'row', right: undefined, width: 224, paddingHorizontal: 6, gap: 4 },
  elementResizeHandle: {
    position: 'absolute',
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  lassoResizeHandle: {
    position: 'absolute',
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  // Keep most of the touch target inside the element so iOS and Android do
  // not clip the responder while the visible dot still sits on its corner.
  topLeft: { left: -8, top: -8 },
  topRight: { right: -8, top: -8 },
  bottomLeft: { left: -8, bottom: -8 },
  bottomRight: { right: -8, bottom: -8 },
  resizeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2563eb',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  missingImage: { backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  missingImageText: { color: '#64748b', fontSize: 10, fontWeight: '700' },
});
