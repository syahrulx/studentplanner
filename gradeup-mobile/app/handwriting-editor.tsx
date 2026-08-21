import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Switch,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as FileSystem from 'expo-file-system/legacy';
import {
  Gesture,
  GestureDetector,
  PointerType,
  type GestureType,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import ColorPicker from 'react-native-wheel-color-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PDFDocument } from 'pdf-lib';
import HandwritingCanvas, { HandwritingInkPreview } from '@/src/components/handwriting/HandwritingCanvas';
import { useApp } from '@/src/context/AppContext';
import { isAtLeastPlus, isPro } from '@/src/lib/flashcardGenerationLimits';
import {
  loadHandwritingPages,
  flushHandwritingOutbox,
  hasPendingHandwritingSync,
  saveHandwritingDraft,
  saveHandwritingPages,
} from '@/src/lib/handwritingDb';
import { exportHandwritingPdf } from '@/src/lib/handwritingExport';
import {
  createHandwritingPage,
  DEFAULT_HANDWRITING_TOOL_SETTINGS,
  HANDWRITING_PAGE_ASPECT_RATIO,
  handwritingNoteSummary,
  type HandwritingPage,
  type HandwritingStroke,
  type HandwritingTemplate,
  type HandwritingTool,
  type HandwritingToolSettings,
} from '@/src/lib/handwritingTypes';
import { getNoteAttachmentUrl } from '@/src/lib/noteStorage';
import { supabase } from '@/src/lib/supabase';
import { useTheme } from '@/hooks/useTheme';
import { invokeAiGenerate, type AiGenerateChatResult } from '@/src/lib/invokeAiGenerate';

const COLORS = ['#111827', '#2563eb', '#dc2626', '#16a34a', '#7c3aed', '#f59e0b'];
const FIXED_INK_COLORS = COLORS.slice(0, -2);
const FALLBACK_SAVED_COLORS = COLORS.slice(-2);
const SAVED_INK_COLORS_KEY = 'rencana_handwriting_saved_ink_colours_v1';
const AUTO_RETURN_ERASER_KEY = 'rencana_handwriting_auto_return_eraser_v1';
const TOOL_SETTINGS_KEY = 'rencana_handwriting_tool_settings_v2';
type InkColorTool = 'pen' | 'pencil' | 'highlighter';
type SavedInkColors = Record<InkColorTool, string[]>;

const EMPTY_SAVED_INK_COLORS: SavedInkColors = {
  pen: [],
  pencil: [],
  highlighter: [],
};

function isSavedInkColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function parseSavedInkColors(value: unknown): SavedInkColors {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const colorsFor = (tool: InkColorTool) => (
    Array.isArray(source[tool])
      ? [...new Set(source[tool].filter(isSavedInkColor))].slice(-2)
      : []
  );
  return {
    pen: colorsFor('pen'),
    pencil: colorsFor('pencil'),
    highlighter: colorsFor('highlighter'),
  };
}

function inkColorTool(tool: HandwritingTool): InkColorTool {
  return tool === 'eraser' || tool === 'lasso' ? 'pen' : tool;
}
const TEMPLATES: Array<{ id: HandwritingTemplate; label: string; pro?: boolean }> = [
  { id: 'blank', label: 'Blank' },
  { id: 'ruled', label: 'Ruled' },
  { id: 'grid', label: 'Grid' },
  { id: 'dots', label: 'Dotted' },
  { id: 'cornell', label: 'Cornell', pro: true },
  { id: 'dark', label: 'Dark paper', pro: true },
];

interface ContinuousPageProps {
  page: HandwritingPage;
  pageWidth: number;
  aspectRatio: number;
  documentVersion: number;
  tool: HandwritingTool;
  color: string;
  strokeWidth: number;
  fingerDrawing: boolean;
  editable: boolean;
  settings: HandwritingToolSettings;
  documentGestures: GestureType[];
  horizontalOffset: SharedValue<number>;
  primaryColor: string;
  secondaryTextColor: string;
  loadPdfPage: (pageNumber: number) => Promise<string | null>;
  onChange: (pageId: string, strokes: HandwritingStroke[]) => void;
  onCommit: (pageId: string, previous: HandwritingStroke[]) => void;
  onToolGestureEnd: (tool: HandwritingTool) => void;
}

function ContinuousPage({
  page,
  pageWidth,
  aspectRatio,
  documentVersion,
  tool,
  color,
  strokeWidth,
  fingerDrawing,
  editable,
  settings,
  documentGestures,
  horizontalOffset,
  primaryColor,
  secondaryTextColor,
  loadPdfPage,
  onChange,
  onCommit,
  onToolGestureEnd,
}: ContinuousPageProps) {
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(page.pdfPageNumber != null);
  const horizontalPanStyle = useAnimatedStyle(() => ({
    // Move the paper inside the clipped list viewport. Moving the viewport
    // itself leaves its clip area behind and makes a zoomed page feel stuck.
    transform: [{ translateX: horizontalOffset.value }],
  }));

  useEffect(() => {
    let active = true;
    if (page.pdfPageNumber == null) {
      setPdfUri(null);
      setLoadingPdf(false);
      return;
    }
    setLoadingPdf(true);
    void loadPdfPage(page.pdfPageNumber).then((uri) => {
      if (!active) return;
      setPdfUri(uri);
      setLoadingPdf(false);
    });
    return () => { active = false; };
  }, [documentVersion, loadPdfPage, page.pdfPageNumber]);

  return (
    <Animated.View style={[styles.continuousPageWrap, horizontalPanStyle]}>
      <View style={[styles.continuousPaper, { width: pageWidth, aspectRatio }]}>
        {pdfUri ? (
          <WebView
            key={pdfUri}
            source={{ uri: pdfUri }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            scrollEnabled={false}
            originWhitelist={['*']}
            allowFileAccess
          />
        ) : null}
        {loadingPdf ? (
          <View style={[StyleSheet.absoluteFill, styles.pdfPageLoading]} pointerEvents="none">
            <ActivityIndicator color={primaryColor} />
            <Text style={{ color: secondaryTextColor, fontSize: 11, fontWeight: '700' }}>Preparing page…</Text>
          </View>
        ) : null}
        <View style={StyleSheet.absoluteFill}>
          <HandwritingCanvas
            page={page}
            tool={tool}
            color={color}
            width={strokeWidth}
            fingerDrawing={fingerDrawing}
            disabled={!editable}
            settings={settings}
            simultaneousGestures={documentGestures}
            transparentBackground={page.pdfPageNumber != null && !!pdfUri}
            onChange={(strokes) => onChange(page.id, strokes)}
            onCommit={(previous) => onCommit(page.id, previous)}
            onToolGestureEnd={onToolGestureEnd}
          />
        </View>
      </View>
    </Animated.View>
  );
}

function PageThumbnailPreview({
  page,
  loadPdfPage,
}: {
  page: HandwritingPage;
  loadPdfPage: (pageNumber: number) => Promise<string | null>;
}) {
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (page.pdfPageNumber == null) return () => { active = false; };
    void loadPdfPage(page.pdfPageNumber).then((uri) => {
      if (active) setPdfUri(uri);
    });
    return () => { active = false; };
  }, [loadPdfPage, page.pdfPageNumber]);
  return (
    <View style={styles.thumbnailPreview} pointerEvents="none">
      {pdfUri ? (
        <WebView source={{ uri: pdfUri }} style={StyleSheet.absoluteFill} pointerEvents="none" scrollEnabled={false} allowFileAccess />
      ) : null}
      <HandwritingInkPreview page={page} width={92} height={118} transparentBackground={page.pdfPageNumber != null} />
    </View>
  );
}

