import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';
import { useAppContext } from '../src/context/AppContext';
import { TaskType, Priority } from '../src/types';

export default function AddTaskScreen() {
  const router = useRouter();
  const { courses, addTask } = useAppContext();

  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState(courses[0]?.id || '');
  const [type, setType] = useState<TaskType>(TaskType.Assignment);
  const [priority, setPriority] = useState<Priority>(Priority.Medium);
  const [dueDate, setDueDate] = useState('2024-12-30');
  const [dueTime, setDueTime] = useState('23:59');
  const [effort, setEffort] = useState(4);
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    const task = {
      id: `t${Date.now()}`,
      title: title || 'Untitled Task',
      courseId: subjectId,
      type,
      dueDate,
      dueTime,
      priority,
      effort,
      notes,
      isDone: false,
      deadlineRisk: 'Medium' as const,
      suggestedWeek: 11,
    };
    addTask(task);
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={COLORS.navy} />
        </Pressable>
        <Text style={styles.headerTitle}>Add New Task</Text>
        <Text style={styles.headerSub}>Manual Entry</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          style={styles.input}
          placeholder="Task title"
          placeholderTextColor={COLORS.textSecondary}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Subject</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
          {courses.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.pickerChip, subjectId === c.id && styles.pickerChipActive]}
              onPress={() => setSubjectId(c.id)}
            >
              <Text style={[styles.pickerChipText, subjectId === c.id && styles.pickerChipTextActive]}>
                {c.id}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>Type & Priority</Text>
        <View style={styles.row}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
            {(Object.values(TaskType) as TaskType[]).map((t) => (
              <Pressable
                key={t}
                style={[styles.pickerChip, type === t && styles.pickerChipActive]}
                onPress={() => setType(t)}
              >
                <Text style={[styles.pickerChipText, type === t && styles.pickerChipTextActive]}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
            {(Object.values(Priority) as Priority[]).map((p) => (
              <Pressable
                key={p}
                style={[styles.pickerChip, priority === p && styles.pickerChipActive]}
                onPress={() => setPriority(p)}
              >
                <Text style={[styles.pickerChipText, priority === p && styles.pickerChipTextActive]}>
                  {p}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <Text style={styles.label}>Due Date & Time</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.halfInput]}
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="YYYY-MM-DD"
          />
          <TextInput
            style={[styles.input, styles.halfInput]}
            value={dueTime}
            onChangeText={setDueTime}
            placeholder="HH:MM"
          />
        </View>

        <Text style={styles.label}>Effort (hours): {effort}</Text>
        <View style={styles.sliderRow}>
          <View style={styles.sliderTrack}>
            <View style={[styles.sliderFill, { width: `${(effort / 12) * 100}%` }]} />
          </View>
          <View style={styles.sliderLabels}>
            {[1, 4, 8, 12].map((v) => (
              <Pressable key={v} onPress={() => setEffort(v)}>
                <Text style={styles.sliderLabel}>{v}h</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Optional notes..."
          placeholderTextColor={COLORS.textSecondary}
          multiline
          value={notes}
          onChangeText={setNotes}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitBtnText}>Add Task</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  backBtn: { padding: 4, marginRight: 12 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.navy,
  },
  headerSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 8,
    marginTop: 4,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },

  input: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  halfInput: {
    flex: 1,
    marginHorizontal: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  row: { marginBottom: 16 },
  pickerRow: { marginBottom: 12 },
  pickerChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
  },
  pickerChipActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  pickerChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  pickerChipTextActive: {
    color: COLORS.white,
  },

  sliderRow: { marginBottom: 24 },
  sliderTrack: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  sliderFill: {
    height: '100%',
    backgroundColor: COLORS.gold,
    borderRadius: 4,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  submitBtn: {
    backgroundColor: COLORS.navy,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
});
