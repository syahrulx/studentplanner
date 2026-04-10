import { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Platform, Modal, TextInput, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import type { ThemePalette } from '@/constants/Themes';
import * as DocumentPicker from 'expo-document-picker';
import { uploadNoteAttachment } from '@/src/lib/noteStorage';
import { supabase } from '@/src/lib/supabase';
import { extractPdfTextFromStoragePath } from '@/src/lib/pdfText';
import { useTranslations } from '@/src/i18n';

function createStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingTop: Platform.OS === 'ios' ? 56 : 40,
      paddingBottom: 8,
    },
    headerLeft: { flex: 1 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    backText: { fontSize: 17, color: theme.primary, fontWeight: '400', marginTop: -1 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingRight: 8 },
    iconBtn: { padding: 4 },

    pageTitle: {
      fontSize: 34, fontWeight: '800', color: theme.text,
      letterSpacing: -0.8, paddingHorizontal: 20, marginBottom: 16, marginTop: 4,
    },

    folderRow: { paddingHorizontal: 20, marginBottom: 14 },
    folderRowContent: { gap: 8, paddingRight: 6 },
    folderChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
      backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border,
    },
    folderChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    folderChipAdd: { backgroundColor: `${theme.primary}10`, borderColor: `${theme.primary}22` },
    folderChipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
    folderChipTextActive: { color: '#ffffff' },

    listContent: { paddingHorizontal: 20, paddingBottom: 100 },
    listEmpty: { flexGrow: 1 },

    cardGroup: { backgroundColor: theme.card, overflow: 'hidden' },
    cardGroupFirst: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    cardGroupLast: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },

    noteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, position: 'relative' },
    noteRowBody: { flex: 1, paddingRight: 16 },
    noteTitle: { fontSize: 17, fontWeight: '600', color: theme.text, marginBottom: 2 },
    noteSnippet: { fontSize: 13, color: theme.textSecondary, lineHeight: 18 },

    noteRowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    noteDate: { fontSize: 14, color: theme.textSecondary },
    noteDeleteBtn: { padding: 4 },

    divider: { position: 'absolute', bottom: 0, left: 16, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: theme.border },

    emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, marginTop: 60 },
    emptyIcon: { marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '600', color: theme.text, marginBottom: 8 },
    emptySub: { fontSize: 15, color: theme.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 280 },

    menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
    menuBackdropTopRight: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'flex-end', paddingTop: Platform.OS === 'ios' ? 100 : 80, paddingRight: 16 },
    menuPanel: {
      backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.border,
      minWidth: 190, shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18, shadowRadius: 14, elevation: 8, overflow: 'hidden',
    },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    menuItemDisabled: { opacity: 0.55 },
    menuItemText: { fontSize: 15, fontWeight: '600', color: theme.text },

    newFolderPanel: {
      alignSelf: 'stretch', marginHorizontal: 22,
      backgroundColor: theme.card, borderRadius: 18, padding: 16,
      borderWidth: 1, borderColor: theme.border,
    },
    newFolderTitle: { fontSize: 16, fontWeight: '800', color: theme.text, marginBottom: 10 },
    newFolderInput: { borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.text, backgroundColor: theme.background, marginBottom: 12 },
    newFolderActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    newFolderBtnGhost: { paddingHorizontal: 12, paddingVertical: 10 },
    newFolderBtnGhostText: { fontSize: 15, fontWeight: '700', color: theme.textSecondary },
    newFolderBtnPrimary: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.primary },
    newFolderBtnPrimaryText: { fontSize: 15, fontWeight: '800', color: '#ffffff' },

    flashcardEntry: {
      marginHorizontal: 20, marginBottom: 14, borderRadius: 18,
      paddingVertical: 16, paddingHorizontal: 16, flexDirection: 'row',
      alignItems: 'center', gap: 14, borderWidth: 1,
      borderColor: theme.border, backgroundColor: `${theme.primary}12`,
    },
    flashcardEntryIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' },
    flashcardEntryBody: { flex: 1 },
    flashcardEntryTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
    flashcardEntrySub: { fontSize: 11, fontWeight: '500', color: theme.textSecondary, marginTop: 3 },

    moveItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
    moveItemText: { fontSize: 15, fontWeight: '600', color: theme.text, flex: 1 },
    moveDivider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginLeft: 16 },
  });
}

