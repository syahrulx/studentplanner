import React, { useMemo, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

// ─── Layouts ───────────────────────────────────────────────────────────────

/** A cell as fractions of the canvas: x, y, width, height. */
export type Cell = [number, number, number, number];

export type SnapLayoutId = '1' | '2v' | '2h' | '3v' | '4' | '1+2';

export const SNAP_LAYOUTS: { id: SnapLayoutId; label: string; cells: Cell[] }[] = [
  { id: '1', label: 'One photo', cells: [[0, 0, 1, 1]] },
  { id: '2v', label: 'Two, stacked', cells: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] },
  { id: '2h', label: 'Two, side by side', cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] },
  { id: '3v', label: 'Three, stacked', cells: [[0, 0, 1, 1 / 3], [0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 1 / 3]] },
  { id: '4', label: 'Two by two', cells: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
  { id: '1+2', label: 'One big, two small', cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
];

export function layoutCells(id: SnapLayoutId): Cell[] {
  return SNAP_LAYOUTS.find((l) => l.id === id)!.cells;
}

/** Thin line between photos, in points. */
export const CELL_GAP = 3;

/** Frame of a cell in points, leaving half a gap on each inner edge. */
export function cellFrame(cell: Cell, w: number, h: number) {
  const [fx, fy, fw, fh] = cell;
  const half = CELL_GAP / 2;
  const left = fx * w + (fx > 0 ? half : 0);
  const top = fy * h + (fy > 0 ? half : 0);
  const right = (fx + fw) * w - (fx + fw < 0.999 ? half : 0);
  const bottom = (fy + fh) * h - (fy + fh < 0.999 ? half : 0);
  return { left, top, width: right - left, height: bottom - top };
}

/** A small drawing of a layout for the picker tray. */
export function LayoutThumb({ id, active, onPress }: { id: SnapLayoutId; active: boolean; onPress: () => void }) {
  const w = 34;
  const h = 48;
  const layout = SNAP_LAYOUTS.find((l) => l.id === id)!;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={layout.label}
      accessibilityState={{ selected: active }}
      style={[st.thumb, { width: w + 8, height: h + 8 }, active && st.thumbActive]}
    >
      <View style={{ width: w, height: h }}>
        {layout.cells.map((c, i) => {
          const f = cellFrame(c, w, h);
          return <View key={i} style={[st.thumbCell, f]} />;
        })}
      </View>
    </Pressable>
  );
}

// ─── Drawing ───────────────────────────────────────────────────────────────

export type Point = { x: number; y: number };
export type Stroke = { color: string; size: number; points: Point[] };

/**
 * A stroke drawn with plain Views: a dot at every point and a rotated bar
 * between neighbours. No SVG library, so it needs no new native module, and
 * react-native-view-shot captures it like any other view.
 */
export const StrokeView = React.memo(function StrokeView({ stroke }: { stroke: Stroke }) {
  const { color, size, points } = stroke;
  const r = size / 2;
  return (
    <>
      {points.map((p, i) => {
        const prev = points[i - 1];
        const dot = (
          <View
            key={`d${i}`}
            style={{ position: 'absolute', left: p.x - r, top: p.y - r, width: size, height: size, borderRadius: r, backgroundColor: color }}
          />
        );
        if (!prev) return dot;
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        const len = Math.hypot(dx, dy);
        return (
          <React.Fragment key={`s${i}`}>
            <View
              style={{
                position: 'absolute',
                left: (p.x + prev.x) / 2 - len / 2,
                top: (p.y + prev.y) / 2 - r,
                width: len,
                height: size,
                backgroundColor: color,
                transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
              }}
            />
            {dot}
          </React.Fragment>
        );
      })}
    </>
  );
});

