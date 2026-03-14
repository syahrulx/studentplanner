import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Modal, ActivityIndicator, Alert, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { generateFlashcardsFromNote, getOpenAIKey } from '@/src/lib/studyApi';
import { ensureNoteAttachmentsBucket, uploadNoteAttachment } from '@/src/lib/noteStorage';
import { supabase } from '@/src/lib/supabase';
import { useTranslations } from '@/src/i18n';

const NAVY = '#003366';
const BG = '#f8fafc';
const CARD = '#ffffff';
const TEXT_PRIMARY = '#0f172a';
const TEXT_SECONDARY = '#64748b';
const DIVIDER = '#f1f5f9';

export default function NotesEditor() {
  const { subjectId, noteId, folderId } = useLocalSearchParams<{ subjectId: string; noteId?: string; folderId?: string }>();
  const { notes, handleSaveNote, deleteNote, courses, flashcardFolders, addFlashcard, language } = useApp();
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
      folderId: existing?.folderId ?? folderId,
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

  const onDeleteNote = () => {
    if (!existing?.id) return;
    Alert.alert('Delete note', `Remove "${existing.title || 'this note'}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteNote(existing.id); router.back(); } },
    ]);
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
    <View style={styles.container}>
      {/* Header: same style as notes-list / flashcard-folder */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={28} color={NAVY} />
            <Text style={styles.backText}>Study</Text>
          </Pressable>
        </View>
        <View style={styles.headerRight}>
          {existing?.id ? (
            <Pressable style={styles.iconBtn} onPress={onDeleteNote}>
              <Feather name="trash-2" size={20} color={NAVY} />
            </Pressable>
          ) : null}
          <Pressable
            style={styles.iconBtn}
            onPress={handleGenerateFlashcards}
            disabled={generateLoading}
          >
            <Feather name="layers" size={22} color={NAVY} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => setIsEditing((prev) => !prev)}>
            <Feather name="edit-2" size={22} color={NAVY} />
          </Pressable>
          <Pressable style={styles.saveBtn} onPress={onSave}>
            <Text style={styles.saveBtnText}>{T('save')}</Text>
          </Pressable>
        </View>
      </View>

      {/* Page title + content area */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.pageTitle}>Note</Text>

        {isEditing ? (
          <>
            <TextInput
              style={styles.noteTitleInput}
              value={title}
              onChangeText={setTitle}
              placeholder={T('noteTitle')}
              placeholderTextColor={TEXT_SECONDARY}
            />
            <TextInput
              style={styles.noteBodyInput}
              value={content}
              onChangeText={setContent}
              placeholder={T('startWriting')}
              placeholderTextColor={TEXT_SECONDARY}
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

        <View style={{ height: 48 }} />
      </ScrollView>



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
            <Pressable style={styles.modalClose} onPress={() => setFolderModalVisible(false)}>
              <Text style={styles.modalCloseText}>{T('close')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <View style={{ height: 48 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 12,
    backgroundColor: BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DIVIDER,
  },
  headerLeft: { flex: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 17, color: NAVY, fontWeight: '400', marginTop: -1 },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 8,
  },
  iconBtn: { padding: 6 },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: NAVY,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },

  pageTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: -0.8,
    marginBottom: 20,
    marginTop: 4,
  },

  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingTop: 2,
    borderBottomWidth: 1,
    borderColor: DIVIDER,
    paddingBottom: 8,
  },
  tagChipActive: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: CARD,
  },
  tagChipActiveText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: TEXT_PRIMARY,
  },
  tagChipMuted: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: TEXT_SECONDARY,
  },

  noteTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  noteTitleInput: {
    fontSize: 24,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderColor: DIVIDER,
    paddingVertical: 4,
  },
  noteBodyRead: {
    fontSize: 15,
    lineHeight: 22,
    color: TEXT_PRIMARY,
    marginTop: 8,
    minHeight: 120,
  },
  noteBodyInput: {
    fontSize: 15,
    lineHeight: 22,
    color: TEXT_PRIMARY,
    minHeight: 220,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: DIVIDER,
    textAlignVertical: 'top',
  },



  pressed: { opacity: 0.92 },
  buttonDisabled: { opacity: 0.7 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: CARD, borderRadius: 20, padding: 24, maxHeight: '70%', borderWidth: 1, borderColor: DIVIDER },
  modalTitle: { fontSize: 16, color: TEXT_PRIMARY, marginBottom: 16 },
  folderList: { maxHeight: 200, marginBottom: 16 },
  folderRow: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: BG, marginBottom: 8 },
  folderRowText: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  modalClose: { paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: DIVIDER, alignItems: 'center' },
  modalCloseText: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY },
  modalHint: { fontSize: 14, color: TEXT_SECONDARY, marginBottom: 12 },
});
