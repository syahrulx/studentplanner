import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import type { Course } from '@/src/types';
import { SUBJECT_COLOR_OPTIONS } from '@/src/constants/subjectColors';

const PAD = 20;
const RADIUS = 16;
const DEFAULT_WORKLOAD = [2, 3, 4, 6, 5, 7, 8, 4, 6, 8, 10, 9, 10, 4];

export default function AddSubjectScreen() {
  const theme = useTheme();
  const { courses, addCourse, setSubjectColor, getSubjectColor } = useApp();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>(SUBJECT_COLOR_OPTIONS[0]);

  const previewCode = code.trim().toUpperCase() || 'SUBJECT';

  const handleAdd = () => {
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();
    setError(null);
    if (!trimmedCode) {
      setError('Subject code is required');
      return;
    }
    if (!trimmedName) {
      setError('Subject name is required');
      return;
    }
    const exists = courses.some((c) => c.id.toUpperCase() === trimmedCode);
    if (exists) {
      setError('This subject code already exists');
      return;
    }
    const newCourse: Course = {
      id: trimmedCode,
      name: trimmedName,
      creditHours: 3,
      workload: DEFAULT_WORKLOAD,
    };
    addCourse(newCourse);
    // Save chosen colour immediately for this subject
    setSubjectColor(trimmedCode, selectedColor || getSubjectColor(trimmedCode));
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.8 }]}
          >
            <Feather name="chevron-left" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>Add subject</Text>
        </View>

        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Add a new subject to organise notes and flashcards.
        </Text>

        <View style={[styles.fieldWrap, { borderColor: theme.border }]}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Subject code</Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
            placeholder="e.g. CSC101"
            placeholderTextColor={theme.textSecondary}
            value={code}
            onChangeText={(t) => { setCode(t); setError(null); }}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
        <View style={[styles.fieldWrap, { borderColor: theme.border }]}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Subject name</Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
            placeholder="e.g. Introduction to Programming"
            placeholderTextColor={theme.textSecondary}
            value={name}
            onChangeText={(t) => { setName(t); setError(null); }}
          />
        </View>

        <View style={[styles.fieldWrap, { borderColor: theme.border }]}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Subject colour</Text>
          <Pressable
            onPress={() => setShowColorPicker(true)}
            style={({ pressed }) => [
              styles.colorRow,
              { backgroundColor: theme.card, borderColor: theme.border },
              pressed && { opacity: 0.9 },
            ]}
          >
            <View style={[styles.colorSwatch, { backgroundColor: selectedColor }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.colorRowTitle, { color: theme.text }]}>{previewCode}</Text>
              <Text style={[styles.colorRowSub, { color: theme.textSecondary }]}>{selectedColor}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>

        {error ? (
          <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
        ) : null}

        <Pressable
          onPress={handleAdd}
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: theme.primary },
            pressed && { opacity: 0.9 },
          ]}
        >
          <Text style={styles.addBtnText}>Add subject</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={showColorPicker} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setShowColorPicker(false)}>
          <View style={[styles.modalPanel, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Choose colour</Text>
            <View style={styles.colorGrid}>
              {SUBJECT_COLOR_OPTIONS.map((c) => (
                <Pressable
                  key={c}
                  style={[
                    styles.colorOption,
                    { backgroundColor: c },
                    c === selectedColor && styles.colorOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedColor(c);
                    setShowColorPicker(false);
                  }}
                />
              ))}
            </View>
            <Pressable style={[styles.modalCancel, { borderColor: theme.border }]} onPress={() => setShowColorPicker(false)}>
              <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: PAD, paddingTop: 56, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  hint: { fontSize: 14, marginBottom: 24, lineHeight: 20 },
  fieldWrap: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 8, letterSpacing: 0.3 },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: RADIUS,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  colorSwatch: { width: 26, height: 26, borderRadius: 13 },
  colorRowTitle: { fontSize: 14, fontWeight: '800' },
  colorRowSub: { marginTop: 2, fontSize: 12, fontWeight: '600' },
  error: { fontSize: 13, marginBottom: 12, fontWeight: '600' },
  addBtn: {
    paddingVertical: 16,
    borderRadius: RADIUS,
    alignItems: 'center',
    marginTop: 8,
  },
  addBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalPanel: { borderRadius: 24, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 18 },
  colorOption: { width: 44, height: 44, borderRadius: 22 },
  colorOptionSelected: { borderWidth: 3, borderColor: '#003366' },
  modalCancel: { paddingVertical: 12, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '700' },
});
