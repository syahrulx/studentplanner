import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import type ViewShot from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExportCanvas, saveExportCanvas } from '@/components/ViewShotCompat';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { getTimetableEntryColor } from '@/src/lib/timetableSlotColors';
import type { DayOfWeek, TimetableEntry } from '@/src/types';

/**
 * Lock screen wallpaper generator.
 *
 * iOS gives an app three lock-screen widget shapes, all small and all stripped
 * of colour, so the week-at-a-glance panel students keep asking for cannot be a
 * widget there. It can be a *wallpaper*: the same panel painted into a picture
 * over the student's own photo. That is how LockDay and the other lock-screen
 * planners do it, and it is the only route Apple allows.
 *
 * The split of what goes where follows what changes how often. The week's
 * classes barely move once a semester, so they belong in a picture. Tasks
 * change hourly, so the real lock-screen widget carries those — this picture
 * shows them too, but as a snapshot, true as of the moment it was made.
 */

/** Portrait canvas in points. Captured at device pixel ratio, so ~1179x2556 on a 3x phone. */
const CANVAS_W = 393;
const CANVAS_H = 852;

/** The flashlight and camera buttons own the bottom. */
const BOTTOM_ZONE = 150;

/**
 * How tall the panel is allowed to be.
 *
 * Lock screens differ: a student with a big clock, a widget row, or a photo
 * they do not want covered needs the panel smaller, and one with a plain
 * wallpaper can take the lot. Three presets beat a slider here — every step
 * still lands on a layout that has been checked to read well.
 */
type PanelSize = 'compact' | 'normal' | 'tall';

const SIZES: Record<PanelSize, {
  chipsPerDay: number;
  dateSize: number;
  chipSize: number;
  rowTitle: number;
  pad: number;
}> = {
  // chipSize stays put across all three: a column is one seventh of the screen
  // whatever the preset, so growing the type only truncates "CSP650" to "CSP6…".
  compact: { chipsPerDay: 1, dateSize: 12, chipSize: 8, rowTitle: 13, pad: 10 },
  normal:  { chipsPerDay: 3, dateSize: 13, chipSize: 8, rowTitle: 14, pad: 12 },
  tall:    { chipsPerDay: 5, dateSize: 14, chipSize: 8, rowTitle: 15, pad: 14 },
};

/** Where the panel sits, as a distance from the top of the screen. */
const TOP_MIN = 150;
const TOP_MAX = 520;
const TOP_STEP = 20;

const DAY_ORDER: DayOfWeek[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];
const DAY_INITIAL: Record<DayOfWeek, string> = {
  Monday: 'M', Tuesday: 'T', Wednesday: 'W', Thursday: 'T',
  Friday: 'F', Saturday: 'S', Sunday: 'S',
};

