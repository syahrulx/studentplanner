import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type ViewShot from 'react-native-view-shot';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { captureError } from '@/src/lib/monitoring';
import { getMyMemoryMonths, randomPick, type MemoryMonth } from '@/src/lib/snapMemories';
import { ExportCanvas, saveExportCanvas, shareExportCanvas } from '@/components/ViewShotCompat';
import { DUMP_H, DUMP_TEMPLATES, DUMP_W, type DumpPhoto } from '@/components/snap/DumpTemplates';
import { KeyboardAvoidingScreen } from '@/components/KeyboardAvoidingScreen';

/**
 * Turn a month of snaps into one "photo dump" picture to save or share.
 * Photos are picked at random by default; the student can shuffle, choose
 * their own, edit the title and captions, and switch between templates.
 */
export default function SnapDump() {
  const { month } = useLocalSearchParams<{ month?: string }>();
  const { user } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [data, setData] = useState<MemoryMonth | null>(null);
  const [failed, setFailed] = useState(false);
  const [templateId, setTemplateId] = useState(DUMP_TEMPLATES[0].id);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [captionEdits, setCaptionEdits] = useState<Record<string, string>>({});
  const [chooser, setChooser] = useState(false);
  const [captionEditor, setCaptionEditor] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'share'>(null);
  const [loaded, setLoaded] = useState(0);
  const canvasRef = useRef<ViewShot>(null);

  const template = DUMP_TEMPLATES.find((t) => t.id === templateId)!;
  const snaps = data?.snaps ?? [];
  const wanted = template.count === 'all' ? snaps.length : Math.min(template.count, snaps.length);

  useEffect(() => {
    if (!user.id) return;
    getMyMemoryMonths(user.id)
      .then((all) => {
        const m = all.find((x) => x.key === month) ?? all[0] ?? null;
        setData(m);
        if (m) {
          setTitle(m.monthName);
          setSubtitle(`${m.snaps.length} snap${m.snaps.length === 1 ? '' : 's'} · ${m.activeDays} day${m.activeDays === 1 ? '' : 's'}`);
          setPickedIds(randomPick(m.snaps, DUMP_TEMPLATES[0].count as number).map((s) => s.id));
        }
      })
      .catch((e) => {
        captureError(e, { where: 'snapDump.load' });
        setFailed(true);
      });
  }, [user.id, month]);

  // Switching template keeps the photos already chosen and tops up at random.
  useEffect(() => {
    if (!data) return;
    if (template.count === 'all') {
      setPickedIds(data.snaps.map((s) => s.id));
      return;
    }
    const need = Math.min(template.count, data.snaps.length);
    setPickedIds((prev) => {
      const kept = prev.filter((id) => data.snaps.some((s) => s.id === id)).slice(0, need);
      if (kept.length >= need) return kept;
      const rest = data.snaps.filter((s) => !kept.includes(s.id));
      const extra = randomPick(rest, need - kept.length).map((s) => s.id);
      return sortByDate([...kept, ...extra]);
    });
  }, [templateId, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortByDate = (ids: string[]) =>
    [...ids].sort((a, b) => {
      const sa = snaps.find((s) => s.id === a)?.createdAt ?? '';
      const sb = snaps.find((s) => s.id === b)?.createdAt ?? '';
      return sa.localeCompare(sb);
    });

  const photos: DumpPhoto[] = useMemo(
    () =>
      pickedIds
        .map((id) => snaps.find((s) => s.id === id))
        .filter(Boolean)
        .map((s) => ({ id: s!.id, uri: s!.imageUrl, createdAt: s!.createdAt, caption: captionEdits[s!.id] ?? s!.caption })),
    [pickedIds, snaps, captionEdits],
  );

  // Saving waits for the pictures, or a few seconds if one never loads.
  useEffect(() => setLoaded(0), [templateId, pickedIds]);
  const [waitedEnough, setWaitedEnough] = useState(false);
  useEffect(() => {
    setWaitedEnough(false);
    const t = setTimeout(() => setWaitedEnough(true), 6000);
    return () => clearTimeout(t);
  }, [templateId, pickedIds]);
  const ready = loaded >= photos.length || waitedEnough;

  const shuffle = () => {
    if (template.count === 'all') return;
    setPickedIds(randomPick(snaps, wanted, Math.random()).map((s) => s.id));
  };

  const toggleChosen = (id: string) => {
    setPickedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= wanted) return prev;
      return sortByDate([...prev, id]);
    });
  };

  const save = async () => {
    setBusy('save');
    const r = await saveExportCanvas(canvasRef.current, { format: 'jpg', quality: 0.92 });
    setBusy(null);
    if (r === 'saved') Alert.alert('Saved to Photos', 'Your dump is in your photo library.');
    else if (r === 'denied') Alert.alert('Photo access needed', 'Allow Rencana to add photos in Settings to save your dump.');
    else Alert.alert("Couldn't save", 'Try again in a moment.');
  };

  const share = async () => {
    setBusy('share');
    const r = await shareExportCanvas(canvasRef.current);
    setBusy(null);
    if (r === 'error') Alert.alert("Couldn't share", 'Try again in a moment.');
  };

  const scale = Math.min((width - 64) / DUMP_W, 0.92);

  if (failed || (!data && failed)) {
    return (
      <View style={[s.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>Couldn't load your snaps.</Text>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={[s.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  const Render = template.Render;

  return (
    <View style={[s.container, { backgroundColor: theme.background, paddingTop: insets.top + 8 }]}>
      <View style={s.header}>
        <Pressable
          onPress={() => router.back()}
          style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          accessibilityLabel="Back"
        >
          <Feather name="chevron-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[s.title, { color: theme.text }]}>{data.monthName} dump</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
        {/* The canvas is drawn full size and scaled down to show; the capture
            reads the full-size view, so the saved picture is sharp. */}
        <View style={{ height: DUMP_H * scale, alignItems: 'center', marginTop: 6 }}>
          <View style={{ width: DUMP_W, height: DUMP_H, transform: [{ scale }], marginTop: -(DUMP_H * (1 - scale)) / 2 }}>
            <ExportCanvas ref={canvasRef} format="jpg" quality={0.92} style={s.canvasShadow}>
              <Render
                photos={photos}
                title={title}
                subtitle={subtitle}
                showCaptions
                onImageDone={() => setLoaded((n) => n + 1)}
              />
            </ExportCanvas>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {DUMP_TEMPLATES.map((t) => {
            const active = t.id === templateId;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTemplateId(t.id)}
                style={[s.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.card }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.chipText, { color: active ? theme.textInverse : theme.text }]}>{t.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={s.row}>
          <Pressable
            onPress={shuffle}
            disabled={template.count === 'all'}
            style={[s.action, { backgroundColor: theme.card, borderColor: theme.border }, template.count === 'all' && { opacity: 0.4 }]}
          >
            <Feather name="shuffle" size={16} color={theme.text} />
            <Text style={[s.actionText, { color: theme.text }]}>Shuffle</Text>
          </Pressable>
          <Pressable
            onPress={() => setChooser(true)}
            disabled={template.count === 'all'}
            style={[s.action, { backgroundColor: theme.card, borderColor: theme.border }, template.count === 'all' && { opacity: 0.4 }]}
          >
            <Feather name="check-square" size={16} color={theme.text} />
            <Text style={[s.actionText, { color: theme.text }]}>Choose photos</Text>
          </Pressable>
        </View>

        <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.label, { color: theme.textSecondary }]}>Title</Text>
          <TextInput value={title} onChangeText={setTitle} maxLength={24} style={[s.input, { color: theme.text, borderColor: theme.border }]} />
          <Text style={[s.label, { color: theme.textSecondary }]}>Subtitle</Text>
          <TextInput value={subtitle} onChangeText={setSubtitle} maxLength={48} style={[s.input, { color: theme.text, borderColor: theme.border }]} />
          {/* Only the Diary layout prints captions. */}
          {templateId === 'diary' ? (
            <Pressable onPress={() => setCaptionEditor(true)} style={s.linkRow}>
              <Feather name="edit-3" size={14} color={theme.primary} />
              <Text style={[s.link, { color: theme.primary }]}>Edit captions</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: insets.bottom + 12, backgroundColor: theme.background, borderTopColor: theme.border }]}>
        <Pressable
          onPress={save}
          disabled={!ready || !!busy}
          style={[s.bigBtn, { backgroundColor: theme.primary }, (!ready || !!busy) && { opacity: 0.5 }]}
        >
          {busy === 'save' ? <ActivityIndicator color={theme.textInverse} /> : <Feather name="download" size={18} color={theme.textInverse} />}
          <Text style={[s.bigText, { color: theme.textInverse }]}>{ready ? 'Save to Photos' : 'Loading photos…'}</Text>
        </Pressable>
        <Pressable
          onPress={share}
          disabled={!ready || !!busy}
          style={[s.shareBtn, { borderColor: theme.border, backgroundColor: theme.card }, (!ready || !!busy) && { opacity: 0.5 }]}
          accessibilityLabel="Share"
        >
          {busy === 'share' ? <ActivityIndicator color={theme.text} /> : <Feather name="share" size={18} color={theme.text} />}
        </Pressable>
      </View>

      {/* Choose photos */}
      <Modal visible={chooser} animationType="slide" onRequestClose={() => setChooser(false)}>
        <View style={[s.container, { backgroundColor: theme.background, paddingTop: insets.top + 8 }]}>
          <View style={s.header}>
            <View style={{ width: 44 }} />
            <Text style={[s.title, { color: theme.text }]}>
              {pickedIds.length} of {wanted}
            </Text>
            <Pressable onPress={() => setChooser(false)} style={[s.done, { backgroundColor: theme.primary }]}>
              <Text style={{ color: theme.textInverse, fontWeight: '800' }}>Done</Text>
            </Pressable>
          </View>
          <FlatList
            data={snaps}
            numColumns={3}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 20 }}
            renderItem={({ item }) => {
              const n = pickedIds.indexOf(item.id);
              const w = (width - 24 - 8) / 3;
              return (
                <Pressable onPress={() => toggleChosen(item.id)} style={{ margin: 2 }}>
                  <Image source={{ uri: item.imageUrl }} style={{ width: w - 2, height: (w - 2) * 1.33, borderRadius: 8 }} />
                  {n >= 0 ? (
                    <View style={[s.badge, { backgroundColor: theme.primary }]}>
                      <Text style={{ color: theme.textInverse, fontWeight: '900', fontSize: 12 }}>{n + 1}</Text>
                    </View>
                  ) : (
                    <View style={s.badgeEmpty} />
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>

      {/* Edit captions */}
      <Modal visible={captionEditor} animationType="slide" onRequestClose={() => setCaptionEditor(false)}>
        <KeyboardAvoidingScreen style={[s.container, { backgroundColor: theme.background, paddingTop: insets.top + 8 }]}>
          <View style={s.header}>
            <View style={{ width: 44 }} />
            <Text style={[s.title, { color: theme.text }]}>Captions</Text>
            <Pressable onPress={() => setCaptionEditor(false)} style={[s.done, { backgroundColor: theme.primary }]}>
              <Text style={{ color: theme.textInverse, fontWeight: '800' }}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              Changes only the dump picture. Your snaps keep their own captions.
            </Text>
            {photos.map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Image source={{ uri: p.uri }} style={{ width: 54, height: 72, borderRadius: 6 }} />
                <TextInput
                  value={p.caption}
                  onChangeText={(t) => setCaptionEdits((prev) => ({ ...prev, [p.id]: t }))}
                  placeholder="Add a caption"
                  placeholderTextColor={theme.textSecondary}
                  maxLength={80}
                  multiline
                  style={[s.input, { flex: 1, color: theme.text, borderColor: theme.border, minHeight: 54 }]}
                />
              </View>
            ))}
          </ScrollView>
        </KeyboardAvoidingScreen>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800' },
  canvasShadow: { width: DUMP_W, height: DUMP_H, borderRadius: 6, overflow: 'hidden' },
  chips: { paddingHorizontal: 16, gap: 8, paddingVertical: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  action: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: { fontSize: 14, fontWeight: '700' },
  card: { marginHorizontal: 16, marginTop: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  link: { fontSize: 14, fontWeight: '700' },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bigBtn: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 16, height: 52 },
  bigText: { fontSize: 16, fontWeight: '800' },
  shareBtn: { width: 52, height: 52, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  done: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  badge: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeEmpty: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#fff' },
});
