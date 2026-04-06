import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, TextInput, Modal, Alert, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import type { ThemePalette } from '@/constants/Themes';
import * as DocumentPicker from 'expo-document-picker';
import { generateFlashcardsFromPdfFile, generateFlashcardsFromPdf } from '@/src/lib/studyApi';
import { supabase } from '@/src/lib/supabase';

const MAX_BACK_LENGTH = 1200;

type AddButtonLayout = { x: number; y: number; width: number; height: number } | null;

// Plan-based card limits
const PLAN_CARD_LIMITS = {
  free: { max: 10, selectable: false },
  plus: { max: 20, selectable: false },
  pro: { max: 35, selectable: true, min: 10 },
} as const;

const CARD_COUNT_TIPS = [
  { range: '1-5 pages', cards: 10, tip: '10 cards covers key concepts from short notes' },
  { range: '5-15 pages', cards: 15, tip: '15 cards captures main ideas across chapters' },
  { range: '15-30 pages', cards: 20, tip: '20 cards ideal for lecture slides and medium docs' },
  { range: '30+ pages', cards: 35, tip: '35 cards for thorough exam prep from long documents' },
];

type PendingGeneration = {
  type: 'pdf';
  fileUri: string;
  fileName: string;
} | {
  type: 'note';
  noteTitle: string;
  noteContent: string;
};

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
      fontSize: 34,
      fontWeight: '800',
      color: theme.text,
      letterSpacing: -0.8,
      paddingHorizontal: 20,
      marginTop: 4,
      marginBottom: 4,
    },
    subtitle: { fontSize: 15, color: theme.textSecondary, paddingHorizontal: 20, marginBottom: 20 },
    listContent: { paddingHorizontal: 20, paddingBottom: 100 },
    listEmpty: { flexGrow: 1 },
    emptyMinimal: { paddingVertical: 32, alignItems: 'center' },
    emptyMinimalText: { fontSize: 15, color: theme.textSecondary },
    cardGroup: { backgroundColor: theme.card, overflow: 'hidden' },
    cardGroupFirst: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    cardGroupLast: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      position: 'relative',
    },
    cardRowPressed: { opacity: 0.7 },
    cardBody: { flex: 1, paddingRight: 8, minWidth: 0 },
    cardDeleteBtn: { padding: 6, marginRight: 4 },
    cardFront: { fontSize: 17, fontWeight: '600', color: theme.text, marginBottom: 2 },
    cardBack: { fontSize: 13, color: theme.textSecondary, lineHeight: 18 },
    divider: {
      position: 'absolute',
      bottom: 0,
      left: 16,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
    },
    bottomBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 20,
      paddingVertical: 16,
      paddingBottom: 32,
      backgroundColor: theme.background,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    startFlashcardBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 16,
      borderRadius: 14,
      width: '100%',
      backgroundColor: theme.primary,
    },
    startFlashcardBtnDisabled: { opacity: 0.5 },
    startFlashcardBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'center',
      padding: 24,
    },
    modalBox: {
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: theme.border,
    },
    modalTitle: { fontSize: 18, fontWeight: '800', color: theme.text },
    modalSub: { fontSize: 13, marginTop: 6, marginBottom: 16, color: theme.textSecondary },
    inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, color: theme.textSecondary },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      minHeight: 44,
      marginBottom: 16,
      backgroundColor: theme.background,
      color: theme.text,
    },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
    modalBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    modalBtnPrimary: { backgroundColor: theme.primary, borderColor: theme.primary },
    modalBtnText: { fontWeight: '600', color: theme.text },
    modalBtnTextPrimary: { color: '#fff', fontWeight: '700' },
    addMenuPanel: {
      backgroundColor: theme.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 14,
      elevation: 8,
      overflow: 'hidden',
    },
    addMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    addMenuItemText: { fontSize: 15, fontWeight: '600', color: theme.text },
    addMenuItemDisabled: { opacity: 0.5 },
    notesModalBox: {
      alignSelf: 'stretch',
      maxHeight: '80%',
      marginHorizontal: 20,
      marginTop: 80,
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: theme.border,
    },
    notesEmpty: { fontSize: 15, color: theme.textSecondary, textAlign: 'center', paddingVertical: 24 },
    notesList: { maxHeight: 320 },
    notesListContent: { paddingBottom: 8 },
    noteRow: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginBottom: 8,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
    },
    noteRowTitle: { fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 4 },
    noteRowSnippet: { fontSize: 13, color: theme.textSecondary, lineHeight: 18 },
    // Loading overlay
    loadingOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    loadingBox: {
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 28,
      alignItems: 'center',
      width: '100%',
      maxWidth: 320,
      borderWidth: 1,
      borderColor: theme.border,
    },
    loadingTitle: { fontSize: 17, fontWeight: '800', color: theme.text, marginTop: 16, marginBottom: 8 },
    loadingSubtitle: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  });
}