/** Monday-based date list for the week containing `today`. */
function weekDates(today: Date): Date[] {
  const start = new Date(today);
  const dow = start.getDay(); // 0 = Sunday
  start.setDate(start.getDate() - ((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sortByStart(a: TimetableEntry, b: TimetableEntry): number {
  return (a.startTime || '').localeCompare(b.startTime || '');
}

// ─── The picture itself ──────────────────────────────────────────────────────

type CanvasProps = {
  photoUri: string | null;
  size: PanelSize;
  top: number;
  timetable: TimetableEntry[];
  subjectColors: Record<string, string>;
};

function WallpaperCanvas({ photoUri, size, top, timetable, subjectColors }: CanvasProps) {
  const cfg = SIZES[size];
  const today = new Date();
  const days = weekDates(today);

  const byDay = useMemo(() => {
    const map = new Map<DayOfWeek, TimetableEntry[]>();
    for (const d of DAY_ORDER) map.set(d, []);
    for (const e of timetable) {
      const list = map.get(e.day);
      if (list) list.push(e);
    }
    for (const list of map.values()) list.sort(sortByStart);
    return map;
  }, [timetable]);

  return (
    <View style={st.canvas}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1b2a3a' }]} />
      )}
      {/* Keeps white type readable over a bright photo without hiding it. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.22)' }]} />

      <View style={{ height: top }} />

      <View style={[st.panel, { paddingHorizontal: cfg.pad, paddingTop: cfg.pad, paddingBottom: cfg.pad + 2 }]}>
        <View style={st.strip}>
          {days.map((d) => {
            const name = DAY_ORDER[(d.getDay() + 6) % 7];
            const iso = isoOf(d);
            const classes = (byDay.get(name) ?? []).slice(0, cfg.chipsPerDay);
            return (
              // No "today" highlight here, unlike the widget. This is a still
              // picture: the mark would be pointing at the wrong day by
              // tomorrow morning, and a confidently wrong mark is worse than
              // none at all.
              <View key={iso} style={st.stripCol}>
                <Text style={st.stripDay}>{DAY_INITIAL[name]}</Text>
                <Text style={[st.stripDate, { fontSize: cfg.dateSize }]}>
                  {d.getDate()}
                </Text>
                {classes.map((c) => (
                  <View
                    key={c.id}
                    style={[st.chip, { backgroundColor: getTimetableEntryColor(c, subjectColors) }]}
                  >
                    <Text style={[st.chipText, { fontSize: cfg.chipSize }]} numberOfLines={1}>
                      {c.subjectCode}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>

      </View>

      <View style={{ height: BOTTOM_ZONE }} />
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function LockWallpaperScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { timetable, subjectColors } = useApp();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [size, setSize] = useState<PanelSize>('normal');
  const [top, setTop] = useState(292);
  const [saving, setSaving] = useState(false);
  const shotRef = useRef<ViewShot>(null);

  const canvasProps: CanvasProps = {
    photoUri,
    size,
    top,
    timetable: timetable ?? [],
    subjectColors: subjectColors ?? {},
  };

  const nudge = (delta: number) =>
    setTop((v) => Math.min(TOP_MAX, Math.max(TOP_MIN, v + delta)));

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (!res.canceled && res.assets?.[0]?.uri) setPhotoUri(res.assets[0].uri);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const r = await saveExportCanvas(shotRef.current, { format: 'png', quality: 1 });
    setSaving(false);
    if (r === 'saved') {
      Alert.alert(
        'Saved to Photos',
        'Open Settings → Wallpaper → Add New Wallpaper → Photos and pick it.',
      );
    } else if (r === 'denied') {
      Alert.alert('Photos access needed', 'Allow Rencana to save photos, then try again.');
    } else {
      Alert.alert('Could not save', 'Something went wrong making the picture. Try again.');
    }
  };

  // Preview is the same canvas, scaled to fit the screen.
  const previewScale = 0.62;

  return (
    <View style={[s.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.headerBtn}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[s.headerTitle, { color: theme.text }]}>Lock screen</Text>
        <View style={s.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={s.body}>
        <View style={s.segment}>
          {(['compact', 'normal', 'tall'] as PanelSize[]).map((m) => {
            const on = size === m;
            return (
              <Pressable
                key={m}
                onPress={() => setSize(m)}
                style={[
                  s.segmentBtn,
                  { borderColor: theme.border },
                  on && { backgroundColor: theme.primary, borderColor: theme.primary },
                ]}
              >
                <Text style={[s.segmentText, { color: on ? '#fff' : theme.textSecondary }]}>
                  {m === 'compact' ? 'Short' : m === 'normal' ? 'Medium' : 'Tall'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View
          style={[
            s.previewWrap,
            { width: CANVAS_W * previewScale, height: CANVAS_H * previewScale },
          ]}
        >
          <View style={{ transform: [{ scale: previewScale }], transformOrigin: 'top left' }}>
            <WallpaperCanvas {...canvasProps} />
          </View>
        </View>

        <View style={s.nudgeRow}>
          <Pressable
            style={[s.nudgeBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
            onPress={() => nudge(-TOP_STEP)}
            disabled={top <= TOP_MIN}
          >
            <Feather name="chevron-up" size={18} color={top <= TOP_MIN ? theme.textSecondary : theme.text} />
          </Pressable>
          <Text style={[s.nudgeLabel, { color: theme.textSecondary }]}>Move panel</Text>
          <Pressable
            style={[s.nudgeBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
            onPress={() => nudge(TOP_STEP)}
            disabled={top >= TOP_MAX}
          >
            <Feather name="chevron-down" size={18} color={top >= TOP_MAX ? theme.textSecondary : theme.text} />
          </Pressable>
        </View>

        <Pressable
          style={[s.action, { borderColor: theme.border, backgroundColor: theme.card }]}
          onPress={() => void pickPhoto()}
        >
          <Feather name="image" size={17} color={theme.text} />
          <Text style={[s.actionText, { color: theme.text }]}>
            {photoUri ? 'Change photo' : 'Choose your photo'}
          </Text>
        </Pressable>

        <Pressable
          style={[s.action, s.primaryAction, { backgroundColor: theme.primary }]}
          onPress={() => void save()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="download" size={17} color="#fff" />
          )}
          <Text style={[s.actionText, { color: '#fff' }]}>Save to Photos</Text>
        </Pressable>

        <Text style={[s.note, { color: theme.textSecondary }]}>
          Your week, as it stands now. Make it again when your timetable changes. For tasks,
          add the Rencana widget to your lock screen — that one updates itself.
        </Text>
      </ScrollView>

      {/* Full-size copy, off screen — this is what actually gets captured. */}
      <View style={s.offscreen} pointerEvents="none">
        <ExportCanvas ref={shotRef} format="png" quality={1} style={st.canvas}>
          <WallpaperCanvas {...canvasProps} />
        </ExportCanvas>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  canvas: { width: CANVAS_W, height: CANVAS_H, overflow: 'hidden' },

  panel: {
    marginHorizontal: 14,
    borderRadius: 24,
    backgroundColor: 'rgba(22,24,28,0.58)',
  },

  strip: { flexDirection: 'row', gap: 4 },
  stripCol: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 10, gap: 3 },
  stripDay: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600' },
  stripDate: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', marginBottom: 2 },

  chip: { alignSelf: 'stretch', marginHorizontal: 2, borderRadius: 4, paddingVertical: 2, paddingHorizontal: 3 },
  chipText: { color: '#fff', fontWeight: '700' },

  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginVertical: 11 },

  listTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  row: { flexDirection: 'row', gap: 9, marginBottom: 9 },
  rowBar: { width: 3, borderRadius: 2 },
  rowBody: { flex: 1 },
  rowTitle: { color: '#fff', fontWeight: '600' },
  rowMeta: { fontSize: 11, marginTop: 1 },

  empty: { color: 'rgba(255,255,255,0.6)', fontSize: 13, paddingBottom: 4 },
});

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 40, height: 32, justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  body: { padding: 16, alignItems: 'center', gap: 14, paddingBottom: 48 },

  segment: { flexDirection: 'row', gap: 8 },
  segmentBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  segmentText: { fontSize: 13, fontWeight: '600' },

  previewWrap: { borderRadius: 26, overflow: 'hidden' },

  nudgeRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nudgeBtn: {
    width: 46,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeLabel: { fontSize: 13, fontWeight: '600', minWidth: 86, textAlign: 'center' },

  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  primaryAction: { borderWidth: 0 },
  actionText: { fontSize: 15, fontWeight: '600' },

  note: { fontSize: 12, textAlign: 'center', paddingHorizontal: 20, lineHeight: 18 },

  offscreen: { position: 'absolute', left: -10000, top: 0 },
});
