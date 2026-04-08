import { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Platform,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useTheme, useThemeId } from '@/hooks/useTheme';
import { isDarkTheme, type ThemePalette } from '@/constants/Themes';
import { useTranslations } from '@/src/i18n';
import type { Flashcard } from '@/src/types';

function createStyles(theme: ThemePalette) {
  const scrim = isDarkTheme(theme.id) ? 'rgba(0,0,0,0.72)' : 'rgba(15,23,42,0.45)';
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'ios' ? 56 : 40,
      paddingBottom: 12,
      gap: 12,
    },
    backWrap: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: { flex: 1 },
    headerTitle: { fontSize: 20, fontWeight: '800', color: theme.text, letterSpacing: -0.4 },
    headerSub: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginTop: 4 },
    list: { flex: 1, paddingHorizontal: 16 },
    listContent: { paddingBottom: 24, gap: 10 },
    row: {
      backgroundColor: theme.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    rowMain: { flex: 1, minWidth: 0 },
    rowQuestion: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.text,
      lineHeight: 22,
      marginBottom: 6,
    },
    rowAnswer: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.textSecondary,
      lineHeight: 20,
    },
    rowTools: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 },
    toolHit: { padding: 8 },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      backgroundColor: theme.background,
    },
    startBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: theme.primary,
      paddingVertical: 16,
      borderRadius: 16,
    },
    startBtnPressed: { backgroundColor: theme.secondary },
    startBtnText: {
      fontSize: 15,
      fontWeight: '900',
      color: theme.textInverse,
      letterSpacing: 0.8,
    },
    emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    emptyText: { fontSize: 16, color: theme.textSecondary, textAlign: 'center' },
    modalOverlay: {
      flex: 1,
      backgroundColor: scrim,
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 20,
      paddingTop: 16,
      borderWidth: 1,
      borderColor: theme.border,
      maxHeight: '88%',
    },
    modalTitle: { fontSize: 18, fontWeight: '800', color: theme.text, marginBottom: 16 },
    modalLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textSecondary,
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    modalInput: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 14,
      fontSize: 16,
      color: theme.text,
      backgroundColor: theme.backgroundSecondary,
      minHeight: 88,
      textAlignVertical: 'top',
      marginBottom: 14,
    },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 8 },
    modalGhost: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
    },
    modalGhostText: { fontSize: 15, fontWeight: '700', color: theme.textSecondary },
    modalPrimary: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: theme.primary,
      alignItems: 'center',
    },
    modalPrimaryText: { fontSize: 15, fontWeight: '800', color: theme.textInverse },
  });
}

export default function FlashcardDeckPreview() {
  const { noteId } = useLocalSearchParams<{ noteId?: string }>();
  const { flashcards, notes, deleteFlashcard, updateFlashcard, language } = useApp();
  const theme = useTheme();
  const themeId = useThemeId();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const T = useTranslations(language);
  const insets = useSafeAreaInsets();
  const statusBarStyle = isDarkTheme(themeId) ? 'light' : 'dark';

  const [editing, setEditing] = useState<Flashcard | null>(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');

  const note = useMemo(
    () => (noteId ? notes.find((n) => n.id === noteId) : undefined),
    [notes, noteId],
  );

  const deck = useMemo(() => {
    if (!noteId) return [];
    return flashcards.filter((c) => c.noteId === noteId);
  }, [flashcards, noteId]);

  const openEdit = useCallback((c: Flashcard) => {
    setEditing(c);
    setEditFront(c.front);
    setEditBack(c.back);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editing) return;
    const f = editFront.trim();
    const b = editBack.trim();
    if (!f || !b) return;
    updateFlashcard(editing.id, f, b);
    setEditing(null);
  }, [editing, editFront, editBack, updateFlashcard]);

  const confirmDelete = useCallback(
    (c: Flashcard) => {
      Alert.alert(T('deckPreviewDeleteCard'), T('deckPreviewDeleteConfirm'), [
        { text: T('close'), style: 'cancel' },
        {
          text: T('delete'),
          style: 'destructive',
          onPress: () => deleteFlashcard(c.id),
        },
      ]);
    },
    [T, deleteFlashcard],
  );

  const startReview = useCallback(() => {
    if (!noteId) return;
    router.push({ pathname: '/flashcard-review' as any, params: { noteId } });
  }, [noteId]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (noteId) {
      router.replace({ pathname: '/notes-editor' as any, params: { noteId, openDeck: '1' } });
      return;
    }
    router.replace('/flashcard-pick' as any);
  }, [noteId]);

  if (!noteId) {
    return (
      <View style={[styles.root, { justifyContent: 'center', padding: 24 }]}>
        <StatusBar style={statusBarStyle} />
        <Text style={styles.emptyText}>{T('flashcardReviewNoteNotFound')}</Text>
        <Pressable style={[styles.startBtn, { marginTop: 20 }]} onPress={handleBack}>
          <Text style={styles.startBtnText}>{T('back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style={statusBarStyle} />
      <View style={styles.header}>
        <Pressable style={styles.backWrap} onPress={handleBack}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{T('deckPreviewTitle')}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {note?.title ?? noteId} · {T('deckPreviewCardMeta').replace('{n}', String(deck.length))}
          </Text>
        </View>
      </View>

      {deck.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{T('deckPreviewEmpty')}</Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={deck}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowQuestion} numberOfLines={3}>
                  {item.front}
                </Text>
                <Text style={styles.rowAnswer} numberOfLines={2} ellipsizeMode="tail">
                  {item.back}
                </Text>
              </View>
              <View style={styles.rowTools}>
                <Pressable style={styles.toolHit} onPress={() => confirmDelete(item)} hitSlop={6}>
                  <Feather name="trash-2" size={18} color={theme.danger} />
                </Pressable>
                <Pressable style={styles.toolHit} onPress={() => openEdit(item)} hitSlop={6}>
                  <Feather name="edit-2" size={18} color={theme.textSecondary} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      {deck.length > 0 && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            style={({ pressed }) => [styles.startBtn, pressed && styles.startBtnPressed]}
            onPress={startReview}
          >
            <Feather name="layers" size={22} color={theme.textInverse} />
            <Text style={styles.startBtnText}>{T('deckPreviewStartCta')}</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={!!editing} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setEditing(null)} />
          <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Text style={styles.modalTitle}>{T('deckPreviewEditCard')}</Text>
            <Text style={styles.modalLabel}>Front / question</Text>
            <TextInput
              style={styles.modalInput}
              value={editFront}
              onChangeText={setEditFront}
              multiline
              placeholderTextColor={theme.textSecondary}
              placeholder="Question"
            />
            <Text style={styles.modalLabel}>Back / answer</Text>
            <TextInput
              style={styles.modalInput}
              value={editBack}
              onChangeText={setEditBack}
              multiline
              placeholderTextColor={theme.textSecondary}
              placeholder="Answer"
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalGhost} onPress={() => setEditing(null)}>
                <Text style={styles.modalGhostText}>{T('close')}</Text>
              </Pressable>
              <Pressable style={styles.modalPrimary} onPress={saveEdit}>
                <Text style={styles.modalPrimaryText}>{T('deckPreviewSaveCard')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
