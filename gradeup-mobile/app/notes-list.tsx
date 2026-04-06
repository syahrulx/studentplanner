import { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Platform, Modal, TextInput, Alert, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import type { ThemePalette } from '@/constants/Themes';
import * as DocumentPicker from 'expo-document-picker';
import { uploadNoteAttachment } from '@/src/lib/noteStorage';
import { supabase } from '@/src/lib/supabase';
import { extractPdfTextFromUri } from '@/src/lib/pdfText';

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
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    backText: { fontSize: 17, color: theme.primary, fontWeight: '400', marginTop: -1 },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingRight: 8,
    },
    iconBtn: {
      padding: 4,
    },

    pageTitle: {
      fontSize: 34,
      fontWeight: '800',
      color: theme.text,
      letterSpacing: -0.8,
      paddingHorizontal: 20,
      marginBottom: 20,
      marginTop: 4,
    },

    folderRow: { paddingHorizontal: 20, marginBottom: 14 },
    folderRowContent: { gap: 10, paddingRight: 6 },
    folderChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      maxWidth: 160,
    },
    folderChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    folderChipAdd: { backgroundColor: `${theme.primary}10`, borderColor: `${theme.primary}22` },
    folderChipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
    folderChipTextActive: { color: '#ffffff' },

    listContent: { paddingHorizontal: 20, paddingBottom: 100 },
    listEmpty: { flexGrow: 1 },

    cardGroup: {
      backgroundColor: theme.card,
      overflow: 'hidden',
    },
    cardGroupFirst: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
    },
    cardGroupLast: {
      borderBottomLeftRadius: 16,
      borderBottomRightRadius: 16,
    },

    noteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      position: 'relative',
    },
    noteRowBody: { flex: 1, paddingRight: 16 },
    noteTitle: { fontSize: 17, fontWeight: '600', color: theme.text, marginBottom: 2 },
    noteSnippet: { fontSize: 13, color: theme.textSecondary, lineHeight: 18 },

    noteRowMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    noteDate: { fontSize: 14, color: theme.textSecondary },
    noteDeleteBtn: { padding: 4 },

    divider: {
      position: 'absolute',
      bottom: 0,
      left: 16,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
    },

    emptyWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      marginTop: 60,
    },
    emptyIcon: { marginBottom: 16 },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 8,
    },
    emptySub: {
      fontSize: 15,
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 280,
    },

    menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'flex-end', paddingTop: Platform.OS === 'ios' ? 100 : 80, paddingRight: 16 },
    menuPanel: {
      backgroundColor: theme.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      minWidth: 190,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 14,
      elevation: 8,
      overflow: 'hidden',
    },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    menuItemDisabled: { opacity: 0.55 },
    menuItemText: { fontSize: 15, fontWeight: '600', color: theme.text },

    newFolderPanel: {
      alignSelf: 'stretch',
      marginHorizontal: 22,
      marginTop: 180,
      backgroundColor: theme.card,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    newFolderTitle: { fontSize: 16, fontWeight: '800', color: theme.text, marginBottom: 10 },
    newFolderInput: { borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.text, backgroundColor: theme.background, marginBottom: 12 },
    newFolderActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    newFolderBtnGhost: { paddingHorizontal: 12, paddingVertical: 10 },
    newFolderBtnGhostText: { fontSize: 15, fontWeight: '700', color: theme.textSecondary },
    newFolderBtnPrimary: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.primary },
    newFolderBtnPrimaryText: { fontSize: 15, fontWeight: '800', color: '#ffffff' },
  });
}

