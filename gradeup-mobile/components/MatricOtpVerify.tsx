import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import {
  sendUitmMatricOtp,
  verifyUitmMatricOtp,
  uitmStudentEmailFor,
  maskStudentEmail,
} from '@/src/lib/uitmVerification';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

interface Props {
  matric: string;
  /** Fired once the matric is proven; the parent continues straight to fetching. */
  onVerified: (matric: string) => void;
  /** Back to the student ID field. */
  onChangeId: () => void;
}

/**
 * One-time code step for proving matric ownership.
 *
 * Sends on mount and verifies the moment the sixth digit lands, so the happy
 * path is: land here → paste/type code → timetable. No extra taps.
 */
export default function MatricOtpVerify({ matric, onVerified, onChangeId }: Props) {
  const theme = useTheme();

  const [code, setCode] = useState('');
  const [sending, setSending] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const inputRef = useRef<TextInput>(null);
  const verifiedRef = useRef(false);
  /**
   * Guards the send-on-mount effect. `send` closes over `onVerified`, which the
   * parent recreates every render, so without this the effect would re-fire on
   * each render and mail a fresh code every time.
   */
  const sentOnceRef = useRef(false);

  const email = uitmStudentEmailFor(matric);

  const send = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const result = await sendUitmMatricOtp(matric);
      if (result === 'already_verified') {
        verifiedRef.current = true;
        onVerified(matric);
        return;
      }
      setCooldown(RESEND_COOLDOWN_SECONDS);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code.');
    } finally {
      setSending(false);
    }
  }, [matric, onVerified]);

  useEffect(() => {
    if (sentOnceRef.current) return;
    sentOnceRef.current = true;
    void send();
  }, [send]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = useCallback(
    async (fullCode: string) => {
      if (verifiedRef.current) return;
      setVerifying(true);
      setError(null);
      try {
        const result = await verifyUitmMatricOtp(fullCode);
        if (result.status === 'verified') {
          verifiedRef.current = true;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          onVerified(result.matric || matric);
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setError(result.message || 'That code did not work.');
        setCode('');
        if (result.status === 'expired' || result.status === 'locked') setCooldown(0);
        requestAnimationFrame(() => inputRef.current?.focus());
      } catch (e) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setError(e instanceof Error ? e.message : 'Could not verify the code.');
        setCode('');
      } finally {
        setVerifying(false);
      }
    },
    [matric, onVerified],
  );

  const handleChange = (raw: string) => {
    const next = raw.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
    setCode(next);
    if (next.length > 0) setError(null);
    if (next.length === CODE_LENGTH) void verify(next);
  };

  const boxes = Array.from({ length: CODE_LENGTH }, (_, i) => {
    const char = code[i] ?? '';
    const isActive = !verifying && i === code.length;
    const isFilled = char !== '';
    return (
      <View
        key={i}
        style={[
          styles.box,
          {
            backgroundColor: theme.background,
            borderColor: error
              ? '#FF453A'
              : isActive
                ? theme.primary
                : isFilled
                  ? theme.textSecondary + '55'
                  : theme.border,
          },
          isActive && styles.boxActive,
        ]}
      >
        <Text style={[styles.boxText, { color: theme.text }]}>{char}</Text>
      </View>
    );
  });

  return (
    <View style={styles.wrap}>
      <View style={[styles.iconBadge, { backgroundColor: theme.primary + '1F' }]}>
        <Feather name="shield" size={26} color={theme.primary} />
      </View>

      <Text style={[styles.title, { color: theme.text }]}>Confirm it's your ID</Text>
      <Text style={[styles.desc, { color: theme.textSecondary }]}>
        We sent a 6-digit code to{'\n'}
        <Text style={{ color: theme.text, fontWeight: '700' }}>{maskStudentEmail(email)}</Text>
      </Text>

      <Pressable
        style={styles.codeRow}
        onPress={() => inputRef.current?.focus()}
        disabled={verifying}
      >
        {boxes}
        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value={code}
          onChangeText={handleChange}
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          autoFocus={!sending}
          editable={!verifying}
          caretHidden
          textContentType="oneTimeCode"
          autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        />
      </Pressable>

      <View style={styles.statusRow}>
        {sending ? (
          <>
            <ActivityIndicator size="small" color={theme.textSecondary} />
            <Text style={[styles.statusText, { color: theme.textSecondary }]}>Sending code…</Text>
          </>
        ) : verifying ? (
          <>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[styles.statusText, { color: theme.primary }]}>Verifying…</Text>
          </>
        ) : error ? (
          <>
            <Feather name="alert-circle" size={14} color="#FF453A" />
            <Text style={[styles.statusText, { color: '#FF453A' }]}>{error}</Text>
          </>
        ) : (
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            Check your UiTM inbox, including spam.
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => void send()}
          disabled={sending || verifying || cooldown > 0}
          hitSlop={8}
        >
          <Text
            style={[
              styles.linkText,
              { color: cooldown > 0 || sending || verifying ? theme.textSecondary : theme.primary },
            ]}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </Text>
        </Pressable>

        <View style={[styles.dot, { backgroundColor: theme.textSecondary + '66' }]} />

        <Pressable onPress={onChangeId} disabled={verifying} hitSlop={8}>
          <Text style={[styles.linkText, { color: theme.textSecondary }]}>Change ID</Text>
        </Pressable>
      </View>

      <Text style={[styles.footnote, { color: theme.textSecondary }]}>
        Only the owner of {matric} can read that inbox, so this confirms the ID belongs to you. We
        never ask for your MyStudent password.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 8 },
  iconBadge: {
    width: 58, height: 58, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center' },
  desc: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  codeRow: {
    flexDirection: 'row', gap: 10, marginTop: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  box: {
    width: 46, height: 56, borderRadius: 14, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  boxActive: { borderWidth: 2, transform: [{ scale: 1.04 }] },
  boxText: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    // Keep the tap target over the boxes without letting the caret show through.
    color: 'transparent',
  },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 18, minHeight: 20, paddingHorizontal: 8,
  },
  statusText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22 },
  linkText: { fontSize: 14, fontWeight: '700' },
  dot: { width: 3, height: 3, borderRadius: 2 },
  footnote: {
    fontSize: 12, lineHeight: 18, textAlign: 'center',
    marginTop: 24, paddingHorizontal: 4,
  },
});