/** Full-canvas touch surface that turns finger moves into a stroke. */
export function DrawSurface({ color, size, onStroke }: { color: string; size: number; onStroke: (s: Stroke) => void }) {
  const [live, setLive] = React.useState<Stroke | null>(null);
  const liveRef = useRef<Stroke | null>(null);
  const opts = useRef({ color, size });
  opts.current = { color, size };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          liveRef.current = { ...opts.current, points: [{ x, y }] };
          setLive(liveRef.current);
        },
        onPanResponderMove: (e) => {
          const cur = liveRef.current;
          if (!cur) return;
          const { locationX: x, locationY: y } = e.nativeEvent;
          const last = cur.points[cur.points.length - 1];
          // Skip tiny moves: fewer views, and the line is just as smooth.
          if (Math.hypot(x - last.x, y - last.y) < 3) return;
          liveRef.current = { ...cur, points: [...cur.points, { x, y }] };
          setLive(liveRef.current);
        },
        onPanResponderRelease: () => {
          if (liveRef.current) onStroke(liveRef.current);
          liveRef.current = null;
          setLive(null);
        },
        onPanResponderTerminate: () => {
          if (liveRef.current) onStroke(liveRef.current);
          liveRef.current = null;
          setLive(null);
        },
      }),
    [onStroke],
  );
  return (
    <View style={StyleSheet.absoluteFill} {...responder.panHandlers}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {live ? <StrokeView stroke={live} /> : null}
      </View>
    </View>
  );
}

// ─── Text stickers ─────────────────────────────────────────────────────────

export type TextItem = { id: string; text: string; color: string; boxed: boolean; x: number; y: number };

/** Text on the photo. Drag to move, tap to edit, drop on the bin to delete. */
export function TextSticker({
  item,
  enabled,
  onMove,
  onTap,
  onDragChange,
}: {
  item: TextItem;
  enabled: boolean;
  onMove: (id: string, x: number, y: number, dropped: boolean) => void;
  onTap: (id: string) => void;
  onDragChange: (dragging: boolean, y: number) => void;
}) {
  const start = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  // Everything the gesture reads lives in a ref, and the responder is made
  // once. Re-creating it on each render (the parent re-renders the moment a
  // drag starts, to show the bin) swapped the handlers mid-gesture and the
  // text never moved.
  const live = useRef({ item, enabled, onMove, onTap, onDragChange });
  live.current = { item, enabled, onMove, onTap, onDragChange };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => live.current.enabled,
      onMoveShouldSetPanResponder: () => live.current.enabled,
      onPanResponderGrant: () => {
        start.current = { x: live.current.item.x, y: live.current.item.y };
        moved.current = false;
      },
      onPanResponderMove: (_e, g) => {
        if (!moved.current && Math.abs(g.dx) + Math.abs(g.dy) > 4) moved.current = true;
        if (moved.current) {
          live.current.onMove(live.current.item.id, start.current.x + g.dx, start.current.y + g.dy, false);
          live.current.onDragChange(true, start.current.y + g.dy);
        }
      },
      onPanResponderRelease: (_e, g) => {
        if (moved.current) {
          live.current.onMove(live.current.item.id, start.current.x + g.dx, start.current.y + g.dy, true);
          live.current.onDragChange(false, 0);
        } else {
          live.current.onTap(live.current.item.id);
        }
      },
      onPanResponderTerminate: () => live.current.onDragChange(false, 0),
    }),
  ).current;
  const dark = item.color === '#000000';
  return (
    <View
      {...responder.panHandlers}
      style={[
        st.sticker,
        { left: item.x, top: item.y },
        item.boxed && { backgroundColor: dark ? '#ffffff' : 'rgba(0,0,0,0.6)' },
      ]}
    >
      <Text style={[st.stickerText, { color: item.color }, !item.boxed && st.stickerShadow]}>{item.text}</Text>
    </View>
  );
}

export const INK_COLORS = ['#ffffff', '#000000', '#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#bf5af2'];

export function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <View style={st.colorRow}>
      {INK_COLORS.map((c) => (
        <Pressable
          key={c}
          onPress={() => onChange(c)}
          accessibilityRole="button"
          accessibilityLabel={`Colour ${c}`}
          accessibilityState={{ selected: value === c }}
          hitSlop={4}
          style={[st.swatch, { backgroundColor: c }, value === c && st.swatchActive]}
        />
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  thumb: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbActive: { borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.18)' },
  thumbCell: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.45)', borderRadius: 2 },
  sticker: { position: 'absolute', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, maxWidth: 320 },
  stickerText: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  stickerShadow: { textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  colorRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  swatchActive: { borderColor: '#fff', transform: [{ scale: 1.25 }] },
});
