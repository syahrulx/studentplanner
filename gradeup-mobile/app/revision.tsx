import { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Switch, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import type { RevisionSettings, RevisionDay, RevisionRepeat } from '@/src/storage';
import { formatDisplayDate, parseDisplayDate } from '@/src/utils/date';
import { supabase } from '@/src/lib/supabase';
import * as studyTimeDb from '@/src/lib/studyTimeDb';

const DAYS: RevisionDay[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Every day'];

function getNextDays(count: number): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    out.push({ date: dateStr, label: formatDisplayDate(dateStr) });
  }
  return out;
}

// 30-minute steps from 00:00 to 23:30 for user-friendly time picker
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`);
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`);
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90];

function formatTimeLabel(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  if (h === 0 && m === 0) return '12:00 AM';
  if (h === 12 && m === 0) return '12:00 PM';
  if (h < 12) return `${h}:${String(m).padStart(2, '0')} AM`;
  return `${h - 12}:${String(m).padStart(2, '0')} PM`;
}

export default function RevisionScreen() {
  const { courses, revisionSettings, setRevisionSettings } = useApp();
  const theme = useTheme();
  const [enabled, setEnabled] = useState(revisionSettings.enabled);
  const [repeat, setRepeat] = useState<RevisionRepeat>(revisionSettings.repeat ?? 'repeated');
  const [singleDate, setSingleDate] = useState(revisionSettings.singleDate || new Date().toISOString().slice(0, 10));
  const [subjectId, setSubjectId] = useState(revisionSettings.subjectId || courses[0]?.id || '');
  const [day, setDay] = useState<RevisionDay>(revisionSettings.day);
  const [time, setTime] = useState(revisionSettings.time);
  const [durationMinutes, setDurationMinutes] = useState(revisionSettings.durationMinutes);
  const [topic, setTopic] = useState(revisionSettings.topic);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(revisionSettings.enabled);
    setRepeat(revisionSettings.repeat ?? 'repeated');
    setSingleDate(revisionSettings.singleDate || new Date().toISOString().slice(0, 10));
    setSubjectId(revisionSettings.subjectId || courses[0]?.id || '');
    setDay(revisionSettings.day);
    setTime(revisionSettings.time);
    setDurationMinutes(revisionSettings.durationMinutes);
    setTopic(revisionSettings.topic);
  }, [revisionSettings, courses]);

  // Ensure we always show the latest value from Supabase for the logged-in user
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const uid = session?.user?.id;
      if (!uid) return;
      const remote = await studyTimeDb.getStudySettings(uid);
      if (!remote) return;
      setEnabled(remote.enabled);
      setRepeat(remote.repeat);
      setSingleDate(remote.singleDate || new Date().toISOString().slice(0, 10));
      setSubjectId(remote.subjectId || courses[0]?.id || '');
      setDay(remote.day);
      setTime(remote.time);
      setDurationMinutes(remote.durationMinutes);
      setTopic(remote.topic);
    });
  }, [courses]);

  const handleSave = async () => {
    const normalizedTime = TIME_OPTIONS.includes(time) ? time : TIME_OPTIONS[0];
    const normalizedSingleDate = repeat === 'once' ? (parseDisplayDate(singleDate) || singleDate) : undefined;
    const settings: RevisionSettings = {
      enabled,
      time: normalizedTime,
      subjectId: subjectId || courses[0]?.id || '',
      day,
      durationMinutes,
      topic: topic.trim(),
      repeat,
      singleDate: normalizedSingleDate,
    };
    setSaving(true);
    await setRevisionSettings(settings);
    setSaving(false);
    router.back();
  };

  const nextDays = getNextDays(14);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ThemeIcon name="arrowRight" size={20} color={theme.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Study time</Text>
      </View>

      <Text style={[styles.description, { color: theme.textSecondary }]}>
        Set subject, day, time, how long, and what topic to cover. You’ll get a reminder so you can start or postpone.
      </Text>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: theme.text }]}>Reminder</Text>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: theme.border, true: theme.primary + '99' }}
            thumbColor={enabled ? theme.primary : theme.textSecondary}
          />
        </View>

        <Text style={[styles.label, { color: theme.text, marginTop: 20 }]}>Repeat</Text>
        <View style={styles.repeatRow}>
          <Pressable
            style={[styles.repeatChip, { backgroundColor: repeat === 'once' ? theme.primary + '22' : theme.background, borderColor: repeat === 'once' ? theme.primary : theme.border }]}
            onPress={() => setRepeat('once')}
          >
            <Text style={[styles.chipText, { color: repeat === 'once' ? theme.primary : theme.textSecondary }]}>Just once</Text>
          </Pressable>
          <Pressable
            style={[styles.repeatChip, { backgroundColor: repeat === 'repeated' ? theme.primary + '22' : theme.background, borderColor: repeat === 'repeated' ? theme.primary : theme.border }]}
            onPress={() => setRepeat('repeated')}
          >
            <Text style={[styles.chipText, { color: repeat === 'repeated' ? theme.primary : theme.textSecondary }]}>Repeated</Text>
          </Pressable>
        </View>

        {repeat === 'once' ? (
          <>
            <Text style={[styles.label, { color: theme.text, marginTop: 16 }]}>Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {nextDays.map(({ date, label }) => (
                <Pressable
                  key={date}
                  style={[styles.chip, { backgroundColor: singleDate === date ? theme.primary + '22' : theme.background, borderColor: singleDate === date ? theme.primary : theme.border }]}
                  onPress={() => setSingleDate(date)}
                >
                  <Text style={[styles.chipText, { color: singleDate === date ? theme.primary : theme.textSecondary }]}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput
              style={[styles.input, styles.inputDate, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              value={formatDisplayDate(singleDate)}
              onChangeText={(t) => {
                const p = parseDisplayDate(t);
                if (p) setSingleDate(p);
              }}
              placeholder="DD-MM-YYYY"
              placeholderTextColor={theme.textSecondary}
            />
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: theme.text, marginTop: 16 }]}>Day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {DAYS.map((d) => (
                <Pressable
                  key={d}
                  style={[styles.chip, { backgroundColor: day === d ? theme.primary + '22' : theme.background, borderColor: day === d ? theme.primary : theme.border }]}
                  onPress={() => setDay(d)}
                >
                  <Text style={[styles.chipText, { color: day === d ? theme.primary : theme.textSecondary }, d === 'Every day' && styles.chipTextShort]}>{d === 'Every day' ? 'Every day' : d.slice(0, 3)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        <Text style={[styles.label, { color: theme.text, marginTop: 16 }]}>Subject</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {courses.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.chip, { backgroundColor: subjectId === c.id ? theme.primary + '22' : theme.background, borderColor: subjectId === c.id ? theme.primary : theme.border }]}
              onPress={() => setSubjectId(c.id)}
            >
              <Text style={[styles.chipText, { color: subjectId === c.id ? theme.primary : theme.textSecondary }]}>{c.id}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[styles.label, { color: theme.text, marginTop: 16 }]}>Time</Text>
        <Pressable
          style={[styles.timeButton, { backgroundColor: theme.background, borderColor: theme.border }]}
          onPress={() => setShowTimePicker(!showTimePicker)}
        >
          <ThemeIcon name="clock" size={18} color={theme.primary} />
          <Text style={[styles.timeButtonText, { color: theme.text }]}>{formatTimeLabel(time)}</Text>
        </Pressable>
        {showTimePicker && (
          <View style={[styles.timePickerBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <ScrollView style={styles.timeScroll} nestedScrollEnabled>
              {TIME_OPTIONS.map((t) => (
                <Pressable
                  key={t}
                  style={[styles.timeOption, time === t && { backgroundColor: theme.primary + '22' }]}
                  onPress={() => { setTime(t); setShowTimePicker(false); }}
                >
                  <Text style={[styles.timeOptionText, { color: time === t ? theme.primary : theme.text }]}>{formatTimeLabel(t)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <Text style={[styles.label, { color: theme.text, marginTop: 16 }]}>How long</Text>
        <View style={styles.durationRow}>
          {DURATION_OPTIONS.map((d) => (
            <Pressable
              key={d}
              style={[styles.durationChip, { backgroundColor: durationMinutes === d ? theme.primary + '22' : theme.background, borderColor: durationMinutes === d ? theme.primary : theme.border }]}
              onPress={() => setDurationMinutes(d)}
            >
              <Text style={[styles.durationChipText, { color: durationMinutes === d ? theme.primary : theme.textSecondary }]}>{d} min</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { color: theme.text, marginTop: 16 }]}>Topic to cover</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
          value={topic}
          onChangeText={setTopic}
          placeholder="e.g. Chapter 3, Past papers"
          placeholderTextColor={theme.textSecondary}
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.saveBtn, { backgroundColor: theme.primary }, pressed && styles.pressed]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={[styles.saveBtnText, { color: theme.textInverse }]}>{saving ? 'Saving…' : 'Save'}</Text>
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
  description: { fontSize: 14, lineHeight: 20, marginBottom: 28 },
  card: { borderRadius: 24, borderWidth: 1, padding: 20, marginBottom: 28 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 14, fontWeight: '700' },
  chipScroll: { marginTop: 10, marginHorizontal: -4 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, marginRight: 10 },
  chipText: { fontSize: 13, fontWeight: '700' },
  chipTextShort: { fontSize: 12 },
  repeatRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  repeatChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  inputDate: { marginTop: 10 },
  timeButton: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  timeButtonText: { fontSize: 16, fontWeight: '600' },
  timePickerBox: { marginTop: 8, borderRadius: 14, borderWidth: 1, maxHeight: 220 },
  timeScroll: { maxHeight: 216 },
  timeOption: { paddingHorizontal: 16, paddingVertical: 12 },
  timeOptionText: { fontSize: 15 },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  durationChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  durationChipText: { fontSize: 13, fontWeight: '700' },
  input: { marginTop: 10, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1, fontSize: 16 },
  saveBtn: { paddingVertical: 16, borderRadius: 20, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.9 },
});
