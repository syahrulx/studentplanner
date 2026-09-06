import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Alert, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Markdown from 'react-native-markdown-display';
import * as ImagePicker from 'expo-image-picker';
import { readUriAsBase64 } from '@/src/lib/readUriAsBase64';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import { localizedTrialCta, localizedTrialTagline } from '@/src/lib/upgradePrompt';
import { useTheme } from '@/hooks/useTheme';
import { invokeAiGenerate, AiGenerateRequest, AiGenerateChatResult, AiGenerateChatCitation } from '@/src/lib/invokeAiGenerate';
import { canStreamChat, streamAiChat } from '@/src/lib/streamAiChat';
import { isMonthlyLimitError, showMonthlyLimitAlert } from '@/src/lib/aiLimitError';
import { isAtLeastPlus } from '@/src/lib/flashcardGenerationLimits';
import { getChatSessions, getChatMessages, createChatSession, createChatMessage, updateChatSessionTimestamp, deleteChatSession } from '@/src/lib/chatDb';
import { ensureSubjectEmbeddings } from '@/src/lib/subjectEmbeddings';
import { noteHasPdfAttachment } from '@/src/lib/studyApi';
import { extractPdfTextFromStoragePath } from '@/src/lib/pdfText';
import type { ChatSession, Note } from '@/src/types';
import { ensureImageLibraryAccessForPicker } from '@/src/lib/imageLibraryPickerGate';

type Message = {
  role: 'ai' | 'user';
  text: string;
  imageUri?: string;
  /** Greeting / error / info bubbles that are not part of the model conversation. */
  isSystem?: boolean;
  citations?: AiGenerateChatCitation[];
  /** True while tokens are still arriving for this bubble. */
  isStreaming?: boolean;
};

