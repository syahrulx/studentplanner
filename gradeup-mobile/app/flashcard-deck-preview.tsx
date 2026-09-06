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
  ActivityIndicator,
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
import { cardFaces, dueCounts, formatInterval, isDue } from '@/src/lib/fsrs';

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
    statsCard: {
      marginHorizontal: 16,
      marginBottom: 12,
      backgroundColor: theme.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 12,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    statsDue: { alignItems: 'center', minWidth: 56 },
    statsDueValue: { fontSize: 24, fontWeight: '900', color: theme.primary },
    statsDueLabel: { fontSize: 10, fontWeight: '800', color: theme.textSecondary, letterSpacing: 1, textTransform: 'uppercase' },
    statsBody: { flex: 1 },
    statsLine: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, lineHeight: 17 },
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
    rowBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
    rowBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: `${theme.primary}14`,
    },
    rowBadgeText: { fontSize: 10, fontWeight: '800', color: theme.primary, letterSpacing: 0.8 },
    rowBadgeMuted: { backgroundColor: theme.backgroundSecondary },
    rowBadgeMutedText: { color: theme.textSecondary },
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
    rowHint: {
      fontSize: 12,
      fontStyle: 'italic',
      color: theme.textSecondary,
      marginTop: 6,
    },
    rowTools: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 },
    toolHit: { padding: 8 },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      backgroundColor: theme.background,
      gap: 10,
    },
    footerRow: { flexDirection: 'row', gap: 10 },
    startBtn: {
      flex: 1,
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
    ghostBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 16,
      borderRadius: 16,
    },
    ghostBtnText: { fontSize: 14, fontWeight: '800', color: theme.text, letterSpacing: 0.4 },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
    addBtnText: { fontSize: 13, fontWeight: '800', color: theme.textSecondary, letterSpacing: 0.4 },
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
      justifyContent: 'center',
      minHeight: 48,
    },
    modalPrimaryDisabled: { opacity: 0.5 },
    modalPrimaryText: { fontSize: 15, fontWeight: '800', color: theme.textInverse },
  });
}

type EditorState =
  | { kind: 'edit'; card: Flashcard }
  | { kind: 'add' }
  | null;

