import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, Alert } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import type { AcademicLevel } from '@/src/types';
import { getTodayISO } from '@/src/utils/date';

const LEVELS: AcademicLevel[] = ['Foundation', 'Diploma', 'Bachelor', 'Master', 'PhD', 'Other'];
const PAD = 20;

export default function AcademicSetup() {
  const { user, academicCalendar, updateProfile, updateAcademicCalendar } = useApp();
  const [university, setUniversity] = useState(user.university ?? '');
  const [academicLevel, setAcademicLevel] = useState<AcademicLevel>(user.academicLevel ?? 'Bachelor');
  const [semesterLabel, setSemesterLabel] = useState(academicCalendar?.semesterLabel ?? 'Semester 1 2026');
  const [startDate, setStartDate] = useState(academicCalendar?.startDate ?? user.startDate ?? getTodayISO());
  const [endDate, setEndDate] = useState(academicCalendar?.endDate ?? '');
  const [totalWeeks, setTotalWeeks] = useState(String(academicCalendar?.totalWeeks ?? 14));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUniversity(user.university ?? '');
    setAcademicLevel(user.academicLevel ?? 'Bachelor');
  }, [user.university, user.academicLevel]);
  useEffect(() => {
    if (academicCalendar) {
      setSemesterLabel(academicCalendar.semesterLabel);
      setStartDate(academicCalendar.startDate);
      setEndDate(academicCalendar.endDate);
      setTotalWeeks(String(academicCalendar.totalWeeks));
    }
  }, [academicCalendar?.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ university: university.trim() || undefined, academicLevel });
      const weeks = Math.max(6, Math.min(24, parseInt(totalWeeks, 10) || 14));
      let finalEnd = endDate.trim();
      if (!finalEnd) {
        const d = new Date(startDate + 'T12:00:00');
        d.setDate(d.getDate() + weeks * 7 - 1);
        finalEnd = d.toISOString().slice(0, 10);
      }
      await updateAcademicCalendar({
        semesterLabel: semesterLabel.trim() || 'Semester',
        startDate,
        endDate: finalEnd,
        totalWeeks: weeks,
        isActive: true,
      });
      Alert.alert('Saved', 'Academic level and semester dates saved. SOW intelligence will use these.');
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={24} color="#0f172a" />
        </Pressable>
        <Text style={s.title}>Academic & SOW</Text>
      </View>
      <Text style={s.hint}>Used for SOW intelligence and semester week calculation. Stored in your account.</Text>

      <Text style={s.section}>University / School</Text>
      <TextInput
        style={s.input}
        value={university}
        onChangeText={setUniversity}
        placeholder="e.g. UiTM, UKM"
        placeholderTextColor="#94a3b8"
      />

      <Text style={s.section}>Level</Text>
      <View style={s.levelRow}>
        {LEVELS.map((level) => (
          <Pressable
            key={level}
            style={[s.levelChip, academicLevel === level && s.levelChipActive]}
            onPress={() => setAcademicLevel(level)}
          >
            <Text style={[s.levelText, academicLevel === level && s.levelTextActive]}>{level}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.section}>Semester (academic calendar)</Text>
      <TextInput
        style={s.input}
        value={semesterLabel}
        onChangeText={setSemesterLabel}
        placeholder="e.g. Semester 1 2026"
        placeholderTextColor="#94a3b8"
      />
      <Text style={s.label}>Start date (YYYY-MM-DD)</Text>
      <TextInput
        style={s.input}
        value={startDate}
        onChangeText={setStartDate}
        placeholder="2026-03-02"
        placeholderTextColor="#94a3b8"
      />
      <Text style={s.label}>End date (optional)</Text>
      <TextInput
        style={s.input}
        value={endDate}
        onChangeText={setEndDate}
        placeholder="2026-06-15"
        placeholderTextColor="#94a3b8"
      />
      <Text style={s.label}>Total weeks in semester (6–24)</Text>
      <TextInput
        style={s.input}
        value={totalWeeks}
        onChangeText={setTotalWeeks}
        keyboardType="number-pad"
        placeholder="14"
        placeholderTextColor="#94a3b8"
      />

      <Pressable style={[s.saveBtn, saving && s.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
        <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save to account'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: PAD, paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backBtn: { padding: 8, marginRight: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  hint: { fontSize: 13, color: '#64748b', marginBottom: 24 },
  section: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 10 },
  label: { fontSize: 12, color: '#64748b', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
  },
  levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  levelChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  levelChipActive: { backgroundColor: '#003366' },
  levelText: { fontSize: 14, fontWeight: '500', color: '#475569' },
  levelTextActive: { color: '#fff' },
  saveBtn: {
    marginTop: 32,
    backgroundColor: '#003366',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