export default function FlashcardFolderScreen() {
  const { folderId, folderName } = useLocalSearchParams<{ folderId: string; folderName: string }>();
  const { user, notes, flashcardFolders, flashcards, addFlashcard, updateFlashcard, deleteFlashcard, deleteFlashcardFolder } = useApp();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const plan = (user.subscriptionPlan === 'plus' || user.subscriptionPlan === 'pro') ? user.subscriptionPlan : 'free';
  const planLimit = PLAN_CARD_LIMITS[plan];

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addMenuVisible, setAddMenuVisible] = useState(false);
  const [addButtonLayout, setAddButtonLayout] = useState<AddButtonLayout>(null);
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const addButtonRef = useRef<View>(null);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editCardId, setEditCardId] = useState('');
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');

  // Card count selection modal state
  const [countModalVisible, setCountModalVisible] = useState(false);
  const [selectedCardCount, setSelectedCardCount] = useState<number>(planLimit.max);
  const pendingGenerationRef = useRef<PendingGeneration | null>(null);

  // PDF AI generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStatus, setGeneratingStatus] = useState('');
  const isGeneratingRef = useRef(false);

  const folder = useMemo(() => flashcardFolders.find((f) => f.id === folderId), [flashcardFolders, folderId]);
  const notesForSubject = useMemo(() => {
    if (folder?.subjectId) return notes.filter((n) => n.subjectId === folder.subjectId);
    return notes;
  }, [notes, folder?.subjectId]);

  const folderCards = flashcards.filter((c) => c.folderId === folderId);

  const handleAddCard = () => {
    const f = front.trim();
    const b = back.trim();
    if (!f && !b) return;
    if (!folderId) return;
    addFlashcard(folderId, f || 'Front', b || 'Back');
    setFront('');
    setBack('');
    setAddModalVisible(false);
  };

  const handleDeleteCard = (cardId: string) => {
    Alert.alert('Delete card', 'Remove this flashcard?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteFlashcard(cardId) },
    ]);
  };

  const handleStartReview = () => {
    if (folderCards.length === 0) return;
    router.push({ pathname: '/flashcard-review', params: { folderId } } as any);
  };

  const handleOpenEdit = (card: { id: string; front?: string; back?: string }) => {
    setEditCardId(card.id);
    setEditFront(card.front ?? '');
    setEditBack(card.back ?? '');
    setEditModalVisible(true);
  };

  const handleSaveEdit = () => {
    if (!editCardId) return;
    updateFlashcard(editCardId, editFront, editBack);
    setEditModalVisible(false);
    setEditCardId('');
  };

  const openAddMenu = () => {
    addButtonRef.current?.measureInWindow((x, y, width, height) => {
      setAddButtonLayout({ x, y, width, height });
      setAddMenuVisible(true);
    });
  };
  const pendingPdfRef = useRef(false);
  const closeAddMenu = () => { setAddMenuVisible(false); setAddButtonLayout(null); };

  // When menu closes and PDF import was requested, open the picker
  useEffect(() => {
    if (!addMenuVisible && pendingPdfRef.current) {
      pendingPdfRef.current = false;
      // Give iOS time to fully dismiss the Modal before opening system picker
      const timer = setTimeout(() => {
        handleImportPdf();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [addMenuVisible]);

  const handleDeleteFolder = () => {
    if (!folderId || !folderName) return;
    Alert.alert(
      'Delete folder',
      folderCards.length > 0
        ? `Remove "${folderName}" and all ${folderCards.length} card${folderCards.length !== 1 ? 's' : ''}? This cannot be undone.`
        : `Remove "${folderName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { deleteFlashcardFolder(folderId); router.back(); } },
      ]
    );
  };

  const handleAddFromNote = (note: { id: string; title: string; content: string; attachmentFileName?: string }) => {
    if (!folderId) return;
    const hasSubstantialContent = note.content.trim().length > 100;

    if (hasSubstantialContent) {
      setNotesModalVisible(false);
      // Open card count selection modal
      pendingGenerationRef.current = { type: 'note', noteTitle: note.title, noteContent: note.content };
      setSelectedCardCount(planLimit.max);
      setCountModalVisible(true);
    } else {
      const backText = note.content.trim() || '(No content)';
      addFlashcard(folderId, note.title.trim() || 'Note', backText);
      setNotesModalVisible(false);
    }
  };

  const runNoteGeneration = async (noteTitle: string, noteContent: string, maxCards: number) => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setIsGenerating(true);
    setGeneratingStatus('Generating flashcards from note...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      const cards = await generateFlashcardsFromPdf(noteContent, userId, maxCards);

      if (cards.length === 0) {
        Alert.alert('No Flashcards', 'AI could not generate flashcards from this note content.');
        return;
      }

      setGeneratingStatus(`Adding ${cards.length} cards...`);
      let addedCount = 0;
      for (const card of cards) {
        const f = (card.front ?? '').trim();
        const b = (card.back ?? '').trim();
        if (f && b) {
          addFlashcard(folderId, f, b);
          addedCount++;
        }
      }

      Alert.alert(
        'Flashcards Generated! 🎉',
        `${addedCount} flashcard${addedCount !== 1 ? 's' : ''} created from "${noteTitle}".`,
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to generate flashcards.');
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
      setGeneratingStatus('');
    }
  };

  /* ─── PDF Import + AI Generation (single call) ─── */
  const handleImportPdf = async () => {
    if (isGeneratingRef.current) return;
    console.log('[Flashcard] Opening DocumentPicker...');

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
      });

      console.log('[Flashcard] Picker result:', JSON.stringify(result.canceled));

      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      const fileName = file.name ?? 'document.pdf';

      // Open card count selection modal
      pendingGenerationRef.current = { type: 'pdf', fileUri: file.uri, fileName };
      setSelectedCardCount(planLimit.max);
      setCountModalVisible(true);
    } catch (e) {
      console.log('[Flashcard] Picker error:', e);
    }
  };

  const runPdfGeneration = async (fileUri: string, fileName: string, maxCards: number) => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setIsGenerating(true);
    setGeneratingStatus('Uploading & generating flashcards...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      const { cards, error } = await generateFlashcardsFromPdfFile(fileUri, fileName, userId, maxCards);

      if (error || cards.length === 0) {
        Alert.alert(
          'Generation Failed',
          error || 'AI could not generate flashcards. Try a different PDF.',
        );
        return;
      }

      setGeneratingStatus(`Adding ${cards.length} cards...`);
      let addedCount = 0;
      for (const card of cards) {
        const f = (card.front ?? '').trim();
        const b = (card.back ?? '').trim();
        if (f && b) {
          addFlashcard(folderId, f, b);
          addedCount++;
        }
      }

      Alert.alert(
        'Flashcards Generated! 🎉',
        `${addedCount} flashcard${addedCount !== 1 ? 's' : ''} created from "${fileName}".`,
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to generate flashcards.');
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
      setGeneratingStatus('');
    }
  };

  /* ─── Confirm generation with selected card count ─── */
  const handleConfirmGeneration = () => {
    const pending = pendingGenerationRef.current;
    if (!pending) return;
    setCountModalVisible(false);
    pendingGenerationRef.current = null;

    const count = selectedCardCount;
    if (pending.type === 'pdf') {
      runPdfGeneration(pending.fileUri, pending.fileName, count);
    } else {
      runNoteGeneration(pending.noteTitle, pending.noteContent, count);
    }
  };

  // Get the matching tip for the current card count
  const currentTip = useMemo(() => {
    const sorted = [...CARD_COUNT_TIPS].reverse();
    return sorted.find((t) => selectedCardCount >= t.cards) ?? CARD_COUNT_TIPS[0];
  }, [selectedCardCount]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={28} color={theme.primary} />
            <Text style={styles.backText}>Study</Text>
          </Pressable>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={styles.iconBtn} onPress={handleDeleteFolder}>
            <Feather name="trash-2" size={22} color={theme.primary} />
          </Pressable>
          <View ref={addButtonRef} collapsable={false}>
            <Pressable style={styles.iconBtn} onPress={openAddMenu}>
              <Feather name="plus" size={24} color={theme.primary} />
            </Pressable>
          </View>
        </View>
      </View>

      <Text style={styles.pageTitle}>{folderName || 'Folder'}</Text>
      <Text style={styles.subtitle}>{folderCards.length} cards</Text>

      <FlatList
        data={folderCards}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, folderCards.length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          <View style={styles.emptyMinimal}>
            <Text style={styles.emptyMinimalText}>No cards yet — use + to add</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const frontText = item.front ?? (item as any).question ?? 'Front';
          const isLast = index === folderCards.length - 1;
          return (
            <View style={[styles.cardGroup, index === 0 && styles.cardGroupFirst, isLast && styles.cardGroupLast]}>
              <Pressable
                style={({ pressed }) => [styles.cardRow, pressed && styles.cardRowPressed]}
                onPress={() => {}}
              >
                <View style={styles.cardBody}>
                  <Text style={styles.cardFront} numberOfLines={2}>{frontText}</Text>
                  <Text style={styles.cardBack} numberOfLines={1}>
                    {item.back ?? (item as any).answer ?? 'Back'}
                  </Text>
                </View>
                <Pressable
                  style={styles.cardDeleteBtn}
                  onPress={() => handleDeleteCard(item.id)}
                  hitSlop={8}
                >
                  <Feather name="trash-2" size={18} color="#dc2626" />
                </Pressable>
                <Pressable
                  style={{ padding: 6 }}
                  onPress={() => handleOpenEdit(item)}
                  hitSlop={8}
                >
                  <Feather name="edit-2" size={16} color={theme.textSecondary} />
                </Pressable>
              </Pressable>
              {!isLast && <View style={styles.divider} />}
            </View>
          );
        }}
      />

      <View style={styles.bottomBar}>
        <Pressable
          style={[styles.startFlashcardBtn, folderCards.length === 0 && styles.startFlashcardBtnDisabled]}
          onPress={handleStartReview}
          disabled={folderCards.length === 0}
        >
          <Feather name="layers" size={20} color="#fff" />
          <Text style={styles.startFlashcardBtnText}>START FLASHCARD</Text>
        </Pressable>
      </View>

      {/* Add card manually modal */}
      <Modal visible={addModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setAddModalVisible(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Add flashcard</Text>
            <Text style={styles.modalSub}>Enter front and back. You can also add from PDF or from your notes via the + menu.</Text>
            <Text style={styles.inputLabel}>Front</Text>
            <TextInput
              style={styles.input}
              value={front}
              onChangeText={setFront}
              placeholder="Question or term"
              placeholderTextColor={theme.textSecondary}
              multiline
            />
            <Text style={styles.inputLabel}>Back</Text>
            <TextInput
              style={styles.input}
              value={back}
              onChangeText={setBack}
              placeholder="Answer or definition"
              placeholderTextColor={theme.textSecondary}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setAddModalVisible(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={handleAddCard}>
                <Text style={styles.modalBtnTextPrimary}>Add card</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add menu: dropdown anchored to + button */}
      <Modal visible={addMenuVisible} transparent animationType="none">
        <Pressable style={styles.modalOverlay} onPress={() => closeAddMenu()}>
          {addButtonLayout && (
            <View
              style={[
                styles.addMenuPanel,
                {
                  position: 'absolute',
                  top: addButtonLayout.y + addButtonLayout.height + 4,
                  right: 16,
                  left: undefined,
                  minWidth: 200,
                },
              ]}
              onStartShouldSetResponder={() => true}
            >
              <Pressable
                style={styles.addMenuItem}
                onPress={() => { closeAddMenu(); setAddModalVisible(true); }}
              >
                <Feather name="edit-3" size={20} color={theme.text} />
                <Text style={styles.addMenuItemText}>Add card manually</Text>
              </Pressable>
              <Pressable
                style={[styles.addMenuItem, isGenerating && styles.addMenuItemDisabled]}
                disabled={isGenerating}
                onPress={() => {
                  // Close menu immediately, set flag to open picker
                  setAddMenuVisible(false);
                  setAddButtonLayout(null);
                  pendingPdfRef.current = true;
                }}
              >
                <Feather name="file-text" size={20} color={theme.text} />
                <Text style={styles.addMenuItemText}>
                  {isGenerating ? 'Generating...' : 'Add from PDF'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.addMenuItem}
                onPress={() => { closeAddMenu(); setNotesModalVisible(true); }}
              >
                <Feather name="book" size={20} color={theme.text} />
                <Text style={styles.addMenuItemText}>Add from notes</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Modal>

      {/* Add from notes: list of notes */}
      <Modal visible={notesModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setNotesModalVisible(false)}>
          <View style={styles.notesModalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Add from notes</Text>
            <Text style={styles.modalSub}>
              {folder?.subjectId
                ? `Notes from ${folder.subjectId}. Tap a note to generate AI flashcards from its content.`
                : 'Tap a note to generate AI flashcards from its content.'}
            </Text>
            {notesForSubject.length === 0 ? (
              <Text style={styles.notesEmpty}>No notes yet. Add notes from the subject's notes screen first.</Text>
            ) : (
              <ScrollView style={styles.notesList} contentContainerStyle={styles.notesListContent}>
                {notesForSubject.map((note) => {
                  const isPdf = (note.attachmentFileName ?? '').toLowerCase().endsWith('.pdf');
                  const hasContent = note.content.trim().length > 100;
                  return (
                    <Pressable
                      key={note.id}
                      style={({ pressed }) => [styles.noteRow, pressed && styles.cardRowPressed]}
                      onPress={() => handleAddFromNote(note)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        {isPdf && (
                          <View style={{ backgroundColor: theme.primary + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: theme.primary }}>PDF</Text>
                          </View>
                        )}
                        <Text style={[styles.noteRowTitle, { marginBottom: 0, flex: 1 }]} numberOfLines={1}>{note.title}</Text>
                      </View>
                      <Text style={styles.noteRowSnippet} numberOfLines={2}>
                        {hasContent ? '🤖 AI will generate 15 flashcards' : note.content || '(No content)'}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <Pressable style={[styles.modalBtn, { alignSelf: 'stretch', marginTop: 12 }]} onPress={() => setNotesModalVisible(false)}>
              <Text style={styles.modalBtnText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Edit flashcard modal */}
      <Modal visible={editModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setEditModalVisible(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Edit flashcard</Text>
            <Text style={styles.modalSub}>Update the question and answer for this card.</Text>
            <Text style={styles.inputLabel}>Front (Question)</Text>
            <TextInput
              style={styles.input}
              value={editFront}
              onChangeText={setEditFront}
              placeholder="Question or term"
              placeholderTextColor={theme.textSecondary}
              multiline
            />
            <Text style={styles.inputLabel}>Back (Answer)</Text>
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              value={editBack}
              onChangeText={setEditBack}
              placeholder="Answer or definition"
              placeholderTextColor={theme.textSecondary}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={handleSaveEdit}>
                <Text style={styles.modalBtnTextPrimary}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Card count selection modal */}
      <Modal visible={countModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => { setCountModalVisible(false); pendingGenerationRef.current = null; }}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Generate Flashcards</Text>
            <Text style={styles.modalSub}>
              {pendingGenerationRef.current?.type === 'pdf'
                ? `From: ${(pendingGenerationRef.current as any).fileName}`
                : `From: ${(pendingGenerationRef.current as any)?.noteTitle ?? 'note'}`}
            </Text>

            {/* Plan badge */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 }}>
              <View style={{
                backgroundColor: plan === 'pro' ? '#8B5CF6' + '22' : plan === 'plus' ? theme.primary + '22' : theme.textSecondary + '22',
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
              }}>
                <Text style={{
                  fontSize: 12, fontWeight: '800', letterSpacing: 0.5,
                  color: plan === 'pro' ? '#8B5CF6' : plan === 'plus' ? theme.primary : theme.textSecondary,
                }}>
                  {plan.toUpperCase()} PLAN
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: theme.textSecondary }}>
                {plan === 'free' ? 'Up to 10 cards' : plan === 'plus' ? 'Up to 20 cards' : 'Up to 35 cards'}
              </Text>
            </View>

            {/* Card count display & selection */}
            {plan === 'pro' && planLimit.selectable ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 10 }}>
                  Number of flashcards: {selectedCardCount}
                </Text>
                {/* Slider-like button row */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[10, 15, 20, 25, 30, 35].map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => setSelectedCardCount(n)}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: selectedCardCount === n ? '#8B5CF6' : theme.border,
                        backgroundColor: selectedCardCount === n ? '#8B5CF6' + '18' : 'transparent',
                      }}
                    >
                      <Text style={{
                        fontSize: 14, fontWeight: '700',
                        color: selectedCardCount === n ? '#8B5CF6' : theme.text,
                      }}>
                        {n}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <View style={{
                backgroundColor: theme.background, borderRadius: 12, padding: 16,
                marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.border,
              }}>
                <Text style={{ fontSize: 32, fontWeight: '800', color: theme.primary }}>{planLimit.max}</Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2 }}>flashcards will be generated</Text>
              </View>
            )}

            {/* Tips section */}
            <View style={{
              backgroundColor: theme.background, borderRadius: 12, padding: 14,
              marginBottom: 16, borderWidth: 1, borderColor: theme.border,
            }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary, marginBottom: 8, letterSpacing: 0.3 }}>
                💡 TIPS
              </Text>
              {CARD_COUNT_TIPS.map((tip, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: i < CARD_COUNT_TIPS.length - 1 ? 6 : 0 }}>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, width: 80, fontWeight: '600' }}>{tip.range}</Text>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, flex: 1 }}>→ {tip.cards} cards — {tip.tip.split('cards ')[1] ?? tip.tip}</Text>
                </View>
              ))}
            </View>

            {/* Upsell for free & plus */}
            {plan !== 'pro' && (
              <View style={{
                backgroundColor: '#8B5CF6' + '0D', borderRadius: 12, padding: 14,
                marginBottom: 16, borderWidth: 1, borderColor: '#8B5CF6' + '33',
              }}>
                {plan === 'free' ? (
                  <>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#8B5CF6', marginBottom: 4 }}>
                      ✨ Unlock more with Plus & Pro
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 18 }}>
                      • Plus: Generate up to 20 flashcards per PDF{'\n'}
                      • Pro: Choose 10-35 cards with full control
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#8B5CF6', marginBottom: 4 }}>
                      ✨ Upgrade to Pro
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 18 }}>
                      Choose exactly how many flashcards (10-35) for thorough exam prep
                    </Text>
                  </>
                )}
              </View>
            )}

            {/* Actions */}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => { setCountModalVisible(false); pendingGenerationRef.current = null; }}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={handleConfirmGeneration}>
                <Text style={styles.modalBtnTextPrimary}>Generate {plan === 'pro' ? selectedCardCount : planLimit.max} Cards</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* AI generation loading overlay */}
      <Modal visible={isGenerating} transparent animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={styles.loadingTitle}>Generating Flashcards</Text>
            <Text style={styles.loadingSubtitle}>{generatingStatus}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}
