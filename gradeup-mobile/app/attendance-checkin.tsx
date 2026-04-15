import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { recordAttendanceEvent, type AttendanceStatus } from '@/src/attendanceRecording';

export default function AttendanceCheckinScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams();
  const [busy, setBusy] = useState(false);

  const timetableEntryId = String(params.timetableEntryId ?? '').trim();
  const scheduledStartAt = String(params.scheduledStartAt ?? '').trim();
  const subjectCode = String(params.subjectCode ?? '').trim();
  const subjectName = String(params.subjectName ?? '').trim();

  const subjectLabel = useMemo(() => {
    const s = (subjectName || subjectCode || 'Class').trim();
    return s.length > 80 ? s.slice(0, 80) + '…' : s;
  }, [subjectCode, subjectName]);

  const submit = async (status: AttendanceStatus) => {
    if (!timetableEntryId || !scheduledStartAt) {
      router.back();
      return;
    }
    setBusy(true);
    try {
      await recordAttendanceEvent({
        timetableEntryId,
        scheduledStartAt,
        status,
        subjectCode,
        subjectName,
        source: 'in_app',
      });
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: theme.primary + '22' }]}>
          <ThemeIcon name="check-circle" size={40} color={theme.primary} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Class check-in</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Did you attend “{subjectLabel}”?
        </Text>

        <View style={styles.btnCol}>
          <Pressable
            disabled={busy}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: theme.primary },
              (pressed || busy) && styles.pressed,
            ]}
            onPress={() => void submit('present')}
          >
            <Text style={[styles.primaryBtnText, { color: theme.textInverse }]}>
              Present
            </Text>
          </Pressable>

          <Pressable
            disabled={busy}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { backgroundColor: theme.background, borderColor: theme.border },
              (pressed || busy) && styles.pressed,
            ]}
            onPress={() => void submit('absent')}
          >
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Absent</Text>
          </Pressable>

          <Pressable
            disabled={busy}
            style={({ pressed }) => [
              styles.dangerBtn,
              { backgroundColor: theme.background, borderColor: theme.primary },
              (pressed || busy) && styles.pressed,
            ]}
            onPress={() => void submit('cancelled')}
          >
            <Text style={[styles.dangerBtnText, { color: theme.primary }]}>Class cancelled</Text>
          </Pressable>
        </View>

        <Pressable
          disabled={busy}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          onPress={() => router.back()}
        >
          <Text style={[styles.closeBtnText, { color: theme.textSecondary }]}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, borderRadius: 28, borderWidth: 1, padding: 28, alignItems: 'center' },
  iconWrap: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  btnCol: { width: '100%', gap: 12 },
  primaryBtn: { width: '100%', paddingVertical: 16, borderRadius: 20, alignItems: 'center' },
  primaryBtnText: { fontSize: 16, fontWeight: '800' },
  secondaryBtn: { width: '100%', paddingVertical: 16, borderRadius: 20, borderWidth: 1, alignItems: 'center' },
  secondaryBtnText: { fontSize: 16, fontWeight: '800' },
  dangerBtn: { width: '100%', paddingVertical: 16, borderRadius: 20, borderWidth: 1, alignItems: 'center' },
  dangerBtnText: { fontSize: 16, fontWeight: '800' },
  closeBtn: { marginTop: 18, paddingVertical: 10, paddingHorizontal: 12 },
  closeBtnText: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.9 },
});

