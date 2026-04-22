import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, Alert, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import { useTheme } from '@/hooks/useTheme';
import type { ThemePalette } from '@/constants/Themes';
import type { Course } from '@/src/types';

const ACCENT_PALETTE = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#ef4444', '#6366f1',
];

function createStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },

    header: {
      paddingHorizontal: 20,
      paddingTop: Platform.OS === 'ios' ? 60 : 44,
      paddingBottom: 4,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: `${theme.primary}15`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerInfo: { flex: 1 },
    headerTitle: { fontSize: 26, fontWeight: '800', color: theme.text, letterSpacing: -0.5 },
    headerSub: { fontSize: 13, fontWeight: '500', color: theme.textSecondary, marginTop: 2 },

    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 },

    // Quick Actions
    quickActionsRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 28,
    },
    quickAction: {
      flex: 1,
      borderRadius: 18,
      paddingHorizontal: 8,
      paddingVertical: 16,
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    quickActionIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickActionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text,
      textAlign: 'center',
    },
    quickActionSub: {
      fontSize: 12,
      fontWeight: '500',
      color: theme.textSecondary,
      textAlign: 'center',
      marginTop: -2,
      lineHeight: 16,
      minHeight: 32,
    },

    // Section
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textSecondary,
      letterSpacing: 1,
      marginBottom: 10,
      paddingLeft: 4,
      textTransform: 'uppercase',
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
      paddingLeft: 4,
      paddingRight: 4,
    },
    sectionHeaderLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textSecondary,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    sectionMenuBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionDoneText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.primary,
    },
    modeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: `${theme.primary}15`,
      borderRadius: 12,
      marginBottom: 10,
    },
    modeBannerText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.primary,
      flex: 1,
    },

    // Action sheet modal
    sheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 8,
      paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      alignSelf: 'center',
      marginBottom: 8,
    },
    sheetTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textSecondary,
      textAlign: 'center',
      paddingVertical: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    sheetItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    sheetItemIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetItemLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
      flex: 1,
    },
    sheetItemDanger: {
      color: '#ef4444',
    },
    sheetDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
      marginLeft: 70,
    },
    sheetCancel: {
      marginHorizontal: 16,
      marginTop: 10,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: theme.background,
      alignItems: 'center',
    },
    sheetCancelText: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
    },

    // Rename modal
    renameBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    renameCard: {
      backgroundColor: theme.card,
      borderRadius: 18,
      padding: 20,
    },
    renameTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 4,
    },
    renameSub: {
      fontSize: 13,
      color: theme.textSecondary,
      marginBottom: 14,
    },
    renameInput: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.text,
      backgroundColor: theme.background,
      marginBottom: 16,
    },
    renameButtonRow: {
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'flex-end',
    },
    renameBtn: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
    },
    renameBtnCancel: {
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
    },
    renameBtnSave: {
      backgroundColor: theme.primary,
    },
    renameBtnCancelText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
    },
    renameBtnSaveText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#ffffff',
    },

    // Row action icon (edit/delete mode)
    rowActionIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 4,
    },

    // Flashcard deck cards
    deckGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 28,
    },
    deckCard: {
      width: '47%' as any,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
    deckCardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    deckCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    deckSubjectBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      flexShrink: 1,
    },
    deckSubjectDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    deckSubjectText: {
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      flexShrink: 1,
    },
    deckTrashBtn: {
      padding: 4,
      marginRight: -4,
      opacity: 0.5,
      marginLeft: 4,
    },
    deckName: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 16,
      lineHeight: 20,
    },
    deckFooter: {
      marginTop: 'auto',
      gap: 12,
    },
    deckCountBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    deckCountText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textSecondary,
    },
    deckReviewBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: theme.primary,
      paddingVertical: 8,
      borderRadius: 10,
      width: '100%',
    },
    deckReviewText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#ffffff',
    },

    // Empty deck state
    emptyDeck: {
      alignItems: 'center',
      paddingVertical: 28,
      paddingHorizontal: 20,
      backgroundColor: theme.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 28,
    },
    emptyDeckIcon: { marginBottom: 12 },
    emptyDeckTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 4 },
    emptyDeckSub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 19 },

    // Notes group card
    groupCard: {
      backgroundColor: theme.card,
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 12,
      position: 'relative',
    },
    colorDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: 16, fontWeight: '600', color: theme.text },
    rowSub: { fontSize: 13, fontWeight: '400', color: theme.textSecondary, marginTop: 1 },
    rowCount: { fontSize: 15, fontWeight: '500', color: theme.textSecondary, marginRight: 4 },

    divider: {
      position: 'absolute',
      bottom: 0,
      left: 54,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
    },
  });
}

