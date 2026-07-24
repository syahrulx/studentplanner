import { useEffect, useMemo, useRef, useState } from 'react';
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
  simultaneousGesture?: GestureType;
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

function segmentWidth(
  stroke: HandwritingStroke,
  start: HandwritingPoint,
  end: HandwritingPoint,
  segmentIndex = 0,
  segmentCount = 1,
): number {
  if (stroke.tool === 'highlighter') return stroke.width * 2.4;
  if (stroke.tool === 'pencil') return stroke.width * (0.72 + (stroke.pencilSoftness ?? 0.5) * 0.22);
  const pressure = Math.max(0.15, ((start.pressure ?? 0.5) + (end.pressure ?? 0.5)) / 2);
  const sensitivity = stroke.penStyle === 'ball' ? 0 : (stroke.pressureSensitivity ?? 0.5);
  const pressureFactor = 1 + (pressure - 0.5) * sensitivity * (stroke.penStyle === 'brush' ? 1.8 : 1.1);
  const endDistance = Math.min(segmentIndex + 1, segmentCount - segmentIndex);
  const sharpness = stroke.tipSharpness ?? 0.5;
  const taperFactor = stroke.taperedEnds
    ? Math.min(1, 0.65 - sharpness * 0.3 + endDistance * (0.18 + sharpness * 0.08))
    : 1;
  return Math.max(0.7, stroke.width * pressureFactor * taperFactor);
}

function StrokeView({
  stroke,
  canvasWidth,
  canvasHeight,
}: {
  stroke: HandwritingStroke;
  canvasWidth: number;
  canvasHeight: number;
}) {
  if (!stroke.points.length) return null;
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    const size = segmentWidth(stroke, point, point);
    return (
      <View
        style={{
          position: 'absolute',
          left: point.x * canvasWidth - size / 2,
          top: point.y * canvasHeight - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: stroke.color,
          opacity: stroke.opacity,
        }}
      />
    );
  }

  return (
    <>
      {stroke.points.slice(1).map((point, index) => {
        const previous = stroke.points[index];
        const x1 = previous.x * canvasWidth;
        const y1 = previous.y * canvasHeight;
        const x2 = point.x * canvasWidth;
        const y2 = point.y * canvasHeight;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.max(0.5, Math.hypot(dx, dy));
        const thickness = segmentWidth(stroke, previous, point, index, stroke.points.length - 1);
        return (
          <View
            key={`${stroke.id}-${index}`}
            style={{
              position: 'absolute',
              left: (x1 + x2) / 2 - length / 2,
              top: (y1 + y2) / 2 - thickness / 2,
              width: length,
              height: thickness,
              borderRadius: thickness / 2,
              backgroundColor: stroke.color,
              opacity: stroke.opacity,
              transform: [{ rotateZ: `${Math.atan2(dy, dx)}rad` }],
            }}
          />
        );
      })}
    </>
  );
}

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
  simultaneousGesture,
  disabled = false,
  transparentBackground = false,
  onChange,
  onCommit,
}: Props) {
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
    const smoothing = activeStroke?.smoothing ?? settings.smoothing;
    const point = lastPoint
      ? {
        ...rawPoint,
        x: lastPoint.x + (rawPoint.x - lastPoint.x) * (1 - smoothing * 0.68),
        y: lastPoint.y + (rawPoint.y - lastPoint.y) * (1 - smoothing * 0.68),
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
    if (simultaneousGesture) gesture.simultaneousWithExternalGesture(simultaneousGesture);
    return gesture;
  }, [disabled, fingerDrawing, tool, color, selectedWidth, settings, simultaneousGesture, onChange, onCommit]);

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
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {displayStrokes.map((stroke) => (
            <StrokeView
              key={stroke.id}
              stroke={stroke}
              canvasWidth={canvasSize.width}
              canvasHeight={canvasSize.height}
            />
          ))}
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
