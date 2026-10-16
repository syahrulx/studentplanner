import React from 'react';
import { Image, Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';

/**
 * Monthly "photo dump" layouts for Snap Memories.
 *
 * Every template draws on a fixed 360 x 640 canvas (9:16, a story). The canvas
 * is captured at the screen's pixel ratio, so a 3x phone saves 1080 x 1920.
 * Plain Views and Images only: react-native-view-shot captures them as they
 * are, with no new native module.
 */

export const DUMP_W = 360;
export const DUMP_H = 640;

export type DumpPhoto = { id: string; uri: string; caption: string; createdAt: string };

export type DumpProps = {
  photos: DumpPhoto[];
  title: string;
  subtitle: string;
  showCaptions: boolean;
  /** Called once per photo when it has loaded or failed, so the screen knows when to allow saving. */
  onImageDone: () => void;
};

export type DumpTemplate = {
  id: string;
  name: string;
  /** How many photos it shows; 'all' = one per day of the month. */
  count: number | 'all';
  Render: (p: DumpProps) => React.ReactElement;
};

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

function Photo({ p, style, onDone }: { p?: DumpPhoto; style: ViewStyle; onDone: () => void }) {
  if (!p) return <View style={[style, { backgroundColor: 'rgba(127,127,127,0.25)' }]} />;
  return (
    <View style={[style, { overflow: 'hidden', backgroundColor: '#ddd' }]}>
      <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onLoadEnd={onDone} />
    </View>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`;
}


const Footer = ({ color }: { color: string }) => (
  <Text style={{ position: 'absolute', bottom: 10, right: 14, fontSize: 8, color, fontWeight: '600' }}>made with Rencana</Text>
);

// ─── Aesthetic: shared bits ────────────────────────────────────────────────
const SCRIPT = Platform.select({ ios: 'Snell Roundhand', android: 'cursive', default: 'cursive' });
const DISPLAY = Platform.select({ ios: 'Didot', android: 'serif', default: 'serif' });
const glow = { textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 };
const SEAM = 2;

/** "my sweet / October / memories": the stacked title the aesthetic layouts share. */
function StackTitle({ title, size = 54, top = 'my sweet', bottom = 'memories' }: { title: string; size?: number; top?: string; bottom?: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[{ color: '#fff', fontFamily: DISPLAY, fontSize: size * 0.34, fontWeight: '700', marginBottom: -size * 0.12 }, glow]}>{top}</Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[{ color: '#fff', fontFamily: DISPLAY, fontSize: size, fontWeight: '900', letterSpacing: -1, transform: [{ rotate: '-4deg' }] }, glow]}
      >
        {title}
      </Text>
      <Text style={[{ color: '#fff', fontFamily: SCRIPT, fontSize: size * 0.48, marginTop: -size * 0.22, marginLeft: size * 0.6 }, glow]}>{bottom}</Text>
    </View>
  );
}

// ─── Sweet: 3 x 3, full bleed, title on the centre photo ──────────────────
function Sweet({ photos, title, onImageDone }: DumpProps) {
  const w = (DUMP_W - SEAM * 2) / 3;
  const h = (DUMP_H - SEAM * 2) / 3;
  return (
    <View style={[st.canvas, { backgroundColor: '#000', flexDirection: 'row', flexWrap: 'wrap', gap: SEAM }]}>
      {Array.from({ length: 9 }, (_, i) => (
        <Photo key={i} p={photos[i]} style={{ width: w, height: h }} onDone={onImageDone} />
      ))}
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
        <StackTitle title={title} size={60} />
      </View>
    </View>
  );
}

// ─── Columns: four tall strips, title across the middle ───────────────────
function Columns({ photos, title, subtitle, onImageDone }: DumpProps) {
  const w = (DUMP_W - SEAM * 3) / 4;
  return (
    <View style={[st.canvas, { backgroundColor: '#000' }]}>
      <View style={{ flexDirection: 'row', gap: SEAM, flex: 1 }}>
        {[0, 1, 2, 3].map((c) => (
          <View key={c} style={{ width: w, gap: SEAM, marginTop: c % 2 ? -40 : 0 }}>
            <Photo p={photos[c * 2]} style={{ width: w, height: 340 }} onDone={onImageDone} />
            <Photo p={photos[c * 2 + 1]} style={{ width: w, height: 340 }} onDone={onImageDone} />
          </View>
        ))}
      </View>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
        <View style={{ backgroundColor: 'rgba(0,0,0,0.28)', paddingVertical: 14, paddingHorizontal: 28, alignItems: 'center' }}>
          <Text style={[{ color: '#fff', fontFamily: SCRIPT, fontSize: 26 }, glow]}>a little bit of</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[{ color: '#fff', fontFamily: DISPLAY, fontSize: 56, fontWeight: '900', letterSpacing: 2 }, glow]}>
            {title.toUpperCase()}
          </Text>
          <Text style={[{ color: '#fff', fontSize: 10, letterSpacing: 3, fontWeight: '700', marginTop: 2 }, glow]}>{subtitle.toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Mosaic: big photo top-left, the rest around it, title bottom ─────────
function Mosaic({ photos, title, onImageDone }: DumpProps) {
  const col = (DUMP_W - SEAM) / 2;
  return (
    <View style={[st.canvas, { backgroundColor: '#000', gap: SEAM }]}>
      <View style={{ flexDirection: 'row', gap: SEAM, height: 300 }}>
        <Photo p={photos[0]} style={{ width: col, height: 300 }} onDone={onImageDone} />
        <View style={{ width: col, gap: SEAM }}>
          <Photo p={photos[1]} style={{ flex: 1 }} onDone={onImageDone} />
          <Photo p={photos[2]} style={{ flex: 1 }} onDone={onImageDone} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: SEAM, flex: 1 }}>
        <View style={{ width: col, gap: SEAM }}>
          <Photo p={photos[3]} style={{ flex: 1 }} onDone={onImageDone} />
          <Photo p={photos[4]} style={{ flex: 1.4 }} onDone={onImageDone} />
        </View>
        <Photo p={photos[5]} style={{ width: col }} onDone={onImageDone} />
      </View>
      <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]} pointerEvents="none">
        <StackTitle title={title} size={56} top="hello" bottom="dump" />
      </View>
    </View>
  );
}

// ─── Text tile: 2 x 4 grid with one tile of words ─────────────────────────
function TextTile({ photos, title, subtitle, onImageDone }: DumpProps) {
  const w = (DUMP_W - SEAM) / 2;
  const h = (DUMP_H - SEAM * 3) / 4;
  const cells = Array.from({ length: 8 }, (_, i) => i);
  let photoIndex = 0;
  return (
    <View style={[st.canvas, { backgroundColor: '#000', flexDirection: 'row', flexWrap: 'wrap', gap: SEAM }]}>
      {cells.map((i) =>
        i === 3 ? (
          <View key={i} style={{ width: w, height: h, backgroundColor: '#f4efe6', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
            <Text style={{ fontFamily: SCRIPT, fontSize: 24, color: '#7c5c3b' }}>photo dump</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: DISPLAY, fontSize: 38, fontWeight: '900', color: '#2b1d12', letterSpacing: -0.5 }}>
              {title}
            </Text>
            <Text style={{ fontSize: 9, letterSpacing: 2, color: '#7c5c3b', fontWeight: '700', marginTop: 4 }}>{subtitle.toUpperCase()}</Text>
          </View>
        ) : (
          <Photo key={i} p={photos[photoIndex++]} style={{ width: w, height: h }} onDone={onImageDone} />
        ),
      )}
    </View>
  );
}

// ─── Calendar ───────────────────────────────────────────────────────────
function Calendar({ photos, title, subtitle, onImageDone }: DumpProps) {
  const first = photos[0] ? new Date(photos[0].createdAt) : new Date();
  const y = first.getFullYear();
  const m = first.getMonth();
  const startDow = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const byDay = new Map<number, DumpPhoto>();
  for (const p of photos) {
    const d = new Date(p.createdAt).getDate();
    if (!byDay.has(d)) byDay.set(d, p);
  }
  const cell = (DUMP_W - 32 - 18) / 7;
  return (
    <View style={[st.canvas, { backgroundColor: '#fff7ed', paddingHorizontal: 16, paddingTop: 40 }]}>
      <Text style={{ fontSize: 40, fontWeight: '900', color: '#c2410c', letterSpacing: -1 }}>{title}</Text>
      <Text style={{ fontSize: 11, color: '#9a3412', marginBottom: 18 }}>{subtitle}</Text>
      <View style={{ flexDirection: 'row', gap: 3, marginBottom: 6 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={i} style={{ width: cell, textAlign: 'center', fontSize: 10, fontWeight: '800', color: '#c2410c' }}>{d}</Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
        {Array.from({ length: startDow }, (_, i) => <View key={`b${i}`} style={{ width: cell, height: cell * 1.3 }} />)}
        {Array.from({ length: days }, (_, i) => {
          const p = byDay.get(i + 1);
          return (
            <View key={i} style={{ width: cell, height: cell * 1.3, borderRadius: 6, backgroundColor: '#ffedd5', overflow: 'hidden' }}>
              {p ? <Photo p={p} style={StyleSheet.absoluteFillObject} onDone={onImageDone} /> : null}
              <Text style={{ position: 'absolute', top: 2, left: 4, fontSize: 8, fontWeight: '800', color: p ? '#fff' : '#fdba74' }}>{i + 1}</Text>
            </View>
          );
        })}
      </View>
      <Footer color="#fb923c" />
    </View>
  );
}

// ─── Bento ──────────────────────────────────────────────────────────────
function Bento({ photos, title, subtitle, onImageDone }: DumpProps) {
  const g = 5;
  return (
    <View style={[st.canvas, { backgroundColor: '#09090b', padding: 12 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 22, marginBottom: 12 }}>
        <Text style={{ color: '#fafafa', fontSize: 32, fontWeight: '900', letterSpacing: -1 }}>{title}</Text>
        <Text style={{ color: '#a1a1aa', fontSize: 10, marginBottom: 6 }}>{subtitle}</Text>
      </View>
      <View style={{ flex: 1, gap: g }}>
        <View style={{ flex: 3, flexDirection: 'row', gap: g }}>
          <Photo p={photos[0]} style={{ flex: 2, borderRadius: 14 }} onDone={onImageDone} />
          <View style={{ flex: 1, gap: g }}>
            <Photo p={photos[1]} style={{ flex: 1, borderRadius: 14 }} onDone={onImageDone} />
            <Photo p={photos[2]} style={{ flex: 1, borderRadius: 14 }} onDone={onImageDone} />
          </View>
        </View>
        <View style={{ flex: 2, flexDirection: 'row', gap: g }}>
          <Photo p={photos[3]} style={{ flex: 1, borderRadius: 14 }} onDone={onImageDone} />
          <Photo p={photos[4]} style={{ flex: 1, borderRadius: 14 }} onDone={onImageDone} />
          <Photo p={photos[5]} style={{ flex: 1, borderRadius: 14 }} onDone={onImageDone} />
        </View>
      </View>
      <View style={{ height: 22 }} />
      <Footer color="#52525b" />
    </View>
  );
}

// ─── Diary ─────────────────────────────────────────────────────────────
function Diary({ photos, title, subtitle, onImageDone }: DumpProps) {
  return (
    <View style={[st.canvas, { backgroundColor: '#fefce8', paddingTop: 34, paddingHorizontal: 22 }]}>
      <View style={{ position: 'absolute', left: 40, top: 0, bottom: 0, width: 1.5, backgroundColor: '#fca5a5' }} />
      <Text style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 34, color: '#1e3a8a', marginLeft: 26 }}>{title}</Text>
      <Text style={{ fontSize: 10, color: '#3b82f6', marginLeft: 28, marginBottom: 14 }}>{subtitle}</Text>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 86, borderBottomWidth: 1, borderBottomColor: '#bfdbfe', marginLeft: 26 }}>
          <Photo p={photos[i]} style={{ width: 70, height: 70, borderRadius: 4 }} onDone={onImageDone} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#1e40af' }}>{photos[i] ? shortDate(photos[i].createdAt) : ''}</Text>
            <Text numberOfLines={3} style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12, color: '#1e293b', marginTop: 2 }}>
              {photos[i]?.caption || ''}
            </Text>
          </View>
        </View>
      ))}
      <Footer color="#93c5fd" />
    </View>
  );
}

export const DUMP_TEMPLATES: DumpTemplate[] = [
  { id: 'sweet', name: 'Sweet month', count: 9, Render: Sweet },
  { id: 'columns', name: 'Columns', count: 8, Render: Columns },
  { id: 'mosaic', name: 'Mosaic', count: 6, Render: Mosaic },
  { id: 'texttile', name: 'Photo dump', count: 7, Render: TextTile },
  { id: 'calendar', name: 'Calendar', count: 'all', Render: Calendar },
  { id: 'bento', name: 'Bento', count: 6, Render: Bento },
  { id: 'diary', name: 'Diary', count: 6, Render: Diary },
]

const st = StyleSheet.create({
  canvas: { width: DUMP_W, height: DUMP_H, overflow: 'hidden' },
});
