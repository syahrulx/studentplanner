import { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/Avatar';
import * as servicesApi from '@/src/lib/servicesApi';
import type { ServicePost, ServiceMessage } from '@/src/lib/servicesApi';

export default function ServiceChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [service, setService] = useState<ServicePost | null>(null);
  const [messages, setMessages] = useState<ServiceMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [svc, msgs] = await Promise.all([
        servicesApi.fetchService(id),
        servicesApi.fetchServiceMessages(id)
      ]);
      setService(svc);
      setMessages(msgs);
    } catch (e) {
      console.error('[ServiceChat] error:', e);
    }
  }, [id]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
    
    // Simple polling for new messages every 3 seconds
    const interval = setInterval(() => {
      servicesApi.fetchServiceMessages(id as string).then(msgs => {
        setMessages(prev => {
          // Only update if there's a difference in length to avoid constant re-renders
          if (msgs.length !== prev.length) {
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
            return msgs;
          }
          return prev;
        });
      });
    }, 3000);
    
    return () => clearInterval(interval);
  }, [id, loadData]);

  const handleSend = async () => {
    if (!chatInput.trim() || sending) return;
    
    const text = chatInput.trim();
    setChatInput('');
    setSending(true);
    
    try {
      const newMsg = await servicesApi.sendServiceMessage(id as string, text);
      if (newMsg) {
        setMessages(prev => [...prev, newMsg]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (e: any) {
      Alert.alert('Could not send message', e.message || 'Network error');
      setChatInput(text); // restore input
    } finally {
      setSending(false);
    }
  };

  if (loading || !service) {
    return (
      <View style={[s.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.textSecondary} />
      </View>
    );
  }

  const role = servicesApi.getViewerRole(service, user?.id);
  // Ensure only authorized people can see this
  if (role === 'observer') {
    return (
      <View style={[s.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>You are not authorized to view this chat.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: theme.primary, fontWeight: 'bold' }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // Determine who we are talking to
  const otherName = role === 'requester' ? service.claimer_name : service.author_name;
  const otherAvatar = role === 'requester' ? service.claimer_avatar : service.author_avatar;

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={[s.header, { borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 12) + 4, backgroundColor: theme.background }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ paddingRight: 12 }}>
          <Feather name="chevron-left" size={26} color={theme.text} />
        </Pressable>
        <Avatar name={otherName || 'Unknown'} avatarUrl={otherAvatar || undefined} size={36} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[s.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {otherName || 'User'}
          </Text>
          <Text style={[s.headerSub, { color: theme.textSecondary }]} numberOfLines={1}>
            About: {service.title}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView 
        style={s.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView 
          ref={scrollRef}
          style={[s.messagesList, { backgroundColor: theme.backgroundSecondary }]} 
          contentContainerStyle={s.messagesContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 ? (
            <View style={s.emptyState}>
              <Feather name="message-circle" size={48} color={theme.border} style={{ marginBottom: 16 }} />
              <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
                This is the start of your conversation with {otherName}.
              </Text>
            </View>
          ) : null}

          {messages.map((m) => {
            const isMe = m.sender_id === user?.id;
            return (
              <View key={m.id} style={[s.bubbleWrap, isMe && s.bubbleRight]}>
                <View
                  style={[
                    s.bubble,
                    isMe
                      ? [s.bubbleUser, { backgroundColor: theme.primary, borderBottomRightRadius: 6 }]
                      : [s.bubbleOther, { backgroundColor: theme.card, borderColor: theme.border, borderBottomLeftRadius: 6 }],
                  ]}
                >
                  <Text
                    style={[
                      s.bubbleText,
                      { color: isMe ? theme.textInverse : theme.text },
                    ]}
                  >
                    {m.content}
                  </Text>
                </View>
                <Text style={[s.timeText, { color: theme.textSecondary, alignSelf: isMe ? 'flex-end' : 'flex-start' }]}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <View style={[s.inputRow, { borderTopColor: theme.border, backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TextInput
            style={[s.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
            value={chatInput}
            onChangeText={setChatInput}
            placeholder="Type a message..."
            placeholderTextColor={theme.textSecondary}
            multiline
            textAlignVertical="center"
          />
          <Pressable
            style={[
              s.sendBtn,
              { backgroundColor: theme.primary },
              (!chatInput.trim() || sending) && { opacity: 0.5 },
            ]}
            onPress={handleSend}
            disabled={!chatInput.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={theme.textInverse} />
            ) : (
              <Feather name="send" size={18} color={theme.textInverse} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 2 },
  
  messagesList: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 32, gap: 16 },
  
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 30 },
  
  bubbleWrap: { alignItems: 'flex-start', maxWidth: '85%' },
  bubbleRight: { alignItems: 'flex-end', alignSelf: 'flex-end' },
  bubble: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  bubbleOther: { borderWidth: 1, alignSelf: 'flex-start' },
  bubbleUser: { alignSelf: 'flex-end' },
  bubbleText: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  timeText: { fontSize: 10, marginTop: 4, opacity: 0.7, paddingHorizontal: 4 },
  
  inputRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 16,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
