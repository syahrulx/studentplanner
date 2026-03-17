import { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Platform, Modal, TextInput, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';

const NAVY = '#003366';
const BG = '#f8fafc';
const CARD = '#ffffff';
const TEXT_PRIMARY = '#0f172a';
const TEXT_SECONDARY = '#94a3b8';
const DIVIDER = '#f1f5f9';

export default function SubjectFlashcardsScreen() {
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const { flashcardFolders, flashcards, addFlashcardFolder, deleteFlashcardFolder } = useApp();
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const foldersForSubject = useMemo(
    () => flashcardFolders.filter((f) => f.subjectId === subjectId),
    [flashcardFolders, subjectId]
  );

  const getCardCount = (folderId: string) => flashcards.filter((c) => c.folderId === folderId).length;

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    addFlashcardFolder(name, subjectId ?? undefined);
    setNewFolderName('');
    setShowNewFolder(false);
  };

  const openFolder = (folderId: string, folderName: string) => {
    router.push({ pathname: '/flashcard-folder' as any, params: { folderId, folderName } });
  };

  const handleDeleteFolder = (folderId: string, folderName: string, cardCount: number) => {
    Alert.alert(
      'Delete folder',
      cardCount > 0
        ? `Remove "${folderName}" and all ${cardCount} card${cardCount !== 1 ? 's' : ''}? This cannot be undone.`
        : `Remove "${folderName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteFlashcardFolder(folderId) },
      ]
    );
  };

  const emptyComponent = (
    <View style={styles.emptyWrap}>
      <Feather name="folder" size={42} color="#cbd5e1" style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>No folders yet</Text>
      <Text style={styles.emptySub}>
        Tap &quot;Add folder&quot; to create a chapter or topic, then add cards inside.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={28} color={NAVY} />
            <Text style={styles.backText}>Study</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.pageTitle}>{subjectId} Flashcards</Text>

      <View style={styles.folderRow}>
        <Pressable style={[styles.folderChip, styles.folderChipAdd]} onPress={() => setShowNewFolder(true)}>
          <Feather name="folder-plus" size={14} color={NAVY} />
          <Text style={[styles.folderChipText, { color: NAVY, fontWeight: '700' }]}>Add folder</Text>
        </Pressable>
      </View>

      <FlatList
        data={foldersForSubject}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, foldersForSubject.length === 0 && styles.listEmpty]}
        ListEmptyComponent={emptyComponent}
        renderItem={({ item, index }) => {
          const isLast = index === foldersForSubject.length - 1;
          const count = getCardCount(item.id);
          return (
            <View style={[styles.cardGroup, index === 0 && styles.cardGroupFirst, isLast && styles.cardGroupLast]}>
              <Pressable
                style={({ pressed }) => [styles.folderRowItem, pressed && { backgroundColor: '#f8fafc' }]}
                onPress={() => openFolder(item.id, item.name)}
                onLongPress={() => handleDeleteFolder(item.id, item.name, count)}
              >
                <View style={styles.folderRowBody}>
                  <Text style={styles.folderRowTitle} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.folderRowMeta}>{count} card{count !== 1 ? 's' : ''}</Text>
                </View>
                <View style={styles.folderRowMetaRight}>
                  <Pressable
                    style={styles.folderDeleteBtn}
                    onPress={() => handleDeleteFolder(item.id, item.name, count)}
                    hitSlop={8}
                  >
                    <Feather name="trash-2" size={18} color="#dc2626" />
                  </Pressable>
                  <Feather name="chevron-right" size={16} color="#cbd5e1" />
                </View>
                {!isLast && <View style={styles.divider} />}
              </Pressable>
            </View>
          );
        }}
      />

      <Modal visible={showNewFolder} transparent animationType="fade">
        <Pressable style={styles.menuBackdrop} onPress={() => setShowNewFolder(false)}>
          <View style={styles.newFolderPanel} onStartShouldSetResponder={() => true}>
            <Text style={styles.newFolderTitle}>New folder</Text>
            <Text style={styles.newFolderHint}>e.g. Chapter 1, Topic 2</Text>
            <TextInput
              style={styles.newFolderInput}
              value={newFolderName}
              onChangeText={setNewFolderName}
              placeholder="Folder name"
              placeholderTextColor={TEXT_SECONDARY}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
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
  pageTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: -0.8,
    paddingHorizontal: 20,
    marginBottom: 20,
    marginTop: 4,
  },
  folderRow: { paddingHorizontal: 20, marginBottom: 14 },
  folderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    maxWidth: 160,
  },
  folderChipAdd: { backgroundColor: 'rgba(0,51,102,0.06)', borderWidth: 1, borderColor: 'rgba(0,51,102,0.12)' },
  folderChipText: { fontSize: 12, fontWeight: '600', color: TEXT_SECONDARY },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  listEmpty: { flexGrow: 1 },
  cardGroup: { backgroundColor: CARD, overflow: 'hidden' },
  cardGroupFirst: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  cardGroupLast: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  folderRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    position: 'relative',
  },
  folderRowBody: { flex: 1, paddingRight: 16 },
  folderRowTitle: { fontSize: 17, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: 2 },
  folderRowMeta: { fontSize: 13, color: TEXT_SECONDARY },
  folderRowMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  folderDeleteBtn: { padding: 6 },
  divider: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: DIVIDER,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: 60,
  },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: 8 },
  emptySub: { fontSize: 15, color: TEXT_SECONDARY, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  newFolderPanel: {
    width: '100%',
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: DIVIDER,
  },
  newFolderTitle: { fontSize: 16, fontWeight: '800', color: TEXT_PRIMARY, marginBottom: 4 },
  newFolderHint: { fontSize: 13, color: TEXT_SECONDARY, marginBottom: 10 },
  newFolderInput: {
    borderWidth: 1,
    borderColor: DIVIDER,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: TEXT_PRIMARY,
    marginBottom: 12,
  },
  newFolderActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  newFolderBtnGhost: { paddingHorizontal: 12, paddingVertical: 10 },
  newFolderBtnGhostText: { fontSize: 15, fontWeight: '700', color: TEXT_SECONDARY },
  newFolderBtnPrimary: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: NAVY },
  newFolderBtnPrimaryText: { fontSize: 15, fontWeight: '800', color: '#ffffff' },
});
