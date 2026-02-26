import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';

export default function NotesEditor() {
  const { subjectId, noteId } = useLocalSearchParams<{ subjectId: string; noteId?: string }>();
  const { notes, handleSaveNote, courses } = useApp();
  const existing = noteId ? notes.find((n) => n.id === noteId) : null;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [content, setContent] = useState(existing?.content ?? '');

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setContent(existing.content);
    }
  }, [noteId]);

  const onSave = () => {
    const note = {
      id: existing?.id ?? `n${Date.now()}`,
      subjectId: subjectId!,
      title: title.trim() || 'Untitled',
      content: content.trim(),
      tag: 'Lecture' as const,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    handleSaveNote(note);
    router.back();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icons.ArrowRight size={20} color={COLORS.gray} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <Text style={styles.title}>{existing ? 'Edit note' : 'New note'}</Text>
      </View>
      <TextInput style={styles.inputTitle} value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={COLORS.gray} />
      <TextInput style={styles.inputContent} value={content} onChangeText={setContent} placeholder="Content..." placeholderTextColor={COLORS.gray} multiline />
      <Pressable style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed]} onPress={onSave}>
        <Text style={styles.saveBtnText}>Save</Text>
      </Pressable>
      <Pressable style={styles.cardsBtn} onPress={() => router.push('/flashcard-review' as any)}>
        <Icons.Layers size={20} color={COLORS.navy} />
        <Text style={styles.cardsBtnText}>Flashcards</Text>
      </Pressable>
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 24, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  inputTitle: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, fontSize: 18, fontWeight: '700', marginBottom: 16, color: COLORS.text },
  inputContent: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, fontSize: 16, minHeight: 200, marginBottom: 24, color: COLORS.text },
  saveBtn: { backgroundColor: COLORS.navy, paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginBottom: 12 },
  pressed: { opacity: 0.95 },
  saveBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '800' },
  cardsBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
  cardsBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
});
