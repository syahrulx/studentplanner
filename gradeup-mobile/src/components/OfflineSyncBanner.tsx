import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';

/** Small, non-blocking reassurance that local edits are safe while offline. */
export default function OfflineSyncBanner() {
  const theme = useTheme();
  const { offlineSyncStatus, retryOfflineSync } = useApp();
  const { pendingCount, syncing, lastError } = offlineSyncStatus;

  if (pendingCount === 0) return null;

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <View style={[styles.banner, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {syncing ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : (
          <View style={[styles.dot, { backgroundColor: theme.primary }]} />
        )}
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.text }]}>
            {syncing
              ? 'Syncing saved changes…'
              : lastError
                ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} couldn’t sync`
                : `${pendingCount} change${pendingCount === 1 ? '' : 's'} saved offline`}
          </Text>
          <Text numberOfLines={2} style={[styles.detail, { color: theme.textSecondary }]}>
            {lastError || 'Safe on this device · retries automatically'}
          </Text>
        </View>
        {!syncing && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry synchronization"
            hitSlop={8}
            onPress={() => { void retryOfflineSync(); }}
            style={({ pressed }) => [styles.retry, { backgroundColor: `${theme.primary}18`, opacity: pressed ? 0.65 : 1 }]}
          >
            <Text style={[styles.retryText, { color: theme.primary }]}>Retry</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 22,
    zIndex: 10000,
    elevation: 20,
    alignItems: 'center',
  },
  banner: {
    width: '100%',
    maxWidth: 520,
    minHeight: 58,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: '700' },
  detail: { marginTop: 2, fontSize: 11, fontWeight: '500' },
  retry: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  retryText: { fontSize: 12, fontWeight: '800' },
});