function hexLuminance(hex: string): number | null {
  const raw = hex.replace('#', '').trim();
  if (raw.length !== 6) return null;
  const n = parseInt(raw, 16);
  if (Number.isNaN(n)) return null;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').trim();
  if (raw.length !== 6) return hex;
  const n = parseInt(raw, 16);
  if (Number.isNaN(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function onPrimaryMuted(inverseHex: string, primaryHex: string): string {
  const L = hexLuminance(primaryHex);
  const a = L != null && L > 0.5 ? 0.62 : 0.78;
  return hexToRgba(inverseHex, a);
}

function onPrimaryChipBg(inverseHex: string): string {
  return hexToRgba(inverseHex, 0.14);
}

/** Tiny `{placeholder}` interpolation for translated strings. */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Client-side cap on the notes blob; the server enforces its own limit and reports CONTEXT_TOO_LARGE. */
const MAX_CONTEXT_LENGTH = 240_000;
/** Server error hint that the notes blob exceeded its context budget. */
const CONTEXT_TOO_LARGE_RE = /CONTEXT_TOO_LARGE|context (?:is )?too large|too large to send|maximum context|context length/i;
/** Flip to true locally to see the debug panel; always off in release builds. */
const SHOW_DEBUG_PANEL = false;
const DEBUG_MODE: boolean = __DEV__ && SHOW_DEBUG_PANEL;

export default function SubjectChat() {
  const { subjectId: subjectIdParam } = useLocalSearchParams<{ subjectId: string | string[] }>();
  const subjectId: string = typeof subjectIdParam === 'string' ? subjectIdParam : Array.isArray(subjectIdParam) ? subjectIdParam[0] ?? '' : '';

  const { language, notes, user, courses, handleSaveNote } = useApp();
  const userId = user.id ?? '';
  const theme = useTheme();
  const T = useTranslations(language);
  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  /** Streaming buffers: tokens land in a ref and flush to state on a timer. */
  const streamBufferRef = useRef('');
  const streamActiveRef = useRef(false);
  const streamFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      streamActiveRef.current = false;
      if (streamFlushRef.current) clearTimeout(streamFlushRef.current);
    };
  }, []);

  const headerSubColor = useMemo(() => onPrimaryMuted(theme.textInverse, theme.primary), [theme.textInverse, theme.primary]);
  const headerIconBg = useMemo(() => onPrimaryChipBg(theme.textInverse), [theme.textInverse]);

  /**
   * `Course.id` is the course code the student typed (CA266), and `name` is the
   * free-text label beside it. The Study tab already treats the code as the
   * heading and the name as the subtitle, so the header follows that: a code is
   * always recognisable, while the name is often a placeholder.
   */
  const subjectLabel = useMemo(() => {
    const course = courses.find((c) => c.id === subjectId);
    return subjectId.trim() || course?.name?.trim() || '';
  }, [courses, subjectId]);

  /**
   * The model gets both. The code anchors the answer to the right course, and
   * the name carries the academic domain when the student wrote a real one.
   */
  const subjectName = useMemo(() => {
    const course = courses.find((c) => c.id === subjectId);
    const name = course?.name?.trim();
    if (!name || name.toLowerCase() === subjectId.trim().toLowerCase()) return subjectLabel;
    return `${subjectLabel} (${name})`;
  }, [courses, subjectId, subjectLabel]);

  /**
   * PDF notes whose text has not been extracted yet. The tutor cannot read
   * these, and until now it skipped them silently while the greeting claimed
   * to have read "all your notes and PDFs". They are prepared on open below.
   */
  const unpreparedPdfs = useMemo(
    () => notes.filter((n) =>
      n.subjectId === subjectId &&
      noteHasPdfAttachment(n) &&
      !(n.extractedText ?? '').trim() &&
      !n.extractionError,
    ),
    [notes, subjectId],
  );

  /**
   * Markdown tables render at the bubble's width by default, so a six-column
   * table collapses to one character per line. Extraction now preserves tables
   * from lecture slides, which made this reachable. Give the table its natural
   * width inside a horizontal scroller instead.
   */
  const markdownRules = useMemo(
    () => ({
      table: (node: any, children: React.ReactNode) => (
        <ScrollView
          key={node.key}
          horizontal
          showsHorizontalScrollIndicator
          bounces={false}
          style={s.tableScroll}
          contentContainerStyle={s.tableScrollContent}
        >
          <View style={s.tableInner}>{children}</View>
        </ScrollView>
      ),
    }),
    [s],
  );

  const greeting = useMemo(
    () => fmt(T(unpreparedPdfs.length > 0 ? 'tutorGreetingPreparing' : 'tutorGreeting'), { subject: subjectLabel }),
    [T, subjectLabel, unpreparedPdfs.length],
  );
  const greetingMessage = useCallback((): Message => ({ role: 'ai', text: greeting, isSystem: true }), [greeting]);

  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<Message[]>(() => [{ role: 'ai', text: greeting, isSystem: true }]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Image attachment state
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [pendingImageBase64, setPendingImageBase64] = useState<string | null>(null);
  const [pendingImageMime, setPendingImageMime] = useState<string | null>(null);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // ─── Notes context ───────────────────────────────────────────────────────
  const subjectNotes = useMemo(() => {
    const list = notes.filter((n) => n.subjectId === subjectId);
    // Chronological order so the model sees the material roughly as it was taught
    list.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
    return list;
  }, [notes, subjectId]);

  const { notesBlob, noteTitles, extractedCount } = useMemo(() => {
    const sections: string[] = [];
    const titles: { id: string; title: string }[] = [];
    let extracted = 0;
    for (const n of subjectNotes) {
      const content = (n.content ?? '').trim();
      const extractedText = (n.extractedText ?? '').trim();
      if (!content && !extractedText) continue;
      if (extractedText) extracted += 1;
      const body = [content, extractedText].filter(Boolean).join('\n\n');
      sections.push(`### ${n.title}\n${body}`);
      titles.push({ id: n.id, title: n.title });
    }
    let blob = sections.join('\n\n');
    if (blob.length > MAX_CONTEXT_LENGTH) blob = blob.slice(0, MAX_CONTEXT_LENGTH);
    return { notesBlob: blob, noteTitles: titles, extractedCount: extracted };
  }, [subjectNotes]);

  useEffect(() => {
    if (!DEBUG_MODE) return;
    console.log(`[SubjectChat DEBUG] subjectId="${subjectId}" notes=${subjectNotes.length} withExtracted=${extractedCount} blobLen=${notesBlob.length}`);
  }, [subjectId, subjectNotes.length, extractedCount, notesBlob.length]);

  // Keep the RAG index for this subject fresh (best-effort, throttled inside).
  useEffect(() => {
    if (!subjectId || !userId) return;
    void ensureSubjectEmbeddings(subjectId, subjectNotes);
  }, [subjectId, userId, subjectNotes]);

  // ─── Prepare PDFs the tutor cannot read yet ──────────────────────────────
  // Flashcards and quizzes already extract on demand; chat was the only surface
  // that left an unprepared PDF invisible. Runs once per subject open, in
  // sequence, and writes the result back to the note so every other surface
  // (badge, quiz, flashcards, RAG index) benefits from the same extraction.
  const preparedSubjectRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || !subjectId) return;
    if (preparedSubjectRef.current === subjectId) return;
    if (unpreparedPdfs.length === 0) return;
    preparedSubjectRef.current = subjectId;

    const targets = unpreparedPdfs.filter((n) => !!n.attachmentPath);
    if (targets.length === 0) return;

    const post = (text: string) => {
      if (mountedRef.current) setMessages((prev) => [...prev, { role: 'ai', text, isSystem: true }]);
    };
    post(fmt(T('tutorPreparingPdfs'), { n: targets.length }));

    (async () => {
      let ready = 0;
      let failed = 0;
      for (const note of targets) {
        try {
          const r = await extractPdfTextFromStoragePath(note.attachmentPath as string);
          if (!mountedRef.current) return;
          if (r.stage === 'done' && r.text.trim()) {
            handleSaveNote({ ...note, extractedText: r.text, extractionError: undefined });
            ready += 1;
          } else {
            // Recording the failure stops this from silently retrying on every
            // open, and surfaces the Retry pill in the notes list.
            handleSaveNote({ ...note, extractionError: r.detail || 'Could not read this PDF' });
            failed += 1;
          }
        } catch (e: any) {
          if (!mountedRef.current) return;
          handleSaveNote({ ...note, extractionError: e?.message || 'Could not read this PDF' });
          failed += 1;
        }
      }
      if (ready > 0) post(fmt(T('tutorPdfsReady'), { n: ready }));
      if (failed > 0) post(fmt(T('tutorPdfsFailed'), { n: failed }));
    })();
  }, [subjectId, userId, unpreparedPdfs, handleSaveNote, T]);

  // ─── Sessions ────────────────────────────────────────────────────────────
  const loadSession = useCallback(async (s: ChatSession) => {
    setCurrentSessionId(s.id);
    const msgs = await getChatMessages(s.id);
    if (!mountedRef.current) return;
    if (msgs.length > 0) {
      setMessages(msgs.map((m) => ({ role: m.role, text: m.content })));
    } else {
      setMessages([greetingMessage()]);
    }
    setShowHistory(false);
  }, [greetingMessage]);

  useEffect(() => {
    if (!userId || !subjectId) return;
    let cancelled = false;
    (async () => {
      const s = await getChatSessions(userId, subjectId);
      if (cancelled || !mountedRef.current) return;
      setSessions(s);
      if (user.subscriptionPlan !== 'pro' && s.length > 0) {
        // Non-Pro users have a single thread and no History menu — auto-resume it.
        void loadSession(s[0]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, subjectId]);

  const startNewChat = () => {
    setCurrentSessionId(null);
    setMessages([greetingMessage()]);
    setShowHistory(false);
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await deleteChatSession(userId, id);
    } catch {
      return;
    }
    if (!mountedRef.current) return;
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) {
      startNewChat();
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => { if (mountedRef.current) scrollRef.current?.scrollToEnd({ animated: true }); }, 100);
  };

  // ─── Image picker ────────────────────────────────────────────────────────
  const pickImage = useCallback(async (source: 'library' | 'camera') => {
    try {
      const checkAndSetImage = async (asset: ImagePicker.ImagePickerAsset) => {
        let b64 = asset.base64;
        if (!b64 && asset.uri) {
          b64 = await readUriAsBase64(asset.uri);
        }
        if (b64 && (b64.length * 0.75) > 10 * 1024 * 1024) {
          Alert.alert(T('tutorFileTooLargeTitle'), T('tutorFileTooLargeBody'));
          return;
        }
        if (!mountedRef.current) return;
        setPendingImageUri(asset.uri);
        setPendingImageBase64(b64 ?? null);
        setPendingImageMime(asset.mimeType?.startsWith('image/') ? asset.mimeType : null);
      };

      if (source === 'library') {
        const granted = await ensureImageLibraryAccessForPicker();
        if (!granted) {
          Alert.alert(T('tutorPermissionNeededTitle'), T('tutorPhotoPermissionBody'));
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          base64: true,
          allowsEditing: false,
        });
        if (result.canceled || !result.assets?.[0]) return;
        await checkAndSetImage(result.assets[0]);
      } else {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(T('tutorPermissionNeededTitle'), T('tutorCameraPermissionBody'));
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          quality: 0.7,
          base64: true,
          allowsEditing: false,
        });
        if (result.canceled || !result.assets?.[0]) return;
        await checkAndSetImage(result.assets[0]);
      }
    } catch (e: any) {
      if (__DEV__) console.error('[SubjectChat] pickImage error:', e);
    }
  }, [T]);

  const showImagePickerOptions = useCallback(() => {
    Alert.alert(T('tutorAttachImageTitle'), T('tutorAttachImageBody'), [
      { text: T('tutorCamera'), onPress: () => pickImage('camera') },
      { text: T('tutorPhotoLibrary'), onPress: () => pickImage('library') },
      { text: T('cancel'), style: 'cancel' },
    ]);
  }, [pickImage, T]);

  const clearPendingImage = useCallback(() => {
    setPendingImageUri(null);
    setPendingImageBase64(null);
    setPendingImageMime(null);
  }, []);

  // ─── Citations / quick actions ───────────────────────────────────────────
  const openNote = useCallback((noteId: string) => {
    const note: Note | undefined = notes.find((n) => n.id === noteId);
    if (!note) return;
    const isPdf = note.attachmentFileName?.toLowerCase().endsWith('.pdf') ||
      note.attachmentPath?.toLowerCase().endsWith('.pdf');
    const opensWritingCanvas = note.noteType === 'handwriting' ||
      (!!isPdf && isAtLeastPlus(user.subscriptionPlan));
    router.push({
      pathname: opensWritingCanvas ? '/handwriting-editor' as any : '/notes-editor' as any,
      params: {
        subjectId: note.subjectId,
        noteId: note.id,
        ...(isPdf && opensWritingCanvas ? { pdfMode: '1' } : {}),
      },
    });
  }, [notes, user.subscriptionPlan]);

  const openFlashcardPicker = useCallback(() => {
    router.push({ pathname: '/flashcard-pick' as any, params: { subjectId } });
  }, [subjectId]);

  // ─── Sending ─────────────────────────────────────────────────────────────
  const sendMessage = async (rawText: string, image?: { uri: string | null; base64: string | null; mime: string | null }) => {
    const userText = rawText.trim();
    const imageBase64 = image?.base64 ?? null;
    if (!userText && !imageBase64) return;
    if (isProcessing) return;

    // Check limits for new conversation
    if (!currentSessionId) {
      const maxSessions = user.subscriptionPlan === 'pro' ? 15 : user.subscriptionPlan === 'plus' ? 3 : 1;
      if (sessions.length >= maxSessions) {
        if (user.subscriptionPlan === 'pro') {
          Alert.alert(T('tutorLimitReachedTitle'), fmt(T('tutorLimitReachedPro'), { max: maxSessions }));
        } else {
          const planName = user.subscriptionPlan === 'plus' ? 'Plus' : 'Free';
          // Free users are being sold Plus; Plus users are being sold Pro.
          const upsellPlan = user.subscriptionPlan === 'plus' ? 'pro' : 'plus';
          Alert.alert(
            T('tutorLimitReachedTitle'),
            [
              fmt(T('tutorLimitReachedPlan'), { max: maxSessions, plan: planName }),
              localizedTrialTagline(language, upsellPlan),
            ]
              .filter(Boolean)
              .join(' '),
            [
              { text: T('cancel'), style: 'cancel' },
              {
                text: localizedTrialCta(language, upsellPlan, T('tutorUpgrade')),
                onPress: () => router.push('/subscription-plans' as any),
              },
            ],
          );
        }
        return;
      }
    }

    const displayText = userText || T('tutorImageAttached');
    const userMessage: Message = { role: 'user', text: displayText, imageUri: image?.uri ?? undefined };
    // Model-visible history: everything before this turn, excluding greeting/error bubbles.
    // The current question is appended last (the server treats the trailing user turn as the question).
    const history = [...messages, userMessage]
      .filter((m) => !m.isSystem && m.text)
      .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }) as { role: 'user' | 'assistant'; content: string })
      .slice(-10);

    setMessages((prev) => [...prev, userMessage]);
    setChatInput('');
    clearPendingImage();
    setIsProcessing(true);
    scrollToBottom();

    if (!notesBlob && !imageBase64) {
      const debugMsg = DEBUG_MODE
        ? `\n\n---\n🐛 **DEBUG:** notes blob is empty.\nsubjectId = "${subjectId}"\nTotal notes in app = ${notes.length}\nNotes matching this subject = ${subjectNotes.length}`
        : '';
      if (mountedRef.current) {
        setMessages((prev) => [...prev, { role: 'ai', text: `${T('tutorNoNotes')}${debugMsg}`, isSystem: true }]);
        setIsProcessing(false);
        scrollToBottom();
      }
      return;
    }

    // ── Streaming bubble ────────────────────────────────────────────────
    // Tokens arrive faster than the list can usefully re-render, so they are
    // buffered in a ref and flushed on a short timer.
    const flushStream = () => {
      if (streamFlushRef.current) {
        clearTimeout(streamFlushRef.current);
        streamFlushRef.current = null;
      }
      if (!mountedRef.current || !streamActiveRef.current) return;
      const text = streamBufferRef.current;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last?.isStreaming) return prev;
        return [...prev.slice(0, -1), { ...last, text }];
      });
    };

    const beginStreamingBubble = () => {
      streamBufferRef.current = '';
      streamActiveRef.current = true;
      setMessages((prev) => [...prev, { role: 'ai', text: '', isStreaming: true }]);
    };

    const appendStreamChunk = (chunk: string) => {
      streamBufferRef.current += chunk;
      if (!streamFlushRef.current) {
        streamFlushRef.current = setTimeout(() => {
          streamFlushRef.current = null;
          flushStream();
        }, 60);
      }
    };

    const endStreamingBubble = (finalText: string | null, citations: AiGenerateChatCitation[]) => {
      if (streamFlushRef.current) {
        clearTimeout(streamFlushRef.current);
        streamFlushRef.current = null;
      }
      streamActiveRef.current = false;
      if (!mountedRef.current) return;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last?.isStreaming) return prev;
        // finalText null means the attempt failed: drop the partial bubble so
        // the buffered retry can post a clean answer.
        if (finalText === null) return prev.slice(0, -1);
        return [...prev.slice(0, -1), { role: 'ai', text: finalText, citations: citations.length > 0 ? citations : undefined }];
      });
    };

    const pushSystem = (text: string) => {
      if (!mountedRef.current) return;
      setMessages((prev) => [...prev, { role: 'ai', text, isSystem: true }]);
    };

    try {
      const buildBody = (content: string): AiGenerateRequest => ({
        kind: 'chat',
        content,
        subject_id: subjectId,
        subject_name: subjectName,
        language,
        question: userText,
        chat_history: history,
        ...(imageBase64 ? { image_base64: imageBase64 } : {}),
        ...(imageBase64 && image?.mime ? { image_mime: image.mime } : {}),
        ...(content && noteTitles.length > 0 ? { note_titles: noteTitles } : {}),
      });

      if (DEBUG_MODE) {
        console.log(`[SubjectChat DEBUG] ai_generate chat: subject_id="${subjectId}" subject_name="${subjectName}" contentLen=${notesBlob.length} history=${history.length} notes=${noteTitles.length} image=${!!imageBase64}`);
        pushSystem(`🐛 **DEBUG — Request Sent**\n- subject_id: "${subjectId}"\n- subject_name: "${subjectName}"\n- Notes in blob: ${noteTitles.length}\n- With extractedText: ${extractedCount}\n- Context length: ${notesBlob.length} chars\n- Question: "${userText.slice(0, 80)}"\n- Chat history msgs: ${history.length}`);
      }

      const cleanCitations = (raw: unknown): AiGenerateChatCitation[] => {
        const list = Array.isArray(raw)
          ? (raw as AiGenerateChatCitation[]).filter(
              (c) => c && typeof c.note_id === 'string' && typeof c.title === 'string',
            )
          : [];
        return list.filter((c, i, arr) => arr.findIndex((o) => o.note_id === c.note_id) === i);
      };

      /**
       * One attempt at a given context size. Streams when the device supports
       * it and falls back to the buffered call on any streaming failure, so a
       * proxy that breaks SSE degrades to the old behaviour instead of an error.
       */
      const runChat = async (
        content: string,
      ): Promise<
        | { ok: true; text: string; citations: AiGenerateChatCitation[]; streamed: boolean }
        | { ok: false; error: string | null; aborted?: boolean }
      > => {
        const requestBody = buildBody(content);

        if (canStreamChat()) {
          let metaCitations: AiGenerateChatCitation[] = [];
          beginStreamingBubble();
          const outcome = await streamAiChat(requestBody, {
            onDelta: appendStreamChunk,
            onMeta: ({ citations }) => {
              metaCitations = cleanCitations(citations);
            },
          });

          if (outcome.ok && outcome.text.trim()) {
            const finalText = outcome.text.trim();
            const finalCitations = cleanCitations(outcome.citations).length > 0
              ? cleanCitations(outcome.citations)
              : metaCitations;
            endStreamingBubble(finalText, finalCitations);
            return { ok: true, text: finalText, citations: finalCitations, streamed: true };
          }

          endStreamingBubble(null, []);
          if (!outcome.ok && outcome.error === 'aborted') return { ok: false, error: null, aborted: true };
          if (DEBUG_MODE && !outcome.ok) {
            console.log(`[SubjectChat DEBUG] stream failed, falling back: ${outcome.error}`);
          }
          // A quota or context error is authoritative — do not burn a second
          // request re-asking the same question through the buffered path.
          if (!outcome.ok && (isMonthlyLimitError(outcome.error) || CONTEXT_TOO_LARGE_RE.test(outcome.error))) {
            // invokeAiGenerate raises this alert on the buffered path; the
            // streaming path bypasses it, so raise it here.
            if (isMonthlyLimitError(outcome.error)) showMonthlyLimitAlert(language);
            return { ok: false, error: outcome.error };
          }
        }

        const result = await invokeAiGenerate<AiGenerateChatResult>(requestBody);
        if (result.error) return { ok: false, error: result.error };
        const text = result.data?.response?.trim();
        if (!text) return { ok: false, error: null };
        return { ok: true, text, citations: cleanCitations(result.data?.citations), streamed: false };
      };

      let attempt = await runChat(notesBlob);

      // Server says the notes blob is too big: tell the user, then retry once relying on RAG only.
      if (!attempt.ok && attempt.error && notesBlob && CONTEXT_TOO_LARGE_RE.test(attempt.error)) {
        pushSystem(T('tutorContextTooLarge'));
        attempt = await runChat('');
      }

      if (!mountedRef.current) return;

      if (!attempt.ok) {
        if (attempt.aborted) return;
        if (attempt.error === null) {
          let text = T('tutorNoResponse');
          if (DEBUG_MODE) text += `\n\n---\n🐛 **DEBUG:** empty response with no error returned.`;
          pushSystem(text);
        } else if (isMonthlyLimitError(attempt.error)) {
          // invokeAiGenerate already showed the upgrade alert; keep the bubble short.
          pushSystem(T('tutorMonthlyLimitBubble'));
        } else {
          let text = fmt(T('tutorErrorGeneric'), { error: attempt.error });
          if (DEBUG_MODE) text += `\n\n---\n🐛 **DEBUG — Error Details**\n\`\`\`\n${attempt.error}\n\`\`\``;
          pushSystem(text);
        }
        return;
      }

      const aiText = attempt.text;
      // The streaming path already committed its own bubble.
      if (!attempt.streamed) {
        setMessages((prev) => [
          ...prev,
          { role: 'ai', text: aiText, citations: attempt.citations.length > 0 ? attempt.citations : undefined },
        ]);
      }

      // Persist only after a successful model response so a failed call never leaves an orphan user turn.
      try {
        let activeSessionId = currentSessionId;
        if (!activeSessionId) {
          const title = displayText.slice(0, 30) + (displayText.length > 30 ? '...' : '');
          const newSess = await createChatSession(userId, {
            subjectId,
            title,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          activeSessionId = newSess.id;
          if (mountedRef.current) {
            setCurrentSessionId(activeSessionId);
            setSessions((prev) => [newSess, ...prev]);
          }
        } else {
          void updateChatSessionTimestamp(activeSessionId);
        }
        await createChatMessage({ sessionId: activeSessionId, role: 'user', content: displayText, createdAt: new Date().toISOString() });
        await createChatMessage({ sessionId: activeSessionId, role: 'ai', content: aiText, createdAt: new Date().toISOString() });
      } catch (persistErr) {
        if (__DEV__) console.error('[SubjectChat] failed to persist chat turn:', persistErr);
      }
    } catch (e: any) {
      if (__DEV__) console.error('[SubjectChat] sendMessage caught error:', e);
      const errorDetail = DEBUG_MODE ? `\n\n---\n🐛 **DEBUG — Exception**\n\`\`\`\n${e?.message || String(e)}\n${e?.stack?.slice(0, 300) || ''}\n\`\`\`` : '';
      pushSystem(`${T('tutorNetworkError')}${errorDetail}`);
    } finally {
      if (mountedRef.current) {
        setIsProcessing(false);
        scrollToBottom();
      }
    }
  };

  const handleSend = () => {
    void sendMessage(chatInput, { uri: pendingImageUri, base64: pendingImageBase64, mime: pendingImageMime });
  };

  const lastAnswerIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'ai' && !messages[i].isSystem) return i;
    }
    return -1;
  }, [messages]);

  /** Once tokens are on screen the spinner is redundant. */
  const isStreamingText = useMemo(() => {
    const last = messages[messages.length - 1];
    return Boolean(last?.isStreaming && last.text.length > 0);
  }, [messages]);

  const canSend = (!!chatInput.trim() || !!pendingImageBase64) && !isProcessing;
  const planLabel = user.subscriptionPlan === 'pro' ? 'PRO' : user.subscriptionPlan === 'plus' ? 'PLUS' : 'FREE';
  const headerSub = user.subscriptionPlan === 'pro' ? T('tutorHeaderSubPro') : user.subscriptionPlan === 'plus' ? T('tutorHeaderSubPlus') : T('tutorHeaderSubFree');

  return (
    <View style={s.container}>
      <KeyboardAvoidingView
        style={[s.sheetContainer, { backgroundColor: theme.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[s.header, { backgroundColor: theme.primary }]}>
          <View style={s.headerLeft}>
            <Pressable onPress={() => router.back()} style={s.backBtn}>
              <Feather name="chevron-left" size={28} color={theme.textInverse} />
            </Pressable>
            <Pressable onPress={() => {
              if (user.subscriptionPlan !== 'pro') {
                Alert.alert(
                  T('tutorProFeatureTitle'),
                  [T('tutorProFeatureBody'), localizedTrialTagline(language, 'pro')]
                    .filter(Boolean)
                    .join(' '),
                  [
                    { text: T('cancel'), style: 'cancel' },
                    {
                      text: localizedTrialCta(language, 'pro', T('tutorUpgradeToPro')),
                      onPress: () => router.push('/subscription-plans' as any),
                    },
                  ],
                );
              } else {
                setShowHistory(true);
              }
            }} style={[s.headerIcon, { backgroundColor: headerIconBg }]}>
              <Feather name={user.subscriptionPlan === 'pro' ? 'menu' : 'lock'} size={16} color={theme.textInverse} />
              <Text style={{ color: theme.textInverse, fontSize: 12, fontWeight: '700' }}>{T('tutorRecent')}</Text>
            </Pressable>
            <View style={{ flexShrink: 1 }}>
              <Text style={[s.headerTitle, { color: theme.textInverse }]} numberOfLines={1}>{fmt(T('tutorHeaderTitle'), { subject: subjectLabel })}</Text>
              <Text style={[s.headerSub, { color: headerSubColor }]}>{headerSub}</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <View style={s.plusBadge}>
              <Text style={s.plusBadgeText}>{planLabel}</Text>
            </View>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={[s.messagesList, { backgroundColor: theme.background }]}
          contentContainerStyle={s.messagesContent}
        >
          <Text style={[s.dateIndicator, { color: theme.textSecondary }]}>{T('today')}</Text>
          {DEBUG_MODE && (
            <View style={{ backgroundColor: hexToRgba(theme.primary, 0.08), borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: hexToRgba(theme.primary, 0.2) }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: theme.primary, letterSpacing: 0.5, marginBottom: 4 }}>🐛 DEBUG PANEL</Text>
              <Text style={{ fontSize: 12, color: theme.text, lineHeight: 18 }}>
                subjectId: "{subjectId}" ({subjectName}){'\n'}
                Notes found: {subjectNotes.length}{'\n'}
                With extractedText: {extractedCount}{'\n'}
                Context length: {notesBlob.length} chars{'\n'}
                Titles: {noteTitles.length > 0 ? noteTitles.map((t) => t.title).join(', ') : '(none)'}
              </Text>
            </View>
          )}
          {messages.map((m, i) => {
            const isLastAnswer = i === lastAnswerIndex;
            // The streaming bubble exists before the first token arrives; the
            // "thinking" indicator covers that gap, so skip the empty shell.
            if (m.isStreaming && !m.text) return null;
            return (
              <View key={i} style={[s.bubbleWrap, m.role === 'user' && s.bubbleRight]}>
                <View
                  style={[
                    s.bubble,
                    m.role === 'user'
                      ? [s.bubbleUser, { backgroundColor: theme.primary, borderBottomRightRadius: 6 }]
                      : [s.bubbleAi, { backgroundColor: theme.card, borderColor: theme.border, borderBottomLeftRadius: 6 }],
                  ]}
                >
                  {m.imageUri ? (
                    <Image source={{ uri: m.imageUri }} style={s.bubbleImage} resizeMode="cover" />
                  ) : null}
                  {m.role === 'ai' ? (
                    <Markdown
                      style={{
                        body: { ...StyleSheet.flatten(s.bubbleText), color: theme.text },
                        paragraph: { marginTop: 0, marginBottom: 8 },
                        code_inline: { backgroundColor: theme.border, paddingHorizontal: 4, borderRadius: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
                        code_block: { backgroundColor: theme.border, padding: 8, borderRadius: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
                        link: { color: theme.primary },
                        list_item: { marginBottom: 4 },
                        // Cells need a floor, or long prose columns squeeze the
                        // short ones down to a single character.
                        th: { minWidth: 96, padding: 6 },
                        td: { minWidth: 96, padding: 6 },
                      }}
                      rules={markdownRules}
                    >
                      {m.text}
                    </Markdown>
                  ) : (
                    m.text && m.text !== T('tutorImageAttached') ? (
                      <Text style={[s.bubbleText, { color: theme.textInverse, marginTop: m.imageUri ? 8 : 0 }]}>
                        {m.text}
                      </Text>
                    ) : null
                  )}
                </View>
                {m.role === 'ai' && m.citations && m.citations.length > 0 ? (
                  <View style={s.citationRow}>
                    <Text style={[s.citationLabel, { color: theme.textSecondary }]}>{T('tutorCitationsFrom')}</Text>
                    {m.citations.map((c) => (
                      <Pressable
                        key={c.note_id}
                        onPress={() => openNote(c.note_id)}
                        style={({ pressed }) => [s.citationChip, { backgroundColor: hexToRgba(theme.primary, 0.1), borderColor: hexToRgba(theme.primary, 0.25) }, pressed && { opacity: 0.6 }]}
                        hitSlop={4}
                      >
                        <Feather name="file-text" size={11} color={theme.primary} />
                        <Text style={[s.citationText, { color: theme.primary }]} numberOfLines={1}>{c.title}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {isLastAnswer && !isProcessing ? (
                  <View style={s.quickRow}>
                    <QuickChip label={T('tutorQuickSimplify')} icon="feather" theme={theme} onPress={() => void sendMessage(T('tutorQuickSimplifyPrompt'))} />
                    <QuickChip label={T('tutorQuickDeeper')} icon="layers" theme={theme} onPress={() => void sendMessage(T('tutorQuickDeeperPrompt'))} />
                    <QuickChip label={T('tutorQuickQuiz')} icon="help-circle" theme={theme} onPress={() => void sendMessage(T('tutorQuickQuizPrompt'))} />
                    <QuickChip label={T('tutorQuickFlashcards')} icon="copy" theme={theme} onPress={openFlashcardPicker} />
                  </View>
                ) : null}
              </View>
            );
          })}
          {isProcessing && !isStreamingText && (
            <View style={s.bubbleWrap}>
              <View style={[s.bubble, s.bubbleAi, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={s.processingRow}>
                  <ActivityIndicator size="small" color={theme.primary} />
                  <Text style={[s.bubbleText, { color: theme.textSecondary }]}>{T('tutorThinking')}</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {pendingImageUri ? (
          <View style={{ backgroundColor: theme.card, borderTopColor: theme.border, borderTopWidth: 1, padding: 16, paddingBottom: 0, flexDirection: 'row' }}>
            <View style={s.imagePreviewWrap}>
              <Image source={{ uri: pendingImageUri }} style={s.imagePreviewThumb} resizeMode="cover" />
              <Pressable onPress={clearPendingImage} style={[s.imagePreviewRemove, { backgroundColor: theme.text, zIndex: 10 }]}>
                <Feather name="x" size={12} color={theme.background} />
              </Pressable>
            </View>
          </View>
        ) : null}
        <View style={[s.inputRow, { borderTopColor: theme.border, backgroundColor: theme.card, borderTopWidth: pendingImageUri ? 0 : 1 }]}>
          <Pressable
            onPress={showImagePickerOptions}
            style={[s.attachBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
            hitSlop={8}
          >
            <Feather name="image" size={20} color={theme.primary} />
          </Pressable>
          <TextInput
            style={[s.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
            value={chatInput}
            onChangeText={setChatInput}
            placeholder={pendingImageUri ? T('tutorPlaceholderImage') : T('tutorPlaceholder')}
            placeholderTextColor={theme.textSecondary}
            multiline
            textAlignVertical="center"
          />
          <Pressable
            style={[
              s.sendBtn,
              { backgroundColor: theme.primary },
              !canSend && { opacity: 0.5 },
            ]}
            onPress={handleSend}
            disabled={!canSend}
          >
            <Feather name="arrow-up" size={20} color={theme.textInverse} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* History Modal */}
      <Modal visible={showHistory} animationType="slide" transparent>
        <View style={s.modalBackdrop}>
          <View style={[s.modalContent, { backgroundColor: theme.background }]}>
            <View style={[s.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[s.modalTitle, { color: theme.text }]}>{T('tutorHistoryTitle')}</Text>
              <Pressable onPress={() => setShowHistory(false)} style={s.closeBtn}>
                <Feather name="x" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={s.historyList} contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 12 }}>
              <Pressable
                style={[s.historyItem, !currentSessionId && s.historyItemActive, { borderColor: theme.primary }]}
                onPress={startNewChat}
              >
                <Feather name="plus-circle" size={20} color={theme.primary} />
                <Text style={[s.historyItemTitle, { color: theme.primary }]}>{T('tutorNewConversation')}</Text>
              </Pressable>

              {sessions.map((sItem) => (
                <Pressable
                  key={sItem.id}
                  style={[s.historyItem, currentSessionId === sItem.id && s.historyItemActive, { borderColor: theme.border }]}
                  onPress={() => void loadSession(sItem)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.historyItemTitle, { color: theme.text }]} numberOfLines={1}>{sItem.title}</Text>
                    <Text style={[s.historyItemDate, { color: theme.textSecondary }]}>{new Date(sItem.updatedAt).toLocaleDateString()}</Text>
                  </View>
                  <Pressable
                    style={s.deleteBtn}
                    onPress={() => Alert.alert(T('tutorDeleteConversationTitle'), T('tutorDeleteConversationBody'), [
                      { text: T('cancel'), style: 'cancel' },
                      { text: T('delete'), style: 'destructive', onPress: () => void handleDeleteSession(sItem.id) },
                    ])}
                  >
                    <Feather name="trash-2" size={16} color="#ef4444" />
                  </Pressable>
                </Pressable>
              ))}
              {sessions.length === 0 && (
                <Text style={[s.historyEmpty, { color: theme.textSecondary }]}>{T('tutorNoPastConversations')}</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function QuickChip({ label, icon, theme, onPress }: {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  theme: ReturnType<typeof useTheme>;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [s.quickChip, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.6 }]}
    >
      <Feather name={icon} size={12} color={theme.primary} />
      <Text style={[s.quickChipText, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  sheetContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { marginRight: 0, marginLeft: -8 },
  headerIcon: {
    height: 40,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 6,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  headerSub: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
  plusBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  plusBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  messagesList: { flex: 1 },
  messagesContent: { padding: 20, paddingBottom: 40, gap: 16 },
  dateIndicator: { textAlign: 'center', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  bubbleWrap: { alignItems: 'flex-start' },
  bubbleRight: { alignItems: 'flex-end' },
  bubble: { maxWidth: '85%', padding: 16, borderRadius: 20 },
  bubbleAi: { borderWidth: 1, alignSelf: 'flex-start' },
  bubbleUser: { alignSelf: 'flex-end' },
  bubbleText: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  citationRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8, maxWidth: '85%' },
  citationLabel: { fontSize: 11, fontWeight: '700' },
  citationChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, maxWidth: 200 },
  citationText: { fontSize: 11, fontWeight: '600' },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, maxWidth: '95%' },
  quickChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  quickChipText: { fontSize: 12, fontWeight: '700' },

  inputRow: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    gap: 10,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '500',
    borderWidth: 1,
    maxHeight: 120,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { height: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 4 },
  historyList: { flex: 1 },
  historyItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, borderWidth: 1 },
  historyItemActive: { backgroundColor: 'rgba(139, 92, 246, 0.08)' },
  historyItemTitle: { fontSize: 16, fontWeight: '600' },
  historyItemDate: { fontSize: 12, marginTop: 4 },
  deleteBtn: { padding: 8 },
  historyEmpty: { textAlign: 'center', marginTop: 40 },

  // Image attachment styles
  tableScroll: { marginBottom: 8 },
  tableScrollContent: { paddingRight: 4 },
  // 640 keeps a six-column table readable; narrower tables still shrink to fit.
  tableInner: { minWidth: 640 },
  bubbleImage: {
    width: 240,
    height: 240,
    borderRadius: 12,
    marginBottom: 4,
  },
  imagePreviewWrap: {
    position: 'relative',
    width: 64,
    height: 64,
  },
  imagePreviewThumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  imagePreviewRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
