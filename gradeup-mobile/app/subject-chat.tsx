import { useState, useRef, useMemo, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import { useTheme } from '@/hooks/useTheme';
import { invokeAiGenerate, AiGenerateRequest } from '@/src/lib/invokeAiGenerate';
import { isAtLeastPlus } from '@/src/lib/flashcardGenerationLimits';
import { getChatSessions, getChatMessages, createChatSession, createChatMessage, updateChatSessionTimestamp, deleteChatSession } from '@/src/lib/chatDb';
import type { ChatSession, ChatMessage } from '@/src/types';

type Message = { role: 'ai' | 'user'; text: string };

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

const MAX_CONTEXT_LENGTH = 15000;

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

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  
  const loadSessions = async () => {
    const s = await getChatSessions(user.id, subjectId);
    setSessions(s);
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
    if (!isAtLeastPlus(user.subscriptionPlan)) {
      router.replace('/subscription-plans' as any);
      return;
    }
    const subjectNotes = notes.filter(n => n.subjectId === subjectId);
    let fullText = '';
    for (const note of subjectNotes) {
      if (note.title) fullText += `\n--- Note: ${note.title} ---\n`;
      if (note.content) fullText += `${note.content}\n`;
      if (note.extractedText) fullText += `${note.extractedText}\n`;
    }
    setNotesContext(fullText.slice(0, MAX_CONTEXT_LENGTH).trim());
  }, [notes, subjectId, user.subscriptionPlan]);

  const scrollToBottom = () => {
    setTimeout(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, 100);
  };

  const handleSend = async () => {
    if (!chatInput.trim()) return;
    
    // Check limits for new conversation
    if (!currentSessionId) {
      const maxSessions = user.subscriptionPlan === 'pro' ? 15 : 3;
      if (sessions.length >= maxSessions) {
        Alert.alert(
          'Limit Reached',
          `You have reached the maximum of ${maxSessions} saved conversations for this subject. Please delete an older conversation from History.`,
        );
        return;
      }
    }

    const userText = chatInput;
    const currentMessages = [...messages, { role: 'user' as const, text: userText }];
    setMessages(currentMessages);
    setChatInput('');
    setIsProcessing(true);
    scrollToBottom();

    if (!notesContext) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'ai', text: "It looks like you don't have any notes for this subject yet. Please add some notes or PDFs so I can help you study!" }]);
        setIsProcessing(false);
        scrollToBottom();
      }, 800);
      return;
    }

    setTimeout(() => {
      (async () => {
        try {
          const apiMessages = currentMessages
            .filter(m => m.text && !m.text.includes("It looks like you don't have any notes")) // avoid sending errors back
            .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })) as { role: 'user'|'assistant', content: string}[];

          const body: AiGenerateRequest = {
            kind: 'chat',
            content: notesContext,
            chat_history: apiMessages.slice(-10), // keep the last 10 messages for context
          };

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

          let aiText = "I'm sorry, I couldn't generate a response.";
          if (result.error) {
            aiText = `Oops! Something went wrong: ${result.error}`;
          } else if (result.data?.response) {
            aiText = result.data.response;
          }

          setMessages(prev => [...prev, { role: 'ai', text: aiText }]);
          
          // Save AI message
          await createChatMessage({
            sessionId: activeSessionId,
            role: 'ai',
            content: aiText,
            createdAt: new Date().toISOString()
          });
        } catch (e: any) {
          setMessages(prev => [...prev, { role: 'ai', text: '⚠️ Network error or timeout. Please try again.' }]);
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
            <Pressable onPress={() => setShowHistory(true)} style={[s.headerIcon, { backgroundColor: headerIconBg }]}>
              <Feather name="menu" size={16} color={theme.textInverse} />
              <Text style={{color: theme.textInverse, fontSize: 12, fontWeight: '700'}}>Recent</Text>
            </Pressable>
            <View>
              <Text style={[s.headerTitle, { color: theme.textInverse }]}>{subjectId} Tutor</Text>
              <Text style={[s.headerSub, { color: headerSubColor }]}>PLUS AI TUTOR</Text>
            </View>
          </View>
          <View style={s.headerRight}>
             <View style={s.plusBadge}>
                <Text style={s.plusBadgeText}>PRO</Text>
             </View>
          </View>
        </View>

        <ScrollView 
          ref={scrollRef}
          style={[s.messagesList, { backgroundColor: theme.background }]} 
          contentContainerStyle={s.messagesContent}
        >
          <Text style={[s.dateIndicator, { color: theme.textSecondary }]}>Today</Text>
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
                <Text
                  style={[
                    s.bubbleText,
                    { color: m.role === 'user' ? theme.textInverse : theme.text },
                  ]}
                >
                  {m.text}
                </Text>
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
          <TextInput
            style={[s.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
            value={chatInput}
            onChangeText={setChatInput}
            placeholder="Ask about your notes..."
            placeholderTextColor={theme.textSecondary}
            multiline
            textAlignVertical="center"
          />
          <Pressable
            style={[
              s.sendBtn,
              { backgroundColor: theme.primary },
              (!chatInput.trim() || isProcessing) && { opacity: 0.5 },
            ]}
            onPress={handleSend}
            disabled={!chatInput.trim() || isProcessing}
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
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    gap: 12,
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
});