export default function NotesList() {
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const { notes, handleSaveNote, deleteNote, language } = useApp();
  const T = useTranslations(language);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const isImportingRef = useRef(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [moveNoteId, setMoveNoteId] = useState<string | null>(null);

  const allNotes = notes.filter((n) => n.subjectId === subjectId);

  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const n of allNotes) { if (n.folderId) set.add(n.folderId); }
    return Array.from(set).sort();
  }, [allNotes]);

  const list = useMemo(() => {
    if (!selectedFolder) return allNotes;
    return allNotes.filter((n) => n.folderId === selectedFolder);
  }, [allNotes, selectedFolder]);

  const openNewNote = () =>
    router.push({ pathname: '/notes-editor' as any, params: { subjectId, ...(selectedFolder ? { folderId: selectedFolder } : {}) } });

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    setNewFolderName('');
    setShowNewFolderModal(false);
    setSelectedFolder(name);
  };

  const handleMoveNote = (noteId: string, targetFolder: string | null) => {
    const note = allNotes.find((n) => n.id === noteId);
    if (!note) return;
    handleSaveNote({ ...note, folderId: targetFolder ?? undefined });
    setMoveNoteId(null);
  };

  const handleImportFile = async (type: string | string[] = '*/*') => {
    if (isImportingRef.current) return;
    isImportingRef.current = true;
    setIsImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) { Alert.alert('Sign in required', 'Sign in to import files into notes.'); return; }

      const noteId = `n${Date.now()}`;
      const fileName = file.name ?? `attachment-${Date.now()}`;
      const isPdf = (file.mimeType || '').toLowerCase().includes('pdf') || fileName.toLowerCase().endsWith('.pdf');

      const { path, error } = await uploadNoteAttachment(session.user.id, noteId, file.uri, fileName, file.mimeType ?? undefined);
      if (error) { Alert.alert('Upload failed', error.message); return; }

      const note = {
        id: noteId, subjectId, folderId: selectedFolder ?? undefined,
        title: fileName, content: isPdf ? 'Extracting text from PDF...' : '',
        tag: 'Lecture' as const, updatedAt: new Date().toISOString().slice(0, 10),
        attachmentPath: path, attachmentFileName: fileName,
      };
      handleSaveNote(note);
      router.push({ pathname: '/notes-editor' as any, params: { subjectId, noteId } });

      if (isPdf && path) {
        extractPdfTextFromStoragePath(path)
          .then((result) => {
            const text = result.text?.trim();
            if (text) {
              handleSaveNote({ ...note, content: text, extractedText: text });
            } else {
              const reason = result.detail || 'Unknown error';
              handleSaveNote({ ...note, content: '' });
              Alert.alert('PDF Extraction Failed', `Could not extract text from "${fileName}".\n\n${reason}`);
            }
          })
          .catch((err) => {
            handleSaveNote({ ...note, content: '' });
            Alert.alert('PDF Extraction Error', err?.message || 'Something went wrong extracting text from the PDF.');
          });
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not import file.');
    } finally { isImportingRef.current = false; setIsImporting(false); }
  };

  const promptImportFileType = () => {
    if (isImportingRef.current) return;
    Alert.alert('Import file', 'Choose what to import', [
      { text: 'PDF', onPress: () => setTimeout(() => handleImportFile('application/pdf').catch(() => {}), 400) },
      { text: 'Image', onPress: () => setTimeout(() => handleImportFile('image/*').catch(() => {}), 400) },
      { text: 'Document', onPress: () => setTimeout(() => handleImportFile(['application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain']).catch(() => {}), 400) },
      { text: 'Any file', onPress: () => setTimeout(() => handleImportFile('*/*').catch(() => {}), 400) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const moveTargetNote = moveNoteId ? allNotes.find((n) => n.id === moveNoteId) : null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={28} color={theme.primary} />
            <Text style={styles.backText}>Study</Text>
          </Pressable>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={styles.iconBtn} onPress={() => setShowPlusMenu(true)}>
            <Feather name="plus" size={24} color={theme.primary} />
          </Pressable>
        </View>
      </View>

      <Text style={styles.pageTitle}>{subjectId} Notes</Text>

      {/* Folder chips */}
      {(folders.length > 0) && (
        <View style={styles.folderRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderRowContent}>
            <Pressable style={[styles.folderChip, !selectedFolder && styles.folderChipActive]} onPress={() => setSelectedFolder(null)}>
              <Text style={[styles.folderChipText, !selectedFolder && styles.folderChipTextActive]}>All</Text>
            </Pressable>
            {folders.map((f) => (
              <Pressable
                key={f}
                style={[styles.folderChip, selectedFolder === f && styles.folderChipActive]}
                onPress={() => setSelectedFolder(selectedFolder === f ? null : f)}
                onLongPress={() => Alert.alert(`Folder "${f}"`, undefined, [
                  { text: 'Delete folder', style: 'destructive', onPress: () => {
                    for (const n of allNotes.filter((n) => n.folderId === f)) handleSaveNote({ ...n, folderId: undefined });
                    if (selectedFolder === f) setSelectedFolder(null);
                  }},
                  { text: 'Cancel', style: 'cancel' },
                ])}
              >
                <Feather name="folder" size={12} color={selectedFolder === f ? '#fff' : theme.textSecondary} />
                <Text style={[styles.folderChipText, selectedFolder === f && styles.folderChipTextActive]} numberOfLines={1}>{f}</Text>
              </Pressable>
            ))}
            <Pressable style={[styles.folderChip, styles.folderChipAdd]} onPress={() => setShowNewFolderModal(true)}>
              <Feather name="plus" size={12} color={theme.primary} />
              <Text style={[styles.folderChipText, { color: theme.primary }]}>New folder</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}

      {/* Flashcard shortcut */}
      <Pressable
        style={({ pressed }) => [styles.flashcardEntry, pressed && { opacity: 0.88 }]}
        onPress={() => router.push({ pathname: '/flashcard-pick' as any, params: subjectId ? { subjectId } : {} })}
      >
        <View style={styles.flashcardEntryIcon}>
          <Feather name="layers" size={20} color="#fff" />
        </View>
        <View style={styles.flashcardEntryBody}>
          <Text style={styles.flashcardEntryTitle}>{T('flashcardsAllSheetsTitle')}</Text>
          <Text style={styles.flashcardEntrySub}>{T('flashcardsBrowseDecksSub')}</Text>
        </View>
        <Feather name="chevron-right" size={20} color={theme.textSecondary} />
      </Pressable>

      {/* Notes list */}
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, list.length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Feather name="folder" size={42} color={theme.textSecondary} style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>{selectedFolder ? 'No Notes in Folder' : 'No Notes Yet'}</Text>
            <Text style={styles.emptySub}>
              {selectedFolder
                ? `Tap + to add a note to "${selectedFolder}", or long-press a note to move it here.`
                : `Tap the + icon to create your first note for ${subjectId}.`}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const isLast = index === list.length - 1;
          return (
            <View style={[styles.cardGroup, index === 0 && styles.cardGroupFirst, isLast && styles.cardGroupLast]}>
              <Pressable
                style={({ pressed }) => [styles.noteRow, pressed && { opacity: 0.7 }]}
                onPress={() => router.push({ pathname: '/notes-editor' as any, params: { subjectId, noteId: item.id } })}
                onLongPress={() => Alert.alert(item.title, undefined, [
                  { text: 'Move to folder', onPress: () => setMoveNoteId(item.id) },
                  { text: 'Delete', style: 'destructive', onPress: () => deleteNote(item.id) },
                  { text: 'Cancel', style: 'cancel' },
                ])}
              >
                <View style={styles.noteRowBody}>
                  <Text style={styles.noteTitle} numberOfLines={1}>{item.title}</Text>
                  {item.content === 'Extracting text from PDF...' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <ActivityIndicator size={10} color={theme.primary} />
                      <Text style={[styles.noteSnippet, { color: theme.primary }]}>Extracting text from PDF…</Text>
                    </View>
                  ) : (
                    <Text style={[styles.noteSnippet, item.extractedText ? { color: '#10b981' } : undefined]} numberOfLines={2}>
                      {item.extractedText
                        ? 'PDF ready for AI features'
                        : item.attachmentPath
                          ? 'PDF attached — AI will prepare on first use'
                          : item.content}
                    </Text>
                  )}
                </View>
                <View style={styles.noteRowMeta}>
                  <Text style={styles.noteDate}>{item.updatedAt}</Text>
                  <Pressable style={styles.noteDeleteBtn} onPress={() => Alert.alert('Delete note', `Remove "${item.title}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => deleteNote(item.id) },
                  ])} hitSlop={8}>
                    <Feather name="trash-2" size={16} color="#dc2626" />
                  </Pressable>
                  <Feather name="chevron-right" size={16} color={theme.textSecondary} />
                </View>
                {!isLast && <View style={styles.divider} />}
              </Pressable>
            </View>
          );
        }}
      />

      {/* + menu */}
      <Modal visible={showPlusMenu} transparent animationType="fade">
        <Pressable style={styles.menuBackdropTopRight} onPress={() => setShowPlusMenu(false)}>
          <View style={styles.menuPanel} onStartShouldSetResponder={() => true}>
            <Pressable style={styles.menuItem} onPress={() => { setShowPlusMenu(false); openNewNote(); }}>
              <Feather name="file-text" size={18} color={theme.text} />
              <Text style={styles.menuItemText}>New note</Text>
            </Pressable>
            <Pressable
              style={[styles.menuItem, isImporting && styles.menuItemDisabled]}
              disabled={isImporting}
              onPress={() => { if (isImportingRef.current) return; setShowPlusMenu(false); setTimeout(() => promptImportFileType(), 0); }}
            >
              <Feather name="upload" size={18} color={theme.text} />
              <Text style={styles.menuItemText}>{isImporting ? 'Importing...' : 'Import file'}</Text>
            </Pressable>
            {folders.length === 0 && (
              <Pressable style={styles.menuItem} onPress={() => { setShowPlusMenu(false); setShowNewFolderModal(true); }}>
                <Feather name="folder-plus" size={18} color={theme.text} />
                <Text style={styles.menuItemText}>New folder</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* New folder modal */}
      <Modal visible={showNewFolderModal} transparent animationType="fade">
        <Pressable style={styles.menuBackdrop} onPress={() => { setShowNewFolderModal(false); setNewFolderName(''); }}>
          <View style={styles.newFolderPanel} onStartShouldSetResponder={() => true}>
            <Text style={styles.newFolderTitle}>New Folder</Text>
            <TextInput
              style={styles.newFolderInput}
              placeholder="e.g. Chapter 1"
              placeholderTextColor={theme.textSecondary}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateFolder}
            />
            <View style={styles.newFolderActions}>
              <Pressable style={styles.newFolderBtnGhost} onPress={() => { setShowNewFolderModal(false); setNewFolderName(''); }}>
                <Text style={styles.newFolderBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.newFolderBtnPrimary} onPress={handleCreateFolder}>
                <Text style={styles.newFolderBtnPrimaryText}>Create</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Move to folder modal */}
      <Modal visible={!!moveNoteId} transparent animationType="fade">
        <Pressable style={styles.menuBackdrop} onPress={() => setMoveNoteId(null)}>
          <View style={[styles.menuPanel, { minWidth: 240 }]} onStartShouldSetResponder={() => true}>
            <Pressable style={styles.moveItem} onPress={() => handleMoveNote(moveNoteId!, null)}>
              <Feather name="inbox" size={16} color={theme.textSecondary} />
              <Text style={styles.moveItemText}>No folder</Text>
              {!moveTargetNote?.folderId && <Feather name="check" size={16} color={theme.primary} />}
            </Pressable>
            <View style={styles.moveDivider} />
            {folders.map((f, i) => (
              <View key={f}>
                <Pressable style={styles.moveItem} onPress={() => handleMoveNote(moveNoteId!, f)}>
                  <Feather name="folder" size={16} color={theme.textSecondary} />
                  <Text style={styles.moveItemText}>{f}</Text>
                  {moveTargetNote?.folderId === f && <Feather name="check" size={16} color={theme.primary} />}
                </Pressable>
                {i < folders.length - 1 && <View style={styles.moveDivider} />}
              </View>
            ))}
            <View style={styles.moveDivider} />
            <Pressable style={styles.moveItem} onPress={() => { setMoveNoteId(null); setShowNewFolderModal(true); }}>
              <Feather name="folder-plus" size={16} color={theme.primary} />
              <Text style={[styles.moveItemText, { color: theme.primary }]}>New folder</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
