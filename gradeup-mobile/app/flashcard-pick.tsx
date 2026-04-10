import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import {
  generateFlashcardsFromNote,
  getOpenAIKey,
  noteHasPdfAttachment,
} from '@/src/lib/studyApi';
import { extractPdfTextFromStoragePath } from '@/src/lib/pdfText';
import type { ThemePalette } from '@/constants/Themes';

function createStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingTop: Platform.OS === 'ios' ? 56 : 40,
      paddingBottom: 12,
      gap: 8,
    },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 8, paddingRight: 8 },
    backText: { fontSize: 17, color: theme.primary, fontWeight: '400' },
    titleBlock: { flex: 1, paddingRight: 8 },
    pageTitle: { fontSize: 22, fontWeight: '800', color: theme.text, letterSpacing: -0.5 },
    pageSub: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginTop: 4 },

    notesStepBody: { flex: 1 },
    listContent: { paddingHorizontal: 20, paddingBottom: 16 },
    listEmpty: { flexGrow: 1 },

    cardGroup: { backgroundColor: theme.card, overflow: 'hidden' },
    cardGroupFirst: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    cardGroupLast: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      gap: 10,
      position: 'relative',
    },
    checkHit: { padding: 4 },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: 16, fontWeight: '600', color: theme.text },
    rowSub: { fontSize: 13, color: theme.textSecondary, marginTop: 2 },
    rowSubWarn: { fontSize: 13, color: '#ca8a04', marginTop: 2 },
    reviewHit: { padding: 8, marginRight: -4 },
    rowMeta: { fontSize: 14, fontWeight: '600', color: theme.primary },
    divider: {
      position: 'absolute',
      bottom: 0,
      left: 52,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
    },

    emptyWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      marginTop: 48,
    },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 8, textAlign: 'center' },
    emptySub: { fontSize: 15, color: theme.textSecondary, textAlign: 'center', lineHeight: 22 },

    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(0,0,0,0.08)',
      paddingHorizontal: 20,
      paddingTop: 12,
      gap: 10,
      backgroundColor: theme.background,
    },
    footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    footerLink: { fontSize: 14, fontWeight: '700', color: theme.primary },
    footerMeta: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
    generateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 16,
      borderRadius: 14,
      backgroundColor: theme.primary,
    },
    generateBtnDisabled: { opacity: 0.45 },
    generateBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

    colorDot: { width: 10, height: 10, borderRadius: 5 },
  });
}

