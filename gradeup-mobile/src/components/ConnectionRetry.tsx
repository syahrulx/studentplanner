import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';

/**
 * Fallback for a layout gate whose session / profile lookup failed or timed out.
 *
 * Both layout gates used to `return null` while their lookup was outstanding.
 * With no request timeout that state was permanent whenever the backend was
 * saturated: the user got a blank screen with no spinner, no message and no way
 * forward, so the only move left was to force-quit and relaunch — which fired
 * the same queries again and added load to the thing that was already
 * struggling. Showing a retry the user can drive breaks that loop.
 */
export function ConnectionRetry({
  onRetry,
  retrying = false,
}: {
  onRetry: () => void;
  retrying?: boolean;
}) {
  const { language } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>{T('connectionGateTitle')}</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>{T('connectionGateBody')}</Text>

      <Pressable
        accessibilityRole="button"
        disabled={retrying}
        onPress={onRetry}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: theme.primary,
            opacity: retrying ? 0.6 : pressed ? 0.85 : 1,
          },
        ]}
      >
        {retrying ? (
          <ActivityIndicator size="small" color={theme.textInverse} />
        ) : (
          <Text style={[styles.buttonLabel, { color: theme.textInverse }]}>
            {T('connectionGateRetry')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  body: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  button: {
    marginTop: 26,
    minWidth: 160,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
});

export default ConnectionRetry;
