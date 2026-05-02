import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, Platform, Linking, ActivityIndicator, Keyboard, KeyboardAvoidingView, Dimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import Feather from '@expo/vector-icons/Feather';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

const MAX_PDF_AI_BYTES = 25 * 1024 * 1024;

function wordCount(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

function formatTimestamp(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function NotesEditor() {
  const { subjectId, noteId, folderId: paramFolderId } = useLocalSearchParams<{
    subjectId: string;
    noteId?: string;
    folderId?: string;
  }>();
  const { notes, handleSaveNote, deleteNote, courses, language, user } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const T = useTranslations(language);
  const existing = noteId ? notes.find((n) => n.id === noteId) : null;
  const isNew = !existing;

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
  const [saved, setSaved] = useState(true);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const contentRef = useRef<TextInput>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tag, setTag] = useState<'Lecture' | 'Tutorial' | 'Exam' | 'Important'>(
    existing?.tag === 'Tutorial' || existing?.tag === 'Exam' || existing?.tag === 'Important'
      ? existing.tag
      : 'Lecture'
  );

  // Keyboard listeners
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

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
    }
  }, [noteId]);

  useEffect(() => {
    if (banner.kind !== 'done') return;
    const t = setTimeout(() => setBanner({ kind: 'idle' }), 3500);
    return () => clearTimeout(t);
  }, [banner.kind]);

  // Auto-save on content change (debounced 1.5s)
  useEffect(() => {
    if (isNew && !title.trim() && !content.trim()) return;
    setSaved(false);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      doSave(false);
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [title, content, tag]);

  const isPdfAttachment = !!attachmentFileName?.toLowerCase().endsWith('.pdf');
  const showPdfReader = isPdfAttachment && !!pdfPreviewUrl;

  useEffect(() => {
    let active = true;
    const loadPdfPreview = async () => {
      if (!attachmentPath || !isPdfAttachment) { setPdfPreviewUrl(null); return; }
      setPdfPreviewLoading(true);
      try {
        const { url, error } = await getNoteAttachmentUrl(attachmentPath);
        if (!active) return;
        if (error || !url) { setPdfPreviewUrl(null); return; }
        setPdfPreviewUrl(url);
      } finally { if (active) setPdfPreviewLoading(false); }
    };
    loadPdfPreview().catch(() => { if (active) { setPdfPreviewUrl(null); setPdfPreviewLoading(false); } });
    return () => { active = false; };
  }, [attachmentPath, isPdfAttachment]);

  const goBack = () => {
    // Save before leaving
    if (!saved) doSave(false);
    if (router.canGoBack()) router.back();
    else router.replace('/notes-list' as any);
  };

  const doSave = useCallback((showAlert: boolean) => {
    if (!title.trim() && !content.trim() && !attachmentPath) return;
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
      extractionError: existing?.extractionError,
    };
    if (!currentNoteId) setCurrentNoteId(note.id);
    handleSaveNote(note);
    setSaved(true);
    if (showAlert) Alert.alert('Saved', 'Note saved successfully.');

    // Fire-and-forget embedding generation for AI Tutor context
    const fullContent = [note.content, note.extractedText].filter(Boolean).join('\n\n').trim();
    if (fullContent.length > 50) {
      import('@/src/lib/invokeAiGenerate').then(({ invokeAiEmbed }) => {
        invokeAiEmbed({ noteId: note.id, subjectId: note.subjectId, content: fullContent });
      }).catch(() => {});
    }
  }, [title, content, tag, currentNoteId, existing, subjectId, paramFolderId, attachmentPath, attachmentFileName, extractedText]);

  const onDeleteNote = () => {
    const id = currentNoteId || existing?.id;
    if (!id) { goBack(); return; }
    Alert.alert('Delete note', `Remove "${title || 'this note'}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteNote(id); goBack(); } },
    ]);
  };

  // Markdown-style toolbar insertions
  const insertMarkdown = (prefix: string, suffix: string = '') => {
    const newContent = content + (content && !content.endsWith('\n') ? '\n' : '') + prefix;
    setContent(newContent + suffix);
    setTimeout(() => contentRef.current?.focus(), 100);
  };

  const insertHeading = () => insertMarkdown('## ');
  const insertBulletList = () => insertMarkdown('• ');
  const insertNumberedList = () => {
    const lines = content.split('\n');
    const lastNum = lines.reduce((max, l) => {
      const m = l.match(/^(\d+)\./);
      return m ? Math.max(max, parseInt(m[1])) : max;
    }, 0);
    insertMarkdown(`${lastNum + 1}. `);
  };
  const insertCheckbox = () => insertMarkdown('☐ ');
  const insertDivider = () => insertMarkdown('───────────────');

  const handleAttachFile = async () => {
    if (attachLoadingRef.current) return;

    const processPhoto = async (uri: string, name: string, mimeType?: string) => {
      attachLoadingRef.current = true;
      let uploadTicker: ReturnType<typeof setInterval> | null = null;
      try {
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (fileInfo.exists && fileInfo.size && fileInfo.size > 10 * 1024 * 1024) {
          Alert.alert('File too large', 'Photos must be under 10MB.');
          return;
        }

        setBanner({ progress: 12, label: T('noteAttachReading'), kind: 'importing' });
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          setBanner({ kind: 'idle' });
          Alert.alert('Sign in required', 'Sign in to attach files.');
          return;
        }

        setBanner({ progress: 28, label: T('noteAttachUploading'), kind: 'importing' });
        uploadTicker = setInterval(() => {
          setBanner((prev) => prev.kind !== 'importing' ? prev : { ...prev, progress: Math.min(prev.progress + 4, 86) });
        }, 200);

        const noteIdForPath = existing?.id ?? currentNoteId ?? `n${Date.now()}`;
        const { path, error } = await uploadNoteAttachment(session.user.id, noteIdForPath, uri, name, mimeType);
        
        if (uploadTicker) { clearInterval(uploadTicker); uploadTicker = null; }
        if (error) { setBanner({ kind: 'idle' }); Alert.alert('Upload failed', 'Could not upload.'); return; }

        setBanner({ progress: 92, label: T('noteImportSaving'), kind: 'importing' });
        setAttachmentPath(path);
        setAttachmentFileName(name);
        setExtractedText(undefined);
        setBanner({ progress: 100, label: T('noteAttachDone'), kind: 'importing' });
        await new Promise((r) => setTimeout(r, 650));
        setBanner({ kind: 'done', message: T('noteAttachDone') });
      } catch (e) {
        console.error('[NotesEditor] processPhoto error:', e);
        setBanner({ kind: 'idle' });
        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
        Alert.alert('Attachment failed', `Could not attach the photo. ${errorMsg}`);
      } finally {
        if (uploadTicker) clearInterval(uploadTicker);
        attachLoadingRef.current = false;
      }
    };

    Alert.alert('Attach Photo', 'Choose an image source', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Take Photo',
        onPress: async () => {
          try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') return Alert.alert('Permission Denied', 'Camera access is required.');
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.7,
            });
            if (!result.canceled && result.assets[0]) {
              processPhoto(result.assets[0].uri, result.assets[0].fileName || `camera_${Date.now()}.jpg`, result.assets[0].mimeType);
            }
          } catch (e) {
            Alert.alert('Camera Unavailable', 'The camera is not available on this device or simulator.');
          }
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            const name = asset.fileName || `photo-${Date.now()}.jpg`;
            processPhoto(asset.uri, name, asset.mimeType);
          }
        },
      },
    ]);
  };

  const handleOpenAttachment = async () => {
    if (!attachmentPath) return;
    try {
      const { url, error } = await getNoteAttachmentUrl(attachmentPath);
      if (error || !url) { Alert.alert('Could not open file'); return; }
      await Linking.openURL(url);
    } catch { Alert.alert('Could not open file'); }
  };

  const words = wordCount(content);
  const chars = content.length;
  const subjectName = courses?.find((c: any) => c.code === subjectId || c.id === subjectId)?.name || subjectId;
  const s = createStyles(theme);

  const bannerElement = banner.kind === 'idle' ? null : (
    <View style={[s.statusBanner, 
      banner.kind === 'importing' && { backgroundColor: `${theme.primary}12`, borderColor: `${theme.primary}35` },
      banner.kind === 'done' && { backgroundColor: '#10b98115', borderColor: '#10b98140' },
    ]}>
      {banner.kind === 'importing' ? (
        <>
          <Text style={[s.statusBannerTitle, { color: theme.text }]}>{T('noteAttachTitle')}</Text>
          <Text style={[s.statusBannerSub, { color: theme.textSecondary }]}>{T('noteImportSub')}</Text>
          <ImportProgressBar progress={banner.progress} label={banner.label} theme={theme} />
        </>
      ) : (
        <View style={s.statusBannerRow}>
          <Feather name="check-circle" size={16} color="#10b981" />
          <Text style={[s.statusBannerText, { color: '#10b981' }]}>{banner.message}</Text>
        </View>
      )}
    </View>
  );

  // styles `s` already declared above

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Minimal header */}
      <View style={s.header}>
        <Pressable onPress={goBack} style={s.backBtn} hitSlop={8}>
          <Feather name="chevron-left" size={28} color={theme.primary} />
          <Text style={[s.backText, { color: theme.primary }]}>Notes</Text>
        </Pressable>
        <View style={s.headerRight}>
          {/* Save indicator */}
          <View style={s.saveIndicator}>
            {saved ? (
              <>
                <Feather name="check" size={12} color="#10b981" />
                <Text style={[s.saveIndicatorText, { color: '#10b981' }]}>Saved</Text>
              </>
            ) : (
              <>
                <View style={[s.unsavedDot, { backgroundColor: '#FF9F0A' }]} />
                <Text style={[s.saveIndicatorText, { color: '#FF9F0A' }]}>Editing</Text>
              </>
            )}
          </View>
          <Pressable onPress={onDeleteNote} hitSlop={8} style={s.headerIcon}>
            <Feather name="trash-2" size={18} color={theme.textSecondary} />
          </Pressable>
          <Pressable onPress={() => doSave(true)} hitSlop={8} style={s.headerIcon}>
            <Feather name="check" size={22} color={theme.primary} />
          </Pressable>
        </View>
      </View>

      {bannerElement}

      {/* PDF Reader */}
      {showPdfReader ? (
        <View style={s.pdfReaderContainer}>
          {pdfPreviewLoading ? (
            <View style={s.pdfLoadingWrap}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[s.pdfLoadingText, { color: theme.textSecondary }]}>Loading PDF...</Text>
            </View>
          ) : (
            <WebView
              source={{ uri: pdfPreviewUrl as string }}
              style={s.pdfReader}
              startInLoadingState
              renderLoading={() => (
                <View style={s.pdfLoadingWrap}>
                  <ActivityIndicator size="small" color={theme.primary} />
                </View>
              )}
            />
          )}
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={[s.scrollContent, { paddingBottom: keyboardVisible ? 80 : 120 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {/* Meta info line */}
            <View style={s.metaRow}>
              <Text style={[s.metaText, { color: theme.textSecondary }]}>
                {existing?.updatedAt ? formatTimestamp(existing.updatedAt) : 'New note'}
              </Text>
              <Text style={[s.metaText, { color: theme.textSecondary }]}>·</Text>
              <Text style={[s.metaText, { color: theme.primary }]}>{subjectName}</Text>
            </View>

            {/* Tag pills */}
            <View style={s.tagRow}>
              {(['Lecture', 'Tutorial', 'Exam', 'Important'] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTag(t)}
                  style={[
                    s.tagPill,
                    tag === t && { backgroundColor: theme.primary },
                    tag !== t && { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
                  ]}
                >
                  <Text style={[
                    s.tagPillText,
                    tag === t ? { color: '#fff' } : { color: theme.textSecondary },
                  ]}>
                    {t === 'Important' ? '⭐ ' : ''}{t}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Title input — large, inline */}
            <TextInput
              style={[s.titleInput, { color: theme.text }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Note title"
              placeholderTextColor={`${theme.textSecondary}80`}
              returnKeyType="next"
              onSubmitEditing={() => contentRef.current?.focus()}
              blurOnSubmit={false}
            />

            {/* Content input — fills available space */}
            <TextInput
              ref={contentRef}
              style={[s.contentInput, { color: theme.text }]}
              value={content}
              onChangeText={setContent}
              placeholder="Start writing..."
              placeholderTextColor={`${theme.textSecondary}60`}
              multiline
              textAlignVertical="top"
              autoFocus={isNew}
              scrollEnabled={false}
            />

            {/* Attachment display */}
            {attachmentFileName && (
              <Pressable style={[s.attachmentCard, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={handleOpenAttachment}>
                <View style={[s.attachmentIcon, { backgroundColor: `${theme.primary}15` }]}>
                  <Feather name={isPdfAttachment ? 'file-text' : 'image'} size={20} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.attachmentName, { color: theme.text }]} numberOfLines={1}>{attachmentFileName}</Text>
                  <Text style={[s.attachmentHint, { color: theme.textSecondary }]}>Tap to open</Text>
                </View>
                <Feather name="external-link" size={14} color={theme.textSecondary} />
              </Pressable>
            )}
          </ScrollView>

          {/* Bottom toolbar */}
          <View style={[s.toolbar, { 
            backgroundColor: theme.card, 
            borderTopColor: theme.border,
            paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 16),
          }]}>
            <View style={s.toolbarLeft}>
              <Pressable onPress={insertHeading} style={s.toolBtn} hitSlop={4}>
                <Text style={[s.toolBtnText, { color: theme.text }]}>H</Text>
              </Pressable>
              <Pressable onPress={insertBulletList} style={s.toolBtn} hitSlop={4}>
                <Feather name="list" size={18} color={theme.text} />
              </Pressable>
              <Pressable onPress={insertNumberedList} style={s.toolBtn} hitSlop={4}>
                <Text style={[s.toolBtnText, { color: theme.text, fontSize: 13 }]}>1.</Text>
              </Pressable>
              <Pressable onPress={insertCheckbox} style={s.toolBtn} hitSlop={4}>
                <Feather name="check-square" size={17} color={theme.text} />
              </Pressable>
              <Pressable onPress={insertDivider} style={s.toolBtn} hitSlop={4}>
                <Feather name="minus" size={18} color={theme.text} />
              </Pressable>
              <View style={[s.toolDivider, { backgroundColor: theme.border }]} />
              <Pressable onPress={handleAttachFile} style={s.toolBtn} hitSlop={4}>
                <Feather name="camera" size={17} color={theme.primary} />
              </Pressable>
            </View>
            <Text style={[s.wordCount, { color: theme.textSecondary }]}>
              {words} word{words !== 1 ? 's' : ''} · {chars} char{chars !== 1 ? 's' : ''}
            </Text>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const createStyles = (theme: ThemePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 17, fontWeight: '400', marginTop: -1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { padding: 4 },

  // Save indicator
  saveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: theme.backgroundSecondary || `${theme.border}40` },
  saveIndicatorText: { fontSize: 11, fontWeight: '700' },
  unsavedDot: { width: 6, height: 6, borderRadius: 3 },

  // Status banner
  statusBanner: { marginHorizontal: 12, marginTop: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  statusBannerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusBannerTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  statusBannerSub: { fontSize: 12, fontWeight: '600', marginBottom: 10, lineHeight: 16 },
  statusBannerText: { fontSize: 13, fontWeight: '600', flex: 1 },

  // Meta
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 8 },
  metaText: { fontSize: 12, fontWeight: '600' },

  // Tags
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  tagPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  tagPillText: { fontSize: 12, fontWeight: '700' },

  // Title
  titleInput: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 16,
    paddingVertical: 0,
  },

  // Content
  contentInput: {
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '400',
    minHeight: 300,
    paddingVertical: 0,
  },

  // Attachment
  attachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 24,
    gap: 12,
  },
  attachmentIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  attachmentName: { fontSize: 14, fontWeight: '600' },
  attachmentHint: { fontSize: 11, fontWeight: '500', marginTop: 2 },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolbarLeft: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  toolBtn: {
    width: 36, height: 36, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  toolBtnText: { fontSize: 16, fontWeight: '800' },
  toolDivider: { width: 1, height: 20, marginHorizontal: 6 },
  wordCount: { fontSize: 11, fontWeight: '600' },

  // PDF
  pdfReaderContainer: { flex: 1, backgroundColor: theme.background },
  pdfReader: { flex: 1, backgroundColor: theme.background },
  pdfLoadingWrap: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 10 },
  pdfLoadingText: { fontSize: 14 },
});