export default function FlashcardPick() {
  const { subjectId: paramSubjectId } = useLocalSearchParams<{ subjectId?: string }>();
  const { courses, notes, flashcards, language, getSubjectColor, addFlashcard, deleteFlashcardsForNote, handleSaveNote, user } = useApp();
  const T = useTranslations(language);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const initialSubject =
    typeof paramSubjectId === 'string' && paramSubjectId.length > 0 ? paramSubjectId : null;
  const [pickedSubjectId, setPickedSubjectId] = useState<string | null>(initialSubject);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [generating, setGenerating] = useState(false);
  const [generatingLabel, setGeneratingLabel] = useState('');

  useEffect(() => {
    if (typeof paramSubjectId === 'string' && paramSubjectId.length > 0) {
      setPickedSubjectId(paramSubjectId);
    }
  }, [paramSubjectId]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [pickedSubjectId]);

  const step: 'subject' | 'notes' = pickedSubjectId ? 'notes' : 'subject';

  // Fix 8: Pre-build a Map for O(1) cardCount lookup instead of O(n) filter per note
  const cardCountByNote = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of flashcards) {
      if (c.noteId) map.set(c.noteId, (map.get(c.noteId) ?? 0) + 1);
    }
    return map;
  }, [flashcards]);

  const subjectNotes = useMemo(() => {
    if (!pickedSubjectId) return [];
    return notes
      .filter((n) => n.subjectId === pickedSubjectId)
      .map((n) => ({
        ...n,
        cardCount: cardCountByNote.get(n.id) ?? 0,
        hasText: !!(n.content && n.content.trim().length > 0 && n.content !== 'Extracting text from PDF...'),
        hasPdf: noteHasPdfAttachment(n),
        hasCachedText: !!(n.extractedText && n.extractedText.trim().length > 0),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [notes, cardCountByNote, pickedSubjectId]);

  const hasParamSubject =
    typeof paramSubjectId === 'string' && paramSubjectId.length > 0;

  const goBack = () => {
    if (step === 'notes' && hasParamSubject) {
      router.back();
      return;
    }
    if (step === 'notes') {
      setPickedSubjectId(null);
      return;
    }
    router.back();
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(subjectNotes.map((n) => n.id)));
  }, [subjectNotes]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const openDeckPreview = (nid: string) => {
    router.push({ pathname: '/flashcard-deck-preview' as any, params: { noteId: nid } });
  };

  const handleGenerate = useCallback(async (replaceMode: 'prompt' | 'add' | 'replace' = 'prompt') => {
    if (selectedIds.size === 0 || generating) return;
    if (!getOpenAIKey()) {
      Alert.alert(T('flashcardPickApiKeyTitle'), T('flashcardPickApiKeyHint'));
      return;
    }

    const selected = subjectNotes.filter((n) => selectedIds.has(n.id));
    const usable = selected.filter((n) => n.hasText || n.hasPdf || n.hasCachedText);
    if (usable.length === 0) {
      Alert.alert(T('flashcardPickNoContentTitle'), T('flashcardPickNoContentHint'));
      return;
    }

    // Build a map of noteId -> existing card count for selected notes
    const existingCounts = new Map<string, number>();
    for (const n of usable) {
      const count = cardCountByNote.get(n.id) ?? 0;
      if (count > 0) existingCounts.set(n.id, count);
    }

    // 'prompt' mode: show dialog if any notes have existing cards
    if (replaceMode === 'prompt' && existingCounts.size > 0) {
      const totalExisting = [...existingCounts.values()].reduce((a, b) => a + b, 0);
      const noteWord = existingCounts.size === 1 ? 'note' : 'notes';
      return Alert.alert(
        'Existing Flashcards Found',
        `${existingCounts.size} selected ${noteWord} already ${existingCounts.size === 1 ? 'has' : 'have'} ${totalExisting} card${totalExisting !== 1 ? 's' : ''}. What would you like to do?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add to Existing',
            onPress: () => { void handleGenerate('add'); },
          },
          {
            text: 'Replace All',
            style: 'destructive',
            onPress: () => { void handleGenerate('replace'); },
          },
        ],
      );
    }

    const isReplaceMode = replaceMode === 'replace';

    setGenerating(true);
    setGeneratingLabel('Preparing…');
    let totalAdded = 0;
    let firstNoteWithNewCards: string | null = null;
    const failLines: string[] = [];

    try {
      // Replace mode: delete existing cards first
      if (isReplaceMode) {
        for (const [noteId] of existingCounts) {
          await deleteFlashcardsForNote(noteId);
        }
      }

      // Build existing fronts set for dedup per note
      const existingFrontsByNote = new Map<string, Set<string>>();
      for (const n of usable) {
        if (!isReplaceMode) {
          const fronts = new Set(
            flashcards
              .filter((c) => c.noteId === n.id)
              .map((c) => c.front.trim().toLowerCase()),
          );
          existingFrontsByNote.set(n.id, fronts);
        } else {
          existingFrontsByNote.set(n.id, new Set());
        }
      }

      // Process ALL notes sequentially with progress label
      // The unified Edge Function handles text vs PDF server-side
      for (let i = 0; i < usable.length; i++) {
        const note = usable[i];
        const label = usable.length > 1
          ? `Generating ${i + 1} of ${usable.length}…`
          : 'Generating flashcards…';
        setGeneratingLabel(label);

        let cards: { front: string; back: string }[] = [];
        let error: string | null = null;

        try {
          if (note.hasPdf && note.attachmentPath) {
            // Re-read from latest notes state — background extraction may have cached it
            const freshNote = notes.find((n) => n.id === note.id);
            let pdfText = freshNote?.extractedText?.trim() || note.extractedText?.trim() || '';

            // If content is the placeholder, background extraction is still running — wait a bit
            if (!pdfText && freshNote?.content === 'Extracting text from PDF...') {
              setGeneratingLabel('Waiting for PDF extraction…');
              await new Promise((r) => setTimeout(r, 5_000));
              // Re-check after waiting
              const rechecked = notes.find((n) => n.id === note.id);
              pdfText = rechecked?.extractedText?.trim() || '';
            }

            // No cache? Extract first, then cache for future calls
            if (!pdfText) {
              setGeneratingLabel('Extracting PDF text…');
              try {
                const extraction = await Promise.race([
                  extractPdfTextFromStoragePath(note.attachmentPath!),
                  new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('PDF extraction timed out after 90s')), 90_000),
                  ),
                ]);
                pdfText = extraction.text?.trim() || '';
                if (!pdfText && extraction.detail) {
                  error = `PDF extraction failed: ${extraction.detail}`;
                }
              } catch (extractErr: any) {
                error = extractErr?.message || 'PDF extraction failed.';
              }

              // Cache the extracted text back to the note
              if (pdfText && handleSaveNote) {
                handleSaveNote({ ...note, extractedText: pdfText });
              }
            }

            if (!pdfText && !error) {
              error = 'Could not extract text from PDF.';
            } else if (pdfText) {
              // Generate flashcards from text only — single lightweight API call
              setGeneratingLabel(label);
              cards = await generateFlashcardsFromNote(pdfText, user?.id, 18);
            }
          } else if (note.hasText) {
            cards = await generateFlashcardsFromNote(note.content.trim(), user?.id);
          }
        } catch (e: any) {
          error = e?.message || 'Generation failed';
        }

        // On OpenAI rate limit (429), wait and retry once instead of giving up
        if (error && /rate.*limit|429|too many requests/i.test(error) && !/daily/i.test(error)) {
          setGeneratingLabel('Rate limited — retrying in 10s…');
          await new Promise((r) => setTimeout(r, 10_000));
          error = null;
          try {
            const freshNote = notes.find((n) => n.id === note.id);
            const pdfText = freshNote?.extractedText?.trim() || note.extractedText?.trim() || '';
            if (pdfText) {
              cards = await generateFlashcardsFromNote(pdfText, user?.id, 18);
            } else if (note.hasText) {
              cards = await generateFlashcardsFromNote(note.content.trim(), user?.id);
            }
          } catch (retryErr: any) {
            error = retryErr?.message || 'Retry failed';
          }
        }

        if (error) {
          failLines.push(`${note.title}: ${error}`);
          // Only stop on actual daily AI limit, not transient 429
          if (/daily.*limit/i.test(error)) {
            failLines.push('Stopped: daily limit reached.');
            break;
          }
          continue;
        }

        if (cards.length > 0) {
          const existingFronts = existingFrontsByNote.get(note.id) ?? new Set<string>();
          const newCards = cards.filter(
            (c) => !existingFronts.has(c.front.trim().toLowerCase())
          );
          if (newCards.length > 0) {
            if (!firstNoteWithNewCards) firstNoteWithNewCards = note.id;
            for (const c of newCards) { addFlashcard(note.id, c.front, c.back); totalAdded += 1; }
          }
        }
      }

      if (totalAdded === 0 && failLines.length > 0) {
        Alert.alert(T('flashcardPickGenerateFailedTitle'), failLines.slice(0, 3).join('\n'));
      } else if (totalAdded === 0) {
        Alert.alert(
          'No New Cards',
          isReplaceMode
            ? T('flashcardPickGenerateNoneHint')
            : 'All generated cards already exist in your deck. Try regenerating with different content, or use \'Replace All\' to refresh the deck.',
        );
      } else {
        const goPreview = () => {
          if (firstNoteWithNewCards) {
            router.push({
              pathname: '/flashcard-deck-preview' as any,
              params: { noteId: firstNoteWithNewCards },
            });
          }
        };
        if (failLines.length > 0) {
          const doneBody =
            T('flashcardPickGenerateDoneBody').replace('{n}', String(totalAdded)) +
            `\n\n${T('flashcardPickPartialFailures')}\n${failLines.slice(0, 2).join('\n')}`;
          Alert.alert(T('flashcardPickGenerateDoneTitle'), doneBody, [
            { text: T('close'), style: 'cancel' },
            { text: T('flashcardPickContinueToPreview'), onPress: goPreview },
          ]);
        } else {
          goPreview();
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Generation failed';
      Alert.alert('Error', msg);
    } finally {
      setGenerating(false);
      setGeneratingLabel('');
    }
  }, [selectedIds, generating, subjectNotes, cardCountByNote, flashcards, addFlashcard, deleteFlashcardsForNote, handleSaveNote, user?.id, T]);


  const headerTitle =
    step === 'subject' ? T('flashcardPickChooseSubject') : T('flashcardPickChooseNote');
  const headerSub =
    step === 'subject' ? T('flashcardPickSubjectSub') : T('flashcardPickNoteSub');

  const selectedCount = selectedIds.size;
  const canGenerate = selectedCount > 0 && !generating;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.backBtn}>
          <Feather name="chevron-left" size={28} color={theme.primary} />
          <Text style={styles.backText}>{T('back')}</Text>
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.pageTitle}>{headerTitle}</Text>
          <Text style={styles.pageSub}>{headerSub}</Text>
          {step === 'notes' && (
            <Pressable
              onPress={() => {
                setPickedSubjectId(null);
                router.replace({ pathname: '/flashcard-pick' as any, params: {} });
              }}
              hitSlop={8}
              style={{ alignSelf: 'flex-start', marginTop: 8 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.primary }}>
                {T('flashcardPickOtherSubjects')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {step === 'subject' && (
        <FlatList
          data={courses}
          keyExtractor={(c) => c.id}
          contentContainerStyle={[styles.listContent, courses.length === 0 && styles.listEmpty]}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Feather name="book" size={40} color={theme.textSecondary} />
              <Text style={styles.emptyTitle}>{T('flashcardPickNoSubjects')}</Text>
              <Text style={styles.emptySub}>{T('flashcardPickNoSubjectsHint')}</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isLast = index === courses.length - 1;
            const dot =
              getSubjectColor?.(item.id) && getSubjectColor(item.id) !== '#003366'
                ? getSubjectColor(item.id)!
                : theme.primary;
            const nCount = notes.filter((n) => n.subjectId === item.id).length;
            return (
              <View style={[styles.cardGroup, index === 0 && styles.cardGroupFirst, isLast && styles.cardGroupLast]}>
                <Pressable
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
                  onPress={() => setPickedSubjectId(item.id)}
                >
                  <View style={[styles.colorDot, { backgroundColor: dot }]} />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{item.id}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                  <Text style={styles.rowMeta}>{nCount}</Text>
                  <Feather name="chevron-right" size={18} color={theme.textSecondary} />
                  {!isLast && <View style={styles.divider} />}
                </Pressable>
              </View>
            );
          }}
        />
      )}

      {step === 'notes' && pickedSubjectId && (
        <View style={styles.notesStepBody}>
          <FlatList
            data={subjectNotes}
            keyExtractor={(n) => n.id}
            contentContainerStyle={[styles.listContent, subjectNotes.length === 0 && styles.listEmpty]}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Feather name="file-text" size={40} color={theme.textSecondary} />
                <Text style={styles.emptyTitle}>{T('flashcardPickNoNotes')}</Text>
                <Text style={styles.emptySub}>{T('flashcardPickNoNotesHint')}</Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const isLast = index === subjectNotes.length - 1;
              const selected = selectedIds.has(item.id);
              return (
                <View style={[styles.cardGroup, index === 0 && styles.cardGroupFirst, isLast && styles.cardGroupLast]}>
                  <View style={styles.row}>
                    <Pressable
                      style={styles.checkHit}
                      onPress={() => toggleSelect(item.id)}
                      hitSlop={6}
                    >
                      <Feather
                        name={selected ? 'check-square' : 'square'}
                        size={22}
                        color={selected ? theme.primary : theme.textSecondary}
                      />
                    </Pressable>
                    <Pressable style={styles.rowBody} onPress={() => toggleSelect(item.id)}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={!item.hasText && !item.hasPdf && !item.hasCachedText ? styles.rowSubWarn : styles.rowSub}>
                        {!item.hasText && !item.hasPdf && !item.hasCachedText
                          ? T('flashcardPickNoSource')
                          : item.cardCount > 0
                            ? T('flashcardPickCardCount').replace('{n}', String(item.cardCount))
                            : T('flashcardPickNoCardsYet')}
                      </Text>
                    </Pressable>
                    {item.cardCount > 0 ? (
                      <Pressable
                        style={styles.reviewHit}
                        onPress={() => openDeckPreview(item.id)}
                        hitSlop={8}
                      >
                        <Feather name="play-circle" size={22} color={theme.primary} />
                      </Pressable>
                    ) : (
                      <View style={{ width: 30 }} />
                    )}
                  </View>
                  {!isLast && <View style={styles.divider} />}
                </View>
              );
            }}
          />

          {subjectNotes.length > 0 && (
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={styles.footerRow}>
                <Pressable onPress={selectAll} hitSlop={8}>
                  <Text style={styles.footerLink}>{T('flashcardPickSelectAll')}</Text>
                </Pressable>
                <Text style={styles.footerMeta}>
                  {T('flashcardPickSelectCount').replace('{n}', String(selectedCount))}
                </Text>
                <Pressable onPress={clearSelection} hitSlop={8}>
                  <Text style={styles.footerLink}>{T('flashcardPickClearSelection')}</Text>
                </Pressable>
              </View>
              <Pressable
                style={[styles.generateBtn, !canGenerate && styles.generateBtnDisabled]}
                disabled={!canGenerate}
                onPress={() => {
                  void handleGenerate();
                }}
              >
                {generating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Feather name="zap" size={20} color="#fff" />
                )}
                <Text style={styles.generateBtnText} numberOfLines={1}>
                  {generating && generatingLabel ? generatingLabel : T('flashcardPickGenerate')}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
