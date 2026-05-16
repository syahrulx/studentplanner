import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Alert, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Markdown from 'react-native-markdown-display';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import { useTheme } from '@/hooks/useTheme';
import { invokeAiGenerate, AiGenerateRequest } from '@/src/lib/invokeAiGenerate';
import { isAtLeastPlus } from '@/src/lib/flashcardGenerationLimits';
import { getChatSessions, getChatMessages, createChatSession, createChatMessage, updateChatSessionTimestamp, deleteChatSession } from '@/src/lib/chatDb';
import { supabase } from '@/src/lib/supabase';
import type { ChatSession, ChatMessage } from '@/src/types';
import { ensureImageLibraryAccessForPicker } from '@/src/lib/imageLibraryPickerGate';

type Message = { role: 'ai' | 'user'; text: string; imageUri?: string };

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

const MAX_CONTEXT_LENGTH = 200000;
const DEBUG_MODE = false; // Toggle to true to show debug info in chat

export default function SubjectChat() {
  const { subjectId: subjectIdParam } = useLocalSearchParams<{ subjectId: string | string[] }>();
  const subjectId = typeof subjectIdParam === 'string' ? subjectIdParam : Array.isArray(subjectIdParam) ? subjectIdParam[0] ?? '' : '';

  const { language, notes, user } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const scrollRef = useRef<ScrollView>(null);
  const headerSubColor = useMemo(() => onPrimaryMuted(theme.textInverse, theme.primary), [theme.textInverse, theme.primary]);
  const headerIconBg = useMemo(() => onPrimaryChipBg(theme.textInverse), [theme.textInverse]);

  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: `Hi! I'm your AI Subject Tutor for ${subjectId}.\n\nI have read all your notes and PDFs for this subject. Ask me anything to help you study, summarize topics, or test your knowledge!` },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notesContext, setNotesContext] = useState('');
  /** Ref keeps the latest context available synchronously (no React batching delay). */
  const notesContextRef = useRef('');
  const [contextReady, setContextReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{ noteCount: number; contextLen: number; extractedCount: number; titles: string[] }>({ noteCount: 0, contextLen: 0, extractedCount: 0, titles: [] });

  // Image attachment state
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [pendingImageBase64, setPendingImageBase64] = useState<string | null>(null);

  // Warm up the Edge Function on mount to eliminate cold-start delays
  useEffect(() => {
    supabase.functions.invoke('ai_generate', {
      body: { kind: '__ping' },
      // This will return an error (invalid kind) but it warms the function
    }).catch(() => {});
    console.log('[SubjectChat] Edge Function warm-up ping sent');
  }, []);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  
  const loadSessions = async () => {
    const s = await getChatSessions(user.id, subjectId);
    setSessions(s);
    if (user.subscriptionPlan !== 'pro' && s.length > 0) {
      // Auto-resume the most recent session for Plus users 
      // so they can continue their single thread without needing the History menu
      loadSession(s[0]);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [user.id, subjectId]);

  const startNewChat = () => {
    setCurrentSessionId(null);
    setMessages([
      { role: 'ai', text: `Hi! I'm your AI Subject Tutor for ${subjectId}.\n\nI have read all your notes and PDFs for this subject. Ask me anything to help you study, summarize topics, or test your knowledge!` },
    ]);
    setShowHistory(false);
  };

  const loadSession = async (s: ChatSession) => {
    setCurrentSessionId(s.id);
    const msgs = await getChatMessages(s.id);
    if (msgs.length > 0) {
      setMessages(msgs.map(m => ({ role: m.role, text: m.content })));
    } else {
      setMessages([{ role: 'ai', text: `Hi! I'm your AI Subject Tutor for ${subjectId}.\n\nI have read all your notes and PDFs for this subject. Ask me anything to help you study, summarize topics, or test your knowledge!` }]);
    }
    setShowHistory(false);
  };

  const handleDeleteSession = async (id: string) => {
    await deleteChatSession(user.id, id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      startNewChat();
    }
  };

  // Assemble notes context on mount
  useEffect(() => {
    const subjectNotes = notes.filter(n => n.subjectId === subjectId);
    // Sort by updatedAt so chronological order is generally preserved
    subjectNotes.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

    // DEBUG: log note details
    const extractedNotes = subjectNotes.filter(n => n.extractedText && n.extractedText.trim().length > 0);
    const noteTitles = subjectNotes.map(n => n.title);
    console.log(`[SubjectChat DEBUG] subjectId="${subjectId}"`);
    console.log(`[SubjectChat DEBUG] Total notes in app: ${notes.length}`);
    console.log(`[SubjectChat DEBUG] Notes matching subjectId: ${subjectNotes.length}`);
    console.log(`[SubjectChat DEBUG] Notes with extractedText: ${extractedNotes.length}`);
    subjectNotes.forEach((n, i) => {
      console.log(`[SubjectChat DEBUG]   Note[${i}]: id=${n.id}, title="${n.title}", subjectId="${n.subjectId}", contentLen=${(n.content || '').length}, extractedTextLen=${(n.extractedText || '').length}, attachmentPath=${n.attachmentPath || 'none'}`);
    });

    // Build context: include both content and extractedText
    const fullText = subjectNotes.map(n => {
      const parts = [`[Note: ${n.title}]`];
      if (n.content && n.content.trim()) parts.push(n.content);
      if (n.extractedText && n.extractedText.trim()) parts.push(`[Extracted PDF Text]\n${n.extractedText}`);
      return parts.join('\n');
    }).join('\n\n');

    console.log(`[SubjectChat DEBUG] Total context length (before truncation): ${fullText.length}`);
    
    const systemInstruction = `IMPORTANT: You are the student's AI Subject Tutor for ${subjectId}. 
Your knowledge is STRICTLY LIMITED to the notes and PDFs provided below. 
1. ONLY answer questions using the information found in the notes.
2. If the answer is NOT in the notes, do not use your general knowledge. Instead, politely say: "I'm sorry, I couldn't find information about that in your notes for this subject. I can only answer questions based on your uploaded materials."
3. Stay focused on helping the student study their specific curriculum.

STUDENT NOTES CONTENT:
`;
    const finalContext = systemInstruction + fullText.slice(0, MAX_CONTEXT_LENGTH - systemInstruction.length).trim();
    notesContextRef.current = finalContext;
    setNotesContext(finalContext);
    setContextReady(true);
    setDebugInfo({ noteCount: subjectNotes.length, contextLen: finalContext.length, extractedCount: extractedNotes.length, titles: noteTitles });
    console.log(`[SubjectChat DEBUG] Final notesContext length: ${finalContext.length}`);
  }, [notes, subjectId, user.subscriptionPlan]);

  const scrollToBottom = () => {
    setTimeout(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, 100);
  };

  // ─── Image picker ────────────────────────────────────────────────────────
  const pickImage = useCallback(async (source: 'library' | 'camera') => {
    try {
      const checkAndSetImage = async (uri: string, base64: string | null | undefined) => {
        let b64 = base64;
        if (!b64 && uri) {
          b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        }
        if (b64 && (b64.length * 0.75) > 10 * 1024 * 1024) {
          Alert.alert('File Too Large', 'Please select an image smaller than 10MB.');
          return;
        }
        setPendingImageUri(uri);
        setPendingImageBase64(b64 ?? null);
      };

      if (source === 'library') {
        const granted = await ensureImageLibraryAccessForPicker();
        if (!granted) {
          Alert.alert('Permission Needed', 'Please grant photo library access to attach images.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          base64: true,
          allowsEditing: false,
        });
        if (result.canceled || !result.assets?.[0]) return;
        await checkAndSetImage(result.assets[0].uri, result.assets[0].base64);
      } else {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Please grant camera access to take photos.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          quality: 0.7,
          base64: true,
          allowsEditing: false,
        });
        if (result.canceled || !result.assets?.[0]) return;
        await checkAndSetImage(result.assets[0].uri, result.assets[0].base64);
      }
    } catch (e: any) {
      console.error('[SubjectChat] pickImage error:', e);
    }
  }, []);

  const showImagePickerOptions = useCallback(() => {
    Alert.alert('Attach Image', 'Choose a source', [
      { text: 'Camera', onPress: () => pickImage('camera') },
      { text: 'Photo Library', onPress: () => pickImage('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [pickImage]);

  const clearPendingImage = useCallback(() => {
    setPendingImageUri(null);
    setPendingImageBase64(null);
  }, []);

  const handleSend = async () => {
    if (!chatInput.trim() && !pendingImageBase64) return;
    const hasImage = !!pendingImageBase64;
    
    // Check limits for new conversation
    if (!currentSessionId) {
      const maxSessions = user.subscriptionPlan === 'pro' ? 15 : user.subscriptionPlan === 'plus' ? 3 : 1;
      if (sessions.length >= maxSessions) {
        if (user.subscriptionPlan === 'pro') {
          Alert.alert(
            'Limit Reached',
            `You have reached the maximum of ${maxSessions} saved conversations for this subject. Please delete an older conversation from History.`,
          );
        } else {
          const planName = user.subscriptionPlan === 'plus' ? 'Plus' : 'Free';
          Alert.alert(
            'Limit Reached',
            `You've reached your limit of ${maxSessions} new conversations on the ${planName} plan. Upgrade to unlock more conversations and access your saved chat history!`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Upgrade', onPress: () => router.push('/subscription-plans' as any) }
            ]
          );
        }
        return;
      }
    }

    const userText = chatInput;
    const imageUri = pendingImageUri;
    const imageBase64 = pendingImageBase64;
    const currentMessages = [...messages, { role: 'user' as const, text: userText || '📷 Image attached', imageUri: imageUri ?? undefined }];
    setMessages(currentMessages);
    setChatInput('');
    clearPendingImage();
    setIsProcessing(true);
    scrollToBottom();

    // Use the ref (always current) instead of state (may lag behind)
    const ctx = notesContextRef.current;

    if (!ctx) {
      console.log('[SubjectChat DEBUG] notesContext is EMPTY — no notes found for this subject');
      const debugMsg = DEBUG_MODE
        ? `\n\n---\n🐛 **DEBUG:** notesContext is empty.\nsubjectId = \"${subjectId}\"\nTotal notes in app = ${notes.length}\nNotes matching this subject = ${debugInfo.noteCount}\nCheck that note.subjectId matches exactly.`
        : '';
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'ai', text: `It looks like you don't have any notes for this subject yet. Please add some notes or PDFs so I can help you study!${debugMsg}` }]);
        setIsProcessing(false);
        scrollToBottom();
      }, 800);
      return;
    }

    setTimeout(() => {
      (async () => {
        try {
          const apiMessages = currentMessages
            .filter(m => m.text && !m.text.includes("It looks like you don't have any notes") && !m.text.startsWith('🐛')) // avoid sending debug/errors back
            .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })) as { role: 'user'|'assistant', content: string}[];

          const body: AiGenerateRequest = {
            kind: 'chat',
            content: ctx, // use ref value, always current
            subject_id: subjectId,
            question: userText,
            chat_history: apiMessages.slice(-10), // keep the last 10 messages for context
            ...(imageBase64 ? { image_base64: imageBase64 } : {}),
          };

          console.log(`[SubjectChat DEBUG] Sending to ai_generate:`);
          console.log(`[SubjectChat DEBUG]   kind = chat`);
          console.log(`[SubjectChat DEBUG]   subject_id = "${subjectId}"`);
          console.log(`[SubjectChat DEBUG]   question = "${userText.slice(0, 100)}"`);
          console.log(`[SubjectChat DEBUG]   content length = ${notesContext.length}`);
          console.log(`[SubjectChat DEBUG]   chat_history count = ${apiMessages.slice(-10).length}`);

          // Inject debug message into chat
          if (DEBUG_MODE) {
            setMessages(prev => [...prev, { role: 'ai', text: `🐛 **DEBUG — Request Sent**\n- subject_id: \"${subjectId}\"\n- Notes found: ${debugInfo.noteCount}\n- With extractedText: ${debugInfo.extractedCount}\n- Context length: ${notesContext.length} chars\n- Note titles: ${debugInfo.titles.map(t => `"${t}"`).join(', ') || 'none'}\n- Question: \"${userText.slice(0, 80)}\"\n- Chat history msgs: ${apiMessages.slice(-10).length}` }]);
            scrollToBottom();
          }

          let activeSessionId = currentSessionId;
          
          if (!activeSessionId) {
            const newSess = await createChatSession(user.id, {
              subjectId,
              title: userText.slice(0, 30) + (userText.length > 30 ? '...' : ''),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            activeSessionId = newSess.id;
            setCurrentSessionId(activeSessionId);
            setSessions(prev => [newSess, ...prev]);
          } else {
            updateChatSessionTimestamp(activeSessionId);
          }

          // Save user message
          await createChatMessage({
            sessionId: activeSessionId,
            role: 'user',
            content: userText,
            createdAt: new Date().toISOString()
          });

          const result = await invokeAiGenerate<{ response: string }>(body);

          console.log(`[SubjectChat DEBUG] ai_generate result:`, JSON.stringify({ hasData: !!result.data, hasError: !!result.error, error: result.error, responsePreview: result.data?.response?.slice(0, 200) }));

          let aiText = "I'm sorry, I couldn't generate a response.";
          if (result.error) {
            aiText = `Oops! Something went wrong: ${result.error}`;
            if (DEBUG_MODE) {
              aiText += `\n\n---\n🐛 **DEBUG — Error Details**\n\`\`\`\n${result.error}\n\`\`\``;
            }
          } else if (result.data?.response) {
            aiText = result.data.response;
            if (DEBUG_MODE) {
              aiText += `\n\n---\n🐛 _Response received (${result.data.response.length} chars)_`;
            }
          } else {
            if (DEBUG_MODE) {
              aiText += `\n\n---\n🐛 **DEBUG:** result.data is null/empty, no error returned either.\nRaw: ${JSON.stringify(result).slice(0, 300)}`;
            }
          }

          setMessages(prev => [...prev, { role: 'ai', text: aiText }]);
          
          // Save AI message (without debug lines)
          const cleanAiText = result.data?.response || aiText.split('\n---\n')[0];
          await createChatMessage({
            sessionId: activeSessionId,
            role: 'ai',
            content: cleanAiText,
            createdAt: new Date().toISOString()
          });
        } catch (e: any) {
          console.error('[SubjectChat DEBUG] handleSend caught error:', e);
          const errorDetail = DEBUG_MODE ? `\n\n---\n🐛 **DEBUG — Exception**\n\`\`\`\n${e?.message || String(e)}\n${e?.stack?.slice(0, 300) || ''}\n\`\`\`` : '';
          setMessages(prev => [...prev, { role: 'ai', text: `Network error or timeout. Please try again.${errorDetail}` }]);
        } finally {
          setIsProcessing(false);
          scrollToBottom();
        }
      })();
    }, 100);
  };

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
                  'Pro Feature',
                  'Saved chat history is exclusively available on the Pro plan. Upgrade to Pro to view and manage your past conversations!',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Upgrade to Pro', onPress: () => router.push('/subscription-plans' as any) }
                  ]
                );
              } else {
                setShowHistory(true);
              }
            }} style={[s.headerIcon, { backgroundColor: headerIconBg }]}>
              <Feather name={user.subscriptionPlan === 'pro' ? "menu" : "lock"} size={16} color={theme.textInverse} />
              <Text style={{color: theme.textInverse, fontSize: 12, fontWeight: '700'}}>Recent</Text>
            </Pressable>
            <View>
              <Text style={[s.headerTitle, { color: theme.textInverse }]}>{subjectId} Tutor</Text>
              <Text style={[s.headerSub, { color: headerSubColor }]}>{user.subscriptionPlan === 'pro' ? 'PRO AI TUTOR' : user.subscriptionPlan === 'plus' ? 'PLUS AI TUTOR' : 'FREE AI TUTOR'}</Text>
            </View>
          </View>
          <View style={s.headerRight}>
             <View style={s.plusBadge}>
                <Text style={s.plusBadgeText}>{user.subscriptionPlan === 'pro' ? 'PRO' : user.subscriptionPlan === 'plus' ? 'PLUS' : 'FREE'}</Text>
             </View>
          </View>
        </View>

        <ScrollView 
          ref={scrollRef}
          style={[s.messagesList, { backgroundColor: theme.background }]} 
          contentContainerStyle={s.messagesContent}
        >
          <Text style={[s.dateIndicator, { color: theme.textSecondary }]}>Today</Text>
          {DEBUG_MODE && (
            <View style={{ backgroundColor: hexToRgba(theme.primary, 0.08), borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: hexToRgba(theme.primary, 0.2) }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: theme.primary, letterSpacing: 0.5, marginBottom: 4 }}>🐛 DEBUG PANEL</Text>
              <Text style={{ fontSize: 12, color: theme.text, lineHeight: 18 }}>
                subjectId: "{subjectId}"{"\n"}
                Notes found: {debugInfo.noteCount}{"\n"}
                With extractedText: {debugInfo.extractedCount}{"\n"}
                Context length: {debugInfo.contextLen} chars{"\n"}
                Titles: {debugInfo.titles.length > 0 ? debugInfo.titles.join(', ') : '(none)'}
              </Text>
            </View>
          )}
          {messages.map((m, i) => (
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
                      body: [s.bubbleText, { color: theme.text }],
                      paragraph: { marginTop: 0, marginBottom: 8 },
                      code_inline: { backgroundColor: theme.border, paddingHorizontal: 4, borderRadius: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
                      code_block: { backgroundColor: theme.border, padding: 8, borderRadius: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
                      link: { color: theme.primary },
                      list_item: { marginBottom: 4 },
                    }}
                  >
                    {m.text}
                  </Markdown>
                ) : (
                  m.text && m.text !== '📷 Image attached' ? (
                    <Text style={[s.bubbleText, { color: theme.textInverse, marginTop: m.imageUri ? 8 : 0 }]}>
                      {m.text}
                    </Text>
                  ) : null
                )}
              </View>
            </View>
          ))}
          {isProcessing && (
            <View style={s.bubbleWrap}>
              <View style={[s.bubble, s.bubbleAi, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={s.processingRow}>
                  <ActivityIndicator size="small" color={theme.primary} />
                  <Text style={[s.bubbleText, { color: theme.textSecondary }]}>Thinking...</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[s.inputRow, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
          {/* Image preview */}
          {pendingImageUri ? (
            <View style={s.imagePreviewWrap}>
              <Image source={{ uri: pendingImageUri }} style={s.imagePreviewThumb} resizeMode="cover" />
              <Pressable onPress={clearPendingImage} style={[s.imagePreviewRemove, { backgroundColor: theme.text }]}>
                <Feather name="x" size={12} color={theme.background} />
              </Pressable>
            </View>
          ) : null}
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
            placeholder={pendingImageUri ? 'Ask about this image...' : 'Ask about your notes...'}
            placeholderTextColor={theme.textSecondary}
            multiline
            textAlignVertical="center"
          />
          <Pressable
            style={[
              s.sendBtn,
              { backgroundColor: theme.primary },
              ((!chatInput.trim() && !pendingImageBase64) || isProcessing) && { opacity: 0.5 },
            ]}
            onPress={handleSend}
            disabled={(!chatInput.trim() && !pendingImageBase64) || isProcessing}
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
              <Text style={[s.modalTitle, { color: theme.text }]}>Chat History</Text>
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
                <Text style={[s.historyItemTitle, { color: theme.primary }]}>New Conversation</Text>
              </Pressable>

              {sessions.map(sItem => (
                <Pressable 
                  key={sItem.id}
                  style={[s.historyItem, currentSessionId === sItem.id && s.historyItemActive, { borderColor: theme.border }]} 
                  onPress={() => loadSession(sItem)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.historyItemTitle, { color: theme.text }]} numberOfLines={1}>{sItem.title}</Text>
                    <Text style={[s.historyItemDate, { color: theme.textSecondary }]}>{new Date(sItem.updatedAt).toLocaleDateString()}</Text>
                  </View>
                  <Pressable 
                    style={s.deleteBtn} 
                    onPress={() => Alert.alert('Delete', 'Delete this conversation?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => handleDeleteSession(sItem.id) }
                    ])}
                  >
                    <Feather name="trash-2" size={16} color="#ef4444" />
                  </Pressable>
                </Pressable>
              ))}
              {sessions.length === 0 && (
                <Text style={[s.historyEmpty, { color: theme.textSecondary }]}>No past conversations for this subject.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  
  inputRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    gap: 10,
    borderTopWidth: 1,
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
  bubbleImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 4,
  },
  imagePreviewWrap: {
    position: 'relative',
  },
  imagePreviewThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  imagePreviewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
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
