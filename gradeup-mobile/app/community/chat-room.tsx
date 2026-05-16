import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  Animated as RNAnimated,
  Easing,
  useWindowDimensions,
  PanResponder,
  Keyboard,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';

import { useTheme, useThemePack } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { useQuiz } from '@/src/context/QuizContext';
import { Avatar } from '@/components/Avatar';
import * as dmApi from '@/src/lib/dmApi';
import type { DmMessage } from '@/src/lib/dmApi';
import { getSavedQuizzes, type SavedQuizItem } from '@/src/lib/studyApi';
import { blockUserByUserId, unblockUserByUserId } from '@/src/lib/communityApi';
import { upsertNote, upsertFlashcard } from '@/src/lib/studyDb';
import type { Note, Flashcard } from '@/src/types';
import {
  ACIDLING_SPRITE_URL,
  NOIR_WEBLING_SPRITE_URL,
  DIO_CAT_SPRITE_URL,
  PlaygroundCodexPet,
  type CodexPetAnimationName,
} from '@/components/PlaygroundCodexPet';

/** Generate a unique ID without external deps. */
function generateId(): string {
  // Use crypto.randomUUID if available (iOS 15.4+, Android), else fallback
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m < 10 ? '0' + m : m} ${ampm}`;
}

function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function shouldShowDateSeparator(messages: DmMessage[], index: number): boolean {
  if (index === 0) return true;
  const curr = new Date(messages[index].created_at).toDateString();
  const prev = new Date(messages[index - 1].created_at).toDateString();
  return curr !== prev;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ChatRoomScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, notes, flashcards, setNotes, setFlashcards } = useApp();
  const { userId: communityUserId, refreshFriends, sendReaction, refreshUnreadDmCount } = useCommunity();
  const { createQuiz } = useQuiz();
  const params = useLocalSearchParams<{
    conversationId: string;
    friendId: string;
    friendName: string;
    friendAvatar: string;
  }>();

  const { conversationId, friendId, friendName, friendAvatar } = params;
  const userId = user.id;
  const themePack = useThemePack();
  const { width: winW } = useWindowDimensions();

  const isCatTheme = themePack === 'cat';
  const isMonoTheme = themePack === 'mono';
  const isSpiderTheme = themePack === 'spider';
  const isCodexPet = true; // All premium pets now use the Codex sprite system
  const hasPet = isCatTheme || isMonoTheme || isSpiderTheme;
  const PET_SIZE = 48;

  // Track keyboard height so pet moves with the input bar
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKbHeight(e.endCoordinates.height),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKbHeight(0),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showFlashcardPicker, setShowFlashcardPicker] = useState(false);
  const [showQuizPicker, setShowQuizPicker] = useState(false);
  const [savedQuizzes, setSavedQuizzes] = useState<SavedQuizItem[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Check if friend is blocked on mount
  useEffect(() => {
    if (!communityUserId || !friendId) return;
    (async () => {
      try {
        const { supabase } = require('@/src/lib/supabase');
        const { data } = await supabase
          .from('friendships')
          .select('status')
          .or(
            `and(requester_id.eq.${communityUserId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${communityUserId})`,
          )
          .maybeSingle();
        if (data?.status === 'blocked') setIsBlocked(true);
      } catch {}
    })();
  }, [communityUserId, friendId]);

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const msgs = await dmApi.getMessages(conversationId, 100);
      setMessages(msgs);
      // Mark as read
      if (userId) {
        dmApi.markMessagesRead(conversationId, userId)
          .then(() => refreshUnreadDmCount())
          .catch(() => {});
      }
    } catch (e: any) {
      if (__DEV__) console.warn('[ChatRoom] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [conversationId, userId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;
    const unsub = dmApi.subscribeToMessages(conversationId, (msg) => {
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // Mark as read if from friend
      if (msg.sender_id !== userId && userId) {
        dmApi.markMessagesRead(conversationId, userId)
          .then(() => refreshUnreadDmCount())
          .catch(() => {});
      }
    });
    return unsub;
  }, [conversationId, userId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Send text message
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !conversationId || !userId) return;
    setSending(true);
    setText('');
    try {
      const msg = await dmApi.sendMessage(conversationId, userId, trimmed);
      // Optimistic: add locally (realtime may also deliver it)
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send message');
      setText(trimmed); // Restore text on failure
    } finally {
      setSending(false);
    }
  };

  // Share flashcards
  const handleShareFlashcards = async (noteId: string) => {
    if (!conversationId || !userId) return;
    setShowFlashcardPicker(false);
    setShowAttach(false);

    const note = notes.find((n) => n.id === noteId);
    const cards = flashcards
      .filter((f) => f.noteId === noteId)
      .map((f) => ({ front: f.front, back: f.back }));

    if (cards.length === 0) {
      Alert.alert('No Cards', 'This note has no flashcards to share.');
      return;
    }

    try {
      const msg = await dmApi.shareFlashcardDeck(
        conversationId,
        userId,
        noteId,
        note?.title || 'Flashcards',
        cards,
      );
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to share flashcards');
    }
  };

  // Play quiz together — create multiplayer quiz session and invite friend
  const handlePlayQuizTogether = async (quiz: SavedQuizItem) => {
    if (!conversationId || !userId) return;
    setShowQuizPicker(false);
    setShowAttach(false);

    try {
      // Create a multiplayer quiz session using existing quiz system
      const session = await createQuiz({
        mode: 'multiplayer',
        matchType: 'friend',
        sourceType: 'flashcards',
        sourceId: '_all',
        quizType: quiz.quizType || 'mcq',
        difficulty: quiz.difficulty || 'medium',
        questionCount: quiz.questionCount || quiz.questions?.length || 10,
        questions: quiz.questions,
      });

      // Send invite message in chat with the invite code
      const inviteCode = session.invite_code || '';
      const msg = await dmApi.sendMessage(
        conversationId,
        userId,
        `🎯 Quiz Challenge: ${quiz.title}\n\nJoin with code: ${inviteCode}`,
        'quiz_share',
        { quiz_title: quiz.title, question_count: quiz.questionCount || quiz.questions?.length || 0, invite_code: inviteCode, session_id: session.id },
      );
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      // Also send a notification to the friend
      if (friendId && inviteCode) {
        sendReaction(
          friendId,
          '🎮',
          `Quiz challenge! Join with code: ${inviteCode}`,
        ).catch(() => {});
      }

      // Navigate to match lobby
      router.push({ pathname: '/match-lobby', params: { sessionId: session.id } } as any);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create quiz session');
    }
  };

  // Save shared flashcards to user's account and open normal review
  const handleViewSharedFlashcards = async (messageId: string, title: string) => {
    try {
      const shared = await dmApi.getSharedFlashcards(messageId);
      if (!shared || !shared.cards?.length) {
        Alert.alert('No Cards', 'Could not load the shared flashcards.');
        return;
      }

      // Check if already saved (by looking for a note with same title prefix)
      const existingNote = notes.find((n) => n.title === `📇 ${title}` || n.title === title);
      if (existingNote) {
        // Already saved — go straight to review
        router.push({ pathname: '/flashcard-review', params: { noteId: existingNote.id } } as any);
        return;
      }

      Alert.alert(
        '📇 Shared Flashcards',
        `"${title}" — ${shared.cards.length} cards.\n\nSave to your study library and review?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save & Review',
            onPress: async () => {
              try {
                // Create a new note for this shared deck
                const noteId = generateId();
                const newNote: Note = {
                  id: noteId,
                  subjectId: '_shared',
                  title: `📇 ${title}`,
                  content: `Shared flashcards from ${friendName || 'a friend'} (${shared.cards.length} cards)`,
                  tag: 'Lecture',
                  updatedAt: new Date().toISOString().slice(0, 10),
                };
                await upsertNote(user.id as string, newNote);
                setNotes((prev) => [newNote, ...prev]);

                // Create flashcard records
                const newCards: Flashcard[] = shared.cards.map((c) => ({
                  id: generateId(),
                  noteId,
                  front: c.front,
                  back: c.back,
                }));
                for (const card of newCards) {
                  await upsertFlashcard(user.id as string, card);
                }
                setFlashcards((prev) => [...newCards, ...prev]);

                // Navigate to normal flashcard review
                router.push({ pathname: '/flashcard-review', params: { noteId } } as any);
              } catch (e: any) {
                Alert.alert('Error', e.message || 'Failed to save flashcards.');
              }
            },
          },
        ],
      );
    } catch {
      Alert.alert('Error', 'Failed to load shared flashcards.');
    }
  };

  // Block user
  const handleBlockUser = () => {
    setShowMenu(false);
    Alert.alert(
      'Block User',
      `Are you sure you want to block ${friendName || 'this user'}? You will no longer be able to message each other.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              if (communityUserId && friendId) {
                await blockUserByUserId(communityUserId, friendId);
                setIsBlocked(true);
                refreshFriends();
                Alert.alert('Blocked', `${friendName || 'User'} has been blocked.`);
                router.back();
              }
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not block user');
            }
          },
        },
      ],
    );
  };

  // Unblock user
  const handleUnblockUser = () => {
    setShowMenu(false);
    Alert.alert(
      'Unblock User',
      `Are you sure you want to unblock ${friendName || 'this user'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              if (communityUserId && friendId) {
                await unblockUserByUserId(communityUserId, friendId);
                setIsBlocked(false);
                refreshFriends();
                Alert.alert('Unblocked', `${friendName || 'User'} has been unblocked.`);
              }
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not unblock user');
            }
          },
        },
      ],
    );
  };

  // Report user
  const handleReportChat = () => {
    setShowMenu(false);
    Alert.alert(
      'Report User',
      'Select a reason for reporting this user. Abusing reports may lead to your own account being restricted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Harassment',
          onPress: () => submitReport('Harassment'),
        },
        {
          text: 'Inappropriate Content',
          onPress: () => submitReport('Inappropriate Content'),
        },
        {
          text: 'Spam',
          onPress: () => submitReport('Spam'),
        },
      ]
    );
  };

  const submitReport = async (reason: string) => {
    try {
      if (communityUserId && friendId) {
        await communityApi.reportUser({
          reporterId: communityUserId,
          reportedUserId: friendId,
          reason,
          details: `Reported from chat room. Conversation ID: ${conversationId}`,
          context: 'other',
          contextRef: conversationId,
        });
        Alert.alert('Report Submitted', 'Thank you for helping keep our community safe. Our team will review this report.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not submit report');
    }
  };

  // Load quizzes when picker opens
  useEffect(() => {
    if (showQuizPicker) {
      getSavedQuizzes().then(setSavedQuizzes).catch(() => setSavedQuizzes([]));
    }
  }, [showQuizPicker]);

  // Notes that have flashcards
  const notesWithCards = notes.filter((n) =>
    flashcards.some((f) => f.noteId === n.id),
  );

  // Animated rotation for the + / × attach button
  const attachRotate = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    RNAnimated.timing(attachRotate, {
      toValue: showAttach ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [showAttach, attachRotate]);

  // ─── Chat Pet Animation ───
  const petX = useRef(new RNAnimated.Value(20)).current;
  const petY = useRef(new RNAnimated.Value(0)).current;
  const petHop = useRef(new RNAnimated.Value(0)).current;
  const [codexPetAnim, setCodexPetAnim] = useState<CodexPetAnimationName>('idle');
  const [petDragging, setPetDragging] = useState(false);
  const petXCurrent = useRef(20);
  const petYCurrent = useRef(0);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const petHoldUntilMs = useRef(0);

  // Track current animated values
  useEffect(() => {
    if (!hasPet) return;
    const xId = petX.addListener(({ value }) => { petXCurrent.current = value; });
    const yId = petY.addListener(({ value }) => { petYCurrent.current = value; });
    return () => {
      petX.removeListener(xId);
      petY.removeListener(yId);
    };
  }, [hasPet, petX, petY]);

  const petPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => hasPet,
        onStartShouldSetPanResponderCapture: () => hasPet,
        onMoveShouldSetPanResponder: () => hasPet,
        onMoveShouldSetPanResponderCapture: () => hasPet,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          setPetDragging(true);
          if (isCodexPet) setCodexPetAnim('idle');
          petHop.setValue(0);
          petX.stopAnimation();
          petY.stopAnimation();
          dragStartX.current = petXCurrent.current;
          dragStartY.current = petYCurrent.current;
        },
        onPanResponderMove: (_evt, gestureState) => {
          const maxX = winW - PET_SIZE - 8;
          const newX = Math.max(0, Math.min(maxX, dragStartX.current + gestureState.dx));
          const newY = Math.max(-300, Math.min(100, dragStartY.current + gestureState.dy));
          petX.setValue(newX);
          petY.setValue(newY);
        },
        onPanResponderRelease: () => {
          // Snap back to baseline Y with a spring
          RNAnimated.spring(petY, {
            toValue: 0,
            friction: 6,
            tension: 80,
            useNativeDriver: true,
          }).start();
          petHoldUntilMs.current = Date.now() + 4000;
          setPetDragging(false);
        },
        onPanResponderTerminate: () => {
          RNAnimated.spring(petY, {
            toValue: 0,
            friction: 6,
            tension: 80,
            useNativeDriver: true,
          }).start();
          petHoldUntilMs.current = Date.now() + 4000;
          setPetDragging(false);
        },
      }),
    [hasPet, isCodexPet, winW, PET_SIZE, petX, petY, petHop],
  );

  // Pet walks back and forth above the input bar
  useEffect(() => {
    if (!hasPet || petDragging) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const maxX = winW - PET_SIZE - 24;

    const walk = () => {
      if (cancelled) return;
      const targetX = Math.random() * maxX;
      const currentX = petXCurrent.current;
      const goingRight = targetX > currentX;

      if (isCodexPet) {
        setCodexPetAnim(goingRight ? 'running-right' : 'running-left');
      }

      RNAnimated.timing(petX, {
        toValue: targetX,
        duration: 2000 + Math.random() * 1500,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (cancelled || !finished) return;
        if (isCodexPet) setCodexPetAnim('idle');

        // Occasionally hop
        if (Math.random() > 0.5) {
          if (isCodexPet) setCodexPetAnim('jumping');
          RNAnimated.sequence([
            RNAnimated.timing(petHop, {
              toValue: -14,
              duration: 180,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            RNAnimated.timing(petHop, {
              toValue: 0,
              duration: 220,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]).start(({ finished: f2 }) => {
            if (f2 && isCodexPet) setCodexPetAnim('idle');
          });
        }

        timer = setTimeout(walk, 2500 + Math.random() * 3000);
      });
    };

    const waitMs = Math.max(0, petHoldUntilMs.current - Date.now());
    timer = setTimeout(walk, waitMs + 800);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      petX.stopAnimation();
      petHop.stopAnimation();
    };
  }, [hasPet, petDragging, isCodexPet, winW, PET_SIZE, petX, petHop]);

  // ─── Render message bubble ───
  const renderMessage = ({ item, index }: { item: DmMessage; index: number }) => {
    const isMe = item.sender_id === userId;
    const showDate = shouldShowDateSeparator(messages, index);

    return (
      <View>
        {showDate && (
          <View style={styles.dateSeparator}>
            <Text style={[styles.dateSeparatorText, { color: theme.textSecondary }]}>
              {formatDateSeparator(item.created_at)}
            </Text>
          </View>
        )}
        <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
          {!isMe && (
            <Avatar name={friendName} avatarUrl={friendAvatar} size={28} />
          )}
          <View
            style={[
              styles.bubble,
              isMe
                ? [styles.bubbleMe, { backgroundColor: theme.primary }]
                : [styles.bubbleOther, { backgroundColor: theme.card, borderColor: theme.border }],
            ]}
          >
            {/* Special content cards */}
            {item.message_type === 'flashcard_share' ? (
              <Pressable
                onPress={() => handleViewSharedFlashcards(item.id, (item.metadata as any)?.note_title || 'Flashcards')}
                style={[styles.sharedCard, { backgroundColor: isMe ? (theme.textInverse + '22') : theme.backgroundSecondary }]}
              >
                <View style={styles.sharedCardIcon}>
                  <Feather name="layers" size={18} color={isMe ? theme.textInverse : theme.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.sharedCardTitle, { color: isMe ? theme.textInverse : theme.text }]} numberOfLines={2}>
                    📇 {(item.metadata as any)?.note_title || item.content.replace(/^📇 Shared flashcard deck: /, '') || 'Flashcards'}
                  </Text>
                  <Text style={[styles.sharedCardSub, { color: isMe ? (theme.textInverse + 'b3') : theme.textSecondary }]}>
                    {(item.metadata as any)?.card_count || 0} cards · Tap to review
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={isMe ? (theme.textInverse + '99') : theme.textSecondary} />
              </Pressable>
            ) : item.message_type === 'quiz_share' ? (
              <Pressable
                onPress={() => {
                  const inviteCode = (item.metadata as any)?.invite_code;
                  const sessionId = (item.metadata as any)?.session_id;
                  if (inviteCode || sessionId) {
                    Alert.alert(
                      '🎯 Quiz Challenge',
                      `"${(item.metadata as any)?.quiz_title || 'Quiz'}" — ${(item.metadata as any)?.question_count || 0} questions.\n\nJoin this multiplayer quiz?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Join Quiz',
                          onPress: () => {
                            if (sessionId) {
                              router.push({ pathname: '/match-lobby', params: { sessionId } } as any);
                            }
                          },
                        },
                      ],
                    );
                  }
                }}
                style={[styles.sharedCard, { backgroundColor: isMe ? (theme.textInverse + '22') : theme.backgroundSecondary }]}
              >
                <View style={styles.sharedCardIcon}>
                  <Feather name="target" size={18} color={isMe ? theme.textInverse : '#F59E0B'} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.sharedCardTitle, { color: isMe ? theme.textInverse : theme.text }]} numberOfLines={2}>
                    🎯 {(item.metadata as any)?.quiz_title || 'Quiz'}
                  </Text>
                  <Text style={[styles.sharedCardSub, { color: isMe ? (theme.textInverse + 'b3') : theme.textSecondary }]}>
                    {(item.metadata as any)?.question_count || 0} questions · Tap to join
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={isMe ? (theme.textInverse + '99') : theme.textSecondary} />
              </Pressable>
            ) : (
              <Text style={[styles.bubbleText, { color: isMe ? theme.textInverse : theme.text }]}>
                {item.content}
              </Text>
            )}
            <Text
              style={[
                styles.bubbleTime,
                { color: isMe ? (theme.textInverse + '8c') : theme.textSecondary },
              ]}
            >
              {formatTime(item.created_at)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Feather name="chevron-left" size={28} color={theme.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Avatar name={friendName} avatarUrl={friendAvatar} size={32} />
          <Text style={[styles.headerName, { color: theme.text }]} numberOfLines={1}>
            {friendName || 'Friend'}
          </Text>
        </View>
        <Pressable
          onPress={() => setShowMenu((v) => !v)}
          hitSlop={10}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Feather name="more-vertical" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>

      {/* Dropdown menu */}
      {showMenu && (
        <View style={[styles.dropdownMenu, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {isBlocked ? (
            <Pressable
              style={({ pressed }) => [styles.dropdownItem, pressed && { backgroundColor: theme.backgroundSecondary }]}
              onPress={handleUnblockUser}
            >
              <Feather name="user-check" size={16} color="#22c55e" />
              <Text style={[styles.dropdownItemText, { color: '#22c55e' }]}>Unblock User</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.dropdownItem, pressed && { backgroundColor: theme.backgroundSecondary }]}
              onPress={handleBlockUser}
            >
              <Feather name="slash" size={16} color="#ef4444" />
              <Text style={[styles.dropdownItemText, { color: '#ef4444' }]}>Block User</Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [styles.dropdownItem, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={handleReportChat}
          >
            <Feather name="flag" size={16} color={theme.textSecondary} />
            <Text style={[styles.dropdownItemText, { color: theme.textSecondary }]}>Report Chat</Text>
          </Pressable>
        </View>
      )}

      {/* Messages */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={[styles.messagesList, { paddingBottom: 8 }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          }}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Feather name="message-circle" size={32} color={theme.textSecondary} />
              <Text style={[styles.emptyChatText, { color: theme.textSecondary }]}>
                Say hi to {friendName || 'your friend'}! 👋
              </Text>
            </View>
          }
        />
      )}

      {/* Attachment toolbar */}
      {showAttach && (
        <View style={[styles.attachBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <Pressable
            style={({ pressed }) => [
              styles.attachOption,
              { backgroundColor: theme.primary + '12' },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => {
              setShowFlashcardPicker(true);
              setShowAttach(false);
            }}
          >
            <Feather name="layers" size={22} color={theme.primary} />
            <Text style={[styles.attachOptionText, { color: theme.text }]}>Flashcards</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.attachOption,
              { backgroundColor: '#F59E0B12' },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => {
              setShowQuizPicker(true);
              setShowAttach(false);
            }}
          >
            <Feather name="target" size={22} color="#F59E0B" />
            <Text style={[styles.attachOptionText, { color: theme.text }]}>Play Quiz</Text>
          </Pressable>
        </View>
      )}

      {/* ─── Chat Pet ─── */}
      {hasPet && (
        <RNAnimated.View
          {...petPanResponder.panHandlers}
          style={{
            position: 'absolute',
            bottom: 46 + Math.max(insets.bottom, 12) + (showAttach ? 56 : 0) + (Platform.OS === 'ios' ? kbHeight : 0),
            left: 0,
            width: PET_SIZE,
            height: PET_SIZE,
            zIndex: 50,
            transform: [
              { translateX: petX },
              { translateY: RNAnimated.add(petHop, petY) },
            ],
          }}
          pointerEvents="box-only"
        >
          {isCatTheme ? (
            <PlaygroundCodexPet
              spriteUri={DIO_CAT_SPRITE_URL}
              animation={codexPetAnim}
              size={PET_SIZE}
            />
          ) : (
            <PlaygroundCodexPet
              spriteUri={isSpiderTheme ? NOIR_WEBLING_SPRITE_URL : ACIDLING_SPRITE_URL}
              animation={codexPetAnim}
              size={PET_SIZE}
            />
          )}
        </RNAnimated.View>
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          onPress={() => setShowAttach((v) => !v)}
          style={({ pressed }) => [styles.attachBtn, pressed && { opacity: 0.6 }]}
        >
          <RNAnimated.View
            style={{
              transform: [{
                rotate: attachRotate.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '45deg'],
                }),
              }],
            }}
          >
            <Feather name="plus-circle" size={24} color={showAttach ? theme.primary : theme.textSecondary} />
          </RNAnimated.View>
        </Pressable>
        <TextInput
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSecondary }]}
          placeholder="Type a message…"
          placeholderTextColor={theme.textSecondary}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          onFocus={() => setShowAttach(false)}
        />
        <Pressable
          onPress={handleSend}
          disabled={!text.trim() || sending}
          style={({ pressed }) => [
            styles.sendBtn,
            { backgroundColor: text.trim() ? theme.primary : theme.textSecondary + '30' },
            pressed && { opacity: 0.7 },
          ]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={theme.textInverse} />
          ) : (
            <Feather name="send" size={18} color={text.trim() ? theme.textInverse : theme.textSecondary} />
          )}
        </Pressable>
      </View>

      {/* ─── Flashcard Picker Modal ─── */}
      <Modal
        visible={showFlashcardPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFlashcardPicker(false)}
      >
        <View style={[styles.modalRoot, { backgroundColor: theme.background }]}>
          <View style={[styles.modalNav, { borderBottomColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Share Flashcards</Text>
            <Pressable onPress={() => setShowFlashcardPicker(false)} hitSlop={10}>
              <Feather name="x" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            {notesWithCards.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Feather name="layers" size={32} color={theme.textSecondary} />
                <Text style={[styles.modalEmptyText, { color: theme.textSecondary }]}>
                  No flashcard decks found. Create flashcards from your notes first.
                </Text>
              </View>
            ) : (
              notesWithCards.map((note) => {
                const cardCount = flashcards.filter((f) => f.noteId === note.id).length;
                return (
                  <Pressable
                    key={note.id}
                    style={({ pressed }) => [
                      styles.pickerRow,
                      { backgroundColor: pressed ? theme.backgroundSecondary : 'transparent' },
                    ]}
                    onPress={() => handleShareFlashcards(note.id)}
                  >
                    <View style={[styles.pickerIconWrap, { backgroundColor: theme.primary + '12' }]}>
                      <Feather name="layers" size={20} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerTitle, { color: theme.text }]} numberOfLines={1}>
                        {note.title}
                      </Text>
                      <Text style={[styles.pickerSub, { color: theme.textSecondary }]}>
                        {cardCount} card{cardCount !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <Feather name="send" size={16} color={theme.primary} />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Quiz Picker Modal ─── */}
      <Modal
        visible={showQuizPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowQuizPicker(false)}
      >
        <View style={[styles.modalRoot, { backgroundColor: theme.background }]}>
          <View style={[styles.modalNav, { borderBottomColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Play Quiz Together</Text>
            <Pressable onPress={() => setShowQuizPicker(false)} hitSlop={10}>
              <Feather name="x" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            {savedQuizzes.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Feather name="target" size={32} color={theme.textSecondary} />
                <Text style={[styles.modalEmptyText, { color: theme.textSecondary }]}>
                  No quizzes found. Generate a quiz from your notes first, then come back to play together!
                </Text>
              </View>
            ) : (
              savedQuizzes.map((quiz) => (
                <Pressable
                  key={quiz.id}
                  style={({ pressed }) => [
                    styles.pickerRow,
                    { backgroundColor: pressed ? theme.backgroundSecondary : 'transparent' },
                  ]}
                  onPress={() => handlePlayQuizTogether(quiz)}
                >
                  <View style={[styles.pickerIconWrap, { backgroundColor: '#F59E0B12' }]}>
                    <Feather name="target" size={20} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerTitle, { color: theme.text }]} numberOfLines={1}>
                      {quiz.title}
                    </Text>
                    <Text style={[styles.pickerSub, { color: theme.textSecondary }]}>
                      {quiz.questionCount} question{quiz.questionCount !== 1 ? 's' : ''} · {quiz.quizType || 'mcq'}
                    </Text>
                  </View>
                  <Feather name="send" size={16} color="#F59E0B" />
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 100,
    right: 12,
    zIndex: 100,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 160,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownItemText: { fontSize: 15, fontWeight: '600' },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerName: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Messages
  messagesList: { paddingHorizontal: 12, paddingTop: 12 },
  dateSeparator: { alignItems: 'center', marginVertical: 12 },
  dateSeparatorText: { fontSize: 12, fontWeight: '600' },
  emptyChat: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyChatText: { fontSize: 15, fontWeight: '500' },

  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 6,
    gap: 6,
    maxWidth: '85%',
  },
  bubbleRowMe: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4, borderWidth: StyleSheet.hairlineWidth },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTime: { fontSize: 10, fontWeight: '500', marginTop: 4, alignSelf: 'flex-end' },

  // Shared content cards inside bubbles
  sharedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    marginBottom: 4,
    minWidth: 200,
  },
  sharedCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedCardTitle: { fontSize: 14, fontWeight: '700' },
  sharedCardSub: { fontSize: 11, fontWeight: '500', marginTop: 1 },

  // Attach bar
  attachBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  attachOptionText: { fontSize: 14, fontWeight: '600' },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachBtn: { paddingBottom: 6 },
  input: {
    flex: 1,
    fontSize: 15,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 120,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },

  // Modals
  modalRoot: { flex: 1 },
  modalNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalScroll: { paddingBottom: 40 },
  modalEmpty: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 40 },
  modalEmptyText: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  pickerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerTitle: { fontSize: 15, fontWeight: '600' },
  pickerSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});
