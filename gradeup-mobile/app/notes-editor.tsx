import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Modal, ActivityIndicator, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';
import { generateFlashcardsFromNote, getOpenAIKey } from '@/src/lib/studyApi';
import { ensureNoteAttachmentsBucket, uploadNoteAttachment } from '@/src/lib/noteStorage';
import { supabase } from '@/src/lib/supabase';
import { useTranslations } from '@/src/i18n';

export default function NotesEditor() {
  const { subjectId, noteId } = useLocalSearchParams<{ subjectId: string; noteId?: string }>();
  const { notes, handleSaveNote, courses, flashcardFolders, addFlashcard, language } = useApp();
  const T = useTranslations(language);
  const existing = noteId ? notes.find((n) => n.id === noteId) : null;
  const [currentNoteId, setCurrentNoteId] = useState<string | undefined>(existing?.id);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [content, setContent] = useState(existing?.content ?? '');
  const [attachmentPath, setAttachmentPath] = useState<string | undefined>(existing?.attachmentPath);
  const [attachmentFileName, setAttachmentFileName] = useState<string | undefined>(existing?.attachmentFileName);
  const [attachLoading, setAttachLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generatedCards, setGeneratedCards] = useState<{ front: string; back: string }[] | null>(null);
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [tag, setTag] = useState<'Lecture' | 'Tutorial' | 'Exam' | 'Important'>(
    existing?.tag === 'Tutorial' || existing?.tag === 'Exam' || existing?.tag === 'Important'
      ? existing.tag
      : 'Lecture'
  );

  useEffect(() => {
    if (existing) {
      setCurrentNoteId(existing.id);
      setTitle(existing.title);
      setContent(existing.content);
      setAttachmentPath(existing.attachmentPath);
      setAttachmentFileName(existing.attachmentFileName);
      if (existing.tag === 'Tutorial' || existing.tag === 'Exam' || existing.tag === 'Important' || existing.tag === 'Lecture') {
        setTag(existing.tag);
      }
    }
  }, [noteId]);

  const onSave = () => {
    const note = {
      id: currentNoteId ?? existing?.id ?? `n${Date.now()}`,
      subjectId: subjectId!,
      title: title.trim() || 'Untitled',
      content: content.trim(),
      tag,
      updatedAt: new Date().toISOString().slice(0, 10),
      attachmentPath,
      attachmentFileName,
    };
    handleSaveNote(note);
    router.back();
  };

  const handleSelectTag = (nextTag: 'Lecture' | 'Tutorial' | 'Exam' | 'Important') => {
    setTag(nextTag);
    const match = notes.find(
      (n) => n.subjectId === subjectId && n.tag === nextTag
    );
    if (match) {
      setCurrentNoteId(match.id);
      setTitle(match.title);
      setContent(match.content);
      setAttachmentPath(match.attachmentPath);
      setAttachmentFileName(match.attachmentFileName);
      setIsEditing(false);
    } else {
      setCurrentNoteId(undefined);
      setTitle('');
      setContent('');
      setAttachmentPath(undefined);
      setAttachmentFileName(undefined);
      setIsEditing(true);
    }
  };

  const handleAttachFile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      Alert.alert('Sign in required', 'Sign in to attach files to notes.');
      return;
    }
    setAttachLoading(true);
    try {
      await ensureNoteAttachmentsBucket();
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) {
        setAttachLoading(false);
        return;
      }
      const file = result.assets[0];
      const noteIdForPath = existing?.id ?? `n${Date.now()}`;
      const name = file.name ?? `attachment-${Date.now()}`;
      const { path, error } = await uploadNoteAttachment(
        session.user.id,
        noteIdForPath,
        file.uri,
        name,
        file.mimeType ?? undefined
      );
      if (error) {
        Alert.alert('Upload failed', error.message);
        return;
      }
      setAttachmentPath(path);
      setAttachmentFileName(name);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not attach file');
    } finally {
      setAttachLoading(false);
    }
  };

  const handleGenerateFlashcards = async () => {
    const text = content.trim();
    if (!text) return;
    const hasKey = !!getOpenAIKey();
    if (!hasKey) {
      setGeneratedCards([]);
      setFolderModalVisible(true);
      return;
    }
    setGenerateLoading(true);
    setGeneratedCards(null);
    try {
      const cards = await generateFlashcardsFromNote(text);
      setGeneratedCards(cards);
      setFolderModalVisible(true);
    } finally {
      setGenerateLoading(false);
    }
  };

  const addGeneratedToFolder = (folderId: string) => {
    if (!generatedCards?.length) {
      setFolderModalVisible(false);
      return;
    }
    generatedCards.forEach((c) => addFlashcard(folderId, c.front, c.back));
    setGeneratedCards(null);
    setFolderModalVisible(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header: back + Cards + Save */}
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icons.ArrowRight size={18} color={COLORS.gray} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.headerChipLight}
            onPress={handleGenerateFlashcards}
            disabled={generateLoading}
          >
            <Icons.Layers size={14} color={COLORS.text} />
            <Text style={styles.headerChipLightText}>{T('cards')}</Text>
          </Pressable>
          <Pressable
            style={styles.headerChipLight}
            onPress={() => setIsEditing((prev) => !prev)}
          >
            <Feather name="edit-2" size={14} color={COLORS.text} />
            <Text style={styles.headerChipLightText}>{isEditing ? T('done') : T('edit')}</Text>
          </Pressable>
          <Pressable
            style={styles.headerChipPrimary}
            onPress={onSave}
          >
            <Text style={styles.headerChipPrimaryText}>{T('save')}</Text>
          </Pressable>
        </View>
      </View>

      {/* Note tag tabs */}
      <View style={styles.tagRow}>
        {(['Lecture', 'Tutorial', 'Exam', 'Important'] as const).map((tg) => {
          const isActive = tag === tg;
          const tagLabel = tg === 'Lecture' ? T('lecture') : tg === 'Tutorial' ? T('tutorial') : tg === 'Exam' ? T('exam') : T('important');
          return (
            <Pressable
              key={tg}
              onPress={() => handleSelectTag(tg)}
              hitSlop={8}
            >
              {isActive ? (
                <View style={styles.tagChipActive}>
                  <Text style={styles.tagChipActiveText}>{tagLabel}</Text>
                </View>
              ) : (
                <Text style={styles.tagChipMuted}>{tagLabel}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Note content */}
      {isEditing ? (
        <>
          <TextInput
            style={styles.noteTitleInput}
            value={title}
            onChangeText={setTitle}
            placeholder={T('noteTitle')}
            placeholderTextColor={COLORS.gray}
          />
          <TextInput
            style={styles.noteBodyInput}
            value={content}
            onChangeText={setContent}
            placeholder={T('startWriting')}
            placeholderTextColor={COLORS.gray}
            multiline
          />
        </>
      ) : (
        <>
          <Text style={styles.noteTitle}>{title || T('untitledNote')}</Text>
          <Text style={styles.noteBodyRead}>
            {content || T('startCapturing')}
          </Text>
        </>
      )}



      <Modal visible={folderModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setFolderModalVisible(false)}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {generatedCards?.length
                ? `Add ${generatedCards.length} card(s) to folder`
                : getOpenAIKey()
                  ? 'No flashcards generated. Add EXPO_PUBLIC_OPENAI_API_KEY and implement generateFlashcardsFromNote in src/lib/studyApi.ts'
                  : 'Add EXPO_PUBLIC_OPENAI_API_KEY to .env or app.config.js to generate flashcards with OpenAI.'}
            </Text>
            {generatedCards && generatedCards.length > 0 && (
              <>
                {flashcardFolders.length > 0 ? (
                  <ScrollView style={styles.folderList}>
                    {flashcardFolders.map((f) => (
                      <Pressable
                        key={f.id}
                        style={({ pressed }) => [styles.folderRow, pressed && styles.pressed]}
                        onPress={() => addGeneratedToFolder(f.id)}
                      >
                        <Text style={styles.folderRowText}>{f.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={styles.modalHint}>Create a folder in Flashcards first, then generate again.</Text>
                )}
              </>
            )}
            <Pressable style={[styles.modalClose, { borderColor: COLORS.border }]} onPress={() => setFolderModalVisible(false)}>
              <Text style={styles.modalCloseText}>{T('close')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerChipLight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerChipLightText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: COLORS.text,
  },
  headerChipPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.navy,
  },
  headerChipPrimaryText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: COLORS.white,
  },

  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingTop: 2,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingBottom: 8,
  },
  tagChipActive: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.card,
  },
  tagChipActiveText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: COLORS.text,
  },
  tagChipMuted: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: COLORS.gray,
  },

  noteTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  noteTitleInput: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 4,
  },
  noteBodyRead: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text,
    marginTop: 8,
    minHeight: 120,
  },
  noteBodyInput: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text,
    minHeight: 220,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    textAlignVertical: 'top',
  },



  pressed: { opacity: 0.92 },
  buttonDisabled: { opacity: 0.7 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: COLORS.card, borderRadius: 20, padding: 24, maxHeight: '70%' },
  modalTitle: { fontSize: 16, color: COLORS.text, marginBottom: 16 },
  folderList: { maxHeight: 200, marginBottom: 16 },
  folderRow: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: COLORS.bg, marginBottom: 8 },
  folderRowText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  modalClose: { paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  modalCloseText: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  modalHint: { fontSize: 14, color: COLORS.gray, marginBottom: 12 },
});
