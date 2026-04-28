import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
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
import { invokeGenerateFlashcards } from '@/src/lib/invokeGenerateFlashcards';
import { ImportProgressBar } from '@/components/ImportProgressBar';
import type { ThemePalette } from '@/constants/Themes';
import {
  FLASHCARD_GEN_FREE_MAX,
  FLASHCARD_GEN_PLUS_MAX,
  FLASHCARD_GEN_PRO_MAX,
  FLASHCARD_GEN_ALL_OPTIONS,
  clampFlashcardCountForPlan,
  defaultFlashcardCountForPlan,
  isAtLeastPlus,
  isPro,
  maxFlashcardsForPlan,
} from '@/src/lib/flashcardGenerationLimits';

function formatFlashcardGenerationError(raw: string): string {
  const msg = String(raw || '').trim();
  if (!msg) return 'Generation failed';
  if (/HTTP 503|UNAVAILABLE|high demand/i.test(msg)) {
    return 'AI extraction is temporarily busy. Please retry in 30-60 seconds, or choose Custom pages and generate fewer pages at once.';
  }
  if (/too large|25MB|max supported size/i.test(msg)) {
    return 'PDF is too large for AI extraction (max 25MB). Compress or split the file first.';
  }
  if (/timed out|timeout/i.test(msg)) {
    return 'AI extraction timed out. Try again with fewer pages (Custom pages) for faster processing.';
  }
  return msg.length > 240 ? `${msg.slice(0, 240)}...` : msg;
}

function createStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      paddingHorizontal: 8,
      paddingTop: Platform.OS === 'ios' ? 56 : 40,
      paddingBottom: 10,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 8, paddingRight: 8 },
    backText: { fontSize: 17, color: theme.primary, fontWeight: '400' },
    titleBlock: { flex: 1, paddingRight: 8 },
    pageTitle: { fontSize: 24, fontWeight: '900', color: theme.text, letterSpacing: -0.6 },
    headerBottomRow: {
      paddingLeft: 8,
      paddingRight: 8,
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    pageSub: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, lineHeight: 16 },
    headerLinkPill: {
      alignSelf: 'flex-start',
      marginTop: 0,
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: `${theme.primary}14`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${theme.primary}25`,
    },
    headerLinkPillText: { fontSize: 12, fontWeight: '800', color: theme.primary },

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
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: theme.primary,
    },
    generateBtnDisabled: { opacity: 0.45 },
    generateBtnInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      flex: 1,
      minWidth: 0,
    },
    generateBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', flexShrink: 1 },

    colorDot: { width: 10, height: 10, borderRadius: 5 },

    countPickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 2,
    },
    countPickLabel: { fontSize: 15, fontWeight: '700', color: theme.text },

    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalBackdropFill: { flex: 1 },
    modalCard: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
      maxHeight: '88%',
    },
    modalTitle: { fontSize: 20, fontWeight: '800', color: theme.text, letterSpacing: -0.3 },
    modalHint: { fontSize: 13, fontWeight: '500', color: theme.textSecondary, marginTop: 8, lineHeight: 19 },
    tipsBox: {
      marginTop: 14,
      padding: 14,
      borderRadius: 16,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
    },
    tipsTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    tipsTitleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tipsTitle: { fontSize: 13, fontWeight: '900', color: theme.text, letterSpacing: -0.2 },
    tipsPill: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: `${theme.primary}18`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${theme.primary}35`,
    },
    tipsPillText: { fontSize: 11, fontWeight: '900', color: theme.primary },
    tipsBody: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginTop: 10, lineHeight: 20 },
    tipsGrid: { marginTop: 12, gap: 8 },
    tipsGridRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    tipsGridLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
    tipsDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary },
    tipsGridLabel: { fontSize: 13, fontWeight: '800', color: theme.text, flex: 1 },
    tipsGridValue: { fontSize: 13, fontWeight: '900', color: theme.text },
    sectionLabel: { fontSize: 13, fontWeight: '800', color: theme.text, marginTop: 14, marginBottom: 10 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: theme.border,
      backgroundColor: theme.background,
    },
    chipSelected: { borderColor: theme.primary, backgroundColor: `${theme.primary}18` },
    chipLocked: { opacity: 0.55 },
    chipText: { fontSize: 15, fontWeight: '700', color: theme.text },
    chipTextSelected: { color: theme.primary },
    modalDoneBtn: {
      marginTop: 20,
      marginBottom: 12,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: theme.primary,
      alignItems: 'center',
    },
    modalDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

    planTabsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    planTab: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: theme.background,
      borderWidth: 2,
      borderColor: theme.border,
      minHeight: 56,
      justifyContent: 'center',
    },
    planTabSelected: { borderColor: theme.primary, backgroundColor: `${theme.primary}12` },
    planTabLocked: { opacity: 0.65 },
    planTabTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    planTabTitle: { fontSize: 13, fontWeight: '900', color: theme.text },
    planTabMax: { fontSize: 12, fontWeight: '800', color: theme.textSecondary },
    planTabLockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    planTabLockText: { fontSize: 11, fontWeight: '800', color: theme.textSecondary, flex: 1 },
    lockPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: theme.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    lockPillText: { fontSize: 12, fontWeight: '800', color: theme.textSecondary },

    pdfPagesHint: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textSecondary,
      marginTop: 6,
      lineHeight: 17,
    },
    pdfPageModeRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    pdfPageModeChip: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: theme.background,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: 'center',
    },
    pdfPageModeChipSelected: { borderColor: theme.primary, backgroundColor: `${theme.primary}12` },
    pdfPageInput: {
      marginTop: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
      backgroundColor: theme.background,
    },

    genOverlayBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 28,
    },
    genOverlayCard: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 22,
      borderWidth: 1,
      borderColor: theme.border,
    },
    genOverlayTitle: { fontSize: 17, fontWeight: '800', color: theme.text, marginBottom: 4 },
    genOverlaySub: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 16, lineHeight: 18 },
  });
}

