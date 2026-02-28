import { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, TextInput, Modal, Alert } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Icons } from '@/src/constants';
import { ThemeIcon } from '@/components/ThemeIcon';

export default function FlashcardsScreen() {
  const { flashcardFolders, addFlashcardFolder, deleteFlashcardFolder, flashcards } = useApp();
  const theme = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const getCardCount = (folderId: string) => flashcards.filter((c) => c.folderId === folderId).length;

  const handleAddFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    addFlashcardFolder(name);
    setNewFolderName('');
    setModalVisible(false);
  };

  const handleDeleteFolder = (folderId: string, folderName: string) => {
    Alert.alert(
      'Delete folder',
      `Delete "${folderName}" and all its flashcards?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteFlashcardFolder(folderId) },
      ]
    );
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
          <Text style={[styles.title, { color: theme.text }]}>Flashcards</Text>
          <View style={styles.headerRight}>
            <Pressable
              style={[styles.addFolderBtn, { backgroundColor: theme.primary }]}
              onPress={() => setModalVisible(true)}
            >
              <Feather name="folder-plus" size={18} color="#fff" />
              <Text style={styles.addFolderBtnText}>Add folder</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={[styles.sectionBox, styles.sectionBoxList, { backgroundColor: boxTone, borderColor: cardBorder }]}>
        <FlatList
          data={flashcardFolders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          style={styles.listScroll}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemeIcon name="layers" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No folders yet</Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
              Add a folder for a subject, semester, or topic. Then add flashcards inside.
            </Text>
            <Pressable
              style={[styles.emptyBtn, { backgroundColor: theme.primary }]}
              onPress={() => setModalVisible(true)}
            >
              <Text style={styles.emptyBtnText}>Add your first folder</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => {
          const count = getCardCount(item.id);
          return (
            <Pressable
              style={({ pressed }) => [
                styles.folderCard,
                { backgroundColor: theme.card, borderColor: theme.border },
                pressed && styles.pressed,
              ]}
              onPress={() => router.push({ pathname: '/flashcard-folder', params: { folderId: item.id, folderName: item.name } } as any)}
              onLongPress={() => handleDeleteFolder(item.id, item.name)}
            >
              <View style={[styles.folderIconWrap, { backgroundColor: theme.backgroundSecondary }]}>
                <Feather name="folder" size={24} color={theme.primary} />
              </View>
              <View style={styles.folderBody}>
                <Text style={[styles.folderName, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.folderMeta, { color: theme.textSecondary }]}>
                  {count} {count === 1 ? 'card' : 'cards'}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={theme.textSecondary} />
            </Pressable>
          );
        }}
        />
      </View>

      <Modal visible={modalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>New folder</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              Name it by subject, semester, or topic (e.g. CSC584, Sem 1, Chapter 3).
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              value={newFolderName}
              onChangeText={setNewFolderName}
              placeholder="Folder name"
              placeholderTextColor={theme.textSecondary}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { borderColor: theme.border }]} onPress={() => setModalVisible(false)}>
                <Text style={[styles.modalBtnText, { color: theme.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: theme.primary }]}
                onPress={handleAddFolder}
              >
                <Text style={styles.modalBtnTextPrimary}>Add folder</Text>
              </Pressable>
            </View>
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
  title: { flex: 1, fontSize: 18, fontWeight: '800' },
  headerRight: {},
  addFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  addFolderBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  listScroll: { flexGrow: 1 },
  list: { paddingBottom: 24 },
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  pressed: { opacity: 0.95 },
  folderIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  folderBody: { flex: 1, minWidth: 0 },
  folderName: { fontSize: 16, fontWeight: '700' },
  folderMeta: { fontSize: 12, marginTop: 2 },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: 16 },
  emptySub: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyBtn: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
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
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
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
});
