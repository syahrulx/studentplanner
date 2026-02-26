import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Modal } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';
import { TaskType, Priority } from '@/src/types';
import { formatDisplayDate, parseDisplayDate } from '@/src/utils/date';
import { SUBJECT_COLOR_OPTIONS } from '@/src/constants/subjectColors';

export default function AddTask() {
  const { courses, addTask, getSubjectColor, setSubjectColor } = useApp();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [type, setType] = useState<TaskType>(TaskType.Assignment);
  const [dueDate, setDueDate] = useState(formatDisplayDate('2025-01-15'));
  const [dueTime, setDueTime] = useState('23:59');
  const [priority, setPriority] = useState<Priority>(Priority.Medium);
  const [effort, setEffort] = useState(4);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = () => {
    if (!title.trim()) return;
    const isoDate = parseDisplayDate(dueDate) ?? dueDate;
    setIsSaving(true);
    setTimeout(() => {
    const newTask = {
      id: `t${Date.now()}`,
      title: title.trim(),
      courseId,
      type,
      dueDate: isoDate,
      dueTime,
      priority,
      effort,
      notes,
      isDone: false,
      deadlineRisk: priority === Priority.High ? 'High' as const : priority === Priority.Medium ? 'Medium' as const : 'Low' as const,
      suggestedWeek: 12,
    };
    addTask(newTask);
    router.back();
    }, 800);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icons.ArrowRight size={20} color={COLORS.gray} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Add New Task</Text>
          <Text style={styles.headerSub}>Manual Entry</Text>
        </View>
      </View>

      <Text style={styles.label}>Task title *</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Final Project Report"
        placeholderTextColor={COLORS.gray}
      />

      <Text style={styles.label}>Subject</Text>
      <View style={styles.pickerRow}>
        {courses.map((c) => (
          <Pressable
            key={c.id}
            style={[styles.chip, courseId === c.id && styles.chipActive]}
            onPress={() => setCourseId(c.id)}
          >
            <Text style={[styles.chipText, courseId === c.id && styles.chipTextActive]}>{c.id}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Subject colour</Text>
      <Pressable style={styles.colorRow} onPress={() => setShowColorPicker(true)}>
        <View style={[styles.colorSwatch, { backgroundColor: getSubjectColor(courseId) }]} />
        <Text style={styles.colorRowText}>Tap to change colour for {courseId}</Text>
        <Icons.ArrowRight size={18} color={COLORS.gray} />
      </Pressable>

      <Modal visible={showColorPicker} transparent animationType="fade">
        <Pressable style={styles.colorModalBackdrop} onPress={() => setShowColorPicker(false)}>
          <View style={styles.colorModalPanel} onStartShouldSetResponder={() => true}>
            <Text style={styles.colorModalTitle}>Colour for {courseId}</Text>
            <View style={styles.colorGrid}>
              {SUBJECT_COLOR_OPTIONS.map((color) => (
                <Pressable
                  key={color}
                  style={[styles.colorOption, { backgroundColor: color }, getSubjectColor(courseId) === color && styles.colorOptionSelected]}
                  onPress={() => {
                    setSubjectColor(courseId, color);
                    setShowColorPicker(false);
                  }}
                />
              ))}
            </View>
            <Pressable style={styles.colorCancelBtn} onPress={() => setShowColorPicker(false)}>
              <Text style={styles.colorCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Text style={styles.label}>Type</Text>
      <View style={styles.pickerRow}>
        {(Object.values(TaskType) as TaskType[]).map((t) => (
          <Pressable key={t} style={[styles.chip, type === t && styles.chipActive]} onPress={() => setType(t)}>
            <Text style={[styles.chipText, type === t && styles.chipTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Due date</Text>
          <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} placeholder="DD-MM-YYYY" placeholderTextColor={COLORS.gray} />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Time</Text>
          <TextInput style={styles.input} value={dueTime} onChangeText={setDueTime} placeholder="23:59" placeholderTextColor={COLORS.gray} />
        </View>
      </View>

      <Text style={styles.label}>Priority</Text>
      <View style={styles.pickerRow}>
        {(Object.values(Priority) as Priority[]).map((p) => (
          <Pressable key={p} style={[styles.chip, priority === p && styles.chipActive]} onPress={() => setPriority(p)}>
            <Text style={[styles.chipText, priority === p && styles.chipTextActive]}>{p}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Estimated Effort: {effort} hours</Text>
      <View style={styles.effortRow}>
        {[1, 2, 4, 6, 8, 12, 20].map((n) => (
          <Pressable key={n} style={[styles.effortChip, effort === n && styles.chipActive]} onPress={() => setEffort(n)}>
            <Text style={[styles.effortChipText, effort === n && styles.chipTextActive]}>{n}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Notes</Text>
      <TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} placeholder="Optional" placeholderTextColor={COLORS.gray} multiline />

      <Pressable style={[styles.submit, (!title.trim() || isSaving) && styles.submitDisabled]} onPress={handleSubmit} disabled={!title.trim() || isSaving}>
        {isSaving ? (
          <View style={styles.savingRow}>
            <View style={styles.bounceDot} />
            <View style={[styles.bounceDot, styles.bounceDot2]} />
            <View style={[styles.bounceDot, styles.bounceDot3]} />
            <Text style={styles.submitText}>Adding Task...</Text>
          </View>
        ) : (
          <>
            <Icons.Plus size={20} color={COLORS.white} />
            <Text style={styles.submitText}>Add Task</Text>
          </>
        )}
      </Pressable>
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

// Layout: same as Planner/Task details – pad 20, section 24, card 20, radius 20/12
const L = { pad: 20, section: 24, cardPad: 20, radius: 20, radiusSm: 12 };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: L.pad, paddingTop: 56, paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: L.section },
  backBtn: { width: 44, height: 44, borderRadius: L.radiusSm, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  headerTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  headerSub: { fontSize: 11, color: COLORS.gray, fontWeight: '600', marginTop: 4 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.gray, marginBottom: 8 },
  input: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: L.radiusSm, padding: 14, fontSize: 15, marginBottom: L.section, color: COLORS.text },
  textArea: { minHeight: 96, paddingTop: 14 },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: L.section },
  chip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: L.radiusSm, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: COLORS.white },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  submit: { backgroundColor: COLORS.navy, paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: L.section, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: COLORS.white, fontSize: 15, fontWeight: '800' },
  effortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: L.section },
  effortChip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: L.radiusSm, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  effortChipText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bounceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.card },
  bounceDot2: { opacity: 0.7 },
  bounceDot3: { opacity: 0.4 },
  colorRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: L.radiusSm, padding: 14, marginBottom: L.section },
  colorSwatch: { width: 28, height: 28, borderRadius: 14, marginRight: 12 },
  colorRowText: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text },
  colorModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  colorModalPanel: { backgroundColor: COLORS.card, borderRadius: 20, padding: 24 },
  colorModalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 20 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  colorOption: { width: 44, height: 44, borderRadius: 22 },
  colorOptionSelected: { borderWidth: 3, borderColor: COLORS.navy },
  colorCancelBtn: { paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  colorCancelText: { fontSize: 15, fontWeight: '700', color: COLORS.gray },
});
