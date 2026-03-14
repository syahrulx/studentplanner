import { useMemo, useState, useRef } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, TextInput, Modal, Alert, Platform, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';

const NAVY = '#003366';
const BG = '#f8fafc';
const CARD = '#ffffff';
const TEXT_PRIMARY = '#0f172a';
const TEXT_SECONDARY = '#94a3b8';
const DIVIDER = '#f1f5f9';
const MAX_BACK_LENGTH = 1200;

type AddButtonLayout = { x: number; y: number; width: number; height: number } | null;

export default function FlashcardFolderScreen() {
  const { folderId, folderName } = useLocalSearchParams<{ folderId: string; folderName: string }>();
  const { notes, flashcardFolders, flashcards, addFlashcard, deleteFlashcard, deleteFlashcardFolder } = useApp();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addMenuVisible, setAddMenuVisible] = useState(false);
  const [addButtonLayout, setAddButtonLayout] = useState<AddButtonLayout>(null);
  const [pdfModalVisible, setPdfModalVisible] = useState(false);
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const addButtonRef = useRef<View>(null);

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

  const openAddMenu = () => {
    addButtonRef.current?.measureInWindow((x, y, width, height) => {
      setAddButtonLayout({ x, y, width, height });
      setAddMenuVisible(true);
    });
  };
  const closeAddMenu = () => { setAddMenuVisible(false); setAddButtonLayout(null); };

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

  const handleAddFromNote = (note: { id: string; title: string; content: string }) => {
    if (!folderId) return;
    const backText = note.content.trim().length > MAX_BACK_LENGTH
      ? note.content.trim().slice(0, MAX_BACK_LENGTH) + '…'
      : note.content.trim() || '(No content)';
    addFlashcard(folderId, note.title.trim() || 'Note', backText);
    setNotesModalVisible(false);
    closeAddMenu();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={28} color={NAVY} />
            <Text style={styles.backText}>Study</Text>
          </Pressable>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={styles.iconBtn} onPress={handleDeleteFolder}>
            <Feather name="trash-2" size={22} color={NAVY} />
          </Pressable>
          <View ref={addButtonRef} collapsable={false}>
            <Pressable style={styles.iconBtn} onPress={openAddMenu}>
              <Feather name="plus" size={24} color={NAVY} />
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
                <Feather name="chevron-right" size={16} color="#cbd5e1" />
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
              placeholderTextColor={TEXT_SECONDARY}
              multiline
            />
            <Text style={styles.inputLabel}>Back</Text>
            <TextInput
              style={styles.input}
              value={back}
              onChangeText={setBack}
              placeholder="Answer or definition"
              placeholderTextColor={TEXT_SECONDARY}
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

      <Modal visible={pdfModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setPdfModalVisible(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Add from PDF</Text>
            <Text style={styles.modalSub}>
              Upload a PDF and AI will generate flashcards for this folder. This feature is coming soon.
            </Text>
            <Pressable style={styles.pdfInputPlaceholder} onPress={() => {}}>
              <Feather name="upload-cloud" size={32} color={TEXT_SECONDARY} />
              <Text style={styles.pdfInputPlaceholderText}>Drop PDF or tap to select</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, { alignSelf: 'stretch' }]} onPress={() => setPdfModalVisible(false)}>
              <Text style={styles.modalBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add menu: dropdown anchored to + button */}
      <Modal visible={addMenuVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={closeAddMenu}>
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
                <Feather name="edit-3" size={20} color={TEXT_PRIMARY} />
                <Text style={styles.addMenuItemText}>Add card manually</Text>
              </Pressable>
              <Pressable
                style={styles.addMenuItem}
                onPress={() => { closeAddMenu(); setPdfModalVisible(true); }}
              >
                <Feather name="file-text" size={20} color={TEXT_PRIMARY} />
                <Text style={styles.addMenuItemText}>Add from PDF</Text>
              </Pressable>
              <Pressable
                style={styles.addMenuItem}
                onPress={() => { closeAddMenu(); setNotesModalVisible(true); }}
              >
                <Feather name="book" size={20} color={TEXT_PRIMARY} />
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
                ? `Notes from ${folder.subjectId}. Tap a note to create one flashcard (front = title, back = content).`
                : 'Tap a note to create one flashcard (front = title, back = content).'}
            </Text>
            {notesForSubject.length === 0 ? (
              <Text style={styles.notesEmpty}>No notes yet. Add notes from the subject’s notes screen first.</Text>
            ) : (
              <ScrollView style={styles.notesList} contentContainerStyle={styles.notesListContent}>
                {notesForSubject.map((note) => (
                  <Pressable
                    key={note.id}
                    style={({ pressed }) => [styles.noteRow, pressed && styles.cardRowPressed]}
                    onPress={() => handleAddFromNote(note)}
                  >
                    <Text style={styles.noteRowTitle} numberOfLines={1}>{note.title}</Text>
                    <Text style={styles.noteRowSnippet} numberOfLines={2}>{note.content}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Pressable style={[styles.modalBtn, { alignSelf: 'stretch', marginTop: 12 }]} onPress={() => setNotesModalVisible(false)}>
              <Text style={styles.modalBtnText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, paddingTop: Platform.OS === 'ios' ? 0 : 0 },
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
  backText: { fontSize: 17, color: NAVY, fontWeight: '400', marginTop: -1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingRight: 8 },
  iconBtn: { padding: 4 },
  pageTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: -0.8,
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 4,
  },
  subtitle: { fontSize: 15, color: TEXT_SECONDARY, paddingHorizontal: 20, marginBottom: 20 },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  listEmpty: { flexGrow: 1 },
  emptyMinimal: { paddingVertical: 32, alignItems: 'center' },
  emptyMinimalText: { fontSize: 15, color: TEXT_SECONDARY },
  cardGroup: { backgroundColor: CARD, overflow: 'hidden' },
  cardGroupFirst: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  cardGroupLast: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    position: 'relative',
  },
  cardRowPressed: { backgroundColor: '#f8fafc' },
  cardBody: { flex: 1, paddingRight: 8, minWidth: 0 },
  cardDeleteBtn: { padding: 6, marginRight: 4 },
  cardFront: { fontSize: 17, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: 2 },
  cardBack: { fontSize: 13, color: TEXT_SECONDARY, lineHeight: 18 },
  divider: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: DIVIDER,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: DIVIDER,
  },
  startFlashcardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    width: '100%',
    backgroundColor: NAVY,
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
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: DIVIDER,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: TEXT_PRIMARY },
  modalSub: { fontSize: 13, marginTop: 6, marginBottom: 16, color: TEXT_SECONDARY },
  inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, color: TEXT_SECONDARY },
  input: {
    borderWidth: 1,
    borderColor: DIVIDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 44,
    marginBottom: 16,
    backgroundColor: BG,
    color: TEXT_PRIMARY,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: DIVIDER,
  },
  modalBtnPrimary: { backgroundColor: NAVY, borderColor: NAVY },
  modalBtnText: { fontWeight: '600', color: TEXT_PRIMARY },
  modalBtnTextPrimary: { color: '#fff', fontWeight: '700' },
  pdfInputPlaceholder: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: DIVIDER,
    borderRadius: 14,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: BG,
  },
  pdfInputPlaceholderText: { fontSize: 14, marginTop: 8, color: TEXT_SECONDARY },
  addMenuPanel: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DIVIDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
    overflow: 'hidden',
  },
  addMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  addMenuItemText: { fontSize: 15, fontWeight: '600', color: TEXT_PRIMARY },
  notesModalBox: {
    alignSelf: 'stretch',
    maxHeight: '80%',
    marginHorizontal: 20,
    marginTop: 80,
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: DIVIDER,
  },
  notesEmpty: { fontSize: 15, color: TEXT_SECONDARY, textAlign: 'center', paddingVertical: 24 },
  notesList: { maxHeight: 320 },
  notesListContent: { paddingBottom: 8 },
  noteRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: DIVIDER,
  },
  noteRowTitle: { fontSize: 16, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: 4 },
  noteRowSnippet: { fontSize: 13, color: TEXT_SECONDARY, lineHeight: 18 },
});