export default function NotesList() {
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const { notes, courses, noteFolders, addNoteFolder, handleSaveNote, deleteNote, deleteNoteFolder } = useApp();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const isImportingRef = useRef(false);

  const foldersForSubject = useMemo(() => noteFolders.filter((f) => f.subjectId === subjectId), [noteFolders, subjectId]);

  const list = notes
    .filter((n) => n.subjectId === subjectId)
    .filter((n) => (activeFolderId === 'all' ? true : (n.folderId ?? '') === activeFolderId));
  const course = courses.find((c) => c.id === subjectId);

  const openNewNote = (folderId?: string) =>
    router.push({ pathname: '/notes-editor' as any, params: { subjectId, ...(folderId ? { folderId } : {}) } });

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;

    // Check for duplicate folder name in this subject (case-insensitive)
    const existingFolders = noteFolders.filter(f => f.subjectId === subjectId);
    const duplicate = existingFolders.find(f => f.name.toLowerCase() === name.toLowerCase());

    if (duplicate) {
      Alert.alert(
        'Folder Already Exists',
        `A folder named "${duplicate.name}" already exists. What would you like to do?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => {
            setNewFolderName('');
            setShowNewFolder(false);
          }},
          { text: 'Rename', onPress: () => {
            // Keep the modal open so the user can rename
          }},
          { text: 'Replace', style: 'destructive', onPress: () => {
            deleteNoteFolder(duplicate.id);
            const folder = { id: `nf-${Date.now()}`, subjectId, name, createdAt: new Date().toISOString() };
            addNoteFolder(folder);
            setNewFolderName('');
            setShowNewFolder(false);
            setActiveFolderId(folder.id);
          }}
        ]
      );
      return;
    }

    const folder = { id: `nf-${Date.now()}`, subjectId, name, createdAt: new Date().toISOString() };
    addNoteFolder(folder);
    setNewFolderName('');
    setShowNewFolder(false);
    setActiveFolderId(folder.id);
  };

  const openFlashcardSection = () => {
    router.push({ pathname: '/subject-flashcards' as any, params: { subjectId } });
  };

  const handleImportFile = async (type: string | string[] = '*/*') => {
    if (isImportingRef.current) return;
    isImportingRef.current = true;
    setIsImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        Alert.alert('Sign in required', 'Sign in to import files into notes.');
        return;
      }

      const noteId = `n${Date.now()}`;
      const fileName = file.name ?? `attachment-${Date.now()}`;
      const isPdf =
        (file.mimeType || '').toLowerCase().includes('pdf') ||
        fileName.toLowerCase().endsWith('.pdf');

      // Upload attachment to Supabase (fast)
      const { path, error } = await uploadNoteAttachment(session.user.id, noteId, file.uri, fileName, file.mimeType ?? undefined);
      if (error) {
        Alert.alert('Upload failed', error.message);
        return;
      }

      // Save note immediately with empty content — user sees it right away
      const note = {
        id: noteId,
        subjectId,
        folderId: activeFolderId === 'all' ? undefined : activeFolderId,
        title: fileName,
        content: isPdf ? 'Extracting text from PDF...' : '',
        tag: 'Lecture' as const,
        updatedAt: new Date().toISOString().slice(0, 10),
        attachmentPath: path,
        attachmentFileName: fileName,
      };
      handleSaveNote(note);

      // Navigate to editor immediately — no waiting!
      router.push({ pathname: '/notes-editor' as any, params: { subjectId, noteId } });

      // Extract PDF text in the background, then update the note
      if (isPdf) {
        extractPdfTextFromUri(file.uri, 25)
          .then((text) => {
            if (text && text.trim()) {
              handleSaveNote({ ...note, content: text });
            } else {
              handleSaveNote({ ...note, content: '' });
            }
          })
          .catch(() => {
            handleSaveNote({ ...note, content: '' });
          });
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not import file.');
    } finally {
      isImportingRef.current = false;
      setIsImporting(false);
    }
  };

  const promptImportFileType = () => {
    if (isImportingRef.current) return;
    Alert.alert('Import file', 'Choose what to import', [
      {
        text: 'PDF',
        onPress: () => {
          setTimeout(() => {
            handleImportFile('application/pdf').catch(() => {});
          }, 0);
        },
      },
      {
        text: 'Image',
        onPress: () => {
          setTimeout(() => {
            handleImportFile('image/*').catch(() => {});
          }, 0);
        },
      },
      {
        text: 'Document',
        onPress: () => {
          setTimeout(() => {
            handleImportFile([
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-powerpoint',
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'text/plain',
            ]).catch(() => {});
          }, 0);
        },
      },
      {
        text: 'Any file',
        onPress: () => {
          setTimeout(() => {
            handleImportFile('*/*').catch(() => {});
          }, 0);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const emptyComponent = (
    <View style={styles.emptyWrap}>
      <Feather name="folder" size={42} color={theme.textSecondary} style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>No Notes Yet</Text>
      <Text style={styles.emptySub}>
        Tap the + icon in the top right to create your first note for {subjectId}.
      </Text>
    </View>
  );

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
          {activeFolderId !== 'all' && (
            <Pressable 
              style={styles.iconBtn} 
              onPress={() => {
                const activeFolder = foldersForSubject.find(f => f.id === activeFolderId);
                if (activeFolder) {
                  Alert.alert(
                    'Delete folder', 
                    `Remove folder "${activeFolder.name}"? Notes inside will be kept but unassigned.`, 
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => { deleteNoteFolder(activeFolder.id); setActiveFolderId('all'); } },
                    ]
                  );
                }
              }}
            >
              <Feather name="trash-2" size={20} color={theme.primary} />
            </Pressable>
          )}
          <Pressable style={styles.iconBtn} onPress={openFlashcardSection}>
            <Feather name="layers" size={22} color={theme.primary} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => setShowPlusMenu(true)}>
            <Feather name="plus" size={24} color={theme.primary} />
          </Pressable>
        </View>
      </View>

      <Text style={styles.pageTitle}>{subjectId} Notes</Text>

      {/* Folder selector */}
      <View style={styles.folderRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderRowContent}>
          <Pressable
            style={[styles.folderChip, activeFolderId === 'all' && styles.folderChipActive]}
            onPress={() => setActiveFolderId('all')}
          >
            <Text style={[styles.folderChipText, activeFolderId === 'all' && styles.folderChipTextActive]}>All</Text>
          </Pressable>
          {foldersForSubject.map((f) => (
            <Pressable
              key={f.id}
              style={[styles.folderChip, activeFolderId === f.id && styles.folderChipActive]}
              onPress={() => setActiveFolderId(f.id)}
              onLongPress={() =>
                Alert.alert('Delete folder', `Remove folder "${f.name}"? Notes inside will be kept but unassigned.`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => { deleteNoteFolder(f.id); setActiveFolderId('all'); } },
                ])
              }
            >
              <Text style={[styles.folderChipText, activeFolderId === f.id && styles.folderChipTextActive]} numberOfLines={1}>
                {f.name}
              </Text>
            </Pressable>
          ))}
          <Pressable style={[styles.folderChip, styles.folderChipAdd]} onPress={() => setShowNewFolder(true)}>
            <Feather name="folder-plus" size={14} color={theme.primary} />
            <Text style={[styles.folderChipText, { color: theme.primary, fontWeight: '700' }]}>Folder</Text>
          </Pressable>
        </ScrollView>
      </View>

      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, list.length === 0 && styles.listEmpty]}
        ListEmptyComponent={emptyComponent}
        renderItem={({ item, index }) => {
          const isLast = index === list.length - 1;
          return (
            <View style={[styles.cardGroup, index === 0 && styles.cardGroupFirst, isLast && styles.cardGroupLast]}>
              <Pressable
                style={({ pressed }) => [styles.noteRow, pressed && { opacity: 0.7 }]}
                onPress={() => router.push({ pathname: '/notes-editor' as any, params: { subjectId, noteId: item.id } })}
                onLongPress={() =>
                  Alert.alert('Delete note', `Remove "${item.title}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => deleteNote(item.id) },
                  ])
                }
              >
                <View style={styles.noteRowBody}>
                  <Text style={styles.noteTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.noteSnippet} numberOfLines={2}>{item.content}</Text>
                </View>
                <View style={styles.noteRowMeta}>
                  <Text style={styles.noteDate}>{item.updatedAt}</Text>
                  <Pressable
                    style={styles.noteDeleteBtn}
                    onPress={() =>
                      Alert.alert('Delete note', `Remove "${item.title}"?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteNote(item.id) },
                      ])
                    }
                    hitSlop={8}
                  >
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
      <Modal
        visible={showPlusMenu}
        transparent
        animationType="fade"
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setShowPlusMenu(false)}>
          <View style={styles.menuPanel} onStartShouldSetResponder={() => true}>

            <Pressable
              style={[styles.menuItem, isImporting && styles.menuItemDisabled]}
              disabled={isImporting}
              onPress={() => {
                if (isImportingRef.current) return;
                setShowPlusMenu(false);
                setTimeout(() => {
                  promptImportFileType();
                }, 0);
              }}
            >
              <Feather name="upload" size={18} color={theme.text} />
              <Text style={styles.menuItemText}>{isImporting ? 'Importing...' : 'Import file'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* New folder modal */}
      <Modal visible={showNewFolder} transparent animationType="fade">
        <Pressable style={styles.menuBackdrop} onPress={() => setShowNewFolder(false)}>
          <View style={styles.newFolderPanel} onStartShouldSetResponder={() => true}>
            <Text style={styles.newFolderTitle}>New folder</Text>
            <TextInput
              style={styles.newFolderInput}
              value={newFolderName}
              onChangeText={setNewFolderName}
              placeholder="e.g. Chapter 1"
              placeholderTextColor={theme.textSecondary}
              autoCorrect={false}
            />
            <View style={styles.newFolderActions}>
              <Pressable style={styles.newFolderBtnGhost} onPress={() => setShowNewFolder(false)}>
                <Text style={styles.newFolderBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.newFolderBtnPrimary, !newFolderName.trim() && { opacity: 0.5 }]}
                disabled={!newFolderName.trim()}
                onPress={handleCreateFolder}
              >
                <Text style={styles.newFolderBtnPrimaryText}>Create</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