export default function FlashcardPick() {
  const { subjectId: paramSubjectId } = useLocalSearchParams<{ subjectId?: string }>();
  const { courses, notes, flashcards, language, getSubjectColor, addFlashcard, deleteFlashcardsForNote, handleSaveNote, user } = useApp();
  const plusUnlocked = isAtLeastPlus(user?.subscriptionPlan);
  const proUnlocked = isPro(user?.subscriptionPlan);
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
  const [countModalVisible, setCountModalVisible] = useState(false);
  const [cardsPerNote, setCardsPerNote] = useState(() => defaultFlashcardCountForPlan(undefined));
  const [pickedTier, setPickedTier] = useState<'free' | 'plus' | 'pro'>(() => 'free');
  const [pdfPageMode, setPdfPageMode] = useState<'all' | 'custom'>('all');
  const [pdfPageRange, setPdfPageRange] = useState('');
  const [generateProgressUi, setGenerateProgressUi] = useState<{ progress: number; label: string } | null>(null);
  const planMaxAllowed = maxFlashcardsForPlan(user?.subscriptionPlan);
  const pickedTierMaxAllowed =
    pickedTier === 'pro'
      ? FLASHCARD_GEN_PRO_MAX
      : pickedTier === 'plus'
        ? FLASHCARD_GEN_PLUS_MAX
        : FLASHCARD_GEN_FREE_MAX;

  useEffect(() => {
    setCardsPerNote((c) => clampFlashcardCountForPlan(c, user?.subscriptionPlan));
  }, [user?.subscriptionPlan]);

  useEffect(() => {
    const plan = user?.subscriptionPlan ?? 'free';
    setPickedTier(plan === 'pro' ? 'pro' : plan === 'plus' ? 'plus' : 'free');
  }, [user?.subscriptionPlan]);

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
        hasFailed: !!n.extractionError,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [notes, cardCountByNote, pickedSubjectId]);

  const hasParamSubject =
    typeof paramSubjectId === 'string' && paramSubjectId.length > 0;

  const selectionHasPdf = useMemo(
    () => subjectNotes.some((n) => selectedIds.has(n.id) && n.hasPdf),
    [subjectNotes, selectedIds],
  );

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

  const openGeneratePopup = useCallback(() => {
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

    setPdfPageMode('all');
    setPdfPageRange('');
    setCountModalVisible(true);
  }, [selectedIds, generating, subjectNotes, T]);

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

    const anyPdfInRun = usable.some((n) => n.hasPdf);
    const pdfPagesForRequest =
      anyPdfInRun && pdfPageMode === 'custom' ? pdfPageRange.trim() : undefined;

    setGenerating(true);
    setGenerateProgressUi({ progress: 6, label: T('flashcardGenProgressStarting') });
    setGeneratingLabel(T('flashcardGenProgressStarting'));
    let progressTicker: ReturnType<typeof setInterval> | null = null;
    const clearProgressTicker = () => {
      if (progressTicker) {
        clearInterval(progressTicker);
        progressTicker = null;
      }
    };
    const startNoteProgressTicker = (low: number, highCap: number) => {
      clearProgressTicker();
      progressTicker = setInterval(() => {
        setGenerateProgressUi((prev) => {
          if (!prev) return prev;
          const cap = highCap - 6;
          return { ...prev, progress: Math.min(prev.progress + 3, cap) };
        });
      }, 220);
    };

    let totalAdded = 0;
    let firstNoteWithNewCards: string | null = null;
      const failLines: string[] = [];
    let stoppedOnDailyLimit = false;
      let stoppedOnMonthlyLimit = false;

    try {
      if (isReplaceMode) {
        setGenerateProgressUi({ progress: 10, label: T('flashcardGenProgressReplace') });
        setGeneratingLabel(T('flashcardGenProgressReplace'));
        for (const [noteId] of existingCounts) {
          await deleteFlashcardsForNote(noteId);
        }
        setGenerateProgressUi({ progress: 18, label: T('flashcardGenProgressGenerating') });
        setGeneratingLabel(T('flashcardGenProgressGenerating'));
      } else {
        setGenerateProgressUi({ progress: 15, label: T('flashcardGenProgressGenerating') });
        setGeneratingLabel(T('flashcardGenProgressGenerating'));
      }

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

      const totalNotes = usable.length;
      for (let i = 0; i < totalNotes; i++) {
        const note = usable[i];
        const low = 18 + Math.floor((i / totalNotes) * 72);
        const highCap = 18 + Math.floor(((i + 1) / totalNotes) * 94);

        const phaseBase =
          note.hasPdf && note.attachmentPath
            ? T('flashcardGenProgressPdf')
            : T('flashcardGenProgressText');
        const phaseLabel =
          totalNotes > 1 ? `${phaseBase} (${i + 1}/${totalNotes})` : phaseBase;

        setGeneratingLabel(phaseLabel);
        setGenerateProgressUi({ progress: low, label: phaseLabel });
        startNoteProgressTicker(low, highCap);

        let cards: { front: string; back: string }[] = [];
        let error: string | null = null;

        try {
          if (note.hasPdf && note.attachmentPath) {
            const res = await invokeGenerateFlashcards({
              source: 'pdf_storage',
              storage_path: note.attachmentPath,
              bucket: 'note-attachments',
              count: cardsPerNote,
              note_id: note.id,
              ...(pdfPagesForRequest ? { pdf_pages: pdfPagesForRequest } : {}),
            });
            if (res.error) error = res.error;
            else cards = res.data?.cards ?? [];
          } else if (note.hasText) {
            cards = await generateFlashcardsFromNote(note.content.trim(), user?.id, cardsPerNote);
          }
        } catch (e: any) {
          error = e?.message || 'Generation failed';
        }

        if (error && /rate.*limit|429|too many requests/i.test(error) && !/daily/i.test(error)) {
          clearProgressTicker();
          setGenerateProgressUi((prev) =>
            prev
              ? { ...prev, progress: Math.min(prev.progress + 2, 88), label: T('flashcardGenProgressRetry') }
              : null,
          );
          setGeneratingLabel(T('flashcardGenProgressRetry'));
          await new Promise((r) => setTimeout(r, 10_000));
          error = null;
          startNoteProgressTicker(low, highCap);
          try {
            if (note.hasPdf && note.attachmentPath) {
              const res = await invokeGenerateFlashcards({
                source: 'pdf_storage',
                storage_path: note.attachmentPath,
                bucket: 'note-attachments',
                count: cardsPerNote,
                note_id: note.id,
                ...(pdfPagesForRequest ? { pdf_pages: pdfPagesForRequest } : {}),
              });
              if (res.error) error = res.error;
              else cards = res.data?.cards ?? [];
            } else if (note.hasText) {
              cards = await generateFlashcardsFromNote(note.content.trim(), user?.id, cardsPerNote);
            }
          } catch (retryErr: any) {
            error = retryErr?.message || 'Retry failed';
          }
        }

        clearProgressTicker();
        setGenerateProgressUi((prev) =>
          prev ? { ...prev, progress: Math.min(highCap, 97) } : prev,
        );

        if (error) {
          failLines.push(`${note.title}: ${formatFlashcardGenerationError(error)}`);
          if (note.hasPdf && handleSaveNote) {
            const orig = notes.find((n) => n.id === note.id);
            if (orig) handleSaveNote({ ...orig, extractionError: formatFlashcardGenerationError(error) });
          }
          if (/monthly ai token limit|MONTHLY_TOKEN_LIMIT/i.test(error)) {
            failLines.push('Stopped: monthly AI limit reached.');
            stoppedOnDailyLimit = true;
            stoppedOnMonthlyLimit = true;
            break;
          }
          if (/daily.*limit/i.test(error)) {
            failLines.push('Stopped: daily limit reached.');
            stoppedOnDailyLimit = true;
            break;
          }
          continue;
        }

        if (cards.length > 0) {
          if (note.hasPdf && note.hasFailed && handleSaveNote) {
            const orig = notes.find((n) => n.id === note.id);
            if (orig) handleSaveNote({ ...orig, extractionError: undefined });
          }
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

      clearProgressTicker();
      if (!stoppedOnDailyLimit) {
        setGenerateProgressUi({ progress: 100, label: T('flashcardGenProgressDone') });
        setGeneratingLabel(T('flashcardGenProgressDone'));
        await new Promise((r) => setTimeout(r, 650));
      }
      setGenerateProgressUi(null);
      setGeneratingLabel('');

      // Monthly-limit UI is already shown centrally in invokeGenerateFlashcards().
      // Avoid showing a second generic failure alert on top of that.
      if (!stoppedOnMonthlyLimit && totalAdded === 0 && failLines.length > 0) {
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
      clearProgressTicker();
      setGenerateProgressUi(null);
      setGenerating(false);
      setGeneratingLabel('');
    }
  }, [
    selectedIds,
    generating,
    subjectNotes,
    cardCountByNote,
    flashcards,
    addFlashcard,
    deleteFlashcardsForNote,
    handleSaveNote,
    user?.id,
    user?.subscriptionPlan,
    cardsPerNote,
    notes,
    T,
    pdfPageMode,
    pdfPageRange,
  ]);


  const headerTitle =
    step === 'subject' ? T('flashcardPickChooseSubject') : T('flashcardPickChooseNote');
  const headerSub =
    step === 'subject' ? T('flashcardPickSubjectSub') : T('flashcardPickNoteSub');

  const selectedCount = selectedIds.size;
  const canGenerate = selectedCount > 0 && !generating;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable onPress={goBack} style={styles.backBtn}>
            <Feather name="chevron-left" size={28} color={theme.primary} />
            <Text style={styles.backText}>{T('back')}</Text>
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={styles.pageTitle}>{headerTitle}</Text>
          </View>
        </View>
        <View style={styles.headerBottomRow}>
          <Text style={[styles.pageSub, { flex: 1 }]} numberOfLines={2}>
            {headerSub}
          </Text>
          {step === 'notes' ? (
            <Pressable
              onPress={() => {
                setPickedSubjectId(null);
                router.replace({ pathname: '/flashcard-pick' as any, params: {} });
              }}
              hitSlop={8}
              style={styles.headerLinkPill}
            >
              <Text style={styles.headerLinkPillText}>{T('flashcardPickOtherSubjects')}</Text>
            </Pressable>
          ) : null}
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
                  openGeneratePopup();
                }}
              >
                <View style={styles.generateBtnInner}>
                  {generating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Feather name="zap" size={20} color="#fff" />
                  )}
                  <Text
                    style={styles.generateBtnText}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {generating && generatingLabel ? generatingLabel : T('flashcardPickGenerate')}
                  </Text>
                </View>
              </Pressable>
            </View>
          )}
        </View>
      )}

      <Modal
        visible={countModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCountModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdropFill}
            accessibilityRole="button"
            accessibilityLabel={T('close')}
            onPress={() => setCountModalVisible(false)}
          />
          <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <Text style={styles.modalTitle}>{T('flashcardGenCountTitle')}</Text>
            <Text style={styles.modalHint}>{T('flashcardGenPerNoteHint')}</Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {/* Horizontal plan boxes */}
              <View style={styles.planTabsRow}>
                <Pressable
                  style={[styles.planTab, pickedTier === 'free' && styles.planTabSelected]}
                  onPress={() => setPickedTier('free')}
                >
                  <View style={styles.planTabTitleRow}>
                    <Text style={styles.planTabTitle}>Free</Text>
                    <Text style={styles.planTabMax}>Max {FLASHCARD_GEN_FREE_MAX}</Text>
                  </View>
                </Pressable>

                <Pressable
                  style={[
                    styles.planTab,
                    pickedTier === 'plus' && styles.planTabSelected,
                    !plusUnlocked && styles.planTabLocked,
                  ]}
                  onPress={() => {
                    if (!plusUnlocked) {
                      setCountModalVisible(false);
                      router.push('/subscription-plans' as any);
                      return;
                    }
                    setPickedTier('plus');
                  }}
                >
                  <View style={styles.planTabTitleRow}>
                    <Text style={styles.planTabTitle}>Plus</Text>
                    <Text style={styles.planTabMax}>Max {FLASHCARD_GEN_PLUS_MAX}</Text>
                  </View>
                  {!plusUnlocked ? (
                    <View style={styles.planTabLockRow}>
                      <Feather name="lock" size={14} color={theme.textSecondary} />
                      <Text style={styles.planTabLockText}>{T('flashcardGenPlusLockedHint')}</Text>
                    </View>
                  ) : null}
                </Pressable>

                <Pressable
                  style={[
                    styles.planTab,
                    pickedTier === 'pro' && styles.planTabSelected,
                    !proUnlocked && styles.planTabLocked,
                  ]}
                  onPress={() => {
                    if (!proUnlocked) {
                      setCountModalVisible(false);
                      router.push('/subscription-plans' as any);
                      return;
                    }
                    setPickedTier('pro');
                  }}
                >
                  <View style={styles.planTabTitleRow}>
                    <Text style={styles.planTabTitle}>Pro</Text>
                    <Text style={styles.planTabMax}>Max {FLASHCARD_GEN_PRO_MAX}</Text>
                  </View>
                  {!proUnlocked ? (
                    <View style={styles.planTabLockRow}>
                      <Feather name="lock" size={14} color={theme.textSecondary} />
                      <Text style={styles.planTabLockText}>{T('flashcardGenProLockedHint')}</Text>
                    </View>
                  ) : null}
                </Pressable>
              </View>

              {/* Card numbers (based on selected plan) */}
              <Text style={styles.sectionLabel}>{T('cards')}</Text>
              <View style={styles.chipRow}>
                {FLASHCARD_GEN_ALL_OPTIONS.map((n) => {
                  const selected = cardsPerNote === n;
                  // Lock by selected tier tab first (Free locks 15+, Plus locks 25+, Pro unlocks all)
                  // Then also respect the real user plan max (safety fallback).
                  const locked = n > pickedTierMaxAllowed || n > planMaxAllowed;
                  return (
                    <Pressable
                      key={`cards-${n}`}
                      style={[
                        styles.chip,
                        selected && !locked && styles.chipSelected,
                        locked && styles.chipLocked,
                      ]}
                      disabled={locked}
                      onPress={() => {
                        setCardsPerNote(n);
                      }}
                    >
                      <Text style={[styles.chipText, selected && !locked && styles.chipTextSelected]}>{n}</Text>
                      {locked ? (
                        <Feather name="lock" size={14} color={theme.textSecondary} style={{ marginLeft: 6 }} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              {selectionHasPdf ? (
                <>
                  <Text style={styles.sectionLabel}>{T('flashcardGenPdfPagesSection')}</Text>
                  <Text style={styles.pdfPagesHint}>{T('flashcardGenPdfPagesHint')}</Text>
                  <View style={styles.pdfPageModeRow}>
                    <Pressable
                      style={[
                        styles.pdfPageModeChip,
                        pdfPageMode === 'all' && styles.pdfPageModeChipSelected,
                      ]}
                      onPress={() => setPdfPageMode('all')}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          pdfPageMode === 'all' && styles.chipTextSelected,
                        ]}
                      >
                        {T('flashcardGenPdfPagesAll')}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.pdfPageModeChip,
                        pdfPageMode === 'custom' && styles.pdfPageModeChipSelected,
                      ]}
                      onPress={() => setPdfPageMode('custom')}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          pdfPageMode === 'custom' && styles.chipTextSelected,
                        ]}
                      >
                        {T('flashcardGenPdfPagesCustom')}
                      </Text>
                    </Pressable>
                  </View>
                  {pdfPageMode === 'custom' ? (
                    <TextInput
                      style={styles.pdfPageInput}
                      value={pdfPageRange}
                      onChangeText={setPdfPageRange}
                      placeholder={T('flashcardGenPdfPagesPlaceholder')}
                      placeholderTextColor={theme.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="default"
                    />
                  ) : null}
                </>
              ) : null}

              {/* Tips at bottom */}
              <View style={styles.tipsBox}>
                <View style={styles.tipsTitleRow}>
                  <View style={styles.tipsTitleLeft}>
                    <Feather name="file-text" size={16} color={theme.primary} />
                    <Text style={styles.tipsTitle}>{T('flashcardGenTipsTitle')}</Text>
                  </View>
                  <View style={styles.tipsPill}>
                    <Text style={styles.tipsPillText}>Quick guide</Text>
                  </View>
                </View>
                <Text style={styles.tipsBody}>{T('flashcardGenPdfTips')}</Text>
                <View style={styles.tipsGrid}>
                  <View style={styles.tipsGridRow}>
                    <View style={styles.tipsGridLeft}>
                      <View style={styles.tipsDot} />
                      <Text style={styles.tipsGridLabel}>{T('flashcardGenPdfTipRow1Left')}</Text>
                    </View>
                    <Text style={styles.tipsGridValue}>{T('flashcardGenPdfTipRow1Right')}</Text>
                  </View>
                  <View style={styles.tipsGridRow}>
                    <View style={styles.tipsGridLeft}>
                      <View style={styles.tipsDot} />
                      <Text style={styles.tipsGridLabel}>{T('flashcardGenPdfTipRow2Left')}</Text>
                    </View>
                    <Text style={styles.tipsGridValue}>{T('flashcardGenPdfTipRow2Right')}</Text>
                  </View>
                  <View style={styles.tipsGridRow}>
                    <View style={styles.tipsGridLeft}>
                      <View style={styles.tipsDot} />
                      <Text style={styles.tipsGridLabel}>{T('flashcardGenPdfTipRow3Left')}</Text>
                    </View>
                    <Text style={styles.tipsGridValue}>{T('flashcardGenPdfTipRow3Right')}</Text>
                  </View>
                  <View style={styles.tipsGridRow}>
                    <View style={styles.tipsGridLeft}>
                      <View style={styles.tipsDot} />
                      <Text style={styles.tipsGridLabel}>{T('flashcardGenPdfTipRow4Left')}</Text>
                    </View>
                    <Text style={styles.tipsGridValue}>{T('flashcardGenPdfTipRow4Right')}</Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            <Pressable
              style={styles.modalDoneBtn}
              onPress={() => {
                if (
                  selectionHasPdf &&
                  pdfPageMode === 'custom' &&
                  !pdfPageRange.trim()
                ) {
                  Alert.alert(T('flashcardPickGenerateFailedTitle'), T('flashcardGenPdfPagesRequired'));
                  return;
                }
                setCountModalVisible(false);
                void handleGenerate();
              }}
            >
              <Text style={styles.modalDoneBtnText}>{T('flashcardGenDonePick')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={generateProgressUi !== null} transparent animationType="fade">
        <View style={styles.genOverlayBackdrop}>
          <View style={styles.genOverlayCard}>
            <Text style={styles.genOverlayTitle}>{T('flashcardGenProgressTitle')}</Text>
            <Text style={styles.genOverlaySub}>{T('flashcardGenProgressSub')}</Text>
            {generateProgressUi ? (
              <ImportProgressBar
                progress={generateProgressUi.progress}
                label={generateProgressUi.label}
                theme={theme}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}
