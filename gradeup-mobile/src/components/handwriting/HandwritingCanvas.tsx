import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import type {
  HandwritingPage,
  HandwritingPoint,
  HandwritingStroke,
  HandwritingTool,
  HandwritingToolSettings,
} from '@/src/lib/handwritingTypes';

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
  onCommit: (previousStrokes: HandwritingStroke[]) => void;
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

  if (stroke.tool === 'highlighter') {
    const markerWidth = Math.max(5, stroke.width * 2.8);
    return points.length === 1
      ? `<circle cx="${number(first.x)}" cy="${number(first.y)}" r="${number(markerWidth / 2)}" fill="${strokeColor}" opacity="${stroke.opacity}"/>`
      : `<path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${number(markerWidth)}" stroke-opacity="${stroke.opacity}" stroke-linecap="square" stroke-linejoin="round"/>`;
  }

  if (stroke.tool === 'pencil') {
    const softness = stroke.pencilSoftness ?? 0.5;
    const pencilWidth = Math.max(0.8, stroke.width * (0.58 + softness * 0.28));
    const opacity = Math.max(0.2, stroke.opacity);
    if (points.length === 1) {
      return `<circle cx="${number(first.x)}" cy="${number(first.y)}" r="${number(pencilWidth / 2)}" fill="${strokeColor}" opacity="${number(opacity * 0.78)}"/>`;
    }
    return [
      '<g>',
      `<path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${number(pencilWidth)}" stroke-opacity="${number(opacity * 0.78)}" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${number(Math.max(0.45, pencilWidth * 0.45))}" stroke-opacity="${number(Math.min(0.34, opacity * (0.18 + softness * 0.12)))}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${number(0.9 + softness)} ${number(1.8 + (1 - softness) * 1.8)}" transform="translate(0.35 0.25)"/>`,
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
    '<g>',
    style === 'brush'
      ? `<path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${number(penWidth * 1.32)}" stroke-opacity="0.16" stroke-linecap="round" stroke-linejoin="round"/>`
      : '',
    `<path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${number(penWidth)}" stroke-opacity="${stroke.opacity}" stroke-linecap="${lineCap}" stroke-linejoin="${style === 'fountain' && (stroke.tipSharpness ?? 0.5) > 0.65 ? 'bevel' : 'round'}"/>`,
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
}: Props) {
  const inkWebViewRef = useRef<WebView>(null);
  const sizeRef = useRef({ width: 1, height: 1 });
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [displayStrokes, setDisplayStrokes] = useState(page.strokes);
  const strokesRef = useRef(page.strokes);
  const activeStrokeIdRef = useRef<string | null>(null);
  const gestureAcceptedRef = useRef(false);
  const beforeGestureRef = useRef<HandwritingStroke[]>([]);

  useEffect(() => {
    strokesRef.current = page.strokes;
    setDisplayStrokes(page.strokes);
  }, [page.strokes]);

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

  useEffect(() => {
    renderInk();
  }, [renderInk]);

  const acceptsPointer = (event: PanEvent): boolean => (
    !disabled &&
    (event.pointerType === PointerType.STYLUS || fingerDrawing)
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
    const point = pointFromEvent(event, sizeRef.current.width, sizeRef.current.height);
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
      points: [point],
    };
    activeStrokeIdRef.current = stroke.id;
    const next = [...strokesRef.current, stroke];
    strokesRef.current = next;
    setDisplayStrokes(next);
  };

  const updateGesture = (event: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
    if (!gestureAcceptedRef.current) return;
    const rawPoint = pointFromEvent(event, sizeRef.current.width, sizeRef.current.height);
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
    setDisplayStrokes(next);
  };

  const finishGesture = () => {
    if (gestureAcceptedRef.current && beforeGestureRef.current !== strokesRef.current) {
      if (tool === 'highlighter' && settings.straightMarker && activeStrokeIdRef.current) {
        strokesRef.current = strokesRef.current.map((stroke) => {
          if (stroke.id !== activeStrokeIdRef.current || stroke.points.length < 2) return stroke;
          return { ...stroke, points: [stroke.points[0], stroke.points[stroke.points.length - 1]] };
        });
        setDisplayStrokes(strokesRef.current);
      }
      onCommit(beforeGestureRef.current);
      onChange(strokesRef.current);
    }
    activeStrokeIdRef.current = null;
    gestureAcceptedRef.current = false;
  };

  const cancelGesture = () => {
    if (gestureAcceptedRef.current) {
      strokesRef.current = beforeGestureRef.current;
      setDisplayStrokes(beforeGestureRef.current);
    }
    activeStrokeIdRef.current = null;
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
        if (event.pointerType === PointerType.STYLUS || fingerDrawing) {
          stateManager.activate();
          return;
        }
        stateManager.fail();
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
  }, [disabled, fingerDrawing, tool, color, selectedWidth, settings, simultaneousGestures, onChange, onCommit]);

  return (
    <GestureDetector gesture={pan}>
      <View
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
});
