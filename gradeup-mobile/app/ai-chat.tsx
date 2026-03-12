import { useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { COLORS } from '@/src/constants';
import { Priority, TaskType } from '@/src/types';
import { useTranslations } from '@/src/i18n';

const NAVY = '#003366';
const GOLD = '#f59e0b';
const BG = '#f8fafc';
const BORDER = '#e2e8f0';
const TEXT_PRIMARY = '#0f172a';
const TEXT_SECONDARY = '#64748b';
const GREEN = '#059669';

type Message = { role: 'ai' | 'user'; text: string };

// Simple task extraction from pasted WhatsApp messages
function extractTasksFromMessage(text: string): { title: string; dueDate: string; dueTime: string; courseId: string }[] {
  const tasks: { title: string; dueDate: string; dueTime: string; courseId: string }[] = [];
  const lines = text.split('\n').filter(l => l.trim());

  // Try to detect assignment keywords
  const keywords = ['submit', 'hantar', 'due', 'deadline', 'assignment', 'quiz', 'test', 'project', 'lab', 'report', 'presentation', 'tutorial', 'homework'];
  const hasTask = keywords.some(k => text.toLowerCase().includes(k));

  if (!hasTask) return tasks;

  // Try to extract date patterns
  let dueDate = '';
  let dueTime = '23:59';

  // Match common date formats
  const datePatterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,            // dd/mm/yyyy or dd-mm-yyyy
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,            // yyyy/mm/dd
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{4})/i, // 15 March 2026
  ];

  for (const p of datePatterns) {
    const m = text.match(p);
    if (m) {
      if (m[1].length === 4) {
        dueDate = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
      } else if (m[2].length > 2) {
        // Day Month Year format
        const months: Record<string, string> = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
        const mon = months[m[2].toLowerCase().slice(0,3)] || '01';
        dueDate = `${m[3]}-${mon}-${String(m[1]).padStart(2, '0')}`;
      } else {
        dueDate = `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
      }
      break;
    }
  }

  // Match day names as relative dates
  if (!dueDate) {
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday',
                      'ahad','isnin','selasa','rabu','khamis','jumaat','sabtu'];
    const dayMap: Record<string, number> = {};
    dayNames.forEach((name, i) => { dayMap[name] = i % 7; });
    
    for (const [name, dayNum] of Object.entries(dayMap)) {
      if (text.toLowerCase().includes(name)) {
        const today = new Date();
        const todayDay = today.getDay();
        let diff = dayNum - todayDay;
        if (diff <= 0) diff += 7;
        const target = new Date(today);
        target.setDate(target.getDate() + diff);
        dueDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
        break;
      }
    }
  }

  // Fallback: 7 days from now
  if (!dueDate) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    dueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Try to extract time
  const timeMatch = text.match(/(\d{1,2})[:\.](\d{2})\s*(AM|PM|am|pm)?/);
  if (timeMatch) {
    let h = parseInt(timeMatch[1]);
    const mins = timeMatch[2];
    const ampm = timeMatch[3];
    if (ampm && ampm.toLowerCase() === 'pm' && h < 12) h += 12;
    if (ampm && ampm.toLowerCase() === 'am' && h === 12) h = 0;
    dueTime = `${String(h).padStart(2, '0')}:${mins}`;
  }

  // Try to detect course code (e.g., CSC248, BIO123)
  let courseId = '';
  const courseMatch = text.match(/\b([A-Z]{2,4}\s?\d{3,4})\b/);
  if (courseMatch) courseId = courseMatch[1].replace(/\s/g, '');

  // Build task title from the message
  let title = '';
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (keywords.some(k => lower.includes(k))) {
      title = line.trim().slice(0, 80);
      break;
    }
  }
  if (!title) title = lines[0]?.trim().slice(0, 80) || 'Task from WhatsApp';

  tasks.push({ title, dueDate, dueTime, courseId });
  return tasks;
}

export default function AiChat() {
  const { language, addTask, courses } = useApp();
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
      const extracted = extractTasksFromMessage(pastedText);

      if (extracted.length === 0) {
        setMessages(prev => [...prev, {
          role: 'ai',
          text: '🤔 I couldn\'t detect any assignment or deadline from this message.\n\nTry pasting a message that mentions:\n• A submission deadline\n• A quiz/test date\n• An assignment due date'
        }]);
        setIsProcessing(false);
        scrollToBottom();
        return;
      }

      for (const task of extracted) {
        const fallbackCourse = courses[0]?.id || 'General';
        addTask({
          id: `t${Date.now()}`,
          title: task.title,
          courseId: task.courseId || fallbackCourse,
          type: TaskType.Assignment,
          dueDate: task.dueDate,
          dueTime: task.dueTime,
          priority: Priority.Medium,
          effort: 4,
          notes: '',
          isDone: false,
          deadlineRisk: 'Medium',
          suggestedWeek: 1,
          sourceMessage: pastedText,
        });
      }

      const taskSummary = extracted.map(t => 
        `• "${t.title}"\n   📅 ${t.dueDate}  ⏰ ${t.dueTime}${t.courseId ? `  📚 ${t.courseId}` : ''}`
      ).join('\n\n');

      setMessages(prev => [...prev, {
        role: 'ai',
        text: `✅ Task extracted and added to your planner!\n\n${taskSummary}\n\nYou can view it in your Calendar. Paste another message to add more tasks!`
      }]);
      setIsProcessing(false);
      scrollToBottom();
    }, 1500);
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