function ToolOptionRow<T extends string | number>({
  label,
  hint,
  options,
  value,
  onChange,
  primary,
  text,
  secondary,
  border,
}: {
  label: string;
  hint?: string;
  options: Array<{
    label: string;
    value: T;
    icon?: keyof typeof Feather.glyphMap;
    symbol?: string;
    lineWidth?: number;
  }>;
  value: T;
  onChange: (value: T) => void;
  primary: string;
  text: string;
  secondary: string;
  border: string;
}) {
  return (
    <View style={[styles.optionSection, { borderBottomColor: border }]}>
      <Text style={[styles.optionLabel, { color: text }]}>{label}</Text>
      {hint ? <Text style={[styles.optionHint, { color: secondary }]}>{hint}</Text> : null}
      <View style={styles.optionChoices}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              onPress={() => onChange(option.value)}
              style={[
                styles.optionChip,
                { borderColor: selected ? primary : border },
                selected && { backgroundColor: `${primary}16` },
              ]}
            >
              {option.icon ? (
                <Feather name={option.icon} size={17} color={selected ? primary : secondary} />
              ) : option.lineWidth ? (
                <View
                  style={[
                    styles.optionLineSample,
                    {
                      height: option.lineWidth,
                      borderRadius: option.lineWidth,
                      backgroundColor: selected ? primary : text,
                    },
                  ]}
                />
              ) : option.symbol ? (
                <Text style={[styles.optionSymbol, { color: selected ? primary : secondary }]}>
                  {option.symbol}
                </Text>
              ) : null}
              <Text style={{ color: selected ? primary : text, fontSize: 11, fontWeight: '800' }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function HandwritingEditor() {
  const { subjectId, noteId, pdfMode } = useLocalSearchParams<{
    subjectId: string;
    noteId: string;
    pdfMode?: string;
  }>();
  const { notes, user, handleSaveNote } = useApp();
  const navigation = useNavigation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const savedInkColorsKey = `${SAVED_INK_COLORS_KEY}:${user?.id ?? 'local'}`;
  const autoReturnEraserKey = `${AUTO_RETURN_ERASER_KEY}:${user?.id ?? 'local'}`;
  const toolSettingsKey = `${TOOL_SETTINGS_KEY}:${user?.id ?? 'local'}`;
  const note = notes.find((candidate) => candidate.id === noteId);
  const premium = isAtLeastPlus(user?.subscriptionPlan);
  const canEdit = premium;
  const pro = isPro(user?.subscriptionPlan);
  const isPdfAnnotation = pdfMode === '1' || (!!note?.attachmentPath && note?.noteType !== 'handwriting');

  const [pages, setPages] = useState<HandwritingPage[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tool, setTool] = useState<HandwritingTool>('pen');
  const [autoReturnAfterErasing, setAutoReturnAfterErasing] = useState(true);
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [fingerDrawing, setFingerDrawing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncIssue, setSyncIssue] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [title, setTitle] = useState(note?.title ?? 'Handwritten note');
  const [showColors, setShowColors] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showPageThumbnails, setShowPageThumbnails] = useState(false);
  const [customColor, setCustomColor] = useState(color);
  const [savedInkColors, setSavedInkColors] = useState<SavedInkColors>(EMPTY_SAVED_INK_COLORS);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfPageRatios, setPdfPageRatios] = useState<Record<number, number>>({});
  const [exporting, setExporting] = useState(false);
  const [showInsertPage, setShowInsertPage] = useState(false);
  const [showToolOptions, setShowToolOptions] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [insertPosition, setInsertPosition] = useState<'before' | 'after'>('after');
  const [toolSettings, setToolSettings] = useState<HandwritingToolSettings>(DEFAULT_HANDWRITING_TOOL_SETTINGS);
  const [toolSettingsLoaded, setToolSettingsLoaded] = useState(false);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 1, height: 1 });
  const [zoomScale, setZoomScale] = useState(1);
  const [undoStacks, setUndoStacks] = useState<Record<string, HandwritingStroke[][]>>({});
  const [redoStacks, setRedoStacks] = useState<Record<string, HandwritingStroke[][]>>({});

  // ── AI Chat Side Panel state ──
  type AiChatMessage = { role: 'ai' | 'user'; text: string };
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([
    { role: 'ai', text: 'Hi! I\'m your AI study assistant. Ask me anything about your notes — summarize, explain, or quiz you!' },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiProcessing, setAiProcessing] = useState(false);
  const aiScrollRef = useRef<ScrollView>(null);
  const AI_PANEL_WIDTH = Dimensions.get('window').width * 0.55;

  // Build notes context for AI from all notes in this subject
  const aiNotesContext = useMemo(() => {
    const subjectNotes = notes.filter((n) => n.subjectId === subjectId);
    const extractedCount = subjectNotes.filter((n) => n.extractedText && n.extractedText.trim().length > 0).length;
    console.log(`[AskAI] subjectId="${subjectId}", notes in subject: ${subjectNotes.length}, with extractedText: ${extractedCount}`);
    subjectNotes.forEach((n, i) => {
      console.log(`[AskAI]   Note[${i}]: title="${n.title}", contentLen=${(n.content || '').length}, extractedTextLen=${(n.extractedText || '').length}`);
    });
    const parts = subjectNotes.map((n) => {
      const segments = [`[Note: ${n.title}]`];
      if (n.content && n.content.trim()) segments.push(n.content);
      if (n.extractedText && n.extractedText.trim()) segments.push(`[Extracted PDF Text]\n${n.extractedText}`);
      return segments.join('\n');
    });
    const raw = parts.join('\n\n');
    const systemInstruction = `You are the student's AI study assistant. Answer based on the notes provided below. If the answer is not in the notes, say so politely.\n\nSTUDENT NOTES:\n`;
    const ctx = systemInstruction + raw.slice(0, 180000);
    console.log(`[AskAI] Total context length: ${ctx.length}`);
    return ctx;
  }, [notes, subjectId]);

  const sendAiMessage = useCallback(async () => {
    const text = aiInput.trim();
    if (!text || aiProcessing) return;
    const userMsg: AiChatMessage = { role: 'user', text };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiInput('');
    setAiProcessing(true);
    setTimeout(() => aiScrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const chatHistory = [...aiMessages, userMsg].map((m) => ({
        role: m.role === 'ai' ? 'assistant' as const : 'user' as const,
        content: m.text,
      }));
      const { data, error } = await invokeAiGenerate<AiGenerateChatResult>({
        kind: 'chat',
        content: aiNotesContext,
        chat_history: chatHistory,
        subject_id: subjectId,
        question: text,
      });
      if (error) {
        setAiMessages((prev) => [...prev, { role: 'ai', text: `Sorry, something went wrong: ${error}` }]);
      } else if (data?.response) {
        setAiMessages((prev) => [...prev, { role: 'ai', text: data.response }]);
      }
    } catch {
      setAiMessages((prev) => [...prev, { role: 'ai', text: 'Could not reach AI. Please try again.' }]);
    } finally {
      setAiProcessing(false);
      setTimeout(() => aiScrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [aiInput, aiProcessing, aiMessages, subjectId, aiNotesContext]);

  const pagesRef = useRef(pages);
  const pdfDocumentRef = useRef<PDFDocument | null>(null);
  const pdfPageFilesRef = useRef<Map<number, string>>(new Map());
  const pdfPagePromisesRef = useRef<Map<number, Promise<string | null>>>(new Map());
  const uidRef = useRef<string | null>(null);
  const lastWritingToolRef = useRef<InkColorTool>('pen');
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistPromiseRef = useRef<Promise<void> | null>(null);
  const draftWriteRef = useRef<Promise<void>>(Promise.resolve());
  const documentListRef = useAnimatedRef<FlatList<HandwritingPage>>();
  const scrollOffset = useSharedValue(0);
  const panStartOffset = useSharedValue(0);
  const horizontalOffset = useSharedValue(0);
  const panStartHorizontalOffset = useSharedValue(0);
  const horizontalLimit = useSharedValue(0);
  const verticalLimit = useSharedValue(0);
  const committedZoom = useSharedValue(1);
  const pinchStartZoom = useSharedValue(1);
  const pinchStartScroll = useSharedValue(0);
  const pinchStartHorizontalOffset = useSharedValue(0);
  const liveZoom = useSharedValue(1);
  const pinchVisualX = useSharedValue(0);
  const pinchVisualY = useSharedValue(0);
  const activeInkColorTool = inkColorTool(tool);
  const visibleInkColors = useMemo(() => {
    const saved = savedInkColors[activeInkColorTool];
    const trailing = [...FALLBACK_SAVED_COLORS];
    const start = trailing.length - saved.length;
    saved.forEach((savedColor, index) => { trailing[start + index] = savedColor; });
    return [...FIXED_INK_COLORS, ...trailing];
  }, [activeInkColorTool, savedInkColors]);

  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    if (tool !== 'eraser' && tool !== 'lasso') lastWritingToolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(savedInkColorsKey).then((stored) => {
      if (!active || !stored) return;
      try {
        setSavedInkColors(parseSavedInkColors(JSON.parse(stored)));
      } catch {
        // Keep the default swatches if an older local value cannot be read.
      }
    }).catch(() => {
      // A custom colour is optional; drawing should never be blocked by storage.
    });
    return () => { active = false; };
  }, [savedInkColorsKey]);

  useEffect(() => {
    let active = true;
    setAutoReturnAfterErasing(true);
    void AsyncStorage.getItem(autoReturnEraserKey).then((stored) => {
      if (active && stored != null) setAutoReturnAfterErasing(stored !== 'off');
    }).catch(() => {
      // Keep the default enabled setting if the preference cannot be read.
    });
    return () => { active = false; };
  }, [autoReturnEraserKey]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(toolSettingsKey).then((stored) => {
      if (!active) return;
      try {
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<HandwritingToolSettings>;
          setToolSettings({ ...DEFAULT_HANDWRITING_TOOL_SETTINGS, ...parsed });
        }
      } catch {
        // Keep safe defaults if an older preference is malformed.
      }
      setToolSettingsLoaded(true);
    }).catch(() => {
      if (active) setToolSettingsLoaded(true);
    });
    return () => { active = false; };
  }, [toolSettingsKey]);

  useEffect(() => {
    if (!toolSettingsLoaded) return;
    void AsyncStorage.setItem(toolSettingsKey, JSON.stringify(toolSettings)).catch(() => {});
  }, [toolSettings, toolSettingsKey, toolSettingsLoaded]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!noteId) {
        setLoading(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session?.user?.id) {
        setLoading(false);
        Alert.alert('Sign in required', 'Sign in to sync handwritten notes.');
        return;
      }
      uidRef.current = session.user.id;
      const loaded = await loadHandwritingPages(session.user.id, noteId);
      if (!active) return;
      const prepared = isPdfAnnotation
        ? loaded.map((page, index) => (
          page.pdfPageNumber != null || page.isInsertedBlank
            ? page
            : { ...page, pdfPageNumber: index + 1 }
        ))
        : loaded;
      setPages(prepared);
      pagesRef.current = prepared;
      setLoading(false);
      void hasPendingHandwritingSync(session.user.id, noteId).then((pending) => {
        if (active) setSyncIssue(pending);
      });
      void flushHandwritingOutbox(session.user.id).then(async () => {
        if (active) setSyncIssue(await hasPendingHandwritingSync(session.user.id, noteId));
      });
    };
    void load();
    return () => { active = false; };
  }, [isPdfAnnotation, noteId]);

  useEffect(() => {
    let active = true;
    if (!isPdfAnnotation || !note?.attachmentPath) {
      setPdfPageCount(0);
      setPdfPageRatios({});
      pdfDocumentRef.current = null;
      pdfPageFilesRef.current.clear();
      pdfPagePromisesRef.current.clear();
      return;
    }
    void getNoteAttachmentUrl(note.attachmentPath).then(async ({ url }) => {
      if (!active) return;
      if (!url) return;
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const document = await PDFDocument.load(await response.arrayBuffer(), {
          ignoreEncryption: true,
        });
        if (!active) return;
        pdfDocumentRef.current = document;
        pdfPageFilesRef.current.clear();
        pdfPagePromisesRef.current.clear();
        setPdfPageRatios(Object.fromEntries(
          document.getPages().map((page, index) => {
            const size = page.getSize();
            return [index + 1, size.width / Math.max(1, size.height)];
          }),
        ));
        setPdfPageCount(document.getPageCount());
      } catch {
        // The editor still opens page one if page counting is unavailable.
      }
    });
    return () => { active = false; };
  }, [isPdfAnnotation, note?.attachmentPath]);

  const loadPdfPage = useCallback((pageNumber: number): Promise<string | null> => {
    const cached = pdfPageFilesRef.current.get(pageNumber);
    if (cached) return Promise.resolve(cached);
    const pending = pdfPagePromisesRef.current.get(pageNumber);
    if (pending) return pending;

    const task = (async () => {
      const sourceDocument = pdfDocumentRef.current;
      if (!sourceDocument || !FileSystem.cacheDirectory) return null;
      try {
        const singlePageDocument = await PDFDocument.create();
        const [copiedPage] = await singlePageDocument.copyPages(sourceDocument, [pageNumber - 1]);
        singlePageDocument.addPage(copiedPage);
        const base64 = await singlePageDocument.saveAsBase64();
        const safeNoteId = String(noteId ?? 'note').replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileUri = `${FileSystem.cacheDirectory}rencana-${safeNoteId}-page-${pageNumber}.pdf`;
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        pdfPageFilesRef.current.set(pageNumber, fileUri);
        while (pdfPageFilesRef.current.size > 10) {
          const oldest = pdfPageFilesRef.current.entries().next().value as [number, string] | undefined;
          if (!oldest) break;
          pdfPageFilesRef.current.delete(oldest[0]);
          void FileSystem.deleteAsync(oldest[1], { idempotent: true }).catch(() => {});
        }
        return fileUri;
      } catch {
        return null;
      } finally {
        pdfPagePromisesRef.current.delete(pageNumber);
      }
    })();
    pdfPagePromisesRef.current.set(pageNumber, task);
    return task;
  }, [noteId]);

  useEffect(() => () => {
    const cachedFiles = [...pdfPageFilesRef.current.values()];
    pdfPageFilesRef.current.clear();
    cachedFiles.forEach((uri) => {
      void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    });
    pdfDocumentRef.current = null;
  }, []);

  useEffect(() => {
    if (!isPdfAnnotation || loading || pdfPageCount < 1) return;
    setPages((current) => {
      if (current.some((page) => page.pdfDocumentInitialized)) return current;
      const existingPdfPages = new Set(
        current
          .map((page) => page.pdfPageNumber)
          .filter((pageNumber): pageNumber is number => typeof pageNumber === 'number'),
      );
      const next = [...current];
      for (let pageNumber = 1; pageNumber <= pdfPageCount; pageNumber += 1) {
        if (!existingPdfPages.has(pageNumber)) {
          next.push(createHandwritingPage(next.length, 'blank', pageNumber));
        }
      }
      const normalized = next.map((page, index) => ({
        ...page,
        index,
        pdfDocumentInitialized: true,
      }));
      pagesRef.current = normalized;
      revisionRef.current += 1;
      dirtyRef.current = true;
      setDirty(true);
      return normalized;
    });
  }, [isPdfAnnotation, loading, pdfPageCount]);

  const queueLocalDraft = useCallback((nextPages: HandwritingPage[]) => {
    const uid = uidRef.current;
    if (!uid || !noteId || !canEdit) return;
    draftWriteRef.current = draftWriteRef.current
      .catch(() => {})
      .then(() => saveHandwritingDraft(uid, noteId, nextPages));
  }, [canEdit, noteId]);

  const persist = useCallback(async (showError = false) => {
    if (persistPromiseRef.current) {
      await persistPromiseRef.current;
    }
    const uid = uidRef.current;
    if (!uid || !noteId || !canEdit || !dirtyRef.current) return;
    const savingRevision = revisionRef.current;
    const currentPages = pagesRef.current.map((page, index) => ({
      ...page,
      index,
      updatedAt: new Date().toISOString(),
    }));
    pagesRef.current = currentPages;
    const run = (async () => {
      setSaving(true);
      try {
        if (note) {
          handleSaveNote({
            ...note,
            title: title.trim() || 'Handwritten note',
            noteType: isPdfAnnotation ? note.noteType : 'handwriting',
            content: isPdfAnnotation ? note.content : handwritingNoteSummary(currentPages.length),
            updatedAt: new Date().toISOString().slice(0, 10),
          });
        }
        await saveHandwritingPages(uid, noteId, currentPages);
        setSyncIssue(false);
        if (revisionRef.current === savingRevision) {
          setDirty(false);
          dirtyRef.current = false;
        }
      } catch {
        // saveHandwritingPages writes the local cache before cloud sync, so ink
        // remains safe without triggering React Native's red error overlay.
        setSyncIssue(true);
        if (revisionRef.current === savingRevision) {
          setDirty(false);
          dirtyRef.current = false;
        }
        if (showError) Alert.alert('Could not sync', 'Your note is saved on this device and will sync when you reconnect.');
      } finally {
        setSaving(false);
      }
    })();
    persistPromiseRef.current = run;
    try {
      await run;
    } finally {
      if (persistPromiseRef.current === run) persistPromiseRef.current = null;
    }
  }, [canEdit, handleSaveNote, isPdfAnnotation, note, noteId, title]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const uid = uidRef.current;
        if (uid) void flushHandwritingOutbox(uid).then((synced) => {
          if (synced > 0) setSyncIssue(false);
        });
      } else if (dirtyRef.current) {
        queueLocalDraft(pagesRef.current);
        void persist();
      }
    });
    return () => subscription.remove();
  }, [persist, queueLocalDraft]);

  useEffect(() => {
    if (!syncIssue) return;
    const retry = setInterval(() => {
      const uid = uidRef.current;
      if (!uid) return;
      void flushHandwritingOutbox(uid).then((synced) => {
        if (synced > 0) setSyncIssue(false);
      });
    }, 15000);
    return () => clearInterval(retry);
  }, [syncIssue]);

  useEffect(() => {
    if (!dirty || loading) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void persist(); }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [dirty, loading, pages, persist, title]);

  const activePage = pages[activeIndex];

  const updatePageStrokes = useCallback((pageId: string, strokes: HandwritingStroke[]) => {
    setPages((current) => {
      const next = current.map((page) => (
        page.id === pageId ? { ...page, strokes, updatedAt: new Date().toISOString() } : page
      ));
      pagesRef.current = next;
      queueLocalDraft(next);
      return next;
    });
    revisionRef.current += 1;
    setDirty(true);
    dirtyRef.current = true;
  }, [queueLocalDraft]);

  const commitPageGesture = useCallback((pageId: string, previous: HandwritingStroke[]) => {
    setUndoStacks((current) => ({ ...current, [pageId]: [...(current[pageId] ?? []), previous].slice(-50) }));
    setRedoStacks((current) => ({ ...current, [pageId]: [] }));
  }, []);

  const handleToolGestureEnd = useCallback((completedTool: HandwritingTool) => {
    if (completedTool === 'eraser' && autoReturnAfterErasing) {
      setTool(lastWritingToolRef.current);
    }
  }, [autoReturnAfterErasing]);

  const updateAutoReturnAfterErasing = useCallback((enabled: boolean) => {
    setAutoReturnAfterErasing(enabled);
    void AsyncStorage.setItem(autoReturnEraserKey, enabled ? 'on' : 'off');
  }, [autoReturnEraserKey]);

  const undo = () => {
    if (!activePage) return;
    const stack = undoStacks[activePage.id] ?? [];
    const previous = stack[stack.length - 1];
    if (!previous) return;
    setRedoStacks((current) => ({
      ...current,
      [activePage.id]: [...(current[activePage.id] ?? []), activePage.strokes],
    }));
    setUndoStacks((current) => ({ ...current, [activePage.id]: stack.slice(0, -1) }));
    updatePageStrokes(activePage.id, previous);
  };

  const redo = () => {
    if (!activePage) return;
    const stack = redoStacks[activePage.id] ?? [];
    const nextStrokes = stack[stack.length - 1];
    if (!nextStrokes) return;
    setUndoStacks((current) => ({
      ...current,
      [activePage.id]: [...(current[activePage.id] ?? []), activePage.strokes],
    }));
    setRedoStacks((current) => ({ ...current, [activePage.id]: stack.slice(0, -1) }));
    updatePageStrokes(activePage.id, nextStrokes);
  };

  const insertBlankPage = (template: HandwritingTemplate, requiresPro?: boolean) => {
    if (requiresPro && !pro) {
      Alert.alert('Pro template', 'Cornell and dark paper templates are available with Rencana Pro.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'View Pro', onPress: () => router.push('/subscription-plans' as never) },
      ]);
      return;
    }
    const insertionIndex = insertPosition === 'before' ? activeIndex : activeIndex + 1;
    const next = [...pagesRef.current];
    next.splice(insertionIndex, 0, {
      ...createHandwritingPage(insertionIndex, template),
      isInsertedBlank: true,
      pdfDocumentInitialized: isPdfAnnotation || undefined,
    });
    const operationTime = new Date().toISOString();
    const normalized = next.map((page, index) => ({ ...page, index, updatedAt: operationTime }));
    setPages(normalized);
    pagesRef.current = normalized;
    queueLocalDraft(normalized);
    setActiveIndex(insertionIndex);
    revisionRef.current += 1;
    setDirty(true);
    dirtyRef.current = true;
    setShowInsertPage(false);
  };

  const removeActivePage = () => {
    const currentPage = pagesRef.current[activeIndex];
    if (!currentPage) return;
    setShowMoreMenu(false);
    if (pagesRef.current.length <= 1) {
      Alert.alert('Keep one page', 'A notebook must contain at least one page.');
      return;
    }
    const pageLabel = currentPage.pdfPageNumber != null
      ? `PDF page ${currentPage.pdfPageNumber}`
      : 'this page';
    Alert.alert(
      'Remove page?',
      `Remove ${pageLabel} and its handwriting from this notebook? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const operationTime = new Date().toISOString();
            const next = pagesRef.current
              .filter((page) => page.id !== currentPage.id)
              .map((page, index) => ({ ...page, index, updatedAt: operationTime }));
            pagesRef.current = next;
            setPages(next);
            queueLocalDraft(next);
            setActiveIndex(Math.min(activeIndex, next.length - 1));
            setUndoStacks((current) => {
              const updated = { ...current };
              delete updated[currentPage.id];
              return updated;
            });
            setRedoStacks((current) => {
              const updated = { ...current };
              delete updated[currentPage.id];
              return updated;
            });
            revisionRef.current += 1;
            dirtyRef.current = true;
            setDirty(true);
          },
        },
      ],
    );
  };

  const applyTemplate = (template: HandwritingTemplate, requiresPro?: boolean) => {
    if (requiresPro && !pro) {
      Alert.alert('Pro template', 'Cornell and dark paper templates are available with Rencana Pro.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'View Pro', onPress: () => router.push('/subscription-plans' as never) },
      ]);
      return;
    }
    setPages((current) => {
      const next = current.map((page, index) => index === activeIndex
        ? { ...page, template, updatedAt: new Date().toISOString() }
        : page);
      pagesRef.current = next;
      queueLocalDraft(next);
      return next;
    });
    revisionRef.current += 1;
    setDirty(true);
    dirtyRef.current = true;
    if (template === 'dark' && color.toLowerCase() === '#111827') setColor('#f8fafc');
    if (template !== 'dark' && color.toLowerCase() === '#f8fafc') setColor('#111827');
    setShowTemplates(false);
  };

  const goBack = async () => {
    await persist(true);
    router.back();
  };

  // The header back button above already flushes via goBack(), but the
  // Android hardware back button and iOS swipe-back gesture bypass it
  // entirely — the only thing standing between the user and their last
  // strokes was the 600ms debounced autosave, so drawing right up to the
  // moment of a gesture-back could lose whatever hadn't been persisted yet
  // (same usePreventRemove pattern already used in app/game-2048.tsx).
  // Silent by design: no confirmation prompt, just make sure the flush
  // actually happens before the screen is allowed to go away.
  usePreventRemove(dirty, ({ data }) => {
    void persist(true).then(() => navigation.dispatch(data.action));
  });

  // iOS completes a swipe-back natively before usePreventRemove's JS-side
  // listener can intercept it, so the gesture is disabled while there's
  // unsaved ink — same workaround as game-2048.tsx. The header back button
  // and Android hardware back still work normally either way.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !dirty });
  }, [navigation, dirty]);

  const exportPdf = async () => {
    if (!pages.length || exporting) return;
    setExporting(true);
    try {
      await exportHandwritingPdf({
        title: title.trim() || note?.title || 'Rencana Notes',
        pages,
        attachmentPath: isPdfAnnotation ? note?.attachmentPath : undefined,
      });
    } catch (error) {
      if (__DEV__) console.error('[Handwriting] export failed:', error);
      Alert.alert('Export failed', 'Rencana could not create the PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const useCustomColor = useCallback(() => {
    setColor(customColor);
    if (tool === 'eraser') setTool('pen');
    setShowColors(false);
  }, [customColor, tool]);

  const saveCustomColor = useCallback(() => {
    if (!isSavedInkColor(customColor)) return;
    const colorTool = inkColorTool(tool);
    const next: SavedInkColors = {
      ...savedInkColors,
      [colorTool]: [...savedInkColors[colorTool].filter((saved) => saved !== customColor), customColor].slice(-2),
    };
    setSavedInkColors(next);
    setColor(customColor);
    if (tool === 'eraser') setTool('pen');
    setShowColors(false);
    void AsyncStorage.setItem(savedInkColorsKey, JSON.stringify(next));
  }, [customColor, savedInkColors, savedInkColorsKey, tool]);

  const tools = useMemo<Array<{ id: HandwritingTool; icon: keyof typeof Feather.glyphMap; label: string }>>(
    () => [
      { id: 'pen', icon: 'edit-3', label: 'Pen' },
      { id: 'pencil', icon: 'edit-2', label: 'Pencil' },
      { id: 'highlighter', icon: 'minus', label: 'Marker' },
      { id: 'eraser', icon: 'delete', label: 'Eraser' },
      { id: 'lasso', icon: 'mouse-pointer', label: 'Lasso' },
    ],
    [],
  );
  const basePageWidth = Math.max(1, workspaceSize.width - 24);
  const pageWidth = basePageWidth * zoomScale;
  useEffect(() => {
    committedZoom.value = zoomScale;
    // The layout now owns this zoom level, so the temporary transform can
    // return to 1 without applying the scale a second time.
    liveZoom.value = zoomScale;
    const nextLimit = Math.max(0, (pageWidth - basePageWidth) / 2);
    horizontalLimit.value = nextLimit;
    horizontalOffset.value = Math.max(-nextLimit, Math.min(nextLimit, horizontalOffset.value));
  }, [basePageWidth, committedZoom, horizontalLimit, horizontalOffset, pageWidth, zoomScale]);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 45 }).current;
  const documentScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.value = event.contentOffset.y;
    },
  });
  useAnimatedReaction(
    () => scrollOffset.value,
    (offset) => {
      scrollTo(documentListRef, 0, offset, false);
    },
  );
  const documentScrollGesture = useMemo(() => Gesture.Pan()
    .minDistance(1)
    .maxPointers(2)
    .manualActivation(true)
    .onTouchesDown((event, stateManager) => {
      if (event.pointerType === PointerType.STYLUS) {
        stateManager.fail();
        return;
      }
      if (event.pointerType === PointerType.MOUSE && fingerDrawing) {
        stateManager.fail();
        return;
      }
      // Do not activate navigation on the first finger yet. Waiting for the
      // first movement lets a second finger form a true pinch instead of the
      // pan gesture stealing it and making zoom feel stuck.
    })
    .onTouchesMove((event, stateManager) => {
      const shouldNavigate = fingerDrawing
        ? event.numberOfTouches >= 2
        : tool === 'lasso'
          ? event.numberOfTouches >= 2
          : event.numberOfTouches === 1;
      if (shouldNavigate) stateManager.activate();
    })
    .onStart(() => {
      panStartOffset.value = scrollOffset.value;
      panStartHorizontalOffset.value = horizontalOffset.value;
    })
    .onUpdate((event) => {
      const offset = Math.max(0, Math.min(verticalLimit.value, panStartOffset.value - event.translationY));
      scrollOffset.value = offset;
      horizontalOffset.value = Math.max(
        -horizontalLimit.value,
        Math.min(horizontalLimit.value, panStartHorizontalOffset.value + event.translationX),
      );
    })
    .onEnd((event) => {
      scrollOffset.value = withDecay({
        velocity: -event.velocityY,
        clamp: [0, verticalLimit.value],
        deceleration: 0.995,
      });
      if (horizontalLimit.value > 0 && Math.abs(event.velocityX) > 40) {
        horizontalOffset.value = withDecay({
          velocity: event.velocityX,
          clamp: [-horizontalLimit.value, horizontalLimit.value],
        });
      }
    }), [fingerDrawing, tool]);
  const commitDocumentZoom = useCallback((value: number, targetScroll: number, targetHorizontal: number) => {
    const next = Math.max(1, Math.min(3, value));
    setZoomScale(Math.round(next * 100) / 100);
    horizontalOffset.value = targetHorizontal;
    setTimeout(() => {
      scrollOffset.value = Math.max(0, Math.min(verticalLimit.value, targetScroll));
      pinchVisualX.value = withTiming(0, { duration: 80 });
      pinchVisualY.value = withTiming(0, { duration: 80 });
    }, 32);
  }, [horizontalOffset, pinchVisualX, pinchVisualY, scrollOffset, verticalLimit]);
  const documentPinchGesture = useMemo(() => Gesture.Pinch()
    .onStart(() => {
      pinchStartZoom.value = committedZoom.value;
      pinchStartScroll.value = scrollOffset.value;
      pinchStartHorizontalOffset.value = horizontalOffset.value;
      liveZoom.value = committedZoom.value;
    })
    .onUpdate((event) => {
      const next = Math.max(1, Math.min(3, pinchStartZoom.value * event.scale));
      liveZoom.value = next;
      const ratio = next / Math.max(0.01, pinchStartZoom.value);
      pinchVisualX.value = (workspaceSize.width / 2 - event.focalX) * (ratio - 1);
      pinchVisualY.value = (workspaceSize.height / 2 - event.focalY) * (ratio - 1);
    })
    .onEnd((event) => {
      const next = Math.max(1, Math.min(3, pinchStartZoom.value * event.scale));
      const ratio = next / Math.max(0.01, pinchStartZoom.value);
      const targetScroll = (pinchStartScroll.value + event.focalY) * ratio - event.focalY;
      const nextHorizontalLimit = Math.max(0, (basePageWidth * next - basePageWidth) / 2);
      const targetHorizontal = Math.max(
        -nextHorizontalLimit,
        Math.min(
          nextHorizontalLimit,
          pinchStartHorizontalOffset.value - (event.focalX - workspaceSize.width / 2) * (ratio - 1),
        ),
      );
      runOnJS(commitDocumentZoom)(next, targetScroll, targetHorizontal);
    })
    .onFinalize((_event, success) => {
      if (!success) liveZoom.value = withTiming(committedZoom.value, { duration: 120 });
    }), [basePageWidth, commitDocumentZoom, workspaceSize.height, workspaceSize.width]);
  const documentGesture = useMemo(
    () => Gesture.Simultaneous(documentScrollGesture, documentPinchGesture),
    [documentPinchGesture, documentScrollGesture],
  );
  const documentExternalGestures = useMemo<GestureType[]>(
    () => [documentScrollGesture, documentPinchGesture],
    [documentPinchGesture, documentScrollGesture],
  );
  const documentTransformStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: pinchVisualX.value },
      { translateY: pinchVisualY.value },
      { scale: liveZoom.value / Math.max(0.01, committedZoom.value) },
    ],
  }));
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    const visibleIndex = viewableItems.find((item) => item.index != null)?.index;
    if (visibleIndex != null) setActiveIndex(visibleIndex);
  }).current;

  if (loading || !activePage) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
        <Text style={{ color: theme.textSecondary }}>Opening notebook…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.primary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: theme.primary }]}>
        <Pressable onPress={() => { void goBack(); }} style={styles.headerBtn}>
          <Feather name="chevron-left" size={25} color={theme.textInverse} />
        </Pressable>
        <TextInput
          style={[styles.titleInput, { color: theme.textInverse }]}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            revisionRef.current += 1;
            setDirty(true);
            dirtyRef.current = true;
          }}
          placeholder="Notebook title"
          placeholderTextColor={`${theme.textInverse}99`}
          selectTextOnFocus
          editable={canEdit}
        />
        <View style={[
          styles.savePill,
          saving || dirty
            ? styles.savePillPending
            : syncIssue
              ? styles.savePillLocal
              : styles.savePillSaved,
        ]}>
          <Feather
            name={saving || dirty ? 'clock' : syncIssue ? 'smartphone' : 'check'}
            size={11}
            color="#ffffff"
          />
          <Text style={styles.saveText}>
            {canEdit ? (saving ? 'Saving' : dirty ? 'Editing' : syncIssue ? 'On device' : 'Autosaved') : 'View only'}
          </Text>
        </View>
        <Pressable
          onPress={() => Alert.alert(
            'Writing controls',
            'Pinch with two fingers to zoom. Once zoomed, drag in any direction to move around the page. Apple Pencil and tablet styluses write. With Finger ink off, one finger navigates; turn it on for one-finger drawing.',
          )}
          style={styles.headerBtn}
        >
          <Feather name="info" size={20} color={theme.textInverse} />
        </Pressable>
        <Pressable
          onPress={() => canEdit ? setShowMoreMenu(true) : Alert.alert('View only', 'Handwriting editing is available with Plus or Pro.', [{ text: 'Not now' }, { text: 'View plans', onPress: () => router.push('/subscription-plans' as never) }])}
          style={styles.headerBtn}
        >
          <Feather name="more-vertical" size={21} color={theme.textInverse} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.toolbarScroll, { backgroundColor: theme.card, borderBottomColor: theme.border }]}
        contentContainerStyle={styles.toolbar}
      >
        {tools.map((item) => (
          <Pressable
            key={item.id}
            disabled={!canEdit}
            onPress={() => {
              if (!canEdit) return;
              if (tool === item.id) {
                if (item.id === 'lasso') return;
                setShowToolOptions(true);
                return;
              }
              setTool(item.id);
            }}
            style={[styles.toolBtn, tool === item.id && { backgroundColor: `${theme.primary}18` }]}
          >
            <View style={styles.toolIconRow}>
              <Feather name={item.icon} size={21} color={tool === item.id ? theme.primary : theme.text} />
              <Feather name="chevron-down" size={11} color={tool === item.id ? theme.primary : theme.textSecondary} />
            </View>
            <Text style={[styles.toolLabel, { color: tool === item.id ? theme.primary : theme.text }]}>{item.label}</Text>
          </Pressable>
        ))}
        <View style={[styles.separator, { backgroundColor: theme.border }]} />
        {visibleInkColors.map((ink, index) => (
          <Pressable
            key={`${activeInkColorTool}-${ink}-${index}`}
            onPress={() => { setColor(ink); if (tool === 'eraser') setTool('pen'); }}
            style={[styles.colorDotWrap, color === ink && { borderColor: theme.primary, backgroundColor: `${theme.primary}18` }]}
          >
            <View style={[styles.colorDot, { backgroundColor: ink }]} />
          </Pressable>
        ))}
        <Pressable onPress={() => { setCustomColor(color); setShowColors(true); }} style={[styles.colorDotWrap, styles.customColorBtn]}>
          <Feather name="sliders" size={17} color={theme.text} />
          <Text style={[styles.tinyLabel, { color: theme.text }]}>Colour</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.actionBarRow, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.actionBarScrollInner}
          contentContainerStyle={styles.actionBar}
        >
          <Pressable
            onPress={undo}
            disabled={!canEdit || !(undoStacks[activePage.id]?.length)}
            style={styles.actionBtn}
          >
            <Feather name="corner-up-left" size={18} color={undoStacks[activePage.id]?.length ? theme.text : theme.border} />
            <Text style={[styles.actionLabel, { color: theme.text }, !(undoStacks[activePage.id]?.length) && { color: theme.textSecondary }]}>Undo</Text>
          </Pressable>
          <Pressable
            onPress={redo}
            disabled={!canEdit || !(redoStacks[activePage.id]?.length)}
            style={styles.actionBtn}
          >
            <Feather name="corner-up-right" size={18} color={redoStacks[activePage.id]?.length ? theme.text : theme.border} />
            <Text style={[styles.actionLabel, { color: theme.text }, !(redoStacks[activePage.id]?.length) && { color: theme.textSecondary }]}>Redo</Text>
          </Pressable>
          {!isPdfAnnotation ? (
            <Pressable disabled={!canEdit} onPress={() => setShowTemplates(true)} style={styles.actionBtn}>
              <Feather name="grid" size={18} color={theme.text} />
              <Text style={[styles.actionLabel, { color: theme.text }]}>Paper</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setShowPageThumbnails(true)} style={styles.actionBtn}>
            <Feather name="sidebar" size={18} color={theme.text} />
            <Text style={[styles.actionLabel, { color: theme.text }]}>Pages</Text>
          </Pressable>
          <Pressable
            disabled={!canEdit}
            onPress={() => setFingerDrawing((value) => !value)}
            style={[
              styles.fingerModeBtn,
              {
                backgroundColor: fingerDrawing ? `${theme.primary}18` : theme.background,
                borderColor: fingerDrawing ? `${theme.primary}55` : theme.border,
              },
            ]}
          >
            <Feather name="edit-3" size={17} color={fingerDrawing ? theme.primary : theme.text} />
            <View>
              <Text style={[styles.fingerModeLabel, { color: fingerDrawing ? theme.primary : theme.text }]}>Finger ink</Text>
              <Text style={[styles.fingerModeState, { color: fingerDrawing ? theme.primary : theme.textSecondary }]}>
                {fingerDrawing ? 'On' : 'Off'}
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => {
              setZoomScale(1);
              horizontalOffset.value = 0;
            }}
            disabled={zoomScale === 1}
            style={styles.actionBtn}
          >
            <Feather name="zoom-out" size={17} color={zoomScale === 1 ? theme.textSecondary : theme.text} />
            <Text style={[styles.actionLabel, { color: zoomScale === 1 ? theme.textSecondary : theme.text }]}>
              {Math.round(zoomScale * 100)}%
            </Text>
          </Pressable>
        </ScrollView>
        <Pressable
          disabled={!canEdit}
          onPress={() => setShowAiPanel(true)}
          style={[styles.aiActionBtn, showAiPanel && { backgroundColor: `${theme.primary}18` }]}
        >
          <Feather name="message-circle" size={17} color={showAiPanel ? theme.primary : theme.text} />
          <Text style={[styles.actionLabel, { color: showAiPanel ? theme.primary : theme.text }]}>Ask AI</Text>
        </Pressable>
      </View>

      {!canEdit ? (
        <Pressable
          onPress={() => router.push('/subscription-plans' as never)}
          style={[styles.viewOnlyBanner, { backgroundColor: `${theme.primary}12`, borderBottomColor: theme.border }]}
        >
          <Feather name="eye" size={15} color={theme.primary} />
          <Text style={[styles.viewOnlyText, { color: theme.text }]}>Free plan · PDF and notes are view only</Text>
          <Text style={[styles.viewOnlyUpgrade, { color: theme.primary }]}>Upgrade to edit</Text>
        </Pressable>
      ) : null}

      <View
        style={[styles.workspace, isPdfAnnotation && styles.pdfWorkspace]}
        onLayout={(event) => setWorkspaceSize({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })}
      >
        <GestureDetector gesture={documentGesture}>
          <Animated.View style={[styles.documentViewport, documentTransformStyle]}>
            <Animated.FlatList
              ref={documentListRef}
              data={pages}
              keyExtractor={(page) => page.id}
              style={styles.documentList}
              contentContainerStyle={styles.documentContent}
              showsVerticalScrollIndicator
              scrollEnabled={false}
              initialNumToRender={1}
              maxToRenderPerBatch={2}
              updateCellsBatchingPeriod={40}
              windowSize={3}
              removeClippedSubviews
              viewabilityConfig={viewabilityConfig}
              onViewableItemsChanged={onViewableItemsChanged}
              onScroll={documentScrollHandler}
              onContentSizeChange={(_width, height) => {
                verticalLimit.value = Math.max(0, height - workspaceSize.height);
                if (scrollOffset.value > verticalLimit.value) scrollOffset.value = verticalLimit.value;
              }}
              scrollEventThrottle={16}
              renderItem={({ item }) => (
                <ContinuousPage
                  page={item}
                  pageWidth={pageWidth}
                  aspectRatio={item.pdfPageNumber != null
                    ? (pdfPageRatios[item.pdfPageNumber] ?? HANDWRITING_PAGE_ASPECT_RATIO)
                    : HANDWRITING_PAGE_ASPECT_RATIO}
                  documentVersion={pdfPageCount}
                  tool={tool}
                  color={color}
                  strokeWidth={strokeWidth}
                  fingerDrawing={fingerDrawing}
                  editable={canEdit}
                  settings={toolSettings}
                  documentGestures={documentExternalGestures}
                  horizontalOffset={horizontalOffset}
                  primaryColor={theme.primary}
                  secondaryTextColor={theme.textSecondary}
                  loadPdfPage={loadPdfPage}
                  onChange={updatePageStrokes}
                  onCommit={commitPageGesture}
                  onToolGestureEnd={handleToolGestureEnd}
                />
              )}
            />
          </Animated.View>
        </GestureDetector>
      </View>

      {/* ── AI Chat Side Panel ── */}
      <Modal visible={showAiPanel} transparent animationType="fade" onRequestClose={() => setShowAiPanel(false)}>
        <View style={[styles.aiOverlay, { paddingTop: insets.top + 164 }]}>
          <Pressable style={styles.aiOverlayDismiss} onPress={() => setShowAiPanel(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.aiPanel, { width: AI_PANEL_WIDTH, backgroundColor: theme.card }]}
          >
            {/* Header */}
            <View style={[styles.aiPanelHeader, { borderBottomColor: theme.border }]}>
              <View style={[styles.aiPanelHeaderIcon, { backgroundColor: `${theme.primary}14` }]}>
                <Feather name="message-circle" size={18} color={theme.primary} />
              </View>
              <Text style={[styles.aiPanelTitle, { color: theme.text }]}>Ask AI</Text>
              <Pressable onPress={() => setShowAiPanel(false)} style={styles.aiPanelCloseBtn}>
                <Feather name="x" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            {/* Messages */}
            <ScrollView
              ref={aiScrollRef}
              style={styles.aiMessages}
              contentContainerStyle={styles.aiMessagesContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => aiScrollRef.current?.scrollToEnd({ animated: true })}
            >
              {aiMessages.map((msg, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.aiBubble,
                    msg.role === 'user'
                      ? [styles.aiUserBubble, { backgroundColor: theme.primary }]
                      : [styles.aiAssistantBubble, { backgroundColor: theme.background }],
                  ]}
                >
                  <Text
                    style={[
                      styles.aiBubbleText,
                      { color: msg.role === 'user' ? theme.textInverse : theme.text },
                    ]}
                  >
                    {msg.text}
                  </Text>
                </View>
              ))}
              {aiProcessing ? (
                <View style={[styles.aiBubble, styles.aiAssistantBubble, { backgroundColor: theme.background }]}>
                  <ActivityIndicator size="small" color={theme.primary} />
                </View>
              ) : null}
            </ScrollView>

            {/* Input Bar */}
            <View style={[styles.aiInputBar, { borderTopColor: theme.border, backgroundColor: theme.card, paddingBottom: Math.max(8, insets.bottom) }]}>
              <TextInput
                style={[styles.aiTextInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
                value={aiInput}
                onChangeText={setAiInput}
                placeholder="Ask about your notes…"
                placeholderTextColor={theme.textSecondary}
                multiline
                maxLength={2000}
                editable={!aiProcessing}
                onSubmitEditing={() => { void sendAiMessage(); }}
                blurOnSubmit
              />
              <Pressable
                onPress={() => { void sendAiMessage(); }}
                disabled={!aiInput.trim() || aiProcessing}
                style={[
                  styles.aiSendBtn,
                  {
                    backgroundColor: aiInput.trim() && !aiProcessing ? theme.primary : theme.border,
                  },
                ]}
              >
                <Feather name="arrow-up" size={18} color={aiInput.trim() && !aiProcessing ? theme.textInverse : theme.textSecondary} />
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={showMoreMenu} transparent animationType="fade" onRequestClose={() => setShowMoreMenu(false)}>
        <Pressable style={styles.moreMenuBackdrop} onPress={() => setShowMoreMenu(false)}>
          <View
            style={[
              styles.moreMenu,
              {
                top: insets.top + 48,
                backgroundColor: theme.card,
                borderColor: theme.border,
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <Pressable
              onPress={() => {
                setShowMoreMenu(false);
                setInsertPosition('after');
                setShowInsertPage(true);
              }}
              style={[styles.moreMenuRow, { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <View style={[styles.moreMenuIcon, { backgroundColor: `${theme.primary}14` }]}>
                <Feather name="file-plus" size={17} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.moreMenuTitle, { color: theme.text }]}>Add page</Text>
                <Text style={[styles.moreMenuHint, { color: theme.textSecondary }]}>Insert before or after this page</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={removeActivePage}
              style={[styles.moreMenuRow, { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <View style={[styles.moreMenuIcon, { backgroundColor: '#dc262614' }]}>
                <Feather name="trash-2" size={17} color="#dc2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.moreMenuTitle, { color: '#dc2626' }]}>Remove page</Text>
                <Text style={[styles.moreMenuHint, { color: theme.textSecondary }]}>Delete this page and its writing</Text>
              </View>
            </Pressable>
            <View style={[styles.moreMenuRow, { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}> 
              <View style={[styles.moreMenuIcon, { backgroundColor: `${theme.primary}14` }]}> 
                <Feather name="rotate-ccw" size={17} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.moreMenuTitle, { color: theme.text }]}>Return after erasing</Text>
                <Text style={[styles.moreMenuHint, { color: theme.textSecondary }]}>Switch back after one erase touch</Text>
              </View>
              <Switch
                value={autoReturnAfterErasing}
                onValueChange={updateAutoReturnAfterErasing}
                trackColor={{ false: theme.border, true: `${theme.primary}99` }}
                thumbColor={autoReturnAfterErasing ? theme.primary : theme.card}
              />
            </View>
            <Pressable
              disabled={exporting}
              onPress={() => {
                setShowMoreMenu(false);
                void exportPdf();
              }}
              style={styles.moreMenuRow}
            >
              <View style={[styles.moreMenuIcon, { backgroundColor: `${theme.primary}14` }]}>
                {exporting
                  ? <ActivityIndicator size="small" color={theme.primary} />
                  : <Feather name="share" size={17} color={theme.primary} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.moreMenuTitle, { color: theme.text }]}>Export PDF</Text>
                <Text style={[styles.moreMenuHint, { color: theme.textSecondary }]}>Share a copy with your writing</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showPageThumbnails} transparent animationType="slide" onRequestClose={() => setShowPageThumbnails(false)}>
        <Pressable style={styles.toolSheetBackdrop} onPress={() => setShowPageThumbnails(false)}>
          <View style={[styles.thumbnailSheet, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.toolSheetHandle, { backgroundColor: theme.border }]} />
            <View style={styles.toolSheetHeader}>
              <View style={[styles.toolSheetIcon, { backgroundColor: `${theme.primary}14` }]}>
                <Feather name="sidebar" size={20} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toolSheetTitle, { color: theme.text }]}>Pages</Text>
                <Text style={[styles.toolSheetSubtitle, { color: theme.textSecondary }]}>{pages.length} pages · tap to jump</Text>
              </View>
              <Pressable onPress={() => setShowPageThumbnails(false)} style={styles.sheetCloseBtn}>
                <Feather name="x" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
            <FlatList
              data={pages}
              keyExtractor={(page) => page.id}
              numColumns={3}
              initialNumToRender={6}
              maxToRenderPerBatch={6}
              windowSize={3}
              contentContainerStyle={styles.thumbnailGrid}
              renderItem={({ item, index }) => (
                <Pressable
                  onPress={() => {
                    setActiveIndex(index);
                    setShowPageThumbnails(false);
                    setTimeout(() => documentListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 }), 30);
                  }}
                  style={[
                    styles.thumbnailItem,
                    { borderColor: index === activeIndex ? theme.primary : theme.border },
                    index === activeIndex && { backgroundColor: `${theme.primary}12` },
                  ]}
                >
                  <View style={styles.thumbnailPreview}>
                    <PageThumbnailPreview page={item} loadPdfPage={loadPdfPage} />
                    {item.pdfPageNumber != null ? (
                      <View style={styles.thumbnailPdfBadge}>
                        <Text style={styles.thumbnailPdfText}>PDF {item.pdfPageNumber}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.thumbnailLabel, { color: index === activeIndex ? theme.primary : theme.text }]}>Page {index + 1}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showInsertPage} transparent animationType="fade" onRequestClose={() => setShowInsertPage(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowInsertPage(false)}>
          <View style={[styles.templateModal, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add a blank page</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 12 }}>
              Insert it around {activePage.pdfPageNumber != null ? `PDF page ${activePage.pdfPageNumber}` : 'the current page'}.
            </Text>
            <View style={[styles.positionPicker, { backgroundColor: theme.background }]}>
              {(['before', 'after'] as const).map((position) => (
                <Pressable
                  key={position}
                  onPress={() => setInsertPosition(position)}
                  style={[
                    styles.positionBtn,
                    insertPosition === position && { backgroundColor: theme.primary },
                  ]}
                >
                  <Feather
                    name={position === 'before' ? 'arrow-up' : 'arrow-down'}
                    size={15}
                    color={insertPosition === position ? theme.textInverse : theme.text}
                  />
                  <Text style={{
                    color: insertPosition === position ? theme.textInverse : theme.text,
                    fontSize: 12,
                    fontWeight: '800',
                    textTransform: 'capitalize',
                  }}>
                    {position}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>PAGE STYLE</Text>
            {TEMPLATES.map((template) => (
              <Pressable
                key={template.id}
                onPress={() => insertBlankPage(template.id, template.pro)}
                style={[styles.templateRow, { borderBottomColor: theme.border }]}
              >
                <Feather name={template.id === 'dots' ? 'more-horizontal' : template.id === 'blank' ? 'square' : 'grid'} size={18} color={theme.primary} />
                <Text style={{ color: theme.text, fontWeight: '700', flex: 1 }}>{template.label}</Text>
                {template.pro && !pro ? <Text style={[styles.proBadge, { color: theme.primary }]}>PRO</Text> : null}
                <Feather name="plus" size={17} color={theme.textSecondary} />
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showToolOptions} transparent animationType="slide" onRequestClose={() => setShowToolOptions(false)}>
        <Pressable style={styles.toolSheetBackdrop} onPress={() => setShowToolOptions(false)}>
          <View style={[styles.toolSheet, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.toolSheetHandle, { backgroundColor: theme.border }]} />
            <View style={styles.toolSheetHeader}>
              <View style={[styles.toolSheetIcon, { backgroundColor: `${theme.primary}14` }]}>
                <Feather
                  name={tool === 'pen' ? 'edit-3' : tool === 'pencil' ? 'edit-2' : tool === 'highlighter' ? 'minus' : 'delete'}
                  size={20}
                  color={theme.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toolSheetTitle, { color: theme.text }]}>
                  {tool === 'highlighter' ? 'Marker' : `${tool.charAt(0).toUpperCase()}${tool.slice(1)}`} options
                </Text>
                <Text style={[styles.toolSheetSubtitle, { color: theme.textSecondary }]}>
                  Changes apply to new strokes.
                </Text>
              </View>
              <Pressable onPress={() => setShowToolOptions(false)} style={styles.sheetCloseBtn}>
                <Feather name="x" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.toolSheetContent}>
              {tool === 'eraser' ? (
                <ToolOptionRow
                  label="Eraser size"
                  options={[
                    { label: 'Small', value: 0.012, symbol: '○' },
                    { label: 'Medium', value: 0.025, symbol: '◯' },
                    { label: 'Large', value: 0.045, symbol: '◯' },
                  ]}
                  value={toolSettings.eraserSize}
                  onChange={(eraserSize) => setToolSettings((current) => ({ ...current, eraserSize }))}
                  primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                />
              ) : (
                <ToolOptionRow
                  label="Stroke size"
                  options={[
                    { label: 'Thin', value: 2, lineWidth: 2 },
                    { label: 'Medium', value: 4, lineWidth: 4 },
                    { label: 'Thick', value: 7, lineWidth: 7 },
                  ]}
                  value={strokeWidth}
                  onChange={setStrokeWidth}
                  primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                />
              )}

              {(tool === 'pen' || tool === 'pencil') ? (
                <>
                  <ToolOptionRow
                    label="Handwriting helper"
                    hint="Keeps your own handwriting, with different levels of stabilization."
                    options={[
                      { label: 'Natural', value: 'natural', symbol: '✍' },
                      { label: 'Neat', value: 'neat', symbol: '∿' },
                      { label: 'Precise', value: 'precise', symbol: '〜' },
                    ]}
                    value={toolSettings.writingStyle}
                    onChange={(writingStyle) => setToolSettings((current) => ({
                      ...current,
                      writingStyle,
                      smoothing: writingStyle === 'natural' ? 0.3 : writingStyle === 'neat' ? 0.56 : 0.72,
                      stabilization: writingStyle === 'natural' ? 0.2 : writingStyle === 'neat' ? 0.48 : 0.68,
                    }))}
                    primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                  />
                  <ToolOptionRow
                    label="Writing guide"
                    hint="A temporary guide only; it is not included when exporting."
                    options={[
                      { label: 'Off', value: 'off', symbol: '□' },
                      { label: 'Baseline', value: 'baseline', symbol: '≡' },
                      { label: 'Slant', value: 'slant', symbol: '╱' },
                    ]}
                    value={toolSettings.writingGuide}
                    onChange={(writingGuide) => setToolSettings((current) => ({ ...current, writingGuide }))}
                    primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                  />
                  <View style={[styles.settingSwitchRow, { borderBottomColor: theme.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionLabel, { color: theme.text }]}>Straight-line assist</Text>
                      <Text style={[styles.optionHint, { color: theme.textSecondary }]}>Hold a nearly straight stroke briefly to snap it cleanly.</Text>
                    </View>
                    <Switch
                      value={toolSettings.shapeAssist}
                      onValueChange={(shapeAssist) => setToolSettings((current) => ({ ...current, shapeAssist }))}
                      trackColor={{ false: theme.border, true: `${theme.primary}99` }}
                      thumbColor={toolSettings.shapeAssist ? theme.primary : theme.card}
                    />
                  </View>
                </>
              ) : null}

              {tool === 'pen' ? (
                <>
                  <ToolOptionRow
                    label="Pen style"
                    hint="Ball is consistent; Fountain and Brush react to stylus pressure."
                    options={[
                      { label: 'Fountain', value: 'fountain', icon: 'feather' },
                      { label: 'Ball', value: 'ball', icon: 'edit-3' },
                      { label: 'Brush', value: 'brush', icon: 'edit-2' },
                    ]}
                    value={toolSettings.penStyle}
                    onChange={(penStyle) => setToolSettings((current) => ({ ...current, penStyle }))}
                    primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                  />
                  <ToolOptionRow
                    label="Curve smoothing"
                    hint="Fast gives the lowest latency; Smooth softens hand jitter."
                    options={[
                      { label: 'Fast', value: 0.15, symbol: '⌁' },
                      { label: 'Balanced', value: 0.45, symbol: '∿' },
                      { label: 'Smooth', value: 0.75, symbol: '〜' },
                    ]}
                    value={toolSettings.smoothing}
                    onChange={(smoothing) => setToolSettings((current) => ({ ...current, smoothing }))}
                    primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                  />
                  <ToolOptionRow
                    label="Stroke stabilizer"
                    hint="Steadies small hand movements while keeping your natural letter shape."
                    options={[
                      { label: 'Off', value: 0, symbol: '⌁' },
                      { label: 'Gentle', value: 0.35, symbol: '∿' },
                      { label: 'Strong', value: 0.72, symbol: '〜' },
                    ]}
                    value={toolSettings.stabilization}
                    onChange={(stabilization) => setToolSettings((current) => ({ ...current, stabilization }))}
                    primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                  />
                  {toolSettings.penStyle !== 'ball' ? (
                    <ToolOptionRow
                      label="Pressure sensitivity"
                      options={[
                        { label: 'Low', value: 0.2, symbol: '•—•' },
                        { label: 'Natural', value: 0.5, symbol: '•—●' },
                        { label: 'High', value: 0.9, symbol: '·━●' },
                      ]}
                      value={toolSettings.pressureSensitivity}
                      onChange={(pressureSensitivity) => setToolSettings((current) => ({ ...current, pressureSensitivity }))}
                      primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                    />
                  ) : null}
                  {toolSettings.penStyle === 'fountain' ? (
                    <ToolOptionRow
                      label="Tip sharpness"
                      options={[
                        { label: 'Round', value: 0, symbol: '●' },
                        { label: 'Medium', value: 0.5, symbol: '◐' },
                        { label: 'Sharp', value: 1, symbol: '◆' },
                      ]}
                      value={toolSettings.tipSharpness}
                      onChange={(tipSharpness) => setToolSettings((current) => ({ ...current, tipSharpness }))}
                      primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                    />
                  ) : null}
                  <ToolOptionRow
                    label="Stroke endpoints"
                    options={[
                      { label: 'Round', value: 'round', symbol: '●━━●' },
                      { label: 'Tapered', value: 'tapered', symbol: '◀━━▶' },
                    ]}
                    value={toolSettings.taperedEnds ? 'tapered' : 'round'}
                    onChange={(value) => setToolSettings((current) => ({ ...current, taperedEnds: value === 'tapered' }))}
                    primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                  />
                </>
              ) : null}

              {tool === 'pencil' ? (
                <>
                  <ToolOptionRow
                    label="Pencil texture"
                    options={[
                      { label: 'Hard', value: 0.2, symbol: '2H' },
                      { label: 'HB', value: 0.5, symbol: 'HB' },
                      { label: 'Soft', value: 0.9, symbol: '4B' },
                    ]}
                    value={toolSettings.pencilSoftness}
                    onChange={(pencilSoftness) => setToolSettings((current) => ({ ...current, pencilSoftness }))}
                    primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                  />
                  <ToolOptionRow
                    label="Curve smoothing"
                    hint="Fast gives the lowest latency."
                    options={[
                      { label: 'Fast', value: 0.15, symbol: '⌁' },
                      { label: 'Balanced', value: 0.45, symbol: '∿' },
                      { label: 'Smooth', value: 0.75, symbol: '〜' },
                    ]}
                    value={toolSettings.smoothing}
                    onChange={(smoothing) => setToolSettings((current) => ({ ...current, smoothing }))}
                    primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                  />
                  <ToolOptionRow
                    label="Stroke stabilizer"
                    hint="Reduces wobble without removing the pencil texture."
                    options={[
                      { label: 'Off', value: 0, symbol: '⌁' },
                      { label: 'Gentle', value: 0.35, symbol: '∿' },
                      { label: 'Strong', value: 0.72, symbol: '〜' },
                    ]}
                    value={toolSettings.stabilization}
                    onChange={(stabilization) => setToolSettings((current) => ({ ...current, stabilization }))}
                    primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                  />
                  <ToolOptionRow
                    label="Graphite opacity"
                    options={[
                      { label: 'Light', value: 0.45, symbol: '○' },
                      { label: 'Natural', value: 0.72, symbol: '◐' },
                      { label: 'Dark', value: 0.95, symbol: '●' },
                    ]}
                    value={toolSettings.pencilOpacity}
                    onChange={(pencilOpacity) => setToolSettings((current) => ({ ...current, pencilOpacity }))}
                    primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                  />
                </>
              ) : null}

              {tool === 'highlighter' ? (
                <>
                  <ToolOptionRow
                    label="Marker opacity"
                    options={[
                      { label: 'Light', value: 0.18, symbol: '▱' },
                      { label: 'Normal', value: 0.28, symbol: '▰' },
                      { label: 'Strong', value: 0.45, symbol: '■' },
                    ]}
                    value={toolSettings.markerOpacity}
                    onChange={(markerOpacity) => setToolSettings((current) => ({ ...current, markerOpacity }))}
                    primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                  />
                  <ToolOptionRow
                    label="Line behavior"
                    options={[
                      { label: 'Freehand', value: 'freehand', symbol: '∿' },
                      { label: 'Straight', value: 'straight', symbol: '━━' },
                    ]}
                    value={toolSettings.straightMarker ? 'straight' : 'freehand'}
                    onChange={(value) => setToolSettings((current) => ({ ...current, straightMarker: value === 'straight' }))}
                    primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                  />
                </>
              ) : null}

              {tool === 'eraser' ? (
                <>
                  <ToolOptionRow
                    label="Eraser behavior"
                    hint="Precision removes only touched parts; Stroke removes the whole line."
                    options={[
                      { label: 'Precision', value: 'precision', icon: 'crosshair' },
                      { label: 'Segment', value: 'segment', icon: 'scissors' },
                      { label: 'Stroke', value: 'stroke', icon: 'trash-2' },
                    ]}
                    value={toolSettings.eraserStyle}
                    onChange={(eraserStyle) => setToolSettings((current) => ({ ...current, eraserStyle }))}
                    primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                  />
                  <ToolOptionRow
                    label="Erase content"
                    options={[
                      { label: 'All ink', value: 'all', icon: 'layers' },
                      { label: 'Marker only', value: 'marker', icon: 'minus' },
                    ]}
                    value={toolSettings.eraseHighlighterOnly ? 'marker' : 'all'}
                    onChange={(value) => setToolSettings((current) => ({ ...current, eraseHighlighterOnly: value === 'marker' }))}
                    primary={theme.primary} text={theme.text} secondary={theme.textSecondary} border={theme.border}
                  />
                  <Pressable
                    onPress={() => Alert.alert('Clear this page?', 'All handwriting on the visible page will be removed.', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Clear',
                        style: 'destructive',
                        onPress: () => {
                          commitPageGesture(activePage.id, activePage.strokes);
                          updatePageStrokes(activePage.id, []);
                          setShowToolOptions(false);
                        },
                      },
                    ])}
                    style={[styles.clearPageBtn, { borderColor: '#dc262655' }]}
                  >
                    <Feather name="trash-2" size={16} color="#dc2626" />
                    <Text style={{ color: '#dc2626', fontSize: 13, fontWeight: '800' }}>Clear visible page</Text>
                  </Pressable>
                </>
              ) : null}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showColors} transparent animationType="fade" onRequestClose={() => setShowColors(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.colorModal, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Custom ink colour</Text>
            <Text style={[styles.colorSaveHint, { color: theme.textSecondary }]}>
              Save up to two colours for {activeInkColorTool === 'highlighter' ? 'Marker' : activeInkColorTool === 'pen' ? 'Pen' : 'Pencil'}. They replace the two rightmost swatches.
            </Text>
            <View style={{ height: 280 }}>
              <ColorPicker
                color={customColor}
                onColorChange={setCustomColor}
                thumbSize={28}
                sliderSize={28}
                noSnap
                row={false}
              />
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowColors(false)} style={styles.modalBtn}>
                <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={useCustomColor} style={styles.modalBtn}>
                <Text style={{ color: theme.primary, fontWeight: '800' }}>Use once</Text>
              </Pressable>
              <Pressable onPress={saveCustomColor} style={[styles.modalBtn, { backgroundColor: theme.primary }]}>
                <Text style={{ color: theme.textInverse, fontWeight: '800' }}>Save colour</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showTemplates} transparent animationType="fade" onRequestClose={() => setShowTemplates(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowTemplates(false)}>
          <View style={[styles.templateModal, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Paper template</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 12 }}>Applies to this page only.</Text>
            {TEMPLATES.map((template) => (
              <Pressable
                key={template.id}
                onPress={() => applyTemplate(template.id, template.pro)}
                style={[styles.templateRow, { borderBottomColor: theme.border }]}
              >
                <Feather name={template.id === 'dots' ? 'more-horizontal' : template.id === 'blank' ? 'square' : 'grid'} size={18} color={theme.primary} />
                <Text style={{ color: theme.text, fontWeight: '700', flex: 1 }}>{template.label}</Text>
                {template.pro && !pro ? <Text style={[styles.proBadge, { color: theme.primary }]}>PRO</Text> : null}
                {activePage.template === template.id ? <Feather name="check" size={18} color={theme.primary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  locked: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 16 },
  lockIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  lockTitle: { fontSize: 26, fontWeight: '900' },
  lockBody: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  upgradeBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  header: { height: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, backgroundColor: '#213b70' },
  headerBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  titleInput: { flex: 1, fontSize: 17, fontWeight: '800', paddingHorizontal: 4, color: '#ffffff' },
  savePill: { height: 25, paddingHorizontal: 8, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 4 },
  savePillPending: { backgroundColor: '#d97706' },
  savePillLocal: { backgroundColor: '#64748b' },
  savePillSaved: { backgroundColor: '#059669' },
  saveText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  actionBarScroll: { flexGrow: 0, height: 46, borderBottomWidth: StyleSheet.hairlineWidth },
  actionBarRow: { flexDirection: 'row', height: 46, borderBottomWidth: StyleSheet.hairlineWidth },
  actionBarScrollInner: { flex: 1, height: 46 },
  actionBar: { height: 46, alignItems: 'center', paddingHorizontal: 8, gap: 3 },
  actionBtn: { height: 38, minWidth: 52, paddingHorizontal: 7, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 1 },
  aiActionBtn: {
    height: 46,
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(128,128,128,0.2)',
  },
  actionLabel: { color: '#ffffff', fontSize: 9, fontWeight: '700' },
  fingerModeBtn: {
    height: 34,
    minWidth: 92,
    paddingHorizontal: 10,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  fingerModeLabel: { fontSize: 10, fontWeight: '800', lineHeight: 12 },
  fingerModeState: { fontSize: 8, fontWeight: '700', lineHeight: 10 },
  toolbarScroll: { flexGrow: 0, height: 64, borderBottomWidth: StyleSheet.hairlineWidth },
  toolbar: { height: 64, alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  toolBtn: { minWidth: 58, height: 52, paddingHorizontal: 7, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 3 },
  toolIconRow: { minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 2 },
  toolLabel: { color: '#f8fafc', fontSize: 10, fontWeight: '700' },
  separator: { width: 1, height: 38, marginHorizontal: 5, backgroundColor: '#555b64' },
  colorDotWrap: { width: 34, height: 34, borderRadius: 18, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  colorDot: { width: 23, height: 23, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.35)' },
  customColorBtn: { width: 52, height: 53, borderRadius: 10, gap: 3 },
  tinyLabel: { color: '#f8fafc', fontSize: 8, fontWeight: '700' },
  workspace: { flex: 1, position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#d9dde4' },
  viewOnlyBanner: { minHeight: 36, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewOnlyText: { flex: 1, fontSize: 11, fontWeight: '700' },
  viewOnlyUpgrade: { fontSize: 11, fontWeight: '900' },
  pdfWorkspace: { padding: 0, backgroundColor: '#17191d' },
  documentViewport: { flex: 1, width: '100%' },
  documentList: { flex: 1, width: '100%' },
  documentContent: { alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 28 },
  continuousPageWrap: { alignItems: 'center', marginBottom: 12 },
  continuousPaper: {
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderRadius: 3,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pdfPageLoading: { zIndex: 2, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#f8fafc' },
  moreMenuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' },
  moreMenu: {
    position: 'absolute',
    right: 10,
    width: 260,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  moreMenuRow: {
    minHeight: 66,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  moreMenuIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  moreMenuTitle: { fontSize: 13, fontWeight: '800' },
  moreMenuHint: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  toolSheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' },
  toolSheet: { maxHeight: '78%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', paddingBottom: 10 },
  thumbnailSheet: { height: '68%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', paddingBottom: 10 },
  thumbnailGrid: { paddingHorizontal: 12, paddingBottom: 28, gap: 10 },
  thumbnailItem: { width: '31.5%', alignItems: 'center', borderRadius: 12, borderWidth: 1.5, padding: 6, margin: 3 },
  thumbnailPreview: { width: 92, height: 118, overflow: 'hidden', borderRadius: 3, backgroundColor: '#fff' },
  thumbnailLabel: { fontSize: 10, fontWeight: '800', marginTop: 6 },
  thumbnailPdfBadge: { position: 'absolute', left: 3, bottom: 3, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 2, backgroundColor: 'rgba(15,23,42,0.76)' },
  thumbnailPdfText: { color: '#fff', fontSize: 7, fontWeight: '800' },
  toolSheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 4 },
  toolSheetHeader: { minHeight: 62, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 11 },
  toolSheetIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toolSheetTitle: { fontSize: 17, fontWeight: '900' },
  toolSheetSubtitle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  sheetCloseBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  toolSheetContent: { paddingHorizontal: 16, paddingBottom: 24 },
  optionSection: { paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  settingSwitchRow: { minHeight: 66, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionLabel: { fontSize: 13, fontWeight: '900', marginBottom: 3 },
  optionHint: { fontSize: 11, lineHeight: 16, marginBottom: 9 },
  optionChoices: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 7,
    marginTop: 5,
  },
  optionChip: {
    width: '31.5%',
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  optionLineSample: { width: 34 },
  optionSymbol: { minHeight: 18, fontSize: 16, lineHeight: 18, fontWeight: '800' },
  clearPageBtn: { marginTop: 16, height: 44, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  colorModal: { width: '100%', maxWidth: 430, borderRadius: 22, padding: 20 },
  colorSaveHint: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  templateModal: { width: '100%', maxWidth: 430, borderRadius: 22, padding: 20 },
  modalTitle: { fontSize: 19, fontWeight: '900', marginBottom: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  modalBtn: { paddingHorizontal: 17, paddingVertical: 11, borderRadius: 11 },
  positionPicker: { flexDirection: 'row', borderRadius: 12, padding: 4, gap: 4, marginBottom: 14 },
  positionBtn: { flex: 1, height: 38, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sectionLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginTop: 2, marginBottom: 4 },
  templateRow: { minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  proBadge: { fontSize: 10, fontWeight: '900' },
  // ── AI Chat Side Panel styles ──
  aiOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  aiOverlayDismiss: {
    flex: 1,
  },
  aiPanel: {
    height: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: -4, height: 0 },
    elevation: 12,
  },
  aiPanelHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  aiPanelHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiPanelTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  aiPanelCloseBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiMessages: {
    flex: 1,
  },
  aiMessagesContent: {
    padding: 12,
    gap: 10,
  },
  aiBubble: {
    maxWidth: '92%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  aiUserBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  aiAssistantBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  aiBubbleText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  aiInputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  aiTextInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 100,
    borderRadius: 19,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 14,
  },
  aiSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
