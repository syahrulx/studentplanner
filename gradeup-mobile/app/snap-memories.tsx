import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { captureError } from '@/src/lib/monitoring';
import { getMyMemoryMonths, type MemoryMonth, type MemorySnap } from '@/src/lib/snapMemories';

/** A student's own past snaps, month by month. Only they can see these. */
export default function SnapMemories() {
  const { user } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [months, setMonths] = useState<MemoryMonth[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<MemorySnap | null>(null);

  const load = useCallback(async () => {
    if (!user.id) return;
    setFailed(false);
    try {
      setMonths(await getMyMemoryMonths(user.id));
    } catch (e) {
      captureError(e, { where: 'snapMemories.load' });
      setFailed(true);
    }
  }, [user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const gap = 4;
  const side = 16;
  const cell = (width - side * 2 - gap * 2) / 3;

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
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[s.title, { color: theme.text }]}>Memories</Text>
          <View style={s.private}>
            <Feather name="lock" size={10} color={theme.textSecondary} />
            <Text style={[s.privateText, { color: theme.textSecondary }]}>Only you can see these</Text>
          </View>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {months === null && !failed ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : failed ? (
        <Pressable onPress={() => void load()} style={s.center}>
          <Text style={[s.empty, { color: theme.textSecondary }]}>Couldn't load your snaps. Tap to try again.</Text>
        </Pressable>
      ) : months!.length === 0 ? (
        <View style={s.center}>
          <Feather name="camera" size={34} color={theme.textSecondary} />
          <Text style={[s.empty, { color: theme.textSecondary }]}>Your snaps will collect here, month by month.</Text>
        </View>
      ) : (
        <FlatList
          data={months!}
          keyExtractor={(m) => m.key}
          contentContainerStyle={{ paddingHorizontal: side, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item: m }) => (
            <View style={{ marginTop: 18 }}>
              <View style={s.monthRow}>
                <View>
                  <Text style={[s.monthLabel, { color: theme.text }]}>{m.label}</Text>
                  <Text style={[s.monthSub, { color: theme.textSecondary }]}>
                    {m.snaps.length} snap{m.snaps.length === 1 ? '' : 's'} · {m.activeDays} day{m.activeDays === 1 ? '' : 's'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => router.push({ pathname: '/snap-dump', params: { month: m.key } } as any)}
                  style={({ pressed }) => [s.dumpBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Make a ${m.monthName} dump`}
                >
                  <Feather name="layout" size={14} color={theme.textInverse} />
                  <Text style={[s.dumpText, { color: theme.textInverse }]}>Make dump</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
                {m.snaps.map((snap) => (
                  <Pressable key={snap.id} onPress={() => setOpen(snap)} accessibilityLabel="Open snap">
                    <Image source={{ uri: snap.imageUrl }} style={{ width: cell, height: cell * 1.33, borderRadius: 8, backgroundColor: theme.card }} />
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={s.viewer} onPress={() => setOpen(null)}>
          {open ? (
            <>
              <Image source={{ uri: open.imageUrl }} style={s.viewerImg} resizeMode="contain" />
              <View style={[s.viewerInfo, { paddingBottom: insets.bottom + 16 }]}>
                <Text style={s.viewerDate}>
                  {new Date(open.createdAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' })}
                </Text>
                {open.caption ? <Text style={s.viewerCaption}>{open.caption}</Text> : null}
              </View>
            </>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800' },
  private: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  privateText: { fontSize: 11 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 },
  empty: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  monthLabel: { fontSize: 17, fontWeight: '800' },
  monthSub: { fontSize: 12, marginTop: 2 },
  dumpBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  dumpText: { fontSize: 13, fontWeight: '800' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '78%' },
  viewerInfo: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20 },
  viewerDate: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  viewerCaption: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 4 },
});