export default function FlashcardDeckPreview() {
  const { noteId } = useLocalSearchParams<{ noteId?: string }>();
  const { flashcards, notes, deleteFlashcard, updateFlashcard, addFlashcards, language } = useApp();
  const theme = useTheme();
  const themeId = useThemeId();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const T = useTranslations(language);
  const insets = useSafeAreaInsets();
  const statusBarStyle = isDarkTheme(themeId) ? 'light' : 'dark';

  const [editor, setEditor] = useState<EditorState>(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [saving, setSaving] = useState(false);

  const note = useMemo(
    () => (noteId ? notes.find((n) => n.id === noteId) : undefined),
    [notes, noteId],
  );

  const deck = useMemo(() => {
    if (!noteId) return [];
    return flashcards
      .filter((c) => c.noteId === noteId)
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [flashcards, noteId]);

  const now = useMemo(() => new Date(), [deck]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => dueCounts(deck, now), [deck, now]);

  const openEdit = useCallback((c: Flashcard) => {
    setEditor({ kind: 'edit', card: c });
    setEditFront(c.front);
    setEditBack(c.back);
  }, []);

  const openAdd = useCallback(() => {
    setEditor({ kind: 'add' });
    setEditFront('');
    setEditBack('');
  }, []);

  const closeEditor = useCallback(() => {
    if (saving) return;
    setEditor(null);
  }, [saving]);

  const saveEditor = useCallback(async () => {
    if (!editor || !noteId || saving) return;
    const f = editFront.trim();
    const b = editBack.trim();
    if (!f || !b) return;
    setSaving(true);
    try {
      if (editor.kind === 'edit') {
        const ok = await updateFlashcard(editor.card.id, f, b);
        if (ok) setEditor(null);
      } else {
        await addFlashcards(noteId, [{ front: f, back: b, cardType: 'basic' }]);
        setEditor(null);
      }
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : T('deckPreviewAddFailed');
      Alert.alert(T('deckPreviewAddCardTitle'), msg);
    } finally {
      setSaving(false);
    }
  }, [editor, noteId, saving, editFront, editBack, updateFlashcard, addFlashcards, T]);

  const confirmDelete = useCallback(
    (c: Flashcard) => {
      Alert.alert(T('deckPreviewDeleteCard'), T('deckPreviewDeleteConfirm'), [
        { text: T('close'), style: 'cancel' },
        {
          text: T('delete'),
          style: 'destructive',
          onPress: () => {
            void deleteFlashcard(c.id);
          },
        },
      ]);
    },
    [T, deleteFlashcard],
  );

  const startReview = useCallback((mode: 'deck' | 'due') => {
    if (!noteId) return;
    router.push({ pathname: '/flashcard-review' as any, params: { noteId, mode } });
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

  const stateLine = T('deckPreviewStateLine')
    .replace('{due}', String(counts.due))
    .replace('{new}', String(counts.new))
    .replace('{learning}', String(counts.learning))
    .replace('{review}', String(counts.review));

  const renderRow = ({ item }: { item: Flashcard }) => {
    const faces = cardFaces(item);
    const due = isDue(item, now);
    const dueLabel = due
      ? T('flashcardDueShort')
      : item.due
        ? formatInterval(now, new Date(item.due))
        : null;
    const typeLabel =
      faces.isCloze ? T('flashcardTypeCloze') : item.cardType === 'concept' ? T('flashcardTypeConcept') : null;
    return (
      <View style={styles.row}>
        <View style={styles.rowMain}>
          {(typeLabel || dueLabel) && (
            <View style={styles.rowBadgeRow}>
              {typeLabel ? (
                <View style={styles.rowBadge}>
                  <Text style={styles.rowBadgeText}>{typeLabel}</Text>
                </View>
              ) : null}
              {dueLabel ? (
                <View style={[styles.rowBadge, !due && styles.rowBadgeMuted]}>
                  <Text style={[styles.rowBadgeText, !due && styles.rowBadgeMutedText]}>{dueLabel}</Text>
                </View>
              ) : null}
            </View>
          )}
          <Text style={styles.rowQuestion} numberOfLines={3}>
            {faces.front}
          </Text>
          <Text style={styles.rowAnswer} numberOfLines={3} ellipsizeMode="tail">
            {faces.back}
          </Text>
          {item.hint ? (
            <Text style={styles.rowHint} numberOfLines={2}>
              {T('flashcardHintPrefix')} {item.hint}
            </Text>
          ) : null}
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
    );
  };

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

      {deck.length > 0 && (
        <View style={styles.statsCard}>
          <View style={styles.statsDue}>
            <Text style={styles.statsDueValue}>{counts.due}</Text>
            <Text style={styles.statsDueLabel}>{T('flashcardDueShort')}</Text>
          </View>
          <View style={styles.statsBody}>
            <Text style={styles.statsLine}>{stateLine}</Text>
          </View>
        </View>
      )}

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
          renderItem={renderRow}
        />
      )}

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]} onPress={openAdd}>
          <Feather name="plus" size={16} color={theme.textSecondary} />
          <Text style={styles.addBtnText}>{T('deckPreviewAddCard')}</Text>
        </Pressable>
        {deck.length > 0 && (
          <View style={styles.footerRow}>
            <Pressable
              style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.8 }]}
              onPress={() => startReview('deck')}
            >
              <Feather name="layers" size={18} color={theme.text} />
              <Text style={styles.ghostBtnText}>{T('flashcardStudyAll')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.startBtn,
                pressed && styles.startBtnPressed,
                counts.due === 0 && { opacity: 0.55 },
              ]}
              disabled={counts.due === 0}
              onPress={() => startReview('due')}
            >
              <Feather name="play" size={18} color={theme.textInverse} />
              <Text style={styles.startBtnText}>
                {T('flashcardStudyDue').replace('{n}', String(counts.due))}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <Modal visible={!!editor} animationType="slide" transparent onRequestClose={closeEditor}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={{ flex: 1 }} onPress={closeEditor} />
          <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Text style={styles.modalTitle}>
              {editor?.kind === 'add' ? T('deckPreviewAddCardTitle') : T('deckPreviewEditCard')}
            </Text>
            <Text style={styles.modalLabel}>{T('deckPreviewFrontLabel')}</Text>
            <TextInput
              style={styles.modalInput}
              value={editFront}
              onChangeText={setEditFront}
              multiline
              placeholderTextColor={theme.textSecondary}
              placeholder="Question"
              editable={!saving}
            />
            <Text style={styles.modalLabel}>{T('deckPreviewBackLabel')}</Text>
            <TextInput
              style={styles.modalInput}
              value={editBack}
              onChangeText={setEditBack}
              multiline
              placeholderTextColor={theme.textSecondary}
              placeholder="Answer"
              editable={!saving}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalGhost} onPress={closeEditor} disabled={saving}>
                <Text style={styles.modalGhostText}>{T('close')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalPrimary,
                  (saving || !editFront.trim() || !editBack.trim()) && styles.modalPrimaryDisabled,
                ]}
                onPress={() => { void saveEditor(); }}
                disabled={saving || !editFront.trim() || !editBack.trim()}
              >
                {saving ? (
                  <ActivityIndicator color={theme.textInverse} />
                ) : (
                  <Text style={styles.modalPrimaryText}>
                    {editor?.kind === 'add' ? T('deckPreviewAddCard') : T('deckPreviewSaveCard')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
