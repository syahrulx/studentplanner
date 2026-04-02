import { useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { COLORS } from '@/src/constants';
import { useTranslations } from '@/src/i18n';
import { extractTasksFromMessage as extractTasksFromMessageAI } from '@/src/lib/taskExtraction';
import { buildTaskFromExtraction } from '@/src/lib/taskUtils';
import { getTodayISO } from '@/src/utils/date';

const NAVY = '#003366';
const GOLD = '#f59e0b';
const BG = '#f8fafc';
const BORDER = '#e2e8f0';
const TEXT_PRIMARY = '#0f172a';
const TEXT_SECONDARY = '#64748b';
const GREEN = '#059669';

type Message = { role: 'ai' | 'user'; text: string };

export default function AiChat() {
  const { language, addTask, courses, user, academicCalendar } = useApp();
  const T = useTranslations(language);
  const scrollRef = useRef<ScrollView>(null);

  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: '📋 Paste your lecturer\'s WhatsApp message below and I\'ll extract the tasks for you!\n\nI can detect:\n• Assignment deadlines\n• Quiz/test dates\n• Project submissions\n• Lab reports\n\nJust copy-paste the message and tap Send.' },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  const scrollToBottom = () => {
    setTimeout(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, 100);
  };

  const handleSend = () => {
    if (!chatInput.trim()) return;
    const pastedText = chatInput;
    setMessages(prev => [...prev, { role: 'user', text: pastedText }]);
    setChatInput('');
    setIsProcessing(true);
    scrollToBottom();

    setTimeout(() => {
      (async () => {
        try {
          const todayISO = getTodayISO();
          const { tasks, error } = await extractTasksFromMessageAI({
            message: pastedText,
            courses,
            todayISO,
            currentWeek: user.currentWeek,
            userId: user.id,
          });

          if (tasks.length === 0) {
            setMessages((prev) => [
              ...prev,
              {
                role: 'ai',
                text: error
                  ? `🤔 I couldn't extract a task from this message.\n\nReason: ${error.message}`
                  : '🤔 I couldn\'t detect any assignment or deadline from this message.\n\nTry pasting a message that mentions:\n• A submission deadline\n• A quiz/test date\n• An assignment due date',
              },
            ]);
            return;
          }

          for (const task of tasks) {
            addTask(
              buildTaskFromExtraction(task, {
                fallbackCourseId: courses[0]?.id || 'General',
                user,
                calendarStart: academicCalendar?.startDate,
                sourceMessage: pastedText,
              })
            );
          }

          const taskSummary = tasks
            .map(
              (t) =>
                `• "${t.title}"\n   📅 ${t.due_date}  ⏰ ${t.due_time}${t.course_id ? `  📚 ${t.course_id}` : ''}`,
            )
            .join('\n\n');

          setMessages((prev) => [
            ...prev,
            {
              role: 'ai',
              text: `✅ Task extracted and added to your planner!\n\n${taskSummary}\n\nYou can view it in your Calendar. Paste another message to add more tasks!`,
            },
          ]);
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              role: 'ai',
              text:
                '⚠️ Something went wrong while talking to the AI. Please try again in a moment or enter the task manually.',
            },
          ]);
        } finally {
          setIsProcessing(false);
          scrollToBottom();
        }
      })();
    }, 500);
  };

  return (
    <View style={s.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} />
      <KeyboardAvoidingView 
        style={s.sheetContainer} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Pressable onPress={() => router.back()} style={s.backBtn}>
              <Feather name="arrow-down" size={24} color={COLORS.white} />
            </Pressable>
            <View style={s.headerIcon}>
              <Feather name="clipboard" size={18} color={GOLD} />
            </View>
            <View>
              <Text style={s.headerTitle}>AI Task Scanner</Text>
              <Text style={s.headerSub}>PASTE WHATSAPP MESSAGE</Text>
            </View>
          </View>
        </View>

        <ScrollView 
          ref={scrollRef}
          style={s.messagesList} 
          contentContainerStyle={s.messagesContent}
        >
          {messages.map((m, i) => (
            <View key={i} style={[s.bubbleWrap, m.role === 'user' && s.bubbleRight]}>
              <View style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAi]}>
                <Text style={[s.bubbleText, m.role === 'user' && { color: COLORS.white }]}>{m.text}</Text>
              </View>
            </View>
          ))}
          {isProcessing && (
            <View style={s.bubbleWrap}>
              <View style={[s.bubble, s.bubbleAi]}>
                <View style={s.processingRow}>
                  <Feather name="search" size={14} color={NAVY} />
                  <Text style={s.bubbleText}>Scanning message for tasks...</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={chatInput}
            onChangeText={setChatInput}
            placeholder="Paste lecturer's message here..."
            placeholderTextColor="#8E9AAF"
            multiline
            textAlignVertical="top"
          />
          <Pressable
            style={[s.sendBtn, (!chatInput.trim() || isProcessing) && { opacity: 0.5 }]}
            onPress={handleSend}
            disabled={!chatInput.trim() || isProcessing}
          >
            <Feather name="search" size={18} color={COLORS.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetContainer: { 
    height: '70%',
    backgroundColor: BG,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: NAVY,
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { marginRight: 4 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#ffffff', letterSpacing: -0.3 },
  headerSub: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5 },
  
  messagesList: { flex: 1, backgroundColor: BG },
  messagesContent: { padding: 20, paddingBottom: 40, gap: 12 },
  bubbleWrap: { alignItems: 'flex-start' },
  bubbleRight: { alignItems: 'flex-end' },
  bubble: { maxWidth: '85%', padding: 16, borderRadius: 20 },
  bubbleAi: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: BORDER, alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  bubbleUser: { backgroundColor: NAVY, alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  bubbleText: { fontSize: 15, lineHeight: 22, color: TEXT_PRIMARY, fontWeight: '500' },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  
  inputRow: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: '#ffffff',
  },
  input: {
    flex: 1,
    backgroundColor: BG,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '500',
    color: TEXT_PRIMARY,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    maxHeight: 100,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
