import { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, TextInput, Modal, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Icons } from '@/src/constants';
import { ThemeIcon } from '@/components/ThemeIcon';

export default function FlashcardFolderScreen() {
  const { folderId, folderName } = useLocalSearchParams<{ folderId: string; folderName: string }>();
  const { flashcards, addFlashcard, deleteFlashcard } = useApp();
  const theme = useTheme();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [pdfModalVisible, setPdfModalVisible] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');

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

  const boxTone = theme.backgroundSecondary;
  const cardBorder = theme.border;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.sectionBox, styles.sectionBoxFirst, { backgroundColor: boxTone, borderColor: cardBorder }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Icons.ArrowRight size={20} color={theme.text} style={{ transform: [{ rotate: '180deg' }] }} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{folderName || 'Folder'}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{folderCards.length} cards</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [styles.addCardBtn, { backgroundColor: theme.primary }, pressed && styles.pressed]}
              onPress={() => setAddModalVisible(true)}
            >
              <Icons.Plus size={22} color="#fff" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.addPdfBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]}
              onPress={() => setPdfModalVisible(true)}
            >
              <Feather name="file-text" size={22} color={theme.primary} />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={[styles.sectionBox, styles.sectionBoxList, { backgroundColor: boxTone, borderColor: cardBorder }]}>
        <FlatList
          data={folderCards}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          style={styles.listScroll}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemeIcon name="layers" size={40} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No flashcards yet</Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
              Add cards manually or (later) from a PDF topic — AI will generate them.
            </Text>
            <Pressable
              style={[styles.emptyBtn, { backgroundColor: theme.primary }]}
              onPress={() => setAddModalVisible(true)}
            >
              <Text style={styles.emptyBtnText}>Add first card</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => {
          const frontText = item.front ?? (item as any).question ?? 'Front';
          return (
            <Pressable
              style={({ pressed }) => [
                styles.cardRow,
                { backgroundColor: theme.card, borderColor: theme.border },
                pressed && styles.pressed,
              ]}
              onLongPress={() => handleDeleteCard(item.id)}
            >
              <View style={styles.cardBody}>
                <Text style={[styles.cardFront, { color: theme.text }]} numberOfLines={2}>{frontText}</Text>
                <Text style={[styles.cardBack, { color: theme.textSecondary }]} numberOfLines={1}>
                  {item.back ?? (item as any).answer ?? 'Back'}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={theme.textSecondary} />
            </Pressable>
          );
        }}
        />
      </View>

      <View style={[styles.bottomBar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        <Pressable
          style={({ pressed }) => [
            styles.startFlashcardBtn,
            { backgroundColor: theme.primary },
            folderCards.length === 0 && styles.startFlashcardBtnDisabled,
            pressed && folderCards.length > 0 && styles.pressed,
          ]}
          onPress={handleStartReview}
          disabled={folderCards.length === 0}
        >
          <ThemeIcon name="layers" size={20} color="#fff" />
          <Text style={styles.startFlashcardBtnText}>START FLASHCARD</Text>
        </Pressable>
      </View>

      <Modal visible={addModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setAddModalVisible(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add flashcard</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              Enter front and back. (Later: add from PDF and AI will generate cards.)
            </Text>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Front</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              value={front}
              onChangeText={setFront}
              placeholder="Question or term"
              placeholderTextColor={theme.textSecondary}
              multiline
            />
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Back</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              value={back}
              onChangeText={setBack}
              placeholder="Answer or definition"
              placeholderTextColor={theme.textSecondary}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { borderColor: theme.border }]} onPress={() => setAddModalVisible(false)}>
                <Text style={[styles.modalBtnText, { color: theme.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: theme.primary }]}
                onPress={handleAddCard}
              >
                <Text style={styles.modalBtnTextPrimary}>Add card</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={pdfModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setPdfModalVisible(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add from PDF</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              Upload a PDF and AI will generate flashcards for this folder. This feature is coming soon.
            </Text>
            <Pressable
              style={[styles.pdfInputPlaceholder, { backgroundColor: theme.background, borderColor: theme.border }]}
              onPress={() => {}}
            >
              <Feather name="upload-cloud" size={32} color={theme.textSecondary} />
              <Text style={[styles.pdfInputPlaceholderText, { color: theme.textSecondary }]}>Drop PDF or tap to select</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, { borderColor: theme.border, alignSelf: 'stretch' }]}
              onPress={() => setPdfModalVisible(false)}
            >
              <Text style={[styles.modalBtnText, { color: theme.text }]}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const L = { pad: 12, section: 24, cardPad: 20, radius: 20 };

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56 },
  sectionBox: { marginHorizontal: L.pad, marginBottom: L.section, padding: L.cardPad, borderRadius: L.radius, borderWidth: 1 },
  sectionBoxFirst: { marginTop: 20 },
  sectionBoxList: { flex: 1, marginBottom: L.section },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  headerCenter: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addCardBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPdfBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  listScroll: { flexGrow: 1 },
  list: { paddingBottom: 100 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  pressed: { opacity: 0.95 },
  cardBody: { flex: 1, minWidth: 0 },
  cardFront: { fontSize: 15, fontWeight: '700' },
  cardBack: { fontSize: 13, marginTop: 4 },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: 16 },
  emptySub: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyBtn: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
  },
  startFlashcardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    width: '100%',
  },
  startFlashcardBtnDisabled: { opacity: 0.5 },
  startFlashcardBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSub: { fontSize: 13, marginTop: 6, marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 44,
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  modalBtnPrimary: {},
  modalBtnText: { fontWeight: '600' },
  modalBtnTextPrimary: { color: '#fff', fontWeight: '700' },
  pdfInputPlaceholder: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pdfInputPlaceholderText: { fontSize: 14, marginTop: 8 },
});
