import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { SUBJECT_COLOR_OPTIONS } from '@/src/constants/subjectColors';

export default function SubjectColorsScreen() {
  const { courses, tasks, getSubjectColor, setSubjectColor } = useApp();
  const theme = useTheme();
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  const subjectIds = useMemo(() => {
    const fromCourses = new Set(courses.map((c) => c.id));
    tasks.forEach((t) => fromCourses.add(t.courseId));
    return Array.from(fromCourses).sort();
  }, [courses, tasks]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ThemeIcon name="arrowRight" size={22} color={theme.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Subject colours</Text>
      </View>
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        Choose a colour for each subject. Task cards will use this colour so you can tell subjects apart.
      </Text>
      <View style={styles.list}>
        {subjectIds.map((courseId) => (
          <Pressable
            key={courseId}
            style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => setPickingFor(courseId)}
          >
            <View style={[styles.swatch, { backgroundColor: getSubjectColor(courseId) }]} />
            <Text style={[styles.subjectId, { color: theme.text }]}>{courseId}</Text>
            <ThemeIcon name="arrowRight" size={18} color={theme.textSecondary} />
          </Pressable>
        ))}
      </View>

      <Modal visible={pickingFor !== null} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setPickingFor(null)}>
          <View style={[styles.modalPanel, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Colour for {pickingFor}
            </Text>
            <View style={styles.colorGrid}>
              {SUBJECT_COLOR_OPTIONS.map((color) => (
                <Pressable
                  key={color}
                  style={[styles.colorOption, { backgroundColor: color }, pickingFor && getSubjectColor(pickingFor) === color && styles.colorOptionSelected]}
                  onPress={() => {
                    if (pickingFor) setSubjectColor(pickingFor, color);
                    setPickingFor(null);
                  }}
                />
              ))}
            </View>
            <Pressable style={[styles.cancelBtn, { borderColor: theme.border }]} onPress={() => setPickingFor(null)}>
              <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: { padding: 8, marginLeft: -8 },
  title: { fontSize: 20, fontWeight: '800', marginLeft: 8 },
  description: { fontSize: 13, lineHeight: 20, marginBottom: 24 },
  list: { gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
  },
  swatch: { width: 28, height: 28, borderRadius: 14, marginRight: 14 },
  subjectId: { flex: 1, fontSize: 16, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalPanel: { borderRadius: 24, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 20 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  colorOption: { width: 44, height: 44, borderRadius: 22 },
  colorOptionSelected: { borderWidth: 3, borderColor: '#1a2e26' },
  cancelBtn: { paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '700' },
});
