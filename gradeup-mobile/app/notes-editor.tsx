import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, Platform, Linking, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import Feather from '@expo/vector-icons/Feather';
import { WebView } from 'react-native-webview';
import { useApp } from '@/src/context/AppContext';
import { uploadNoteAttachment, getNoteAttachmentUrl } from '@/src/lib/noteStorage';
import { supabase } from '@/src/lib/supabase';
import { useTranslations } from '@/src/i18n';
import { ImportProgressBar } from '@/components/ImportProgressBar';

import { useTheme } from '@/hooks/useTheme';
import type { ThemePalette } from '@/constants/Themes';

type BannerState =
  | { kind: 'idle' }
  | { kind: 'importing'; progress: number; label: string }
  | { kind: 'done'; message: string };

export default function NotesEditor() {
  const { subjectId, noteId, folderId: paramFolderId } = useLocalSearchParams<{
    subjectId: string;
    noteId?: string;
    folderId?: string;
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
  const [extractedText, setExtractedText] = useState<string | undefined>(existing?.extractedText);
  const attachLoadingRef = useRef(false);
  const [banner, setBanner] = useState<BannerState>({ kind: 'idle' });
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
      setExtractedText(existing.extractedText);
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
      setExtractedText(undefined);
      setIsEditing(true);
    }
  }, [noteId, existing]);

  useEffect(() => {
    if (banner.kind !== 'done') return;
    const t = setTimeout(() => setBanner({ kind: 'idle' }), 3500);
    return () => clearTimeout(t);
  }, [banner.kind]);

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
    return () => { active = false; };
  }, [attachmentPath, isPdfAttachment]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/notes-list' as any);
  };

  const onSave = () => {
    const note = {
      id: currentNoteId ?? existing?.id ?? `n${Date.now()}`,
      subjectId: subjectId!,
      folderId: existing?.folderId ?? (typeof paramFolderId === 'string' ? paramFolderId : undefined),
      title: title.trim() || 'Untitled',
      content: content.trim(),
      tag,
      updatedAt: new Date().toISOString().slice(0, 10),
      attachmentPath,
      attachmentFileName,
      extractedText,
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
      setExtractedText(match.extractedText);
      setIsEditing(false);
    } else {
      setCurrentNoteId(undefined);
      setTitle('');
      setContent('');
      setAttachmentPath(undefined);
      setAttachmentFileName(undefined);
      setExtractedText(undefined);
      setIsEditing(true);
    }
  };

  const handleAttachFile = async () => {
    if (attachLoadingRef.current) return;
    attachLoadingRef.current = true;
    let uploadTicker: ReturnType<typeof setInterval> | null = null;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: false,
      });
      if (result.canceled) {
        setBanner({ kind: 'idle' });
        return;
      }
      const file = result.assets[0];

      setBanner({ progress: 12, label: T('noteAttachReading'), kind: 'importing' });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setBanner({ kind: 'idle' });
        Alert.alert('Sign in required', 'Sign in to attach files to notes.');
        return;
      }

      setBanner({ progress: 28, label: T('noteAttachUploading'), kind: 'importing' });
      uploadTicker = setInterval(() => {
        setBanner((prev) => {
          if (prev.kind !== 'importing') return prev;
          return { ...prev, progress: Math.min(prev.progress + 4, 86) };
        });
      }, 200);

      const noteIdForPath = existing?.id ?? currentNoteId ?? `n${Date.now()}`;
      const name = file.name ?? `attachment-${Date.now()}`;
      const { path, error } = await uploadNoteAttachment(
        session.user.id,
        noteIdForPath,
        file.uri,
        name,
        file.mimeType ?? undefined,
      );
      if (uploadTicker) {
        clearInterval(uploadTicker);
        uploadTicker = null;
      }

      if (error) {
        setBanner({ kind: 'idle' });
        Alert.alert('Upload failed', 'Could not upload the file. Please check your connection and try again.');
        return;
      }

      setBanner({ progress: 92, label: T('noteImportSaving'), kind: 'importing' });

      setAttachmentPath(path);
      setAttachmentFileName(name);
      setExtractedText(undefined);

      setBanner({ progress: 100, label: T('noteAttachDone'), kind: 'importing' });
      await new Promise((r) => setTimeout(r, 650));
      setBanner({ kind: 'done', message: T('noteAttachDone') });
    } catch (e: any) {
      setBanner({ kind: 'idle' });
      Alert.alert('Attachment failed', 'Could not attach the file. Please try again.');
    } finally {
      if (uploadTicker) clearInterval(uploadTicker);
      attachLoadingRef.current = false;
    }
  };

  const handleOpenAttachment = async () => {
    if (!attachmentPath) return;
    try {
      const { url, error } = await getNoteAttachmentUrl(attachmentPath);
      if (error || !url) {
        Alert.alert('Could not open file', 'Failed to generate a link for this attachment.');
        return;
      }
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert('Could not open file', 'Try downloading it manually from your files.');
    }
  };

  const bannerElement = banner.kind === 'idle' ? null : (
    <View
      style={[
        styles.statusBanner,
        banner.kind === 'importing' && { backgroundColor: `${theme.primary}12`, borderColor: `${theme.primary}35` },
        banner.kind === 'done' && { backgroundColor: '#10b98115', borderColor: '#10b98140' },
      ]}
    >
      {banner.kind === 'importing' ? (
        <>
          <Text style={[styles.statusBannerImportTitle, { color: theme.text }]}>{T('noteAttachTitle')}</Text>
          <Text style={[styles.statusBannerSub, { color: theme.textSecondary }]}>{T('noteImportSub')}</Text>
          <ImportProgressBar progress={banner.progress} label={banner.label} theme={theme} />
        </>
      ) : (
        <View style={styles.statusBannerRow}>
          <Feather name="check-circle" size={16} color="#10b981" />
          <Text style={[styles.statusBannerText, { color: '#10b981' }]}>{banner.message}</Text>
        </View>
      )}
    </View>
  );

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
          <Pressable onPress={onSave} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>{T('save')}</Text>
          </Pressable>
        </View>
      </View>

      {/* Status banner — inline between header and content, always visible */}
      {bannerElement}

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

  statusBanner: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusBannerImportTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  statusBannerSub: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    lineHeight: 16,
  },
  statusBannerText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },

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