export default function StudyHub() {
  const { courses, notes, flashcards, language, getSubjectColor, deleteFlashcard, renameCourse, deleteCourse } = useApp();
  const T = useTranslations(language);
  const theme = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);

  const [subjectsMenuOpen, setSubjectsMenuOpen] = useState(false);
  const [subjectsMode, setSubjectsMode] = useState<'idle' | 'rename' | 'delete'>('idle');
  const [renameTarget, setRenameTarget] = useState<Course | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const tx = (key: string, fallback: string) => ((T as any)(key) as string) || fallback;

  const handleSubjectRowPress = (course: Course) => {
    if (subjectsMode === 'rename') {
      setRenameTarget(course);
      setRenameValue(course.name);
      return;
    }
    if (subjectsMode === 'delete') {
      Alert.alert(
        tx('deleteSubject', 'Delete subject'),
        `Delete "${course.id} — ${course.name}"? This will also remove its notes, tasks, and flashcards.`,
        [
          { text: tx('cancel', 'Cancel'), style: 'cancel' },
          {
            text: tx('deleteSubject', 'Delete'),
            style: 'destructive',
            onPress: () => {
              deleteCourse(course.id);
              if (courses.length <= 1) setSubjectsMode('idle');
            },
          },
        ],
      );
      return;
    }
    router.push({ pathname: '/notes-list' as any, params: { subjectId: course.id } });
  };

  const handleRenameSave = () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    renameCourse(renameTarget.id, trimmed);
    setRenameTarget(null);
    setRenameValue('');
  };

  const handleDeleteDeck = (noteId: string, title: string) => {
    Alert.alert('Delete Deck', `Are you sure you want to delete all flashcards in "${title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive', 
        onPress: () => {
          const cardsToDelete = flashcards.filter(c => c.noteId === noteId);
          cardsToDelete.forEach(c => deleteFlashcard(c.id));
        }
      }
    ]);
  };

  const getColor = (courseId: string, idx: number): string => {
    const custom = getSubjectColor?.(courseId);
    if (custom && custom !== '#003366') return custom;
    return ACCENT_PALETTE[idx % ACCENT_PALETTE.length];
  };

  // All notes that act as flashcard decks
  const deckItems = useMemo(() => {
    return notes
      .map((note, idx) => {
        const count = flashcards.filter(c => c.noteId === note.id).length;
        const color = getColor(note.subjectId, idx);
        return { ...note, count, color };
      })
      .filter(deck => deck.count > 0)
      .sort((a, b) => (b.count - a.count) || a.title.localeCompare(b.title));
  }, [notes, flashcards]);

  const totalCards = flashcards.length;
  const totalNotes = notes.length;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <View style={s.headerIconWrap}>
            <Feather name="book-open" size={20} color={theme.primary} />
          </View>
          <View style={s.headerInfo}>
            <Text style={s.headerTitle}>{(T as any)('studyTitle') || 'Study'}</Text>
            <Text style={s.headerSub}>
              {totalCards} cards · {totalNotes} notes · {courses.length} subjects
            </Text>
          </View>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* ─── Quick Actions ─── */}
        <View style={s.quickActionsRow}>
          <Pressable
            style={({ pressed }) => [
              s.quickAction,
              { backgroundColor: `${theme.primary}15` },
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => router.push('/ai-quiz-builder' as any)}
          >
            <View style={[s.quickActionIcon, { backgroundColor: theme.primary }]}>
              <Feather name="zap" size={20} color="#fff" />
            </View>
            <Text style={s.quickActionLabel} numberOfLines={1} adjustsFontSizeToFit>AI Quiz</Text>
            <Text style={s.quickActionSub} numberOfLines={2}>Auto-generate</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              s.quickAction,
              { backgroundColor: `${theme.primary}15` },
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => router.push('/flashcard-pick' as any)}
          >
            <View style={[s.quickActionIcon, { backgroundColor: theme.primary }]}>
              <Feather name="layers" size={20} color="#fff" />
            </View>
            <Text style={s.quickActionLabel} numberOfLines={1} adjustsFontSizeToFit>
              {(T as any)('flashcardsAllSheetsTitle')}
            </Text>
            <Text style={s.quickActionSub} numberOfLines={2}>
              {(T as any)('flashcardsBrowseDecksSub')}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              s.quickAction,
              { backgroundColor: `${theme.primary}15` },
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => router.push('/leaderboard' as any)}
          >
            <View style={[s.quickActionIcon, { backgroundColor: theme.primary }]}>
              <Feather name="award" size={20} color="#fff" />
            </View>
            <Text style={s.quickActionLabel} numberOfLines={1} adjustsFontSizeToFit>Rankings</Text>
            <Text style={s.quickActionSub} numberOfLines={2}>See top scorers</Text>
          </Pressable>
        </View>

        {/* ─── Flashcard Decks ─── */}
        <Text style={s.sectionLabel}>FLASHCARD DECKS</Text>
        {deckItems.length === 0 ? (
          <View style={s.emptyDeck}>
            <Feather name="layers" size={32} color={theme.textSecondary} style={s.emptyDeckIcon} />
            <Text style={s.emptyDeckTitle}>No flashcard decks yet</Text>
            <Text style={s.emptyDeckSub}>
              Open a note and add cards from the editor, or use Flashcards on the notes list / Study tab.
            </Text>
          </View>
        ) : (
          <View style={s.deckGrid}>
            {deckItems.map((deck) => (
              <Pressable
                key={deck.id}
                style={({ pressed }) => [s.deckCard, pressed && s.deckCardPressed]}
                onPress={() => {
                  if (deck.count > 0) {
                    router.push({
                      pathname: '/flashcard-deck-preview',
                      params: { noteId: deck.id },
                    } as any);
                  } else {
                    router.push({ pathname: '/notes-editor', params: { subjectId: deck.subjectId, noteId: deck.id } } as any);
                  }
                }}
                onLongPress={() => {
                  router.push({ pathname: '/notes-editor', params: { subjectId: deck.subjectId, noteId: deck.id } } as any);
                }}
              >
                <View style={s.deckCardHeader}>
                  <View style={[s.deckSubjectBadge, { backgroundColor: `${deck.color}15` }]}>
                    <View style={[s.deckSubjectDot, { backgroundColor: deck.color }]} />
                    <Text style={[s.deckSubjectText, { color: deck.color }]} numberOfLines={1}>
                      {deck.subjectId}
                    </Text>
                  </View>
                  <Pressable 
                    style={s.deckTrashBtn} 
                    hitSlop={8}
                    onPress={() => handleDeleteDeck(deck.id, deck.title)}
                  >
                    <Feather name="trash-2" size={15} color={theme.textSecondary} />
                  </Pressable>
                </View>
                
                <Text style={s.deckName} numberOfLines={3}>{deck.title}</Text>
                
                <View style={s.deckFooter}>
                  <View style={s.deckCountBadge}>
                    <Feather name="layers" size={12} color={theme.textSecondary} />
                    <Text style={s.deckCountText}>{deck.count} cards</Text>
                  </View>
                  
                  {deck.count > 0 && (
                    <View style={s.deckReviewBtn}>
                      <Feather name="play" size={10} color="#ffffff" />
                      <Text style={s.deckReviewText}>Review</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* ─── Notes by Subject ─── */}
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionHeaderLabel}>{tx('yourSubjects', 'YOUR SUBJECTS')}</Text>
          {subjectsMode === 'idle' ? (
            <Pressable
              onPress={() => setSubjectsMenuOpen(true)}
              hitSlop={10}
              style={({ pressed }) => [s.sectionMenuBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel={tx('manageSubjects', 'Manage subjects')}
            >
              <Feather name="more-vertical" size={18} color={theme.textSecondary} />
            </Pressable>
          ) : (
            <Pressable onPress={() => setSubjectsMode('idle')} hitSlop={10}>
              <Text style={s.sectionDoneText}>{tx('done', 'Done')}</Text>
            </Pressable>
          )}
        </View>

        {subjectsMode !== 'idle' && (
          <View style={s.modeBanner}>
            <Feather
              name={subjectsMode === 'rename' ? 'edit-2' : 'trash-2'}
              size={14}
              color={theme.primary}
            />
            <Text style={s.modeBannerText}>
              {subjectsMode === 'rename'
                ? tx('tapToRename', 'Tap a subject to rename')
                : tx('tapToDelete', 'Tap a subject to delete')}
            </Text>
          </View>
        )}

        <View style={s.groupCard}>
          {courses.map((course, idx) => {
            const count = notes.filter((n) => n.subjectId === course.id).length;
            const color = getColor(course.id, idx);

            return (
              <Pressable
                key={course.id}
                style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
                onPress={() => handleSubjectRowPress(course)}
              >
                <View style={[s.colorDot, { backgroundColor: color }]} />
                <View style={s.rowBody}>
                  <Text style={s.rowTitle}>{course.id}</Text>
                  <Text style={s.rowSub} numberOfLines={1}>{course.name}</Text>
                </View>
                {subjectsMode === 'idle' ? (
                  <>
                    <Text style={s.rowCount}>{count}</Text>
                    <Feather name="chevron-right" size={16} color={theme.textSecondary} />
                  </>
                ) : (
                  <View
                    style={[
                      s.rowActionIcon,
                      {
                        backgroundColor:
                          subjectsMode === 'delete' ? '#ef444422' : `${theme.primary}22`,
                      },
                    ]}
                  >
                    <Feather
                      name={subjectsMode === 'rename' ? 'edit-2' : 'trash-2'}
                      size={14}
                      color={subjectsMode === 'delete' ? '#ef4444' : theme.primary}
                    />
                  </View>
                )}
                <View style={s.divider} />
              </Pressable>
            );
          })}

          {/* Add Subject row - hidden during rename/delete mode */}
          {subjectsMode === 'idle' && (
            <Pressable
              style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
              onPress={() => router.push('/add-subject' as any)}
            >
              <View style={[s.colorDot, { backgroundColor: theme.primary, borderRadius: 5 }]}>
                <Feather name="plus" size={10} color="#ffffff" />
              </View>
              <View style={s.rowBody}>
                <Text style={[s.rowTitle, { color: theme.primary }]}>{tx('addSubject', 'Add Subject')}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>

      </ScrollView>

      {/* Subjects action sheet */}
      <Modal
        visible={subjectsMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSubjectsMenuOpen(false)}
      >
        <Pressable style={s.sheetBackdrop} onPress={() => setSubjectsMenuOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>{tx('manageSubjects', 'Manage subjects')}</Text>

            <Pressable
              style={({ pressed }) => [s.sheetItem, pressed && { opacity: 0.6 }]}
              onPress={() => {
                setSubjectsMenuOpen(false);
                router.push('/add-subject' as any);
              }}
            >
              <View style={[s.sheetItemIcon, { backgroundColor: `${theme.primary}22` }]}>
                <Feather name="plus" size={18} color={theme.primary} />
              </View>
              <Text style={s.sheetItemLabel}>{tx('addSubject', 'Add subject')}</Text>
              <Feather name="chevron-right" size={16} color={theme.textSecondary} />
            </Pressable>
            <View style={s.sheetDivider} />

            <Pressable
              style={({ pressed }) => [s.sheetItem, pressed && { opacity: 0.6 }]}
              onPress={() => {
                setSubjectsMenuOpen(false);
                if (courses.length === 0) return;
                setSubjectsMode('rename');
              }}
            >
              <View style={[s.sheetItemIcon, { backgroundColor: `${theme.primary}22` }]}>
                <Feather name="edit-2" size={16} color={theme.primary} />
              </View>
              <Text style={s.sheetItemLabel}>{tx('renameSubject', 'Rename subject')}</Text>
              <Feather name="chevron-right" size={16} color={theme.textSecondary} />
            </Pressable>
            <View style={s.sheetDivider} />

            <Pressable
              style={({ pressed }) => [s.sheetItem, pressed && { opacity: 0.6 }]}
              onPress={() => {
                setSubjectsMenuOpen(false);
                if (courses.length === 0) return;
                setSubjectsMode('delete');
              }}
            >
              <View style={[s.sheetItemIcon, { backgroundColor: '#ef444422' }]}>
                <Feather name="trash-2" size={16} color="#ef4444" />
              </View>
              <Text style={[s.sheetItemLabel, s.sheetItemDanger]}>
                {tx('deleteSubject', 'Delete subject')}
              </Text>
              <Feather name="chevron-right" size={16} color={theme.textSecondary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [s.sheetCancel, pressed && { opacity: 0.7 }]}
              onPress={() => setSubjectsMenuOpen(false)}
            >
              <Text style={s.sheetCancelText}>{tx('cancel', 'Cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rename input modal */}
      <Modal
        visible={!!renameTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={s.renameBackdrop} onPress={() => setRenameTarget(null)}>
            <Pressable style={s.renameCard} onPress={() => {}}>
              <Text style={s.renameTitle}>{tx('renameSubjectTitle', 'Rename subject')}</Text>
              <Text style={s.renameSub}>{renameTarget?.id}</Text>
              <TextInput
                style={s.renameInput}
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder={tx('newSubjectName', 'New subject name')}
                placeholderTextColor={theme.textSecondary}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleRenameSave}
              />
              <View style={s.renameButtonRow}>
                <Pressable
                  style={({ pressed }) => [s.renameBtn, s.renameBtnCancel, pressed && { opacity: 0.7 }]}
                  onPress={() => setRenameTarget(null)}
                >
                  <Text style={s.renameBtnCancelText}>{tx('cancel', 'Cancel')}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.renameBtn, s.renameBtnSave, pressed && { opacity: 0.85 }]}
                  onPress={handleRenameSave}
                >
                  <Text style={s.renameBtnSaveText}>{tx('save', 'Save')}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
