import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  ActionSheetIOS,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/Avatar';
import * as servicesApi from '@/src/lib/servicesApi';
import { uploadPostImage } from '@/src/lib/eventsApi';
import { supabase } from '@/src/lib/supabase';
import type { ServicePost, OfferDmMessage } from '@/src/lib/servicesApi';

export default function OfferDmScreen() {
  const { offerId } = useLocalSearchParams<{ offerId: string }>();
  const { user } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [service, setService] = useState<ServicePost | null>(null);
  const [offerRow, setOfferRow] = useState<{
    id: string;
    service_id: string;
    offerer_id: string;
    status: string;
    offer_kind: string;
  } | null>(null);
  const [offererName, setOffererName] = useState<string>('Student');
  const [offererAvatar, setOffererAvatar] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<OfferDmMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [feedbackUp, setFeedbackUp] = useState(0);
  const [feedbackDown, setFeedbackDown] = useState(0);
  const [myVote, setMyVote] = useState<'up' | 'down' | null>(null);

  const loadContext = useCallback(async () => {
    if (!offerId) return;
    const tid = await servicesApi.ensureOpenOfferDmThread(offerId);
    const { data: orow, error } = await supabase
      .from('service_offers')
      .select('id, service_id, offerer_id, status, offer_kind')
      .eq('id', offerId)
      .single();
    if (error || !orow) throw new Error('Offer not found');

    const svc = await servicesApi.fetchService(orow.service_id);
    if (!svc) throw new Error('Service not found');

    const { data: offerProf } = await supabase
      .from('profiles')
      .select('name, avatar_url')
      .eq('id', orow.offerer_id)
      .maybeSingle();

    if ((orow as any).offer_kind === 'open_listing') {
      const snap = await servicesApi.fetchOfferFeedbackSnapshot(offerId);
      setFeedbackUp(snap.up);
      setFeedbackDown(snap.down);
      setMyVote(snap.mine);
    } else {
      setFeedbackUp(0);
      setFeedbackDown(0);
      setMyVote(null);
    }

    setThreadId(tid);
    setOfferRow(orow as any);
    setService(svc);
    setOffererName(offerProf?.name || 'Student');
    setOffererAvatar(offerProf?.avatar_url || null);

    const msgs = await servicesApi.fetchOfferDmMessages(tid);
    setMessages(msgs);
  }, [offerId]);

  useEffect(() => {
    if (!offerId) return;
    let cancelled = false;
    (async () => {
      try {
        await loadContext();
      } catch (e: any) {
        Alert.alert('Cannot open chat', e.message || 'Something went wrong', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offerId, loadContext]);

  useEffect(() => {
    if (!threadId) return;
    servicesApi.markOfferDmMessagesRead(threadId);
    const interval = setInterval(() => {
      servicesApi.fetchOfferDmMessages(threadId).then((msgs) => {
        setMessages((prev) => {
          const changed =
            msgs.length !== prev.length ||
            msgs.some((m, i) => prev[i] && m.read_at !== prev[i].read_at);
          if (changed && msgs.length !== prev.length) {
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
          }
          return changed ? msgs : prev;
        });
      });
      servicesApi.markOfferDmMessagesRead(threadId);
    }, 3000);
    return () => clearInterval(interval);
  }, [threadId]);

  const handleSend = async () => {
    if (!chatInput.trim() || sending || !threadId) return;

    const text = chatInput.trim();
    setChatInput('');
    setSending(true);

    try {
      const newMsg = await servicesApi.sendOfferDmMessage(threadId, text);
      if (newMsg) {
        setMessages((prev) => [...prev, newMsg]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (e: any) {
      Alert.alert('Could not send message', e.message || 'Network error');
      setChatInput(text);
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
          try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') return Alert.alert('Permission Denied', 'Camera access is required.');
            const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 });
            if (!result.canceled && result.assets[0]) processImage(result.assets[0].uri);
          } catch {
            Alert.alert('Camera Unavailable', 'The camera is not available on this device or simulator.');
          }
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            allowsEditing: false,
          });
          if (!result.canceled && result.assets[0]) processImage(result.assets[0].uri);
        },
      },
    ]);
  };

  const processImage = async (uri: string) => {
    if (!threadId) return;
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (fileInfo.exists && fileInfo.size && fileInfo.size > 5 * 1024 * 1024) {
        Alert.alert('File too large', 'Image must be under 5MB.');
        return;
      }
    } catch (e) {
      console.error('File size check failed', e);
    }

    setSending(true);
    try {
      const uploadedUrl = await uploadPostImage(uri);
      const newMsg = await servicesApi.sendOfferDmMessage(threadId, `___IMAGE___:${uploadedUrl}`);
      if (newMsg) {
        setMessages((prev) => [...prev, newMsg]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message || 'Could not send image');
    } finally {
      setSending(false);
    }
  };

  const presentOfferDmFeedbackMenu = useCallback(() => {
    if (!offerId) return;
    const submit = async (worked: boolean) => {
      try {
        await servicesApi.recordOfferUse(offerId, worked);
        await loadContext();
      } catch (e: any) {
        Alert.alert('Could not save', e.message || 'Try again');
      }
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Worked for me', "Didn't work for me"],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
          title: 'Feedback',
          message:
            myVote === 'up'
              ? 'You voted thumbs up. You can change your vote.'
              : myVote === 'down'
                ? 'You voted thumbs down. You can change your vote.'
                : 'After using this listing, how did it go?',
        },
        (buttonIndex) => {
          if (buttonIndex === 1) void submit(true);
          if (buttonIndex === 2) void submit(false);
        }
      );
    } else {
      Alert.alert(
        'Feedback',
        myVote ? 'You can change your vote.' : 'After using this listing, how did it go?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Worked for me', onPress: () => void submit(true) },
          {
            text: "Didn't work for me",
            style: 'destructive',
            onPress: () => void submit(false),
          },
        ]
      );
    }
  }, [offerId, loadContext, myVote]);

  if (loading || !service || !offerRow) {
    return (
      <View style={[s.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.textSecondary} />
      </View>
    );
  }

  const imAuthor = user?.id === service.author_id;
  const otherName = imAuthor ? offererName : service.author_name || 'Student';
  const otherAvatar = imAuthor ? offererAvatar : service.author_avatar;

  const canSendMessages =
    offerRow.status === 'pending' &&
    offerRow.offer_kind === 'open_listing' &&
    service.service_status === 'open';

  const uid = user?.id ?? null;
  const canTapItWorked =
    !!uid &&
    offerRow.offer_kind === 'open_listing' &&
    offerRow.status === 'pending' &&
    service.service_status === 'open';

  const showFeedbackMenu =
    !!uid && offerRow.offer_kind === 'open_listing' && canTapItWorked;

  const closedBanner = !canSendMessages ? (
    <View style={[s.inputRow, { borderTopColor: theme.border, backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 16), justifyContent: 'center' }]}>
      <Feather name="lock" size={14} color={theme.textSecondary} />
      <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '500', marginLeft: 6, flex: 1 }}>
        {service.service_status !== 'open'
          ? 'This post is no longer open — messaging is read-only.'
          : 'This listing is no longer active — messaging is read-only.'}
      </Text>
    </View>
  ) : null;

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={[
          s.header,
          { borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 12) + 4, backgroundColor: theme.background },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ paddingRight: 12 }}>
          <Feather name="chevron-left" size={26} color={theme.text} />
        </Pressable>
        <Avatar name={otherName || 'Unknown'} avatarUrl={otherAvatar || undefined} size={36} />
        <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
          <Text style={[s.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {otherName || 'User'}
          </Text>
          <Text style={[s.headerSub, { color: theme.textSecondary }]} numberOfLines={2}>
            Private chat · {service.title}
          </Text>
          {feedbackUp + feedbackDown > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                marginTop: 6,
              }}
            >
              <Feather name="thumbs-up" size={12} color={theme.textSecondary} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary }}>
                {feedbackUp}
              </Text>
              <Feather name="thumbs-down" size={12} color={theme.textSecondary} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary }}>
                {feedbackDown}
              </Text>
            </View>
          ) : null}
        </View>
        {showFeedbackMenu ? (
          <Pressable onPress={presentOfferDmFeedbackMenu} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.65 }]}>
            <Feather name="more-vertical" size={24} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
                Only you and {otherName} can see this chat.
              </Text>
            </View>
          ) : null}

          {messages.map((m) => {
            const content = m.content;
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
                    isImage && { paddingHorizontal: 4, paddingVertical: 4, backgroundColor: 'transparent', borderWidth: 0 },
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
                    <Text style={[s.bubbleText, { color: isMe ? theme.textInverse : theme.text }]}>{content}</Text>
                  )}
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                    gap: 4,
                  }}
                >
                  <Text style={[s.timeText, { color: theme.textSecondary }]}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {isMe && (
                    <Text
                      style={{
                        fontSize: 10,
                        color: m.read_at ? theme.primary : theme.textSecondary,
                        marginTop: 4,
                        fontWeight: m.read_at ? '700' : '500',
                      }}
                    >
                      · {m.read_at ? 'Read' : 'Delivered'}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {closedBanner ||
          (canSendMessages ? (
            <View
              style={[
                s.inputRow,
                { borderTopColor: theme.border, backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 16) },
              ]}
            >
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
                style={[s.sendBtn, { backgroundColor: theme.primary }, (!chatInput.trim() || sending) && { opacity: 0.5 }]}
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
          ) : null)}
      </KeyboardAvoidingView>

      <Modal visible={!!fullscreenImage} transparent animationType="fade" onRequestClose={() => setFullscreenImage(null)}>
        <View style={s.modalOverlay}>
          <Pressable style={s.closeFullscreen} onPress={() => setFullscreenImage(null)}>
            <Feather name="x" size={24} color="#fff" />
          </Pressable>
          {fullscreenImage && (
            <Image source={{ uri: fullscreenImage }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
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
