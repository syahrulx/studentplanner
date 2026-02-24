import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { scheduleRevisionAtDate } from '@/src/revisionNotifications';
import { formatDisplayDate } from '@/src/utils/date';

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`);
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`);
}

function getNextDays(count: number): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    out.push({ date: dateStr, label: formatDisplayDate(dateStr) });
  }
  return out;
}

export default function RevisionPostponeScreen() {
  const theme = useTheme();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().slice(0, 10);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('20:00');
  const [saving, setSaving] = useState(false);

  const nextDays = getNextDays(14);

  const handleSave = async () => {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map((x) => parseInt(x, 10) || 0);
    const triggerDate = new Date(y, m - 1, d, hh, mm, 0);
    if (triggerDate.getTime() <= Date.now()) return;
    setSaving(true);
    await scheduleRevisionAtDate(triggerDate);
    setSaving(false);
    router.back();
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ThemeIcon name="arrowRight" size={20} color={theme.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Postpone revision</Text>
      </View>
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        Choose when you want to be reminded. The reminder will fire once at this date and time.
      </Text>

      <Text style={[styles.label, { color: theme.text }]}>Date</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        {nextDays.map(({ date: d, label }) => (
          <Pressable
            key={d}
            style={[styles.chip, { backgroundColor: date === d ? theme.primary + '22' : theme.background, borderColor: date === d ? theme.primary : theme.border }]}
            onPress={() => setDate(d)}
          >
            <Text style={[styles.chipText, { color: date === d ? theme.primary : theme.textSecondary }]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={[styles.label, { color: theme.text, marginTop: 20 }]}>Time</Text>
      <ScrollView style={styles.timeScroll} nestedScrollEnabled>
        <View style={styles.timeWrap}>
          {TIME_OPTIONS.map((t) => (
            <Pressable
              key={t}
              style={[styles.timeChip, { backgroundColor: time === t ? theme.primary + '22' : theme.background, borderColor: time === t ? theme.primary : theme.border }]}
              onPress={() => setTime(t)}
            >
              <Text style={[styles.timeChipText, { color: time === t ? theme.primary : theme.textSecondary }]}>{t}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Pressable
        style={({ pressed }) => [styles.saveBtn, { backgroundColor: theme.primary }, pressed && styles.pressed]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={[styles.saveBtnText, { color: theme.textInverse }]}>{saving ? 'Saving…' : 'Set reminder'}</Text>
      </Pressable>
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: { marginRight: 18, padding: 4 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  description: { fontSize: 14, lineHeight: 20, marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '700' },
  chipScroll: { marginTop: 10, marginHorizontal: -4 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, marginRight: 10 },
  chipText: { fontSize: 13, fontWeight: '700' },
  timeScroll: { maxHeight: 200, marginTop: 10 },
  timeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  timeChipText: { fontSize: 13, fontWeight: '700' },
  saveBtn: { marginTop: 28, paddingVertical: 16, borderRadius: 20, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.9 },
});
