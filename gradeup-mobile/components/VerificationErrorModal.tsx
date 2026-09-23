import React, { useEffect, useRef } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import type { MatricOtpErrorCode, MatricOtpProblem } from '@/src/lib/uitmVerification';

type Props = {
  problem: MatricOtpProblem | null;
  onClose: () => void;
  /** Shown as the primary button when the problem says a retry is what fixes it. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Shown when the student ID itself is what has to change. */
  onChangeId?: () => void;
};

const ICONS: Record<MatricOtpErrorCode, keyof typeof Feather.glyphMap> = {
  invalid_matric: 'hash',
  signed_out: 'log-in',
  offline: 'wifi-off',
  rate_limited: 'clock',
  server_down: 'cloud-off',
  send_failed: 'mail',
  invalid_code: 'x-circle',
  expired: 'clock',
  locked: 'lock',
  unknown: 'alert-triangle',
};

/** Red for "this is wrong", amber for "wait", blue for "not your fault". */
function accentFor(code: MatricOtpErrorCode): string {
  if (code === 'offline' || code === 'server_down' || code === 'signed_out') return '#0A84FF';
  if (code === 'rate_limited' || code === 'expired') return '#FF9F0A';
  return '#FF453A';
}

/**
 * Explains a failed student ID verification and says what to do next.
 *
 * The OTP screen only ever showed a one-line red caption under the code boxes,
 * which is enough for a mistyped digit and not enough for anything else: a
 * locked ID, an expired code and a dead connection all read the same and none
 * of them told the student what to do. Those cases surface here instead.
 */
export default function VerificationErrorModal({
  problem,
  onClose,
  onRetry,
  retryLabel,
  onChangeId,
}: Props) {
  const theme = useTheme();
  const visible = problem != null;

  const fade = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    if (!visible) {
      fade.setValue(0);
      pop.setValue(0.94);
      return;
    }
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(pop, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, fade, pop]);

  if (!problem) return null;

  const accent = accentFor(problem.code);
  const showRetry = problem.canResend && !!onRetry;
  const showChangeId = problem.needsNewId && !!onChangeId;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <View style={styles.centre} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: theme.card, opacity: fade, transform: [{ scale: pop }] },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: accent + '1F' }]}>
            <Feather name={ICONS[problem.code]} size={26} color={accent} />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>{problem.title}</Text>
          <Text style={[styles.message, { color: theme.textSecondary }]}>{problem.message}</Text>

          {!!problem.hint && (
            <View style={[styles.hintBox, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="info" size={14} color={theme.textSecondary} style={styles.hintIcon} />
              <Text style={[styles.hintText, { color: theme.textSecondary }]}>{problem.hint}</Text>
            </View>
          )}

          <View style={styles.actions}>
            {showRetry && (
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  onClose();
                  onRetry?.();
                }}
              >
                <Text style={[styles.primaryText, { color: theme.textInverse }]}>
                  {retryLabel ?? 'Try again'}
                </Text>
              </Pressable>
            )}

            {showChangeId && (
              <Pressable
                style={[
                  showRetry ? styles.secondaryBtn : styles.primaryBtn,
                  showRetry
                    ? { borderColor: theme.border }
                    : { backgroundColor: theme.primary },
                ]}
                onPress={() => {
                  onClose();
                  onChangeId?.();
                }}
              >
                <Text
                  style={[
                    showRetry ? styles.secondaryText : styles.primaryText,
                    { color: showRetry ? theme.text : theme.textInverse },
                  ]}
                >
                  Change student ID
                </Text>
              </Pressable>
            )}

            {!showRetry && !showChangeId && (
              <Pressable style={[styles.primaryBtn, { backgroundColor: theme.primary }]} onPress={onClose}>
                <Text style={[styles.primaryText, { color: theme.textInverse }]}>OK</Text>
              </Pressable>
            )}

            {(showRetry || showChangeId) && (
              <Pressable style={styles.dismissBtn} onPress={onClose} hitSlop={8}>
                <Text style={[styles.dismissText, { color: theme.textSecondary }]}>Not now</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 26,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 14,
    padding: 12,
    marginTop: 16,
    width: '100%',
  },
  hintIcon: { marginTop: 1 },
  hintText: { flex: 1, fontSize: 13, lineHeight: 19 },
  actions: { width: '100%', marginTop: 20, gap: 10 },
  primaryBtn: {
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryText: { fontSize: 16, fontWeight: '700' },
  dismissBtn: { alignItems: 'center', paddingVertical: 6 },
  dismissText: { fontSize: 14, fontWeight: '600' },
});
