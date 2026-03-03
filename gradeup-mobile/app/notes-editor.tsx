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

export default function NotesEditor() {
  const { subjectId, noteId } = useLocalSearchParams<{ subjectId: string; noteId?: string }>();
  const { notes, handleSaveNote, courses, flashcardFolders, addFlashcard } = useApp();
  const existing = noteId ? notes.find((n) => n.id === noteId) : null;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [content, setContent] = useState(existing?.content ?? '');
  const [attachmentPath, setAttachmentPath] = useState<string | undefined>(existing?.attachmentPath);
  const [attachmentFileName, setAttachmentFileName] = useState<string | undefined>(existing?.attachmentFileName);
  const [attachLoading, setAttachLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generatedCards, setGeneratedCards] = useState<{ front: string; back: string }[] | null>(null);
  const [folderModalVisible, setFolderModalVisible] = useState(false);

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setContent(existing.content);
      setAttachmentPath(existing.attachmentPath);
      setAttachmentFileName(existing.attachmentFileName);
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
      attachmentPath,
      attachmentFileName,
    };
    handleSaveNote(note);
    router.back();
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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icons.ArrowRight size={20} color={COLORS.gray} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <Text style={styles.title}>{existing ? 'Edit note' : 'New note'}</Text>
      </View>
      <TextInput style={styles.inputTitle} value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={COLORS.gray} />
      <TextInput style={styles.inputContent} value={content} onChangeText={setContent} placeholder="Content..." placeholderTextColor={COLORS.gray} multiline />

      <View style={styles.attachSection}>
        <Text style={styles.attachLabel}>Attachment</Text>
        {attachmentPath && attachmentFileName ? (
          <View style={styles.attachedRow}>
            <Feather name="paperclip" size={18} color={COLORS.navy} />
            <Text style={styles.attachedName} numberOfLines={1}>{attachmentFileName}</Text>
            <Pressable
              onPress={() => { setAttachmentPath(undefined); setAttachmentFileName(undefined); }}
              style={styles.removeAttach}
              hitSlop={8}
            >
              <Feather name="x-circle" size={20} color={COLORS.gray} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.attachBtn, pressed && styles.pressed, attachLoading && styles.buttonDisabled]}
            onPress={handleAttachFile}
            disabled={attachLoading}
          >
            {attachLoading ? (
              <ActivityIndicator size="small" color={COLORS.navy} />
            ) : (
              <>
                <Feather name="upload-cloud" size={20} color={COLORS.navy} />
                <Text style={styles.attachBtnText}>Attach file</Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      <Pressable style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed]} onPress={onSave}>
        <Text style={styles.saveBtnText}>Save</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.generateBtn, pressed && styles.pressed, generateLoading && styles.buttonDisabled]}
        onPress={handleGenerateFlashcards}
        disabled={generateLoading}
      >
        {generateLoading ? (
          <ActivityIndicator color={COLORS.white} size="small" />
        ) : (
          <>
            <Icons.Sparkles size={20} color={COLORS.white} />
            <Text style={styles.generateBtnText}>Generate flashcards from this note</Text>
          </>
        )}
      </Pressable>

      <Pressable style={styles.cardsBtn} onPress={() => router.push('/flashcards' as any)}>
        <Icons.Layers size={20} color={COLORS.navy} />
        <Text style={styles.cardsBtnText}>Open Flashcards</Text>
      </Pressable>

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
              <Text style={styles.modalCloseText}>Close</Text>
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
  content: { padding: 24, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  inputTitle: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, fontSize: 18, fontWeight: '700', marginBottom: 16, color: COLORS.text },
  inputContent: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, fontSize: 16, minHeight: 200, marginBottom: 16, color: COLORS.text },
  attachSection: { marginBottom: 24 },
  attachLabel: { fontSize: 13, fontWeight: '600', color: COLORS.gray, marginBottom: 8 },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    backgroundColor: COLORS.bg,
  },
  attachBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.navy },
  attachedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  attachedName: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
  removeAttach: { padding: 4 },
  saveBtn: { backgroundColor: COLORS.navy, paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginBottom: 12 },
  pressed: { opacity: 0.95 },
  saveBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '800' },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.navy,
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 12,
  },
  buttonDisabled: { opacity: 0.7 },
  generateBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  cardsBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
  cardsBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
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
