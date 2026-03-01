import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import type { Course } from '@/src/types';

const PAD = 20;
const RADIUS = 16;
const DEFAULT_WORKLOAD = [2, 3, 4, 6, 5, 7, 8, 4, 6, 8, 10, 9, 10, 4];

export default function AddSubjectScreen() {
  const theme = useTheme();
  const { courses, addCourse } = useApp();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

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
  error: { fontSize: 13, marginBottom: 12, fontWeight: '600' },
  addBtn: {
    paddingVertical: 16,
    borderRadius: RADIUS,
    alignItems: 'center',
    marginTop: 8,
  },
  addBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
