import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Modal } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';
import { TaskType, Priority } from '@/src/types';
import { formatDisplayDate, getTodayISO, getMonthYearLabel, getMonthGrid, toISO } from '@/src/utils/date';
import { SUBJECT_COLOR_OPTIONS } from '@/src/constants/subjectColors';
import { useTranslations } from '@/src/i18n';

const riskFromDiffDays = (diffDays: number): 'High' | 'Medium' | 'Low' => {
  if (diffDays <= 2) return 'High';
  if (diffDays <= 7) return 'Medium';
  return 'Low';
};

const riskToPriority = (risk: 'High' | 'Medium' | 'Low'): Priority => {
  if (risk === 'High') return Priority.High;
  if (risk === 'Low') return Priority.Low;
  return Priority.Medium;
};

export default function AddTask() {
  const { courses, addTask, getSubjectColor, setSubjectColor, language, user } = useApp();
  const T = useTranslations(language);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [type, setType] = useState<TaskType>(TaskType.Assignment);
  const [dueDateISO, setDueDateISO] = useState<string>(getTodayISO());
  const [dueTime, setDueTime] = useState('23:59');
  const [priority, setPriority] = useState<Priority>(Priority.Medium);
  const [effort, setEffort] = useState(4);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const activeDate = dueDateISO;
  const activeYear = new Date(activeDate + 'T12:00:00').getFullYear();
  const activeMonth = new Date(activeDate + 'T12:00:00').getMonth();
  const monthGridCells = getMonthGrid(activeYear, activeMonth);

  const handleSubmit = () => {
    if (!title.trim()) return;
    setIsSaving(true);
    setTimeout(() => {
      // Compute deadline risk from due date vs today, then map to priority.
      const todayISO = getTodayISO();
      const today = new Date(todayISO + 'T00:00:00');
      const due = new Date(dueDateISO + 'T00:00:00');
      const diffDays = Math.floor((due.getTime() - today.getTime()) / 864e5);
      const deadlineRisk = riskFromDiffDays(diffDays);
      const resolvedPriority = riskToPriority(deadlineRisk);

      const newTask = {
        id: `t${Date.now()}`,
        title: title.trim(),
        courseId,
        type,
        dueDate: dueDateISO,
        dueTime,
        priority: resolvedPriority,
        effort,
        notes,
        isDone: false,
        deadlineRisk,
        suggestedWeek: (() => {
          if (!user?.startDate) return 1;
          const start = new Date(user.startDate + 'T00:00:00');
          const due = new Date(dueDateISO + 'T00:00:00');
          const diffDays = Math.floor((due.getTime() - start.getTime()) / 864e5);
          return Math.max(1, Math.ceil(diffDays / 7));
        })(),
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
          <Text style={styles.headerTitle}>{T('addNewTask')}</Text>
          <Text style={styles.headerSub}>{T('manualEntry')}</Text>
        </View>
      </View>

      <Text style={styles.label}>{T('taskTitleRequired')}</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Final Project Report"
        placeholderTextColor={COLORS.gray}
      />

      <Text style={styles.label}>{T('subjectLabel')}</Text>
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

      <Text style={styles.label}>{T('subjectColour')}</Text>
      <Pressable style={styles.colorRow} onPress={() => setShowColorPicker(true)}>
        <View style={[styles.colorSwatch, { backgroundColor: getSubjectColor(courseId) }]} />
        <Text style={styles.colorRowText}>{T('tapToChangeColour')} {courseId}</Text>
        <Icons.ArrowRight size={18} color={COLORS.gray} />
      </Pressable>

      <Modal visible={showColorPicker} transparent animationType="fade">
        <Pressable style={styles.colorModalBackdrop} onPress={() => setShowColorPicker(false)}>
          <View style={styles.colorModalPanel} onStartShouldSetResponder={() => true}>
            <Text style={styles.colorModalTitle}>{T('colourFor')} {courseId}</Text>
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
              <Text style={styles.colorCancelText}>{T('cancel')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Text style={styles.label}>{T('type')}</Text>
      <View style={styles.pickerRow}>
        {(Object.values(TaskType) as TaskType[]).map((t) => (
          <Pressable key={t} style={[styles.chip, type === t && styles.chipActive]} onPress={() => setType(t)}>
            <Text style={[styles.chipText, type === t && styles.chipTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>{T('dueDateLabel')}</Text>
          <Pressable
            style={styles.input}
            onPress={() => setShowDatePicker((v) => !v)}
          >
            <Text style={styles.dateText}>{formatDisplayDate(dueDateISO)}</Text>
          </Pressable>
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>{T('time')}</Text>
          <Pressable
            style={styles.input}
            onPress={() => setShowTimePicker(true)}
          >
            <Text style={styles.dateText}>{dueTime}</Text>
          </Pressable>
        </View>
      </View>

      {showDatePicker && (
        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <Text style={styles.calendarTitle}>{getMonthYearLabel(activeDate)}</Text>
          </View>
          <View style={styles.calendarWeekHeader}>
            {['S','M','T','W','T','F','S'].map((d, idx) => (
              <Text key={`${d}-${idx}`} style={styles.calendarWeekText}>{d}</Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {monthGridCells.map((d, idx) => {
              if (d == null) {
                return <View key={idx} style={styles.calendarCellEmpty} />;
              }
              const iso = toISO(activeYear, activeMonth, d);
              const isSelected = iso === dueDateISO;
              return (
                <Pressable
                  key={idx}
                  style={styles.calendarCell}
                  onPress={() => {
                    setDueDateISO(iso);
                    setShowDatePicker(false);
                  }}
                >
                  <View style={[styles.calendarDayBubble, isSelected && styles.calendarDayBubbleSelected]}>
                    <Text style={[styles.calendarCellText, isSelected && styles.calendarCellTextSelected]}>
                      {d}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <Text style={styles.label}>{T('priorityLabel')}</Text>
      <View style={styles.pickerRow}>
        {(Object.values(Priority) as Priority[]).map((p) => (
          <Pressable key={p} style={[styles.chip, priority === p && styles.chipActive]} onPress={() => setPriority(p)}>
            <Text style={[styles.chipText, priority === p && styles.chipTextActive]}>{p}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{T('estimatedEffort')} {effort} {T('hoursUnit')}</Text>
      <View style={styles.effortRow}>
        {[1, 2, 4, 6, 8, 12, 20].map((n) => (
          <Pressable key={n} style={[styles.effortChip, effort === n && styles.chipActive]} onPress={() => setEffort(n)}>
            <Text style={[styles.effortChipText, effort === n && styles.chipTextActive]}>{n}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{T('notesLabel')}</Text>
      <TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} placeholder={T('optional')} placeholderTextColor={COLORS.gray} multiline />

      <Pressable style={[styles.submit, (!title.trim() || isSaving) && styles.submitDisabled]} onPress={handleSubmit} disabled={!title.trim() || isSaving}>
        {isSaving ? (
          <View style={styles.savingRow}>
            <View style={styles.bounceDot} />
            <View style={[styles.bounceDot, styles.bounceDot2]} />
            <View style={[styles.bounceDot, styles.bounceDot3]} />
            <Text style={styles.submitText}>{T('addingTask')}</Text>
          </View>
        ) : (
          <>
            <Icons.Plus size={20} color={COLORS.white} />
            <Text style={styles.submitText}>{T('addTask')}</Text>
          </>
        )}
      </Pressable>
      <View style={{ height: 48 }} />

      {/* Time picker modal */}
      <Modal visible={showTimePicker} transparent animationType="fade">
        <Pressable style={styles.timeModalBackdrop} onPress={() => setShowTimePicker(false)}>
          <View style={styles.timeModalPanel} onStartShouldSetResponder={() => true}>
            <Text style={styles.timeModalTitle}>{T('time')}</Text>
            <View style={styles.timePickerRow}>
              <View style={styles.timeColumn}>
                <Text style={styles.timeColumnLabel}>HH</Text>
                <ScrollView style={styles.timeList}>
                  {Array.from({ length: 24 }, (_, h) => h).map((h) => {
                    const hh = String(h).padStart(2, '0');
                    const isActive = dueTime.slice(0, 2) === hh;
                    return (
                      <Pressable
                        key={hh}
                        style={[styles.timeItem, isActive && styles.timeItemActive]}
                        onPress={() => {
                          setDueTime(`${hh}:${dueTime.slice(3, 5) || '00'}`);
                        }}
                      >
                        <Text style={[styles.timeItemText, isActive && styles.timeItemTextActive]}>{hh}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={styles.timeColumn}>
                <Text style={styles.timeColumnLabel}>MM</Text>
                <ScrollView style={styles.timeList}>
                  {Array.from({ length: 60 }, (_, m) => m).map((m) => {
                    const mm = String(m).padStart(2, '0');
                    const isActive = dueTime.slice(3, 5) === mm;
                    return (
                      <Pressable
                        key={mm}
                        style={[styles.timeItem, isActive && styles.timeItemActive]}
                        onPress={() => {
                          setDueTime(`${dueTime.slice(0, 2) || '00'}:${mm}`);
                        }}
                      >
                        <Text style={[styles.timeItemText, isActive && styles.timeItemTextActive]}>{mm}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
            <Pressable style={styles.timeDoneBtn} onPress={() => setShowTimePicker(false)}>
              <Text style={styles.timeDoneText}>{T('done')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
  dateText: { fontSize: 15, fontWeight: '600', color: COLORS.text },

  calendarCard: {
    marginTop: -12,
    marginBottom: L.section,
    backgroundColor: COLORS.card,
    borderRadius: L.radiusSm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
  },
  calendarHeader: { alignItems: 'center', marginBottom: 8 },
  calendarTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  calendarWeekHeader: { flexDirection: 'row', marginBottom: 4 },
  calendarWeekText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.gray,
  },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCellEmpty: { width: '14.28%', aspectRatio: 1 },
  calendarCellText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  calendarCellTextSelected: { color: COLORS.white, fontWeight: '800' },
  calendarDayBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayBubbleSelected: {
    backgroundColor: COLORS.navy,
  },

  timeModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  timeModalPanel: { backgroundColor: COLORS.card, borderRadius: 20, padding: 20 },
  timeModalTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  timePickerRow: { flexDirection: 'row', gap: 12 },
  timeColumn: { flex: 1 },
  timeColumnLabel: { fontSize: 11, fontWeight: '700', color: COLORS.gray, marginBottom: 6 },
  timeList: { maxHeight: 160 },
  timeItem: {
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 4,
    backgroundColor: COLORS.bg,
  },
  timeItemActive: {
    backgroundColor: COLORS.navy,
  },
  timeItemText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  timeItemTextActive: { color: COLORS.white },
  timeDoneBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
  },
  timeDoneText: { fontSize: 14, fontWeight: '800', color: COLORS.white },
});
