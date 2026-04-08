import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, Platform, Linking, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import Feather from '@expo/vector-icons/Feather';
import { WebView } from 'react-native-webview';
import { useApp } from '@/src/context/AppContext';
import { uploadNoteAttachment, getNoteAttachmentUrl, NOTE_ATTACHMENTS_BUCKET } from '@/src/lib/noteStorage';
import { supabase } from '@/src/lib/supabase';
import { useTranslations } from '@/src/i18n';

import { useTheme } from '@/hooks/useTheme';
import type { ThemePalette } from '@/constants/Themes';

export default function NotesEditor() {
  const { subjectId, noteId } = useLocalSearchParams<{
    subjectId: string;
    noteId?: string;
  }>();
  const { notes, handleSaveNote, deleteNote, courses, language, user } = useApp();
  const theme = useTheme();
  const styles = createStyles(theme);
  const T = useTranslations(language);
  const existing = noteId ? notes.find((n) => n.id === noteId) : null;
  const [currentNoteId, setCurrentNoteId] = useState<string | undefined>(existing?.id);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [content, setContent] = useState(existing?.content ?? '');
  const [attachmentPath, setAttachmentPath] = useState<string | undefined>(existing?.attachmentPath);
  const [attachmentFileName, setAttachmentFileName] = useState<string | undefined>(existing?.attachmentFileName);
  const [attachLoading, setAttachLoading] = useState(false);
  const attachLoadingRef = useRef(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);

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
      setIsEditing(false);
    } else {
      setCurrentNoteId(undefined);
      setTitle('');
      setContent('');
      setAttachmentPath(undefined);
      setAttachmentFileName(undefined);
      setIsEditing(true);
    }
  }, [noteId, existing]);



  const isPdfAttachment = !!attachmentFileName?.toLowerCase().endsWith('.pdf');
  const showPdfReader = !isEditing && isPdfAttachment && !!pdfPreviewUrl;

  useEffect(() => {
    let active = true;
    const loadPdfPreview = async () => {
      if (!attachmentPath || !isPdfAttachment) {
        setPdfPreviewUrl(null);
        return;
      }
      setPdfPreviewLoading(true);
      try {
        const { url, error } = await getNoteAttachmentUrl(attachmentPath);
        if (!active) return;
        if (error || !url) {
          setPdfPreviewUrl(null);
          return;
        }
        setPdfPreviewUrl(url);
      } finally {
        if (active) setPdfPreviewLoading(false);
      }
    };
    loadPdfPreview().catch(() => {
      if (active) {
        setPdfPreviewUrl(null);
        setPdfPreviewLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [attachmentPath, isPdfAttachment]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/notes-list' as any);
    }
  };

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
    goBack();
  };

  const onDeleteNote = () => {
    if (!existing?.id) return;
    Alert.alert('Delete note', `Remove "${existing.title || 'this note'}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteNote(existing.id); goBack(); } },
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
    if (attachLoadingRef.current) return;
    attachLoadingRef.current = true;
    setAttachLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: false,
      });
      if (result.canceled) {
        setAttachLoading(false);
        return;
      }
      const file = result.assets[0];

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        Alert.alert('Sign in required', 'Sign in to attach files to notes.');
        return;
      }

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
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not attach file');
    } finally {
      attachLoadingRef.current = false;
      setAttachLoading(false);
    }
  };

  const handleOpenAttachment = async () => {
    if (!attachmentPath) return;
    try {
      const { url, error } = await getNoteAttachmentUrl(attachmentPath);
      if (error || !url) {
        Alert.alert('Error', 'Could not get attachment link');
        return;
      }
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert('Error', 'Could not open file');
    }
  };



  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={goBack} style={styles.backBtn}>
            <Feather name="chevron-left" size={28} color={theme.primary} />
            <Text style={styles.backText}>Study</Text>
          </Pressable>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={handleAttachFile} style={styles.iconBtn} disabled={attachLoading}>
            {attachLoading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Feather name="paperclip" size={18} color={theme.text} />
            )}
          </Pressable>
          {existing?.id ? (
            <Pressable onPress={onDeleteNote} style={styles.iconBtn}>
              <Feather name="trash-2" size={18} color={theme.danger} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => setIsEditing((v) => !v)} style={styles.iconBtn}>
            <Feather name={isEditing ? 'eye' : 'edit-2'} size={18} color={theme.text} />
          </Pressable>
          <Pressable onPress={onSave} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>{T('save')}</Text>
          </Pressable>
        </View>
      </View>

      {/* Page title + content area */}
      {showPdfReader ? (
        <View style={styles.pdfReaderContainer}>
          {pdfPreviewLoading ? (
            <View style={styles.pdfLoadingWrap}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={styles.pdfLoadingText}>Loading PDF...</Text>
            </View>
          ) : (
            <WebView
              source={{ uri: pdfPreviewUrl as string }}
              style={styles.pdfReader}
              startInLoadingState
              renderLoading={() => (
                <View style={styles.pdfLoadingWrap}>
                  <ActivityIndicator size="small" color={theme.primary} />
                </View>
              )}
            />
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.noteTitleRow}>
            <Text style={styles.pageTitle}>Note</Text>
          </View>

          {isEditing ? (
            <>
              <TextInput
                style={styles.noteTitleInput}
                value={title}
                onChangeText={setTitle}
                placeholder={T('noteTitle')}
                placeholderTextColor={theme.textSecondary}
              />
              <TextInput
                style={styles.noteBodyInput}
                value={content}
                onChangeText={setContent}
                placeholder={T('startWriting')}
                placeholderTextColor={theme.textSecondary}
                multiline
              />
            </>
          ) : (
            <View style={styles.readingSheet}>
              <Text style={styles.noteTitle}>{title || T('untitledNote')}</Text>
              <Text style={styles.noteBodyRead}>
                {content || T('startCapturing')}
              </Text>
            </View>
          )}

          {attachmentFileName && (
            <Pressable style={styles.attachmentView} onPress={handleOpenAttachment}>
              <View style={styles.attachmentIconBox}>
                <Feather name="file" size={20} color={theme.primary} />
              </View>
              <Text style={styles.attachmentText} numberOfLines={1}>
                {attachmentFileName}
              </Text>
              <Feather name="external-link" size={16} color={theme.textSecondary} style={{ marginLeft: 'auto' }} />
            </Pressable>
          )}
        </ScrollView>
      )}






    </View>
  );
}

const createStyles = (theme: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 12,
    backgroundColor: theme.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  headerLeft: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 17, color: theme.text, fontWeight: '400', marginTop: -1 },
  iconBtn: { padding: 6 },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: theme.primary,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },

  noteTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
    marginTop: 4,
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: theme.text,
    letterSpacing: -0.8,
    flex: 1,
  },


  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingTop: 2,
    borderBottomWidth: 1,
    borderColor: theme.border,
    paddingBottom: 8,
  },
  tagChipActive: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.card,
  },
  tagChipActiveText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: theme.text,
  },
  tagChipMuted: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: theme.textSecondary,
  },

  noteTitle: {
    fontSize: 44,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  pdfReaderContainer: {
    flex: 1,
    backgroundColor: theme.background,
  },
  pdfReader: {
    flex: 1,
    backgroundColor: theme.background,
  },
  pdfLoadingWrap: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  pdfLoadingText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  noteTitleInput: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.text,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderColor: theme.border,
    paddingVertical: 4,
  },
  readingSheet: {
    backgroundColor: theme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  noteBodyRead: {
    fontSize: 17,
    color: theme.text,
    lineHeight: 29,
    minHeight: 120,
    marginTop: 2,
    textAlign: 'justify',
  },
  attachmentView: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.border,
    padding: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  attachmentIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  attachmentText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
    flex: 1,
  },
  noteBodyInput: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.text,
    minHeight: 220,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    textAlignVertical: 'top',
  },


});
