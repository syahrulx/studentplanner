import { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Modal } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/Avatar';
import * as servicesApi from '@/src/lib/servicesApi';
import { uploadPostImage } from '@/src/lib/eventsApi';
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
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

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
    loadData().finally(() => {
      setLoading(false);
      servicesApi.markServiceMessagesRead(id as string);
    });
    
    // Simple polling for new messages every 3 seconds
    const interval = setInterval(() => {
      servicesApi.fetchServiceMessages(id as string).then(msgs => {
        setMessages(prev => {
          // We check length or if read_at status has changed for our messages
          const changed = msgs.length !== prev.length || 
                          msgs.some((m, i) => prev[i] && m.read_at !== prev[i].read_at);
          
          if (changed) {
            // Only scroll to end if length actually changed
            if (msgs.length !== prev.length) {
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
            }
            return msgs;
          }
          return prev;
        });
      });
      servicesApi.markServiceMessagesRead(id as string);
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

  const handlePickImage = async () => {
    Alert.alert('Send Image', 'Choose an image source', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return Alert.alert('Permission Denied', 'Camera access is required.');
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
          if (!result.canceled && result.assets[0]) processImage(result.assets[0].uri);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false });
          if (!result.canceled && result.assets[0]) processImage(result.assets[0].uri);
        },
      },
    ]);
  };

  const processImage = async (uri: string) => {
    setSending(true);
    try {
      const uploadedUrl = await uploadPostImage(uri);
      const newMsg = await servicesApi.sendServiceMessage(id as string, `___IMAGE___:${uploadedUrl}`);
      if (newMsg) {
        setMessages(prev => [...prev, newMsg]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message || 'Could not send image');
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
            const isSystem = m.content.startsWith('___SYSTEM_MSG___:');
            const content = isSystem ? m.content.replace('___SYSTEM_MSG___:', '') : m.content;

            if (isSystem) {
              return (
                <View key={m.id} style={{ alignItems: 'center', marginVertical: 8 }}>
                  <View style={{ backgroundColor: theme.card, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border }}>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '600', textAlign: 'center' }}>
                      {content}
                    </Text>
                  </View>
                </View>
              );
            }

            const isMe = m.sender_id === user?.id;
            const isImage = content.startsWith('___IMAGE___:');
            const imageUrl = isImage ? content.replace('___IMAGE___:', '') : null;

            return (
              <View key={m.id} style={[s.bubbleWrap, isMe && s.bubbleRight]}>
                <View
                  style={[
                    s.bubble,
                    isMe
                      ? [s.bubbleUser, { backgroundColor: theme.primary, borderBottomRightRadius: 6 }]
                      : [s.bubbleOther, { backgroundColor: theme.card, borderColor: theme.border, borderBottomLeftRadius: 6 }],
                    isImage && { paddingHorizontal: 4, paddingVertical: 4, backgroundColor: 'transparent', borderWidth: 0 }
                  ]}
                >
                  {isImage && imageUrl ? (
                    <Pressable onPress={() => setFullscreenImage(imageUrl)}>
                      <Image
                        source={{ uri: imageUrl }}
                        style={{ width: 220, height: 220, borderRadius: 16 }}
                        contentFit="cover"
                        transition={200}
                      />
                    </Pressable>
                  ) : (
                    <Text
                      style={[
                        s.bubbleText,
                        { color: isMe ? theme.textInverse : theme.text },
                      ]}
                    >
                      {content}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: isMe ? 'flex-end' : 'flex-start', gap: 4 }}>
                  <Text style={[s.timeText, { color: theme.textSecondary }]}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {isMe && (
                    <Text style={{ fontSize: 10, color: m.read_at ? theme.primary : theme.textSecondary, marginTop: 4, fontWeight: m.read_at ? '700' : '500' }}>
                      · {m.read_at ? 'Read' : 'Delivered'}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {service && (service.service_status === 'completed' || service.service_status === 'cancelled') ? (
          <View style={[s.inputRow, { borderTopColor: theme.border, backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 16), justifyContent: 'center' }]}>
            <Feather name={service.service_status === 'completed' ? 'check-circle' : 'x-circle'} size={14} color={theme.textSecondary} />
            <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '500', marginLeft: 6 }}>
              {service.service_status === 'completed' ? 'This service has been completed.' : 'This service was cancelled.'}
            </Text>
          </View>
        ) : (
          <View style={[s.inputRow, { borderTopColor: theme.border, backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Pressable
              onPress={handlePickImage}
              disabled={sending}
              style={[s.attachBtn, { backgroundColor: theme.backgroundSecondary }]}
            >
              <Feather name="plus" size={20} color={theme.textSecondary} />
            </Pressable>
            <TextInput
              style={[s.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Message..."
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
        )}
      </KeyboardAvoidingView>

      <Modal visible={!!fullscreenImage} transparent animationType="fade" onRequestClose={() => setFullscreenImage(null)}>
        <View style={s.modalOverlay}>
          <Pressable style={s.closeFullscreen} onPress={() => setFullscreenImage(null)}>
            <Feather name="x" size={24} color="#fff" />
          </Pressable>
          {fullscreenImage && (
            <Image
              source={{ uri: fullscreenImage }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
            />
          )}
        </View>
      </Modal>
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
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    maxHeight: 120,
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeFullscreen: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
});
