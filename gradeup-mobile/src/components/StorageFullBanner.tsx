import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { recheckStorage, subscribeStorageFull } from '@/src/lib/storageFull';

/**
 * Shown when the device has no storage left.
 *
 * Without this the app fails silently: edits look saved, nothing is written,
 * and the work is gone on the next launch. The user reads that as the app
 * losing their data rather than their phone being full.
 */
export default function StorageFullBanner() {
  const theme = useTheme();
  const [full, setFull] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => subscribeStorageFull(setFull), []);

  if (!full) return null;

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <View style={[styles.banner, { backgroundColor: theme.card, borderColor: theme.danger }]}>
        <View style={[styles.dot, { backgroundColor: theme.danger }]} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.text }]}>Your device is out of storage</Text>
          <Text numberOfLines={2} style={[styles.detail, { color: theme.textSecondary }]}>
            Rencana can’t save changes until you free up some space.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Check storage again"
          hitSlop={8}
          disabled={checking}
          onPress={() => {
            setChecking(true);
            void recheckStorage().finally(() => setChecking(false));
          }}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: `${theme.primary}18`, opacity: pressed || checking ? 0.65 : 1 },
          ]}
        >
          <Text style={[styles.actionText, { color: theme.primary }]}>
            {checking ? '…' : 'Check'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits above the offline banner so the two never overlap.
  layer: { position: 'absolute', left: 12, right: 12, bottom: 88, zIndex: 10001, elevation: 21, alignItems: 'center' },
  banner: {
    width: '100%', maxWidth: 520, minHeight: 58, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '700' },
  detail: { fontSize: 12, lineHeight: 16 },
  action: { minHeight: 34, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 13, fontWeight: '700' },
});
