import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';
import { useAppContext } from '../src/context/AppContext';
import { Note } from '../src/types';

const TAGS = ['Lecture', 'Tutorial', 'Exam', 'Important'] as const;

const HARDCODED_FLASHCARDS = [
  { id: 'f1', question: 'What does MVC stand for?', answer: 'Model-View-Controller' },
  { id: 'f2', question: 'What is the role of Controller?', answer: 'Handles input and updates model' },
  { id: 'f3', question: 'What annotation for OneToMany?', answer: '@OneToMany' },
];

export default function NotesEditorScreen() {
  const router = useRouter();
  const { selectedNote, selectedSubjectId, saveNote, setFlashcards } = useAppContext();
  const [tag, setTag] = useState<typeof TAGS[number]>(selectedNote?.tag || 'Lecture');
  const [title, setTitle] = useState(selectedNote?.title || '');
  const [content, setContent] = useState(selectedNote?.content || '');

  const handleSave = () => {
    const note: Note = {
      id: selectedNote?.id || `n${Date.now()}`,
      subjectId: selectedSubjectId || '',
      title,
      content,
      tag,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    saveNote(note);
    router.back();
  };

  const handleCards = () => {
    setFlashcards((prev) => [...HARDCODED_FLASHCARDS, ...prev]);
    router.push('/flashcard-review');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={COLORS.navy} />
        </Pressable>
        <Pressable style={styles.cardsBtn} onPress={handleCards}>
          <Text style={styles.cardsBtnText}>Cards</Text>
        </Pressable>
        <Pressable style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tagRow}
        >
          {TAGS.map((t) => (
            <Pressable
              key={t}
              style={[styles.tagPill, tag === t && styles.tagPillActive]}
              onPress={() => setTag(t)}
            >
              <Text style={[styles.tagPillText, tag === t && styles.tagPillTextActive]}>
                {t}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <TextInput
          style={styles.titleInput}
          placeholder="Note title"
          placeholderTextColor={COLORS.textSecondary}
          value={title}
          onChangeText={setTitle}
        />

        <TextInput
          style={styles.contentInput}
          placeholder="Write your notes here..."
          placeholderTextColor={COLORS.textSecondary}
          value={content}
          onChangeText={setContent}
          multiline
        />

        <View style={styles.aiBox}>
          <Feather name="zap" size={20} color={COLORS.gold} />
          <View style={styles.aiTextWrap}>
            <Text style={styles.aiTitle}>AI Synthesis Hub</Text>
            <Text style={styles.aiDesc}>
              Save your note to generate flashcards and quiz questions automatically.
            </Text>
          </View>
        </View>
      </ScrollView>
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
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 8, marginRight: 8 },
  cardsBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.gold,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
  },
  cardsBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  saveBtn: {
    marginLeft: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  tagRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  tagPill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tagPillActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  tagPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tagPillTextActive: {
    color: COLORS.white,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.navy,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  contentInput: {
    fontSize: 16,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    minHeight: 200,
    textAlignVertical: 'top',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  aiBox: {
    flexDirection: 'row',
    backgroundColor: COLORS.navy,
    borderRadius: 24,
    padding: 20,
    alignItems: 'flex-start',
    gap: 16,
  },
  aiTextWrap: { flex: 1 },
  aiTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.gold,
    marginBottom: 4,
  },
  aiDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
  },
});
